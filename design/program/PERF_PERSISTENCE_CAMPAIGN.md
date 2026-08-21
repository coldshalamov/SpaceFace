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

Phase 1 landed the records, catch-up kernels, and pin/tier names.

Phase 2 applies those tiers on the live tick: far AI/traffic do zero per-tick
work, and Rapier only keeps the causal active set. Actors are not deleted.
Hostiles chasing the player, tethers, jobs, stations, and on-glass bodies
stay exact. Catch-up uses lastExactT + ballistic drift on rematerialize.
Activity stamps are runtime-only (non-enumerable, skipped by save).

Headed p95 A/B is still required before calling crowded flight done.
47-A uninterrupted telemetry hash is unchanged (on-table fight stays exact).

Phase 3: rematerialize catch-up uses lastExactT; mined rocks write the resource
ledger and restore on respawn; New Game no longer waits for a far Helios hub.

Spatial hash now uses the same causal active set as Rapier. Far dormant
colliders remain in the world list; they are not hashed or queried.

## Remaining programs (not this slice)

Structural owners for later poles now exist in production code. They stay
gated until a headed fly proves the named product gate:

- Catch-up spiral: extra HUD/voice ticks skip; present is still once per rAF.
- Presentation residency reads R0–R3; runway packages are resident, not submitted.
- Flight-ready set / place layers, loadout fingerprints, cooker tags, material ABI.
- Persistent submit lanes, snapshot fence, Worker, and WebGPU remain **off**
  until sim p95 ≤ 5 ms and the named pole is measured on the owner Intel box.
- Modular ship flight packages still compile through the existing authored path;
  in-flight geometry cooks stay banned.
- Do not retry prewarm. Do not enable mixed unique-hull mega-batch.

## Persistence invariants (short)

A live actor never dies for crossing the screen. Dematerialize ≠ respawn.
Destroyed durable IDs never rematerialize. Mined rocks keep ore/fracture.
Chased/tethered/fighting actors stay exact until grace expires.
Catch-up uses `state.simTime` and stable IDs only.
