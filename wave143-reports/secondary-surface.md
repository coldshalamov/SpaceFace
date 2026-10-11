# wave143 audit — secondary-surface (re-verify)

Lane: secondary-surface (aux GL/DOM surfaces outside the main presented frame). Pin `c01b8e2d5` → re-verified at `devin/1791504143-perf-w120` tip `9d752aa769f83f1544302be013c1cf4f4d3ac183`. Read-only; findings are MECHANISM_VERIFIED or UNVERIFIED. New commits since pin: `cef2ba2c1`, `3148c56cd`, `d99f98c71` (master merge), `22d3afa0a`, `9fd313153`, `e1e9cc24c`, `a32389628` (self-merge delivering the three W142 commits), `9d752aa76` (doc lines only).

## In-scope file delta since pin

Only `src/ui/asteroid/asteroidScreen.js` changed (+~100 lines, via `c1226a5fc` + `d3144dfb1` inside the `d99f98c71` merge): a dismissible `aw-guide` section (`miningNextStep`), a "Take all" transfer button, `siteDrawerModel` goods widened (recipe outputs + lane stores), drawer/guide focus + keydown guards. **No other in-scope file moved** — shipPreviewMount, asteroidRenderer3d, pipSpannerPreview, graphicsLab, stageHull, saveLoad, shipworks (lightSaleHull), introSignalRemix, loadingTerminalArt, uiStage are all byte-unchanged.

### The guide rides the HUD cadence, not the frame — VERIFIED
`updateGuide()` is invoked from `updateHud()` (:2124, gated `hudElapsed >= 0.15` → ~6.7Hz), `openDrawer`/:1773, drawer close :1793, and the guide toggle :789 — all event/slow-cadence paths. Early-out: `guide.hidden = guideDismissed || !state.drill || drawerTab !== null` (:809-811) returns before any compute. When visible it runs `shortfallMap(site, [CORE_ID,'sm_extractor'])` (:852 — at most 2 `_missingMaterials` calls over tiny cost tables) + `miningNextStep` (progressionGuide.js — bounded early-out chain over machine lists, `planSiteVisit` ≤2×/tick) + `JSON.stringify(guideStep)` signature dedupe — DOM writes only when the step actually changes. Bounded ~µs-scale work at 6.7Hz; not a finding.

`frame()` body is **byte-identical** to the pin (md5-verified 40-line body): `renderer3d.render(dt, now/1000, buildUiFrame())` every rAF while the screen is up, `updateHud` at 150ms, drawer at 500ms, lens on delay/dirty. No new per-frame work entered the loop.

## Asked verifications

### V1 — `cef2ba2c1` snapshotFence Steps-twin fill: no shared machinery — VERIFIED
`packPresentationWorldToFenceSteps` (snapshotFence.js:633-645) moved `dirty.fill(0,0,scan)` inside the counters-match commit branch — a real stale-pose fix (retire-only churn mid-pack used to clear the mask then discard the snapshot, leaving in-window writes masked forever). Consumers of snapshotFence: `src/render/renderer.js`, `src/render/webgpuPresent.js`, `src/core/runtimeWitness.js` only — **zero references in any in-scope file** (`git grep` over all 11 scope files: none). Main-presented-frame machinery only.

The same commit's localization warm chain (phased `warmStep`: englishMessages → keyByEnglishMessage → per-locale localeReadiness → SHIPPED_LANGUAGE_ROWS → 400-row catalog slices) and `e1e9cc24c`'s shared en-US catalog are **boot-path only**: `git grep` for `localizeText|gameLocalization|localization/pipeline|\bt(` across all scope files → zero imports. Aux surfaces use plain strings and don't exist when the warm tasks run. Boundary note for the boot lane, not this one: phase 1 parks `keyByEnglishMessage()` (~86-90ms) in a single `setTimeout` task — intentional (it used to land inside the title-paint task), still a >16ms task in the menu-mount window.

### V2 — `3148c56cd` vendor render guards: aux quad routes still correct — VERIFIED
Two changes inside `WebGLRenderer.render(scene, camera, capturedList)`:
- `scene.updateMatrixWorld()` skipped when `capturedList` is set (vendor/three.module.js:17836) — dead work under the documented no-mutation capture contract (spaceRenderGraph.js:419-425: same scene/camera/epoch, only `overrideMaterial` swaps). Camera `updateMatrixWorld` kept unconditional (:17839, O(1), non-same-camera edge).
- All replay guards normalized `capturedList === undefined` → `!capturedList` (:17861, :17877, :17962, :17985) matching the `if (capturedList)` replay predicate (:17891).

**Aux renderers never pass a capturedList.** The capture/replay API (`renderAndCaptureList`/`renderCapturedList`, vendor:18292-18320) has exactly one consumer: `spaceRenderGraph.render`'s color→AO double-submit (:427-432) — the main presented frame. In-scope call census: `renderer.render(scene, camera)` (shipPreviewMount:1117, pipSpannerPreview:149, asteroidRenderer3d:2222, uiStage:1225/1293) and `bloom.render` (asteroidRenderer3d:2033/8825, graphicsLab:675).

**Quad passes on aux paths**: bloom's mip/composite draws route through `renderQuadScene` (bloom.js:843-846, spaceRenderGraph.js:820-823) → `renderer.renderQuadPass(scene, camera)` on the real renderer. `renderQuadPass` (vendor:18136+) is a separate function untouched by this commit — it keeps its **own** `scene.updateMatrixWorld()` (:18152) plus the full mutable-bookkeeping prelude; the `!capturedList` guards inside `render()` don't reach it. The fallback for mock/alternate renderers — `renderer.render(scene, camera)` — passes `capturedList === undefined` → `!capturedList` true → identical upstream full path including updateMatrixWorld. Both legs verified correct.

**The normalization is a fix, not a risk**: `renderAndCaptureList` nulls `_sfCapturedList` before capturing (:18294) and returns `null` when the capture gate fails. Under the old `=== undefined` guards a `null` capturedList half-guarded — skipped `_projScreenMatrix`/`_frustum` then walked `projectObject` on the stale pair. Now `null` → full normal render. (Also `9d752aa76`'s R7/R8 notes are comment-only; verified diff.)

### V3 — boot deferrals: modelTruth consumers on aux paths — VERIFIED, covered
`22d3afa0a` deferred the ~2.1MB census JSON.parse behind `deferredObject`/`deferredArray` proxies + `byIdMap()` memo. In-scope consumers: `shipPreviewMount.js:17` and `shipworks.js:34` — both call `modelTruthMountFractions(def.id, 'SOCKET_*')` only inside **per-build** preview construction (shipPreviewMount:369/378 fast-LOD root build; shipworks:1882-1896 preview mounts), never per frame. The post-eval `setTimeout(() => void ROWS.length, 0)` warm (modelTruth.js tail) materializes the census at module eval — minutes before any station screen can exist — so aux-path calls are `Map.get` + row scan, not a parse. Worst case (consumer beating the warm) is one synchronous ~2.1MB parse once ever; unreachable on the presented path.

`9fd313153` ruckus template slicing: `template()` keeps the synchronous contract by pumping the shared `pendingTemplates` generator to completion — a consumer mid-warm finishes the same in-flight build rather than duplicating (template:84-97, warm:184-209; post-drain `.done` observed by the warm → clean advance). **Zero scope-file references to ruckusModel** — warm machinery only.

### V4 — `d99f98c71` merge: in-scope blast radius — VERIFIED
Merge resolutions touching scope: asteroidScreen.js only (the guide delta above). Merge resolutions touching my dependency set (bloom.js, post/, partsLibrary.js, assetLoader.js, packageCpuDetach.js, asteroidInteriorPreview.js): none. Master-side dep commits are asteroid DOM-logic only (`siteIndustryPlanner.js`, `buildPalette.js`, `progressionGuide.js` new, `sites.js` balance data) — event/cadence-driven, no GL machinery.

### V5 — anything else newly per-frame? — VERIFIED: no
rAF census on tip: asteroidScreen `frame()` (sole always-on aux GL loop, byte-identical, by design — the interactive screen's authored picture). shipPreviewMount re-arm gate unchanged (:1136 `rotating || explodedSettling() || nowS < dockAnimUntil`; all production callers `rotating:false` — event-rendered, sleeps). stageHull drift: rAF ticks but `mount.rotateBy` only when `now - lastRender >= DRIFT_RENDER_MS` (33.3ms → ≤30Hz) + disconnect/visibility guards (:152-171). pipSpannerPreview: one-shot 150-650ms clips. shipworks rAFs: bounded — 13-bearing sale light step (:2211, verified W141), turnSettle/projection/rail single-shots. graphicsLab: dev-only page. loadingTerminalArt: worker thread. introSignalRemix/uiStage/saveLoad: unchanged since pin. New files since pin (`racingDraftView`, `racingGhostView`, `racingRecognition`, `emergentPayloadPresentation`): no renderer, no rAF — main-scene content nodes and DOM, outside aux scope entirely.

## Verdict

saturated: true. The sole in-scope delta (asteroid guide) rides the existing 150ms HUD cadence with signature-deduped DOM writes and changes nothing in `frame()`. No perf commit touches an in-scope file; each asked-about mechanism verifies clean on the aux paths — snapshotFence/localization/ruckus/modelTruth machinery is boot- or main-frame-only, aux quad routes keep correct fallbacks through `renderQuadPass`/plain `render()`, and the `!capturedList` normalization fixes a real null-capture half-guard on the main graph rather than weakening anything aux surfaces ride. asteroidRenderer3d remains the only always-on aux surface, by design.
