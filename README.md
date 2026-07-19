# Blueprint — idea → cited architecture in a minute

Type a product idea. Three agents do the research sprint for you:
**Scout** queries arXiv + GitHub · **Analyst** extracts what actually works (Gemini structured output) · **Architect** drafts 2–3 variants — Mermaid diagrams, per-component citations, trade-off table.

Built for the Stanford x DeepMind "Build with Google Gemini" hackathon (GDG Stanford, Jul 19 2026). Google AI Studio track: Gemini + Cloud Run.

## Run locally
```
npm i
GEMINI_API_KEY=your_key npm run dev     # http://localhost:5173
npm run typecheck && npm run smoke      # sanity checks
```
In Google AI Studio no key setup is needed — `process.env.API_KEY` is injected (server-side after deploy).

## Deploy as container
The app runs as a single Node container — no key is ever shipped to the browser.

```
npm i && npm run build      # produces ./dist (static SPA, no API key baked in)
GEMINI_API_KEY=your_key npm start
```

- **PORT contract:** `server.mjs` listens on `process.env.PORT` (Cloud Run sets this) or `3000`, host `0.0.0.0`. This fixes Cloud Run's "failed to listen on PORT" — the server binds the port the platform assigns.
- **Key stays server-side:** the built bundle has no key, so `services/gemini.ts` points the Gemini SDK at `/api/genai`. `server.mjs` proxies each `POST /api/genai/<suffix>` to `generativelanguage.googleapis.com/<suffix>`, injecting `GEMINI_API_KEY` (or `API_KEY`) into the `x-goog-api-key` header at request time. The browser never sees the key.
- **Static + SPA:** everything else is served from `./dist` with SPA fallback to `index.html`.

Example container:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
CMD ["npm", "start"]
```
Provide `GEMINI_API_KEY` as a runtime env var / secret (never in the image). Cloud Run injects `PORT` automatically.

## Files
- `App.tsx` — UI shell, pipeline orchestration, agent console, cached-demo playback, Copy-run-JSON
- `components/Results.tsx` — variant sheets (title-block design), Mermaid render + fallback, compare, sources
- `services/gemini.ts` — Scout/Analyst/Architect calls, strict responseSchema
- `services/sources.ts` — arXiv Atom parser, GitHub search + README enrichment, CORS fallback flag
- `constants.ts` — model + prompts + cached demo runs (the demo insurance)
- `RUNBOOK.md` — deploy steps, Sunday timeline for 2 people, contingencies
- `AISTUDIO_PROMPT.md` — bootstrap prompt to recreate the skeleton in Build mode

## Why judges should care
Answers are built only from verifiable sources — every block links out. Not one answer but a compared set: Fast MVP / Scalable / Research-grade, like a panel of architects.
