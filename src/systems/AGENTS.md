# src/systems/ agent orientation

Registered systems implement `init(ctx)` and `update(dt, state)` and run in the order owned by
`src/core/registry.js`. Use generated `docs/SYSTEM_REGISTRY.md` for navigation; do not copy the order
into this file.

## Important routing

- Flight: `flightV3.js`; shared math in `src/core/flight/`. `flight.js` is compatibility/test scope.
- AI: `tacticalAI.js` + `src/ai/`; `aiPorts.js` executes decisions. `ai.js` is compatibility scope.
- Hostility/fire authority: `src/ai/engagementAuthority.js`; read `docs/COMMON_BUGS.md` before edits.
- Combat: registered `combat.js` plus shared `src/combat/` library.
- Tether: `tetherGameplay.js` coordinating combat attachments, weapons, physics, and focus/camera.
- Economy/cargo/factions/heat/ships: honor the root single-writer contract.
- Missions/story/onboarding: verify public-route reachability and ordering, not only generated offers.
- Presentation orchestrators consume presentation data; they do not replace render/UI ownership.

## Imported helpers in this directory

Some files are libraries rather than registered ticks. Confirm importers in `docs/SYSTEM_REGISTRY.md`
or with `rg` before changing cadence/ownership. Examples include danger/economy-cycle, alphabet,
gamepad, telemetry, and touch helpers.

## Verification

Run the narrow subsystem test/check, then sim comparison for sim-affecting changes. AI/combat/flight
feel also requires a representative encounter or player-route proof.
