// Sandbox smoke test: arXiv parser + Semantic Scholar mapper + export builders (offline) + live GitHub search.
import { mapSemanticScholar, parseArxivAtom, searchGithub } from '../services/sources';
import { APP_URL, buildAdrMarkdown, buildAgentPrompt } from '../services/export';
import type { RunResult } from '../types';

const SAMPLE = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
<entry><id>http://arxiv.org/abs/2308.08155v2</id><published>2023-08-16T05:09:47Z</published>
<title>AutoGen: Enabling Next-Gen LLM
  Applications via Multi-Agent Conversation</title>
<summary>  AutoGen is an open-source framework that allows developers to build LLM
applications via multiple agents that can converse with each other.
</summary><author><name>Qingyun Wu</name></author><author><name>Gagan Bansal</name></author>
<author><name>Jieyu Zhang</name></author><author><name>Yiran Wu</name></author></entry></feed>`;

const parsed = parseArxivAtom(SAMPLE);
console.log('arXiv parser:', JSON.stringify(parsed[0], null, 1).slice(0, 400));
if (parsed.length !== 1 || !parsed[0].title.startsWith('AutoGen') || !parsed[0].url.includes('https://arxiv.org/abs/2308.08155')) {
  throw new Error('arXiv parser failed');
}
if (!parsed[0].meta?.includes('et al.') || !parsed[0].meta?.includes('2023')) throw new Error('meta failed');

// Semantic Scholar mapper (offline, canned JSON):
// [0] arXiv-backed → arxiv.org URL + origin 'arXiv'; [1] non-arXiv → origin 'Paper' + result url;
// [2] no abstract → skipped.
const S2_SAMPLE = {
  data: [
    { title: 'Attention Is All You Need', abstract: 'We propose the Transformer, based solely on attention mechanisms.', year: 2017, authors: [{ name: 'Ashish Vaswani' }, { name: 'Noam Shazeer' }, { name: 'Niki Parmar' }, { name: 'Jakob Uszkoreit' }], externalIds: { ArXiv: '1706.03762', DOI: '10.x/att' }, url: 'https://www.semanticscholar.org/paper/abc' },
    { title: 'A Non-arXiv Study', abstract: 'A journal-only study of distributed systems.', year: 2020, authors: [{ name: 'Jane Doe' }], externalIds: { DOI: '10.y/z' }, url: 'https://example.org/paper/2' },
    { title: 'No Abstract Here', abstract: null, year: 2019, authors: [{ name: 'Anon' }], externalIds: {}, url: 'https://example.org/3' },
  ],
};
const mapped = mapSemanticScholar(S2_SAMPLE);
console.log('S2 mapper:', mapped.map((m) => `${m.origin}|${m.url}`));
if (mapped.length !== 2) throw new Error(`S2 mapper: expected 2 mapped (abstract-less skipped), got ${mapped.length}`);
if (mapped[0].origin !== 'arXiv' || mapped[0].url !== 'https://arxiv.org/abs/1706.03762') throw new Error('S2 mapper: arXiv normalization failed');
if (!mapped[0].meta?.includes('et al.') || !mapped[0].meta?.includes('2017')) throw new Error('S2 mapper: meta failed');
if (mapped[1].origin !== 'Paper' || mapped[1].url !== 'https://example.org/paper/2') throw new Error('S2 mapper: non-arXiv fallback failed');
if (mapped.some((m) => !m.snippet)) throw new Error('S2 mapper: empty snippet');

// Export builders (offline, canned RunResult).
const CANNED_RUN: RunResult = {
  topic: 'realtime collaborative whiteboard',
  constraints: ['Must work fully offline', 'No vector database'],
  sources: [
    { id: 's1', kind: 'paper', title: 'CRDTs: An Overview', url: 'https://arxiv.org/abs/1805.06358', origin: 'arXiv', snippet: 'Convergent replicated data types.', meta: '2018' },
    { id: 's2', kind: 'repo', title: 'excalidraw/excalidraw', url: 'https://github.com/excalidraw/excalidraw', origin: 'GitHub', snippet: 'Virtual whiteboard.', meta: '★ 80k' },
  ],
  insights: [],
  variants: [
    { id: 'v1', name: 'Sync-First MVP', profile: 'Fast MVP', tagline: 'Ship quick.', summary: 'A quick build.', mermaid: 'flowchart TD\nA["User"] --> B["Server"]', components: [{ name: 'Sync Server', role: 'state sync', sourceIds: ['s2'] }], risks: 'latency', whenToChoose: 'speed' },
    { id: 'v2', name: 'CRDT Core', profile: 'Scalable', tagline: 'Converge locally.', summary: 'CRDT based.', mermaid: 'flowchart TD\nA["Client"] --> B["CRDT"]', components: [{ name: 'CRDT Engine', role: 'merge edits', sourceIds: ['s1'] }], risks: 'complexity', whenToChoose: 'scale' },
  ],
  comparison: [
    { criterion: 'Time to MVP', values: ['days', 'weeks'] },
    { criterion: 'Rough monthly cost (cloud + LLM)', values: ['~$20/mo', '~$200/mo'] },
  ],
};

const adr = buildAdrMarkdown(CANNED_RUN);
if (!adr.includes('```mermaid')) throw new Error('ADR: missing mermaid block');
if (!adr.includes('Rough monthly cost (cloud + LLM)')) throw new Error('ADR: missing cost-row criterion');
for (const s of CANNED_RUN.sources) if (!adr.includes(s.url)) throw new Error(`ADR: missing source url ${s.url}`);
if (!adr.includes(APP_URL)) throw new Error('ADR: missing footer app link');
console.log('ADR export: mermaid + cost row + all source urls + footer link ✓');

const prompt = buildAgentPrompt(CANNED_RUN, 1);
if (!prompt.includes('CRDT Core')) throw new Error('agent prompt: missing chosen variant name');
if (!prompt.includes('No vector database')) throw new Error('agent prompt: missing constraint');
console.log('Agent prompt: chosen variant + constraint ✓');

const repos = await searchGithub('multi agent llm framework', 2);
console.log('GitHub live:', repos.map(r => `${r.title} [${r.meta}] snippet:${r.snippet.slice(0, 60)}...`));
if (repos.length === 0) throw new Error('GitHub search returned nothing');
console.log('SMOKE OK');
