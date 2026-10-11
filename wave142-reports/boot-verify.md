# Wave 142 audit — boot lane

- Audited ref: `devin/1791504143-perf-w120` @ `c01b8e2d5` (tip moved past the prompt-pinned `7c123f256`; the delta is the D5/R6 render-latch commit touching `asteroidRenderer3d.js`/`shipPreviewMount.js` — no boot-surface change, so all wave-141 boot work is live at the audited tip).
- Date: 2026-10-11. Method: `git show`/`git grep`/`git ls-tree` against the audit sha; no checkout, no app run.
- `saturated: false`

## Verification of the wave-141 boot package (`7c123f256`, landed)

### N1 — station `as=style` fetch priorities — MECHANISM_VERIFIED (+ one benign inconsistency)

- index.html:70–74 — four of five station-set preloads carry `fetchpriority="low"`: tokens.css (5.7KB), station-orbital.css (72KB), station.css (133KB), station-workbench.css (2.6KB). fh.css (16.9KB, index.html:71) kept at default. The shipped split is therefore 4-of-5 low with **fh.css** as the exception — not "tokens.css + fh.css keep default" as the brief guessed; tokens.css got `low`.
- Deliberate or gap? Structurally benign but inconsistent. tokens.css and fh.css are *both* already fetched as first-paint CSS: statically-linked `styles/kit.css` (index.html:31) `@import`s `../assets/ui/kit/tokens/tokens.css` and `../assets/ui/kit/kit/fh.css` (styles/kit.css:13–14), the same URLs the preloads warm. The `as=style` hints only advance discovery ahead of the kit.css @import chain. fh.css at default matches its first-paint use; tokens.css at `low` is the odd one — but harmless: once the kit.css @import consumer attaches at render-blocking stylesheet priority the in-flight fetch is reprioritized upward, so `low` cannot strand it.
- The bytes that actually needed demotion — the ~205KB dock-only pair (station-orbital + station.css) — all ride `low`. Correct where it counts.

### N2 — draco trio `fetchpriority="low"` — MECHANISM_VERIFIED, dead-payoff confirmed

- index.html:90–92 — draco_wasm_wrapper.js + draco_decoder.js + draco_decoder.wasm (~763KB) all carry `fetchpriority="low"`.
- Dead for shipped content, verified at tip: `KHR_draco_mesh_compression` appears in **zero** of 1246 shipped (non-source) .glb — and zero source GLBs either. src/render/GLTFLoader.js:308 asserts `extensionsRequired` excludes draco/meshopt for ship parts. The shipped compression contract is meshopt (713 GLBs) + KTX2/basisu (650).
- DRACOLoader lazy-fetches the trio only inside `decodeDracoFile` (decoderPath contract): assetLoader.js:1522–1531 attaches the loader at `attachRuntimeDecoders`, but the decoder bytes never fetch without a draco primitive — which shipped assets never contain.
- "Still warm before first decode?": moot for shipped content — there is no first draco decode. A hypothetical user-supplied draco GLB would find the trio already warm or in-flight at low priority.
- Residual: ~763KB of pure low-priority dead bandwidth in the media window. Dropping the three hints entirely is defensible (the runtime would fetch on demand if draco ever appeared); keeping them per the decoder contract is also defensible. Not a bug either way.

### N3 — `warmTranslatedCatalog` 1600→400 + `keyByEnglishMessage` idle tail — MECHANISM_VERIFIED

- gameLocalization.js:195 — `warmTranslatedCatalog(warmQueue[warmIndex], 400)`; pipeline.js:627 honors the parameter (`Math.floor(sliceCount)||1600` guard). Each `setTimeout` task now translates ≤400 rows of the 8682-key English inventory (~22 slices/locale instead of ~6).
- gameLocalization.js:201–203 — the `keyByEnglishMessage` tail (8682-entry sort + Map build) rides `requestIdleCallback`, with `setTimeout(fn, 0)` as the fallback on hosts without rIC.
- Caveats worth noting (not regressions): (a) the **en-US warm entry is unsliced** — `warmTranslatedCatalog('en-US')` calls `buildTranslatedCatalog('en-US')` directly (pipeline.js:632–633), an `Object.assign` over the 8682-key inventory from three sources inside one task (~5–15ms est.); (b) rIC is scheduled with **no `timeout` option** — under sustained load the tail can defer arbitrarily, but any real consumer hits `keyByEnglishMessage()` synchronously through gameLocalization.js:34 anyway, so the worst case is the same one-time sync build as before.

### N8 — shipped-locale filter inside `warmStep`'s first call — MECHANISM_VERIFIED

- gameLocalization.js:184–190 — `WARM_LOCALES_BASE` is plain strings (`startupLocale`, `DEFAULT_LOCALE`, 4 shipped ids) built at eval; the `deferredArray` proxy is **not touched at eval**: `SHIPPED_LANGUAGE_ROWS.map` runs inside `warmStep`'s first invocation, which itself runs inside the picker `setTimeout` (gameLocalization.js:207–209) that already materializes the rows via `.length`. The filter adds a map+filter to an already-materialized array — no new eval-time materialization.
- Starvation check: a shipped `?locale=` pick sits at `WARM_LOCALES_BASE[0]` and survives the filter — warmed first. A non-shipped well-formed pick (`resolveStartupLocale` accepts any `LOCALE_TOKEN_RE` token, gameLocalization.js:92–97) is correctly excluded — there is no shipped catalog to warm for it. Alias picks like `?locale=es` fall out of the queue but resolve to the same `deferredCatalog('es-ES')` (CATALOGS, gameLocalization.js:86–97) that 'es-ES' warms anyway — no dead warm, no starvation.

## Re-verified prior state (B5 / W140)

- deferredObject / deferredArray proxies — pipeline.js:564/593 intact; `build()` runs on first trap access, never at module eval.
- Stub catalogs — es-ES/fr-FR/de-DE/pt-BR remain one-line `deferredCatalog(locale)` proxies.
- en-US.generated.js — MESSAGES_JSON (~863KB) + SOURCES_JSON (~912KB) remain JSON **text**; `messages`/`sources` are `deferredObject(() => Object.freeze(JSON.parse(...)))` (lines 10–11). Eval interns ~1.8MB of string literals only.
- ruckusMeshData.js (3.4MB) — docs stay JSON text, binaries stay base64; parse/decode runs inside `template()` (ruckusModel.js:18–22) behind the `parsedDocs` cache; the post-eval warm decodes one key per `setTimeout` (ruckusModel.js:157–164).
- Station-sheet injection order — unchanged: STATION_STYLES order tokens→fh→orbital→station→workbench inserted after `#sf-deckplate-style` (stationStyles.js:14–46); the five preloads are `rel=preload` fetch hints that apply **no** styles — cascade untouched. `ensureStylesheet()` still runs at boot (main.js:324); `languageOptionsFor(IS_DEV)` still spreads the rows only in dev (gameLocalization.js:71–74, N4 carried).
- Media gate — bootMediaPlayback.js:46–62 settles on 2 presented frames via `requestVideoFrameCallback` (`timeupdate` fallback), 2500ms deadline releases on failure, original-clip fallback on media error, reduced-motion→poster; `yieldForBootPaint` bounded at 50ms (bootScheduler.js:5–24); `bootEntry` still awaits ring+artwork `ready` before `import('../main.js')`. Boot video `preload="none" fetchpriority="high"` (index.html:2072–2074); the mp4 fetch starts at `selectSource`→`video.load()` inside the gate.
- Screen registration — uiRoot.js:1596–1615: BOOT_SCREEN_EXPORTS registers first, the deferred wave batches 3 modules per `yieldPresentationFrame()` — never gates interaction.

## New findings (ranked)

1. **modelTruthCensus.json — ~2.1MB `with { type: 'json' }` parse inside the eval task.** src/data/modelTruth.js:4 statically imports the census as a JSON module; JSON modules evaluate (i.e. `JSON.parse` the full 215-row document) inside the atomic post-gate eval cascade — an est. 20–40ms synchronous parse, currently the single biggest parse left in that task. Touched this morning in `900bf0900` (wave137+138). modelTruth is consumed via partsLibrary/coreSystem/combat-graph for collider truth — none of it needed for the title/magic frame (the world builds on `game:new`). The en-US.generated pattern applies directly: ship the census as a JS text export + `deferredObject(() => JSON.parse(CENSUS_JSON))`, keep `ROWS`/`BY_ID` derived on first access, optionally add a warm slice. Impact: pulls the largest remaining parse out of eval entirely; risk low — every consumer already routes through modelTruth.js (one seam). Effort: M.
2. **ruckus warm granularity — one whole `template()` per task.** ruckusModel.js:160–164 decodes one full asset per `setTimeout`: body0 ≈ 1.77MB base64 (`atob` + a ~1.33M-iteration `charCodeAt` copy) + 24KB `JSON.parse` + typed-array fill + BufferGeometry build ≈ est. 15–40ms inside one task in the post-eval window (body1/core add ~10–20ms each). Fix shape: slice inside `template()` (chunked binary decode, incremental accessor fill) or yield between sub-steps for the warm path only — `template()`'s sync contract for real consumers stays. Impact: low-medium; effort: M.
3. **Media-window bandwidth — verified clean.** ~1945 fetch hints in index.html, all `low` except bootEntry (`high`), fonts, poster, and the statically-linked sheets; the 11.8MB boot mp4 rides `fetchpriority="high"` and dominates the warming tide as designed (W140-B2). No action.
4. **Cosmetic:** tokens.css@`low` vs fh.css@default is an inconsistent split for two identically-consumed first-paint sheets (both via kit.css @import). Harmless either way — but if the class rule is "first-paint sheets stay at default", tokens.css belongs there too. Effort: trivial.
5. **Carry-over micro:** the en-US warm entry builds a *second* full English catalog into `catalogCache` — an `Object.assign` dupe of the already-materialized `englishMessages` proxy (pipeline.js:538–549). Only fiveLocales/test paths read `catalogCache['en-US']`; the game runtime reads `CATALOGS['en-US']` directly. `warmTranslatedCatalog('en-US')` could materialize the proxy and skip the assign. Effort: trivial; micro.
6. **Note:** `src/localization/barks.js` (~133KB) and `src/data/barks.js` (~114KB) still build their frozen translation/corpus literals eagerly at eval (imported via gameLocalization → accessibility.js → main). Same deferral family as (1) if a future pass wants more eval headroom; smaller than the census.

## Saturated?

No. Finding 1 is material boot-window work — a real ~2.1MB parse still sits inside the atomic eval task and is deferrable through an existing, proven pattern. Finding 2 is a moderate task-size reduction in the same window. The N1/N2/N3/N8 package itself is verified correctly landed; the lane is close to exhausted but not saturated.
