# quiet-witness-baseline — idle-machine runtime witness + check:baseline

**Kind:** report (no game code changed)  
**Measured SHA (origin/master tip):** `3ecf3de72608008a54d544c58a35b70b1a574e90`  
(`3ecf3de72 PQ-033.02 report: record check:all cancellation, close the verification basis`)  
**When:** 2026-09-22 ~00:42–00:47 EDT (America/New_York)  
**Branch for this outbox:** `vm-drop` (job folder only)

## Verdict (honest)

Master tip **does not boot far enough to sample frames**. All three `npm run probe:runtime-witness` runs failed the same way: the Electron page 404s `src/data/emergentPrimitives.js` (imported from `src/data/weapons.js` since `01cf5d26d`), then the probe hits `TimeoutError: CSP-safe page condition timed out after 90000ms`. Phase tables, fps, draw calls, long-task counts, cold first-draw / GPU-resource timings are **unavailable** — not invented. `npm run check:baseline` on the same untouched master tip **FAIL**s for the same missing module (**4/16** green).

This folder is the Phase A reference that later jobs should cite: on current master, the quiet machine cannot yet produce a live witness scoreboard until the missing file (or the import) is restored on master.

## Commands

Worktree: `/workspace/spaceface-master-witness` @ `origin/master` (`3ecf3de72`), otherwise-idle host (orphan saturating `git grep` killed before measure; only desktop/session services left).

```bash
# three tagged runs
SPACEFACE_WITNESS_TAG=run1 npm run probe:runtime-witness   # EXIT 1
SPACEFACE_WITNESS_TAG=run2 npm run probe:runtime-witness   # EXIT 1
SPACEFACE_WITNESS_TAG=run3 npm run probe:runtime-witness   # EXIT 1

npm run check:baseline   # EXIT 1 — 4/16 green in ~3545 ms wall
```

Exact probe error (all three):

```
probe failed: TimeoutError: CSP-safe page condition timed out after 90000ms
...
[http.404] http://127.0.0.1:<port>/src/data/emergentPrimitives.js
[console.error] Failed to load resource: the server responded with a status of 404 (Not Found)
```

Exact baseline root error:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
'.../src/data/emergentPrimitives.js' imported from
'.../src/data/weapons.js'
```

Confirm on tree: `src/data/weapons.js` line 30 imports `./emergentPrimitives.js`; file absent at tip. Introduced with import at `01cf5d26d` ("The shove is a product: Pulse M...").

## Environment / GPU tier

- Host: Linux grok-bot-vm, x86_64 KVM guest, **8** logical cores (Intel Xeon), Node v20.19.2
- Display: `:4` (headed Electron / Playwright)
- **GPU tier (soft-GPU / SwiftShader):** standalone WebGL probe using the same `detectGpu` SOFTWARE_RE as `src/render/adaptiveQuality.js` → **`tier: software`**, `software: true`
  - unmaskedRenderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`
  - unmaskedVendor: `Google Inc. (Google)`
- In-game `detectGpu(renderer)` **never ran** (boot never reached a live renderer). Soft-GPU label below is from the standalone probe + this VM’s known SwiftShader path. See `artifacts/detect-gpu-soft.json`.
- Optional prior soft-GPU cite (not this job’s product): `/workspace/spaceface-scratch/perf-baseline-20260922-0002/` (`webgl.txt` same SwiftShader string on older SHA `7369cb4e7`).

**Every fps/GPU number in this report is soft-GPU (SwiftShader / `detectGpu` tier `software`).** There are no live fps numbers from this job.

## Phase table (sim / simFrame / vfx / ui / render / presentation)

| Phase | Run1 avg / p95 | Run2 avg / p95 | Run3 avg / p95 |
|---|---|---|---|
| sim | n/a | n/a | n/a |
| simFrame | n/a | n/a | n/a |
| vfx | n/a | n/a | n/a |
| ui | n/a | n/a | n/a |
| render | n/a | n/a | n/a |
| presentation | n/a | n/a | n/a |

Probe reports: “no phase ranking (perf runtime did not report)”; `executedFrames` / `rendererFrame` / `drawCalls` / `gpu` all **n/a**.

## Other witness fields (three runs)

| Metric | Run1 | Run2 | Run3 |
|---|---|---|---|
| Verdict | inconclusive | inconclusive | inconclusive |
| Exit | 1 (TimeoutError 90s) | 1 (TimeoutError 90s) | 1 (TimeoutError 90s) |
| Long-task count | not captured | not captured | not captured |
| Draw calls | n/a | n/a | n/a |
| Cold first-draw | unavailable (no flight) | unavailable | unavailable |
| GPU-resource timings | unavailable | unavailable | unavailable |
| Opening first-touch owner | disabled (default) | disabled | disabled |
| Host load window | unavailable | unavailable | unavailable |
| Console signature | 404 `emergentPrimitives.js` | same | same |
| Soft-GPU tier label | software (SwiftShader) | software (SwiftShader) | software (SwiftShader) |

## `check:baseline` on untouched master

```
check:baseline
  FAIL    1077ms  ui-screen-imports
  PASS     108ms  ui-glyphs
  PASS     170ms  ui-control-labels
  PASS     170ms  vfx-techniques
  FAIL     279ms  pq020-ceres-topology
  FAIL     215ms  save-schema
  FAIL     390ms  opening-mesh-defer
  FAIL     318ms  smooth-flight
  FAIL     153ms  flight-v3
  FAIL     189ms  m1-tether-mass
  FAIL     305ms  sim-v3-compare
  PASS    2475ms  render-package-plan
  FAIL     275ms  sim-compare
  FAIL     268ms  sim-v3
  FAIL     258ms  sim
  FAIL    3545ms  massline

  4/16 green in 3545ms wall (parallel:2+1x2), budget 90000ms
EXIT:1
```

Not “fixed” in this report job. Root cause shared with the witness: missing `src/data/emergentPrimitives.js`.

## Artifacts in this folder

- `report.md` — this file
- `DONE.md` — one-paragraph summary
- `runtime-witness/run{1,2,3}/report.md` + `report.json` — probe outputs (tagged OUT dirs)
- `runtime-witness-report.md` — copy of run1 probe markdown (contract: copy `.devshots/runtime-witness/report.md` if produced; tagged runs land under `runN/`)
- `artifacts/run{1,2,3}-stdout.log`, `run{1,2,3}-stderr.log`
- `artifacts/check-baseline-stdout.log`, `check-baseline-stderr.log`
- `artifacts/detect-gpu-soft.json`, `artifacts/env.txt`
- `artifacts/devshots-runtime-witness-run{1,2,3}-report.md`

No `src/`, `VM_LANES.md`, or `NOW.md` edits. No merge to master.

## What an importer should do next

1. Restore or land `src/data/emergentPrimitives.js` (or remove the import) on master so boot and baseline can run.
2. Re-run this job (or a `quiet-witness-baseline-b`) on a green tip to fill the phase table / three-run scoreboard this folder intended to hold.
