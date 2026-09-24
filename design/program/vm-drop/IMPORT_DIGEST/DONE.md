# DONE — IMPORT_DIGEST (report job)

## Summary

Refresh vs master **`568d1358e`**. Quiet CPU re-rank run (45 s settled held-thrust); soft-GPU ignored.

**New this pass:** #34 `hud-credits-pulse-no-reflow` — early-flight `refreshCredits` forced-reflow hitch (~104 ms / 1 invocation); portable layout reads **N→0**; 4/4 tests.

**Still pending strong imports:** #31 optic, #32 emergent-hot-spatial (~4×), #33 share-unchanged-ship-materials (~1.96×), #34 hud-credits-pulse-no-reflow (hitch), #17 asteroid-query-callers (~9×), #1 far-actor-cell-key (~2×), #13 prepare-pitch (~2.3×), #15 submit-scratch, #12 massline.

**Holds:** flight-propulsion-scratch (integrated miss).

## Next poles

Import portable pending → `pruneEvidence` cadence / projectile surface prefilter → remaining 11 live rocks still pinned → same-material hull batch only if draw remains the pole. Soft-GPU fps is not a KPI.
