# SWING-01 — Is swinging a held body weaker than throwing it, and not limp? (deterministic sim test)

The design (doc 11/12 and the lead's hammer rule) says: the thrown body is the payoff; swinging a held body through
enemies should still hit (not limp) but clearly less than a throw. Today a held body's contact damage is scaled by
`HELD_BODY_CONTACT_DAMAGE_SCALE` in `src/systems/collisionConsequences.js` (and the whip recoil in
`src/systems/masslineImpactDamage.js` uses the hammer rule). Browser measurements were too small to judge
(samples of 1–8). Build a **node test** (no game boot) that answers it deterministically.

## Do this
1. Write `test/swing-01-held-vs-thrown.test.mjs` using the existing sim harnesses (look at
   `test/throw-01-*.test.mjs` and `test/massline-*.test.mjs` for how they build a state, latch a body, and step
   the sim). Scenario, seeded: the player latches a light hostile ship; five hostile Wasps stand in a tight cluster
   in the swing path. Case A: swing the held body through the cluster for 1.5 s without releasing. Case B: same
   setup, release (throw) toward the cluster at the release window, then step 1.5 s. Count kills and total damage
   dealt to the five in each case, over 10 seeds.
2. Print the numbers (kills and damage per case, mean over seeds) and assert the design's shape: thrown kills >
   held kills, and held damage > 0 (swing is not limp). Do NOT tune any value in this packet.
3. Report the numbers in the receipt; if held damage is ~0 or held ≥ thrown, say so plainly — the lead decides the tuning.
Run only this test and its neighbours' files; `npm run check:sim` must stay green (you add no sim code).
Commit the test by exact path per the protocol.
