# C01-05 — The room does the twist: eight round mechanics

**Lane 2. Do after C01-04.** The thirty rounds' twist lines (`src/data/swarmCourse.js`) promise things the
room must actually do. Build these eight as round mechanics, each a small module the round turns on and off,
wired through the same special-round seam G08-02 used (`twistId`). Use the Foundry first (`helios_core`).

| Round | Name | The mechanic (exact) |
|---|---|---|
| 12 | Delivery | Enemies arrive **riding the freight string** (A01-02, `src/systems/freightLane.js`): 3 of the round's enemies spawn latched on containers and drop off at the lane's midpoint. A container cut loose before the midpoint takes its riders with it. |
| 13 | Lights Out | The arena's light rig drops to 25 % over 2 s and stays there for the round (go through the renderer's sector light owner — `src/data/lookMoods.js` / `src/render/look.js`, not a CSS overlay); the player's own lamps, engines and the lane lights keep full brightness. Restore on round end. |
| 19 | The Law | Lawmen and Cutters **stop for amber lane lights**: during a freight warning they hold position outside the lane until the string has passed (AI behaviour gate in their doctrine). |
| 20 | The Yardmaster | Twice during the boss fight the **freight lane reverses direction** (east→west), with the amber warning first. |
| 22 | Chain Gang | Enemies spawn in pairs **tethered together** through the existing attachments service; swinging one (Line latch) drags its partner. |
| 24 | Everything Must Go | For 90 s: floor prices ×0.5 (wall guns, Crate, Forge, Taps — `src/systems/swarmFloor.js`), spawn count ×2; a countdown chip shows the 90 s. |
| 28 | Black Friday | One of each of the eight drops (`src/systems/swarmDrops.js`) spawns over the round, and the round's cast includes one of every enemy type in the sheet (caps respected). |
| 29 | Quiet | 40 s of no spawns (a visible countdown), then **every gate opens at once** with the whole round's spawn. |

Mechanics a line names that are pure composition are C01-04's job, not this packet's.

## Rules
Determinism (`state.rng`, `state.simTime`); single writers (go through freightLane, attachments, swarmFloor,
swarmDrops, the light owner — never write their state directly); register any new system in
`src/runtime/authoritativeSystemManifest.js` and `src/runtime/nodeSystemFactoryTable.js` (PROTOCOL rule 8);
every effect ends cleanly on round end, run end, Keep going and save load.

## Checks
One focused test per mechanic using the real producers' payloads; `node --test test/swarm*.test.mjs
test/survival*.test.mjs` vs the known reds; looks through the lock at `--start-round=13` (Lights Out) and
`--start-round=29` (Quiet), describing what you saw.

Commits: one per mechanic, `fleet(C01-05): round <N> <name> — <what the room does>`.
