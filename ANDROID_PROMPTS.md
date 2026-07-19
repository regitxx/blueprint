# Android Prompt Pack

> Rebuild Blueprint as a **native Android app** by pasting each numbered prompt below, in
> order, into Google AI Studio's **Android** Build agent. The Android agent writes its own
> Kotlin — each prompt is a precise specification, with our exact assets embedded where
> fidelity matters (data contracts, system prompts, algorithms, example data). Run the
> checklist at the bottom after the last prompt.

## Prompt 1 — Bootstrap

Build a native Android app called **Blueprint — idea → cited architecture in ~30 seconds**. It takes a product idea (or a GitHub repo URL, or an uploaded idea doc) and returns 2–3 cited architecture options, each with a diagram, components that link to real sources, risks, and a trade-off table.

**Design system (dark "blueprint"):** background #0E1D33, panels/surfaces #12253F, primary ink #DCE9F7, dim text #8FA9C9, hairlines/borders #2B4A73, cyan accent #5FD4F5, amber highlight #F5B95F. Use a monospace typeface for labels and log lines; section headers are UPPERCASE with wide letter-spacing. Everything reads like engineering drafting paper.

**Screens:**
- **Home** — a large input field with placeholder "Describe the product you want to build", a primary **Draft It** button, a row of example-blueprint chips, and a row of recent-runs chips.
- **Run** — a live agent console: each line has a colored tag badge (INT, RDR, SCT, ANL, ARC, MAP, SYS) + the log text + a status indicator that animates from a spinner to a ✓ (or ✕ on error).
- **Results** — horizontally swipeable variant sheets. Each sheet has an engineering title block (variant name / profile badge / "sheet i of N" / "drawn by Scout · Analyst · Architect"), then tagline, summary, a diagram area, a components list where each component shows tappable source chips that open the source URL, and a risks + "choose this when" pair. Two extra pages after the variant sheets: a **Compare** table page and a **Sources** page.
- A **refine input bar** sits under the results so the user can request changes.

## Prompt 2 — Data contracts

Create Kotlin data classes that mirror these TypeScript interfaces EXACTLY — identical field names and optionality — so JSON from the backend deserializes directly. These are the shared contracts every screen and agent call uses.

Reference — `types.ts` (mirror these exactly):

```ts
export type AgentName = 'scout' | 'analyst' | 'architect' | 'reader' | 'cartographer' | 'interpreter' | 'system';

export interface Interpretation {
  id: string;
  name: string;
  oneLiner: string;
  keyDifference: string; // what this reading INCLUDES that the others EXCLUDE
  exampleUser: string;
  impliedConstraints: string[]; // ≤3 imperatives
}

export interface LogEntry {
  id: number;
  agent: AgentName;
  text: string;
  status: 'run' | 'ok' | 'err';
}

export interface Source {
  id: string; // s1, s2, ...
  kind: 'paper' | 'repo';
  title: string;
  url: string;
  origin: string; // 'arXiv' | 'GitHub' | 'Paper' | … (widened for the papers fallback ladder)
  snippet: string; // abstract or README excerpt (truncated)
  meta?: string; // authors/year or stars/language
}

export interface Insight {
  sourceId: string;
  architecture: string;
  algorithmOrMath: string;
  limitations: string;
  metrics: string;
  relevance: string;
}

export interface VariantComponent {
  name: string;
  role: string;
  sourceIds: string[];
}

export interface Variant {
  id: string;
  name: string;
  profile: string; // "Fast MVP" | "Scalable" | "Research-grade"
  tagline: string;
  summary: string;
  mermaid: string;
  components: VariantComponent[];
  risks: string;
  whenToChoose: string;
}

export interface ComparisonRow {
  criterion: string;
  values: string[]; // aligned with variants order
}

export interface RunResult {
  topic: string;
  sources: Source[];
  insights: Insight[];
  variants: Variant[];
  comparison: ComparisonRow[];
  constraints?: string[]; // hard constraints distilled from an uploaded idea doc
  docName?: string; // filename of the uploaded idea doc, if any
  repoUrl?: string; // github.com/owner/repo, when the run started from a repo URL
  chosenInterpretation?: string; // interpretation name, when a vague idea was disambiguated
}
```

## Prompt 3 — Agent brains

Implement the pipeline's Gemini calls. Use THESE system prompts verbatim as string constants (do not paraphrase — the wording is load-bearing), and THESE JSON output shapes.

All Gemini calls go through our existing backend proxy (the key lives server-side, never in the app):

`POST {BASE_URL}/api/genai/v1beta/models/gemini-3.5-flash:generateContent`

with a JSON body `{ contents, systemInstruction, generationConfig: { responseMimeType: "application/json", responseSchema: ... } }`. `BASE_URL` is a single constant with placeholder `https://REPLACE-WITH-DEPLOYED-URL`. Parse responses defensively: strip any Markdown code fences (triple-backtick, optionally `json`) before JSON-parsing. Retry once on HTTP 429 or 503 after a 2-second backoff.

Each agent's `responseSchema` is defined in the reference service below — mirror those schemas (interpreter, reader, cartographer, scout, analyst, architect, refine). The `MODEL` constant is included for reference; the Android app should call the fixed `gemini-3.5-flash` endpoint above.

System prompts + model (use verbatim):

```ts
export const INTERPRETER_SYSTEM = `You are Interpreter, a disambiguation gate. Given a product idea, decide whether it is specific enough to research unambiguously. If it is clear and points at ONE product, return {"ambiguous": false, "interpretations": []}. If it plausibly forks into materially different products, return {"ambiguous": true, "interpretations": [2-3 items]}. Each interpretation has: "name" (≤6 words), "oneLiner" (one sentence describing the product), "keyDifference" (state exactly what THIS reading INCLUDES that the others EXCLUDE), "exampleUser" (a concrete user and what they'd do with it), and "impliedConstraints" (≤3 imperatives capturing this reading's assumptions, e.g. "Must support real-time collaboration"). Mark ambiguous ONLY when the readings are materially different PRODUCTS — different users, domains, or core purpose. Do NOT fork on implementation choices (algorithm, programming language, framework, or deployment model) within the same product. If the idea already names a concrete artifact or form factor together with its function (e.g. "a Go middleware library that rate-limits REST APIs"), it is specific — return ambiguous:false. Never invent domains the idea does not support; the interpretations must be genuine, distinct readings of the SAME words. Output JSON only.`;

export const READER_SYSTEM = `You are Reader, a requirements distiller. You are given an idea document (notes, a spec, a brief). Distill it into: "topic" — a search-friendly product summary of at most 12 words; "constraints" — 0 to 6 short imperatives that MUST shape the architecture (e.g. "Must work fully offline", "No vector database", "Sub-100ms p95 latency"); "nonGoals" — 0 to 4 things explicitly out of scope. Keep every item terse and concrete; do not invent constraints the document does not support. Output JSON only.`;

export const SCOUT_SYSTEM = `You are Scout, a research-search strategist. Given a product idea, produce short, high-recall search queries. arXiv queries: 2-4 technical keywords each, no quotes, no boolean operators. GitHub queries: 2-3 keywords matching how real repos are named/described. Output JSON only.`;

export const ANALYST_SYSTEM = `You are Analyst, a technical reader. For each source you receive (paper abstract or repo README excerpt), extract only what is stated or strongly implied. Be concrete and terse (1-2 sentences per field). If a field is not covered by the text, write "not stated". Never invent numbers. Output JSON only.`;

export const ARCHITECT_SYSTEM = `You are Architect, a pragmatic systems designer. Using ONLY the provided source insights, design 2-3 architecture variants for the user's idea: one "Fast MVP", one "Scalable", and optionally one "Research-grade". Every component must cite at least one sourceId that justifies it. Where sources conflict or are silent, say so in risks.

Mermaid rules (strict): output "flowchart TD" only; node ids A, B, C...; every label in double quotes; no parentheses, brackets, semicolons or the word "end" inside labels; max 12 nodes; edges may have short labels. Example: A["User"] -->|"idea"| B["Scout agent"].

Also produce a comparison table: 5-6 criteria rows (e.g. time to MVP, scaling ceiling, consistency/quality, cost per query, ops complexity, defensibility), values aligned to the variants order, each value under 8 words. The table MUST include a row with criterion exactly "Rough monthly cost (cloud + LLM)" whose values are order-of-magnitude estimates like "~$20/mo", "~$200/mo", "~$2k/mo" — clearly rough, derived from that variant's architecture (compute + storage + LLM/API calls). Output JSON only. When a component is an LLM, VLM, or embedding service, name it generically (e.g. "vision-language model API") or as Gemini; name a specific third-party model only if a cited source is specifically about that model. Prefer 3 variants when the sources support three distinct profiles. If the sources reveal a materially better product or architecture direction than the user's framing, you may make ONE variant a challenger: prefix its tagline with "Challenger take — " and state in whenToChoose which assumption it questions. Never more than one; citations, cost row, mermaid rules unchanged.`;

export const ARCHITECT_REFINE_SYSTEM = `${ARCHITECT_SYSTEM}

REFINE MODE: You are given the previous variants and a user instruction. Revise those variants to satisfy the instruction, grounded ONLY in the same source insights provided — do not invent new sources, capabilities, or citations. The citation rule is unchanged: every component must cite at least one sourceId. Keep each variant's id and profile stable where sensible so the result can be diffed against the previous version. If the instruction cannot be satisfied by these sources, keep the closest compliant design and explain in that variant's risks exactly why the sources can't support it.`;

export const CARTOGRAPHER_SYSTEM = `You are Cartographer, a reverse-engineer. You are given a repository's metadata, file tree, README, a manifest, and a few entry files. Produce ONLY what these files actually support — never invent components, files, or capabilities not evidenced by the inputs. Output JSON with: "summary" (≤2 sentences describing what the repo is and does); "detectedStack" (≤6 short strings, concrete technologies you can see, e.g. "Express", "TypeScript", "PostgreSQL"); "asBuilt" — one variant object describing the CURRENT system: { "name": "As-built — <repo>", "profile": "As-built", "tagline", "summary", "mermaid", "components": [{ "name", "role", "paths": [real file/dir paths copied verbatim from the provided tree] }], "risks" (observed weaknesses or gaps in the actual code), "whenToChoose": "This is the current system." }; and seed queries { "arxivQueries": [2 queries], "githubQueries": [2 queries] } targeting how the detected stack could evolve (scaling, robustness, next-gen techniques).

Mermaid rules (strict): output "flowchart TD" only; node ids A, B, C...; every label in double quotes; no parentheses, brackets, semicolons or the word "end" inside labels; max 12 nodes; edges may have short labels.

Every path in components MUST be a real path present in the provided file tree — do not guess paths. Output JSON only.`;

export const MODEL = (typeof process !== 'undefined' && process.env?.GEMINI_MODEL) || 'gemini-3.5-flash';
```

Reference — `services/gemini.ts` (agent calls + responseSchema shapes to mirror):

````ts
import { GoogleGenAI, Type } from '@google/genai';
import { ANALYST_SYSTEM, ARCHITECT_REFINE_SYSTEM, ARCHITECT_SYSTEM, CARTOGRAPHER_SYSTEM, INTERPRETER_SYSTEM, MODEL, READER_SYSTEM, SCOUT_SYSTEM } from '../constants';
import type { ComparisonRow, Insight, Interpretation, Source, Variant } from '../types';
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

// Some deploy envs (AI Studio preview/published) reject thinkingConfig with 400 INVALID_ARGUMENT,
// while local/Mac envs accept it. Start optimistic; flip off permanently the first time an env
// rejects it, and re-issue the offending call without it.
let thinkingOk = true;
const LOW_THINKING = { thinkingLevel: 'low' };
function withThinking<T extends object>(config: T): T {
  return thinkingOk ? ({ ...config, thinkingConfig: LOW_THINKING } as unknown as T) : config;
}

// Retry only transient capacity/availability errors. Backoff: 2s then 5s, each + 0–500ms jitter.
// When canDegradeThinking is set, a 400 INVALID_ARGUMENT (while thinkingConfig was in play) flips
// thinkingOk off and retries once immediately — NOT counted against the transient-retry budget.
async function withRetry<T>(fn: () => Promise<T>, tries = 3, canDegradeThinking = false): Promise<T> {
  const delays = [2000, 5000];
  let attempt = 0;
  for (;;) {
    const usedThinking = thinkingOk;
    try {
      return await fn();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (canDegradeThinking && usedThinking && thinkingOk && /INVALID_ARGUMENT|invalid argument/i.test(msg)) {
        thinkingOk = false; // this env rejects thinkingConfig — retry immediately without it
        continue; // not counted against `tries`
      }
      const retryable = /429|RESOURCE_EXHAUSTED|503|UNAVAILABLE/i.test(msg);
      if (!retryable || attempt >= tries - 1) throw err;
      const wait = delays[Math.min(attempt, delays.length - 1)] + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, wait));
      attempt++;
    }
  }
}

// ---------------- 0a · Interpreter (ambiguity gate) ----------------

export interface Interpretations {
  ambiguous: boolean;
  interpretations: Interpretation[];
}

export async function interpretIdea(topic: string): Promise<Interpretations> {
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `Product idea: "${topic}". Decide whether it is ambiguous and, if so, enumerate the distinct readings.`,
    config: withThinking({
      systemInstruction: INTERPRETER_SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          ambiguous: { type: Type.BOOLEAN },
          interpretations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING, description: '≤6 words' },
                oneLiner: { type: Type.STRING },
                keyDifference: { type: Type.STRING, description: 'what this reading INCLUDES that others EXCLUDE' },
                exampleUser: { type: Type.STRING },
                impliedConstraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: '≤3 imperatives' },
              },
              required: ['name', 'oneLiner', 'keyDifference', 'exampleUser', 'impliedConstraints'],
            },
          },
        },
        required: ['ambiguous', 'interpretations'],
      },
    }),
  }), 3, true);
  const parsed = parseJson<{ ambiguous: boolean; interpretations: Omit<Interpretation, 'id'>[] }>(res.text, 'Interpreter');
  return {
    ambiguous: parsed.ambiguous,
    interpretations: (parsed.interpretations ?? []).map((it, i) => ({ ...it, id: `i${i + 1}` })),
  };
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
    config: withThinking({
      systemInstruction: READER_SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          topic: { type: Type.STRING, description: 'search-friendly product summary, ≤12 words' },
          constraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: '0-6 short imperatives that must shape the architecture' },
          nonGoals: { type: Type.ARRAY, items: { type: Type.STRING }, description: '0-4 explicit out-of-scope items' },
        },
        required: ['topic', 'constraints', 'nonGoals'],
      },
    }),
  }), 3, true);
  const parsed = parseJson<ReaderResult>(res.text, 'Reader');
  return { topic: parsed.topic, constraints: parsed.constraints ?? [], nonGoals: parsed.nonGoals ?? [] };
}

// ---------------- 1 · Scout ----------------

export async function scoutQueries(topic: string): Promise<{ arxivQueries: string[]; githubQueries: string[] }> {
  const res = await withRetry(() => ai().models.generateContent({
    model: MODEL,
    contents: `Product idea: "${topic}". Produce search queries.`,
    config: withThinking({
      systemInstruction: SCOUT_SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          arxivQueries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2 arXiv keyword queries' },
          githubQueries: { type: Type.ARRAY, items: { type: Type.STRING }, description: '2 GitHub keyword queries' },
        },
        required: ['arxivQueries', 'githubQueries'],
      },
    }),
  }), 3, true);
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
    config: withThinking({
      systemInstruction: ANALYST_SYSTEM,
      responseMimeType: 'application/json',
      responseSchema: insightSchema,
    }),
  }), 3, true);
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
````

## Prompt 4 — Live sources

Implement source gathering natively, following the reference algorithm below (fallback-ladder order, dedupe, and GitHub-widening when zero papers are found). Cap the result at 7 sources with ids `s1`..`s7`.

- **arXiv (via our proxy):** `GET {BASE_URL}/api/arxiv?q=<query>&max=<n>` → parse the Atom XML entries (title, summary, id, authors, published).
- **GitHub:** `https://api.github.com/search/repositories?q=<query>&per_page=<n>&sort=stars`, then fetch each repo README from `raw.githubusercontent.com` trying refs in order HEAD → main → master.
- **Semantic Scholar fallback:** `https://api.semanticscholar.org/graph/v1/paper/search?query=<query>&limit=<n>&fields=title,abstract,year,authors,externalIds,url`.

The papers rail is a ladder: same-origin app proxy → direct arXiv → public CORS proxy → Semantic Scholar; first non-empty wins. If no papers are found, widen the GitHub target to 5 repos.

Reference — `services/sources.ts` (fallback ladder, dedupe, GitHub-widening):

````ts
import { SOURCE_LIMITS } from '../constants';
import type { Source } from '../types';

const clean = (s: string) => s.replace(/\s+/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '…' : s);

// ---------------- arXiv ----------------

export function parseArxivAtom(xml: string): Omit<Source, 'id'>[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.map((e) => {
    const pick = (tag: string) => {
      const m = e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? clean(m[1]) : '';
    };
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => clean(m[1]));
    const year = (pick('published').match(/^(\d{4})/) ?? [])[1] ?? '';
    const absUrl = pick('id').replace('http://', 'https://');
    return {
      kind: 'paper' as const,
      origin: 'arXiv' as const,
      title: pick('title'),
      url: absUrl,
      snippet: cut(pick('summary'), 900),
      meta: [authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''), year].filter(Boolean).join(' · '),
    };
  }).filter((s) => s.title && s.url);
}

async function fetchText(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.text();
}

// ---------------- Semantic Scholar (last-resort rail) ----------------

interface S2Paper {
  title?: string;
  abstract?: string | null;
  year?: number | null;
  authors?: { name: string }[];
  externalIds?: { ArXiv?: string } | null;
  url?: string;
}

// Map a Semantic Scholar search response to Sources. Items without an abstract are skipped
// (nothing for the Analyst to read). arXiv-backed papers are normalized to an arxiv.org URL.
export function mapSemanticScholar(data: { data?: S2Paper[] }): Omit<Source, 'id'>[] {
  return (data.data ?? []).flatMap((p) => {
    if (!p.title || !p.abstract) return [];
    const arxivId = p.externalIds?.ArXiv;
    const url = arxivId ? `https://arxiv.org/abs/${arxivId}` : (p.url ?? '');
    if (!url) return [];
    const authors = (p.authors ?? []).map((a) => a.name).filter(Boolean);
    return [{
      kind: 'paper' as const,
      origin: arxivId ? 'arXiv' : 'Paper',
      title: clean(p.title),
      url,
      snippet: cut(clean(p.abstract), 900),
      meta: [authors.slice(0, 3).join(', ') + (authors.length > 3 ? ' et al.' : ''), p.year ? String(p.year) : '']
        .filter(Boolean).join(' · '),
    }];
  });
}

async function searchSemanticScholar(query: string, max: number): Promise<Omit<Source, 'id'>[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${max}&fields=title,abstract,year,authors,externalIds,url`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Semantic Scholar HTTP ${r.status}`);
  return mapSemanticScholar((await r.json()) as { data?: S2Paper[] });
}

// Papers fallback ladder — try each rail in order, first NON-EMPTY result wins, so browser
// CORS or a flaky arXiv can't leave a run without papers. Logs which rail served.
export async function fetchPapers(query: string, max: number, log: (t: string) => void): Promise<Omit<Source, 'id'>[]> {
  const direct = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${max}&sortBy=relevance`;
  const rails: { label: string; run: () => Promise<Omit<Source, 'id'>[]> }[] = [
    // a. same-origin app proxy (works when served by our server.mjs; throws on relative URL in Node)
    { label: 'arXiv via app proxy', run: async () => parseArxivAtom(await fetchText(`/api/arxiv?q=${encodeURIComponent(query)}&max=${max}`)) },
    // b. direct to arXiv
    { label: 'arXiv direct', run: async () => parseArxivAtom(await fetchText(direct)) },
    // c. arXiv through a public CORS proxy
    { label: 'arXiv via public proxy', run: async () => parseArxivAtom(await fetchText(`https://api.allorigins.win/raw?url=${encodeURIComponent(direct)}`)) },
    // d. Semantic Scholar
    { label: 'papers via Semantic Scholar', run: () => searchSemanticScholar(query, max) },
  ];
  for (const rail of rails) {
    try {
      const items = await rail.run();
      if (items.length) {
        log(`${rail.label}: ${items.length} papers found`);
        return items;
      }
    } catch { /* try the next rail */ }
  }
  return [];
}

// ---------------- GitHub ----------------

interface GhRepo { full_name: string; html_url: string; description: string | null; stargazers_count: number; language: string | null; }

export async function searchGithub(query: string, max: number): Promise<Omit<Source, 'id'>[]> {
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${max}&sort=stars`;
  const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error(`GitHub search HTTP ${r.status}`);
  const data = (await r.json()) as { items?: GhRepo[] };
  const repos = data.items ?? [];
  return Promise.all(
    repos.map(async (repo) => {
      let snippet = repo.description ?? '';
      try {
        snippet = cut(stripMarkdown(await fetchReadme(repo.full_name)), 1200) || snippet;
      } catch { /* description is enough */ }
      return {
        kind: 'repo' as const,
        origin: 'GitHub' as const,
        title: repo.full_name,
        url: repo.html_url,
        snippet: snippet || 'No description available.',
        meta: [repo.language ?? undefined, `★ ${repo.stargazers_count.toLocaleString()}`].filter(Boolean).join(' · '),
      };
    }),
  );
}

async function fetchReadme(fullName: string): Promise<string> {
  for (const ref of ['HEAD', 'main', 'master']) {
    try {
      return await fetchText(`https://raw.githubusercontent.com/${fullName}/${ref}/README.md`);
    } catch { /* try next ref */ }
  }
  throw new Error('README not found');
}

function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`~|-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------- Combined ----------------

export async function gatherSources(arxivQueries: string[], githubQueries: string[], log: (t: string) => void): Promise<Source[]> {
  const perQueryMax = Math.ceil(SOURCE_LIMITS.arxiv / Math.min(Math.max(arxivQueries.length, 1), 2));
  const paperBatches = await Promise.allSettled(
    arxivQueries.slice(0, 2).map((q) => fetchPapers(q, perQueryMax, log)),
  );
  const papers = paperBatches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []));

  // If every papers rail came up empty, widen the GitHub target so runs never feel thin.
  const githubTarget = papers.length ? SOURCE_LIMITS.github : 5;
  if (!papers.length) log(`No papers found — widening GitHub search to ${githubTarget} repos.`);

  const repoBatches = await Promise.allSettled(
    githubQueries.slice(0, 2).map((q) => searchGithub(q, githubTarget)),
  );
  const repos = repoBatches.flatMap((b) => (b.status === 'fulfilled' ? b.value : []));
  log(`GitHub: ${repos.length} repositories found`);

  const seenRepo = new Set<string>();
  const uniqueRepos = repos.filter((r) => (seenRepo.has(r.url) ? false : (seenRepo.add(r.url), true)));

  const seen = new Set<string>();
  const merged = [...papers.slice(0, SOURCE_LIMITS.arxiv), ...uniqueRepos.slice(0, githubTarget)]
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
    .slice(0, SOURCE_LIMITS.total);

  if (merged.length === 0) throw new Error('No sources found — try a broader topic.');
  return merged.map((s, i) => ({ ...s, id: `s${i + 1}` }));
}
````

## Prompt 5 — Pipeline orchestration

Wire the full flow exactly as the reference web orchestration below does:

- **Interpreter gate** on typed ideas only: if ambiguous, show interpretation cards (emphasize each card's `keyDifference`) plus a "Research my exact wording" card; the chosen card's `impliedConstraints` flow into the architect as hard constraints.
- **Doc upload** via the Android file picker (.txt/.md → read text): feed the text through the reader agent → distilled topic + ⚑ constraint chips.
- **Repo detection:** if the input matches `github.com/owner/repo`, take the cartographer path — build a repo skeleton from 2 GitHub API calls (repo meta + recursive tree) plus raw file fetches → an as-built "Sheet 0" + seeded evolution variants.
- **Console logging** for every stage (the tag badges from Prompt 1).
- **Run history:** persist the last 5 runs in SharedPreferences; show them as recent-runs chips that replay instantly.
- **Refine:** re-synthesize the variants in place from a refine instruction.
- **Error fallback:** on failure, fall back to the one bundled example run (Prompt 6).

Reference — `App.tsx` orchestration (`runLive`, `runRepoAnalysis`, `runRefine`):

```tsx
async function runLive(rawIdea: string) {
    const t = rawIdea.trim();
    if (!t || busy) return;
    const repoMatch = t.match(REPO_RE);
    const token = begin(t);
    if (repoMatch) {
      const owner = repoMatch[1];
      const repo = repoMatch[2].replace(/\.git$/, '');
      await runRepoAnalysis(token, owner, repo, t);
      return;
    }
    // Plain-idea path: ambiguity gate before committing to research.
    const gateId = log('interpreter', 'Checking for ambiguity…');
    try {
      const { ambiguous, interpretations } = await interpretIdea(t);
      if (runToken.current !== token) return;
      settle(gateId, 'ok');
      if (!ambiguous || interpretations.length === 0) {
        log('interpreter', 'Idea is specific — proceeding ✓', 'ok');
        await executePipeline(token, t);
      } else {
        log('interpreter', `This idea forks ${interpretations.length} ways — pick one below`, 'ok');
        setRawTopic(t);
        setInterps(interpretations);
        setPhase('idle'); // pause for the user to choose an interpretation
      }
    } catch {
      // Gate is non-critical — if it fails, don't block; research the idea as written.
      if (runToken.current !== token) return;
      settle(gateId, 'err');
      await executePipeline(token, t);
    }
  }

async function runRepoAnalysis(token: number, owner: string, repo: string, repoUrl: string) {
    const label = `${owner}/${repo}`;
    try {
      const skeleton = await fetchRepoSkeleton(owner, repo, (m) => log('cartographer', m, 'ok'));

      // Draw the as-built sheet (sheet 0).
      const drawId = log('cartographer', 'Drawing as-built sheet 0…');
      const repoMap = await mapRepoArchitecture(label, skeleton);
      if (runToken.current !== token) return;

      // Repo-file Sources so as-built citations resolve. One Source per cited path;
      // snippet is the file's first 200 chars when fetched, else the component's role.
      const fetched = new Map(skeleton.files.map((f) => [f.path, f.content]));
      const compPaths: string[] = [];
      for (const c of repoMap.asBuilt.components) {
        for (const p of c.paths) if (!compPaths.includes(p)) compPaths.push(p);
      }
      const roleOf = (p: string) => repoMap.asBuilt.components.find((c) => c.paths.includes(p))?.role ?? '';
      const repoSources: Source[] = compPaths.map((p, i) => ({
        id: `r${i + 1}`,
        kind: 'repo',
        origin: 'Repo',
        title: p,
        url: `https://github.com/${owner}/${repo}/blob/${skeleton.meta.defaultBranch}/${p}`,
        snippet: fetched.get(p)?.slice(0, 200) || roleOf(p) || 'Repository file.',
        meta: skeleton.meta.language || undefined,
      }));
      const pathToId = new Map(repoSources.map((s) => [s.title, s.id]));

      const asBuiltVariant: Variant = {
        id: 'as-built',
        name: repoMap.asBuilt.name,
        profile: repoMap.asBuilt.profile,
        tagline: repoMap.asBuilt.tagline,
        summary: repoMap.asBuilt.summary,
        mermaid: repoMap.asBuilt.mermaid,
        components: repoMap.asBuilt.components.map((c) => ({
          name: c.name,
          role: c.role,
          sourceIds: c.paths.map((p) => pathToId.get(p)).filter((x): x is string => Boolean(x)),
        })),
        risks: repoMap.asBuilt.risks,
        whenToChoose: repoMap.asBuilt.whenToChoose,
      };
      settle(drawId, 'ok');
      log('cartographer', `Sheet 0 drawn: ${asBuiltVariant.components.length} components`, 'ok');

      // Seeded research (skip Scout — the Cartographer already produced targeted queries).
      let id = log('scout', `Seeded research → arXiv: ${repoMap.arxivQueries.join(' | ')}`, 'ok');
      id = log('scout', 'Searching arXiv and GitHub (seeded)…');
      const researchSources = await gatherSources(repoMap.arxivQueries, repoMap.githubQueries, (m) => log('scout', m, 'ok'));
      settle(id, 'ok');

      id = log('analyst', `Extracting from ${researchSources.length} research sources…`);
      const insights = await analyzeSources(label, researchSources);
      settle(id, 'ok');
      log('analyst', `Structured ${insights.length} source briefs`, 'ok');

      id = log('architect', 'Proposing evolution variants vs as-built…');
      // Pass the raw as-built (components described by paths, no sourceIds/id) so the architect
      // can't mistake the as-built for a citable source.
      const asBuiltContext = { summary: repoMap.summary, detectedStack: repoMap.detectedStack, asBuilt: repoMap.asBuilt };
      const { variants: evolution, comparison } = await synthesizeArchitectures(label, researchSources, insights, undefined, asBuiltContext);
      settle(id, 'ok');
      log('architect', `Drafted ${evolution.length} evolution sheets vs as-built`, 'ok');
      log('system', 'Blueprint ready. Sheet 0 is the current system.', 'ok');

      if (runToken.current !== token) return;
      const run: RunResult = {
        topic: label,
        sources: [...repoSources, ...researchSources],
        insights,
        variants: [asBuiltVariant, ...evolution],
        comparison,
        repoUrl,
      };
      setResult(run);
      setPhase('done');
      setHistory(pushHistory({ topic: label, savedAt: Date.now(), result: run }));
    } catch (e) {
      if (runToken.current !== token) return;
      const msg = e instanceof Error ? e.message : String(e);
      log('cartographer', msg, 'err');
      setError(`${msg}`);
      setPhase('error');
    }
  }

async function runRefine(instruction: string) {
    const instr = instruction.trim();
    if (!instr || !result || busy) return;
    setRefining(true);
    const id = log('architect', `Refining: ${instr}`);
    try {
      const { variants, comparison } = await refineArchitectures(
        result.topic, result.sources, result.insights, result.variants, instr, result.constraints,
      );
      settle(id, 'ok');
      log('architect', `Reworked ${variants.length} variants + trade-off table`, 'ok');
      const updated: RunResult = { ...result, variants, comparison };
      setResult(updated);
      setHistory(pushHistory({ topic: updated.topic, savedAt: Date.now(), result: updated }));
      setRefineInput('');
    } catch (e) {
      settle(id, 'err');
      log('system', e instanceof Error ? e.message : String(e), 'err');
    } finally {
      setRefining(false);
    }
  }
```

## Prompt 6 — Example data + polish

Bundle ONE full example run as JSON (below) — wire it to the example chip on Home and use it as the offline/error fallback.

**Diagram note:** render the `mermaid` field as a styled monospace code block (dark panel, cyan text). Do NOT attempt to render an actual graph — showing the diagram source is the intended behavior on Android.

**Final polish:**
- Loading states on every async action (spinners in the console, disabled inputs while a run is in flight).
- Tap targets ≥ 48dp.
- Dark status bar matching the #0E1D33 background.
- App icon: a cyan (#5FD4F5) square outline on a navy (#0E1D33) field.

Bundled example run (JSON):

```json
{
  "topic": "distributed database built on AI agents",
  "sources": [
    {
      "kind": "paper",
      "origin": "arXiv",
      "title": "A Survey of Multi-Agent Deep Reinforcement Learning with Communication",
      "url": "https://arxiv.org/abs/2203.08975v2",
      "snippet": "Communication is an effective mechanism for coordinating the behaviors of multiple agents, broadening their views of the environment, and to support their collaborations. In the field of multi-agent deep reinforcement learning (MADRL), agents can improve the overall learning performance and achieve their objectives by communication. Agents can communicate various types of messages, either to all agents or to specific agent groups, or conditioned on specific constraints. With the growing body of research work in MADRL with communication (Comm-MADRL), there is a lack of a systematic and structural approach to distinguish and classify existing Comm-MADRL approaches. In this paper, we survey recent works in the Comm-MADRL field and consider various aspects of communication that can play a role in designing and developing multi-agent reinforcement learning systems. With these aspects in mind,…",
      "meta": "Changxi Zhu, Mehdi Dastani, Shihan Wang · 2022",
      "id": "s1"
    },
    {
      "kind": "paper",
      "origin": "arXiv",
      "title": "A Methodology to Engineer and Validate Dynamic Multi-level Multi-agent Based Simulations",
      "url": "https://arxiv.org/abs/1311.5108v1",
      "snippet": "This article proposes a methodology to model and simulate complex systems, based on IRM4MLS, a generic agent-based meta-model able to deal with multi-level systems. This methodology permits the engineering of dynamic multi-level agent-based models, to represent complex systems over several scales and domains of interest. Its goal is to simulate a phenomenon using dynamically the lightest representation to save computer resources without loss of information. This methodology is based on two mechanisms: (1) the activation or deactivation of agents representing different domain parts of the same phenomenon and (2) the aggregation or disaggregation of agents representing the same phenomenon at different scales.",
      "meta": "Jean-Baptiste Soyez, Gildas Morvan, Daniel Dupont et al. · 2013",
      "id": "s2"
    },
    {
      "kind": "paper",
      "origin": "arXiv",
      "title": "EDCHO: High Order Exact Dynamic Consensus",
      "url": "https://arxiv.org/abs/2202.03012v2",
      "snippet": "This article addresses the problem of average consensus in a multi-agent system when the desired consensus quantity is a time varying signal. Although this problem has been addressed in existing literature by linear schemes, only bounded steady-state errors have been achieved. Other approaches have used first order sliding modes to achieve zero steady-state error, but suffer from the chattering effect. In this work, we propose a new exact dynamic consensus algorithm which leverages high order sliding modes, in the form of a distributed differentiator to achieve zero steady-state error of the average of time varying reference signals in a group of agents. Moreover, our proposal is also able to achieve consensus to high order derivatives of the average signal, if desired. An in depth formal study on the stability and convergence for EDCHO is provided for undirected connected graphs. Finall…",
      "meta": "Rodrigo Aldana-López, Rosario Aragüés, Carlos Sagüés · 2022",
      "id": "s3"
    },
    {
      "kind": "paper",
      "origin": "arXiv",
      "title": "REDCHO: Robust Exact Dynamic Consensus of High Order",
      "url": "https://arxiv.org/abs/2204.12344v2",
      "snippet": "This article addresses the problem of average consensus in a multi-agent system when the desired consensus quantity is a time varying signal. Recently, the EDCHO protocol leveraged high order sliding modes to achieve exact consensus under a constrained set of initial conditions, limiting its applicability to static networks. In this work, we propose REDCHO, an extension of the previous protocol which is robust to mismatch in the initial conditions, making it suitable to use cases in which connection and disconnection of agents is possible. The convergence properties of the protocol are formally explored. Finally, the effectiveness and advantages of our proposal are shown with concrete simulation examples showing the benefits of REDCHO against other methods in the literature.",
      "meta": "Rodrigo Aldana-López, Rosario Aragüés, Carlos Sagüés · 2022",
      "id": "s4"
    },
    {
      "kind": "repo",
      "origin": "GitHub",
      "title": "pingcap/tidb",
      "url": "https://github.com/pingcap/tidb",
      "snippet": "TiDB TiDB (/’taɪdiːbi:/, \"Ti\" stands for Titanium) is an open source, cloud native, distributed SQL database designed for high availability, horizontal and vertical scalability, strong consistency, and high performance. Key Features Quick Start Need Help? Architecture Contributing License See Also Acknowledgments Key Features Distributed Transactions : TiDB uses a two phase commit protocol to ensure ACID compliance, providing strong consistency. Transactions span multiple nodes, and TiDB's distributed nature ensures data correctness even in the presence of network partitions or node failures. Horizontal and Vertical Scalability : TiDB can be scaled horizontally by adding more nodes or vertically by increasing resources of existing nodes, all without downtime. TiDB's architecture separates computing from storage, enabling you to adjust both independently as needed for flexibility and growth. High Availability : Built in Raft consensus protocol ensures reliability and automated failover. Data is stored in multiple replicas, and transactions are committed only after writing to the majority of replicas, guaranteeing strong consistency and availability, even if some replicas fail. Geogr…",
      "meta": "Go · ★ 40,308",
      "id": "s5"
    },
    {
      "kind": "repo",
      "origin": "GitHub",
      "title": "K-Dense-AI/scientific-agent-skills",
      "url": "https://github.com/K-Dense-AI/scientific-agent-skills",
      "snippet": "Scientific Agent Skills Star History 🔔 Scientific Skills is now Scientific Agent Skills. Same skills, broader compatibility — now works with any AI agent that supports the open Agent Skills standard, not just one vendor. New: K Dense BYOK — A free, open source AI co scientist that runs on your desktop, powered by Scientific Agent Skills. Bring your own API keys, pick from 40+ models, and get a full research workspace with web search, file handling, 100+ scientific databases, and access to all 148 skills in this repo. Your data stays on your computer, and you can optionally scale to cloud compute via Modal for heavy workloads. Get started here. Stay up to date: Follow K Dense on X, LinkedIn, and YouTube for new skills, release announcements, walkthroughs, research workflow demos, and examples you can use with your own AI agent. A comprehensive collection of 148 ready to use scientific and research skills (covering cancer genomics, drug target binding, molecular dynamics, RNA velocity, geospatial science, time series forecasting, scientific ML resource discovery via Hugging Science, 78+ scientific databases, and more) for any AI agent that supports the open Agent Skills standard,…",
      "meta": "Python · ★ 31,121",
      "id": "s6"
    },
    {
      "kind": "repo",
      "origin": "GitHub",
      "title": "vanna-ai/vanna",
      "url": "https://github.com/vanna-ai/vanna",
      "snippet": "Vanna 2.0: Turn Questions into Data Insights Natural language → SQL → Answers. Now with enterprise security and user aware permissions. https://github.com/user attachments/assets/476cd421 d0b0 46af 8b29 0f40c73d6d83 What's New in 2.0 🔐 User Aware at Every Layer — Queries automatically filtered per user permissions 🎨 Modern Web Interface — Beautiful pre built component ⚡ Streaming Responses — Real time tables, charts, and progress updates 🔒 Enterprise Security — Row level security, audit logs, rate limiting 🔄 Production Ready — FastAPI integration, observability, lifecycle hooks Upgrading from 0.x? See the Migration Guide What changed? Get Started Try it with Sample Data Quickstart Configure Configure Web Component Uses your existing cookies/JWTs. Works with React, Vue, or plain HTML. What You Get Ask a question in natural language and get back: 1. Streaming Progress Updates 2. SQL Code Block (By default only shown to \"admin\" users) 3. Interactive Data Table 4. Charts (Plotly visualizations) 5. Natural Language Summary All streamed in real time to your web component. Why Vanna 2.0? ✅ Get Started Instantly Production chat interface Custom agent with your database Embed in any web…",
      "meta": "Python · ★ 23,781",
      "id": "s7"
    }
  ],
  "insights": [
    {
      "sourceId": "s1",
      "architecture": "The paper studies multi-agent deep reinforcement learning (MADRL) architectures where agents communicate to coordinate and broaden their environmental views.",
      "algorithmOrMath": "It focuses on communication-conditioned Multi-Agent Deep Reinforcement Learning (Comm-MADRL) algorithms.",
      "limitations": "The text notes a lack of a systematic and structural approach to distinguish and classify existing Comm-MADRL approaches.",
      "metrics": "not stated",
      "relevance": "Provides foundational concepts on how multiple AI agents can coordinate and communicate, which could guide the agent communication layer of a distributed database."
    },
    {
      "sourceId": "s2",
      "architecture": "Based on IRM4MLS, a generic agent-based meta-model capable of representing multi-level, multi-scale systems.",
      "algorithmOrMath": "Uses two key mechanisms: the activation/deactivation of agents representing the same phenomenon, and the aggregation/disaggregation of agents across different scales.",
      "limitations": "not stated",
      "metrics": "Aims to save computer resources without loss of information.",
      "relevance": "The multi-level agent simulation techniques and resource-saving mechanisms could optimize node or agent organization in a distributed database."
    },
    {
      "sourceId": "s3",
      "architecture": "A multi-agent consensus system over undirected connected graphs.",
      "algorithmOrMath": "Proposes the EDCHO algorithm leveraging high-order sliding modes in the form of a distributed differentiator to achieve exact average consensus of time-varying signals.",
      "limitations": "Limited by a constrained set of initial conditions, making it mostly applicable to static networks.",
      "metrics": "Achieves zero steady-state error of the average of time-varying reference signals and avoids the chattering effect.",
      "relevance": "Consensus algorithms are crucial for distributed databases; high-order exact consensus is highly relevant to distributed agent coordination."
    },
    {
      "sourceId": "s4",
      "architecture": "An extension of the multi-agent consensus system that supports dynamic networks where agents can connect and disconnect.",
      "algorithmOrMath": "Proposes REDCHO, which extends EDCHO by adding robustness to mismatches in initial conditions using high-order sliding modes.",
      "limitations": "not stated",
      "metrics": "Evaluated using simulation examples demonstrating benefits against existing methods.",
      "relevance": "Directly addresses dynamic connection and disconnection of agents, which is essential for fault tolerance in an AI-agent-based distributed database."
    },
    {
      "sourceId": "s5",
      "architecture": "An open-source, cloud-native distributed SQL database that separates computing from storage.",
      "algorithmOrMath": "Uses a two-phase commit protocol for distributed transactions (ACID compliance) and the Raft consensus protocol for high availability and replication.",
      "limitations": "not stated",
      "metrics": "Ensures high availability, horizontal/vertical scalability, and strong consistency.",
      "relevance": "Provides a real-world architectural reference for building distributed databases, including consensus protocols and transaction management."
    },
    {
      "sourceId": "s6",
      "architecture": "An open standard-compatible agent skill framework integrated with a co-scientist desktop workspace (K Dense BYOK).",
      "algorithmOrMath": "Provides 148 ready-to-use scientific skills, including integrations with over 100 scientific databases and web search.",
      "limitations": "Heavy workloads require scaling to cloud compute via Modal.",
      "metrics": "Includes 148 skills and supports over 40 AI models.",
      "relevance": "Demonstrates how AI agents interface with numerous databases, showcasing potential capabilities for database-handling agents."
    },
    {
      "sourceId": "s7",
      "architecture": "A framework that integrates natural language interfaces with existing databases, featuring a modern web interface and FastAPI integration.",
      "algorithmOrMath": "Translates natural language to SQL and generates corresponding charts and summaries.",
      "limitations": "not stated",
      "metrics": "Provides streaming responses, row-level security, and rate limiting.",
      "relevance": "Shows how AI-driven natural language agents can interface with databases, which is valuable for the user-facing query layers of an agent-based database."
    }
  ],
  "variants": [
    {
      "id": "fast-mvp-agent-db",
      "name": "Natural Language Agentic Database Proxy",
      "profile": "Fast MVP",
      "tagline": "AI-assisted NL query wrapper on a highly available distributed SQL engine",
      "summary": "This architecture wraps a cloud-native TiDB storage backend with Vanna-powered natural language agents and pre-built K-Dense skill nodes. Query execution is agent-routed but transaction processing relies on standard reliable Raft consensus, ensuring high speed to market.",
      "mermaid": "flowchart TD\nA[\"User Interface\"] --> B[\"NL Query Agent\"]\nB --> C[\"Agent Skill Coordinator\"]\nC --> D[\"Storage Engine Nodes\"]\nC --> E[\"State DB using Raft\"]",
      "components": [
        {
          "name": "NL Query Agent",
          "role": "Translates natural language intents into dynamic SQL schemas and parameters.",
          "sourceIds": [
            "s7"
          ]
        },
        {
          "name": "Agent Skill Coordinator",
          "role": "Uses modular agent skills to route, optimize, and schedule queries.",
          "sourceIds": [
            "s6"
          ]
        },
        {
          "name": "Consensus & State DB",
          "role": "Maintains catalog metadata and schema configurations using Raft protocol.",
          "sourceIds": [
            "s5"
          ]
        }
      ],
      "risks": "Agent latency of natural language translation can degrade performance for transactional workloads; relies heavily on pre-existing database stability.",
      "whenToChoose": "Choose when you need to demo a highly intuitive, conversational, and functional distributed database interface rapidly."
    },
    {
      "id": "scalable-agent-db",
      "name": "Decoupled Dynamic Agent-Node Database",
      "profile": "Scalable",
      "tagline": "Cloud-native compute-storage database utilizing dynamic agent scaling and robust consensus",
      "summary": "Splits database compute from storage using TiDB principles. The compute layer uses dynamically scaled agent nodes which active, deactivate, and scale vertically under dynamic workloads. Agent cluster state is managed using robust exact dynamic consensus (REDCHO), allowing resilient database nodes to join and drop.",
      "mermaid": "flowchart TD\nA[\"User Query Router\"] --> B[\"Distributed Agent Query Layer\"]\nB --> C[\"Dynamic Scale Coordinator\"]\nC --> D[\"Dynamic Consensus Engine\"]\nD --> E[\"Storage Agent Nodes\"]",
      "components": [
        {
          "name": "Dynamic Scale Coordinator",
          "role": "Leverages agent aggregation and deactivation mechanics to dynamically manage active computing agent nodes.",
          "sourceIds": [
            "s2"
          ]
        },
        {
          "name": "Dynamic Consensus Engine",
          "role": "Implements REDCHO to guarantee consistent state agreement across dynamic, fluctuating node clusters.",
          "sourceIds": [
            "s4"
          ]
        },
        {
          "name": "Distributed Agent Query Layer",
          "role": "Coordinates distributed transactions and execution plans via multi-agent communication.",
          "sourceIds": [
            "s1",
            "s5"
          ]
        }
      ],
      "risks": "High complexity in debugging concurrent consensus issues when computing agents disconnect rapidly under load.",
      "whenToChoose": "Choose when you require a production-ready, highly elastic cloud-native database that self-optimizes resource usage dynamically."
    },
    {
      "id": "research-agent-db",
      "name": "Autonomous MADRL Consensus Mesh",
      "profile": "Research-grade",
      "tagline": "Self-healing swarm database driven by Multi-Agent Reinforcement Learning and High-Order Consensus",
      "summary": "A fully decentralized swarm architecture where each node is an intelligent agent executing Multi-Agent Deep Reinforcement Learning (MADRL) for query routing, combined with EDCHO and REDCHO consensus algorithms to achieve exact data convergence across undirected connected networks.",
      "mermaid": "flowchart TD\nA[\"Client Peer\"] --> B[\"MADRL Routing Agents\"]\nB --> C[\"Hierarchical Scale Manager\"]\nC --> D[\"REDCHO Consensus Engine\"]\nD --> E[\"Autonomous Storage Peers\"]",
      "components": [
        {
          "name": "MADRL Routing Agents",
          "role": "Agents dynamically learn optimized communication pathways and resource allocations using RL.",
          "sourceIds": [
            "s1"
          ]
        },
        {
          "name": "REDCHO Consensus Engine",
          "role": "Provides robust high-order sliding mode algorithms to guarantee zero steady-state consensus error.",
          "sourceIds": [
            "s3",
            "s4"
          ]
        },
        {
          "name": "Hierarchical Scale Manager",
          "role": "Handles multi-level agent representations to group storage clusters dynamically.",
          "sourceIds": [
            "s2"
          ]
        }
      ],
      "risks": "Unpredictability in MADRL convergence path; highly dependent on static network bounds when initializing EDCHO elements.",
      "whenToChoose": "Choose for exploratory academic projects or decentralized networks that require adaptive, self-organizing state distribution."
    }
  ],
  "comparison": [
    {
      "criterion": "Time to MVP",
      "values": [
        "1 to 2 weeks",
        "3 to 6 months",
        "1 to 2 years"
      ]
    },
    {
      "criterion": "Scaling ceiling",
      "values": [
        "Limited by proxy gateway throughput",
        "Highly elastic via dynamic node agent lifecycles",
        "Massive, peer-to-peer decentralized convergence capability"
      ]
    },
    {
      "criterion": "Consistency guarantee",
      "values": [
        "Strong consistency using proven Raft protocols",
        "Robust dynamic consensus supporting dynamic networks",
        "Mathematical average convergence over time-varying graphs"
      ]
    },
    {
      "criterion": "Compute overhead",
      "values": [
        "Low agent proxy footprint",
        "Moderate from continuous lifecycle orchestration",
        "Extremely high due to MADRL and sliding-modes"
      ]
    },
    {
      "criterion": "Fault tolerance logic",
      "values": [
        "Standard multi-replica cloud database failover",
        "Dynamic node reactivation and REDCHO state realignment",
        "Self-healing graph topology with robust consensus algorithms"
      ]
    },
    {
      "criterion": "Defensibility",
      "values": [
        "Low, wraps open-source AI libraries",
        "High proprietary design for agent scaling DB",
        "Extremely high academic-grade algorithmic defensibility"
      ]
    }
  ]
}
```

## Checklist

- [ ] Replace `BASE_URL` with the deployed web app URL.
- [ ] Run in the Android preview/simulator: a typed idea end-to-end.
- [ ] Test: vague idea → interpretation cards; repo URL → as-built Sheet 0; refine a result.
- [ ] Screenshot the prompt history panel for judging.
