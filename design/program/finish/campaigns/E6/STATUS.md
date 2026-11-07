<!-- LIFETIME: CAMPAIGN -->
# E6 — STATUS

**Lane 3 RENDERER.** Updated 2026-11-06. After-run: 2026-11-07T00:45Z below.

## What is landed (this session)

| Piece | Where | Behaviour |
|---|---|---|
| One residency manager | `src/render/residencyManager.js` (new) | Owns `requested → uploading (budgeted) → compiled → visible` for every drawable. Answers one question per presented draw: is this drawable's geometry resident? |
| Per-draw residency gate | `src/render/bloom.js` (`unreadyDrawGuard`) | Every presented draw is gated, for entity leaves **and** VFX/tether/prop roots. A stamped geometry draws with one property read; an unstamped geometry ≤ 32 KB uploads inline and is stamped by its own draw; anything larger is held invisible and uploaded off-screen. |
| Hold liveness / fail-open | `residencyManager.js` | Every non-progress path retries or releases: upload errors back off (250/500 ms) then fail open after 3 attempts; a full queue spills to `heldUnqueued` and is re-admitted when space frees; a 1.2 s request TTL retries once; a 2 s hold deadline releases even an in-flight hold; a 30 s drain watchdog abandons a hung driver. A released hold sets a one-shot bypass so the next presented draw takes the pre-E6 inline path. Circuits: `failOpenReleases`, `admittedFailOpen`, `expiredRequests`, `expiredRetries`, `uploadRetries`. |
| Budgeted off-screen upload lane | `renderer.js` (`_installResidencyManager`, `_scheduleResidencyDrain`) | Held drawables drain on a 200 ms background task through the residency pass the warm roots already use mid-flight. Single outstanding batch, 6 ms/8-root selection budget, 4 Hz ceiling, never inside a presented frame. Empty geometry uses `includeEmpty: true`, matching the `hasUnresidentGeometry` release census. |
| Bind urgency + teardown | `renderer.js` (`_bindPresentationMesh`, `_unbindPresentationMesh`, `disposeRendererOwnedResources`, `webglcontextlost/restored`) | A bind already on the readable glass or inside the 2 s approach horizon uses the driver's urgent chain; ambient binds do not. Unbind cancels the hold and queue entry before a pooled mesh is reused. Teardown/context loss clears the timer, disposes the manager and releases every hold; restore installs a fresh manager after the whole-scene re-upload. |
| Predictive pre-admission | `renderer.js` (`entityPredictedOnDeadlineGlass`, `entityIsOnDeadlineGlassScan`, `hoistDeadlineGlassMeshBuilds*`) | Ordering/hoisting keeps the 2 s approach horizon. The in-frame heavy-admission gate uses only on-readable-glass work (`entityIsOnInFrameGlassScan`), so approach work no longer buys a late-frame build. |
| Submit gate honours the hold | `entityMeshVisibility.js` | `residencyHeld` is a fail-closed submit reason, so entity samplers and the draw path agree that "visible" means "has resident data". Protected roots (player, forceRender, neverCull) are exempt. |
| Compile wall deadline + fallback | `bloom.js` (`COMPILE_REFUSAL_FAIL_OPEN_MS`, `presentedFallbackMaterial`) | The 90-frame fail-open (~6 s at 15 fps) is now a 1.5 s wall deadline from the first refusal. Every refusal increments `renderer.__sfCompileRefusalCount`; the eventual fail-open has `__sfCompileFailOpen`. An already-drawn object keeps its last proven material (`__sfCompileFallbacks`) while the new material links instead of being blanked. |
| Honest draw-point counters | `bloom.js` + `renderer.js` | `noteRefusedDraw(object, reason)` is called for geometry hold, presented-detach, program refusal, and submit-pending hides. `refusedDraws` counts every refusal; `visibleUnreadyDraws` counts refusals on a drawable that had already been presented. The old `visibleUnready`/`preAdmittedHolds` remain for compatibility. |
| Inline wallet | `residencyManager.js` | The per-frame upload wallet is charged in `noteDrawn` after the draw actually uploads, and a refused draw refunds its admission. A refused effect can no longer starve later ready effects. |
| No forced off-screen admission | `renderer.js` (`_drainMeshBuildQueue`, both gates) | The skip-count release (`shouldStartHeavyAdmissionEventually`) is only honoured when the queue actually holds readable-glass work. A body parked off-screen no longer buys a heavy build inside a frame the player is watching. |
| Counters | `state.render.residency` (published ~2 Hz) | `visibleUnready` (held again **after** presentation; must be 0), `visibleUnreadyDraws` (draw-point refusal of a presented drawable), `refusedDraws`, `preAdmittedHolds`, `heldDraws`, `heldRoots`, `releasedRoots`, `failOpenReleases`, `admittedFailOpen`, `expiredRequests`, `expiredRetries`, `uploadRetries`, `heldUnqueued`, `firstResidentDelayP50/P95/Max`, `uploadMs`, `uploadRuns/Failures`, `pending` (held drawables only — released in-flight uploads are not pending visibility), `compileFailOpen`, `compileRefusals`, `compileFallbacks`, `disposed`. Read from `SF.registry.get('render')._residencyManager.snapshot()`. |

Focused checks (real counts, 2026-11-06): `test/residency-manager.test.mjs` **21/21**;
`bloom-unready-draw-guard` **25/25**; `presented-draw-detach-pass` **11/11**;
`bloom-instancing-readiness` **5/5**; `entity-mesh-visibility` **14/14**;
`sf-258-admission-starvation` **5/5**; `authored-admission-recovery` **13/13**;
`stand-in-resident-submit` **2/2** — **96/96 focused**. Supporting:
`renderer-owner-lifetime` + `authored-async-liveness` + `frame-solid-glass-priority` +
`startup-geometry-residency` **103/103**. `node scripts/check-game-playable.mjs` was run and
**failed** on `CLEAN` (`resolvePoseInto is not defined` in the working tree's
`src/render/snapshotFence.js`, which this change does not touch) and `ASSETS`
(`wholeSimBrowserWorker.js` 503); that is a shared-checkout contamination, not an E6 verdict.

## Measured — one after-run, not a matched A/B

Instrument: `node scripts/probe-frame-solid.mjs` (headed, Intel iGPU). **One** after-run on commit
**`07e20d5f1826`** (the E6 commits `84bfa5`→`a7549b` plus a concurrent Q1 commit on top; the shared
checkout also held unrelated uncommitted sim/UI/snapshot-fence changes while it ran). Route:
adventure, seed 4242, `sector_helios_prime`, worker sim lane, **218 entities**, **1,725 manager
frames**, 76 time-to-appear episodes. There is no same-identity baseline in this run, so it is not a
matched before/after.

| Counter | Value |
|---|---|
| in-frame shader links | **0** |
| `visibleUnready` (held again after presentation) | **3** |
| `refusedDraws` / `visibleUnreadyDraws` | 912 / 848 |
| `heldDraws` / `preAdmittedHolds` | 28 / 23 |
| `heldRoots` / `releasedRoots` | 26 / 26 |
| `failOpenReleases` / `admittedFailOpen` | 22 / 12 |
| `pending` at stop (after the 2 s deadline settle) | **0** |
| `compileRefusals` / `compileFailOpen` / `compileFallbacks` | 39 / 0 / 0 |
| `leftUndrawn` | **5** |
| `blinks` / `stuckMissing` | 3 / 29 |
| frames over 50 ms | 571 of 1,080 sampled frames (contended host) |
| probe verdict | **FAIL** (`leftUndrawn` 5, `visibleUnready` 3) |

The probe's new E6 pass gate requires `visibleUnready === 0`, `inFrameShaderLinks === 0`,
`leftUndrawn === 0` and `pending === 0`. This run met the link and pending clauses, not the blink
or left-undrawn clauses. The same run reported 150 missing frames and 29 stuck-missing entities with
`asset:loading` / `pipelinesPending` reasons, and the independent playable check failed on the
working tree's `snapshotFence` error; the blink/left-undrawn residue is therefore measured on a
contaminated route, not on a clean E6 baseline. It is **not** claimed as a pass.

## Open / not done in this session

1. **Three `visibleUnready` holds remain on this contaminated run** (down from the campaign's
   target of 0, and 0 in the earlier 2026-11-06 clean-tree run). Re-measure on a clean tree before
   treating it as an E6 regression; the route's 150 missing frames and 29 stuck-missing entities
   point at the concurrent `snapshotFence`/pipeline work, not the residency lane.
2. **`leftUndrawn` 5** and **`stuckMissing` 29** on this run are the telemetry half of the same
   contaminated route. The probe now gates them; a clean-tree run is required for the campaign
   verdict.
3. **Texture-version proof is still missing.** The geometry proof is per-geometry; a texture
   version swap remains covered only by the existing detach/rehydrate slot pass. This pass did not
   expand into a texture-version registry (deliberately deferred).
4. **Instance-count proof is diagnostic only.** `object.__sfInstanceResidentCount` is stamped by
   `noteDrawn`/the drain and cleared on unbind, but count growth does **not** hold a draw: enforcing
   it measured 188 `visibleUnready` holds on the 2026-11-07 route, so it was reverted. Revisit only
   with a per-instance upload proof.
5. **One residual in-frame link is not structurally impossible.** This run measured 0; the
   material-version refusal experiment that would guarantee it previously turned the residual link
   into 123 fail-opens and visible blinks, so it stays reverted. The compile gate now fails open on
   a wall deadline instead of a frame count.
6. **Upload latency, not correctness:** the after-run's first-resident p95 was 2,109.8 ms and its
   slowest driver batch was 7,525.7 ms on this contended host. The 2 s hold deadline converts that
   tail into `failOpenReleases`/`admittedFailOpen` (22/12 here) rather than a permanent hole.
7. **Build-time shader variant enumeration** is not implemented; the measured outcome it was meant
   to produce (no variant links inside a drawn frame) is met on this run (0), so a separate
   enumeration manifest is not justified yet.
8. **Main-thread task > 50 ms and allocation ≤ 100 KB/frame: not met/measured as an acceptance bar.**
   This run recorded 571 of 1,080 sampled frames over 50 ms on a contended host shared with other
   agents; that is a real FAIL for the bar, not a quiet-host number, and is retained as not met.
9. **Crucible, sector jump and long soak are not measured in this pass.** The E6 after-run covers
   the adventure route only; no claim is made for those routes.
