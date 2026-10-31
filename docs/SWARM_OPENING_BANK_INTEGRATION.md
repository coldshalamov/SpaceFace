# Swarm opening bank integration

The opening bank planner reads the live ladder's `ratingTierMin`, not the absent `lineTier` field.
Base Foundry waves 1–3 propose 8, 11 and 14 authored stations; higher ratings, mutators and other
arenas retain their existing planners. All station centers remain within the base tier's radial band.
Live slot identity prevents a thrown bank still in the fight from being duplicated at its old station.
Surviving physical bodies are never repositioned.

These counts are proposals, not guaranteed admissions. Current native-collider and swept-hull
clearance stays authoritative, including calibrated asteroid radii. Occupied slots are refused and
retried without random fallback. Existing optic lattice separation, articulated hull clearance,
brood combat methods, impact fast gates and chunk audio payloads are preserved.

`test/swarm-opening-terrain.test.mjs` checks authored staging and denial through explicit ports.
`test/swarm-opening-bank-integration.test.mjs` exercises the imported production arena owner;
`test/crucible-swarm-arena.test.mjs` retains generic field behavior outside opening stages.
These component checks do not establish whole-room native physics, browser visuals or performance.

Verification at the pinned current source: all 28 bank/arena behavior cases pass. The historical
steady-state test assumed the first seeded search filled every berth. Current native clearance
admits 17 of target 18 in wave 7; wave 8's seed fills the last berth. An untouched pinned-owner
control reproduces 17→18→18→18. The reconciled test checks the full target thereafter plus survivor
identity/position, rather than incorrectly forbidding legitimate top-up. No admission rule was relaxed.
