# PERF-HOT-04 — Stop recomputing surface program keys every frame (Adventure: 1–6 ms/frame)

Evidence: `.devshots/fleet/runs/INV-13-gpu-or-cpu.grok.*/RECEIPT.md` — in steady Adventure flight
`canonicalizeSurfaceProgramFamilyKey` (`src/render/illustratedSurface.js:173`) runs ~965–1339×/frame and
`canonicalizeInstalledSurfaceProgramKey` (`:192`) ~324–470×/frame, ~1.4–2.4 ms each per frame; Swarm runs them ~0–49×.
The flight is CPU-bound on this laptop, so these ms are real frame time.

## Do this (no game boot needed; measure with a node microbench or the existing probe if you like)
1. Find who calls them per frame in Adventure (grep callers; likely `customProgramCacheKey` on illustrated-surface
   materials, which three.js calls for every material on every `getProgram`/`setProgram` check, or a per-draw
   onBeforeRender path).
2. Cache the canonical key per material (e.g. on the material's userData or a WeakMap), invalidated only when the
   inputs that build it change (defines / installed surface version / whatever the function reads). The returned
   key must be byte-identical to today's for every material state — add a test that compares cached vs uncached keys
   across the material variants the tests already build, and that a changed input yields a new key.
3. Do not change any shader or program content. Tests before/after for `illustratedSurface` and render-program tests
   (`grep -l illustratedSurface test/*.mjs`). `npm run check:sim` (render only, should be unaffected).
Exact-path commits per the protocol.
