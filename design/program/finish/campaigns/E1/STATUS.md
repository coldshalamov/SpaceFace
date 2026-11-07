# E1 - The playout buffer: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## 2026-11-07 moving captures — Verify NOT MET

Same headed Chromium, real New Game boot, 30 s of flight with `?simGap=400@2500@3500`; the player
holds `W` after launch. The fence kill-switch is the only intended difference.

| Run | Frames | Rate | Gaps | Moving frames | Frames over 2× bar | Worst jump | Worst pose | Held pose |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| BEFORE (`&playout=0`) | 1713 | 1.01× | 19 | 783 | **28** | **14.69×** | **84.5 WU** | **3.08 s** |
| AFTER (fence live) | 1800 | 0.987× | 18 | 946 | **4** | **6.69×** | **21.2 WU** | 0 |

- The buffer closes most of the failure: before has a 3 s held pose and an 84 WU burst; after has no
  held pose and no gap-correlated reset during flight.
- **The four remaining AFTER frames are not gap holds.** Each is an abrupt sim deceleration
  (`playerSpeed` 157→5.6 at t=0.95 s; 25→6.1 at t=11.58 s) while the presented pose still carries
  the earlier 70–82 WU/s motion. The raw bar uses the *current* body speed, so a collision stop makes
  the still-correct presentation look like a jump. No `playoutGapReset` fires in flight.
- **Verify is therefore NOT claimed.** The written bar is raw `2 × bodySpeed × frame time`; it reads
  4 violations. Two honest ways forward: capture steady flight clear of collisions (the current New
  Game spawn is near Helios traffic), or agree that the bar compares against the presented speed
  rather than the post-collision sim speed. The campaign text does not settle that, so it stays open.

Videos are separate takes from the clean traces (`before-gap-video-2026-11-07.mp4`,
`after-gap-video-2026-11-07.mp4`, both with `W` held); the traces above are the acceptance material.

## Done
- Diagnosis memo committed (2026-11-06): the presented clock chased the newest snapshot with a
  100 ms extrapolation cap then held; only 2 comparable packs existed; the correction was a 4-frame
  catch-up leap. Journal records + packs already carry sim timestamps.
- **Stall-injection harness:** `?simStall=<csv cycle>` blocks the worker event loop for the
  requested ms per tick (Atomics.wait; busy-loop fallback); stall counters ride
  `clockDiagnostics` (`stallApplications`, `stallTotalMs`).
- **Presentation-side gap harness:** `?simGap=<ms>[@<atMs>[@<periodMs>]]` withholds COMPLETED
  PACKS from the fence for the requested wall time while the worker keeps simulating. Independent
  of the worker work budget, so the fence sees a true sim-time gap. The counters now also ride the
  frame-truth export as `simGap: { applications, heldFrames }`.
- **Playout buffer in `src/render/snapshotFence.js`** (the agreed pose-writer interface; renderer
  callers unchanged):
  - History ring 3 → **18 packs** (~300 ms at pack-per-tick); pack cost unchanged.
  - **Wall-paced playout timeline.** The target is `estimatedSimNow − playoutDelay`, where
    `estimatedSimNow = newestPack.simTime + presented time since it landed` (scaled by the measured
    playback rate and capped at `delay floor + 150 ms`). The target therefore advances between
    replies instead of sitting on a staircase; the presented clock no longer drains against a
    pack that has not moved. `leadMs` is measured against this wall-paced moment; `packLagMs`
    still reports the raw newest-pack lag.
  - **Delay sized by the observed reply interval, not parked at 100 ms.** The floor is
    `max(33 ms, worst recent pack interval + 15 ms)` and the effective ceiling grows with it
    (`max(100 ms, floor + 30 ms)`). The configured 33–100 ms envelope is reported as
    `playoutConfiguredMs`; the effective values are `playoutDelayFloorMs`/`playoutDelayMaxMs`.
    The documented reserve band is therefore **[33, playoutDelayMaxMs]**: at 60 Hz packs it is the
    configured 33–100 ms, and at a 124 ms cadence the target is ~160 ms and the presented moment
    stays inside history instead of draining to ~19 ms.
  - **Cadence vs silence (final-review fix).** The interval ring learns reply intervals up to
    700 ms (the documented 2–10 Hz worker floor with jitter). A newest-pack delta re-seats only
    beyond `max(350 ms, 2.5 × learned interval)`, so a steady **400/500/600 ms** cadence sizes the
    reserve instead of re-seating on every reply; a coalesced burst of commits between samples is
    treated as backlog, not cadence. A multi-second silence still re-seats
    `presentedTime = newest − playoutDelay`, clears the bracket/rate/phase windows, increments
    `gapResets`, and emits a `playoutGapReset` timeline event. The hidden/occluded-tab arm reads the
    **unclamped** raw frame interval (`presentationRunner` stamps `presentationFrame.rawFrameDt`;
    the renderer forwards it), not the loop-clamped 0.25 s value.
  - **Symmetric bounded rate servo:** phase error against the wall-paced target speeds the clock
    up (to 1.2× the measured sim rate) or slows it (to 0.8×). It never rewinds. The measured sim
    rate is accumulated over 1 s of presented frames and seeded from a short run of replies after
    a reset.
  - **Runway modulation:** as history + the extrapolation window drain, the clock slows toward
    0.15× so a sub-gap stall reads as brief slow motion. Extrapolation is ≤ **150 ms** past the
    newest sample along per-row velocity.
  - **One-tick teleport bar tightened:** 40 wu per sim tick (was `40 + 2400·span` = 80 wu at a
    one-tick span). A 41–80 wu same-tick relocation/respawn now draws the arriving pose; a
    legitimate 39 wu hop still blends. Coalesced packs are allowed 40 wu × their own tick count.
  - **Pair selection fixed:** while a presented sample is active, `previousSnapshot()` returns
    `null` whenever `presentedPair.a < 0`. The old fall-through served the newest
    previous/latest pair — a pack NEWER than the presented latest — so the mesh drew
    `-9619` while `presentedPose` drew `-9629` at a 5-old + 3-new epoch transition.
  - **Bracket epoch is the newest pack's epoch.** `resolvePresentedBracket` filters the ordered
    ring to that epoch and serves the oldest same-epoch pack at alpha 0 when the clock is behind.
    The old-sector pair can no longer be served for the 2–3 frames after a sector transition.
  - **Per-slot presented-sample token** (`presentedSampleToken(slot, entityId)`): a stable hash of
    the presented sample (bracket pose bytes + quantised alpha, static-row stable). The render walk
    re-poses a clean row while the presented sample changes, so a stopping hull finishes its last
    reserve instead of freezing 1–3 presented ticks short; the tether anchor reads the same
    presented pose and lands with it.
  - **Pose epoch bumps on discontinuities:** the renderer raises `_posePackEpoch` on
    `player:respawn` and `dock:undocked` as belt-and-braces over the tightened hop guard.
  - `latestSnapshot()/previousSnapshot()` serve the PRESENTED bracket (pose-apply contract
    unchanged); `newestSnapshot()` serves the pack writers.
  - `presentedPose(entityId, out, slotHint)` is the ONE presentation-space pose service. The
    recorder and `src/render/presentedAnchor.js` both read it. The anchor accepts a slot hint;
    callers without one hit a per-pack direct-mapped probe cache (one entityId scan per entity per
    pack, not per call).
  - `getPlayoutDiagnostics(out)` fills caller-owned scratch (allocation-free live path) and reports
    `leadMs`, `packLagMs`, `bracketDepthPacks`, `historyPacks`, `historySpanMs`,
    `playoutConfiguredMs`, `playoutDelayTargetMs`/`playoutDelayMs`, `playoutDelayFloorMs`/
    `playoutDelayMaxMs`, `playbackRate`, `poseEpoch`, `estimatedSimTimeS`, `packAgeMs`,
    `playoutDryEvents`, `gapResets`, `lastGapReset*`, `presentedScans`.
- Tests (real counts from this checkout):
  - The named E1/E10 cohort (eight files) is **77/77**; with the review file (**13/13**) the
    full E1/E10 set is **90/90**.
  - `test/snapshot-fence-review-fixes.test.mjs` **13/13**: 3 s silence re-seat + <1 s recovery,
    long no-frame re-seat (clamped presented + unclamped raw), 124 ms / 30 s reserve band,
    12.3 fps at 1× and 0.109×, **steady 400/500/600 ms at 60 and 12.3 fps**, **349/351 ms
    knife edge**, stop at 195 and 390 wu/s (hull + anchor within 0.1 wu), 60/41/39 wu one-tick
    hops, new-epoch pair selection, restart re-seat, per-pack scan cache/slot hint, diagnostics
    scratch, static/moving token.
  - `npm run check:smooth-flight` **49/49** (includes the production-path raw-frame-dt test).
    Persistence file alone **13/13** (not 14).
  - `test/frame-truth.test.mjs` **7/7**; `test/weapon-ribbon-frame-truth.test.mjs` **2/2**;
    `test/sim-lane-stall-confirmation.test.mjs` **10/10**;
    `test/presentation-runner.test.mjs` **18/18**; fence files 11/6/10.
- Measured numbers (this pass, exact sub-frame pack timing in the harness):
  - **3 s worker silence + burst:** `gapResets = 1`, gap priced 3000 ms, first post-burst
    `leadMs = 50.0`, recovery frame 0 (<1 s), re-seat jump 546 wu = the 2.8 s of travel not
    already played, no backward pose, every post-re-seat frame < 2× the presented-rate bar.
  - **Steady cadence, 60 fps, 30 s:** 400 ms → lead p50 **421.8**, min 414.4, max 428.1, target
    433 ms, **0** gap resets, worst jump **0.50×**; 500 ms → p50 **521.3**, min 514.4, max 528.2,
    **0** resets, worst **0.50×**; 600 ms → p50 **620.9**, min 614.3, max 628.3, **0** resets,
    worst **0.50×**. No held frames, no extrapolated frames.
  - **Steady cadence, 12.3 fps, 30 s:** 400 ms → p50 **365.0**, min 365.0, max 429.0, **0**
    resets, worst **0.59×**; 500 ms → p50 **461.7**, min 397.1, max 463.8, **0** resets, worst
    **0.51×**; 600 ms → p50 **563.9**, min 531.5, max 580.1, **0** resets, worst **0.60×**.
  - **349/351 ms knife edge,** 60 fps → p50 370.4 / 372.2, **0** resets, worst 0.58× / 0.51×;
    12.3 fps → p50 313.5 / 314.4, **0** resets, worst 0.60× / 0.61×. The old 350 ms fixed
    threshold produced 65 resets at 351 ms and 4.65× jumps.
  - **124 ms replies, 60 fps, 30 s:** lead p50 **145.7 ms**, min 130.9, max 157.7, target 159.0 ms,
    effective max 169.0 ms, **0** extrapolated frames, 0 held frames, worst jump 0.56×, 0 resets.
  - **12.3 fps, 1×, 123 ms replies, 30 s:** lead p50 **86.4 ms**, min 46.4, max 100.8, target
    168.0 ms, **0** extrapolated frames, 0 held frames, 0 resets.
  - **12.3 fps, 0.109×, 123 ms replies, 30 s:** lead p50 **43.6 ms**, min 36.7, max 44.5, **0**
    extrapolated frames, 0 held frames, 0 resets.
- Transport-named cohort: the one red is
  `test/anvil-orchard-forecast-worker-transport.test.mjs` (authoritative `physicsBody` is defined
  where the test expects `undefined`). It creates no fence and exercises the unchanged
  legacy anchor path; pre-existing in this shared checkout, not this change.

## Next
1. Re-record the browser evidence at a controlled 1× sim rate (not the 0.1× / 8–20 fps conditions
   in the current traces) with the new trace fields (`playbackRate`, `timeScale`, `poseEpoch`,
   `leadMs`, `packLagMs`, `gapResets`). The Node contracts are green; the browser 1× run is
   **not proven**.
2. E5 shell headers remain unproven by tests: `vercel.json` and the game server send COOP/COEP and
   the SAB gate is correct, but no test pins the Vercel headers or the `crossOriginIsolated`
   auto-arm; `check-retail-boot.mjs` and `simWorkerHost.mjs` still carry the stale "dev server does
   not send COOP/COEP" comments. Not in this E1/E10 write set.
3. Lane 2's E2 profiler export feeds E10's per-system columns.

### Deferred (not claimed)
- Browser `simGap` run: not recorded.
- The 3 s stale-ACK worker watchdog is worker-owner work, not claimed here.
- E5 SAB/COOP headers: see Next 2.

## Verify — historical traces (superseded by the 2026-11-07 capture)

The current browser traces predate the wall-paced timeline, the cadence-sized delay, the gap
re-seat and the epoch-filtered bracket. They are retained as BEFORE/AFTER history but cannot be
used to claim the new bar.

| Metric (spec bar) | BEFORE (`before-stall-trace.json`) | AFTER (`after-stall-trace.json`) | AFTER video window (`after-video-window-trace.json`) |
|---|---|---|---|
| Frame rate | p50 59.1 fps, mean 40.6 fps | p50 20.0 fps, **mean 12.3 fps** | p50 8.6 fps, mean 8.4 fps |
| Sim rate (sim seconds / wall second) | 0.211× | **0.109×** | 0.395× |
| Worker reply interval p50 / p95 / max | 102.4 / 451.4 / 5927.1 ms | **123.6 / 511.4 / 7569.5 ms** | not in the column set |
| Applied lead p50; frames < 10 ms; bracket depth 0 | 0.0 ms; 99 %; 0 % | **15.6 ms; 39 %; 75 %** | 7.5 ms; 53 %; 98 % |
| Max per-frame pose jump | 13.0 wu | 6.1 wu | 21.9 wu |
| Frames over the OLD `2·bodySpeed·dt` bar | 78 | 0 | 0 |

- **Re-score method (state it, do not say "cannot be re-scored").** The old traces have no
  `playbackRate` column, so derive the run's rate from the committed columns:
  `rate = (simTimeS[last] − simTimeS[0]) / ((wallMs[last] − wallMs[0]) / 1000)` with the loop's
  clamped `frameDtMs`; the bar is `2 · playerSpeed · rate · dt`, and a "violation" is a jump above
  **2× that bar** (the E1 test's 2× jump limit). On `after-stall-trace.json` (rate 0.109×) that is
  **54 frames**, worst **5.62×** the bar. The BEFORE trace (rate 0.211×) is 78 frames under the
  older `2·bodySpeed·dt` bar; re-scored with the same 2× presented-rate rule it is 239 frames,
  worst 9.52×. State the filter with any count — a moving-only filter changes it (156 vs 162 at
  1× of the bar).
- `playbackRate` is **sim-seconds per time-scaled presented second**, not per wall second (rename
  the old "wall" wording); at `timeScale = 0.109` a 16.7 ms frame presents 1.8 ms of sim time.
- The diagnostics field is `playoutDelayTargetMs` (the earlier status said `playoutTargetMs`).
- The adaptive-delay claim is **not met by the browser evidence**: applied lead p50 15.6 ms, 39 %
  of frames below 10 ms, depth 0 in 75 % — the collapse the wall-paced timeline was written to
  fix. The Node tests now hold the reserve at 60 fps, 124 ms replies, 12.3 fps at 1×/0.109×, and
  steady 400/500/600 ms cadence at both frame rates.
- `trace.fence` is **nullable** before the first fence exists. The hotkey export reads the live
  fence, but a trace minted before the renderer creates one carries `fence: null`; do not claim it
  is never null.
- The videos are a separate take from the trace table: `after-video-window-trace.json` is the
  window behind `after-playout-buffer-stalls.mp4` (p50 8.6 fps, 0.395× sim), not a controlled A/B
  against the before take. Do not quote the encoded video frame rate as the run's frame rate.
- A fresh browser capture at 1× sim rate was required before this campaign could claim Verify; the
  2026-11-07 section above is that capture.

## Evidence
- `evidence/before-stall-trace.json`, `evidence/after-stall-trace.json`,
  `evidence/after-video-window-trace.json`, both videos.
- The kill-switch `?playout=0` remains the in-fence diagnostic seam (production default unchanged).
- No browser before/after under the new servo was recorded; only the Node contracts above.
