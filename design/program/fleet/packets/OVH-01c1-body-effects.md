# OVH-01c1 — Pilot Tree effects, wave 1: the body (Juggernaut + Bruiser)

> **Pipeline (director, 2026-11-19):** make NO git writes (this overrides `PROTOCOL.md`'s commit
> step). Edit surgically: other agents keep uncommitted work in the same files (`combat.js`,
> `weapons.js`, `ships.js`, `flightV3.js`, `massline*.js` all carry some) — never reformat, never
> normalise line endings (keep CRLF where a file has CRLF), never revert a hunk you did not write.

**Design:** `design/overhaul/06_PROGRESSION_AND_ECONOMY.md` §2 (the Juggernaut and Bruiser tables),
`03_COMBAT.md` §3 (damage against kick), `00_RULINGS.md` R5 and R12. Every node is **felt within
thirty seconds** of taking it, in the player's hands or on screen. No percentage soup.

## The contract every effect obeys

- **Read only** `pilotHas(state, nodeId)` / `pilotPoints(state, branchId)` from
  `src/data/pilotTree.js`. Never read or write `state.run.pilot` directly. Node ids are
  `<branch>_<snake name>`, listed below.
- **The player's ship only.** NPCs never get an effect.
- **Off means identical.** With no pilot record (Adventure, every NPC, a plain Swarm run with no
  picks) the game is byte-identical. `check:sim` (below) must pass unchanged.
- **Deterministic:** `state.rng`, `state.simTime`; never `Math.random`, `Date`, `performance.now`.
- **Single writers:** change a value inside the system that owns it; other systems send it
  intents/events. Do not add a second writer for mass, hull, helm or velocity.
- **A node that needs a system that does not exist** (name it) is **not built**: no stub, no
  placeholder. Report it.
- **Do not edit** `src/data/pilotTree.js`, `src/data/pilotLive.js`, `src/systems/runSession.js`,
  `src/core/runState.js` or any UI file. The director turns a node on for the draw after reviewing it.
- **Another builder is working on the rope and the powers right now:** do not edit
  `src/core/constraints/masslineController.js`, `src/systems/massline*.js` or
  `src/systems/powerVerbs.js` (reading them is fine). If a node can only be built there, mark it not
  built and say which file it needs.

## The kick stamp (build first; Bruiser stands on it)

"A body you kicked" = a body that took impulse from the player's shot. Find the existing attribution
for thrown/kicked bodies (kill credit for a thrown hull, the massline throw's owner, `lastHitBy` or
similar) and **extend it** with `{ by: <player id>, at: simTime, impulse }` written once, at the site
where a player projectile applies its impulse. Do not add a parallel field. A stamp is fresh for
4 s of sim time.

## The nodes

**Juggernaut — "I don't dodge. I'm the obstacle."**

| Node id | Tier | Effect (the threshold the test checks) |
|---|---|---|
| `juggernaut_ram_plate` | 1 | Your bow (contact within ±60° of the nose) takes no collision damage below 60 % of your cruise speed. |
| `juggernaut_ballast` | 1 | Your hull is 30 % heavier, in the physics body that collisions and the rope read: a body 3.5× your base mass reads ANCHOR without the node and TUG with it (R12: ANCHOR ≥ 3×). |
| `juggernaut_thick_skin` | 1 | After 4 s without taking damage, the armour layer (the hull if there is no armour layer) regrows at 4 % of max per second until full or hit. |
| `juggernaut_run_up` | 2 | Each second of unbroken boost adds 20 % of base top speed, up to ×2 at 5 s; the bonus drops when boost breaks. |
| `juggernaut_shoulder_check` | 2 | Boosting into a body applies the Thump family's kick to it along the contact normal, on top of the collision. |
| `juggernaut_snowplough` | 2 | Ramming an enemy no heavier than you at ≥ 50 % of cruise kills it (kill credited to you) and throws its pieces forward along your velocity (the existing hull-burst fling). |
| `juggernaut_unstoppable` | 3 | Collisions never take your helm (no tumble or helm loss from a contact). |
| `juggernaut_last_stand` | 3 | Below 15 % hull, collision damage you deal repairs your hull by the same amount, never above 30 % from this source. |
| `juggernaut_juggernaut` | ★ | Above cruise speed: you take no collision damage, and whatever you hit takes double collision damage. |

**Bruiser — "one shot and he's across the room, through his friends"**

| Node id | Tier | Effect (the threshold the test checks) |
|---|---|---|
| `bruiser_heavy_slugs` | 1 | Your Thump-family shots carry 30 % more kick (impulse, not damage). |
| `bruiser_stagger` | 1 | A body you kick cannot fire for 1 s of sim time. |
| `bruiser_billiards` | 2 | A loose body carrying a fresh kick stamp kills the first enemy it hits above the speed where collisions start to deal damage, whatever that enemy's hull (credited to you; once per kick). |
| `bruiser_pass_it_on` | 3 | When a body with a fresh kick stamp hits another body, the second takes the same kick impulse along the contact normal (one hop). |
| `bruiser_wall_splat` | 3 | A body with a fresh kick stamp that hits a wall or fixed body above the damage speed dies (credited to you); use the existing impact scorch/decal if one exists, and say if none does. |
| `bruiser_newtons_cradle` | ★ | A fresh-stamped body that hits another hands it all its momentum (the first stops), and the receiver is stamped as yours: up to five hops per kick. |

Not in this wave (they need systems that do not exist yet): `juggernaut_dozer_blade` (the plough),
`bruiser_cue_sight` (the cue line), `bruiser_bowling` (the energised stamp), `bruiser_through_and_through`,
`bruiser_breaker_rounds`. If you find one of them is already buildable, say so — do not build it.

## Tests

One test file, `test/ovh-01c1-body-effects.test.mjs`: for **every** node, a seeded with/without pair
on the threshold in its row (with the node: the change; without: none), using the real owner
systems, plus one test that an NPC with the same contact gets nothing. Build a pilot record the way
`test/ovh-01a-pilot-tree.test.mjs` does (`state.run = { kind: 'survival', pilot: … }`).

**Run:** your test file; the existing tests of every system you touched (find them by import);
`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.save-v27.expected.json --hash --repeat 3`
must pass unchanged.

**Report:** per node — built or not built (and why), file:line of the effect, the test name. Then
the kick stamp's field and where it is written, and every file you touched.
