// Generate AISTUDIO_PROMPTS.md — a numbered copy-paste prompt sequence for AI Studio's Build
// agent that rebuilds the whole app. Prompt 1 is the bootstrap; each later prompt carries an
// intent paragraph plus the exact reference files for one group. Reuses BROWSER_FILES + the
// fence-size logic from make-paste-pack.ts.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Exact paste order — dependencies first, entrypoint last. (Same set as make-paste-pack.ts.)
const BROWSER_FILES = [
  'metadata.json',
  'index.html',
  'types.ts',
  'examples.generated.ts',
  'constants.ts',
  'services/sources.ts',
  'services/repo.ts',
  'services/export.ts',
  'services/gemini.ts',
  'components/Results.tsx',
  'App.tsx',
  'index.tsx',
];

const LANG: Record<string, string> = { '.json': 'json', '.html': 'html', '.ts': 'ts', '.tsx': 'tsx' };

// A fence longer than any run of backticks in the content, so embedded ``` never terminates it.
function fenceFor(content: string): string {
  const longest = (content.match(/`+/g) || []).reduce((m, r) => Math.max(m, r.length), 0);
  return '`'.repeat(Math.max(3, longest + 1));
}

// One prompt per group, in build order. Each intent paragraph is copied verbatim from the venue task.
const GROUPS: { intent: string; files: string[] }[] = [
  {
    intent: 'Set up the app shell and data model for Blueprint: page frame, blueprint design system, and the shared TypeScript contracts every agent uses.',
    files: ['metadata.json', 'index.html', 'types.ts', 'index.tsx'],
  },
  {
    intent: 'Add the agent system prompts and two real saved pipeline runs used as instant example blueprints.',
    files: ['examples.generated.ts', 'constants.ts'],
  },
  {
    intent: 'Implement live source gathering: a 4-rail arXiv fallback ladder, GitHub search with README enrichment, and a GitHub repo skeleton fetcher for as-built mapping.',
    files: ['services/sources.ts', 'services/repo.ts'],
  },
  {
    intent: 'Implement the Gemini brain: seven schema-contracted agent calls (interpreter, reader, cartographer, scout, analyst, architect, refine) with retry, thinking auto-degrade, and server-proxy key handling.',
    files: ['services/gemini.ts'],
  },
  {
    intent: 'Implement the results view: variant sheets with engineering title blocks, Mermaid rendering with fallback, trade-off table, cited sources.',
    files: ['components/Results.tsx'],
  },
  {
    intent: 'Wire the full product: pipeline orchestration, ambiguity cards, doc upload (.txt/.md/.docx), run history, conversational refine, and ADR/agent-prompt exports.',
    files: ['services/export.ts', 'App.tsx'],
  },
];

// Sanity: the groups must cover every BROWSER_FILE exactly once (guards against drift).
function assertCoverage(): void {
  const grouped = GROUPS.flatMap((g) => g.files);
  const missing = BROWSER_FILES.filter((f) => !grouped.includes(f));
  const extra = grouped.filter((f) => !BROWSER_FILES.includes(f));
  const dupes = grouped.filter((f, i) => grouped.indexOf(f) !== i);
  if (missing.length || extra.length || dupes.length) {
    console.error('Group coverage mismatch:');
    if (missing.length) console.error(`  missing from groups: ${missing.join(', ')}`);
    if (extra.length) console.error(`  not in BROWSER_FILES: ${extra.join(', ')}`);
    if (dupes.length) console.error(`  duplicated: ${dupes.join(', ')}`);
    process.exit(1);
  }
}

function fileBlock(rel: string): string {
  const content = readFileSync(join(ROOT, rel), 'utf8').replace(/\n$/, '');
  const fence = fenceFor(content);
  const lang = LANG[extname(rel)] || '';
  return `### ${rel}\n\n${fence}${lang}\n${content}\n${fence}`;
}

function main(): void {
  assertCoverage();

  const parts: string[] = [];

  parts.push('# AI Studio Prompt Pack');
  parts.push('');
  parts.push('> Rebuild Blueprint in AI Studio by pasting each numbered prompt below, in order, into the');
  parts.push('> Build agent. Prompt 1 bootstraps the app; prompts 2–7 apply the exact reference files.');
  parts.push('> After the last prompt, run the checklist at the bottom.');
  parts.push('');

  // Prompt 1 — bootstrap (verbatim contents of AISTUDIO_PROMPT.md)
  const bootstrap = readFileSync(join(ROOT, 'AISTUDIO_PROMPT.md'), 'utf8').replace(/\n$/, '');
  parts.push('## Prompt 1 — Bootstrap');
  parts.push('');
  parts.push(bootstrap);

  // Prompts 2..N — one per group
  GROUPS.forEach((g, gi) => {
    const n = gi + 2;
    parts.push('');
    parts.push(`## Prompt ${n}`);
    parts.push('');
    parts.push(g.intent);
    parts.push('');
    parts.push('Apply these reference implementations exactly — create or overwrite each file:');
    parts.push('');
    parts.push(g.files.map(fileBlock).join('\n\n'));
  });

  // Footer checklist
  parts.push('');
  parts.push('## Checklist');
  parts.push('');
  parts.push('- [ ] Delete any leftover skeleton files not in the list above.');
  parts.push('- [ ] Secrets → set `GEMINI_API_KEY` = the paid key.');
  parts.push('- [ ] Preview one run.');
  parts.push('- [ ] Publish.');
  parts.push('- [ ] 3-tab burst test (open 3 tabs, run concurrently).');
  parts.push('');

  const out = parts.join('\n');
  writeFileSync(join(ROOT, 'AISTUDIO_PROMPTS.md'), out);

  const promptCount = 1 + GROUPS.length;
  const bytes = Buffer.byteLength(out, 'utf8');
  console.log('Wrote AISTUDIO_PROMPTS.md');
  console.log(`Prompts: ${promptCount} (1 bootstrap + ${GROUPS.length} file groups covering ${BROWSER_FILES.length} files)`);
  console.log(`Total size: ${(bytes / 1024).toFixed(1)} KB (${bytes} bytes)`);
}

main();
