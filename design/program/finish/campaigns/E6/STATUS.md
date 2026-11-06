<!-- LIFETIME: CAMPAIGN -->
# E6 — STATUS

**Lane 3 RENDERER.** Updated 2026-11-06.

## What is landed (this session)

| Piece | Where | Behaviour |
|---|---|---|
| One residency manager | `src/render/residencyManager.js` (new) | Owns `requested → uploading (budgeted) → compiled → visible` for every drawable. Answers one question per presented draw: is this drawable's geometry resident? |
| Per-draw residency gate | `src/render/bloom.js` (`unreadyDrawGuard`) | Every presented draw is gated, for entity leaves **and** VFX/tether/prop roots. A stamped geometry draws with one property read; an unstamped geometry ≤ 32 KB uploads inline and is stamped by its own draw; anything larger is held invisible and uploaded off-screen. Circuit: `visibleUnready`. |
| The compiled gate is armed for every presented pass | `src/render/bloom.js` | The scene **walk** still skips at settle (M2's measured win), but the per-draw compiled check runs on every presented draw. A new material on an existing object — which changes neither the program count nor the scene-child count — can no longer link inside a drawn frame. |
| Budgeted off-screen upload lane | `renderer.js` (`_scheduleResidencyDrain`, `prepareStartupGeometryResidency`) | Held drawables drain on a 200 ms background task through the residency pass the warm roots already use mid-flight. One batch per call, 4 Hz ceiling, never inside a presented frame. |
| Predictive pre-admission | `renderer.js` (`entityPredictedOnDeadlineGlass`, `entityIsOnDeadlineGlassScan`, `meshBuildQueueHasDeadlineWork`) | "Deadline glass" now means *on the glass now or inside the 2 s approach horizon*. Uses the existing approach-aware `entityTimeToGlassSeconds` query, so there is one predictor, not two. |
| Bind-time pre-admission | `renderer.js` (`_bindPresentationMesh`) | A freshly bound root whose buffers have never reached the GPU is held before it is ever submitted and released when the off-screen lane has stamped the whole subtree. A rebind of a live root is never held (that would blank a body already on screen). |
| Submit gate honours the hold | `entityMeshVisibility.js` | `residencyHeld` is a fail-closed submit reason, so entity samplers and the draw path agree that "visible" means "has resident data". Protected roots (player, forceRender, neverCull) are exempt. |
| Bounded fail-open | `bloom.js` (`COMPILE_REFUSAL_FAIL_OPEN`) | After 90 consecutive presented refusals a draw proceeds and `renderer.__sfCompileFailOpen` counts it, so a broken admission lane cannot hide a body forever, silently. |
| No forced off-screen admission | `renderer.js` (`_drainMeshBuildQueue`, both gates) | The skip-count release (`shouldStartHeavyAdmissionEventually`) is only honoured when the queue actually holds deadline work. A body parked off-screen no longer buys a heavy build inside a frame the player is watching. |
| Counters | `state.render.residency` (published ~2 Hz) | `visibleUnready` (drawables held again **after** they had been presented — the blink class; must be 0), `preAdmittedHolds` (held before first presentation — pre-admission working), `heldDraws`, `heldRoots`, `firstResidentDelayP50/P95/Max`, `uploadMs`, `uploadRuns/Failures`, `pending`, `compileFailOpen`. Read from `SF.registry.get('render')._residencyManager.snapshot()`. |

Focused checks: `test/residency-manager.test.mjs` 9/9; `bloom-unready-draw-guard` 22/22;
`presented-draw-detach-pass` 11/11; `bloom-instancing-readiness` 5/5;
`renderer-orientation-resize` 17/17; `renderer-owner-lifetime` 29/29;
`authored-async-liveness` 30/30; `post-opening-pipeline-admission` 18/18;
`frame-solid-glass-priority` 16/16; `entity-mesh-visibility` + `sf-258` + recovery + stand-in 33/33.

## Measured, this laptop, this route

Instrument: `node scripts/probe-frame-solid.mjs` (headed, Intel iGPU, shared checkout — the host
was contended by other agents throughout, so frame *times* are not comparable across runs; the
counters are). Reports: `2026-11-06T16-36-57-957Z` (before), the final after-run in
`.devshots/frame-solid/` (before → after below). **Not a matched A/B**: the before run sampled 877
flight frames, the final run 1,090; both are the same seeded adventure route with 105 entities.

| Counter | Before | After |
|---|---|---|
| shader links inside a drawn frame | 5 | **1** |
| `blinks` | 0 | **0** |
| `stuckMissing` | 100 | **0** |
| `rootSwaps` / `regressions` | 1 / 0 | **0 / 0** |
| `leftUndrawn` | 1 | **0** |
| late episodes (p95) | 7 (2,130 ms) | **5 (249 ms)** |
| `bufferFullUploadsPerFrame` | 6.0 | **5.1** |
| `bufferUploadBytesPerFrame` | 140,584 | **125,862** |
| probe verdict | FAIL | **PASS** |

Residency manager's own verdicts on the final run (printed by the probe since this commit):

```
draws 128,854   resident 128,761   inline 51   heldDraws 42
preAdmittedHolds 36   released 36   visibleUnready 0
pending 0   compileFailOpen 0
```

`visibleUnready` 0 and `preAdmittedHolds` 36 is the shape the campaign asked for: every drawable
that had to wait was held **before** it was first presented, and none was taken off screen after
having been shown.

## Open / not done in this session

1. **One in-frame shader link remains** (down from five). It is a single material whose first use
   beat its admission inside a drawn frame; the queue/fail-open path covers the rest. A
   material-version refusal was implemented and measured: it turned that one link into **123
   fail-opens and visible blinks** on a busy host (admitting a version-changed material costs more
   than the link), so it was reverted. The residual link stays and is named in the probe report.
2. **Upload latency, not correctness:** a held drawable's p95 wait was 14.6 s of wall time on this
   contended host (the off-screen residency pass is sliced and shares the machine with other
   agents). On-glass holds now jump the queue, but a bound-but-off-screen root can still wait
   seconds. The probe saw no missing entity frames, so this is a latency tail, not a hole.
3. **Build-time shader variant enumeration** is not implemented. The measured outcome it was meant
   to produce (no variant links inside a drawn frame) is now 1-of-41 rather than 5-of-30, from
   program canon + admission + the always-armed compiled gate. A separate enumeration manifest is
   not justified by the measurement yet.
4. **Main-thread task > 50 ms** and **allocation ≤ 100 KB/frame**: not measured on a quiet host;
   the render-side frame cost is measured in `campaigns/E7/STATUS.md`.
5. **A deliberate contract change**: the draw guard used to leave a cold *unstamped* material alone
   (it drew and linked in-frame). It now queues every cold material, stamped or not, because the
   surviving in-frame links were exactly the unstamped VFX/plume/ribbon class. The guard test was
   updated with that reason; review it in the E6 commit.
6. **Persistent program cache**: already present and installed (`programBinaryCache.js` →
   IndexedDB, keyed by vendor/renderer/version, 4 MB LRU, written only from completed links). No
   code change was needed; it is not a build-time variant enum.
7. **E7** has its own diagnosis and status; see `campaigns/E7/*`.
