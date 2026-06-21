# SG-02 Recovered Source Intake

Snapshot date: 2026-06-21.

Artifact: `C:\Users\93rob\Downloads\SpaceFace-SG02-recovered-source-partial.zip`

SHA-256: `6D3FE3CFC805A6454459E220D24225BE2989C4B3DE3E572BD74EAA4456E474AF`

## Intake Decision

This artifact is a recovery package, not a merge-ready SG-02 handoff. The package's own `SOURCE_RECOVERY.md` states that the original staged base64/gzip/tar stream was truncated, that `src/systems/flight.js` was partially reconstructed after truncation, and that the intended tests, handoff document, source ledger, integration fixture, schema/registry changes, and save changes were not recovered.

Accepted now:

- `src/core/physicsAuthority.js` as a complete, additive SG-02 command/telemetry membrane.
- `scripts/check-physics-authority.mjs` as the focused evidence gate for command consumption, body-spec derivation, telemetry isolation, and thruster-authority mutation.
- `src/core/sg02DynamicBodyOwner.js` and `scripts/check-sg02-dynamic-body-owner.mjs` as an isolated, non-production dynamic-owner lab proving the membrane can drive real Rapier dynamic bodies, plane locks, telemetry, thruster authority, SG-03-shaped impulse/attachment/reel/cut/telemetry ports over Rapier rope joints, and stable quantized snapshots.
- `scripts/check-sg02-intake.mjs` as the honesty gate that allows this partial membrane while failing future dynamic-authority markers unless the full handoff package, tests, fixtures, and reference ledger are present.

Not accepted yet:

- Bulk replacement of `src/core/physics.js`.
- Bulk replacement of `src/core/rapierCollisionWorld.js`.
- Bulk replacement of `src/core/flightDynamics.js`.
- Bulk replacement of `src/systems/flight.js`.

Those recovered files describe the likely SG-02 direction, but they replace proven current flight/physics behavior with async dynamic Rapier authority and Massline constraints without the missing tests, fixtures, save/schema migration, or replay evidence. Landing them as-is would create an unfinished structural branch.

## Known Integration Mismatch

The recovered `src/core/physics.js` exposes methods such as `applyImpulse(entityOrId, impulse)` and Massline-oriented tether methods. SG-03 does **not** call that shape directly. Its required `helpers.combatPhysics` port passes a single object, for example `applyImpulse({ entityId, impulse, point, reason, actionInstanceId, tick })`.

Do not wire the recovered physics object directly into `helpers.combatPhysics`. A real SG-02 landing must provide an adapter that accepts the SG-03 port exactly, resolves `entityId` to the real entity/body, forwards impulses/tether commands to the dynamic owner, and proves the adapter with SG-03 action/attachment traces.

## Current Boundary

Current master still uses the proven custom physics integrator plus optional kinematic Rapier observer. That observer still contains `kinematicPositionBased` and `setNextKinematicTranslation`; it is not SG-02 dynamic authority and must not be treated as one.

The accepted membrane and dynamic-owner lab intentionally do not install `helpers.combatPhysics` and do not make SG-03 movement or attachment actions succeed. Until an authoritative production SG-02 physics owner consumes these commands and exposes the SG-03 port, SG-03 must continue to reject those operations with deterministic `physics_port_unavailable:*` trace events.

## Required Evidence Before Dynamic SG-02 Can Land

- No gameplay body uses `setNextKinematicTranslation` or `kinematicPositionBased`.
- A dynamic Rapier body owner consumes `physicsAuthority` commands and is the only writer of physical pose/velocity/yaw.
- `helpers.combatPhysics` adapts SG-03 exactly: `applyImpulse`, `createAttachment`, `setAttachmentReel`, `cutAttachment`, and optional `getAttachmentTelemetry`.
- Assisted, drift, and newtonian modes operate on the same body authority.
- Tether stress tests prove cable violation, break tension/impulse tick, momentum error, no NaNs, and no tunneling.
- Thruster damage changes measured force/torque authority through the dynamic consumer, not only through the membrane.
- Replay hash and quantized physics snapshots are stable on the supported build.
- `npm run check`, `npm run check:flight`, `npm run check:combat`, `npm run check:sim`, and the new SG-02 acceptance script all pass.
