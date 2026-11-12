# Implement BREAKAWAY in the actual SpaceFace repository

You have the attached `SpaceFace_BREAKAWAY` packet. This is an implementation assignment, not a request for another plan, a new architecture or a summary of the packet.

## Player result

A valuable industrial load can be recovered or stolen with the existing Massline, used physically during an encounter, guided into a visible arresting fork, and delivered with correct custody, reward and a local industrial consequence. Failure remains playable where the authored recovery policy permits. The ordinary game route—not the reference lab—is the deliverable.

Read `START_HERE.md`, then `docs/01_FEATURE_SPEC.md`, `docs/02_ENGINEERING.md` and `docs/03_ART_AND_SOUND.md`. Use `integration/tasks.json` as a local breakdown; its BW identifiers are not new global PQ IDs. Reuse relevant PQ-019/PQ-148/PQ-152 owners and the current asset/UI programme. Do not duplicate them.

## First actions: inspect, then implement

1. In the real checkout, inspect `git status --short`, the current `AGENTS.md`, nearest owner instructions, `build_map.md` and active ownership/checkpoint records. Preserve unrelated dirty work. The packet baseline is 3bd2881; re-audit changed seams instead of assuming an old line number is current.
2. Run this packet’s `npm test` and `npm run verify`. Open `demo/offline.html` to see the intended shape and the real-Rapier catch fixture. It is a reference, not a production shortcut.
3. Run `node <packet>/tools/probe-source-settlement.mjs <repo>` against current source. Characterize whether the prepare/commit refusal still reaches mission success. Fix a reproduced fault in the existing mission owner with focused tests. Do not repeat an already-fixed change just to match this packet.
4. Deliver Slice A end-to-end: one configured spindle and fork through existing heist owners, current physical capture proof, correctly gated settlement, durable save support, ordinary player entry and actual presentation. Make the asset and mechanics useful together.
5. Add Slice B’s authored lawful/fence/recovery decision and one visible local consequence. Implement Slice C only after the first playable slice is sound; preserve existing transport/attachment ownership and momentum.

## What to reuse

The tested helpers under `implementation/` may be promoted to one dedicated source directory. The optional promotion tool defaults to a no-write preview and refuses existing destination paths. Do not auto-overwrite globals. The adapter example is deliberately dependency-injected: translate its ports to real owners, not guessed APIs.

Use actual `queuePhysicsImpulse` and `queuePhysicsTorqueImpulse`, actual post-solve velocity and `entity.angVel`, and the existing facility transforms. The capture helper owns a small mechanical state only. `heistArbiter` remains the terminal arbiter; `missions` settles; economy grants money; existing law/faction owners decide and write their state.

The source currently has hardcoded capsule/facility assumptions and transient restore behavior. Parameterize one explicit variant and extend the save capture plan. Do not silently change all Capsule Run outcomes, grant a second bonus outside mission settlement, or claim serialization of the helper is a complete save implementation.

## Non-negotiable physical and custody rules

No body teleport into the fork. No success from first contact, side entry, historical overlap or a disappeared body. No global drag or earned-speed clamp. Removing a transport joint must not also add a second inherited velocity. Ordinary Masslines do not become fragile because a transport clamp can break.

Preparation and commit both require fresh current custody. No physical commit means no reward, success cue, schedule release or terminal mission completion. Replay must resume from durable receipt evidence. An impossible uncommitted handoff must resolve through a guarded abort/withdraw path, not stay stuck forever and not roll back already committed consequences.

Do not modify the player’s collision immunity or the core feel law. Do not import the laboratory’s tug controls, renderer, world or mocked collision targets as a second game runtime.

## Visual standard

Use the included GLBs and editable asset source as authored starting candidates. Bring them through the current release asset pipeline and inspect at the shipping camera. Fix the largest silhouette/material/scale mismatch first. Do not replace the load with a cube, a glowing orb or a generic loot icon.

The current FIELD HARDWARE/PQ-194 direction and approved frames govern production UI. Bind BREAKAWAY into the existing contextual EDGE surface and preserve the three-anchor HUD/Power Rail. The lab card and its SVG plate are reference material, not authority to add another permanent panel. Use current remapped controls, accessible semantics and existing voice/audio owners.

## Proof and work preservation

Run the relevant focused baseline before and after. Keep old Capsule Run route/save tests green and add new physical/custody/failure/replay coverage. Import actual owners for fault tests; testing a mock success alone proves nothing about the bridge.

Use a fixed seed and the ordinary launch path. Inspect real default-camera stills where art claims are made, test fresh-install asset behavior, and measure matched performance on the actual supported hardware/runtime. Do not reduce unrelated quality, population or effects to pass.

Commit completed vertical slices by exact paths and push the explicit working branch/PR according to the repository’s current contribution rules. Preserve partial implementation even if full acceptance cannot finish. Do not end with only a revised plan or uncommitted work. Do not merge unless separately authorized by the owner or the active task contract.

## Finish report

Lead with what the player can actually do. Then name the commit/PR, ordinary route, test and visual evidence, and the remaining unproven gates. Separate implemented, integrated, route-proven and player-accepted. A standalone laboratory is never proof of production integration, and an image is never the delivery packet.
