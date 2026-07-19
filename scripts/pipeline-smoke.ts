// Full 3-agent pipeline smoke test against the live Gemini API — no browser.
// Runs Scout → gatherSources → Analyst → Architect on a fixed topic, times each
// stage, and asserts the shape of the output. Exits 1 on any failed check.

// One env var works everywhere: gemini.ts reads process.env.API_KEY.
process.env.API_KEY ||= process.env.GEMINI_API_KEY;

import { analyzeSources, readDocument, refineArchitectures, scoutQueries, synthesizeArchitectures } from '../services/gemini';
import { gatherSources } from '../services/sources';
import type { ComparisonRow, Insight, Source, Variant } from '../types';

const TOPIC = 'realtime collaborative whiteboard with AI diagram cleanup';

// Run a named stage, timing it in ms. On throw: print stage + error, exit 1.
async function stage<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    const result = await fn();
    console.log(`✓ ${name}: ${Date.now() - t0}ms`);
    return result;
  } catch (err) {
    console.error(`\n✗ stage "${name}" threw after ${Date.now() - t0}ms:`);
    console.error(err instanceof Error ? `${err.name}: ${err.message}` : err);
    process.exit(1);
  }
}

let failed = 0;
function check(label: string, ok: boolean, detail = ''): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

// The 4 shape checks, reusable for both the architect and the refined output.
function runChecks(variants: Variant[], comparison: ComparisonRow[], sourceIds: Set<string>): void {
  check('≥2 variants', variants.length >= 2, `got ${variants.length}`);

  const missingMermaid = variants.filter((v) => !v.mermaid?.trim());
  check('every variant has non-empty mermaid', missingMermaid.length === 0,
    missingMermaid.length ? `${missingMermaid.length} missing: ${missingMermaid.map((v) => v.id).join(', ')}` : '');

  const danglingRefs: string[] = [];
  for (const v of variants) {
    for (const c of v.components) {
      for (const sid of c.sourceIds) {
        if (!sourceIds.has(sid)) danglingRefs.push(`${v.id}/${c.name}→${sid}`);
      }
    }
  }
  check('every component sourceId exists in sources', danglingRefs.length === 0,
    danglingRefs.length ? danglingRefs.slice(0, 5).join(', ') : '');

  const badRows = comparison.filter((r) => r.values.length !== variants.length);
  check('comparison rows have values.length === variants.length', badRows.length === 0,
    badRows.length ? `${badRows.length} misaligned: ${badRows.map((r) => `${r.criterion}(${r.values.length})`).join(', ')}` : '');
}

async function main(): Promise<void> {
  if (!process.env.API_KEY) {
    console.error('Missing API_KEY / GEMINI_API_KEY in environment.');
    process.exit(1);
  }

  console.log(`Topic: "${TOPIC}"\n`);

  // 1 · Scout
  const queries = await stage('scout', () => scoutQueries(TOPIC));
  console.log(`  arxivQueries: ${JSON.stringify(queries.arxivQueries)}`);
  console.log(`  githubQueries: ${JSON.stringify(queries.githubQueries)}`);

  // 2 · Gather sources (arXiv may be unreachable in some sandboxes — degrades gracefully)
  const sources: Source[] = await stage('gatherSources', () =>
    gatherSources(queries.arxivQueries, queries.githubQueries, (m) => console.log(`    · ${m}`)),
  );
  const papers = sources.filter((s) => s.kind === 'paper').length;
  const repos = sources.filter((s) => s.kind === 'repo').length;
  console.log(`  sources: ${sources.length} total (papers: ${papers}, repos: ${repos})`);

  // 3 · Analyst
  const insights: Insight[] = await stage('analyst', () => analyzeSources(TOPIC, sources));
  console.log(`  insights: ${insights.length}`);

  // 4 · Architect
  const { variants, comparison } = await stage<{ variants: Variant[]; comparison: ComparisonRow[] }>(
    'architect',
    () => synthesizeArchitectures(TOPIC, sources, insights),
  );
  console.log(`  variants: ${variants.length}, comparison rows: ${comparison.length}`);

  // ---------------- Validation (architect) ----------------
  const sourceIds = new Set(sources.map((s) => s.id));
  console.log('\nArchitect checks:');
  runChecks(variants, comparison, sourceIds);

  // Pretty-print the first variant for eyeballing.
  console.log('\nFirst variant:');
  console.log(JSON.stringify(variants[0], null, 2));

  if (failed !== 0) {
    console.log(`\n${failed} CHECK(S) FAILED — skipping refine.`);
    process.exit(1);
  }

  // ---------------- Refine ----------------
  const REFINE = 'make the cheapest variant fully serverless';
  console.log(`\nRefine instruction: "${REFINE}"`);
  const refined = await stage<{ variants: Variant[]; comparison: ComparisonRow[] }>(
    'refine',
    () => refineArchitectures(TOPIC, sources, insights, variants, REFINE),
  );
  console.log(`  refined variants: ${refined.variants.length}, comparison rows: ${refined.comparison.length}`);

  console.log('\nRefine checks:');
  runChecks(refined.variants, refined.comparison, sourceIds);

  // Cost row must survive the refine (mandated by ARCHITECT_SYSTEM).
  const costRow = refined.comparison.find((r) => /rough monthly cost/i.test(r.criterion));
  check('comparison contains a cost row', !!costRow,
    costRow ? `"${costRow.criterion}" = ${JSON.stringify(costRow.values)}` : 'no "Rough monthly cost" row found');

  // ---------------- Reader (idea doc → topic + constraints) ----------------
  const DOC = `Project brief: FieldNotes.
We want a note-taking app for field researchers working in remote areas — biologists, geologists, archaeologists — who spend days away from any network. Core requirement: the entire app must work offline, capturing text, photos, GPS coordinates, and voice memos with zero connectivity, then syncing opportunistically when a connection returns. Because deployments run on cheap Android tablets and old laptops, there must be no vector database and no heavy embedding index on the device. Search should be simple keyword and tag matching over local storage. Conflict resolution on sync must be predictable and never silently drop a researcher's data. Nice to have later: shared team notebooks and a desktop review dashboard. Keep the stack boring and maintainable.`;
  console.log('\nReader doc distillation:');
  const reader = await stage<{ topic: string; constraints: string[]; nonGoals: string[] }>(
    'reader',
    () => readDocument(DOC),
  );
  console.log(`  topic: "${reader.topic}" (${reader.topic.length} chars)`);
  console.log(`  constraints: ${JSON.stringify(reader.constraints)}`);
  check('reader topic ≤90 chars', reader.topic.length <= 90, `got ${reader.topic.length}`);
  check('reader captured ≥1 constraint', reader.constraints.length >= 1, `got ${reader.constraints.length}`);

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
