# TASK: Cruise travel tier + interdiction hook (SpaceFace WS-A3) — WAVE 2

You are Codex in the SpaceFace repo. Read `design/GDD_2_0.md` §4.2 + §6.4 (interdiction hook only) and
`design/BUILD_PLAN_2_0.md` §0 (input contract — `state.input.actions.cruise` edge is ALREADY wired to V).
Study `src/systems/flight.js` + `src/core/flightDynamics.js` (profiles/multipliers), `src/systems/weapons.js`
(fire gating), and an existing system for the registry pattern.

## Build exactly this — new file `src/systems/cruise.js` + minimal hooks
1. State machine on `state.player.cruise = {phase:'off'|'charging'|'cruising', t}`:
   - `actions.cruise` edge while off → charging (3.0 s). Any damage taken, boost, or firing cancels charge.
   - Charge complete → cruising: maxSpeed ×4, mainAccel ×2.5, turn rate ×0.25 (apply via the flight
     profile override hook — find how per-mode tuning multipliers resolve in flightDynamics and inject a
     cruise modifier the same way; if no clean hook exists, add ONE well-named multiplier param to
     resolveFlightProfile consumed from player cruise state).
   - Weapons offline while charging/cruising: one guard in weapons.js player-fire path.
   - Drop conditions → off instantly: player takes damage, actions.cruise edge again, or MASS-LOCK —
     any entity with radius ≥ 60 wu (stations, capitals, large asteroids) within 180 wu.
   - Emit: `cruise:charging`, `cruise:engaged`, `cruise:dropped {reason:'damage'|'masslock'|'manual'}`.
2. Boost interplay: boost input is ignored while cruising (no stacking).
3. NPC traffic on lanes does NOT use this system (their existing lane movement stays).
4. `scripts/check-cruise.mjs` (sim harness): scripted run asserts charge time, speed multiplier applied,
   damage-drop, mass-lock drop near a station, weapons blocked while cruising, events fired in order.

## Constraints
- Files: new `src/systems/cruise.js`, `scripts/check-cruise.mjs`, package.json (one line), ONE guard
  clause in `src/systems/weapons.js`, registry registration (import + SYSTEMS + UPDATE_ORDER adjacent
  to flight), and IF unavoidable one multiplier hook in `src/core/flightDynamics.js`.
- Do NOT touch: input.js, tetherGameplay.js, mining.js, ai.js, render/UI/audio, goldens.
- Determinism rules as always; golden-drift protocol: hashEqual+nullDivergence → report only.

## Verify
```
node scripts/check-cruise.mjs && npm run check:flight:v3 && npm run check:sim:compare
```
Write the files. 10-line summary max.
