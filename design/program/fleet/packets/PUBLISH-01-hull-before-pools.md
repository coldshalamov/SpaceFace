# PUBLISH-01 — Show an authored hull when its own programs are ready; let package pools attach after

Evidence: `.devshots/fleet/runs/INV-11-wasp-readiness-split.grok.*/RECEIPT.md` (section 3 and "Which branch"). In Swarm round 1
an on-glass Wasp's authored program keys are ready when its body is grafted, but `prepareAuthoredShipVisualPipelines`
awaits `Promise.allSettled` of the root compile **plus** that ship's package-pool admissions (`pendingPools`), and
`commitAuthoredBoundary` only runs after that await (`src/render/partsLibrary.js` ~9576–9619 and ~9766–9779). Wasp 576
was ready at 5.37 s and stayed unpublished ~6 s until six pool siblings drained; 577 likewise.

## Do this
1. Split the await: commit/publish the authored boundary as soon as the root compile (and the ship's own residency) is
   ready; let package-pool admissions finish afterwards and attach their parts when each is ready (as a later
   commit/attach on the same boundary). Pool parts must never draw with an unlinked program (keep whatever
   readiness guard they use today) and must not cause a visible pop beyond the parts themselves appearing.
2. Keep the existing behaviour for any caller that needs the full set before publish (look for callers/tests that
   rely on "everything ready at publish"; if one exists for a reason, keep its path and change only ship upgrades).
3. Tests (no game boot): a ship whose root is ready and whose pools are pending publishes immediately; its pool parts
   attach when their admission resolves; nothing draws unready. Run `partsLibrary`/`authored`/`admission` tests
   before/after (`grep -l`). `npm run check:sim` must stay green (render only).
Exact-path commits per the protocol (use own-commit.sh if `partsLibrary.js` has someone else's edits).
