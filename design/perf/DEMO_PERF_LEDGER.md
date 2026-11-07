# Demo performance ledger

Owner: performance hill-climb, 2026-11-07. This is the scoreboard, not a promise. All numbers are
from the same laptop and must name their context.

## Hardware and context

- Windows, 14 logical CPUs, 32 GB, **integrated Intel Graphics (0x7D45, D3D11)**, ANGLE.
- Shared checkout: other agents/Chrome can run concurrently; every run records host CPU busy and
  memory. Treat a single run as a sample, not a verdict.
- Demo target: **fluid 60 fps where the hardware allows; otherwise a locked, hitch-free 30 fps.**
  Never trade authored identity (bloom, trails, Nocturne, readable HUD) for a synthetic score.

## Protocol

1. Headed Electron/browser, 1280×720–1280×800, post-boot warm-up ≥20 s so the authored queue settles.
2. `scripts/probe-runtime-witness.mjs` for the ordinary New Game flight; `scripts/check-hitch-budget.mjs
   --headed --warmup=20000 --duration=30000` for the 6-enemy/10-rock stress scene.
3. Record: presentation p95, render p95, UI p95, vfx p95, long tasks (count/max), hitch samples, GPU
   tier, pixel ratio, CPU busy. Three runs, median, same scene.
4. A win is only a win if the matched run moves; a single noisy run is not evidence.

## Baseline and current

| Run | Context | Presentation p95 | Render p95 | UI p95 | Long tasks ≥50 ms | Max | Notes |
|---|---|---:|---:|---:|---:|---:|---|
| medium, original | headed witness, New Game | 53.4 ms | 36.9 | 16.2 | 339 | 497 | full raster, 2 bloom levels, no cap |
| integrated Auto v1 | headed witness, New Game | **36.8 ms** | **25.6** | **12.1** | **135** | **349** | auto High performance, 30 cap |
| stress scene | headed hitch gate | — | **54.4** | 16.6 | 143 frames >32 ms | 150 | 6 enemies / 10 rocks; still red |

The auto profile is `applyQualityPreset(..., 'low')` on an integrated GPU whose quality mode is Auto
(`src/render/renderer.js`, `src/render/adaptiveQuality.js`). It is reversible from Settings → Video
and never overrides a Manual choice.

## Open bottlenecks (ranked hypotheses until the audit reports land)

1. **Scene render at 54 ms in stress** — draw submission/fill, not bloom quads (bloomScene p95 ~20 ms
   in normal flight). Investigate instancing, overdraw, shadow/depth passes, per-entity material
   switches, and the tabletop submission population.
2. **UI 12–17 ms p95** — always-mounted HUD doing per-frame DOM writes. Candidate: dirty-flag HUD,
   30/15 Hz instrument tiers, batched writes, cached nodes.
3. **External scheduling / long tasks** — host contention (CPU busy 58%) and 135 long tasks even in
   normal flight. Candidate: boot/admission work, GC, texture/GLB decode, event storms.
4. **Stress-scene authored queue** — 3+ jobs and 257+ entities; admission and per-entity setup can
   land inside presented frames.
5. **First-flight loading** — authored-visuals/render-pipelines stages and pending roots; cached
   second launches are faster but a cold demo still pays.

## Rules

- Do not lower the bar or rename a hitch; fix the frame or name the residual.
- Do not silently change the authored look. Quality tiers are named, reversible and announced.
- Do not re-record determinism goldens for a perf change.
- Every accepted change adds a row here and a focused check.
