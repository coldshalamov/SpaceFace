# Generated boot preload repair claim

Allocated 22 October 2026 at 21:53 UTC. Owner: dot. This repairs a verified baseline problem; it is not a replay behavior change or a new loading architecture.

## Exact public baseline and reproduction

Master: 5e5b619b57c53be410e90c7e5f21bbb2fd0127f5. Generator scripts/sync-modulepreload.mjs: ed4078b9a1c45a589eca874307600cd8499f5d69. Index: 30e86f03ce7ee723c96fa823da7ca5fe3acd6c8b. Current NOW: 28c49d3e8aa779e931c7830e7bebcdf8ae1e13fd; no exact index.html/generated registry-block owner is listed.

The unchanged generator --check exits 1 in a coherent, hash-gated virtual public snapshot: 100 current imports are missing and 16 removed encounter paths remain (1300 and 570–584). All 2,278 successfully read source/dependency paths were hash checked; no missing public source was substituted and no game code executed. Source composition uses the complete public tree and verified deltas, not a partial simulation overlay or unverified dirty files.

This matches sync-modulepreload errors in exact-base CI run 39852539933 and replay-head run 39854604366, and stale-encounter 404 signatures in several browser checks. It does not prove every browser failure or the phone launch problem has this cause.

## Exact scope

- index.html: regenerate only the managed modulepreload registry block with the unchanged public generator.
- New BOOT_PRELOAD_REPAIR_2026-10-22.md in this directory: source identities, before/after proof, ownership and limitations.

Do not edit scripts, workflow/security settings, hand-maintained preload waves, import owners, tests, unrelated index markup or other active writers. No game/browser execution, broad aggregate, CI rerun or deployment is allocated. Preserve the original index and failed check, inspect the resulting +100/-16 block change, then run the generator's --check again and verify the rest of index.html byte-identical. Freeze and preserve exact source/proof, publish a fresh coherent draft increment, and follow CI separately.

Whole-game, ordinary flight/phone and unrelated CI goals remain open.
