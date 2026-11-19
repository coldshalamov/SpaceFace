# 05 — Adventure: from hired hand to the thing everyone's afraid of

**Director, 2026-11-18.** The owner's arc: *labour → capital → god-tier combat in a world at war.*
Docs 13–17 (jobs, outposts, arenas, the story, the ladder) stay the content. This page adds the spine
the owner described and fixes how the parts that exist present themselves.

## 0. The arc

| Stage | Hours (target) | You are | You earn by | You want next | The moment |
|---|---|---|---|---|---|
| **Hired hand** | 0–2 | the new hauler with a rope | jobs, bounties, trade runs, salvage, laser mining | your first Line head, a second gun, Class II | the raider into the rock; a first paid job |
| **Prospector** | 2–5 | a miner who knows rocks | the rover: cherry-picking the valuable vein | your first claim | the scan that shows platinum under the iron |
| **Owner** | 4–15 | owner of one to three working rocks | your yard's output, plus work | drones, defences, a heavier hull | the first night your yard runs while you're away |
| **Power** | 12–30 | a feared independent | yard income, heists, war contracts | the Swarm favourites, earned | bolting the Tumbler onto your hull |
| **Influence** | 25+ | a faction's problem | the war, your own lanes, raiding theirs | an ending | the warfront moves because of you |

The yard arrives when labour starts to repeat (about hour 3–4), not at hour 12 (doc 17 §2 is amended
here). Doc 17 §4's "hours" table otherwise stands.

---

## 1. Labour — Freelancer's familiar jobs, all physical (ruling R2)

| Work | What it is | What makes it physical |
|---|---|---|
| **Jobs** | Doc 13's written town jobs and heists | already authored around the rope |
| **Bounties** | a named target in a named place | a fight in a place with things to throw |
| **Trade** | buy low, sell high between stations | cargo is **mass**: a full hold makes you heavy (you swing differently, you win collisions); big lots are towed pods; routes carry interceptors; contraband draws customs |
| **Piracy** | crack a hauler, take its pods | guns or Breaker to split the pods loose, the Line to carry them, law heat to outrun |
| **Salvage** | wrecks — yours, others', old battles | pods and chunks first; Tear (Line Class VI) pulls whole parts off later |
| **Laser mining** | quick and random | the rock's mix comes out of the beam (§2) |

- **Every kind of work pays within a third of every other** per hour at the same stage (doc 17 §2).
  Measure with the economy bench (`06` §5) before tuning prices.
- **No job is a menu plus empty travel.** If the route between two places has nothing on it, the job
  is not offered until it does.

## 2. The graduation: laser → rover

The owner's mechanism exists in code: the laser cuts a weighted random mix from the rock's ore table
(`src/data/mining.js` `oreTable`, `02` C10). It is untaught. Make the graduation a moment:

1. Early on you can only mine one or two materials, so the laser is all you need.
2. As the Industry branch opens more materials, the valuable one becomes a quarter of what the laser
   brings up; your hold fills with cheap stuff.
3. The scanner's assay shows a rock's strata from space before you commit:
   *"Iron at the surface · platinum deep · two gas pockets."*
4. A job teaches the switch: Kroll at Ceres pays only for copper.
5. **The rover:** you set down on the rock and the camera dives into a lit cut-away (§3). You dig
   exactly to the vein you want.

## 3. Inside the rock — the board (ruling R4)

The law exists (`src/data/sites.js`: every machine reads its 8-cell contact ring; matrix, basalt, ore
veins as annuity or lump, gas as power or feedstock). The presentation and feel do not (`02` C5, C6).

### 3.1 How it looks

- **Dark inside, lit by you.** The rover's lamp is the main light; machines glow and light the rock
  around them; gas pockets glint; ice refracts the lamp. This is the most natural showcase in the game
  for "light that lands" (`07`).
- **Real geology, not a tiled photo.** Strata as bands that follow the rock's curve, veins that branch
  and thin, pockets with membranes, fracture lines in basalt. The grid appears only as a faint overlay
  while placing. Replace the repeated rock texture with visible seams.
- **The rock's silhouette is its own** (not a rectangle with ragged edges), so every claim is
  recognisable.

### 3.2 How it feels

- The rover moves at ~0.12 s per cell with acceleration (today `MOVE_CRUISE_INTERVAL_S` 0.24 s in
  `src/systems/drill.js`). Digging resists by material — matrix fast, basalt slow — with debris and
  sparks. No credit charge per move.
- One objective line. The tool bar shows only what you can build now.

### 3.3 The rules the board teaches (owner's sentences, built on `sites.js`)

| Block | Left in place it… | Dug out it gives… |
|---|---|---|
| **Matrix** ("dirt") | feeds silicate to touching extractors; lets a bigger chamber stand next to it | silicate |
| **Basalt** | anchors turrets; machines touching it shrug off raid damage | mineral mass, slowly |
| **Ore vein** | pays its ore forever to a touching extractor (the annuity) | a lump of ore now |
| **Gas pocket** | powers a touching generator; feeds refineries | a vent — it blows if you drill it carelessly (the tells exist) |
| **Ice** | cools a touching refinery or fabricator so it runs twice as fast | water |
| **Crystal / copper vein** | carries power through solid rock along its length, no cable | crystal / copper |
| **Buried wreck** (rare rocks) | an intact reactor powers everything you tunnel to it | salvage |

- **Chains, not conveyors.** Machines joined by a dug corridor share power and stock. The chains the
  owner described: gas pocket → generator → refinery → fabricator; generator → turret shaft →
  surface turret; extractor → hopper → dock port.
- **Bring it or dig it.** Machines are built from what the rock gives you or what you carry in your
  hold; the special parts (control units) are bought at stations, so hauling matters.
- **Backfill.** Carry synthetic blocks (made at a fabricator or bought) and refill cells you dug out —
  restoring a contact you wasted when you strip-mined like a noob.
- **Persistence.** Unclaimed rocks regrow slowly (`DRILL_GEOMETRY_RECOVERY_PER_S` exists); claimed rocks
  never regrow and never reset.
- **Readable consequences.** Hover a machine and its contacts light with what each gives. Hover a cell
  with the drill and the board says what digging it costs a nearby machine.

## 4. The yard outside — a place you fly to

A claimed rock looks claimed from the cockpit: lamps in the rock, a dock port, a hopper visibly
filling, a derrick, turrets standing on the shafts you drilled to the surface (they fire in 3D space),
transport drones leaving on a lane to the nearest station, security drones circling.

- **Fortify comes home.** Swarm's Fortify devices (Gravity Beacon, Repulsor Pylon, Tesla Pair, Kinetic
  Turret, Reflector Fin — `src/data/swarmFortify.js`, `02` B16) become yard defences you **tow into
  place** with the Line.
- **Raids.** When your stock is worth stealing and your defences are thin for the sector, someone
  notices: Static says so on the radio, then a **named Swarm round is fought on your ground** with your
  lane, your traps and your turrets (doc 17 §6). Win and the wrecks go in your hopper; lose and one
  module is damaged, never the whole yard. If you are elsewhere, your defences fight without you and
  the result is written into the yard (wreckage, a scorched module) for you to see when you return.
- **Retired screens:** Base Operations and Automation (`02` C7, C8). What they showed moves to the yard
  itself, to a Chart layer "My works" (one icon per claim: producing, raided, stalled), and to a
  dock-side line when you land: *"Your drones brought in 340 copper — 6,800 cr."*

## 5. Money from capital — no ceiling, real risk

`src/systems/automation.js:18` routes passive income through one global token bucket (~113 cr/min,
~6.8 k cr/hour, shown as "shared ceiling" and "cap load" — `02` C8). That ceiling makes the owner's
"really get powerful" impossible. Replace it with limits a player can see and fight:

1. **Drones carry finite loads** on real lanes, and lanes can be intercepted. Loss rate follows sector
   danger. Security drones and escorts cut it.
2. **Upkeep** — fuel, repairs, and the parts that wear.
3. **Markets saturate.** Selling 500 units of iron at Helios drops its price there; prices recover over
   time and differ by station, which keeps trade routes alive.
4. **Raids** (§4).

Target: a well-built yard in a dangerous sector earns three to five times what labour pays by hour
ten. A self-running yard is the "Vice City business" feeling — and it exists to pay for the fight.

## 6. The god-tier, earned

Each Swarm favourite has an **Adventure story**, not a shop row:

- **The Tumbler** (the gravity-blast long gun, `03` §10): a prototype in a vault aboard a derelict in
  a frontier sector — a heist.
- **Forged guns:** a Vesta job plus materials your yard produces (doc 11 §7).
- **Bends:** Zell at Sker, or earned from a town's people.
- **Heads:** the first under 5,000 cr (doc 17); the story heads from places.
- **Heavy hulls:** bought, or taken — and a heavy hull changes how the rope plays (`03` §2).
- **The unlock is staged.** In the hangar the part is bolted onto your hull where everyone can see it;
  Static mentions it; the next town has noticed. Then the places that beat you in hour two become your
  playground.

## 7. The world at war

- **Factions: fourteen become four or five that matter** (`src/data/factions.js` lists 14 at
  301d3fb074). The rest become local colour inside those. Each faction holds lanes and stations; a
  warfront between two of them moves.
- **Your yard can supply a side.** Deliveries strengthen that side's patrols in neighbouring sectors.
- **Heat, GTA-style.** Law answers in tiers — a patrol, interceptors, a cutter, a capital ship — and
  the Ghost branch (`03` §11) is how you shake it.
- **Heists** (doc 13) are the set pieces; stealth is how the clever player does them.

## 8. The first hour (with doc 20)

Doc 20's storyboard and D6 stand. The ledger's findings (`02` C1) add:

- **The opening is not empty.** Stage it within sight of Helios's lights (today the opening is
  ~1,100 WU from the station), with working traffic doing jobs, so the first minutes look like a busy
  harbour at golden hour (README ruling 2).
- **One voice.** The stale "Latch the loose rock." line, world news ("OFFICIAL DENIAL") and the
  "Overhead | Circuits" control are silent during lessons.
- **Every verb from the start (R7),** each introduced by a situation, never by a gate.
- **The claimed-salvage beat waits for the player's choice** before any heat or theft fires (ACCEPT-07).

## 9. Death makes a job (doc 10 D8)

Your wreck and cargo stay where you died; you wake at the nearest berth with a line to the wreck; a
salvor is already heading there. Unchanged; inspect it (`02` C17).

## 10. Done when (the Adventure bar)

1. A fresh player can say what they are working toward at minutes 20, 60 and 180.
2. At hour 3–4 a player claims a rock, and the claim is visible from the cockpit.
3. The board passes a stranger's look: they can say why a machine produces more than its neighbour.
4. Income has no global ceiling; a yard can be raided and defended; the numbers in §5 hold in the
   economy bench.
5. Every Swarm favourite has a place in Adventure where it is earned, shown in the catalogue.
6. Each of the five towns passes the Stranger Test (doc 09 §6).
7. The owner ticks the card five out of five in Adventure's first hour and again at hour three.
