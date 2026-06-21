# SG-02 Physics Handoff

## Scope Accepted

This landing promotes the recovered SG-02 dynamic body owner from an isolated lab into an explicit production backend selected by `settings.gameplay.physicsBackend === 'rapier-dynamic'`.

Accepted runtime surface:

- `src/core/physicsAuthority.js` remains the command membrane for force, torque, impulse, body schema, thruster health, and telemetry.
- `src/core/sg02DynamicBodyOwner.js` owns Rapier dynamic/fixed bodies, 2.5D plane locking, speed clamping, Massline rope joints, reel/cut operations, and SG-03-shaped combat physics methods.
- `src/core/physics.js` installs a stable `helpers.combatPhysics` object before SG-03 action services initialize, then forwards it to the live SG-02 owner when `rapier-dynamic` is ready.
- `src/core/simSnapshot.js` folds the live, quantized SG-02 body snapshot into SG-01 headless snapshots when `rapier-dynamic` is selected.
- `src/core/flightDynamics.js` can compile the existing assisted/drift/newtonian control laws into SG-02 force/torque commands without directly mutating entity motion.
- `src/systems/flight.js` routes dash impulses and intentless damping through SG-02 when the dynamic backend is selected.

## Ownership And Mutation Table

| Surface | Owner In `custom` | Owner In `rapier-dynamic` |
| --- | --- | --- |
| craft `pos` | `physics.integrate` + legacy collision response | `sg02DynamicBodyOwner` |
| craft `vel` | `flightDynamics`, dash, drag, collision response | `sg02DynamicBodyOwner` |
| craft yaw/`angVel` | `flightDynamics` / `flight.applyDrag` | `sg02DynamicBodyOwner` |
| visual bank | `flightDynamics` | `flightDynamics` presentation pose |
| SG-03 dash/tether impulse | fail-closed without port | `helpers.combatPhysics` -> SG-02 owner |
| Rapier handles/joints | transient | transient, rebuilt from semantic state |

## Schema And Migration

Save schema v4 persists SG-02 dynamic authority prerequisites: `settings.gameplay.physicsBackend === 'rapier-dynamic'`, craft yaw-rate (`angVel`), and the additive `entity.physicsBody` authoring/mutable-thruster schema from `physicsAuthority.js`.

Save schema v5 persists SG-03 semantic combat state: combatants, active/queued actions, cooldowns, statuses, and active semantic attachments. Runtime commands, Rapier handles, joints, and telemetry stay transient WeakMap state and must not enter saves. On reload, SG-03 remaps saved semantic entity refs to fresh player/persistent ids, then reconciles active Massline constraints through `helpers.combatPhysics.createAttachment(...)` after SG-02 bodies exist.

Follow-up before making `rapier-dynamic` the default:

- run the 47-A reload/default-backend replay gate with the dynamic backend and folded quantized SG-02 body snapshot. Pickup, live projectile, docking, and gate range contact parity are now covered by `scripts/check-sg02-authority.mjs`.

## Acceptance Scripts

- `scripts/check-sg02-authority.mjs`
- `scripts/check-sg02-production-combat-port.mjs`
- `scripts/check-sg02-tether.mjs`
- `scripts/check-sg02-tether-break.mjs`
- `scripts/check-sg02-dash-collision.mjs`
- `scripts/check-sg02-save-reload.mjs`
- `scripts/check-sg02-dynamic-body-owner.mjs`
- `scripts/check-physics-authority.mjs`
- Cross-SG reload gate: `scripts/check-sg03-save-reload.mjs` via `npm run check:combat`

`npm run check:sg02` runs the SG-02 intake, membrane, lab, production-authority, production-combat-port, tether, Massline break telemetry, dash-collision, and save/reload gates.

## Superseded Legacy Code

The old kinematic Rapier observer authority was removed from `src/core/rapierCollisionWorld.js`; that module now uses dynamic/fixed rigid bodies only. The default `custom` backend remains as the live fallback until save/replay and contact-event parity are closed.

## Known Limitations

- `rapier-dynamic` is explicit opt-in, not the default 47-A replay backend yet.
- `rapier-dynamic` still needs the 47-A/default-backend replay gate before it becomes the default backend. Pickup collection, live projectile hits, dock range events, and gate range events are live in the explicit backend and covered by `npm run check:sg02:authority`.
- SG-06 tactical AI remains registry-gated until the production ports are exercised by the live tactical system with encounter ownership and legacy intent/fire path deletion in the same milestone.
