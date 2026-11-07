# E10 — Frame-truth instrumentation: diagnosis

## 1. The player-visible problem
Nobody — owner or agent — can answer "where did this frame go?" after a freeze. The evidence for
the freeze/blip campaign (E1) exists but is scattered across at least six disconnected probes that
each have to be re-derived by hand from a live session.

## 2. Measured cause chain (what exists today, verified in code)
Instrumentation that already exists but is not one thing:

| Probe | Where | What it gives | Gap |
|---|---|---|---|
| Tier-1 counters | `src/core/perfRuntime.js` (recordPresentationFrame, recordSimFrame, recordLoop, input-to-photon, heap samples, renderer draw/tri sampling) | per-frame JS cost, steps/frame, allocation rate | no worker-step per-system view, no export |
| Worker reply work | `simLaneMain.js` `workerLastReplyWork` (workMs/stepsMs/packMs/applyMs…, per reply) | the authoritative cost chain | rolling p50/p95/max never computed; no export |
| Freeze episodes | `simLaneMain.js` `freezeEpisodes` (350 ms applied-gap sampler) | when applied state stopped arriving | wall-clock samples only, no pose trace |
| Worker clock diagnostics | `wholeSimBrowserWorker.js` `clockDiagnostics` (steps, shed, backpressure, unacked) | transport pressure | lives on reply only |
| Snapshot fence | `src/render/snapshotFence.js` `bytesPackedStats`, `samplePresentationAlpha` | pack bytes, presented clock | no arrival-jitter or buffer-depth record |
| Runtime/camera witness | `src/core/runtimeWitness.js`, `cameraWitness.js` + `[world-motion-hold]` console | 1 Hz motion-hold reports | console-only |

Verified numbers this dashboard must reproduce (from the 2026-11-06 campaign,
PERFORMANCE_HANDOFF): worker reply work p50 ~8 ms / p95 58 ms / p99 105 ms / max 458 ms; replies
arriving 2–10 Hz under load; ~65 MB/s main-thread allocation in flight; GPU p50 23.7 ms on the
iGPU. E10's own Verify (MASTER_PLAN) is that E1/E2/E6/E7 cite it — E1 is the first consumer.

## 3. Is the design the bottleneck?
No — this is a consolidation campaign. The design question was "one overlay + one trace vs more
probes": more probes is how the current scatter happened. One in-memory recorder + one overlay
surface + one JSON export is the cheaper road.

## 4. Chosen road
- One module, `src/core/frameTruth.js`: a fixed-capacity recorder (no per-frame allocation in the
  production default) that ingests the EXISTING probe outputs each presented frame — worker reply
  work (stepsMs/workMs/packMs/applyMs), completed-tick arrival wall times (→ arrival jitter,
  inter-reply Hz), presented-clock state from the fence (playout delay, buffer depth, extrapolation
  in progress), main-thread long tasks (perfRuntime frame callback), render JS (lastPresentMs),
  allocation rate (heap samples), plus per-system worker timings when the sim profiler publishes
  them (Lane 2 will extend; the schema reserves the columns).
- Overlay: dev-gated DOM layer (`?frameTruth=1` or Ctrl+Alt+F), one 60 Hz cheap-path update,
  ~15 rows of the numbers above; never mounted in production default.
- Trace export: `window.__SF_FRAME_TRUTH__.exportJSON()` → downloads
  `frame-truth-<mode>-<timestamp>.json` (header + rolling per-frame records + episode records).
  Recording is always-on at low resolution (ring of 1800 frames ≈ 30 s at 60 Hz); the hotkey
  freezes and exports.
- Cap: recorder writes ≤ ~2 KB/frame of scalar fields into preallocated typed arrays; overlay DOM
  updates are dirty-gated. Measured overhead target < 0.2 ms/frame; checked on the laptop before
  E1 relies on it.
