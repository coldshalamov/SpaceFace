# AIM-01 — At a human's aim error, does the Line take the Wasp or the room? (node sweep, then fix)

Staged browser fixture data (THROW-01, `.devshots/fleet/looks/throw-fixture/f4.json`, `f5.json`, `f6.json`): with the
hostile slightly off the pointer, 17/38 and 18/40 latches went to stations (Foundry room solids are type `station`, a
dozen within 250–410 u), pickups and payloads; exactly under the pointer, 3/16. Real players aim like f5. Swarm route
runs keep latching pickups and never throwing.

## Do this (no game boot)
1. Extend `test/throw-01-hostile-beats-overlapping-station.test.mjs` (or a new `test/aim-01-latch-sweep.test.mjs`) into
   a sweep using the real selection/scoring code in `src/systems/tetherGameplay.js` (the acquisition / latch pick):
   a moving Wasp (light hostile, throwable) at 120–200 u; Foundry-like room solids (type `station`, big radius) at
   250–410 u in the cone; one pickup and one payload in the cone. Cursor offsets 0, 10, 20, 30, 45, 60 world units off
   the Wasp, in four directions, with the Wasp moving at typical Swarm speed. Print a table of who wins per offset.
2. **Lead decision if the Wasp loses inside a normal aim error (≤ 45 u):** in a Swarm run, a throwable hostile anywhere
   in the acquisition cone outranks room solids, payloads and pickups (those still win when no throwable hostile is in
   the cone, so anchor swings and pickups keep working). Implement it in the scoring (Swarm-only), keep Adventure
   unchanged, and make the aim tag name the same winner (it already reads the same selection).
3. Assert the new table: Wasp wins at every offset ≤ 45 u with room solids/pickup/payload present; with no hostile in
   the cone, the nearest valid body still wins as before.
Run the throw-01 / massline / tether test files before/after; `npm run check:sim` green. Exact-path commits.
