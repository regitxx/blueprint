// Full 3-agent pipeline smoke test against the live Gemini API — no browser.
// Runs Scout → gatherSources → Analyst → Architect on a fixed topic, times each
// stage, and asserts the shape of the output. Exits 1 on any failed check.

// One env var works everywhere: gemini.ts reads process.env.API_KEY.
process.env.API_KEY ||= process.env.GEMINI_API_KEY;

import { analyzeSources, mapRepoArchitecture, readDocument, refineArchitectures, scoutQueries, synthesizeArchitectures } from '../services/gemini';
import { gatherSources } from '../services/sources';
import { fetchRepoSkeleton } from '../services/repo';
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

  // ---------------- Phase R (cartographer: repo → as-built + evolution) ----------------
  console.log('\nPhase R — cartographer (expressjs/express):');
  const now = () => Date.now();
  let skeleton: Awaited<ReturnType<typeof fetchRepoSkeleton>> | null = null;
  try {
    const t0 = now();
    skeleton = await fetchRepoSkeleton('expressjs', 'express', (m) => console.log(`    · ${m}`));
    console.log(`✓ fetchRepoSkeleton: ${now() - t0}ms — ${skeleton.files.length} files, ${skeleton.paths.length} tree paths`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/rate-limited|Repo not found/i.test(msg)) {
      console.log('Phase R SKIPPED (rate limit)');
    } else {
      console.error(`Phase R error: ${msg}`);
      process.exit(1);
    }
  }

  if (skeleton) {
    check('repo skeleton has files', skeleton.files.length > 0, `got ${skeleton.files.length}`);

    const tRepo = skeleton;
    const repoMap = await stage('mapRepoArchitecture', () => mapRepoArchitecture('expressjs/express', tRepo));
    const treePaths = new Set(tRepo.paths);
    check('as-built ≥3 components', repoMap.asBuilt.components.length >= 3, `got ${repoMap.asBuilt.components.length}`);
    check('as-built non-empty mermaid', !!repoMap.asBuilt.mermaid?.trim());
    const offTree = repoMap.asBuilt.components.flatMap((c) => c.paths).filter((p) => !treePaths.has(p));
    check('every component path ∈ fetched tree', offTree.length === 0, offTree.slice(0, 5).join(', '));

    // Build repo Sources + as-built Variant (mirrors App).
    const fetched = new Map(tRepo.files.map((f) => [f.path, f.content]));
    const compPaths: string[] = [];
    for (const c of repoMap.asBuilt.components) for (const p of c.paths) if (!compPaths.includes(p)) compPaths.push(p);
    const roleOf = (p: string) => repoMap.asBuilt.components.find((c) => c.paths.includes(p))?.role ?? '';
    const repoSources: Source[] = compPaths.map((p, i) => ({
      id: `r${i + 1}`, kind: 'repo', origin: 'Repo', title: p,
      url: `https://github.com/expressjs/express/blob/${tRepo.meta.defaultBranch}/${p}`,
      snippet: fetched.get(p)?.slice(0, 200) || roleOf(p) || 'Repository file.',
    }));
    const pathToId = new Map(repoSources.map((s) => [s.title, s.id]));
    const asBuiltVariant: Variant = {
      id: 'as-built', name: repoMap.asBuilt.name, profile: repoMap.asBuilt.profile,
      tagline: repoMap.asBuilt.tagline, summary: repoMap.asBuilt.summary, mermaid: repoMap.asBuilt.mermaid,
      components: repoMap.asBuilt.components.map((c) => ({
        name: c.name, role: c.role, sourceIds: c.paths.map((p) => pathToId.get(p)).filter((x): x is string => Boolean(x)),
      })),
      risks: repoMap.asBuilt.risks, whenToChoose: repoMap.asBuilt.whenToChoose,
    };

    const researchSources = await stage('seeded gatherSources', () =>
      gatherSources(repoMap.arxivQueries, repoMap.githubQueries, (m) => console.log(`    · ${m}`)));
    const repoInsights = await stage('analyst(research)', () => analyzeSources('expressjs/express', researchSources));
    const asBuiltContext = { summary: repoMap.summary, detectedStack: repoMap.detectedStack, asBuilt: repoMap.asBuilt };
    const evo = await stage<{ variants: Variant[]; comparison: ComparisonRow[] }>('evolution architect', () =>
      synthesizeArchitectures('expressjs/express', researchSources, repoInsights, undefined, asBuiltContext));

    const finalSources = [...repoSources, ...researchSources];
    const finalVariants = [asBuiltVariant, ...evo.variants];
    const finalIds = new Set(finalSources.map((s) => s.id));
    console.log(`  as-built + ${evo.variants.length} evolution variants; ${finalSources.length} sources`);

    console.log('\nPhase R checks:');
    runChecks(finalVariants, evo.comparison, finalIds);
    check('first column is As-built', /as-built/i.test(finalVariants[0].name) || /as-built/i.test(finalVariants[0].profile),
      `first variant: "${finalVariants[0].name}"`);
  }

  console.log(`\n${failed === 0 ? 'ALL CHECKS PASSED' : `${failed} CHECK(S) FAILED`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main();
