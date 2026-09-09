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

## Implementation inventory

This is an implementation-status table, not a completion claim. The picture
contract remains: default bloom, shadows, particles, population, and combat
authority stay on. Actors are not deleted at the screen edge. A candidate is
not accepted until its named gate passes on the live route.

| Phase | Current production status |
|---|---|
| 0 fixtures | Live witness, full save/Continue playability, persistence, and focused production checks are acceptance gates |
| 1 ledger | Live: WorldRecord v2, resource-body ledger, catch-up kernels, destroyed IDs stay dead |
| 2 activity | Live: pins, S0–S4, R0–R3, hysteresis, grace, and one activity owner |
| 3 far AI | Live: owner views keep S0/S1 resident and wake S2/S3/S4 only for named causes; far actors remain durable |
| 4 Rapier | Live: active set and spatial hash follow activity; far bodies remain in the world list |
| 5 catch-up spiral | Live: presentation occurs once per rAF and HUD/voice skip extra catch-up steps |
| 6 residency | Live: mesh keep/submit follows R0/R1; shared-resource-aware CPU/GPU byte budgets reclaim only unpinned cache residency |
| 7 shell-first | Live: FlightReadySet admits the final camera picture; an immutable producer census compiles/uploads only exact submitted leaves, generated shadow variants, and restored persistent VFX before first draw |
| 8 flight packages | Live partial architecture: Kestrel and compatible flight actors rehydrate immutable cached root templates while keeping materials, bindings, damage, drive, LOD, and lifecycle actor-local; a fully offline flat package remains future work |
| 9 cooker | Offline selection contract only: live roots are not destructively pruned; admitted cooked artifacts and projected-pixel evidence remain future work |
| 10 material ABI | Metadata only: roles/features are recorded without changing Three program cache keys; the required 25% physical program-key reduction is not yet proven |
| 11 submit lanes | Disabled future seam: no production GPU range uploader consumes the lane plan, so it is not enabled on the hot path |
| 12 governor | Live: byte budgets pin player, opening shell, glass, runway, current-sector, and durable retained resources with shared GPU identities counted once |
| 13 snapshot fence | Live: reusable fenced snapshots publish completed poses, survive capacity growth, and fail closed for ordinary roots without a completed pose |
| 14 Worker | Disabled future seam: SAB protocol/kernel exist, but authoritative simulation, Rapier, command/event rings, and save ownership have not moved off-thread |
| 15 save/UI/audio | Partial live lanes: non-destructive dirty boundaries, Massline changed-value repaint, and inactive remote-loop suppression; full worker serialization/chunked storage is not claimed |
| 16 background | No structural consolidation admitted; visible sky and default quality are unchanged |
| 17 Electron | Future qualification: browser and Electron remain one game path; backend flags require a bounded A/B before admission |
| 18 WebGPU | Future escalation: selector scaffolding is not a shipped WebGPU renderer and live presentation stays WebGL |

## Accepted live result — 2026-08-21

- New Game reached flight in 8.2 seconds on the isolated Windows/Electron witness.
- The exact opening producer census matched and the first visible draw admitted no uncaptured
  program, geometry, texture, or shadow identity.
- The final live sample was presenting with 3/3 distinct canvas hashes, no context loss, no frame
  error, and zero hitch samples in the tail window.
- Final sampled p95: render 5.8 ms, presentation 7.7 ms, VFX 0.9 ms, simulation 6.6 ms,
  sim-frame 14.4 ms. Bloom scene p95 was 4.4 ms; tactical AI was the largest sampled simulation
  subsystem at 2.5 ms p95.
- Full New Game -> controls -> save -> Continue -> restored controls playability passed 14/14.
- The broader hitch classifier still attributes most threshold crossings to external scheduling
  (161/209 in this run). That is the remaining dominant environment/frame-pacing lead, not evidence
  for removing authored graphics or lowering default quality.

S4: generic unobserved far ships are aggregate counters, still alive in the
list, zero per-tick AI/physics.

Do not retry prewarm. Do not enable mixed unique-hull mega-batch.

## Persistence invariants (short)

A live actor never dies for crossing the screen. Dematerialize ≠ respawn.
Destroyed durable IDs never rematerialize. Mined rocks keep ore/fracture.
Chased/tethered/fighting actors stay exact until grace expires.
Catch-up uses `state.simTime` and stable IDs only.
