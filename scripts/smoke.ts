// Sandbox smoke test: arXiv parser + Semantic Scholar mapper (offline) + live GitHub search.
import { mapSemanticScholar, parseArxivAtom, searchGithub } from '../services/sources';

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

const repos = await searchGithub('multi agent llm framework', 2);
console.log('GitHub live:', repos.map(r => `${r.title} [${r.meta}] snippet:${r.snippet.slice(0, 60)}...`));
if (repos.length === 0) throw new Error('GitHub search returned nothing');
console.log('SMOKE OK');
