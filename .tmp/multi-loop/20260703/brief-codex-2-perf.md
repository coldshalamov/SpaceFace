# TASK: Frame-hitch elimination (SpaceFace WS-A2)

You are Codex in the SpaceFace repo. Live measurement shows 59.5 avg fps but 54 ms worst frames —
the game FEELS choppy because of hitches, not load. Your job: kill the spikes.
Read `design/GDD_2_0.md` §10 and `design/BUILD_PLAN_2_0.md` first. Then read `src/core/loop.js`,
`src/render/renderer.js`, `src/render/vfx.js`, `src/render/partsLibrary.js`, `src/render/visualFactory.js`,
`design/PERF_BUDGET.md`.

## Build exactly this
1. New file `src/render/precompile.js` exporting `precompilePipelines(renderer, scene, camera)`:
   - Uses `renderer.compileAsync` (three r184) on a hidden staging group containing: one instance of each
     ship archetype mesh from the parts library, one of each weapon projectile/beam material, one full
     VFX salvo (spawn one pooled particle burst, sprite of each kind, one dynamic light) — then removes
     the staging group. Call it from the boot path behind the existing loading veil (find where the boot
     overlay is hidden in `src/main.js` and hook BEFORE the hide; keep main.js edit to <= 5 lines).
   - Also fire it on sector load if new hull archetypes will spawn there (check the sector's spawn tables).
2. Spawn amortization in `src/render/renderer.js` mesh-build path: max 2 mesh builds per frame; queue the
   rest (simple FIFO drained in renderUpdate). Entities without meshes yet render nothing for those frames —
   acceptable; they're typically offscreen spawns.
3. GC audit: find and eliminate per-frame allocations in hot paths. Known suspects: HUD 10 Hz string
   building is NOT yours (UI files off-limits) — but check `src/core/eventBus.js` emit payload creation in
   per-tick emitters, vfx update closures, spatialHash rebuild array churn. Reuse scratch objects/arrays
   where a change is safe and local. List every change you make in your summary.
4. New `scripts/check-hitch-budget.mjs`: extend the pattern of `scripts/probe-performance-profile.mjs` —
   scripted 60 s combat+mining run (reuse an existing scenario), assert ZERO frames > 32 ms after a 5 s
   warmup, print a frame-time histogram. Wire an npm script `check:hitch-budget` into package.json (add the
   script entry only — do not reorder or reformat the scripts block).

## Constraints
- Do NOT touch: `src/ui/**`, `src/systems/**` (sim), `src/core/physics.js`, goldens in test/.
- No new dependencies. No visual changes — same image, fewer spikes.
- The `backdrop-filter` removals already in the working tree are intentional; leave them.

## Verify before you finish
```
npm run check:non-graphics && node scripts/check-hitch-budget.mjs
```
(If the hitch budget still fails after your fixes, report the top-3 remaining spike sources with timings
from your histogram instead of looping forever.)
Write the files. Print a 10-line summary max: files + measured before/after worst-frame. Do not paste code.
