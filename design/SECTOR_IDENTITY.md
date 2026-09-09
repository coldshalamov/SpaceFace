<!-- LIFETIME: DURABLE_REFERENCE -->
# Sector identity — the way of life at Helios and at Ceres

> A sector identity is not a color grade. It is a way of life.
> — `design/VISION.md` Part II, "Every place needs a reason to exist"

The sentence this table exists to make true:

> **A player recognises Ceres from thirty seconds of activity and Helios from thirty seconds of
> different activity — not from a colour grade.**

So every row below is a claim about **activity**, and every row carries an observable that a machine
checks and a person can see. No row may be satisfied by a palette, a HUD label, a station name, or a
skybox. If the only way to tell the two places apart is to read something, the row is false.

## How the "today" column is measured

`scripts/lib/bench/scenarios/world.sector_identity.mjs`, seed **4242**, on the real path: the full
production node-safe manifest (`createAuthoritativeRuntime({ profileId: 'production' })`) with the
live `rapier-dynamic` authority and the shipping systems — `world`, `traffic`, `npcJobsRuntime`,
`lawSecurity`, `regionalEcology`, `sectorSim`. The bench **causes nothing**: it enters one sector,
stands the player off that sector's own pocket station by the sector's own declared dock radius, waits
24 s for the place to become itself, and then watches for **30 s**. Every number is a census of the
shipping world plus a tally of the shipping bus.

Two radii are reported for every row, because they answer different questions:

| Ring | What it is | What it answers |
|---|---|---|
| **750 WU** (pocket) | SG-02's physics reach — everything the sim is actually simulating | is this true of the place? |
| **144 WU** (on camera) | the shipping chase rig's own distance | can the blind reviewer SEE it? |

Counts are **per sample** (60 samples across the 30 s), so "2.667" means "between two and three of
these were standing here at any moment", not "two events happened".

Run it: `node -e "import('./scripts/lib/bench/scenarios/world.sector_identity.mjs').then(m=>m.measureSectorIdentity(4242).then(r=>console.log(JSON.stringify(r.comparison,null,1))))"`

The frames are captured separately by `scripts/capture-sector-identity.mjs`. **Note the seed gap:** the
browser route seeds its world from the wall clock at boot (`src/main.js`), and setting `state.meta.seed`
at the title screen does not survive New Game — so the captures run on the seed the run adopted, which
the manifest records, not on 4242. The numbers in this table come from the deterministic node bench;
the frames are evidence about the look of the same two places, not the source of any number here.

---

## Helios Prime — *the front door that trades and gets picked over*

Anchor: `station_helios` at (1280, −420), 180 WU standoff. 226 job/role-bearing actor-samples,
**73.5%** of them holding a real physics body.

| # | Dimension | The way of life | Today (seed 4242, 30 s) | True when |
|---|---|---|---|---|
| 1 | **Verb** | Ships come here to *sell and to pick over what died* | `salvor` 1.67, `patrol` 1.00, `miner` 0.10 per sample; bus: salvor ×6, patrol ×5 | salvaging is the dominant job kind in the pocket, and Ceres's dominant kind is not salvaging |
| 2 | **Rhythm** | A trade hub's day: mostly *moving*, punctuated by short work | 22 phase changes/min, 22 work events/min, **37.3%** of occupancy in work phases vs transit | work share stays below 45% — Helios reads as a place ships pass *through* |
| 3 | **Law** | Patrolled. A uniformed hull flies a standing beat | `patrol/faction_scn/job:patrol`, peak 1 lawful hull, flying a 4-beat route around the station | a lawful hull is present in the pocket and its enforcer identity differs from Ceres's |
| 4 | **Crime** | Quiet at the door; the trouble is out on the lane | 0 hostile hulls, 0 crime events in 30 s | **honestly zero today** — see "What is not yet true" |
| 5 | **Ships** | Pelicans and bastions — working hulls and a heavy | `ship_pelican` 2.67, `ship_bastion` 1.00, `ship_ironback` 0.10 | pelicans dominate the hull mix, and share under half their classes with Ceres |
| 6 | **Structures** | A trade hub, a marked freight lane, and old dead things | `rock:ast_common_rock` 39, `hulk` 6, `poi:beacon` 2, `poi:derelict` 2, `station:trade_hub` 1 | the pocket holds a trade hub, lane beacons and derelicts — none of which Ceres has |
| 7 | **Affordance** | You can dock and trade, or strip what is already dead | `cut_rock` 39, `strip_hulk` 6, `dock_and_trade` 1 | `dock_and_trade` and `strip_hulk` are available here and absent at Ceres's door |
| 8 | **Aftermath** | Hulls. Things that died here stayed whole and cold | `hulk` 6, `derelict` 2 | the residue is hulks and derelicts, not spilled cargo |

**On camera (144 WU):** a pelican working (`salvor`), the trade hub, `dock_and_trade`. No rock, no
hulk — Helios's rocks and wrecks are pocket-scale, not camera-scale.

---

## Ceres Belt — *the refinery yard that never stops handling ore*

Anchor: `station_ceres` at (−13388, 8812), 162 WU standoff. 120 job/role-bearing actor-samples,
**100%** of them holding a real physics body.

| # | Dimension | The way of life | Today (seed 4242, 30 s) | True when |
|---|---|---|---|---|
| 1 | **Verb** | Ships come here to *deliver ore and to service the machinery* | `hauler` 1.00, `tender` 1.00 per sample; bus: hauler ×6, tender ×2 | hauling and tending are running in the pocket, and neither appears at Helios |
| 2 | **Rhythm** | A yard's day: load, cross, unload, repeat — hands on cargo | 16 phase changes/min, 18 work events/min, **48.3%** of occupancy in work phases; `load`/`unload` present | work share exceeds Helios's, and `load`/`unload` phases occur here and not there |
| 3 | **Law** | Overseen, not patrolled — an SCN hull stands off the yard | `ship/faction_scn/doctrine:official`, peak 1 lawful hull, `roe: lawful_wanted_only` | a lawful hull is present and is a *different* enforcer than Helios's beat patrol |
| 4 | **Crime** | Quiet at the yard; the belt's trouble is out at the seams | 0 hostile hulls, 0 crime events in 30 s | **honestly zero today** — see "What is not yet true" |
| 5 | **Ships** | Mules and ironbacks — cargo hulls and a service tug | `ship_mule` 1.00, `ship_ironback` 1.00, `ship_hornet` 1.00 (no dominant class) | the hull mix shares under half its classes with Helios |
| 6 | **Structures** | A refinery, and the working props the refining produces | `rock:ast_common_rock` 24, `station:refinery` 1, `work_prop:ceres_refinery_cargo_pod` 1, `work_prop:ceres_refinery_disabled_hull` 1 | the refinery, its cargo pod and its disabled hull all stand in the pocket |
| 7 | **Affordance** | You can sell ore, and there is machinery to tow and service | `cut_rock` 24, `tow_or_service` 2, `sell_ore` 1 | `sell_ore` and `tow_or_service` are available here and absent at Helios's door |
| 8 | **Aftermath** | Spillage. Things break open here and the cargo gets loose | `hulk` 1, `spilled_cargo` 1 | spilled cargo is present here and absent at Helios |

**On camera (144 WU):** a mule and an ironback working (`hauler` + `tender`), the refinery, its cargo
pod, its disabled hull, `sell_ore`, `tow_or_service`, spilled cargo and a hulk. **Ceres's identity is
legible at camera range; Helios's is thinner at camera range than in the pocket.**

---

## The score

The two signatures differ on **6 of 8** columns on seed 4242, deterministically:

| Column | Differs | The sentence a viewer would say |
|---|---|---|
| verb | **yes** | salvaging and patrolling versus hauling and tending — no overlap at all |
| rhythm | no | 22 vs 16 phase changes/min is not a difference anyone feels |
| law | **yes** | a beat patrol flying a route versus an SCN hull standing off the yard |
| crime | no | neither place produced a crime in thirty seconds |
| ships | **yes** | pelicans and a bastion versus mules, ironbacks and a hornet |
| structures | **yes** | a trade hub with lane beacons and derelicts versus a refinery with its cargo pod and a disabled hull |
| affordance | **yes** | dock-and-trade and strip-a-hulk versus sell-ore and tow-the-machinery |
| aftermath | **yes** | cold hulls and derelicts versus loose cargo |

The bar this leaf commits to is **≥ 4 of 8**, pinned by `test/sector-identity.test.mjs`.

## What is not yet true (recorded, not hidden)

- **Crime reads the same in both places: zero.** In 30 s at either station's front door nothing
  criminal happens. This row is honestly false today. It must NOT be closed by spawning a pirate at
  a station — the packet's own reviewer checklist rejects "filling quiet with events", and
  `design/VISION.md` is explicit that ordinary life is the point of the quiet phase. The row becomes
  true when the *kind* of crime each place produces differs where it already exists (Helios's lane
  versus Ceres's seams), through the owners that already model it.
- **Rhythm is close, not distinct.** Helios 22 changes/min vs Ceres 16, work share 37.3% vs 48.3%.
  The direction is right — Ceres has hands on cargo, Helios watches ships pass — but neither margin
  is one a person would notice. `PQ-143.01` owns the rhythm.
- **Helios is thin at camera range.** In the 144 WU ring Helios shows one working pelican and the
  hub; its rocks, hulks, beacons and derelicts are all further out. Ceres shows six distinct things.
  Helios's identity is currently true of the *place* and under-served to the *camera*.

## The rule this table is not allowed to break

Identity is **activity**. A row is not satisfied by a different colour, a different skybox, a
different station name, a HUD label, or a map legend. If a row can only be verified by reading text,
it is not identity — it is a caption.
