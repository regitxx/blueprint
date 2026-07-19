// Generate ANDROID_PROMPTS.md — a numbered copy-paste prompt sequence for Google AI Studio's
// ANDROID Build agent that recreates Blueprint as a native Android app with feature parity.
// This is a SPEC document: each prompt is a precise specification, embedding our exact assets
// verbatim where fidelity matters. Reuses fenceFor + file reading from make-prompt-pack.ts.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// A fence longer than any run of backticks in the content, so embedded ``` never terminates it.
function fenceFor(content: string): string {
  const longest = (content.match(/`+/g) || []).reduce((m, r) => Math.max(m, r.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

function readFile(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8').replace(/\n$/, '');
}

function block(content: string, lang: string): string {
  const fence = fenceFor(content);
  return `${fence}${lang}\n${content}\n${fence}`;
}

// Extract a top-level `export const NAME = ...;` statement (template-literal or expression).
function extractExport(src: string, name: string): string {
  const start = src.indexOf(`export const ${name}`);
  if (start < 0) throw new Error(`export const ${name} not found`);
  const afterEq = src.indexOf('=', start);
  const firstBacktick = src.indexOf('`', afterEq);
  const firstSemi = src.indexOf(';', afterEq);
  if (firstBacktick >= 0 && firstBacktick < firstSemi) {
    const close = src.indexOf('`;', firstBacktick + 1); // template literals here contain no `; inside
    if (close < 0) throw new Error(`unterminated template literal for ${name}`);
    return src.slice(start, close + 2);
  }
  return src.slice(start, firstSemi + 1);
}

// Extract an `async function NAME(...) {...}` declaration by brace matching (bodies are balanced).
function extractFunction(src: string, name: string): string {
  const sig = src.indexOf(`async function ${name}(`);
  if (sig < 0) throw new Error(`async function ${name} not found`);
  const open = src.indexOf('{', sig);
  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) { i++; break; }
  }
  const out = src.slice(sig, i);
  if (!out.endsWith('}')) throw new Error(`brace match failed for ${name}`);
  return out;
}

// Pull the first (distributed-database) RunResult out of examples.generated.ts as clean JSON.
function firstExampleRunJson(): string {
  const src = readFile('examples.generated.ts');
  const marker = 'export const EXAMPLE_RUNS: RunResult[] = ';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('EXAMPLE_RUNS not found');
  const json = src.slice(start + marker.length, src.lastIndexOf(';'));
  const runs = JSON.parse(json) as { topic: string }[];
  if (!/distributed database/i.test(runs[0]?.topic ?? '')) {
    throw new Error(`expected distributed-database run first, got "${runs[0]?.topic}"`);
  }
  return JSON.stringify(runs[0], null, 2);
}

// ---- Extracted assets ----
const constantsSrc = readFile('constants.ts');
const PROMPT_NAMES = [
  'INTERPRETER_SYSTEM', 'READER_SYSTEM', 'SCOUT_SYSTEM', 'ANALYST_SYSTEM',
  'ARCHITECT_SYSTEM', 'ARCHITECT_REFINE_SYSTEM', 'CARTOGRAPHER_SYSTEM',
];
const agentConstants = [...PROMPT_NAMES, 'MODEL'].map((n) => extractExport(constantsSrc, n)).join('\n\n');

const appSrc = readFile('App.tsx');
const orchestration = ['runLive', 'runRepoAnalysis', 'runRefine'].map((n) => extractFunction(appSrc, n)).join('\n\n');

// ---- Prose ----
const BOOTSTRAP = [
  'Build a native Android app called **Blueprint — idea → cited architecture in ~30 seconds**. It takes a product idea (or a GitHub repo URL, or an uploaded idea doc) and returns 2–3 cited architecture options, each with a diagram, components that link to real sources, risks, and a trade-off table.',
  '',
  '**Design system (dark "blueprint"):** background #0E1D33, panels/surfaces #12253F, primary ink #DCE9F7, dim text #8FA9C9, hairlines/borders #2B4A73, cyan accent #5FD4F5, amber highlight #F5B95F. Use a monospace typeface for labels and log lines; section headers are UPPERCASE with wide letter-spacing. Everything reads like engineering drafting paper.',
  '',
  '**Screens:**',
  '- **Home** — a large input field with placeholder "Describe the product you want to build", a primary **Draft It** button, a row of example-blueprint chips, and a row of recent-runs chips.',
  '- **Run** — a live agent console: each line has a colored tag badge (INT, RDR, SCT, ANL, ARC, MAP, SYS) + the log text + a status indicator that animates from a spinner to a ✓ (or ✕ on error).',
  '- **Results** — horizontally swipeable variant sheets. Each sheet has an engineering title block (variant name / profile badge / "sheet i of N" / "drawn by Scout · Analyst · Architect"), then tagline, summary, a diagram area, a components list where each component shows tappable source chips that open the source URL, and a risks + "choose this when" pair. Two extra pages after the variant sheets: a **Compare** table page and a **Sources** page.',
  '- A **refine input bar** sits under the results so the user can request changes.',
].join('\n');

const P2_INTENT = 'Create Kotlin data classes that mirror these TypeScript interfaces EXACTLY — identical field names and optionality — so JSON from the backend deserializes directly. These are the shared contracts every screen and agent call uses.';

const P3_INTENT = [
  'Implement the pipeline\'s Gemini calls. Use THESE system prompts verbatim as string constants (do not paraphrase — the wording is load-bearing), and THESE JSON output shapes.',
  '',
  'All Gemini calls go through our existing backend proxy (the key lives server-side, never in the app):',
  '',
  '`POST {BASE_URL}/api/genai/v1beta/models/gemini-3.5-flash:generateContent`',
  '',
  'with a JSON body `{ contents, systemInstruction, generationConfig: { responseMimeType: "application/json", responseSchema: ... } }`. `BASE_URL` is a single constant with placeholder `https://REPLACE-WITH-DEPLOYED-URL`. Parse responses defensively: strip any Markdown code fences (triple-backtick, optionally `json`) before JSON-parsing. Retry once on HTTP 429 or 503 after a 2-second backoff.',
  '',
  'Each agent\'s `responseSchema` is defined in the reference service below — mirror those schemas (interpreter, reader, cartographer, scout, analyst, architect, refine). The `MODEL` constant is included for reference; the Android app should call the fixed `gemini-3.5-flash` endpoint above.',
].join('\n');

const P4_INTENT = [
  'Implement source gathering natively, following the reference algorithm below (fallback-ladder order, dedupe, and GitHub-widening when zero papers are found). Cap the result at 7 sources with ids `s1`..`s7`.',
  '',
  '- **arXiv (via our proxy):** `GET {BASE_URL}/api/arxiv?q=<query>&max=<n>` → parse the Atom XML entries (title, summary, id, authors, published).',
  '- **GitHub:** `https://api.github.com/search/repositories?q=<query>&per_page=<n>&sort=stars`, then fetch each repo README from `raw.githubusercontent.com` trying refs in order HEAD → main → master.',
  '- **Semantic Scholar fallback:** `https://api.semanticscholar.org/graph/v1/paper/search?query=<query>&limit=<n>&fields=title,abstract,year,authors,externalIds,url`.',
  '',
  'The papers rail is a ladder: same-origin app proxy → direct arXiv → public CORS proxy → Semantic Scholar; first non-empty wins. If no papers are found, widen the GitHub target to 5 repos.',
].join('\n');

const P5_INTENT = [
  'Wire the full flow exactly as the reference web orchestration below does:',
  '',
  '- **Interpreter gate** on typed ideas only: if ambiguous, show interpretation cards (emphasize each card\'s `keyDifference`) plus a "Research my exact wording" card; the chosen card\'s `impliedConstraints` flow into the architect as hard constraints.',
  '- **Doc upload** via the Android file picker (.txt/.md → read text): feed the text through the reader agent → distilled topic + ⚑ constraint chips.',
  '- **Repo detection:** if the input matches `github.com/owner/repo`, take the cartographer path — build a repo skeleton from 2 GitHub API calls (repo meta + recursive tree) plus raw file fetches → an as-built "Sheet 0" + seeded evolution variants.',
  '- **Console logging** for every stage (the tag badges from Prompt 1).',
  '- **Run history:** persist the last 5 runs in SharedPreferences; show them as recent-runs chips that replay instantly.',
  '- **Refine:** re-synthesize the variants in place from a refine instruction.',
  '- **Error fallback:** on failure, fall back to the one bundled example run (Prompt 6).',
].join('\n');

const P6_INTENT = [
  'Bundle ONE full example run as JSON (below) — wire it to the example chip on Home and use it as the offline/error fallback.',
  '',
  '**Diagram note:** render the `mermaid` field as a styled monospace code block (dark panel, cyan text). Do NOT attempt to render an actual graph — showing the diagram source is the intended behavior on Android.',
  '',
  '**Final polish:**',
  '- Loading states on every async action (spinners in the console, disabled inputs while a run is in flight).',
  '- Tap targets ≥ 48dp.',
  '- Dark status bar matching the #0E1D33 background.',
  '- App icon: a cyan (#5FD4F5) square outline on a navy (#0E1D33) field.',
].join('\n');

function main(): void {
  const parts: string[] = [];

  parts.push('# Android Prompt Pack');
  parts.push('');
  parts.push('> Rebuild Blueprint as a **native Android app** by pasting each numbered prompt below, in');
  parts.push('> order, into Google AI Studio\'s **Android** Build agent. The Android agent writes its own');
  parts.push('> Kotlin — each prompt is a precise specification, with our exact assets embedded where');
  parts.push('> fidelity matters (data contracts, system prompts, algorithms, example data). Run the');
  parts.push('> checklist at the bottom after the last prompt.');
  parts.push('');

  parts.push('## Prompt 1 — Bootstrap');
  parts.push('');
  parts.push(BOOTSTRAP);

  parts.push('');
  parts.push('## Prompt 2 — Data contracts');
  parts.push('');
  parts.push(P2_INTENT);
  parts.push('');
  parts.push('Reference — `types.ts` (mirror these exactly):');
  parts.push('');
  parts.push(block(readFile('types.ts'), 'ts'));

  parts.push('');
  parts.push('## Prompt 3 — Agent brains');
  parts.push('');
  parts.push(P3_INTENT);
  parts.push('');
  parts.push('System prompts + model (use verbatim):');
  parts.push('');
  parts.push(block(agentConstants, 'ts'));
  parts.push('');
  parts.push('Reference — `services/gemini.ts` (agent calls + responseSchema shapes to mirror):');
  parts.push('');
  parts.push(block(readFile('services/gemini.ts'), 'ts'));

  parts.push('');
  parts.push('## Prompt 4 — Live sources');
  parts.push('');
  parts.push(P4_INTENT);
  parts.push('');
  parts.push('Reference — `services/sources.ts` (fallback ladder, dedupe, GitHub-widening):');
  parts.push('');
  parts.push(block(readFile('services/sources.ts'), 'ts'));

  parts.push('');
  parts.push('## Prompt 5 — Pipeline orchestration');
  parts.push('');
  parts.push(P5_INTENT);
  parts.push('');
  parts.push('Reference — `App.tsx` orchestration (`runLive`, `runRepoAnalysis`, `runRefine`):');
  parts.push('');
  parts.push(block(orchestration, 'tsx'));

  parts.push('');
  parts.push('## Prompt 6 — Example data + polish');
  parts.push('');
  parts.push(P6_INTENT);
  parts.push('');
  parts.push('Bundled example run (JSON):');
  parts.push('');
  parts.push(block(firstExampleRunJson(), 'json'));

  parts.push('');
  parts.push('## Checklist');
  parts.push('');
  parts.push('- [ ] Replace `BASE_URL` with the deployed web app URL.');
  parts.push('- [ ] Run in the Android preview/simulator: a typed idea end-to-end.');
  parts.push('- [ ] Test: vague idea → interpretation cards; repo URL → as-built Sheet 0; refine a result.');
  parts.push('- [ ] Screenshot the prompt history panel for judging.');
  parts.push('');

  const out = parts.join('\n');
  writeFileSync(join(ROOT, 'ANDROID_PROMPTS.md'), out);

  const promptCount = (out.match(/^## Prompt \d+/gm) || []).length;
  const bytes = Buffer.byteLength(out, 'utf8');
  console.log('Wrote ANDROID_PROMPTS.md');
  console.log(`Prompts: ${promptCount} (+ checklist)`);
  console.log(`Total size: ${(bytes / 1024).toFixed(1)} KB (${bytes} bytes)`);

  // Verify all 7 system prompt names made it into the output.
  const missing = PROMPT_NAMES.filter((n) => !out.includes(n));
  if (missing.length) {
    console.error(`MISSING system prompt names in output: ${missing.join(', ')}`);
    process.exit(1);
  }
  console.log(`All 7 system prompt names present: ${PROMPT_NAMES.join(', ')}`);
}

main();
