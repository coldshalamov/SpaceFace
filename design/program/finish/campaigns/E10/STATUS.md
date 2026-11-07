# E10 - Frame-truth dashboard: status

**Owner:** Lane 1 PIPELINE. **Diagnosis:** [DIAGNOSIS.md](DIAGNOSIS.md).

## Done (2026-11-06)
- `src/core/frameTruth.js`: always-on recorder, preallocated typed rings (1800 frames ≈ 30 s,
  2048 worker replies). The per-frame path reuses one value object **and caller-owned fence/lane
  scratch**; only trace export, the 1 Hz overlay and rare timeline events allocate.
- Columns: wall time + **wall-clock epoch**, clamped frame dt, **rawFrameDtMs** (pre-clamp),
  rAF callback ms, present ms, sim steps, simTime/tick, reply age + worker
  workMs/stepsMs/packMs/applyMs/**stallMs**, presented-clock delay/extrapolation/**bracket
  depth**, **playbackRate** (sim-seconds per **time-scaled presented second**, not wall),
  **timeScale**, **poseEpoch**, **presentedTimeS** (the fence's presented sim clock, now a
  column), player presented-pose x/z/speed, **presentedSpeed**, per-frame
  pose jump, **jumpBarWu**, **jumpRatio**, held-pose classification, **heldMs** (wall duration of
  the current held streak), **maxHeldMs** (summary), draws, triangles, 1 Hz heap (carried across
  frames), **allocBytesPerSec**, **popIn**, and the applied playout delay. Per-frame provenance is
  now columnar too: **poseSourceCode / laneCode / transportCode / sectorCode** with a
  `provenanceLegend` (string columns would allocate every presented frame).
- The FPS/hitch summary reads the **raw** rAF delta. `summary.fps`/`meanFps`/`rawFrame`/
  `frameWallSpanMs` use the true interval. `heapMB.start` is the first nonzero sample.
- **Held classification is pause- and wall-time honest.** The first frame (no finite previous
  pose) is never held; a non-finite pose or a body at/below 5 wu/s resets `heldStreak`; a
  `timeScale === 0` or `docked` present resets it too, so a docked hull that still carries
  velocity is not counted as a freeze. `heldMs` accumulates the RAW callback ms, so one 2.6 s
  callback is one held frame **and 2600 ms** of frozen picture.
- **The jump bar uses the clamped presented frame dt**, not the raw 2.6 s callback (`2 · speed ·
  playbackRate · timeScale · clampedDt`); a catch-up jump can no longer hide behind a 2.6 s bar.
  The jump bar is evaluated against the PRESENTED rate.
- **Held/popIn claims corrected.** `popIn` reads `state.render.residency.visibleUnready` (or
  `state.render.diagnostics.info.residency`) — the E6 owner already publishes it, so the old
  "stays 0 until E6 publishes" note was false. The value is E6-owned; the probe is wired.
- Provenance: `note` (stall/gap script), `location.href/search`, **`appVersion`** (the generated
  credits version), **`buildStamp`** (honestly null unless `options.build` or a boot producer
  sets `__SF_BUILD__`; the old permanent `build: null` claim was removed), `startedAtEpochMs` /
  `exportedAtEpochMs`, **`seed`**, **`saveSlot`**, a small **`settings`** summary, `lane`,
  `transport`, `mode`, `sector`, `playbackRate`, `timeScale`, `poseEpoch`, `poseSource`, a
  bounded `events` timeline, and **`simGap: { applications, heldFrames }`** so a file proves the
  E1 gate fired. The per-frame provenance codes carry lane/transport/sector identity.
- Hotkey export: Ctrl+Alt+J exports `{ fence: getLatestSnapshotFence(), extra: { perf:
  perfRuntime.getReport() } }` via the recorder's fence provider. **`trace.fence` is honestly
  nullable before the first fence exists** — the old "never null" claim was wrong.
- E10 reads the fence's `getPlayoutDiagnostics(out)`; the live caller passes a reused scratch
  object, so the per-frame path allocates nothing. `presentedRowPose` uses the same shared pose
  resolver as the mesh (including the extrapolation clamp).
- `src/core/simLaneMain.js`: `stallMs` is recorded per reply; `getFrameTruthSample(out)` fills
  caller-owned scratch instead of allocating one object per presented frame. `presentationRunner`
  now also fills one caller-owned ingest sample per frame, and the fence reuses one preallocated
  presented-pair object, so the E10 ingest path allocates only on export, the 1 Hz overlay and rare
  timeline events.
- **Measured reserve/recovery (this pass, Node, exact sub-frame pack timing):** 124 ms replies at
  60 fps over 30 s → lead p50 145.7 ms, 0 extrapolated frames; 12.3 fps at 1× / 123 ms replies →
  p50 86.4 ms, 0 extrapolated frames; 12.3 fps at 0.109× → p50 43.5 ms. Steady 400/500/600 ms
  cadence at 60/12.3 fps holds lead p50 427.0/521.3/626.0 and 361.5/467.4/558.8 ms with
  **0 gap resets** and worst jump ≤ 0.71×; the 349/351 ms knife edge is 0 resets at both rates.
  A 3 s worker silence re-seats once (`gapResets = 1`, gap 3000 ms) and the first post-burst frame
  is back at lead 50.0 ms.
- Tests: `test/frame-truth.test.mjs` **7/7** (ring wrap, held/pause classification, heldMs,
  presented-rate bar on the clamped dt, raw dt, heap carry, provenance/fence/events incl. nullable
  fence + per-frame codes + `simGap` + `presentedTimeS`, reply `stallMs`, simGap gate). The named
  E1/E10 cohort (eight files) is **77/77**; with the review file (**13/13**) the full set is
  **90/90**; `check:smooth-flight` **49/49**; `test/persistence-architecture-poles.test.mjs` alone
  is **13/13**.

## Next
- The recorded E1 traces predate this export wiring: they still have `fence: null`, no `note`,
  no per-frame provenance codes, and a performance-relative start. A fresh browser capture at a
  controlled 1× sim rate is required to cite the new columns. Do not claim the provenance fields
  are proven by those traces; the browser 1× run remains unproven.
- E5 shell headers are not proven by tests in this pass: `vercel.json` and the game server send
  COOP/COEP and the SAB gate is correct, but no test pins the Vercel headers or the
  `crossOriginIsolated` auto-arm; `check-retail-boot.mjs` and `simWorkerHost.mjs` still carry the
  stale "dev server does not send COOP/COEP" comments. This is E5 shell work, outside the E1/E10
  write set.
- GPU per-pass timers remain a renderer-owner item (Lane 3); draw calls/triangles are recorded,
  pass-level GPU timing is not yet plumbed.
- Lane 2's per-system worker profiler fills the per-system columns when it lands (schema reserved
  via `perfRuntime.getReport().systems` in export-time `extra`).

## Evidence
- `test/frame-truth.test.mjs` 7/7; fence files 11/6/10; sim-lane 10/10; persistence 13/13;
  presentation-runner **18/18**; weapon-ribbon 2/2 — the focused E1/E10 cohort is **77/77**.
- `test/snapshot-fence-review-fixes.test.mjs` **13/13** (new E1 contracts; not part of the named
  eight-file cohort). With it the full E1/E10 set is **90/90**; `check:smooth-flight` is **49/49**.
- The E1 evidence exports (`design/program/finish/campaigns/E1/evidence/*.json`) were recorded
  before `fence`/`note` were wired; their reply gaps are 123.6 / 511.4 / 7569.5 ms (p50/p95/max)
  for `after-stall-trace.json`, and the run held p50 20.0 fps / mean 12.3 fps at 0.109× sim rate.
  Re-score them with the method documented in [E1 STATUS](../E1/STATUS.md): 54 frames over 2× the
  derived presented-rate bar, worst 5.62×.
- The transport-named cohort red is `test/anvil-orchard-forecast-worker-transport.test.mjs`
  (authoritative `physicsBody` defined where the test expects `undefined`); it is pre-existing in
  this shared checkout and unrelated to the fence/recorder path.
