# EC-G19 — One ladder — your rope gets stronger, and you can see what you carry

**Direct execution commission · Shared system**
**Commissioned by the creative director, 2026-11-10.** Decisions D3 and D4 in [10 — The game](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/10_THE_GAME.md).
**Native parents:** `P1`, `P2`, `P3`, `P4`. **Coordinate with:** EC-G05, EC-G07, EC-G16, and the five town commissions.
**This commission settles P3.** The five-branch pilot tree is not built. The ladder below replaces it.

## What was found in the code (2026-11-10)

The game has fourteen things that go up. A player can explain none of them in a sentence.

- **Four ladders that never meet:** research, Crucible unlocks, Swarm perks, faction and career standing.
- **The best ladder is invisible.** The Line has eight classes earned by lifetime tonnes held (`src/data/lineProgression.js`); each lets you control heavier bodies. It is exactly what the vision asks for — *"what can I do now?"* — and reaching a new class is shown only by the cable's colour and width. Nothing announces it. A second tonnage scale (`lineRating.js`) sits beside it.
- **Most upgrades are a number.** A 24,000-credit drill part adds four per cent to one ring. By contrast the Breaker head (16,000) makes a slammed rock split into throwable chunks — a new ability you feel at once.
- **Nothing you fit appears on the ship.** The table that maps parts to places on the hull exists and is not connected.
- **The starter ship is a trap:** it has only small slots, and the obvious next mining beam and cargo pod are medium.
- **Research is a second price tag,** not a path. Many nodes cost nothing.
- **Achievements reward nothing. Paint is sold from the first dock,** so it is never earned.
- **You cannot see what your hold is worth.** In flight the bar shows "used / cap u"; the hold panel says "N units · X u vol" with no price until you click a row, and only if you have met a buyer. "SCAN RISK" is hard-coded: 75 per cent with any contraband, otherwise zero.
- **Labels a player actually sees:** "MANIFEST ACQUIRED", "HOLD READS", "Avg Basis", "u vol", "R0-R1 local hauling", "Payload Conduction", "Attack Topology". There are two different screens called Ledger.
- **Money:** hauling contracts pay about three times what hunting does and four times what mining does.

## What to build

### 1. Line Class is the ladder
One sentence a player can say: **"My rope gets stronger the more weight I move, and each class lets me throw something bigger."**

- No experience points. Tonnes moved in **either door** count.
- Eight classes. Each names a size of thing you can now control and unlocks **one** new move. Write the eight as a list a player could recite.
- Reaching a class is an event: the cable changes, the screen says *"LINE CLASS III — you can now hold a loaded hauler"*, the next town you dock at remarks on it.
- The live rating becomes the readout of the same thing — *what can I throw right now* — not a second scale.

### 2. The world is gated by weight
Every one of the five towns holds something too heavy for a new player and visible from the first visit. You try it. It does not move. You come back.

| Town | The thing | Class |
|---|---|---|
| Helios | the Slipway's counterweight — move it and the harbor's sling changes | II |
| Tethys | a whole container string, off its track | III |
| Ceres | the Ninth Mouth's door | IV |
| Vesta | a plate straight from the pour | V |
| Sker | a hull off the Chop Line, with Vane watching | VI |

These are proposals; the town's builder may change the object, not the principle. No locks, no level text on the object. It moves or it does not.

### 3. Money buys sideways, not up
- Line heads and parts each add **an ability you feel within thirty seconds**. A part that only changes a number by a few per cent is cut or merged.
- The tech tree becomes the parts catalogue. Research points go.
- The starter ship gets a first purchase under 5,000 credits that fits and adds a move — an early Line head.
- Mining pays about what hunting pays.
- What you fit shows on the hull. Connect the existing table. *(With EC-G07.)*

### 4. Standings, paint and titles
Standings stay as keys to places and work. Paint, accents and titles are **earned** at class-ups and from deeds, not sold at the first dock. Achievements either grant one of those or are removed.

### 5. An honest hold
- In flight: what is in the hold, how much, and what it is worth where you are heading. One total on the bar.
- Scan risk is computed from what you carry and who is looking, or the readout is removed.
- Loose cargo you are towing counts and is shown.
- Plain labels throughout. One screen called Ledger.

**Also written out, 2026-11-10:** the eight classes by name, what each holds, the new move at each, the money table and what each hour of play is working toward are in [17 — The ladder, the prices and the long game](https://github.com/coldshalamov/SpaceFace/blob/experience-commissions/EC-G13-integration-director/design/program/experience-commissions/17_THE_LADDER_AND_THE_LONG_GAME.md).

## How to build this and check your own work

1. **Before:** shoot the hold panel, the ship screen and the tech screen on the bench (`node scripts/ui-bench.mjs --shot=<id> --walk`) and write down, from the pictures only, how a player gets stronger. That paragraph is your "before".
2. **The class-up first.** One class boundary, announced properly, in a real three-round Swarm run and in Adventure. If it does not feel like an event, nothing after it matters.
3. **One weight gate**, at Helios, tried too early and then with the class.
4. **Then the purchases:** for each part kept, a thirty-second trace before and after fitting it (`node scripts/agent-loop.mjs sim <scenario> --trace`). If you cannot see the difference in the trace, a player cannot feel it.
5. **Saves:** an existing save loads, keeps what it earned, and lands on the right class.

**The ways agents have fooled themselves on this project.**
- *Adding the new ladder beside the old ones.* The work is mostly removal.
- *A class-up that changes a number on a screen and nothing in the player's hands.*
- *Renaming research points instead of removing them.*
- *A gate enforced by a rule check instead of by the physics.*

## Finish line

- A new player, asked after twenty minutes how they get stronger, says it in one sentence.
- Every purchasable part passes the thirty-second trace.
- The hold's worth is visible in flight without opening anything.
- Nothing in the first hour uses a word from the list of labels above.

## Explicitly reject

An experience bar. A skill tree. Rarity colours. A second currency. Any upgrade described as a percentage.
