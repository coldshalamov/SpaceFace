# E10 - Frame-truth dashboard: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done (2026-11-06)
- `src/core/frameTruth.js`: always-on recorder, preallocated typed rings (1800 frames ≈ 30 s,
  2048 worker replies). The per-frame path reuses one value object (the header now says
  "small-allocation", not "allocation-free": trace export and rare timeline events allocate).
- Columns: wall time + **wall-clock epoch**, clamped frame dt, **rawFrameDtMs** (pre-clamp),
  rAF callback ms, present ms, sim steps, simTime/tick, reply age + worker
  workMs/stepsMs/packMs/applyMs/**stallMs**, presented-clock delay/extrapolation/**bracket
  depth**, **playbackRate**, **timeScale**, **poseEpoch**, player presented-pose x/z/speed,
  **presentedSpeed**, per-frame pose jump, **jumpBarWu**, **jumpRatio**, held-pose
  classification, draws, triangles, 1 Hz heap (carried across frames), **allocBytesPerSec**,
  **popIn** (visible-unready count; currently 0 until the renderer publishes it — E6 owns the
  residency counter), and the applied playout delay.
- The FPS/hitch summary reads the **raw** rAF delta. A 2.6 s callback clamped to 0.25 s used to
  report 4 fps as 4 fps forever; `summary.fps`/`meanFps`/`rawFrame`/`frameWallSpanMs` now use the
  true interval. `heapMB.start` is the first nonzero sample, not the ring's first zero row.
- Held classification: the first frame (no finite previous pose) is never held; a non-finite
  pose or a body at/below 5 wu/s resets `heldStreak`. The jump bar is evaluated against the
  PRESENTED rate (`2 · bodySpeed · playbackRate · timeScale · dt`), not the lenient body-speed
  bar that hid the 0.1× slow-motion run.
- Provenance: `note` (stall/gap script), `location.href/search`, `build`, `startedAtEpochMs` /
  `exportedAtEpochMs`, `lane`, `transport`, `mode`, `sector`, `playbackRate`, `timeScale`,
  `poseEpoch`, `poseSource`, and a bounded `events` timeline for epoch/lane/transport changes.
  The old 1970 start time is gone.
- Hotkey export: Ctrl+Alt+J now exports `{ fence: getLatestSnapshotFence(),
  extra: { perf: perfRuntime.getReport() } }` via the recorder's fence provider, so `trace.fence`
  is never null in an evidence export. `{ download: false }` is honored (it used to be dead).
- E10 reads the fence's `getPlayoutDiagnostics()`; `presentedRowPose` uses the same shared pose
  resolver as the mesh (including the extrapolation clamp), so the recorder can no longer say
  "smooth" while the mesh snaps.
- `src/core/simLaneMain.js`: `stallMs` is recorded per reply (delta of the worker's cumulative
  `stallTotalMs`) beside work/steps/pack/apply, so injected stalls are not excluded from work
  attribution.
- Tests: `test/frame-truth.test.mjs` **7/7** (ring wrap, held/first-frame classification,
  presented-rate bar, raw dt, heap carry, provenance/fence/events, reply `stallMs`, simGap gate);
  the named cohort `snapshot-fence-playout-buffer` 11/11, `snapshot-fence-pose-epoch` 6/6,
  `snapshot-fence-span-alpha` 10/10, `weapon-ribbon-frame-truth` 2/2, `sim-lane-stall-confirmation`
  10/10, `persistence-architecture-poles` 14/14, `presentation-runner` 17/17 — **77/77**.

## Next
- The recorded E1 traces predate this export wiring: they still have `fence: null`, no `note`,
  and a performance-relative start. They are retained as BEFORE/AFTER history, but a fresh
  capture is required to cite the new columns. Do not claim the provenance fields are proven by
  those traces.
- GPU per-pass timers remain a renderer-owner item (Lane 3); draw calls/triangles are recorded,
  pass-level GPU timing is not yet plumbed.
- `popIn` stays 0 until the E6 residency owner publishes a cheap `visibleUnready` counter on the
  render diagnostics (the recorder probes `renderInfo.residency` / `state.render.residency`).
- The worker's 3 s stale-ACK rebuild watchdog is unchanged. `staleAckRecoveries` already rides the
  `simLane` extra, so a single-stall/worker-restart trace can cite it; shortening the watchdog and
  re-baselining without stop-and-wait is worker-owner work, not claimed here.
- Lane 2's per-system worker profiler fills the per-system columns when it lands (schema reserved
  via `perfRuntime.getReport().systems` in export-time `extra`).

## Evidence
- `test/frame-truth.test.mjs` 7/7; fence cohort 27/27; sim-lane 10/10; persistence 14/14;
  presentation-runner 17/17; weapon-ribbon 2/2 — the focused E1/E10 cohort is 77/77.
- The E1 evidence exports (`design/program/finish/campaigns/E1/evidence/*.json`) were recorded
  before `fence`/`note` were wired; their reply gaps are 123.6 / 511.4 / 7569.5 ms (p50/p95/max)
  for `after-stall-trace.json`, and the run held p50 20.0 fps / mean 12.3 fps at 0.109× sim rate.
  Quote those numbers, not the old 128 / 483 / 3.4 s.
