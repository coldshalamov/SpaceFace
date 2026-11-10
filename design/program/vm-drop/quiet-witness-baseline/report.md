# quiet-witness-baseline — idle-machine runtime witness + check:baseline

**Kind:** report (no game code changed)  
**Measured SHA (origin/master tip):** `0612d2b9fc994557dd35cb00d0df21b791722c23`  
(`0612d2b9f INF record: cruise-chip-denial (WF-15, implemented/focused_green)`)  
**When:** 2026-09-22 ~20:44–20:48 EDT (America/New_York)  
**Branch for this outbox:** `vm-drop` (job folder only)  
**Prior incomplete drop:** same folder on `aaf89b50f` — master tip then lacked `src/data/emergentPrimitives.js`; this rewrite completes that report against current master (file present).

## Verdict

Three `npm run probe:runtime-witness` runs **EXIT 0** on idle soft-GPU VM. Live flight reached; phase tables, draw calls, long-tasks, and opening GPU-resource timings captured. Verdicts: run1 **hitching** (admission), run2 **presenting**, run3 **presenting**.

`npm run check:baseline` on the same untouched master tip: **12/16 green**, **EXIT 1**. Failures already on master (honest; expected JSON not edited): `save-schema`, `sim-compare`, `sim-v3` (hash drift), `sim`.

**Every fps/GPU number below is soft-GPU** (`detectGpu` tier **software** — ANGLE Mesa **llvmpipe**). Not owner-iGPU evidence.

## Commands

Worktree: `/workspace/spaceface-master-witness` @ `origin/master` (`0612d2b9f`), host otherwise idle during measure (`DISPLAY=:4`).

```bash
SPACEFACE_WITNESS_TAG=run1 npm run probe:runtime-witness   # EXIT 0
SPACEFACE_WITNESS_TAG=run2 npm run probe:runtime-witness   # EXIT 0
SPACEFACE_WITNESS_TAG=run3 npm run probe:runtime-witness   # EXIT 0
npm run check:baseline                                       # EXIT 1 — 12/16 green in ~33683 ms wall
```

Raw probe reports copied into this folder:

- `runtime-witness/run{1,2,3}/report.md` (+ `report.json`, sample PNGs)
- `runtime-witness-report.md` (run2 canonical copy)
- `runtime-witness-report-run{1,2,3}.md`
- `artifacts/run{1,2,3}-stdout.log`, `artifacts/check-baseline-stdout.log`

## Environment / GPU tier (soft-GPU)

- Host: Linux grok-bot-vm, x86_64 KVM guest, **8** logical cores, Node v20.19.2
- Display: `:4` (headed Electron / Playwright over Xvfb)
- **GPU tier:** in-game `detectGpu` via witness → **`tier: software`**, `software: true`
  - renderer: `ANGLE (Mesa, llvmpipe (LLVM 19.1.7 256 bits), OpenGL 4.5)`
  - pixelRatio 1.00, buffer 1280×719
- Prior empty-baseline standalone probe had SwiftShader Subzero; this live run reports **llvmpipe**. Both are soft-GPU / `detectGpu` software. See `artifacts/detect-gpu-soft.json`.

## Phase table (ms) — avg / p95 from witness “Where the last frames went”

| Phase | Run1 avg / p95 | Run2 avg / p95 | Run3 avg / p95 |
|---|---|---|---|
| sim | 2.9 / 4.9 | 2.8 / 4.8 | 3.0 / 4.9 |
| simFrame | 5.8 / 9.5 | 5.9 / 9.0 | 6.1 / 9.9 |
| vfx | *(not ranked — probe phase block had no `vfx` line)* | same | same |
| ui | 2.8 / 4.3 | 3.0 / 4.7 | 2.8 / 4.5 |
| render | 30.5 / 25.5 | 24.3 / 27.4 | 23.4 / 65.2 |
| presentation | 34.7 / 28.2 | 28.5 / 29.9 | 27.5 / 70.1 |
| admission *(extra, top hitch owner)* | 21.3 / 105.6 | 12.9 / 84.7 | 7.0 / 9.2 |

Soft-GPU note: render/presentation averages include opening bloom bricks (max render 1317 / 1057 / 969 ms). Do not treat as owner-iGPU fps.

## Other witness fields (three runs)

| Metric | Run1 | Run2 | Run3 |
|---|---|---|---|
| Verdict | hitching | presenting | presenting |
| Exit | 0 | 0 | 0 |
| executedFrames (end) | 226 | 250 | 258 |
| rendererFrame (end) | 962 | 1020 | 1063 |
| drawCalls | **103** | **103** | **114** |
| Long-task count | **60** | **53** | **58** |
| Long-task total / max | 23913 / 3389 ms | 11319 / 1132 ms | 18493 / 3309 ms |
| Long-task ≥50 / ≥100 | 60 / 52 | 53 / 38 | 58 / 48 |
| Hitch samples (tail 8) | 4 | 2 | 0 |
| Top phase (tail) | admission p95 105.6 | admission p95 84.7 | presentation p95 70.1 |

## Cold first-draw / GPU-resource timings (soft-GPU)

Loading readiness (wall to stage id, New Game → flight):

| Stage elapsed | Run1 | Run2 | Run3 |
|---|---|---|---|
| preparing-run | 2.25 s | 1.31 s | 0.93 s |
| authored-visuals | 2.72 s | 2.03 s | 8.14 s |
| render-pipelines / gpu-resources / entering-flight | **12.11 s** | **4.61 s** | **10.76 s** |

Opening ledger (`wait.prepareOpeningGpuResources` — GPU-resource wall):

| | Run1 | Run2 | Run3 |
|---|---|---|---|
| prepareOpeningGpuResources | **14872 ms** | **15237 ms** | **8174 ms** |
| firstPresentAdmission | **1110 ms** | 0 ms | 0 ms |
| planWait | 13637 ms | 15190 ms | 8089 ms |
| rockSurfaceLibrary | 34 ms | 37 ms | 35 ms |
| residency | 4 ms | 4 ms | 14 ms |
| postResources (bloom) | 85 ms | 1 ms | 34 ms |

Opening-frame render work (cold first-draw proxies from `openingRenderWork`):

| | Run1 | Run2 | Run3 |
|---|---|---|---|
| drawPreparedFrame | **225.3 ms** | 10.7 ms | 122.2 ms |
| bloomComposite | 85.7 ms | 0.1 ms | 44.9 ms |
| pipelineAdmissionSync max | 2246 ms | 1065 ms | 1724 ms |

First visible draw identity gate: **fail** (uncaptured none) on all three — noted for `shader-admission-slice`, not fixed here.

## check:baseline (untouched master)

```
12/16 green in 33683ms wall (parallel:2+1x2), budget 90000ms
PASS: ui-screen-imports, ui-glyphs, ui-control-labels, vfx-techniques,
      pq020-ceres-topology, opening-mesh-defer, smooth-flight, flight-v3,
      m1-tether-mass, sim-v3-compare, render-package-plan, massline
FAIL: save-schema (expected schema drift)
FAIL: sim-compare (47-A Phase 0 tape: no projectile hit)
FAIL: sim-v3 (authoritative hash drift
      actual fe0070c14a9d62ef... expected 5c84097c2c15ff34...)
FAIL: sim (same Phase 0 projectile assertion)
EXIT 1
```

Hash drifts / fails already on master are recorded honestly; no `test/*.expected.json` edits.

## Headline scoreboard (cite this)

| | soft-GPU value |
|---|---|
| GPU tier | **software** (ANGLE Mesa llvmpipe) |
| drawCalls | **103 / 103 / 114** |
| long-tasks | **60 / 53 / 58** |
| sim avg/p95 | ~2.9 / ~4.9 ms (stable across runs) |
| render avg (soft-GPU) | ~23–31 ms (max bricks 0.97–1.3 s) |
| presentation avg (soft-GPU) | ~28–35 ms |
| GPU-resource wall | **8.2–15.2 s** `prepareOpeningGpuResources` |
| Cold firstPresentAdmission | **1110 ms** (run1); 0 (run2/3) |
| Cold drawPreparedFrame | **225 / 11 / 122 ms** |
| check:baseline | **12/16**, EXIT 1 |

Later Phase A/B/C jobs should compare CPU-side numbers (sim, long-tasks, allocation) to this folder; treat fps/GPU columns as soft-GPU only.
