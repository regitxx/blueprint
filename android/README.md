# Blueprint — Native Android

A native **Kotlin + Jetpack Compose** rebuild of Blueprint: type a product idea and three
agents (Scout · Analyst · Architect) run a live research sprint over arXiv + GitHub and return
2–3 cited architecture variants with diagrams, a trade-off table, and tappable sources.

This lives **alongside** the web app (repo root) — the web version is still deployed on Google
AI Studio and is unaffected. The last-known-good web build is preserved on the `web-backup`
branch and the `web-working-v1` tag.

## Run it

**Google AI Studio (Android):** import the repo and open the `android/` project in the Android
build/preview — the emulator runs it directly.

**Android Studio:** open the `android/` folder, let Gradle sync, then Run on a device/emulator
(minSdk 26 / Android 8.0+).

**CLI:**
```bash
cd android
./gradlew assembleDebug      # build the APK
./gradlew installDebug       # install on a connected device/emulator
```

## Gemini API key

The app works in **demo mode** with no key (a seeded sample run so every screen is navigable).
For live research, provide a key one of two ways:

- **In-app:** Settings → paste your key (stored encrypted on-device via EncryptedSharedPreferences).
- **Build-time:** put `GEMINI_API_KEY=...` in `android/local.properties` (gitignored) — see
  `local.properties.example`. A runtime key always overrides the build-time one.

Get a key at https://aistudio.google.com/apikey. Model defaults to `gemini-3.5-flash`.

## Structure

```
app/src/main/java/com/blueprint/
  model/Models.kt        data contracts, mirror of the web app's types.ts
  data/Prompts.kt        agent system prompts (verbatim from constants.ts)
  data/SeedData.kt       cached sample run for demo mode
  net/GeminiClient.kt    Gemini REST (generateContent, JSON mode)
  net/Sources.kt         live arXiv + GitHub search rails
  pipeline/Pipeline.kt   Scout → Sources → Analyst → Architect (+ refine), streamed
  settings/KeyStore.kt   encrypted on-device key storage
  ui/…                   Compose screens: Home, Run console, Results pager, Settings
  MainViewModel.kt       state + orchestration
  MainActivity.kt        navigation host
```

## Notes / limitations

- Mermaid diagrams render in a `WebView` via mermaid from a CDN, so the diagram needs network
  (the run itself already does). Diagram source is part of each variant.
- The interpreter/reader/cartographer agents (vague-idea disambiguation, doc upload, repo
  reverse-engineering) exist in the web app; this first native cut ships the core idea→blueprint
  path and can grow those next.
