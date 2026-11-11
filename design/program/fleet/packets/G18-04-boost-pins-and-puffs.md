# G18-04 — Finish G18-03: re-pin the boost tests, add the ignition cough and turn puffs

**Commission:** EC-G18 §3. **Size:** small. **Tier:** D. Follow-up to G18-03 (commit 739a85eb).

## 1. Re-pin the boost, honestly
Boost top speed / cruise is now **2.0** by design (EC-G18: "boost up toward twice cruise").
- `test/pq-026-02-inertial-shunt.test.mjs:317` pins `boostSpeedMult === 1.55` → change to 2.0 and say
  why in a one-line comment (`// EC-G18: boost is twice cruise`).
- `test/fixtures/travel-drive-kernel-baseline.json` records the boosted cap 302.25 (195 × 1.55); the
  kernel now returns 390 (195 × 2.0). Re-freeze it **through the process its header documents** (read
  the header; use its re-freeze command or script). Never hand-edit numbers to match.
- Run every test that mentions `boostSpeedMult` or the fixture (`grep -rln "boostSpeedMult\|travel-drive-kernel-baseline" test`).

## 2. The two missing engine-feel pieces
- **Ignition cough:** when the engine lights from rest (throttle goes from 0 to > 0 while speed < 5),
  one short dark-grey exhaust puff behind the ship (0.4 s, fades). Reuse an existing puff/smoke
  sprite or particle emitter in `src/render/vfx.js` (search `smoke`, `puff`, `exhaust`).
- **Turn puffs:** on a hard turn (yaw rate above 70 % of the hull's max), small side-thruster puffs on
  the outside of the turn, at most 4 per second.
Both respect reduced motion (off when on) and cost no physics.

## Files you may edit
`src/render/vfx.js`, the thruster/engine presentation file you find (name it), the two test files and
the fixture above, `test/feel-feedback.test.mjs`. `git diff` first.

## Checks
`node --test test/feel-feedback.test.mjs test/pq-026-02-inertial-shunt.test.mjs` plus the tests found
in step 1; report all. Commit: `fleet(G18-04): boost tests re-pinned to twice cruise; ignition cough and turn puffs`.
