# EC-G18 — One feel, one set of keys — the throw is the same in both doors

**Direct execution commission · Shared system**
**Commissioned by the creative director, 2026-11-10.** Decisions D1 and D10 in [10 — The game](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/10_THE_GAME.md).
**Native parents:** `X5`, `E3`, bible `VERBS` and `FEEL`. **Coordinate with:** EC-G08, EC-G10, EC-G11, EC-G16.

## What was found in the code (2026-11-10)

There are two games here. Swarm has the powers the vision describes. Adventure, which is what a new player gets, runs older, softer versions of the same powers on different keys.

| | Swarm | Adventure |
|---|---|---|
| Pull | a 1.2-second yank (`src/data/swarmFeelProfile.js`) | a nine-second field that draws bodies in at 45 units a second, seven-second cooldown (`src/data/fields.js`) |
| Shove | a 0.35-second punch | a seven-second ring, eight-second cooldown |
| A thrown body kills what it hits | yes | no — Swarm-stamped bodies only |
| The Line | right mouse button | Space |
| Boost | Space | Shift |
| Keys in use | one small set (`src/data/swarmControls.js`) | about thirty (`src/core/input.js`), including CapsLock, backtick, apostrophe, comma, period, NumLock, brackets |

Also found: boost on the starter ship is about one and a half times cruise where the design says two; the engine feel set in `FEEL` (redline shake, thruster puffs, ignition cough, pitch on thrust) has no code at all; a light kill gives the camera nothing; the camera beat on a slingshot release is deliberately switched off in Swarm.

What is already right and must be protected: earned speed is never braked away; release timing is graded; mass decides who moves; hit-stop and shake scale with mass.

## What to build

### 1. One feel
Swarm's phase tables for Pull and Shove become the default everywhere. A thrown body keeps its killing speed through a collision in Adventure too. Adventure adds consequences — witnesses, law, spilled cargo — not softer physics.

This changes simulation results. The deterministic references will move. That is expected: follow the repository's reference process and record the change openly. Never edit a reference to make a check pass, and never keep the soft numbers to keep a reference still.

### 2. One set of keys
Six things for the hands, the same in both doors:

| Action | Keyboard and mouse | Controller |
|---|---|---|
| Move | W A S D | left stick |
| Aim | mouse | right stick |
| Fire | left button | right trigger |
| **The Line** | right button | left trigger |
| **Boost** | Space | A |
| Powers | 1–5 | bumpers and face buttons |

Interact and Map keep one key each. **Everything else goes on one context wheel** or happens automatically: bullet time, cloak, gyre, bomb cycling, cargo dump, travel drive, full stop, winch. Rebinding and saved bindings keep working; an existing player's custom keys are not thrown away.

### 3. The feedback that is missing
- A small camera beat on every light kill and on every slingshot release, in both doors.
- The engine feel set from `FEEL` §2: redline shake, thruster puffs on a hard turn, an ignition cough, pitch that rises with thrust.
- Boost up toward twice cruise, with a ring behind the ship when it lights.

Feedback comes last. If the throw is not satisfying with all of it switched off, fix the throw.

**Also written out, 2026-11-10:** controller parity, the Line's latch cone, the four first prompts and the motion settings are in [19 — What players expect](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/19_WHAT_PLAYERS_EXPECT.md).

## How to build this and check your own work

1. **Before:** fly the same thirty-second scene in each door and keep the traces — `node scripts/agent-loop.mjs sim <scenario> --trace` for Adventure, `npm run player-truth -- --mode=swarm --rounds=3` for Swarm.
2. **One power at a time.** Change Pull in Adventure, look at the trace, then Shove, then the bowling-pin rule.
3. **After each:** the one narrow test, then `npm run test:fast`. The reference process once, at the end, not after every edit.
4. **Keys:** a first-time player's hands, not a table. Use the controls screen on the bench (`node scripts/ui-bench.mjs --shot=<id> --walk`) and a real three-round run.
5. **Proof for a stranger:** two ten-second clips, one from each door, in which a fresh reviewer cannot tell which mode produced which throw.

**The ways agents have fooled themselves on this project.**
- *Keeping the old numbers behind a flag "for safety".* Two feels is the defect.
- *Adding shake and particles to a throw that still does not kill.*
- *A context wheel that needs its own tutorial.*
- *Calling it done from a trace without watching a clip.*

## Finish line

- Pull, Shove and thrown-body kills behave identically in both doors.
- The Line and boost are on the same input in both doors.
- A new player needs six inputs for the first hour.
- The ten-second test in [10](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/10_THE_GAME.md) passes in Adventure as often as it does in Swarm.

## Explicitly reject

A third tuning profile. A difficulty option that restores the soft powers. More keys. A settings toggle called "classic".
