# OVH-01c2 — Pilot Tree effects, wave 1: the rope and the powers (Rigger + Conjurer)

> **Pipeline (director, 2026-11-19):** make NO git writes (this overrides `PROTOCOL.md`'s commit
> step). Edit surgically: other agents keep uncommitted work in the same files (`powerVerbs.js`,
> `masslineImpacts.js`, `masslineThrow.js` carry some) — never reformat, never normalise line
> endings (keep CRLF where a file has CRLF), never revert a hunk you did not write.

**Design:** `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2 (the Rigger and Conjurer tables),
`03_COMBAT.md` §2 (the rope) and §4 (the five powers: Pull, Shove, Pin, Bomb, Rig),
`00_RULINGS.md` R12 (TOW / TUG / ANCHOR). Every node is **felt within thirty seconds** of taking it.

## The contract every effect obeys

- **Read only** `pilotHas(state, nodeId)` / `pilotPoints(state, branchId)` from
  `src/data/pilotTree.js`. Never read or write `state.run.pilot` directly.
- **The player's ship only.** NPCs never get an effect.
- **Off means identical.** With no pilot record (Adventure, every NPC, a Swarm run with no picks)
  the game is byte-identical; `check:sim` below must pass unchanged.
- **Deterministic:** `state.rng`, `state.simTime`; never `Math.random`, `Date`, `performance.now`.
- **Single writers:** change a value inside the system that owns it.
- **A node that needs a system that does not exist** (name it) is **not built**: no stub. Report it.
- **Stay inside the rope and power owners** (`src/core/constraints/masslineController.js`,
  `src/systems/massline*.js`, `src/systems/powerVerbs.js` and the five power owners it calls, their
  data). **Do not edit** `src/systems/weapons.js`, `src/systems/combat.js`, `src/systems/flightV3.js`,
  `src/systems/ships.js`, `src/systems/collisionConsequences.js` (another builder is working there
  right now), nor `src/data/pilotTree.js`, `src/data/pilotLive.js`, `src/systems/runSession.js`,
  `src/core/runState.js` or any UI file. If a node can only be built in one of those, mark it not
  built and say which file it needs.

## The nodes

**Rigger — the rope (reads your hull's mass)**

| Node id | Tier | Effect (the threshold the test checks) |
|---|---|---|
| `rigger_long_reel` | 1 | The line reaches 50 % further: a body at 1.3× the base reach latches with the node, not without. |
| `rigger_quick_latch` | 1 | Inside 120 WU the latch is instant (no acquisition or hold time). |
| `rigger_free_hand` | 1 | Firing while latched has no aim penalty. **If no latched aim penalty exists today, this node is not built** — say what you found. |
| `rigger_sweet_spot` | 2 | The release window doubles, and a release inside the window adds 25 % speed to the thrown body. If there is no release window today, say what release timing exists. |
| `rigger_crane` | 2 | A body on your line hits as if it were twice as heavy (the towed-impact damage owner). |
| `rigger_second_line` | 3 | Two lines at once: the run grants the existing `twin_bridle` capability; without the node a second line is refused as today. |
| `rigger_whip_snap` | 3 | Tapping reel mid-swing snaps the line and flings the body at 1.5× its current speed, without finishing the swing. |

**Conjurer — "one press and the whole field moves"**

| Node id | Tier | Effect (the threshold the test checks) |
|---|---|---|
| `conjurer_quick_cast` | 1 | Powers recover 25 % faster (each power's recovery time × 0.75). |
| `conjurer_wide_bore` | 1 | Powers reach 40 % further (each power's radius or range × 1.4), all five. |
| `conjurer_deep_cast` | 1 | Holding a power key before release deepens it while you keep steering: strength rises from × 1 at 0.4 s of hold to × 1.5 at 1.2 s. A tap is unchanged. Build it on the existing hold-to-preview. |
| `conjurer_echo` | 3 | Every power fires twice: the second at half strength, 0.5 s of sim time later, at the same aim. |
| `conjurer_combo` | 3 | A body touched by two different powers within 2 s detonates: the Bomb's blast at 60 % strength at that body (credited to you), once per body per 2 s. |

Not in this wave: `rigger_hummingbird` (needs flight and gun owners), `rigger_coupler` (the Coupler
head, OVH-07), the Rigger capstone, the fifteen bends (they arrive with the powers rebuild, OVH-05),
the Conjurer capstone (the plough).

## Tests

One file, `test/ovh-01c2-rope-power-effects.test.mjs`: for **every** built node, a seeded
with/without pair on the threshold in its row, through the real owner systems, plus one test that an
NPC gets nothing. Build a pilot record the way `test/ovh-01a-pilot-tree.test.mjs` does.

**Run:** your test file; the existing tests of every system you touched (find them by import,
e.g. `test/r12-line-relation*.test.mjs`, the power tests);
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 3`
must pass unchanged.

**Report:** per node — built or not built (and why), file:line of the effect, the test name; every
file you touched.
