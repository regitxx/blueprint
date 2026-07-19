import { useCallback, useRef, useState } from 'react';
import Results from './components/Results';
import { CACHED_RUNS } from './constants';
import { analyzeSources, mapRepoArchitecture, readDocument, refineArchitectures, scoutQueries, synthesizeArchitectures } from './services/gemini';
import { gatherSources } from './services/sources';
import { fetchRepoSkeleton } from './services/repo';
import type { AgentName, LogEntry, RunResult, Source, Variant } from './types';

const AGENT_TAG: Record<AgentName, string> = {
  scout: 'SCT', analyst: 'ANL', architect: 'ARC', reader: 'RDR', cartographer: 'MAP', system: 'SYS',
};

const REPO_RE = /github\.com\/([\w.-]+)\/([\w.-]+)/;

const MAX_DOC_BYTES = 2 * 1024 * 1024; // 2MB upload cap

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result ?? ''));
    fr.onerror = () => reject(fr.error ?? new Error('file read failed'));
    fr.readAsText(file);
  });
}

// Run history — last 5 successful live runs, newest first, persisted in localStorage.
const HISTORY_KEY = 'bp.history';
interface HistoryEntry { topic: string; savedAt: number; result: RunResult; }

function loadHistory(): HistoryEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch { return []; }
}

function pushHistory(entry: HistoryEntry): HistoryEntry[] {
  const next = [entry, ...loadHistory().filter((h) => h.topic !== entry.topic)].slice(0, 5);
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch { /* quota / SSR — non-fatal */ }
  return next;
}

export default function App() {
  const [topic, setTopic] = useState('');
  const [phase, setPhase] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [refineInput, setRefineInput] = useState('');
  const [refining, setRefining] = useState(false);
  const logId = useRef(0);
  const runToken = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Inputs are locked while a fresh run OR a refine is in flight.
  const busy = phase === 'running' || refining;

  const log = useCallback((agent: AgentName, text: string, status: LogEntry['status'] = 'run') => {
    const id = ++logId.current;
    setLogs((prev) => [...prev, { id, agent, text, status }]);
    return id;
  }, []);

  const settle = useCallback((id: number, status: 'ok' | 'err') => {
    setLogs((prev) => prev.map((l) => (l.id === id ? { ...l, status } : l)));
  }, []);

  const begin = (t: string) => {
    runToken.current += 1;
    setTopic(t);
    setResult(null);
    setError('');
    setLogs([]);
    setPhase('running');
    return runToken.current;
  };

  // Core Scout → Analyst → Architect pipeline. Shared by the plain "Draft it" flow and the
  // document-reader flow (which supplies distilled constraints + the doc name).
  async function executePipeline(token: number, t: string, extra?: { constraints?: string[]; docName?: string }) {
    try {
      let id = log('scout', `Reading the idea: “${t}”`);
      const queries = await scoutQueries(t);
      settle(id, 'ok');
      log('scout', `Queries → arXiv: ${queries.arxivQueries.join(' | ')}`, 'ok');
      log('scout', `Queries → GitHub: ${queries.githubQueries.join(' | ')}`, 'ok');

      id = log('scout', 'Searching arXiv and GitHub…');
      const sources = await gatherSources(queries.arxivQueries, queries.githubQueries, (m) => log('scout', m, 'ok'));
      settle(id, 'ok');
      log('scout', `Locked ${sources.length} sources for analysis`, 'ok');

      id = log('analyst', `Extracting architecture, math and limits from ${sources.length} sources…`);
      const insights = await analyzeSources(t, sources);
      settle(id, 'ok');
      log('analyst', `Structured ${insights.length} source briefs`, 'ok');

      id = log('architect', extra?.constraints?.length ? `Synthesizing under ${extra.constraints.length} constraints…` : 'Synthesizing 2–3 variants with citations…');
      const { variants, comparison } = await synthesizeArchitectures(t, sources, insights, extra?.constraints);
      settle(id, 'ok');
      log('architect', `Drafted ${variants.length} sheets + trade-off table`, 'ok');
      log('system', 'Blueprint ready. Every block links to a source.', 'ok');

      if (runToken.current !== token) return;
      const run: RunResult = { topic: t, sources, insights, variants, comparison, constraints: extra?.constraints, docName: extra?.docName };
      setResult(run);
      setPhase('done');
      setHistory(pushHistory({ topic: t, savedAt: Date.now(), result: run }));
    } catch (e) {
      if (runToken.current !== token) return;
      const msg = e instanceof Error ? e.message : String(e);
      log('system', msg, 'err');
      setError(
        /429|quota|RESOURCE_EXHAUSTED/i.test(msg)
          ? 'Rate limit hit. Wait a minute, or open a cached demo topic below — same pipeline, pre-verified sources.'
          : `${msg} — try again, or open a cached demo topic below.`,
      );
      setPhase('error');
    }
  }

  async function runLive(rawTopic: string) {
    const t = rawTopic.trim();
    if (!t || busy) return;
    const repoMatch = t.match(REPO_RE);
    const token = begin(t);
    if (repoMatch) {
      const owner = repoMatch[1];
      const repo = repoMatch[2].replace(/\.git$/, '');
      await runRepoAnalysis(token, owner, repo, t);
    } else {
      await executePipeline(token, t);
    }
  }

  // Cartographer flow: repo URL → as-built sheet 0 → seeded research → evolution variants.
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

  // Reader flow: upload an idea doc → distill topic + constraints → run the pipeline under them.
  async function handleDoc(file: File) {
    if (busy) return;
    if (file.size > MAX_DOC_BYTES) {
      setError(`“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)}MB — idea docs must be under 2MB.`);
      return;
    }
    const token = begin(file.name);
    try {
      const text = await readFileText(file);
      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const rid = log('reader', `Reading ${file.name}: ${words} words…`);
      const { topic: distilled, constraints } = await readDocument(text);
      if (runToken.current !== token) return;
      settle(rid, 'ok');
      log('reader', `Distilled → “${distilled}” + ${constraints.length} constraints`, 'ok');
      setTopic(distilled);
      await executePipeline(token, distilled, { constraints, docName: file.name });
    } catch (e) {
      if (runToken.current !== token) return;
      log('reader', e instanceof Error ? e.message : String(e), 'err');
      setError('Could not read that document — try a .txt or .md idea doc.');
      setPhase('error');
    }
  }

  async function runCached(run: RunResult) {
    if (busy) return;
    const token = begin(run.topic);
    const step = async (agent: AgentName, text: string, ms: number) => {
      if (runToken.current !== token) throw new Error('cancelled');
      const id = log(agent, text);
      await wait(ms);
      settle(id, 'ok');
    };
    try {
      await step('scout', `Reading the idea: “${run.topic}”`, 550);
      await step('scout', `Searching arXiv… ${run.sources.filter((s) => s.kind === 'paper').length} papers found`, 750);
      await step('scout', `Searching GitHub… ${run.sources.filter((s) => s.kind === 'repo').length} repositories found`, 650);
      await step('analyst', `Extracting architecture, math and limits from ${run.sources.length} sources…`, 900);
      await step('architect', `Synthesizing ${run.variants.length} variants with citations…`, 900);
      log('system', 'Blueprint ready. Every block links to a source.', 'ok');
      if (runToken.current !== token) return;
      setResult(run);
      setPhase('done');
    } catch { /* superseded by a newer run */ }
  }

  // Conversational refine — revise the current result's variants in place, keeping it visible.
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

  const copyRunJson = () => {
    if (result) void navigator.clipboard.writeText(JSON.stringify(result, null, 2));
  };

  return (
    <div className="frame">
      <header className="masthead">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <h1>Blueprint</h1>
        </div>
        <p className="strap">Idea → cited architecture in about a minute. Scout reads arXiv &amp; GitHub, Analyst extracts what works, Architect drafts the options.</p>
      </header>

      <section className="drafting-table">
        <label className="input-label" htmlFor="idea">Describe the product you want to build</label>
        <div className="input-row">
          <input
            id="idea"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runLive(topic)}
            placeholder="e.g. an idea — or paste a github.com/owner/repo link"
            disabled={busy}
          />
          <button className="run" onClick={() => runLive(topic)} disabled={busy || !topic.trim()}>
            {phase === 'running' ? 'Drafting…' : 'Draft it'}
          </button>
          <button className="chip chip-btn upload-chip" onClick={() => fileRef.current?.click()} disabled={busy}>
            ⬆ Upload idea doc
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleDoc(f); e.target.value = ''; }}
          />
        </div>
        <div className="chip-row demo-row">
          <span className="demo-label">Example blueprints — saved live runs:</span>
          {CACHED_RUNS.map((r) => (
            <button key={r.topic} className="chip chip-btn" onClick={() => runCached(r)} disabled={busy}>
              ⚡ {r.topic}
            </button>
          ))}
        </div>
        {history.length > 0 && (
          <div className="chip-row history-row">
            <span className="demo-label">Your recent runs:</span>
            {history.map((h) => (
              <button key={h.savedAt} className="chip chip-btn" onClick={() => runCached(h.result)} disabled={busy}>
                ↻ {h.topic}
              </button>
            ))}
          </div>
        )}
        {error && <p className="error" role="alert">{error}</p>}
      </section>

      <main className={logs.length ? 'workbench' : 'workbench empty'}>
        {logs.length > 0 && (
          <aside className="console" aria-label="Agent console">
            <div className="console-head">
              <span>agent console</span>
              {result && <button className="ghost" onClick={copyRunJson}>Copy run JSON</button>}
            </div>
            <ol>
              {logs.map((l) => (
                <li key={l.id} className={`log log-${l.status}`}>
                  <span className={`tag tag-${l.agent}`}>{AGENT_TAG[l.agent]}</span>
                  <span className="log-text">{l.text}</span>
                  <span className="log-dot" aria-hidden="true">{l.status === 'run' ? '…' : l.status === 'ok' ? '✓' : '✕'}</span>
                </li>
              ))}
            </ol>
          </aside>
        )}
        {result && (
          <div className="results-wrap">
            {result.constraints && result.constraints.length > 0 && (
              <div className="constraint-row" aria-label="Constraints from your document">
                {result.docName && <span className="demo-label">⚑ {result.docName}</span>}
                {result.constraints.map((c, i) => (
                  <span key={i} className="chip constraint-chip">⚑ {c}</span>
                ))}
              </div>
            )}
            <Results result={result} />
            <form
              className="refine-bar"
              onSubmit={(e) => { e.preventDefault(); runRefine(refineInput); }}
            >
              <input
                className="refine-input"
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                placeholder="Refine it — e.g. make it serverless, cut the vector DB, halve the cost"
                disabled={busy}
                aria-label="Refine the blueprint"
              />
              <button className="run refine-btn" type="submit" disabled={busy || !refineInput.trim()}>
                {refining ? 'Refining…' : 'Refine'}
              </button>
            </form>
          </div>
        )}
        {!logs.length && (
          <div className="blank-slate">
            <p>Between an idea and the first line of code lie days of research.</p>
            <p className="blank-accent">Type the idea. Get the architecture — with receipts.</p>
          </div>
        )}
      </main>

      <footer className="colophon">
        <span>Built with Gemini · sources: arXiv API + GitHub Search</span>
        <span className="mono">GDG Stanford · Build with Google Gemini · 2026</span>
      </footer>
    </div>
  );
}
