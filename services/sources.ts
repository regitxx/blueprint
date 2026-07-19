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
