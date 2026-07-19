// Generate AISTUDIO_PASTE.md — the browser-runtime files in exact paste order, so a
// teammate can paste them over the AI Studio Build-mode skeleton. No API key needed.
//
// Preflight each file and flag for human review:
//   - import of 'vite' or a node builtin (node:*)  -> HARD FAIL (exit 1)
//   - require(...)                                  -> flag only
//   - process.env.<X> where X !== 'API_KEY' that is NOT typeof/try-catch guarded -> flag only

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// Exact paste order — dependencies first, entrypoint last.
const BROWSER_FILES = [
  'metadata.json',
  'index.html',
  'types.ts',
  'examples.generated.ts',
  'constants.ts',
  'services/sources.ts',
  'services/repo.ts',
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

// Is a process.env.<X> occurrence on this line guarded by `typeof process` (same line)
// or by an enclosing try {...} in the preceding few lines?
function isGuarded(lines: string[], idx: number): boolean {
  if (/typeof\s+process/.test(lines[idx])) return true;
  for (let i = Math.max(0, idx - 6); i < idx; i++) {
    if (/\btry\s*\{/.test(lines[i])) return true;
  }
  return false;
}

interface Flag { file: string; line: number; kind: string; text: string; }

const hardFails: Flag[] = [];
const reviewFlags: Flag[] = [];

function preflight(path: string, content: string): void {
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    const ln = i + 1;
    // vite / node builtin imports -> hard fail
    const badImport = line.match(/\b(?:import|export)\b[^'"]*['"](vite|node:[^'"]+)['"]/) || line.match(/^\s*import\s+['"](vite|node:[^'"]+)['"]/);
    if (badImport) hardFails.push({ file: path, line: ln, kind: `import '${badImport[1]}'`, text: line.trim() });

    // require() -> review flag
    if (/\brequire\s*\(/.test(line)) reviewFlags.push({ file: path, line: ln, kind: 'require()', text: line.trim() });

    // process.env.<X> (X !== API_KEY) unguarded -> review flag
    for (const m of line.matchAll(/process\.env\??\.([A-Za-z_$][\w$]*)/g)) {
      const key = m[1];
      if (key !== 'API_KEY' && !isGuarded(lines, i)) {
        reviewFlags.push({ file: path, line: ln, kind: `unguarded process.env.${key}`, text: line.trim() });
      }
    }
  });
}

function main(): void {
  const sections: string[] = [];
  let totalBytes = 0;

  BROWSER_FILES.forEach((rel, i) => {
    const abs = join(ROOT, rel);
    const content = readFileSync(abs, 'utf8');
    totalBytes += Buffer.byteLength(content, 'utf8');
    preflight(rel, content);
    const lang = LANG[extname(rel)] || '';
    const fence = fenceFor(content);
    sections.push(`## ${i + 1}. ${rel}\n\n${fence}${lang}\n${content.replace(/\n$/, '')}\n${fence}`);
  });

  const header = [
    '# AI Studio Paste Pack',
    '',
    '> Paste each file below over the AI Studio **Build-mode skeleton in this exact order**,',
    '> then delete any leftover skeleton files that are not in this list. Files are ordered',
    '> dependencies-first (entrypoint `index.tsx` last). No API key lives in these files —',
    '> AI Studio injects `process.env.API_KEY` at deploy time.',
    '',
  ].join('\n');

  const out = `${header}\n${sections.join('\n\n')}\n`;
  writeFileSync(join(ROOT, 'AISTUDIO_PASTE.md'), out);

  // Report
  console.log(`Wrote AISTUDIO_PASTE.md`);
  console.log(`Files: ${BROWSER_FILES.length}`);
  console.log(`Total size: ${(totalBytes / 1024).toFixed(1)} KB (${totalBytes} bytes)`);

  if (reviewFlags.length) {
    console.log(`\nPreflight review flags (${reviewFlags.length}) — human review, non-blocking:`);
    for (const f of reviewFlags) console.log(`  [${f.kind}] ${f.file}:${f.line}  ${f.text}`);
  } else {
    console.log('\nPreflight review flags: none');
  }

  if (hardFails.length) {
    console.error(`\nHARD FAIL (${hardFails.length}) — vite/node imports are not browser-safe:`);
    for (const f of hardFails) console.error(`  [${f.kind}] ${f.file}:${f.line}  ${f.text}`);
    process.exit(1);
  }
  console.log('\nNo vite/node imports found — paste pack is browser-safe.');
}

main();
