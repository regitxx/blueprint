import mermaid from 'mermaid';
import { useEffect, useRef, useState } from 'react';
import type { RunResult, Source, Variant } from '../types';

mermaid.initialize({
  startOnLoad: false,
  theme: 'base',
  themeVariables: {
    background: '#0E1D33',
    primaryColor: '#12253F',
    primaryBorderColor: '#5FD4F5',
    primaryTextColor: '#DCE9F7',
    lineColor: '#5FD4F5',
    secondaryColor: '#173052',
    tertiaryColor: '#0E1D33',
    fontFamily: 'IBM Plex Mono, monospace',
    fontSize: '13px',
  },
});

let diagramSeq = 0;

function MermaidDiagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    setFailed(false);
    (async () => {
      try {
        const { svg } = await mermaid.render(`bp-diagram-${++diagramSeq}`, code.trim());
        if (alive && ref.current) ref.current.innerHTML = svg;
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => { alive = false; };
  }, [code]);
  if (failed) return <pre className="diagram-fallback">{code.trim()}</pre>;
  return <div className="diagram" ref={ref} aria-label="Architecture diagram" />;
}

function SourceChip({ id, sources }: { id: string; sources: Source[] }) {
  const s = sources.find((x) => x.id === id);
  if (!s) return <span className="chip">{id}</span>;
  return (
    <a className="chip" href={s.url} target="_blank" rel="noreferrer" title={s.title}>
      {id} · {s.origin}
    </a>
  );
}

function VariantSheet({ v, index, total, sources }: { v: Variant; index: number; total: number; sources: Source[] }) {
  return (
    <article className="sheet stamp-in">
      <header className="title-block" aria-label="Sheet title block">
        <div className="tb-cell tb-name">
          <span className="tb-label">variant</span>
          <h3>{v.name}</h3>
        </div>
        <div className="tb-cell">
          <span className="tb-label">profile</span>
          <span className={`badge badge-${index}`}>{v.profile}</span>
        </div>
        <div className="tb-cell">
          <span className="tb-label">sheet</span>
          <span className="tb-mono">{index + 1} / {total}</span>
        </div>
        <div className="tb-cell">
          <span className="tb-label">drawn by</span>
          <span className="tb-mono">Scout · Analyst · Architect</span>
        </div>
      </header>

      <p className="tagline">{v.tagline}</p>
      <p className="summary">{v.summary}</p>

      <MermaidDiagram code={v.mermaid} />

      <h4 className="sec-label">Components — every block cites its source</h4>
      <ul className="components">
        {v.components.map((c) => (
          <li key={c.name}>
            <div>
              <strong>{c.name}</strong> — {c.role}
            </div>
            <div className="chip-row">
              {c.sourceIds.map((id) => <SourceChip key={id} id={id} sources={sources} />)}
            </div>
          </li>
        ))}
      </ul>

      <div className="risk-grid">
        <div>
          <h4 className="sec-label">Known risks</h4>
          <p>{v.risks}</p>
        </div>
        <div>
          <h4 className="sec-label">Choose this when</h4>
          <p>{v.whenToChoose}</p>
        </div>
      </div>
    </article>
  );
}

export default function Results({ result }: { result: RunResult }) {
  const tabs = [...result.variants.map((v) => v.name), 'Compare', 'Sources'];
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [result]);

  return (
    <section className="results" aria-live="polite">
      <div className="tabbar" role="tablist" aria-label="Architecture results">
        {tabs.map((t, i) => (
          <button
            key={t}
            role="tab"
            aria-selected={active === i}
            className={active === i ? 'tab tab-on' : 'tab'}
            onClick={() => setActive(i)}
          >
            {i < result.variants.length ? `${String(i + 1).padStart(2, '0')} ${t}` : t}
          </button>
        ))}
      </div>

      {active < result.variants.length && (
        <VariantSheet
          v={result.variants[active]}
          index={active}
          total={result.variants.length}
          sources={result.sources}
        />
      )}

      {active === result.variants.length && (
        <div className="sheet stamp-in">
          <h3 className="compare-title">Trade-offs — {result.variants.length} designs side by side</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Criterion</th>
                  {result.variants.map((v) => <th scope="col" key={v.id}>{v.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.comparison.map((row) => (
                  <tr key={row.criterion}>
                    <th scope="row">{row.criterion}</th>
                    {row.values.map((val, i) => <td key={i}>{val}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {active === tabs.length - 1 && (
        <div className="sheet stamp-in">
          <h3 className="compare-title">Sources — everything above links back here</h3>
          <ul className="source-list">
            {result.sources.map((s) => (
              <li key={s.id}>
                <span className="chip">{s.id}</span>
                <div>
                  <a href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                  <span className="src-meta">{s.origin}{s.meta ? ` · ${s.meta}` : ''}</span>
                  <p>{s.snippet.length > 220 ? s.snippet.slice(0, 220) + '…' : s.snippet}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
