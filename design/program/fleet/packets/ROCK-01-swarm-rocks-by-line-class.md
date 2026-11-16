# ROCK-01 — Swarm rocks fit the Line ladder: pebbles are class-I ammo, boulders class II, monoliths are cover

Evidence: `.devshots/fleet/runs/PLOUGH-02-edges-and-rock-mass.dsx.*/RECEIPT.md` section 2 — every Swarm debris rock is over
the class-I limit (20 t): live masses pebble 114–469, boulder 910–3749, monolith 4214–17357; **0 of 24 rock bodies is
throwable at class I**, so THROW-02's "Swarm rocks are ammunition" does nothing in play and the aim tag says TOO HEAVY.

Design: doc 10 D3 "Line Class I to VIII is *the* progression … Each class is a size of thing you can now throw"
(`src/data/lineProgression.js`: I = 20 t, II = 100 t, III = 400 t); doc 12 "they are ammunition"; Wasps are 16 t.

## Lead decision
In Swarm arenas (`src/systems/swarmArena.js` `_spawnDebrisRock` and every path that funnels through it):
- **pebble** (r ≈ 9): live mass 12–18 t → class-I ammunition, the same weight class as a Wasp.
- **boulder** (r ≈ 18): live mass 60–95 t → class-II ammunition (TOO HEAVY at class I, throwable after the first upgrade).
- **monolith** (r ≈ 30): unchanged → cover / anchors.
Substances keep their relative order inside each band (metal heavier than silicate, wreck material lightest). Set
the mass where the rule reads it (the "live mass" the PLOUGH-02 table names — find why spawner mass and live mass
differ and set the one that matters). Adventure asteroids are unchanged.

## Tests
A Swarm pebble of every substance is ≤ 20 t and arms a throw at class I; a boulder is over class I and under class II;
a monolith stays over class III. SWING-01 numbers unchanged (Wasps). Run swarm arena / throw / plough tests before and after;
`npm run check:sim` green. Exact-path commits.
