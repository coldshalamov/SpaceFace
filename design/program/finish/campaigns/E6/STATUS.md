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
| No forced off-screen admission | `renderer.js` (`_drainMeshBuildQueue`, both gates) | The skip-count release (`shouldStartHeavyAdmissionEventually`) is only honoured when the queue actually holds deadline work. A body parked off-screen no longer buys a heavy build inside a frame the player is watching. |
| Counters | `state.render.residency` (published ~2 Hz) | `visibleUnready` (drawables that were on screen before their data existed), `heldDraws`, `heldRoots`, `firstResidentDelayP50/P95/Max`, `uploadMs`, `uploadRuns/Failures`, `pending`. Read from `SF.registry.get('render')._residencyManager.snapshot()`. |

Focused checks: `test/residency-manager.test.mjs` 9/9; `bloom-unready-draw-guard` 22/22;
`presented-draw-detach-pass` 11/11; `bloom-instancing-readiness` 5/5;
`renderer-orientation-resize` 17/17; `renderer-owner-lifetime` 29/29;
`authored-async-liveness` 30/30; `post-opening-pipeline-admission` 18/18;
`frame-solid-glass-priority` 16/16; `entity-mesh-visibility` + `sf-258` + recovery + stand-in 33/33.

## Measured, this laptop, this route

Instrument: `node scripts/probe-frame-solid.mjs` (headed, Intel iGPU, shared checkout — the host
was contended by other agents throughout, so frame *times* are not comparable across runs; the
counters are). Reports: `2026-11-06T16-36-57-957Z` (before), `2026-11-06T17-16-26-534Z` (after).

**Caveat, stated plainly:** the two runs are not a matched A/B. The before run sampled 877 flight
frames with 105 world entities; the after run sampled 160 frames (the route's return leg stalled,
so the ship sat at ~1,900 WU for the last two phases). The counters below are the right signals,
but a matched within-session comparison is still owed.

| Counter | Before | After |
|---|---|---|
| in-flight shader links (inside a drawn frame) | 30 (5) | **8 (0)** |
| `bufferFullUploadsPerFrame` | 6.0 | **2.2** |
| `bufferUploadBytesPerFrame` | 140,584 | **47,473** |
| `stuckMissing` | 100 | **0** |
| `blinks` / `rootSwaps` / `regressions` | 0 / 1 / 0 | **0 / 0 / 0** |
| `leftUndrawn` / late episodes | 1 / 7 (p95 2,130 ms) | **0 / 0** |
| `pipelineHeldRoots` max | 103 | **10** |
| `residencyPending` max | 101 | **6** |
| `upgradePending` max | 70 | **1** |
| probe verdict | FAIL | **PASS** |

Live in-app check (218 entities, flight): 4,962 presented draws, 4,957 resident proof hits,
4 inline uploads, **1 over-budget drawable held and released after 211 ms**, upload lane 2.5 ms,
0 failures, 0 console errors. `visibleUnready` 1 — that body was already on the glass when it was
first held, which is exactly the class predictive pre-admission is meant to drive to zero.

## Evidence limits

- The probe runs above finished before a foreign in-flight edit landed: `src/data/missions.js`
  (Lane 5, uncommitted) imports `./kesslerScaleWorksite.js`, which does not exist on disk or in
  `HEAD`. Any boot-based verification now stalls before flight, so later captures (and the
  `flight-look.mjs` look capture) could not be produced in this session. That is not an E6 defect
  and must not be "fixed" in `missions.js` by Lane 3.
- The look is unchanged by construction (no material, light, camera or geometry was touched), and
  the probe's own draw census and `appear` counters saw the same picture; a judged capture against
  `docs/visual-assets/LOOK.md` is still owed once the tree boots again.

## Open / not done in this session

1. **Shader variant enumeration at build time + persistent program cache**: the mechanisms exist
   (`KHR_parallel_shader_compile` paths, `programBinaryCache.js` installed in `renderer.js`), but
   enumerating *every* authored variant at build time is not implemented. Not started.
2. **`visibleUnready` is not 0 yet**: the counter counts a drawable that became visible before its
   data existed. Closing it needs the queue to pre-resident bodies *before* they reach the glass,
   which the prediction now enables but only for bodies that are in the build queue. Next step:
   feed the residency queue from the predicted set, not only from refused draws.
3. **A matched A/B is owed**: the before/after runs above differ in sample length and world size.
   Rerun both on a quiet host with the same route and compare the same counters.
4. **Main-thread task > 50 ms**: not measured in this session's after-state (the host was
   saturated: 825/877 frames over 50 ms in the baseline, so a long-task claim needs a quiet host).
   The render-side frame cost is measured in `campaigns/E7/STATUS.md` (15.75 ms `drawPreparedFrame`
   + 8.19 ms `prepareFrame` per frame on this host) — that is E7's bar, not E6's, and it is not met.
5. **A deliberate contract change**: the draw guard used to leave a cold *unstamped* material alone
   (it drew and linked in-frame). It now queues every cold material, stamped or not, because the
   surviving in-frame links were exactly the unstamped VFX/plume/ribbon class. The guard test was
   updated with that reason; review it in the E6 commit.
6. **E7** has its own diagnosis and status; see `campaigns/E7/*`.
