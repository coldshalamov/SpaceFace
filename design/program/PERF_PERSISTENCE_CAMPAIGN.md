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

## Implementation inventory (review this)

Shipped in production. Picture contract: default bloom, shadows, particles,
population, and combat authority stay on. Actors are not deleted at the screen
edge.

| Phase | What landed |
|---|---|
| 0 fixtures | Persistence matrix tests: mine/leave/return, follow, chase, kill, tether, catch-up, recent-memory GC |
| 1 ledger | WorldRecord v2, resource-body ledger, catch-up kernels, destroyed IDs stay dead |
| 2 activity | Pins, S0–S4, R0–R3, hysteresis, grace, `worldActivityManager` |
| 3 far AI | S2/S3/S4 skip think; S1 reduced cadence; hostiles/tethers/jobs stay exact |
| 4 Rapier | Active set + spatial hash from activity; far bodies remain in the world list |
| 5 catch-up spiral | Present once per rAF; HUD/voice skip extra sim steps |
| 6 residency | Mesh keep/submit follows R0/R1; R2/R3 unload except planets/focus |
| 7 shell-first | Opening gate ignores far hubs; interiors do not block flight-ready |
| 8 flight packages | Loadout fingerprint, cache, clone reuse; no in-flight geometry cook |
| 9 cooker | Chase-camera cooker drops interior/hangar/attachment-tagged nodes |
| 10 material ABI | Canonical roles stamp program families (no dummy prewarm) |
| 11 submit lanes | Persistent reserve/release/dirty; mixed mega-batch stays off |
| 12 governor | glass / runway / evictable roles on residency retain |
| 13 snapshot fence | Packed each present; poses apply from snapshot |
| 14 Worker | Abstract catch-up worker with main-thread fallback. Rapier stays main-thread |
| 15 save/UI/audio | Catch-up save skip; HUD unchanged skip; listener-relative exact audio |
| 16 background | Sky kept; no quality cut |
| 17 Electron | Browser and Electron remain one path. Backend bake-off is review/measure |
| 18 WebGPU | Selector exists; live present stays WebGL until a backend swap is proven |

S4: generic unobserved far ships are aggregate counters, still alive in the
list, zero per-tick AI/physics.

Do not retry prewarm. Do not enable mixed unique-hull mega-batch.

## Persistence invariants (short)

A live actor never dies for crossing the screen. Dematerialize ≠ respawn.
Destroyed durable IDs never rematerialize. Mined rocks keep ore/fracture.
Chased/tethered/fighting actors stay exact until grace expires.
Catch-up uses `state.simTime` and stable IDs only.
