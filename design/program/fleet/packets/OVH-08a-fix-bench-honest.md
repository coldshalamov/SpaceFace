# OVH-08a-fix — Make the gun-curve bench honest, then measure every gun

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit only `scripts/bench-gun-curve.mjs` and
> `test/ovh-08a-gun-families.test.mjs` (both are this batch's own new files) unless a fix truly needs
> `src/data/gunFamilies.js` (pure data; say why). Never edit simulation or weapon code.

**Context:** `scripts/bench-gun-curve.mjs` (OVH-08a, `design/program/fleet/packets/OVH-08a-gun-curve-bench.md`)
measures every gun in `src/data/weapons.js` on damage against kick, against the family bands in
`src/data/gunFamilies.js` (`design/overhaul/03_COMBAT.md` §3.1, ruling R5). An adversarial review found
three places where the bench disagrees with the live game (verbatim below). The bench must model the
game exactly, or the gun tuning that follows (OVH-08b) will tune to a fiction.

## The three findings to fix

- **MED · BLOCKS · Part 4 (OVH-08a)** — The bench fires some guns faster than the game. Bank Stream M’s 14 rounds per second rounds down to a four-tick interval in the bench. The live cooldown takes five ticks to reach zero. The bench reports a 21-shot kill in **1.333 s**, versus **1.667 s** with the live cadence alone. Use the live cooldown rule for both held fire and the overheat calculation. [bench-gun-curve.mjs:158](/C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/bench-gun-curve.mjs:158) · [bench-gun-curve.mjs:468](/C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/bench-gun-curve.mjs:468) · [weapons.js:832](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/weapons.js:832)

- **MED · BLOCKS · Part 4 (OVH-08a)** — The Singularity Mortar’s **4.3 s** kill and displacement come from applying full blast damage and forward kick on the impact tick. The live shell pulls for **1.1 s** after landing, then applies radial damage and impulse with distance falloff. Run the real mortar lifecycle or mark its full TTK and displacement as unmeasured. [bench-gun-curve.mjs:503](/C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/bench-gun-curve.mjs:503) · [weapons.js:2297](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/weapons.js:2297) · [weapons.js:2326](/C:/Users/93rob/Documents/GitHub/SpaceFace/src/systems/weapons.js:2326)

- **LOW · BLOCKS · Part 4 (OVH-08a)** — The two-second shove probe integrates 121 ticks because it integrates tick zero and checks the stop condition after integrating tick 120. Concussion Cannon M travels **115.96 WU** in the reported probe versus **115.00 WU** over exactly two seconds at the measured speed. Stop after 120 integration steps. [bench-gun-curve.mjs:514](/C:/Users/93rob/Documents/GitHub/SpaceFace/scripts/bench-gun-curve.mjs:514)

## Do

1. Fix each finding so the bench reproduces the live rule: fire cadence from the same cooldown arithmetic
   the weapon system uses (ticks to reach zero, not a rounded interval); the mortar's real lifecycle (the
   pull window, then radial damage and kick, as the live shell does); the probe integrates exactly 120
   ticks for two seconds. Where possible, call the live helpers instead of re-deriving them.
2. Add a test per finding that fails on the old arithmetic and passes on the new (compare against the
   live helper's numbers, e.g. Bank Stream M's five-tick cooldown).
3. Run the bench over every weapon and write the table to `.devshots/gun-curve/report.md` (family, gun,
   time-to-kill on the reference target, displacement, in-band or off-band and by how much).
4. Run `node --test test/ovh-08a-gun-families.test.mjs` and
   `node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 5` (must pass unchanged).

**Report:** each finding and its fix (file:line), the new tests, and the off-band guns from the table
(the worst ten first) — those are the tuning list for OVH-08b.
