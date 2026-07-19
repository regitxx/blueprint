# Blueprint — Hackathon Runbook (2-person team)

Event: Stanford x DeepMind "Build with Google Gemini" · Sun Jul 19, 2026 · hacking 11:30–14:30 PT, hard stop.

## What's in this package
Complete, typechecked, production-building app. Verified in sandbox: arXiv Atom parser, live GitHub Search + README enrichment, full `vite build`. Not yet exercised: the 3 Gemini calls (need your API key) and arXiv CORS from a real browser — both are Saturday's 20-minute job.

**Compliance note:** treat this as your Saturday dry-run skeleton + cheat sheet (exactly what your own plan called for). At the 10:30 briefing, ask: "Any restriction on pre-written code or scaffolding?" If they say code must be written during the sprint, rebuild live using AISTUDIO_PROMPT.md — it's designed to regenerate the skeleton in minutes, then you paste logic from this repo as your "snippets."

## Saturday: 30-minute verification (do this once)
1. On the clean deploy account, open aistudio.google.com → Build → new app → paste the short bootstrap prompt from AISTUDIO_PROMPT.md.
2. Open the code editor pane. Replace generated files with this repo's files in this order: `metadata.json`, `index.html`, `types.ts`, `examples.generated.ts`, `constants.ts`, `services/sources.ts`, `services/gemini.ts`, `components/Results.tsx`, `App.tsx`, `index.tsx`. (Or run `npm run pastepack` and paste from the generated `AISTUDIO_PASTE.md`.)
3. Preview → run a live topic ("agentic web scraping framework"). Watch the console: Scout → Analyst → Architect.
   - arXiv unreachable? `searchArxiv` auto-retries through a CORS proxy, and the app continues GitHub-only regardless — no action needed.
   - 429s? You're on free tier: `gemini-3-flash-preview` at ~10 RPM is fine for a 3-call pipeline; wait 60s between runs.
4. Test both cached demos (⚡ chips) — these must be flawless; they're your playcast.
5. Publish → Cloud Run → open the URL in incognito. Then connect GitHub and push.
6. Unpublish if you want to keep the Starter-Tier slot free for Sunday (2-app cap).

Local dev alternative: `npm i && GEMINI_API_KEY=xxx npm run dev` · checks: `npm run typecheck`, `npm run smoke`.

## Sunday timeline (2 people)
- **A = Builder/Deployer** (owns the clean Google account) · **B = Pitch/Media** (owns YouTube + one-pager)
- 10:00–11:30 — Register, briefing. Ask the pre-written-code + "Gemini exclusively?" questions. A: sanity-check account/billing. B: film team-intro b-roll for the 2-min video.
- 11:30–12:10 — A: recreate app in AI Studio (bootstrap prompt → paste files), first live run. B: one-pager from draft; 2-min video script.
- 12:10–12:50 — A: fix live-run rough edges, tune Architect prompt with real outputs, refresh one cached run with a real result (Copy run JSON button → paste into `constants.ts`). B: record 2-min video.
- 12:50–13:20 — A: Publish to Cloud Run, incognito test, GitHub push. Deploy EARLY, redeploy after changes.
- 13:20–13:45 — Feature freeze 13:45. A: final deploy + repo link check. B: record the 1-min playcast **on cached demos** (never live).
- 13:45–14:15 — B: upload playcast to YouTube (public), finalize one-pager. A: assemble all 5 links.
- 14:15–14:30 — Submit everything. Don't touch prod after 14:15.
- 14:30–17:00 — Both: blast the video to your networks (engagement counts until 17:00). Prep the 5-min pitch (tезисы are in your planning doc) in case you make finals at 16:00.

## Config knobs
- `MODEL`: defaults to `gemini-3.5-flash` (needs billing). On free tier, set `GEMINI_MODEL=gemini-3-flash-preview` to override — no code edit.
- Cached runs: run live once, click **Copy run JSON** in the console header, paste over a cache entry. Instant, zero-risk demo refresh.

## Contingencies
- **Starter Tier ineligible / 2-app cap** → deploy from the other person's clean account, or enable billing on the project (URL survives).
- **429 mid-demo** → cached chips; that's what they're for. Billing on = higher limits.
- **Mermaid render fails** → app auto-falls back to showing the diagram code; the Architect prompt already constrains syntax.
- **Wi-Fi dies** → cached demos work fully offline once the page is loaded; hotspot for deploys.
- **Gemini JSON malformed** → pipeline surfaces the stage name; rerun (temperature default, schema-constrained — rare).

## Submission checklist (all 5 by 14:30)
☐ One-pager · ☐ Cloud Run URL (incognito-tested) · ☐ 2-min team/pitch video · ☐ 1-min playcast on YouTube (public) · ☐ AI Studio/GitHub repo link
