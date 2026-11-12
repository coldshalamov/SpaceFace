# SWARM-GRIND-01 — The Gravity Beacon gathers; it does not grind

**Lane 2.** Lead look 2026-11-12 (`scripts/fleet/looks/throw.mjs`, Swarm round 2, Ricochet Foundry): in ~5 s of
sim time **10 Wasp Swarmers (mass 16) died by collision with a player Fortify `beacon` body** — the
`entity:killed` payloads carry `impactorId` = the fortify structure. The device's own description
(`src/data/swarmFortify.js` `gravity_beacon`): *"A fixed well gathers light attackers and loose ordnance into a
readable ring."* Today its well (`field: { defKey: 'well', radius: 190, strength: 110, damping: 0, falloff: 1.6 }`)
pulls light hulls straight into its 12 WU static collider (mass 500), and the impact kills them: an 80-credit
grinder that clears rounds by itself and makes the throw pointless.

## Build
1. Reproduce first in a Node test (no browser): a Swarm run state with one `gravity_beacon` placed through the
   real fortify owner (`src/systems/swarmFortify.js`), eight light hostiles of the real Wasp Swarmer def inside
   its radius, step the real sim 10 s. Today: several die with `impactorId` = the beacon. Assert after the fix:
   **0 deaths caused by the beacon body**, and the hostiles end **gathered**: most within a ring band around the
   beacon (pick the ring radius from the field, e.g. 45–90 WU) and slow (|v| under ~40 WU/s) — a readable ring.
2. Fix it in the field/fortify owner, not by special-casing the kill: give the fortify well an inner hold (the
   pull fades to zero and damps inside the ring radius, so bodies settle on the ring instead of falling in),
   using the existing field parameters if the well supports them (`src/systems/fields.js` — read how `well`,
   `falloff`, `damping` and any inner/dead radius work before adding one). Only the **Fortify** gravity beacon
   changes; the player's own Pull power and other wells keep their feel (one-feel profile,
   `src/data/swarmFeelProfile.js`). If the cleanest fix is a property on the fortify device's field spec, add it
   there.
3. Check the other Fortify bodies the same way in the same test file: repulsor pylon, tesla pair endpoints,
   kinetic turret, reflector fin — a light hostile **pushed or flying into** one at ordinary speed should bounce,
   not die, unless the device's description says it damages on contact. Report each.
4. Thrown bodies (Line throws, freight) hitting enemies must still kill exactly as now — do not weaken
   collision damage globally.

## Checks
Determinism (`state.rng`, `state.simTime`); single writers. `node --test` for the new test, `test/swarm-fortify*.test.mjs`,
`test/swarm*.test.mjs` (compare against the known reds in `design/program/fleet/HANDOFF.md` §5 — no new reds),
`npm run check:sim`. Then the look, through the lock:
`node scripts/fleet/game-lock.mjs run -- node scripts/fleet/looks/throw.mjs .devshots/fleet/looks/grind/r2 2`
and report the `kills` line and the impactor types from `.devshots/fleet/looks/grind/r2-events.json`.

Commits: `fix(SWARM-GRIND): <what the player gets>`, one per device fixed.
