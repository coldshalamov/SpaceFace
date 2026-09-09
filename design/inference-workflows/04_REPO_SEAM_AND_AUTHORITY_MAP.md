# SpaceFace Repository Seam and Authority Map

This map is a low-context starting point. It does not replace `CANONICAL_BUILD_MAP.md`, `ARCHITECTURE.md`, generated system/event maps, current code inspection, `NOW.md`, or an active packet. Refresh every path and owner before mutation.

## 1. Authority stack

1. Current user direction.
2. `ARCHITECTURE.md` — determinism, single writers, update ownership, browser/Electron parity.
3. `design/GDD_2_0.md` — product pillars and intended experience.
4. `CANONICAL_BUILD_MAP.md` and `design/program/` — dispatch, leases, packet and acceptance truth.
5. Current active packet.
6. These inference workflows — creative/production method only.
7. Historical plans and reference libraries — archaeology, not current completion truth.

## 2. Core simulation and state

| Domain | Primary current seams | Rule |
|---|---|---|
| Game state | `src/core/gameState.js` | One flat state; do not create a second universe state for a workflow. |
| Events | `src/core/eventBus.js`, generated `docs/EVENT_ROUTING.md` | Cross-system effects route through existing events or one narrow reviewed extension. |
| Registry/update order | `src/core/registry.js`, `docs/SYSTEM_REGISTRY.md` | A library file is not a running system merely because it exists. |
| Fixed step | `src/core/loop.js` | Simulation truth remains deterministic and fixed-timestep. |
| Physics authority | `src/core/physics.js`, `src/core/physicsAuthority.js`, Rapier owner seams | Gameplay asks for forces/impulses; it does not secretly write position/velocity. |
| Save | `src/save/saveSystem.js`, `src/save/migrations.js` | New persistent state needs an owner, cap, normalization and Continue proof. |

## 3. Flight, Massline and physical tools

Start at:

- `src/systems/input.js`
- `src/systems/flightV3.js`
- `src/core/flight/`
- `src/combat/attachments.js`
- `src/core/constraints/masslineController.js`
- `src/systems/masslineInputGrammar.js`
- `src/systems/tetherGameplay.js`
- `src/systems/weapons.js`
- `src/systems/impulseCharges.js`
- current Massline/Physics-as-Spectacle active packets

Rules:

- V3 is the live flight backend; legacy flight is not the default repair target.
- Preserve the simple intent: thrust, turn, boost, attach, line control and release.
- Assistance may remove input friction; it may not replace the physical maneuver with autopilot.
- New physical content should first reuse existing Massline, impulse, fields, collision, status and cargo relationships.
- Presentation consumes physical truth; it never fabricates a fling, collision or exceptional speed.

## 4. Enemies, combat AI and encounters

Start at:

- `src/systems/tacticalAI.js`
- `src/ai/stack.js`, `director.js`, `shipDecision.js`, `maneuver.js`, `engagementAuthority.js`
- `src/systems/aiPorts.js`
- `src/systems/aiEncounter.js`
- `src/systems/encounterDirector.js`
- `src/systems/combat.js` and `src/combat/`
- `src/data/enemies.js`
- `src/data/combatDefs.js`

Rules:

- SG-06 tactical AI is live; do not repair default behavior in legacy `src/systems/ai.js`.
- Separate enemy role, maneuver, weapon, physical response, formation and encounter composition.
- A new enemy is not accepted as a stat row; it needs readable behavior and an encounter proof.
- Actual hostile authority comes from combat/world/mission owners. Ambient team-2 traffic labeled pirate is not a hostile encounter.

## 5. NPC traffic and living-world jobs

Start at:

- `src/systems/traffic.js`
- `src/systems/npcJobsRuntime.js`
- current job-signature presentation owner
- `src/data/sectorActivityPockets.js`
- `src/systems/factionPresence.js`
- `src/systems/regionalEcology.js`
- `src/systems/sectorSim.js`
- `assets/incubator/npc_activity_pack/` as donor material only
- `design/incubator/microevent_library/` as unwired design data

Rules:

- Prefer live participant reuse over dedicated event spawns.
- Work, transfer, interruption, response and aftermath should be visible near the player.
- Sensor-range or sector-range existence does not satisfy living-world acceptance.
- Do not bulk-promote occupational donor ships; select, re-author and prove families one at a time.
- Do not add a universal event framework merely to consume the current catalog. Prove a causal chain first.

## 6. Sectors, destinations, sites and planets

Start at:

- `src/systems/world.js`
- `src/data/sectors.js`
- `src/data/sectorAnchors.js`
- `src/data/sectorZones.js`
- `src/data/authoredPlaces.js`
- `src/data/sectorActivityPockets.js`
- `src/data/planets.js`
- World Site/environmental-machinery/claims/beacons owners identified through module map
- current PQ-018/PQ-020/PQ-024 or successor packets

Rules:

- A sector is authored macro topology plus systemic activity, not a scatter radius.
- A destination needs a physical scene, readable function, state, traffic and at least one world connection.
- Do not create a new station screen for every object. Prefer in-flight sockets and current destination capabilities.
- Planets should alter navigation, traffic, opportunity or physics—not remain backdrop balls.
- Use current camera-visible bands when composing immediate activity.

## 7. Mining, cargo, economy and industry

Start at:

- `src/systems/mining.js`
- `src/systems/drill.js`
- `src/systems/cargo.js` — sole cargo writer
- `src/systems/economy.js` — sole credit writer
- `src/economy/freightCausality.js`
- `src/systems/sectorSim.js`
- `src/data/commodities.js`
- `src/data/mining.js`
- claims/Asteroid Ops owners in module map

Rules:

- Economy content must create visible work, movement, risk, spending goals or infrastructure.
- Do not write credits or cargo outside their owners.
- Recurring revenue should unlock capability and transformation, not maintenance chores.
- A production chain should have at least one player-interruptible seam and one visible exterior consequence.

## 8. Missions, heists, narrative and ledger

Start at:

- `src/systems/missions.js`
- `src/data/missions.js`
- `src/missions/heistMissionRuntime.js`
- `src/systems/story.js`
- `src/data/narrative.js`
- ledger/story-evidence owners located through module map
- current PQ-019/PQ-021/PQ-025 or successor packets

Rules:

- Missions orchestrate existing systems; they do not create a second physics, cargo, law or economy path.
- Immediate action remains understandable without reading a briefing.
- Favor open threads, physical evidence, short blips and optional ledger depth over dialogue-tree interruption.
- The world should support activity without mission acceptance; missions add context, stakes and authored escalation.

## 9. Assets, materials and world dressing

Start at:

- `docs/visual-assets/README.md`
- `docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md`
- `design/graphics-sprints/VISUAL_ASSET_CATALOG.md`
- nearest `assets/**/AGENTS.md`
- source/release manifests
- `src/render/partsLibrary.js`
- `src/render/visualFactory.js`
- Blender/export/foundry tools
- `assets/incubator/everyday_space_kit/` and NPC pack as donors only

Rules:

- Use current G0–G7 states and independent review.
- Geometry, materials, sockets, collision, LOD, release and live presentation are one production chain.
- Do not bulk-wire incubator packs or accept clay/blockout art because its schema is correct.
- Asset-family workflows should reuse manufacturing standards while preserving role silhouette and state.
- Composition decides whether an accepted asset belongs in a scene.

## 10. Rendering, VFX, camera, lighting and speed language

Start at:

- `src/render/renderer.js`
- `src/render/vfx.js`
- `src/render/camera.js`
- `src/render/velocityLanguage.js`
- combat phased-explosion/presentation adapter owners
- `design/program/roadmap/active/PHYSICS_AS_SPECTACLE_PROGRAM.md`
- `design/PHYSICS_AS_SPECTACLE_ART_BIBLE.md`

Rules:

- Reuse the current presentation/VFX owners; do not create a parallel framework.
- Effects express cause, direction, material, magnitude, ownership and aftermath.
- Bright force appears against colored/materially varied bodies; bloom does not erase structure.
- Performance is bought through pooling, batching, instancing, LOD, culling and priority—not silent quality cuts.

## 11. UI, UX, onboarding and accessibility

Start at:

- `src/ui/hud.js`
- `src/ui/uiRoot.js`
- `src/ui/screens/`
- `src/systems/onboarding.js`
- `src/ui/bindings.js`
- `src/ui/screens/settings.js`
- current attention/transient-message owner

Rules:

- One primary transient voice; persistent requested information remains available.
- The HUD supports physical play instead of replacing it with menus.
- Input remains remappable and controller schemes retain their contracts.
- Reduced motion, color/contrast and alternate cues are part of every feel/VFX unit.
- Test complete tasks, not isolated widgets.

## 12. Audio

Refresh through `docs/MODULE_MAP.md`, audio catalogs and current event consumers before editing. Use the existing audio event surface where possible.

Rules:

- Do not synthesize placeholder tones and call the sound pass complete.
- Sound communicates force, material, distance, tension, machinery, danger and sector identity.
- Audio assets need provenance, loudness/format standards, variation and voice limits.
- Tie cues to semantic events and physics; do not infer gameplay truth in the audio layer.

## 13. Performance and validation

Start at:

- `design/PERF_BUDGET.md`
- `docs/VALIDATION_WORKFLOW.md`
- `design/program/roadmap/00_EXECUTION_PROTOCOL.md`
- current broker/scenario manifests
- existing route and focused checks for the selected owner

Rules:

- Characterize first; create seconds-scale regressions before expensive route debugging.
- A normal-route claim requires current candidate-bound evidence.
- A screenshot does not prove simulation truth; a headless test does not prove experience quality.
- At 3x/5x, measure the portfolio together—not only units in isolation.
- The integrator, not the feature agent, updates global status.

## 14. Exact-path discipline

Every workflow execution must return current HEAD/worktree state, active packet/lease, owners inspected, exact paths changed, shared-change requests deferred, tests/route evidence and current limitations.

If live owners differ from this map, update the execution plan—not the architecture by force.
