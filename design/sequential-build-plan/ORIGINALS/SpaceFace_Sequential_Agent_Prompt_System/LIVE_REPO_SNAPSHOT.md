# Dated Live Repository Snapshot

**Repository:** `coldshalamov/SpaceFace`  
**Observed branch:** `master`  
**Observed commit:** `b235f062fdff7a9bce3be838be280d557250c199`  
**Observed date:** 2026-07-19

This snapshot was used to shape the initial sequence. It is deliberately non-authoritative. Every implementation agent must re-audit the live repository, imports, registry/defaults, feature flags, current checks, public routes, and dirty diffs.

## Observed architecture

- Three.js browser/Electron top-down or semi-3D game.
- Fixed-timestep simulation and flat serializable `GameState`.
- Registry-ordered systems and event bus.
- Rapier-dynamic physics behind a single physics-authority membrane.
- Flight V3 and tactical AI were the live default paths.
- Data-driven content, world/place registries, DOM/CSS overlay UI, and extensive Node/browser/Electron checks.

## Observed program truth

- No M0–M6 milestone had a simple whole-program “done” state.
- The repository contained a 113-packet execution roadmap spanning foundations, gold corridor, signature Massline, Asteroid Ops, embodied world/story, UX, and release.
- Program ledgers explicitly distinguished code existence, focused checks, ordinary routes, visual acceptance, and integration.
- Some program status prose lagged later commits; latest history and live checks had to win.

## Observed integrated work

- Atlas/map/travel work had landed.
- A substantial graphics checkpoint had landed: authored Kestrel/startup, RCS/thrusters, black-space substrate, semantic PBR/admission, Helios surfaces, representative geology, typed combat/world effects, asset receipts, and visual-stability tooling.
- A later integration commit combined graphics and performance work.
- Natural-route motion, Electron/GPU/crowded-scene, visual-family breadth, and final performance/release acceptance still needed current proof.

## Observed Massline/control state

- Pure Massline orbit telemetry existed.
- Target scoring had been extended with optional intent, explicit preferred target, ownership, obstruction, and reach allowance.
- `tetherGameplay` supported attachable asteroids, wrecks, ships, drones, stations, payloads, and pickups; Flyby Focus had exact-target authority.
- The consumed live latch path still appeared primarily cursor/ray dominated outside special focus/nearest behavior.
- F served latch/cut/hold-to-reel; complete pay-out and thumb-friendly combined grammar were not proven.
- Flight V3 increased tethered yaw/helm authority but did not prove a bounded radial/tangential orbit controller.
- Release ratings, arc data/render, reel/pump, whip impact, impulse-charge combinations, earned momentum, hitchhiking, and related checks existed at varying proof levels.
- The G/trackpad mode followed sampled world-space path points and remained a structural control-risk candidate.

## Observed world/physics gaps

- Complex visual structures could still be represented by simple entity-level collision circles.
- Exterior docking could disagree with visible station geometry.
- Rich wreck/claim/world data could collapse into one entity, one radius, and a generic interaction.
- Regional ecology metadata did not itself create visible jobs or traffic.
- Asteroid Ops had substantial pure/system foundations but needed exterior spatial truth and live consequences.
- The world needed fewer representations and more embodied operations: components, collisions, payloads, receivers, jobs, sites, routes, fields, and visible transformations.

## Initial sequence implications

The initial dependency order was therefore:

1. Reconcile current repository truth and combined baseline.
2. Build a deterministic control/physics lab.
3. Fix Massline target acquisition and input grammar.
4. Prove orbit assistance and release/course presentation.
5. Repair or retire the experimental trackpad mode.
6. Establish compound collision/docking and universal physical combat response.
7. Add a bounded field/physics-weapon vocabulary and one planet.
8. Build NPC jobs and a physical cargo/heist loop.
9. Establish component targeting, contextual operations, payloads, receivers, and a World Site runtime.
10. Build one monumental wreck and recompose one sector.
11. Exteriorize Asteroid Ops and transform one industrial claim.
12. Manufacture route/physics infrastructure and then add specialized lines.
13. Consolidate story, visual families, HUD/VFX/camera, first-hour integration, endings, and release.

SF-00 exists to overturn this order whenever current evidence requires it.
