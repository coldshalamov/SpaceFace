# wave144 audit — boot (verify)

Lane: boot (navigation → first interactive frame: index.html priorities, bootEntry, media window, eval tasks, localization warm, first paint). Pin `2af112763f4a94dbd111cd110061619557ca0fef` = `origin/devin/1791504143-perf-w120` tip — carries `d775bf662` (ruckusMeshData split), `70a655d8a` (gas/density gates), `34d824293` (repin); none on `origin/master` (`7aac41d27`, merge-base `c3521e379`). Read-only; verdicts MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED.

## Asked verifications

### V1 — `d775bf662` ruckusMeshData split — MECHANISM_VERIFIED

**(a) No static import — VERIFIED.** Repo-wide grep for the payload module paths/basenames at the pin returns only: the dynamic `import()` (ruckusModel.js:221), the createRequire `req()` fallback (ruckusModel.js:30), `modulepreload fetchpriority="low"` links (index.html:111-114 + :1145), manifest/test references, and pack-model.mjs emitters. The surviving static import `ruckusMeshData.js` is now a 5-line `RUCKUS_MESH_KEYS` list (~200B vs ~3.4MB payload). Payload modules are single-line `export default` literals (1797240/765157/374547/465664 B), loaded only via `import()`.

**(b) Cold-consumer proof — VERIFIED.** Sole production mint of `ruckusPart` is `src/systems/ruckus.js:42` (visual dispatch at `visualFactory.js:6020`); `_spawn`/`_syncSteps` fire only under `_live()` = adventure run + home sector + `state.mode==='flight'` + timeScale>0 + player alive — post-title only. Both title routes are warm-gated: `newGameStartTransition.js:45` `await prepareRun()` → `main.js:708` `await ruckusWarmReady` immediately before `bootstrapScene`; `saveSystem.js:370-375` routes restore only through `helpers.deferLoadedGameRestore` → `main.js:239` `Promise.all([nextFrame(), ruckusWarmReady]).then(restore).catch(...)` (the inline `load()` fallback fires only when the helper is absent — Node/test harnesses, where the require path works anyway). Electron renderer: `electron/main.cjs:786-789` `sandbox:true, nodeIntegration:false, contextIsolation:true` → `globalThis.process?.getBuiltinModule` is absent → `coldEntry`'s require fallback is unreachable in the browser by construction; the descriptive throw is the honest browser-cold-read outcome (comments implying an "Electron require() route" are wrong-direction — Electron rides the same gated path). Node 24 `getBuiltinModule('module').createRequire` + `require(esm)` resolves the `export default` modules synchronously — Node/test path works. Mid-warm `template()`: shared `pendingTemplates` iterator means any consumer pump completes the same generator synchronously (ruckusModel.js:103-121); mesh-build lane retries ×3 then `_noMesh` degrade — no fault.

**(c) Failure mode — VERIFIED (fail-stop).** `ruckusWarmReady` is a bare async IIFE (ruckusModel.js:216-244) with no `.catch`; rejection propagates to `await ruckusWarmReady` inside the transition try/catch → fail-stop readiness receipt, and to the restore `.catch` → `save:error`/`load_failed` receipt. Node arm is `Promise.resolve()` — cannot reject. No silent dead-ruckus on either route. Observation only: a payload 404 also emits a boot-window `unhandledrejection` (duplicate diagnostic, harmless).

### V2 — `70a655d8a` gas/density gates — MECHANISM_VERIFIED with one finding

Gates exist as claimed: `GAS_VOLUME_PAYLOAD_READY` (gasVolumeData.js:22-27) and `DENSITY_VOLUME_PAYLOAD_READY` (densityVolumeData.js:11-13) are `Promise.all` of dynamic `import()`s kicked at module eval; `typeof window === 'undefined'` → `Promise.resolve()` keeps the sync Node `packed()`→createRequire path. `_initPools` is deferred at vfx.js:1688-1697 (browser) with a logged degrade arm; `createVfxPrecompileSalvo` awaits both at precompile.js:384.

Decode-consumer census — VERIFIED complete outside one site:

- `decodeDensityFilm` ← `transientVfxMaterials.js:8` ← `instancedSpritePool.js:30` ← `createInstancedSpriteBuckets` ← vfx.js:2306 only.
- `decodeGasFilm` ← `gasVolumeMaterial.js:62-63` ← `buildGasVolumeTextures` ← `createGasSystem` ← vfx.js:2313 (inside `_initPools`) + the gated salvo (vfx.js:~16780, post-await).
- Tests decode directly under Node (sync path works).

**F1 — `vfx.js:12358` reattach path bypasses the gate (repair-class defect).**
`update()` contains `if (!this._scene) { if (state.render && state.render.scene) { this._initPools(); this._subscribeOnce(); } if (!this._scene) return; }` — a synchronous `_initPools()` outside `VFX_VOLUME_PAYLOAD_READY`. `_initPools` has no re-entry guard: `this._scene` is set at :2199, then `_ensureOverflowJets`, `_initEventLights`, `_initRibbonTrails`, `_initMiningBeam` run (scene children added) before `createInstancedSpriteBuckets(...)` at :2306 throws inside `packed()` while payloads are pending. When it fires in the pending window: (i) one quarantined `vfxError` via `renderUpdatePhase.js:115-117`; (ii) `_scene` stays truthy → the reattach branch never retries; (iii) when READY settles, the deferred `.then` re-runs the whole `_initPools` → **duplicate event lights / ribbon trails / mining beam / overflow jets orphaned in the scene** (session-persistent leak); pools self-heal on the second run so no permanent no-gas state. Frequency ≤ once per pending window (first eligible frame latches `_scene`), but the window is real: `bootSystemInit` checkpoints are yields, not awaits, and cold-cache decode is ~50-150ms+ — any frame ticking `vfx.update` during boot/transition can land inside it. `_subscribeOnce` is unaffected (subscriptions install at init :1730 regardless). Fix (effort XS, negligible risk): route the 12358 call behind the same `VFX_VOLUME_PAYLOAD_READY.then(...)`, or latch a `_poolsInit` flag checked by both sites.

### V3 — `34d824293` repin — VERIFIED

Test-fixture scope only: `test/ui-frame-references/budgets.json` uiSourceDigest re-pinned (`5a5eae08…` → `c1e63c04…`); `source-manifest.json` regenerated (+880/−784) now covering the new payload modules (ruckusMeshData/{body0,body1,body2,core}.js, gasVolumeData/{density,motion}.js, densityVolumeData/rle.js). Mechanical regen; no behavioral diff.

### V4 — (f) reintroduced static eval payload — VERIFIED: none

Branch-vs-master scan of added >800-char lines plus a new >200KB file census: only ledgered items (`modelTruthCensus.generated.js` 2.38MB, `en-US.generated.js` 1.86MB) and the dynamic-only payloads above. `gasVolumeData/density.js` and `densityVolumeData/rle.js` use ≤126-char/line concat literals (confirmed multi-line layout; both still dynamic-only — no static importer). No static-graph stowaway.

## Boot surface re-census (post-gate eval + media window)

Static-graph >250KB modules at pin: `modelTruthCensus.generated.js` 2.38MB (ledgered — sync-materialize by design), `en-US.generated.js` 1.86MB (ledgered), barks pair `src/localization/barks.js` + `src/data/barks.js` ~248KB (ledgered); other large modules are code. Unledgered remainders, both below the ledgered barks-pair size class: `src/render/casHeaders.generated.js` 195KB GLSL literal (static via `cas.js:11` — consumed at pipeline setup inside the pre-first-paint window, so deferral relocates rather than removes the intern — unactionable) and `src/data/audioRecipes.js` ~160KB tables (static via `audioSystem.js:19` + `sampleLibrary.js:17` — gesture-gated consumers; dynamic-import-on-gesture could remove ~1-3ms of eval — borderline materiality). Media window clean: boot video `preload="none" fetchpriority="high"` + poster (index.html:2104-2106) — no eager download; only bootEntry keeps `fetchpriority="high"` (index.html:66, deliberate gate-owner); all payload modulepreloads ride `fetchpriority="low"`.

## Verdict

`saturated: true` — no material unledgered payload remains in the post-gate eval or media window; the two unledgered remainders are sub-barks-pair and one (casHeaders) is structurally unactionable.

**Carry-forward (repair, not perf):** F1 (`vfx.js:12358`) — worth one small follow-up commit (gate the reattach behind READY or add a `_poolsInit` latch). Not a boot-time regression; prevents a cold-boot orphan-mesh leak + quarantined-error outcome when a frame tick lands inside the payload-pending window.
