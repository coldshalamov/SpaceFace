# OVH-01c3 — Pilot Tree effects, wave 1: the guns (Gunner)

> **Pipeline (director, 2026-11-19):** make NO git writes (this overrides `PROTOCOL.md`'s commit
> step). Edit surgically: other agents keep uncommitted work in the same files (`weapons.js`,
> `combat.js`, `projectileFlight.js` carry some) — never reformat, never normalise line endings (keep
> CRLF where a file has CRLF), never revert a hunk you did not write. OVH-01c1 (the body effects)
> already changed `weapons.js` / `combat.js` for Heavy Slugs, Stagger and the kick stamp: build beside
> it, never over it.

**Design:** `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2 (the Gunner table), `03_COMBAT.md` §3
(damage against kick; the families: Hose, Thump, Needle, …), `00_RULINGS.md` R5. Gunner's motto:
"nothing survives the stream". Every node is **felt within thirty seconds** of taking it.

## The contract every effect obeys

- **Read only** `pilotHas(state, nodeId)` / `pilotPoints(state, branchId)` from
  `src/data/pilotTree.js`. Never read or write `state.run.pilot` directly.
- **The player's ship only.** NPCs never get an effect.
- **Off means identical.** With no pilot record the game is byte-identical; `check:sim` must pass
  unchanged.
- **Deterministic:** `state.rng`, `state.simTime`; never `Math.random`, `Date`, `performance.now`.
- **Single writers:** change a value inside the system that owns it.
- **A node that needs a system that does not exist** (name it) is **not built**: no stub. Report it.
- **Do not edit `src/systems/combat.js`** (another builder is tagging its camera events right now): damage
  changes go in `src/combat/damage.js`, the damage router.
- **Do not edit** `src/data/pilotTree.js`, `src/data/pilotLive.js`, `src/systems/runSession.js`,
  `src/core/runState.js`, any UI file, or the rope/power owners (`masslineController.js`,
  `massline*.js`, `powerVerbs.js`).

## The nodes

| Node id | Tier | Effect (the threshold the test checks) |
|---|---|---|
| `gunner_hollow_point` | 1 | Against a hull whose shield is down (or that has none), your shots deal 50 % more hull damage. |
| `gunner_steady_hands` | 1 | Your fire does not spread while you move: above 20 % of cruise speed your guns fire with zero spread. If spread does not exist for the player's guns at all, say so — the node is then not built. |
| `gunner_drum` | 2 | Your heat bar is twice as long: every player weapon's heat capacity × 2 (the forced vent arrives at twice the heat). |
| `gunner_spin_up` | 2 | Hose-family guns fire faster the longer you hold the trigger: cadence × (1 + 0.4 × held seconds), capped at × 1.8 at 2 s; releasing resets it. |
| `gunner_execution` | 3 | A hull below 20 % dies to your next hit and bursts into chunks (the existing hull-burst), credited to you. |
| `gunner_ricochet` | 3 | Your bullets bounce once off rock and walls: a projectile that hits a rock or a fixed wall reflects about the contact normal at 80 % speed, once, and keeps its damage. |

Not in this wave: `gunner_quick_vent` (feathering, OVH-08b), `gunner_shred` (armour plates as
throwable debris), `gunner_both_hands` (unless both weapon groups already exist as a player
concept — say what you find), `gunner_gold_thread` (the beam).

## Tests

One file, `test/ovh-01c3-gun-effects.test.mjs`: for **every** built node, a seeded with/without pair on
the threshold in its row, through the real owner systems, plus one test that an NPC gets nothing.
Build a pilot record the way `test/ovh-01a-pilot-tree.test.mjs` does.

**Run:** your test file; `test/ovh-01c1-body-effects.test.mjs`; the existing tests of every system you
touched (find them by import, e.g. `test/zc-a34-guns-nudge.test.mjs`);
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 3`
must pass unchanged.

**Report:** per node — built or not built (and why), file:line of the effect, the test name; every
file you touched.
