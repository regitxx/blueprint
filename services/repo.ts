// Repo skeleton fetcher for the Cartographer agent.
// GitHub's core API is 60 req/hr unauthenticated, so we spend at most TWO core calls per
// analysis (repo meta + git tree). ALL file content comes from raw.githubusercontent.com,
// which is not rate-limited the same way.

export interface RepoMeta {
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  language: string;
  stars: number;
}

export interface RepoSkeleton {
  meta: RepoMeta;
  paths: string[]; // up to 500 tree paths (for the prompt)
  truncated: boolean; // true if the tree was capped or GitHub truncated it
  files: { path: string; content: string }[];
}

const RATE_LIMIT_MSG = 'Repo not found, private, or rate-limited — try again or use a public repo';

// Manifest files in priority order — first one that exists wins.
const MANIFESTS = ['package.json', 'pyproject.toml', 'go.mod', 'Cargo.toml', 'requirements.txt'];

// Entry-file heuristics in priority order.
const ENTRY_PATTERNS: RegExp[] = [
  /^src\/index\.[^/]+$/,
  /^src\/main\.[^/]+$/,
  /^index\.[^/]+$/,
  /^main\.[^/]+$/,
  /^app\.[^/]+$/,
  /^server\.[^/]+$/,
  /^cmd\/.+\/main\.go$/,
];

async function fetchRaw(owner: string, repo: string, branches: string[], path: string): Promise<string | null> {
  for (const b of branches) {
    try {
      const r = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${b}/${path}`);
      if (r.ok) return await r.text();
    } catch { /* try next branch */ }
  }
  return null;
}

export async function fetchRepoSkeleton(
  owner: string,
  repo: string,
  log: (t: string) => void,
): Promise<RepoSkeleton> {
  // ---- Core call 1/2: repo metadata ----
  const metaRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (metaRes.status === 404 || metaRes.status === 403) throw new Error(RATE_LIMIT_MSG);
  if (!metaRes.ok) throw new Error(`GitHub repo HTTP ${metaRes.status}`);
  const m = (await metaRes.json()) as {
    default_branch?: string; description?: string | null; language?: string | null; stargazers_count?: number;
  };
  const meta: RepoMeta = {
    owner,
    repo,
    defaultBranch: m.default_branch || 'main',
    description: m.description || '',
    language: m.language || '',
    stars: m.stargazers_count || 0,
  };

  // ---- Core call 2/2: recursive git tree ----
  const treeRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${meta.defaultBranch}?recursive=1`,
    { headers: { Accept: 'application/vnd.github+json' } },
  );
  if (treeRes.status === 404 || treeRes.status === 403) throw new Error(RATE_LIMIT_MSG);
  if (!treeRes.ok) throw new Error(`GitHub tree HTTP ${treeRes.status}`);
  const t = (await treeRes.json()) as { tree?: { path: string; type: string }[]; truncated?: boolean };
  const allPaths = (t.tree ?? []).filter((n) => n.type === 'blob').map((n) => n.path);
  const truncated = Boolean(t.truncated) || allPaths.length > 500;
  const paths = allPaths.slice(0, 500);
  log(`Mapping ${owner}/${repo}: ${allPaths.length} files${truncated ? ' (tree truncated to 500)' : ''}…`);

  // ---- Content via raw (no core-API cost) ----
  const branches = [...new Set([meta.defaultBranch, 'main', 'master'])];
  const files: { path: string; content: string }[] = [];
  let budget = 40 * 1024; // total content budget across all files

  const add = (path: string, raw: string | null, capKB: number): boolean => {
    if (!raw || budget <= 0) return false;
    let content = raw.length > capKB * 1024 ? raw.slice(0, capKB * 1024) : raw;
    if (content.length > budget) content = content.slice(0, budget);
    if (!content) return false;
    files.push({ path, content });
    budget -= content.length;
    return true;
  };

  // README (prefer the real path from the tree)
  const readmePath = paths.find((p) => /^readme\.(md|markdown)$/i.test(p)) || paths.find((p) => /readme\.(md|markdown)$/i.test(p));
  let readmeCount = 0;
  if (readmePath) readmeCount = add(readmePath, await fetchRaw(owner, repo, branches, readmePath), 8) ? 1 : 0;

  // First existing manifest
  const manifestPath = MANIFESTS.map((name) => paths.find((p) => p === name)).find(Boolean)
    || MANIFESTS.map((name) => paths.find((p) => p.endsWith(`/${name}`))).find(Boolean);
  let manifestCount = 0;
  if (manifestPath) manifestCount = add(manifestPath, await fetchRaw(owner, repo, branches, manifestPath), 6) ? 1 : 0;

  // Up to 5 entry files by heuristic, in priority order
  const entryPaths: string[] = [];
  for (const re of ENTRY_PATTERNS) {
    for (const p of paths) {
      if (entryPaths.length >= 5) break;
      if (re.test(p) && !entryPaths.includes(p)) entryPaths.push(p);
    }
    if (entryPaths.length >= 5) break;
  }
  let entryCount = 0;
  for (const p of entryPaths) {
    if (budget <= 0) break;
    if (add(p, await fetchRaw(owner, repo, branches, p), 6)) entryCount++;
  }

  log(`Read ${readmeCount ? 'README' : 'no README'} + ${manifestCount ? 'manifest' : 'no manifest'} + ${entryCount} entry files`);

  return { meta, paths, truncated, files };
}
