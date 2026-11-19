# 04 — Swarm: the Pit, rebuilt for "one more run"

**Director, 2026-11-18.** Doc 12 (the Pit) stays the content: the floor, drops, freight, fifteen
enemies, thirty named rounds, bosses, Madame Kiln. This page changes **the loop around it** — how you
get stronger inside a run, what money is for, what you see — to the owner's frame: *Crimsonland's fast
specialisation, Zombies' floor, replay value from builds.*

## 1. What a run is

You walk into a lit industrial room with one ship and its stock gun. Things come through the gates.
Every kill pays Scrap (to spend on the floor) and experience (to level your pilot). Every level gives
you a pick from three cards out of the Pilot Tree, and by round ten your build has a name. Every fifth
round a boss; every tenth the room changes and you may refit. Win at thirty, or keep going. Die, press
Enter, and you are back in round one inside five seconds with a different build in mind.

A first win should take several tries (doc 10 §5.8). A good run lasts 20–25 minutes to the win.

## 2. The loop, second by second

| When | What the player sees and does | Notes |
|---|---|---|
| Title → SWARM → **PLAY** | One button over the key art. Arena, Kiln's mood and hull sit under it as three small choices that remember the last run. | §7 |
| ≤ 5 s later (warm) | Round 1 *Doors Open*: ten Wasps from one gate, rocks within reach. | Load is `10_ENGINE.md`. |
| First 15 s | The first throw. | FINISH-LINE row met at 8.95 s headed (BOT-02). Keep it. |
| Every kill | Scrap pops out as physical chips you fly through; XP ticks the bar. Kills by the room pay 2.5× both. | Chips exist (PERF-HOT-03); make them readable (they are 5–8 px today). |
| Level up | A chime, the bar flashes, "LEVEL 4" rides the bar. **No pause.** A pick is banked. | |
| Mid-round | Fly to a lit pad to buy: wall guns, the Crate, Taps, doors, traps, the Forge. | Doc 12 floor, unchanged. |
| The breath (4 s) | Banked picks are offered: three cards over the dimmed room. Press 1/2/3 or click. The breath stretches up to 10 s while picks wait. Re-roll costs Scrap. | Ruling R3. A setting lets players pick at once in 15 %-speed slow motion instead. |
| Round 5, 15, 25 | A boss with a trick (doc 12). | |
| Round 10, 20 | The room changes; **the Bench**: refit, change ship, cash out. The only menu in a run. | |
| Death | Run Over (§8). **Again** under Enter; back in round 1 inside 5 s. | |

**Retired:** the between-round **Armory / "Ship equipment"** screen (3 featured items, Rearrange,
Fortify, Re-roll, **Browse all** and its 101-item catalogue). Seen at 301d3fb074 (`02` B13). Gear is
on the floor; skills are on cards.

## 3. The Pilot Tree inside a run

The tree itself is in `06_PROGRESSION_AND_ECONOMY.md` §2. How Swarm uses it:

- **The engine already exists and is dead.** `src/systems/runSession.js` adds XP and emits
  `run:levelUp`; only an announcer and the HUD listen. Make the level-up bank a pick.
- **XP sources:** a gun kill 1, a room kill 2.5, each chain link +0.5 rising, a round cleared 10 × the
  round, a boss 100. (Starting values; tune by play.)
- **Level curve (target):** level 2 about 25 s into round 1; ~6 by round 3; ~14 by round 10; ~26 by
  round 20; ~32 by round 30. Faster early, so the build forms while the run is young. Today's curve
  (`RUN_XP_LEVEL_BASE` 100, `RUN_XP_LEVEL_STEP` 60, `src/core/runState.js`) is the knob.
- **The three cards:**
  - at least one from your deepest branch (so commitment always pays);
  - at least one from a branch you have not touched (so a pivot is always possible);
  - the third weighted toward what combines with what you have;
  - a **capstone** card appears only once a branch holds 5 points; an **evolution** card (two branches'
    prerequisites met — e.g. Hose + light-hull Rigging = *Orbital Saw*) can appear from 8 points.
- **A card is one line that changes your hands.** An icon, a name, one sentence: *"Thrown bodies keep
  going through the first thing they kill."* No percentage unless it is a threshold the player can see.
- **No respec inside a run.** Spreading points gives a capable generalist; depth gives the capstones.
  That is the replay value.

## 4. The style meter is the run's heartbeat

A real style meter exists today (`02` B8: "IGNITION 14 · MIXED +2 · NEXT FLARE 25 · DOUBLE", and a
second copy in the left panel). Keep the mechanic; fix how it speaks:

- **One place:** top centre, under the round name. Delete the left-panel copy.
- **Plain words:** the tier is a multiplier (×2, ×3, ×4) and a name Kiln would say at the top tier.
  Kinds of kills are said once in her voice — *"Off the wall."* *"That was his friend."* — not "MIXED
  +2 · TERRAIN +2 · DIRECT +2".
- **It multiplies Scrap and XP** and it drives the music's next layer (`09`) and the heat of your
  engine trail. The player hears and sees the meter climbing without reading it.

## 5. One economy, and fourteen systems become four

**Scrap** is the only money in a run. Doc 17 §3's numbers are the starting scale (gun kill 10, room kill
25, round 50 × n, boss 1,000; wall gun 500, Crate 950, Taps 1,500–3,000, doors 750–2,000, trap 400,
Forge 5,000). **Every run starts at zero Scrap** with the hull's stock gun. Difficulty is **Kiln's
mood** (Generous / Fair / Cruel): it changes how many come and how hard they press, never the player's
physics or purse (doc 19).

Code read at 301d3fb074 (`02` B14–B15). What happens to each system:

| System | File | Becomes |
|---|---|---|
| Starting purses 2,400 / 750 / 250 / 0 | `src/data/swarmStakes.js` | **Kiln's mood** — pressure, earn and score only; purse fixed at 0 |
| Armory prices from 18 cr; between-round shop | `src/data/survivalDraft.js`, `swarmDraft.js`, `swarmCatalog.js` | **Cut** from Swarm. Their verb-shaping fittings (heavier line, ram plate, whip snap…) become **Pilot Tree nodes or floor Taps**. The synthesised catalogue goes. |
| Weapon levels (+12 % rate per level) | `src/data/swarmWeaponLevels.js` | **Cut** (stat soup). The Forge is the gun upgrade. |
| Evolutions (consume parts → one evolved item) | `src/data/survivalEvolutions.js` | **Pilot Tree evolution cards** (cross-branch) |
| Perks (2-slot loadout earned by stars) | `src/data/swarmPerks.js` | **Fold** into account unlocks: stars unlock *starting* options (a hull, a starting card), never stats |
| Hangar (persistent +5 % hull/shield, +100 purse, price, rerolls, magnet per rank, paid in Bounty) | `src/data/swarmHangar.js` | **Cut.** It is stat inflation that makes skill matter less. Existing ranks convert to cosmetic marks; Bounty stops accruing. |
| Run XP / level | `src/core/runState.js`, `src/systems/runSession.js` | **The Pilot Tree engine** (§3) |
| Floor pads, Crate, Forge, Taps, doors, traps | `src/data/swarmFloor.js`, `swarmMods.js` | **Keep** — in every arena, on the one Scrap scale. Finish the five missing Forged forms (`form: null` rows). |
| Fortify (tower defence while paused) | `src/data/swarmFortify.js` | **Moves to Adventure** as yard defence (`05` §4). In Swarm, traps are floor levers (doc 12). |
| Drops (Full Rack, Heavy Hands, Dead Weight…) | `src/data/swarmDrops.js` | **Keep** |
| Ladder, zones, stars, daily seed | `src/data/swarmLadder.js` | **Keep** |
| Account unlocks | `src/data/survivalUnlocks.js` | **Keep** (possibility, never power) |
| Crossover ledger | `src/data/swarmCrossover.js` | **Keep and widen**: every item used in a run enters Adventure's catalogue |

Four systems remain in a player's head: **Scrap** (spend on the floor), **levels** (pick a card),
**stars** (open rooms and starting options), **the crossover** (what Adventure now sells).

- **Saves:** old Swarm profiles load; removed currencies are converted as above and stop accruing.
- **Tests that move:** every test pinning the removed shop, purse or hangar values. Rewrite or retire
  with the reason "superseded by `design/overhaul/04_SWARM.md` §5".

## 6. The room is a place you can see

**The biggest gap in Swarm** (`02` B1): the PLAY screen shows a lit factory floor with trusses,
conveyors, a furnace and panel banks; in flight the player sees black space, a nebula, rocks and flat
tan slabs. The room's walls, lanes, gates and machinery cannot be read. The key art is the target —
**the game must look like its own menu.**

### 6.1 A run happens in its own space

A Swarm round today runs inside the Helios sector (lead note 2026-11-15), and campaign life leaks in:
the AFTERMATH card, Helios ships counted as hostiles, Contract 47-A on the pause screen, a bot chasing
Helios traffic 16 k u away (`02` B18). Whack-a-mole gating (SWARM-LEAK-01, FIX-05) treats symptoms.

- **Requirement:** no campaign entity, notice, objective, count or voice exists in a run. A census at
  round start lists only run-spawned bodies and the arena set.
- **Constraint:** INV-08 measured that a clean-world rebuild must not add load time (the Swarm-only
  load tax was 28.7 s). The implementation belongs to the engine owner (`10_ENGINE.md` §3) within that
  budget; the Helios backdrop may stay as a sky.

### 6.2 Build the Foundry as a set

- **A deck under the fight.** The play plane sits above a lit factory floor 40–90 WU below it —
  plating, rails, conveyors carrying crates, the furnace mouth glowing and **lighting the deck around
  it**, pools of work-lamp light. It is scenery for light to land on, not collision.
- **Walls you can read.** The hard banks rise from the deck to the play plane with lit edges and
  hazard paint; bodies bounce off what the player can see.
- **Gates.** Each gate is a lit frame with a door that opens a second before arrivals.
- **The floor is legible from across the room.** Pads sit under their own lamps with a price sign
  readable at the default zoom; the freight lane has amber lane lights and a horn (A01-02).
- **One sun** for the room (a high shop lamp) casting the shadows of bodies onto the deck (`07` §2).
- **Then the other arenas**, one at a time (doc 15), each with its own set and its own hazard light.

### 6.3 The camera in a run

- The player's ship is at least **3 % of the frame width** at the default zoom and always the
  brightest-rimmed body on screen (`07` §6).
- At least one wall of the room is in view most of the time, so the player knows where they are.
- Speed still opens the camera (FEEL_CONTRACT §C).

## 7. The front door

- **Title → SWARM → PLAY.** The PLAY screen keeps the Foundry key art (`02` A4, the best image in
  the game). Under PLAY: *Ricochet Foundry · Fair · Hornet* as three small selectors.
- **Gone from the front:** the match-setup page's four modes, four purses, nine arenas, zone, weekly
  challenges and "seed, perks, hangar & records" (`02` A5). Gauntlet, Foundry Block, Daily, Practice
  and records live behind one **More** button.
- **Copy:** no "pressure %", no "Armory every round · Refit & boss every 10/5", no "Crucible" on any
  player-facing string.

## 8. Run Over — the screen that sells the next run

Today (`02` B17): strong bones, buried under ledger prose and unknowns. Rebuild to doc 19's sentence:

1. **Kiln's line** — eight words, about what you did.
2. **What killed you, named and shown:** the kind, the direction, a still of it. "Unknown weapon fire"
   and "?" hit bars are defects: the damage owner must always know its source.
3. **Your best moment in one sentence:** *"You put a Bruiser through the furnace door."*
4. Round, kills, best chain, time — big.
5. **Your build in one line:** *"Hummingbird — Rigger 9 · Gunner 4."*
6. **Again** (Enter) — back in round 1 inside 5 s. Then Hangar, Menu.

**Delete:** "5 cr banked into the hangar — the bounty now stands at 15522 cr", faction names on Swarm
enemies, "Converged on Starter loadout", "No draft taken".

## 9. What a run leaves behind

Stars open arenas and starting options. Records go on Berth Boards in Adventure towns. Every item used
enters Adventure's catalogue with where to get it. Tonnes moved count toward Line Class. Kiln's Dares
and the Nightly (doc 17 §5) come after the Course is winnable. Nothing makes the next run statistically
stronger.

## 10. Rounds one to ten must sing

The Course is written (doc 12) and cast (C01-04). The checks:

- Something is thrown in round 1 within 15 s; the freight lane runs by round 4 with Wasps on both sides;
  Iron Maw at 5 has its trick; the room changes at 10.
- Every round's name matches what the round *is* (doc 12 name test).
- The director looks at rounds 1, 3, 5, 7, 10 with a real pilot before any later round is touched.

## 11. Done when (the Swarm bar)

1. PLAY → round 1 fight in ≤ 5 s warm; the first throw ≤ 15 s into flight.
2. A stranger plays three runs, wants a fourth, and describes three different builds.
3. A gun-only build and a room-only build both win at Fair; the room build wins faster and richer.
4. The spending test (doc 12): ≥ 6 floor purchases in a ten-round run, all made by flying.
5. The census finds no campaign artifact in a run.
6. Round 20 holds 60 fps on the owner's laptop, preset low.
7. Every screen in the run passes the fresh-eyes look at 1280×720 and on a phone.
8. The owner ticks the card five out of five.
