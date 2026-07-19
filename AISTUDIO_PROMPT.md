# AI Studio bootstrap prompt (paste into Build mode)

Use this to generate the skeleton in AI Studio, then paste this repo's files over it (order: metadata.json, index.html, types.ts, constants.ts, services/sources.ts, services/gemini.ts, components/Results.tsx, App.tsx, index.tsx).

---

Build "Blueprint" — a React + TypeScript app that turns a product idea into cited architecture options.

Layout: a header, one text input ("Describe the product you want to build") with a "Draft it" button and two demo chips; below, a two-column area: left = a live agent console log, right = results.

Pipeline (three staged Gemini calls with responseSchema JSON):
1. Scout: from the idea, generate 2 arXiv keyword queries + 2 GitHub queries; then fetch https://export.arxiv.org/api/query (parse Atom XML) and https://api.github.com/search/repositories, cap 7 sources total.
2. Analyst: one batched Gemini call extracting per source: architecture, algorithmOrMath, limitations, metrics, relevance.
3. Architect: one Gemini call producing 2-3 variants (Fast MVP / Scalable / Research-grade), each with name, tagline, summary, a Mermaid flowchart TD (quoted labels, max 12 nodes), components citing sourceIds, risks, whenToChoose — plus a comparison table (criteria rows, values aligned to variants).

Render results as tabs: one "sheet" per variant with an engineering-drawing title block, the Mermaid diagram (mermaid npm package, dark theme, fallback to code on render error), components with clickable source chips, then Compare (table) and Sources tabs. Log every stage to the console panel with agent tags SCT/ANL/ARC. Include cached demo results wired to the chips so the demo works without API calls. Use process.env.API_KEY via @google/genai. Dark blueprint aesthetic: deep blue #0E1D33, cyan ink #5FD4F5, IBM Plex Mono labels, fine grid background.
