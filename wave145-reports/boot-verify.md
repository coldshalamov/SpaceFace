# wave145 audit — boot (verify) — streak re-verify #2

Lane: boot (navigation → first interactive frame: index.html priorities, bootEntry, media window, eval tasks, localization warm, first paint). Pin `e06e39dc2a8b45c455218eea780aa6246f1a4734` = `origin/devin/1791504143-perf-w120` tip. New since wave144 pin `2af112763`: `e06e39dc2` (F1 fix — vfx reattach latches, IN SCOPE; snapshotFence finally-restore, BG lane) + `73f4c0901` (BG-1b live-mask restore, outside scope). `9093c6959`/`8c9daef8d` are already ancestors of `2af112763` (not new; outside scope). Read-only; verdicts MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED.

## Asked verifications

### V1 — `e06e39dc2` vfx reattach latches — MECHANISM_VERIFIED (closes wave144 F1)

**Latch shape.** Browser arm of `init()`: `this._volumePoolsPending = true` (vfx.js:1694) set synchronously before `VFX_VOLUME_PAYLOAD_READY.then` is attached (:1695) — no window where the latch is unset but imports in flight. Both continuations clear it (success :1696, failure :1700); failure arm also sets `_volumePoolsFailed = true` (:1701), `console.error`s, and nulls `_scene` (:1703). Node arm (`typeof window === 'undefined'`, :1688-1689) keeps the synchronous `_initPools()` — latches stay `undefined` → falsy → reattach gate passes, matching the sync `packed()`→createRequire path that cannot throw there.

**(a) Pending latch cannot wedge `_initPools` on a slow import — VERIFIED.**
The latch gates ONLY the defensive update-reattach call (vfx.js:12368-12369: `!this._volumePoolsPending && !this._volumePoolsFailed && this.state.render && this.state.render.scene`); the READY continuation's `_initPools` (:1698) is ungated and owns the attach. A slow import therefore defers the reattach lane — `update()` early-returns on `!this._scene` (:12370), the same pre-existing no-scene degrade — while the owner lane attaches once on settle. On settle the microtask clears pending and runs `_initPools` atomically; no `update()` tick can interleave inside it. The never-resolving-import residual (pending stuck true → silent permanent no-pool degrade, no console arm since neither continuation fires) is inherent to `Promise.all` — module fetches error rather than hang in practice — and is strictly better than the pre-fix shape (same early-return but without partial-pool orphans). Not a regression; observation only. `destroy()` during pending is handled: the continuation's `_destroyed === true` guard (:1697) returns without attaching.

**(b) `_subscribeOnce` still reachable post-READY via reattach; subscribe is NOT lost when reattach is gated off during the window — VERIFIED.**
`this._subscribe()` runs unconditionally at the end of `init()` (vfx.js:1737); `this._subs = []` initializes at :1250 and `_subscribeOnce` (:13606) guards `!this._subs.length`. The bus subscription is live before the pending window opens, so gating the reattach lane cannot lose it — `_subscribeOnce` is a no-op defensive guard whenever init ran (it only matters post-`destroy()` where `_subs` is cleared at :1751, and `_destroyed` early-returns update at :12357 first anyway). The gated reattach remains reachable post-READY for the two real fallback cases: (i) `!this.state` at READY fire → continuation returns at :1697 → a later tick with `state.render.scene` present runs `_initPools(); _subscribeOnce()` at :12369; (ii) render.scene arrived after READY → the continuation's `_initPools` early-outs `!scene`→`_scene=null` (:2206) → the reattach lane attaches when the scene appears. Subscribe intact in both.

**(c) Failure arm is the intended degrade — VERIFIED.**
Import rejection: pending→false, `_volumePoolsFailed`→true, one `console.error` (:1702), `_scene`→null (:1703) → `update()` early-returns on `!this._scene` every tick and the reattach stays permanently gated — no retry storm, one logged diagnostic, transient/gas pools degrade to no-op as designed.

**(d) F1 defect closure — VERIFIED.**
The wave144 defect was reattach → `_initPools()` → `_scene` set (:2207) → `createInstancedSpriteBuckets` (:2313) / `createGasSystem` (:2320) → `packed()` throw (densityVolumeData.js:24, gasVolumeData.js:37) mid-build → half-attached pools plus orphaned early scene children when the deferred `.then` re-ran the whole routine. During pending the reattach can no longer reach `_initPools`; the only call sites are the Node init (:1689), the ungated owner continuation (:1698), and the gated reattach (:12369) — all covered. Residual unchanged-by-design: a post-READY `_initPools` throw for a non-payload reason still leaves `_scene` truthy and skips retries (pre-existing shape, not reachable via the payload-miss path anymore).

### V2 — `73f4c0901` + snapshotFence half of `e06e39dc2` — noted, outside scope

Both carry the W144-BG-1/BG-1b consumed-marks restore (finally-covering throw/`.return()`/counter-mismatch exits; write through live `world.packDirty`, not the captured `dirty` alias). BG lane owns the verdict; nothing here touches boot-window payload or media surfaces.

### V3 — sweep: new static eval payload / media-window work since pin `2af112763` — VERIFIED: none

`2af112763..e06e39dc2` touches exactly `src/render/snapshotFence.js` + `src/render/vfx.js` (both modified; zero added/renamed files). No new >200KB module, no base64/RLE literal growth, no media-asset churn. Repo-wide static-import grep at the pin finds no importer of `gasVolumeData/{density,motion}.js`, `densityVolumeData/rle.js`, or `ruckusMeshData/{body0,body1,body2,core}.js` — the wave143 payload splits remain dynamic-only. index.html untouched in range → media window carries the wave144 verdict (boot video `preload="none"`, bootEntry sole `fetchpriority="high"` gate-owner, payload modulepreloads `fetchpriority="low"`).

## Boot surface re-census (ledger — unchanged at pin)

Static-graph >250KB modules: `src/data/modelTruthCensus.generated.js` 2.38MB (ledgered — sync-materialize by design), `src/localization/catalogs/en-US.generated.js` 1.86MB (ledgered), barks pair `src/localization/barks.js` 133,653B + `src/data/barks.js` 121,227B ≈ 248KB (ledgered). Unledgered remainders, both sub-barks-pair: `src/render/casHeaders.generated.js` 195,338B GLSL literal (static via `cas.js` — deferral relocates the intern inside the pre-first-paint window; unactionable) and `src/data/audioRecipes.js` 159,687B tables (gesture-gated; borderline materiality ~1-3ms eval). No new entry to the ledger this wave.

## Verdict

`saturated: true` (streak re-verify #2) — F1 fix verified correct and complete; no new static eval payload or media-window work; ledger unchanged.
