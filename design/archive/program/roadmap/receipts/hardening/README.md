<!-- LIFETIME: RECEIPT -->
# Shelved: async render asset teardown (codex-root/render-async-disposal, 2026-09-03)

A concurrent codex lane left a 1365-line uncommitted hardening diff across
`src/render/pipelineReadiness.js`, `partsLibrary.js`, `assetLoader.js`, `assetResidency.js` plus a
new test `test/render-async-disposal.test.mjs` that was RED (line 225: the caller's `AbortSignal`
never reaches the package loader). The writer was gone for 13+ hours. Per `NOW.md` rule 3a the
master adopted it: two independent read-only reviews, then a decision.

- `render-async-disposal-2026-09-03.patch` — the full diff, applies with `git apply` on 7a4d1c74.
- `render-async-disposal.test.mjs.txt` — the test that accompanied it.
- `review-kimi-k3-2026-09-03.md` — Kimi K3 xhigh: **SHELVE**, medium. Same root cause; flags a
  double-settle race in the residency tracker's `dispose` and the conflation of caller-cancel with
  runtime-retirement into one signal.
- `review-glm-5.3-2026-09-03.md` — GLM 5.3 max: **LAND-WITH-FIX**, medium-high. Same root cause
  (`assetLoader.js:955` passes only `runtime.signal`); minimal fix = compose the two signals with the
  `combineAbortSignals` helper already duplicated in the two sibling files. Also finds: most dispose
  paths have no production callers (dormant), but `disposeAuthoredAssetRuntime` is player-reachable
  (ship preview, Asteroid Works unmount) and the diff moves residency disposal BEFORE owned tasks
  settle, turning a former silent zombie-registration into a throw that must be caught.

**Decision (taste director, 2026-09-03):** shelved, not landed. Reasons: the value is defensive
(no player-felt bar moves); the change sits on the boot/asset critical path with one player-reachable
ordering change; landing it honestly needs a headed open/close of ship preview and Asteroid Works
plus the runtime witness, which nobody can run while the fun-loop lanes hold the checkout; and a red
test in the tree breaks `check:all` for everyone. To resume: `git apply` the patch, apply GLM's
composition fix, restore the test, run `node --test test/render-async-disposal.test.mjs`,
`npm run check:baseline`, `npm run probe:runtime-witness`, and one headed preview/Works open-close.
