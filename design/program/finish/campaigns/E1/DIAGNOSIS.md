# E1 — The playout buffer: diagnosis

## 1. The player-visible problem
In busy scenes the game "freezes": planets keep spinning (they animate on the render clock) while
the ship holds its last pose, then blips to a new place. Loads are long. The freeze-and-blip is
this campaign.

## 2. The measured cause chain (numbers)
- **Worker step cost** (verified, PERFORMANCE_HANDOFF 2026-11-06): worker reply work p50 ~8 ms,
  **p95 58 ms, p99 105 ms, max 458 ms**; coalesced replies reach the screen at **2–10 Hz** in busy
  scenes. Pack cost is ~0.02 ms — the cost is the sim step, not the transport.
- **The presentation has no jitter buffer.** Verified in code this session: the presented clock
  (`snapshotFence.js samplePresentationAlpha`) chases the **newest** snapshot
  (`latest.simTime + accumulator − fixedDt`, catch-up gain 0.25/frame), extrapolates at most
  **100 ms** past it (`PRESENTATION_EXTRAPOLATION_S`), then **holds**. Under a 458 ms stall the
  presented clock sits at the cap for ~350 ms with a moving world and a still ship — exactly the
  reported symptom. Interpolation exists only between the two most recent packs
  (`SNAPSHOT_FENCE_BUFFERS = 3`); there is no history to play out a delay against.
- **The correction after silence is a fast catch-up**, not an eased re-seat: gap closes at 25 % of
  the remaining distance per frame (~4 frames at 60 Hz), so a long stall ends in a visible leap.
- **Transport adds ordering pressure, not latency by design**: ≤ 4 unacked publishes, 3 s
  stale-ACK rebuild, 24 ms work budget turning heavy steps into slow motion (already landed). The
  remaining freeze lives entirely in the presentation's clock, not the wire.
- **Timestamps already exist**: every journal TRANSFORM record carries its `tick` (1/60 s sim
  grid) and both current and previous pose; every pack carries `simTime`. The raw material for a
  delayed, interpolated playout is already on the wire. No worker changes are required for E1
  beyond the stall harness.

## 3. Is the design the bottleneck?
The worker+snapshot architecture is sound and survives this: the fix is to make the presentation
*play back* the past instead of chasing the newest state — the standard netcode answer. What IS
wrong in the current design: (a) the fence keeps only 2 comparable packs (3 buffers) — a playout
delay of 33–100 ms needs ≥ 8–12 packs of history; (b) the presented clock targets "newest", which
by construction has zero tolerance for arrival jitter; (c) correction is a per-frame exponential
with no fixed horizon. Replacing the fence's clock/history is a bounded change (~1 file + small
registry wiring); a rewrite of the transport (SAB triple-buffer, ring ports) would buy nothing for
the freeze — the wire is not the bottleneck (packMs 0.02 ms) — and is E5's concern anyway, for
throughput, not smoothness. Cost of the chosen road: low. Cost of "rip out the worker": weeks and
it would reintroduce main-thread jank the worker lane exists to avoid.

## 4. Chosen road
1. **Harness first** (before any behaviour change): `?simStall=<ms>[,<pattern>]` — the worker host
   sleeps the requested time per tick batch (inside the existing work-budget seam), and the E10
   trace records the "before": per-frame player pose deltas under an identical stall script.
2. **Deep snapshot history**: the fence keeps a bounded ring (~16 packs ≈ 260 ms at pack-per-tick)
   instead of 3 buffers. Pack cost is unchanged (same blit per commit; only the rotation depth
   changes).
3. **Delayed presented clock**: render at `newestPackSimTime − playoutDelay`; delay starts 50 ms,
   adapts 33–100 ms from measured arrival jitter (underruns raise it, quiet stretches lower it).
   Interpolate between the two history packs bracketing the presented moment (poseSpanAlpha stays,
   normalized by the real span).
4. **Extrapolation ≤ 150 ms** with per-row velocity (existing `applySnapshotPoseToMesh` t>1 path,
   EXTRAPOLATION_MAX_WU teleport guard kept) — now only reached after delay+150 ms of true
   silence instead of 100 ms.
5. **Smooth correction**: after extrapolation, the clock never rewinds; it decelerates back into
   real data and the gap to the delayed target closes over a fixed **80–120 ms** horizon
   (critically-damped form, time-based, not per-frame gain). Teleports (pose-epoch change,
   rebuild, EXTRAPOLATION_MAX_WU) still snap — they are flagged by the sim's own epoch machinery.
6. **Interfaces**: renderer pose-apply keeps calling `fence.latestSnapshot()/previousSnapshot()` —
   those accessors will serve the bracketing pair at the presented moment (pose-data semantics,
   unchanged callers). presentationRunner keeps its order; no worker-lane protocol changes.
   Renderer internals are NOT edited (Lane 3's file untouched; the fence is the agreed pose-writer
   interface and is claimed in NOW.md).

**Wrong ways rejected**: raising ring capacity/catch-up (delays the jump, keeps it); extrapolating
forever (rubber-banding); hiding stalls under a spinner; lowering quality.

**Verify (MASTER_PLAN)**: stall harness recorded before/after; max per-frame position jump
≤ 2 × speed × frame time; no frame where the player ship's pose repeats while velocity ≠ 0 for
> 2 frames; before/after video of the same stall pattern on this laptop.
