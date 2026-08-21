<!-- LIFETIME: DURABLE -->
# Performance architecture and persistence campaign

Controller-ready program. Full owner text is the user packet of 2026-08-21.
This file is the repo door so agents cannot “optimize” by deleting the world.

**Do not implement this as one giant patch.** One measured pole per slice.
Keep only if the named product gate passes. Revert otherwise.

## Smoking gun

The table draws ~10 roots. The sector still holds ~320 bodies in physics/AI.
The 50% GPU hitch (shadows redrawn every frame) is already fixed. Remaining
work is **simulation breadth** and **startup preparing off-screen places**.

## Four layers

```
DURABLE WORLD LEDGER
    → ABSTRACT / ANALYTICAL SIMULATION
        → ACTIVE GAMEPLAY SIMULATION (exact AI + Rapier)
            → PRESENTATION ACTIVE SET (glass + runway)
```

Visibility ≠ persistence. Causal relevance = fidelity.

Three boundaries: **render** / **physics** / **persistence**.

## Banned without a new seam

Broad shader prewarm; same-thread pipeline overlap; per-frame opaque
batcher; mixed unique-hull mega-batch; bloom removal; broad class hiding;
runtime per-triangle interior occlusion; LOD meshes for unsubmitted entities.

## First three production programs

1. Persistence scaffold + deterministic activity classification.
2. Far AI/traffic dormancy + Rapier active set.
3. Shell-first station/startup readiness.

Phase 1 (this slice) lands (1) only: records, catch-up kernels, pins/tiers.
It does **not** deactivate Rapier or strip AI yet.

## Persistence invariants (short)

A live actor never dies for crossing the screen. Dematerialize ≠ respawn.
Destroyed durable IDs never rematerialize. Mined rocks keep ore/fracture.
Chased/tethered/fighting actors stay exact until grace expires.
Catch-up uses `state.simTime` and stable IDs only.
