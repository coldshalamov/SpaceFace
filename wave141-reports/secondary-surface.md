# wave141 audit — secondary-surface

Lane: secondary-surface (aux GL contexts' per-frame/per-open cost). Pin: `devin/1791504143-perf-w120` @ `5cd02c8f3203a4bf92c135c250dc20d13d7b3f73`. Read-only; no runtime measurements (launch forbidden), so findings are MECHANISM_VERIFIED or UNVERIFIED, never PERFORMANCE_VERIFIED.

## GL context inventory at pin (complete)

`git grep 'new THREE.WebGLRenderer'`: renderer.js:10265 (main — out of scope), src/ui/shipPreviewMount.js:499, src/ui/orrery/pipSpannerPreview.js:114 (factory-injected), src/ui/asteroid/asteroidRenderer3d.js:1366, src/render/graphicsLab.js:465.
`git grep getContext('webgl2')`: src/render/renderer.js:10259 (main), src/ui/introSignalRemix.js:171, src/ui/loadingTerminalArt.js:1101 + :1340.
`src/render/assetResidency.js:3222` 'webgl2' is an MSAA-layout string token, not a context. livingHullPresentation.js:68 and loadingSignalTableaux.js:388 are 2D contexts only. No WebGPU sites.
uiStage.js:1181's chunked initTexture lane draws on the MAIN renderer (frozen branch), not an aux context — audited for cost anyway since it is presented work.

## Findings

### F1 — shipPreviewMount cadence: event-rendered by contract; only self-looping while rotating — MECHANISM_VERIFIED
`frame()` re-arms rAF only while `rotating || explodedSettling() || nowS < dockAnimUntil` (shipPreviewMount.js:1102-1113); `requestLoop()` refuses while `!active` (:1097-1100). `rotating` defaults true (:585) but every production caller passes `rotating:false` — shipworks.js:1129, stageHull.js:117. A static mount renders only on: show/setYaw/setZoom/rotateBy → renderNow (:1352-1371), ResizeObserver → renderNow (:754-760), authored-asset settle/dock-load completions (:561-563, :829), exploded-focus ease and dock-verb windows (bounded: exploded ease ~decays to 0.005; dockAnimUntil = +2.5s, :1122).
Not every-frame while visible EXCEPT stageHull's own drift rAF (see F2).

### F2 — stageHull drift: the one always-ticking aux surface; bounded but 60Hz — MECHANISM_VERIFIED, 30Hz cap is a remaining quality-preserving lever
stageHull.startDrift() (stageHull.js:132-159) ticks every rAF and calls `mount.rotateBy(dt * 0.06 rad/s)` → `setYaw` → `renderNow` → `renderer.render`. So while a title/new-game/load stage is on top, the preview context draws the full hangar scene (dock interior + hull + 6 lights, DPR≤2, ≤4096 CSS px — shipPreviewMount.js:511,736) once per rAF for the whole dwell.
Occlusion gating is present and layered: per-tick `!canvas.isConnected || clientWidth/Height < 1` → stop + setActive(false) (stageHull.js:146-150); `deactivate()` on onHide for both hosts (newGame.js:1013, saveLoad.js:1743); `release()` force-disposes the mount under the loading shell after STAGE_HULL_RELEASE_MS=900ms (stageHull.js:16,183-188; shell-cover overlap bounded to ~0.9s); mount.releaseGpu() → renderer.forceContextLoss() (:1407-1438). Reduced-motion → single `mount.frame()` (:135-138).
REMAINING LEVER (quality-preserving): the drift is dt-driven, so capping redraws to ~30Hz (as introSignalRemix already does, F8) preserves the exact angular rate and picture while halving presented-thread renders for the title dwell. UNVERIFIED magnitude — worth one measurement: draw calls/fill of hangar+hero hull at stage size.

### F3 — shipworks mount: lazy, non-rotating, interaction-rendered — MECHANISM_VERIFIED
`ensureMount()` creates the context on first `previewShip` only (shipworks.js:964-1043); `mount.show(..., rotating:false)` always (:1129). Every draw is driven by user input (pointer/keys → rotateBy/setYaw → renderNow, :4954-5003) or bounded springs/turn animations. `onHide` → setActive(false) cancels the loop (:5292); screen `dispose()` → mount.dispose() → forceContextLoss (:5308, shipPreviewMount.js:1436). secondaryPreviewWebGlBlocked refuses the context entirely on Intel in-flight (shipPreviewMount.js:61-89, shipworks.js:970-974) with an authored-plate fallback.

### F4 — shipworks lightSaleHull: 13× (render + GL readback) in one task per light-key change — MECHANISM_VERIFIED; UNVERIFIED magnitude, remaining lever
For each of `SALE_SAMPLES` (13 bearings, shipworks.js:2113) it runs `mount.setYaw` (a full renderNow) then `drawImage(webglCanvas→128×128 2D)` + `getImageData` (shipworks.js:2167-2172) — a GL resolve/flush per bearing, ~13 renders + 13 sync readbacks inside one task, fired per `(buyId|R|assetState|clientWidth)` key change (:2153). Bounded per change, not per frame; but each bearing re-renders at full canvas res for a 128px sample. Quality-preserving lever: render bearings into a small offscreen RT/target (or reuse the poster pass) so the 13 passes are ~128px-fill instead of stage-res, and/or amortize across rAF while the poster still covers. First measure: canvas res at sale stage × per-bearing render+resolve ms.

### F5 — pipSpannerPreview: lazy on inspect, event-rendered, capped one-shot poses; the cleanest surface — MECHANISM_VERIFIED
Context created only on first `inspect(offer)` (pipSpannerCrew.js:48-67, pipSpannerPreview.js:113-121, `powerPreference:'low-power'`). `draw()` is called only from resize and from motion steps; `createPipSpannerMotion` plays single poses of 150–650ms via rAF then stops — "a capped one-shot pose, never an idle loop" (:73-110). `setActive(false)` → retirePreview → dispose → forceContextLoss (pipSpannerCrew.js:113-118, preview :167-176). Orthographic camera, 4 lights, no shadows.

### F6 — asteroidRenderer3d: per-frame bloom+shadow render while session active, by design; context retained while hidden — MECHANISM_VERIFIED
The screen's frame loop unconditionally re-arms rAF and calls `renderer3d.render(dt,…)` → `bloom.render(scene,camera)` every frame (asteroidScreen.js:2139-2156, asteroidRenderer3d.js:8791) — "the 3D scene is continuously lit … renders every frame while the screen is up" (asteroidScreen.js:2137). This is a full interactive mining screen (shadow maps enabled PCFSoft :1371-1372, shared bloom :1385, baked envRT :1388): its per-frame cost is its authored presentation, and the loop dies on onHide→stopSession→cancelAnimationFrame (:2284,:2430). One renderer per mounted screen, lazy on session start (:2184-2194), disposed + forceContextLoss on `_cleanup` (:2397-2399, renderer dispose tail :8941+).
NOTE (retention, not presented cost): onHide stops the loop but keeps renderer3d + context + bloom/env/shadow RTs alive until `_cleanup` — a hidden-but-mounted screen still holds the context slot and RT bytes. Whether the screen manager ever holds a mounted-but-hidden screen for long dwell is UNVERIFIED; disposing on hide would trade context-slot retention for a full GLB/env re-admission on next show.

### F7 — uiStage: main-context stage draw; exemplary discipline — MECHANISM_VERIFIED
Draws on the MAIN renderer only inside the frozen branch (uiStage.js:353-428): one `renderer.render(built.scene,built.camera)` per presented frame plus camera-drift math, no per-frame allocs (scratch vectors :54-58). Shadow `autoUpdate=false` for authored scenes — depth bakes once at warm-up (:1055, :1213, warmupStage :1209-1237); live scenes keep dynamic shadows by choice. Single shared customDepthMaterial collapses caster depth programs (:1086-1098). initTexture chunked at 12/yield or rides the renderer's present-sliced residency lane for prewarms (:1165-1185). Idle release after 90 request-free frames (:325,:360); stage shells reused to avoid RT churn (:297-322); renderer state save/restore in finally (:1283-1299). Dead flag `built.shadowsRendered` written, never read (:1276-1278) — hygiene only.

### F8 — introSignalRemix: 30fps-capped, video-frame-driven, intro-lifetime — MECHANISM_VERIFIED
Raw WebGL2 context (:171) overprinting the intro movie: rVFC-driven (rAF fallback), paints capped at SIGNAL_REMIX.fps=30 via nextPaint (:301-316); sculpture texture refresh throttled to 12Hz (:275-285). One bounded pass + blitFramebuffer per paint (:294-297). Runs only while `running` (resume/pause); reduced-motion renders once; destroy()/fail() releases all GL objects (:186-202,344-353). Intro-only lifetime.

### F9 — loadingTerminalArt: worker-thread context; zero main-thread presented cost — MECHANISM_VERIFIED
8×8 OffscreenCanvas preflight validates all 3 programs then `loseContext()`'s in finally (:1096-1133). The real webgl2 context (:1340) lives on a canvas transferred to a WORKER (WORKER_BOOTSTRAP stringifies the factory; :1658-1667) — its rAF never touches the main thread at all. Stops on 'stop'/'destroy' messages (:1631-1641); reduced/labFreeze frames early-return (:1451). Adaptive governor: renderScale steps down when frameCostAvg>11ms, up when <5.5ms (:1476-1481, :1379-1395). Loading-screen lifetime only.

### F10 — graphicsLab: dev-only standalone page; unbounded rAF+bloom+shadow — MECHANISM_VERIFIED, out of shipping path
bootGraphicsLab runs unconditional `requestAnimationFrame(animate)` + `bloom.render` + PCFSoft shadows every frame (:664-683). Host is graphics-lab.html — a separate dev document sharing no presented thread with the game; the fps readout is its purpose. No action needed.

## Answer rollup

(a) rAF-while-visible vs on-demand: pipSpanner + shipworks mount are strictly event-rendered; shipPreviewMount self-loops only under rotating/exploded/dock-verb windows and all callers pin rotating:false; stageHull's drift is the sole 60Hz aux tick (bounded by visibility guards); asteroid renders every frame while its screen is up by design; loadingArt renders on a worker; introRemix at 30fps during intro.
(b) Per-frame cost inside aux loops: bounded — no material recompiles or texture re-uploads in steady state (pipelines pre-compiled via compileScenePipelinesSafely; textures pre-uploaded via chunked initTexture/prewarm lanes). shipPreviewMount's armed upload-audit does 2 scene traverses/frame only until the first clean scan (:1065-1088). Asteroid's steady state is the heaviest (rover/gas/instanced FX + bloom + shadow) but is the presented content itself.
(c) Context count: worst-case concurrent ≈ 7 (main, stageHull, shipworks mount, asteroid, pipSpanner, loadingArt-worker, introRemix) — under the ~16 cap; mounts are lazy except stageHull's `live:true` stage canvas. Retention note at F6.
(d) Offscreen/occluded: covered — isConnected+size guard (stageHull), setActive(false)+dispose on hide (shipworks/pipSpanner), onHide stop (asteroid loop), release() under loading shell (stageHull). A connected-but-covered stage can only tick inside the ≤900ms release window or while a non-screen modal covers it — bounded.
(e) Duplicated machinery: shipPreviewMount uses 5-6 simple lights, no shadowmaps — appropriately minimal; uiStage bakes one shadow map once (autoUpdate=false); asteroid's bloom+envRT+shadow is the screen's own authored picture.

## Verdict

saturated: false — two quality-preserving levers remain, both bounded and worth measuring before implementing:
1. stageHull drift renders at display rate; a 30Hz cap (dt-driven, identical rate) halves the only always-ticking aux surface's presented cost (F2).
2. lightSaleHull's 13× full-res render+readback burst could sample at ~128px via an offscreen target and/or amortize across rAF (F4).
Nothing else in scope has material headroom: every other surface is event-rendered, bounded-window, visibility-gated, worker-thread, or dev-only. Asteroid context retention while hidden (F6) is a memory/slot note, not presented cost.
