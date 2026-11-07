# E1 - The playout buffer: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done
- Diagnosis memo committed (2026-11-06). Cause chain verified in code: presented clock chased the
  newest snapshot with a 100 ms extrapolation cap then held; only 2 comparable packs existed; the
  correction was a 4-frame catch-up leap. Journal records + packs already carry sim timestamps.
- **Stall-injection harness (BEFORE the playout change):** `?simStall=<csv cycle>` — the browser
  worker blocks its event loop for the requested ms per local-clock tick (Atomics.wait; busy-loop
  fallback). Flag parse + bounds tested; stall counters ride `clockDiagnostics`
  (`stallApplications`, `stallTotalMs`).
- **Presentation-side gap harness (NEW):** `?simGap=<ms>[@<atMs>[@<periodMs>]]` withholds
  COMPLETED PACKS from the fence for the requested wall time while the worker keeps simulating.
  It is independent of the worker work budget, so the fence sees a true 400 ms sim-time gap. The
  Node scenario proves 0 held frames, no rewind, max jump ratio <= 2 at 60 fps, and a re-seated
  lead p50 inside [33,100] ms.
- **BEFORE trace recorded on this laptop** (2026-11-06, Browser pane visible, dev server, new
  game → flight at ~195 wu/s, cycle 60,60,60,400):
  `evidence/before-stall-trace.json` (1800 frames, 1890 replies).
  - Longest held-pose streak while moving: **26 frames** (~430 ms), under the old
    `2 * bodySpeed * frameDt` bar.
  - Frames violating that old max-jump bar: **78** (worst ratio 2.0).
  - Worker reply work p50 21.8 / p95 35.9 / **max 698 ms**; reply interval p50 102.4 ms,
    p95 451.4 ms, **max 5927.1 ms**.
  - The presented clock read 60 ms behind the newest pack with depth 1 pack — zero tolerance for
    exactly this arrival jitter.
- **Playout buffer implemented in `src/render/snapshotFence.js`** (the agreed pose-writer
  interface; renderer callers unchanged):
  - History ring 3 → **18 packs** (~300 ms at pack-per-tick); pack cost unchanged.
  - Presented clock plays at `newestPack − playoutDelay` (adaptive **33–100 ms**, start 50 ms).
    The delay target prices the TROUGH of the applied lead since the previous commit (not the
    headroom at landing time) and moves in bounded steps in both directions; a trough below the
    33 ms floor grows it, a comfortable trough above 55 ms eases it down.
  - **Symmetric bounded rate servo:** phase error relative to the delayed target speeds the clock
    up (to 1.2× the measured sim rate) when behind and slows it down (to 0.8×) when ahead. It never
    rewinds. The measured sim rate is accumulated over **1 s** of presented frames and seeded from
    the first real interval after a reset, so a 0.5× worker does not play at 1× for a full window.
  - Runway modulation: as history + the extrapolation window drain, the clock slows toward 0.15×
    so a deep stall reads as brief slow motion. This is what lets a true 400 ms gap ride out with
    zero held frames.
  - Interpolation between the history packs bracketing the presented moment; extrapolation
    ≤ **150 ms** past the newest sample along per-row velocity. The old absolute 40 wu guard is
    replaced by a guard on the pair's OWN hop (a single-pack hop > 40 wu per tick of its own span
    is a teleport; overshoot CLAMPS to 12 hops instead of resetting t to 1), so a 390 wu/s hull no
    longer snaps backwards at the window boundary.
  - **Bracket epoch is the newest pack's epoch.** `resolvePresentedBracket` filters the whole
    ordered ring to that epoch and serves the oldest same-epoch pack at alpha 0 when the clock is
    behind it. The old-sector pair can no longer be served for the 2–3 frames after a sector
    transition, including a same-slot relocation with a generation-preserving body.
  - `latestSnapshot()/previousSnapshot()` serve the PRESENTED bracket (the pose-apply contract is
    unchanged for the renderer); `newestSnapshot()` serves the pack writers.
  - `presentedPose(entityId)` is the ONE presentation-space pose service (position + heading +
    validity). `presentedRowPose` (recorder) and `src/render/presentedAnchor.js` (tether,
    Massline, mining/tow beams, trail/wake and status VFX anchors) both read it; the old
    prevPos→pos newest-tick blend is only the no-fence fallback. The recorder's path scans the
    entityId column for a stale fast pack instead of rebuilding the ~150-entry identity Map every
    presented frame.
  - `getPlayoutDiagnostics()` reports the signed `leadMs`, `bracketDepthPacks`, `historyPacks`,
    `historySpanMs`, `playoutConfiguredMs`, `playoutTargetMs`/`playoutDelayMs`, `playbackRate`,
    `poseEpoch`, and dry events.
- Tests (real counts from this checkout):
  - `test/snapshot-fence-playout-buffer.test.mjs` **11/11**: late burst, presented accessors,
    delay grow/shrink, 300-frame 60 Hz reserve (delay in [33,100], bracket depth >= 2), 390 wu/s
    boost + 500 ms silence (no rewind, no freeze), 4-tick coalesced pack under the 2× bar,
    124 ms pack cadence at 60 fps / 1×, true 400 ms gap, anchor service, stale-index scan,
    same-epoch respawn.
  - `test/snapshot-fence-pose-epoch.test.mjs` **6/6**: interpolation, epoch boundary, epoch lift,
    unstamped default, two frames after a sector transition, recycled-generation behavior.
  - `test/snapshot-fence-span-alpha.test.mjs` **10/10**: span alpha, precise rewind re-seat,
    silence continuity, teleport guard.
  - `test/frame-truth.test.mjs` **7/7**; `test/weapon-ribbon-frame-truth.test.mjs` **2/2**;
    `test/sim-lane-stall-confirmation.test.mjs` **10/10**;
    `test/persistence-architecture-poles.test.mjs` **14/14** (ring depth derived from
    `SNAPSHOT_FENCE_BUFFERS`); `test/presentation-runner.test.mjs` **17/17**. The focused
    E1/E10 cohort (those eight files) is **77/77**.
  - Transport-named cohort **18/19**: the one red test
    (`vfx-particle-transport.test.mjs` "environment snapshots never invent contacts outside the
    surface footprint") creates no fence and exercises the unchanged legacy anchor path; it is a
    pre-existing environment-contact failure in this shared checkout, not this change.

## Next
1. Re-record the browser evidence at a controlled 1× sim rate (not the 0.1× / 8–20 fps conditions
   in the current traces) with the new trace fields (`playbackRate`, `timeScale`, `poseEpoch`).
   The Node tests prove the contracts; the recorded browser runs do not.
2. Renderer owner: a per-slot presented-sample token so a body that stops while the clock is ~3
   ticks behind is re-posed on the presented sample. The fence now exposes the sample; the render
   walk still gates on sim dirty bits (renderer.js is owned by E6 in this checkout).
3. Renderer owner: bump the pose epoch on `player:respawn` and `dock:undocked` as belt-and-braces
   on top of the now-any-alpha teleport guard.
4. Lane 2's E2 profiler export feeds E10's per-system columns.

### Deferred (not claimed)
- Target smoothing: the delayed target follows the newest pack's sim time directly; the 1.2×
  rate cap is what keeps a coalesced target step from becoming a pose jump. A separate target
  EMA/PLL was not added.
- Worker-side wall-clock stall schedule: `?simStall` remains a per-tick worker-side block;
  `?simGap` is the wall-clock completed-pack gap, and the sim runs at its normal rate between
  gaps. No browser `simGap` run was recorded.
- The 3 s stale-ACK watchdog, per-slot presented-sample token, and pose-epoch bumps on
  respawn/undock are owner work outside this pass.
- E5 SAB/COOP headers are not touched.

## Verify — NOT re-recorded under the new contract

The current browser traces were recorded before the symmetric servo, the presented-rate jump bar,
and the epoch-filtered bracket. They are retained as the BEFORE/AFTER history but cannot be used to
claim the new bar.

| Metric (spec bar) | BEFORE (`before-stall-trace.json`) | AFTER (`after-stall-trace.json`) | AFTER video window (`after-video-window-trace.json`) |
|---|---|---|---|
| Frame rate | p50 59.1 fps, mean 40.6 fps | p50 20.0 fps, **mean 12.3 fps** | p50 8.6 fps, mean 8.4 fps |
| Sim rate (sim seconds / wall second) | 0.211× | **0.109×** | 0.395× |
| Worker reply interval p50 / p95 / max | 102.4 / 451.4 / 5927.1 ms | **123.6 / 511.4 / 7569.5 ms** | not in the column set |
| Applied lead p50; frames < 10 ms; bracket depth 0 | 0.0 ms; 99 %; 0 % | **15.6 ms; 39 %; 75 %** | 7.5 ms; 53 %; 98 % |
| Max per-frame pose jump | 13.0 wu | 6.1 wu | 21.9 wu |
| Jump violations under the OLD `2·bodySpeed·dt` bar | 78 | 0 | 0 |

- Why the old "0 violations" is not the current bar: at 0.109× sim / 12.3 fps the old bar
  (`2 · 195 wu/s · frameDt`) is ~10× lenient. The new trace records `playbackRate`, and the bar is
  `2 · bodySpeed · playbackRate · timeScale · dt`. The old traces have no `playbackRate` column,
  so they cannot be re-scored; the 6.1 wu / 0-violation figure does not establish the current bar.
- The adaptive delay claim is **not met by the browser evidence**: applied lead p50 15.6 ms,
  39 % of frames below 10 ms, depth 0 in 75 % of frames — exactly the collapse the symmetric servo
  was written to fix. The Node 60 Hz tests now hold the reserve (lead 33–100 ms, bracket depth
  >= 2 over 300 frames; 123 ms pack cadence worst jump ratio 0.613× after warm-up, versus the
  reviewer's 9.57 wu = 2.94× reproduction on the old clock).
- The videos are a separate take from the trace table: `after-video-window-trace.json` is the
  window behind `after-playout-buffer-stalls.mp4` (p50 8.6 fps, 0.395× sim), not a controlled A/B
  against the before take. Do not quote the encoded video frame rate as the run's frame rate.
- A fresh browser capture at 1× sim rate is required before this campaign can claim Verify.

## Evidence
- `evidence/before-stall-trace.json`, `evidence/after-stall-trace.json`,
  `evidence/after-video-window-trace.json`, both videos.
- The kill-switch `?playout=0` remains the in-fence diagnostic seam (production default unchanged).
- No browser before/after under the new servo was recorded; only the Node contracts above.
