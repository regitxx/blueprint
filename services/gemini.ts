import { GoogleGenAI, Type } from '@google/genai';
import { ANALYST_SYSTEM, ARCHITECT_REFINE_SYSTEM, ARCHITECT_SYSTEM, CARTOGRAPHER_SYSTEM, MODEL, READER_SYSTEM, SCOUT_SYSTEM } from '../constants';
import type { ComparisonRow, Insight, Source, Variant } from '../types';
import type { RepoSkeleton } from './repo';

function getApiKey(): string {
  // Vite's define replaces the literal `process.env.API_KEY` at build time; the try/catch
  // guards Node (where process exists) and the browser (where it may not) alike.
  try { if (process.env.API_KEY) return process.env.API_KEY; } catch { /* browser */ }
  return (import.meta as any)?.env?.VITE_GEMINI_API_KEY || '';
}

let client: GoogleGenAI | null = null;
function ai(): GoogleGenAI {
  if (!client) {
    const key = getApiKey();
    // Key present (local dev / AI Studio / Node scripts) → talk to Gemini directly.
    // No key baked into the bundle (production container) → route through our server-side
    // proxy at /api/genai, which injects the real key. 'proxy' is a placeholder, never used.
    client = key
      ? new GoogleGenAI({ apiKey: key })
      : new GoogleGenAI({ apiKey: 'proxy', httpOptions: { baseUrl: '/api/genai' } });
  }
  return client;
}

function parseJson<T>(raw: string | undefined, stage: string): T {
  const text = (raw ?? '').replace(/^```(?:json)?/m, '').replace(/```\s*$/m, '').trim();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${stage}: model returned malformed JSON`);
  }
}

// Retry only transient capacity/availability errors. Backoff: 2s then 5s, each + 0–500ms jitter.
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  const delays = [2000, 5000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const retryable = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/i.test(msg);
      if (!retryable || attempt >= tries - 1) throw err;
      const wait = delays[Math.min(attempt, delays.length - 1)] + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ---------------- 0 · Reader (optional idea-doc → topic + constraints) ----------------

export interface ReaderResult {
  topic: string;
  constraints: string[];
  nonGoals: string[];
}

export async function readDocument(text: string): Promise<ReaderResult> {
  const doc = (text ?? '').slice(0, 50_000); // guard token/cost blowups on large uploads
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `Idea document:\n\n${doc}\n\nDistill it now.`,
    config: {
      systemInstruction: READER_SYSTEM,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'low' } as any, // distillation is grounded in the doc; low reasoning cuts latency
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: 'search-friendly product summary, ≤12 words' },
          constraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: '0-6 short imperatives that must shape the architecture' },
          nonGoals: { type: Type.ARRAY, items: { type: Type.STRING }, description: '0-4 explicit out-of-scope items' },
        },
        required: ['topic', 'constraints', 'nonGoals'],
      },
    },
  }));
  const parsed = parseJson<ReaderResult>(res.text, 'Reader');
  return { topic: parsed.topic, constraints: parsed.constraints ?? [], nonGoals: parsed.nonGoals ?? [] };
}

// ---------------- 1 · Scout ----------------

export async function scoutQueries(topic: string): Promise<{ arxivQueries: string[]; githubQueries: string[] }> {
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `Product idea: "${topic}". Produce search queries.`,
    config: {
      systemInstruction: SCOUT_SYSTEM,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'low' } as any, // low reasoning is enough for query generation; cuts latency
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          arxivQueries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2 arXiv keyword queries' },
          githubQueries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2 GitHub keyword queries' },
        },
        required: ['arxivQueries', 'githubQueries'],
      },
    },
  }));
  return parseJson(res.text, 'Scout');
}

// ---------------- 2 · Analyst (one batched call for all sources) ----------------

const insightSchema = {
  type: Type.OBJECT,
  properties: {
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          sourceId: { type: Type.STRING },
          architecture: { type: Type.STRING },
          algorithmOrMath: { type: Type.STRING },
          limitations: { type: Type.STRING },
          metrics: { type: Type.STRING },
          relevance: { type: Type.STRING },
        },
        required: ['sourceId', 'architecture', 'algorithmOrMath', 'limitations', 'metrics', 'relevance'],
      },
    },
  },
  required: ['insights'],
};

export async function analyzeSources(topic: string, sources: Source[]): Promise<Insight[]> {
  const corpus = sources
    .map((s) => `[${s.id}] (${s.origin}) ${s.title}\n${s.snippet}`)
    .join('\n\n---\n\n');
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `User idea: "${topic}".\n\nExtract insights for EVERY source below (one entry per sourceId).\n\n${corpus}`,
    config: {
      systemInstruction: ANALYST_SYSTEM,
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingLevel: 'low' } as any, // extraction is grounded in the corpus; low reasoning cuts latency
      responseSchema: insightSchema,
    },
  }));
  return parseJson<{ insights: Insight[] }>(res.text, 'Analyst').insights;
}

// ---------------- 3 · Architect ----------------

const architectSchema = {
  type: Type.OBJECT,
  properties: {
    variants: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING },
          profile: { type: Type.STRING, description: 'Fast MVP | Scalable | Research-grade' },
          tagline: { type: Type.STRING },
          summary: { type: Type.STRING },
          mermaid: { type: Type.STRING, description: 'flowchart TD, quoted labels, max 12 nodes' },
          components: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['name', 'role', 'sourceIds'],
            },
          },
          risks: { type: Type.STRING },
          whenToChoose: { type: Type.STRING },
        },
        required: ['id', 'name', 'profile', 'tagline', 'summary', 'mermaid', 'components', 'risks', 'whenToChoose'],
      },
    },
    comparison: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          criterion: { type: Type.STRING },
          values: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'aligned with variants order' },
        },
        required: ['criterion', 'values'],
      },
    },
  },
  required: ['variants', 'comparison'],
};

// Shared source brief for both synthesize and refine — one line block per insight.
function buildBrief(sources: Source[], insights: Insight[]): string {
  return insights
    .map((i) => {
      const s = sources.find((x) => x.id === i.sourceId);
      return `[${i.sourceId}] ${s?.title ?? ''}\narchitecture: ${i.architecture}\nalgorithm: ${i.algorithmOrMath}\nlimitations: ${i.limitations}\nmetrics: ${i.metrics}\nrelevance: ${i.relevance}`;
    })
    .join('\n\n');
}

// A hard-constraints block appended to the architect prompt when the idea came from a doc.
function constraintsBlock(constraints?: string[]): string {
  if (!constraints?.length) return '';
  return `\n\nHard constraints from the user's document — respect in every variant, flag in risks if impossible:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
}

export async function synthesizeArchitectures(
  topic: string,
  sources: Source[],
  insights: Insight[],
  constraints?: string[],
  asBuilt?: unknown,
): Promise<{ variants: Variant[]; comparison: ComparisonRow[] }> {
  const brief = buildBrief(sources, insights);
  const asBuiltBlock = asBuilt
    ? `\n\nAs-built architecture (JSON):\n${JSON.stringify(asBuilt)}\n\nPropose evolution variants RELATIVE to this as-built architecture; comparison MUST include 'As-built (today)' as the FIRST column. Every evolution component must cite sourceIds drawn ONLY from the Source insights above — never cite the as-built architecture itself as a source.`
    : '';
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `User idea: "${topic}".\n\nSource insights:\n\n${brief}${constraintsBlock(constraints)}${asBuiltBlock}\n\nDesign the architecture variants now.`,
    config: {
      systemInstruction: ARCHITECT_SYSTEM, // architect keeps default thinking — it does the hard synthesis
      responseMimeType: 'application/json',
      responseSchema: architectSchema,
    },
  }));
  return parseJson(res.text, 'Architect');
}

// Conversational refine — revise the previous variants per the user's instruction, grounded in
// the SAME source insights. Reuses architectSchema so the cost row + citations stay enforced.
export async function refineArchitectures(
  topic: string,
  sources: Source[],
  insights: Insight[],
  previousVariants: Variant[],
  instruction: string,
  constraints?: string[],
): Promise<{ variants: Variant[]; comparison: ComparisonRow[] }> {
  const brief = buildBrief(sources, insights);
  const previous = JSON.stringify(previousVariants, null, 2);
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `User idea: "${topic}".\n\nSource insights:\n\n${brief}${constraintsBlock(constraints)}\n\nPrevious variants (JSON):\n${previous}\n\nUser refine instruction: "${instruction}"\n\nRevise the variants now, grounded only in the insights above.`,
    config: {
      systemInstruction: ARCHITECT_REFINE_SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: architectSchema,
    },
  }));
  return parseJson(res.text, 'Refine');
}

// ---------------- 4 · Cartographer (repo → as-built sheet + seed queries) ----------------

// Raw Cartographer output: as-built components cite real tree PATHS (not sourceIds yet).
export interface RepoMap {
  summary: string;
  detectedStack: string[];
  asBuilt: {
    name: string;
    profile: string;
    tagline: string;
    summary: string;
    mermaid: string;
    components: { name: string; role: string; paths: string[] }[];
    risks: string;
    whenToChoose: string;
  };
  arxivQueries: string[];
  githubQueries: string[];
}

const repoMapSchema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING, description: '≤2 sentences' },
    detectedStack: { type: Type.ARRAY, items: { type: Type.STRING }, description: '≤6 concrete technologies' },
    asBuilt: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'As-built — <repo>' },
        profile: { type: Type.STRING, description: 'As-built' },
        tagline: { type: Type.STRING },
        summary: { type: Type.STRING },
        mermaid: { type: Type.STRING, description: 'flowchart TD, quoted labels, max 12 nodes' },
        components: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              role: { type: Type.STRING },
              paths: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'real paths copied from the tree' },
            },
            required: ['name', 'role', 'paths'],
          },
        },
        risks: { type: Type.STRING },
        whenToChoose: { type: Type.STRING, description: 'This is the current system.' },
      },
      required: ['name', 'profile', 'tagline', 'summary', 'mermaid', 'components', 'risks', 'whenToChoose'],
    },
    arxivQueries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2 queries on the stack\'s evolution' },
    githubQueries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2 queries on the stack\'s evolution' },
  },
  required: ['summary', 'detectedStack', 'asBuilt', 'arxivQueries', 'githubQueries'],
};

export async function mapRepoArchitecture(repoName: string, skeleton: RepoSkeleton): Promise<RepoMap> {
  const { meta, paths, truncated, files } = skeleton;
  const tree = paths.join('\n') + (truncated ? '\n…(tree truncated)' : '');
  const fileBlocks = files.map((f) => `--- ${f.path} ---\n${f.content}`).join('\n\n');
  const contents =
    `Repository: ${repoName}\n` +
    `Description: ${meta.description || '(none)'}\n` +
    `Primary language: ${meta.language || '(unknown)'} · Stars: ${meta.stars} · Default branch: ${meta.defaultBranch}\n\n` +
    `FILE TREE (${paths.length} paths):\n${tree}\n\n` +
    `FILE CONTENTS:\n${fileBlocks}\n\n` +
    `Map the as-built architecture now, citing only real paths from the tree.`;
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents,
    config: {
      systemInstruction: CARTOGRAPHER_SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: repoMapSchema,
    },
  }));
  return parseJson<RepoMap>(res.text, 'Cartographer');
}
