# SpaceFace — World Placement & Experience Audit

*How SpaceFace places its assets, NPCs, enemies and set pieces, how those placements create the game, and a plan to make each of the 25 sectors its own place.*

Source: `coldshalamov/SpaceFace` @ `master` (2026-10-11). Every count below comes from reading or scripting the data modules. Scores are **audit scores from the source**: they rate what is authored and placed, not a playtest. Where something is my inference rather than a code fact, it says so.

---

## 0. Executive summary

**The core is excellent. The rest of the galaxy is a strong blueprint that hasn't been built out yet.**

1. **Ceres and Helios are hand-made. Most other sectors are not.** Ceres alone has 4 camera-scale activity pockets (9 actor slots), 4 one-offs, Kilnback, Pallet Jack, Red Kite, Tally Three, Sable Venn, Towline Table, the Kettle Line, the Wreck Cathedral and the Ilex Ark's destination. Helios has Vesper, Morrow, 5 one-offs and the Candle Fleet. The 14 rim sectors (Nyx → Dione) appear in only **10–16 source files each**, compared with **35–64** for the 10 core sectors. Each rim sector has roughly 1 station, 2 fields, 1 one-off, 1 lane contact, a way-of-life row, a composition and its frontier zones.
2. **Most encounters are templated.** 176 of the 281 encounters are generated "lived" vignettes: **30 nouns × 6 zone types**, all `situation: toll`, played by the same 3 archetypes (`choir_zealot`, `mule_trader`, `patrol_lawman`) through the same phase verbs. That's a lot of content, but it feels like one scene repeated. `situation: toll` accounts for 179/281 encounters.
3. **Encounters follow zone *type*, not sector.** `livedWorldDirector` scans `zoneAt(player)` every 6 s and fires by zone type. Only about 15 encounters are gated to a specific sector. So a `trade_lane` in Dione looks the same as one in Tethys. This one structural fact causes most of the "same everywhere" feeling.
4. **Physics toys are rare.** 11 sectors have a signature kill machine (Claim Cracker, Excavator Jaws/Furnace Mouth/Mass-Driver Breech, Weigh Clamp, Shear Jaws, Scrap Baler, Bell Ringer, Tailings Sweep, Cold Draw, Claim Scarecrow, Fissure Cracker), Pallas has the debris-reef current with mines, and Eris has the Metronome beam field; the way-of-life row still says "explicitly none" for 15 sectors, and 12 rim sectors have no physical toy at all.
5. **One-offs are good but mostly static.** 29 one-offs, each a prop cluster with a "why" line; 11 carry a physical body you can rope or shove (Long Berth tug, Runaway Ladle, Tally Keg, Spare Keg, The Settling, The Erased, Impound Shelf, The Pour, Drift Choir, Held Note, The Dispute). Every rim sector gets exactly one.
6. **The world mostly reacts to the player.** Law has real witness/chase/split behaviour against unlawful actors (`lawSecurity.js`), and NPC jobs have six distinct trade phase graphs (`npcJobs.js`). But there is only one authored "the world does something to itself in front of you" layer, and it is thin: `flavor/050-roaming-events.js` has just 2 roaming events (`insolvent`, `slow_fleet`). I found no authored NPC-vs-NPC police chase scene (inference from grep: chase logic exists in law response, not as an ambient set piece).
7. **Assets are reused well.** The place-prop kit (ore containers, habitat pods, lane pins, worklight towers, transponder gates, cargo pods, slurry tanks, the 60+ `aftermath_*` wreck pieces) is reused across one-offs, dressing and authored places. The cheapest big win is **recombining this kit per sector** (new scenes from existing props), not making new models.

**Top 5 moves, in order:** (1) sector-flavoured lived vignettes (a sector overlay on `livedWorldDirector`), (2) an ambient "world-vs-world" scene director (police chases, convoy raids, rescues, all on camera), (3) a signature toy + camera-scale activity pocket for each core sector, then rim sectors, (4) a rim "signature scene" packet (one authored set piece, one named NPC and one toy per rim sector), (5) a small new-asset list that targets *silhouettes* the kit lacks (police interceptor, prison barge, pilgrim hulk, ice-cutter, carrier, beacons that move).

---

## 1. What exists — the placement stack

The game has 12 layers. Each layer puts things in space for its own reason:

| # | Layer | Owner file(s) | What it places | Granularity |
|---|---|---|---|---|
| 1 | Galaxy graph | `src/data/sectors.js` | 25 sectors: tier, security, faction, traffic/min, enemy density, stations, fields, hazards, POIs | sector |
| 2 | Way of life | `src/data/sectorWayOfLife.js`, `design/SECTOR_IDENTITY.md` | 9 identity columns (verb, rhythm, law, crime, ships, structures, hazardGeometry, landmark, signatureToy) | sector |
| 3 | Composition ("the Arranger") | `src/data/sectorCompositions.js` | 25 named field motifs (crescent/islands/strata/braid/fan/rift/caustic), focus station, halo, route width | sector-local geometry |
| 4 | Semantic zones | `src/data/sectorZones.js`, `frontierRegions/*.js` (`FRONTIER_ZONES`) | 14 zone types (civilian_core … planetary_mass) | region |
| 5 | Activity pockets | `src/data/sectorActivityPockets.js` | camera-scale actor/service slots + route topology (Ceres 4 pockets/9 slots, Helios 4) | camera frame |
| 6 | Traffic & jobs | `systems/traffic.js`, `systems/npcJobs*.js`, `laneContacts.js` | 8 traffic roles; 6 job phase graphs; 27 named lane contacts | moving actors |
| 7 | Encounters | `data/encounters/*` (281), `encounterDirector`, `livedWorldDirector` | combat/civilian/mystery/patrol decks by zone type | event |
| 8 | Authored places | `authoredPlaces.js`, `alienEcology.js`, `precursorMachines.js` | ~45 authored zones (Veil 8, Ashfall 9, Charon 8, Sker 4, Tethys 4, Ceres 3…) | landmark site |
| 9 | One-offs | `worldOneOffs.js` | 29 station-relative set pieces | prop cluster |
| 10 | Wrecks | `uniqueWrecks.js`, `wreckAftermathDressing.js` | 17 named wrecks (D1–D17); aftermath kit | site |
| 11 | Characters & machines | `vesper.js`, `morrow.js`, `rubric.js`, `ruckus.js`, `ravel.js`, `solstice.js`, `ruud.js`, SF20 series | authored NPC machines, bosses, courses | actor |
| 12 | Set pieces & bosses | `heistFacilities.js`, `ilexArk.js`, `redKite.js`, `towlineTable.js`, `capital-boss/*`, `namedAces.js` | heist, escort, courier course, 7 capital bosses, 16 aces | operation |

**Census (from `sectors.js`):**

| Sector | Tier | Sec | Faction | Traffic/min | Enemy | Stations | Hazards | POIs | src files |
|---|---|---|---|---|---|---|---|---|---|
| Helios Prime | 0 | .98 | SCN | 18 | 0 | trade_hub, military | — | 12 | 64 |
| Ceres Belt | 1 | .72 | DMC | 10 | .18 | refinery, mining | dense_asteroid | 6+ | 63 |
| Tethys Junction | 1 | .65 | MTS | 14 | .20 | trade_hub, military | — | 16 | 57 |
| Vesta Forge | 1 | .60 | DMC | 9 | .25 | fab, fab, mining | radiation | 6+ | 44 |
| Pallas Drift | 2 | .42 | MTS | 7 | .40 | trade_hub, blackmarket | nebula | 7 | 46 |
| Io Reach | 2 | .35 | Free | 5 | .50 | trade_hub, blackmarket | asteroid, nebula | 5 | 41 |
| Charon Expanse | 2 | .30 | DMC | 4 | .50 | refinery | radiation, asteroid | 3+ | 39 |
| Sker Haven | 3 | .08 | Reach | 9 | .70 | blackmarket | asteroid ×2 | 8 | 35 |
| Veil Nebula | 3 | .12 | Free | 0 | .65 | research | nebula, radiation | 10 | 42 |
| Ashfall Reach | 4 | .05 | Vael | 0 | .80 | blackmarket | radiation, debris ×2 | 13 | 42 |
| Nyx March | 2 | .28 | Quiet | 4 | .48 | blackmarket | nebula | 3 | 16 |
| Hyperion Cut | 2 | .38 | DMC | 5 | .40 | refinery, mining | asteroid | 3 | 13 |
| Kepler Scar | 3 | .12 | Reach | 1 | .68 | blackmarket | radiation, debris | 3 | 11 |
| Orcus Shadow | 4 | .06 | Archive | 0 | .75 | research | radiation, nebula | 3 | 10 |
| Rhea Cinder | 3 | .14 | DMC | 2 | .55 | mining | radiation | 3 | 11 |
| Haumea Rift | 3 | .18 | Free | 3 | .48 | research | asteroid | 3 | 13 |
| Eris Margin | 3 | .10 | Quiet | 1 | .62 | blackmarket | nebula | 4 | 13 |
| Phoebe Echo | 4 | .06 | Vael | 0 | .75 | research | radiation, debris | 2 | 13 |
| Nereid Shoal | 2 | .30 | Free | 4 | .48 | trade_hub, mining | asteroid | 3 | 11 |
| Proteus Well | 3 | .16 | Quiet | 2 | .62 | blackmarket | nebula | 3 | 10 |
| Triton Wake | 3 | .10 | Vael | 0 | .70 | research | radiation, nebula | 5 | 14 |
| Eunomia Gulf | 3 | .10 | Understory | 1 | .70 | blackmarket | debris, radiation | 4 | 14 |
| Sedna Dark | 4 | .06 | Helix | 0 | .78 | research | radiation | 4 | 16 |
| Dione Lane | 1 | .68 | MTS | 10 | .30 | trade_hub, military | — | 3 | 14 |
| The Bolus | 4 | .08 | Free | 0 | 0 | research | (interior) | 1 | 8 |

Observation: 7 sectors run at **0 traffic/min** (Veil, Ashfall, Orcus, Phoebe, Triton, Sedna, Bolus), and 3 more at 1/min (Kepler, Eris, Eunomia). Emptiness works as a deliberate mood ("Veil — unread on purpose"). With 10 of 25 sectors near-empty, though, it stops being a special mood and becomes the default. The frontier sector records also have no palette class set (the census reads them as unset).

---

## 2. Part 1 — Taxonomy: how placement creates the experience today

There are 18 categories. Each one lists the **existing types** with evidence, then **new types**: twice as many ideas as existing types, all buildable mostly from the current kit. ★ = highest value for its cost.

### A. Sector way-of-life (macro identity)
**Existing (4):**
1. *Tier/security gradient*: security drops from .98 (Helios) to .05 (Ashfall), and enemy density rises from 0 to .80. Danger reads as distance from home.
2. *Faction ownership*: SCN, DMC, MTS, Free, Reach, Quiet, Vael, Archive, Helix, Understory. This decides who patrols and who trades.
3. *Way-of-life rows*: 9 columns per sector. Helios is "the harbour", Ceres "the working belt", Sker "the outlaw port", and so on.
4. *Measured identity benchmark* (`world.sector_identity`): Helios vs Ceres differ on 6 of 8 dimensions. Crime and rhythm are the weak dimensions.

**New (8):**
1. ★ *Shift clock per sector*: Ceres works three shifts, Tethys has a customs "tide", Vesta has a pour schedule, Sker has a payday night. Traffic and lived vignettes follow the clock, so a revisit at a different time shows a different sector.
2. ★ *Crime signature per sector* (fixes the benchmark's zero crime row): Helios = fare-dodging and unlicensed salvage; Ceres = claim-jumping; Tethys = manifest fraud; Sker = press-gangs; Nyx = paperless freight.
3. *Local currency of respect*: each sector rewards one verb with rep (Ceres hauling on time, Veil not scanning, Sker not asking).
4. *Sector greeting ritual*: the first 30 s of arrival differ (Helios traffic control hail, Tethys weigh-slip ping, Sker a "who vouches?" bark, Bolus total silence).
5. *Seasonal state flags*: strike, festival, quarantine, gold rush. Each one changes traffic mix and prop dressing for N minutes.
6. *Faction border friction*: where two faction sectors touch, add a seam zone with mixed patrols and mismatched beacons.
7. *Sector rumour table*: 3 rumours per sector, emitted by lane contacts, that point at real one-offs or wrecks.
8. *Sector-specific death/salvage law*: who owns your wreck if you die here (Concord impounds it, DMC bills you, Reach strips it).

### B. Spatial composition and asteroid fields
**Existing (5):**
1. *Named motifs* for all 25 sectors (Open Hand, Quarry Cathedral, Shipping Lanes, Slag Fans, Smuggler's Archipelago … Swallowed Rib).
2. *Motif grammar*: crescent / islands / strata / braid / fan / rift / caustic, with asymmetric arrangements.
3. *Focus station + halo + route width*: fields frame the station and keep a readable lane.
4. *Field composition by ore class*: common rock, metallic, crystalline, icy, rare exotic, gas cloud.
5. *Ceres route topology*: working seam / cathedral grave / refinery pocket / ambush run, banded by sweep angle.

**New (10):**
1. ★ *Worked fields*: rock that is visibly being mined, with drill platforms, slurry tanks and claim marks embedded where the composition puts its "seam". Today fields are mostly geology; they should show labour.
2. ★ *Field as route puzzle*: one deliberately braided shortcut per field. It saves 30% travel time but is a pirate ambush line (`ambush_lane` aligned with the geometry gap).
3. *Moving fields*: one slow-drifting rock river per sector tier ≥2 (Pallas currents, Haumea calving ice).
4. *Field scars*: a tunnel blasted through a field by an old battle, lined with `aftermath_*` debris.
5. *Field ownership marks*: `claim_mark` and `tally_post` lines dividing a field between rival claims, with crossing incidents.
6. *Sculpted rock*: one landmark rock per sector (graffiti rock `asteroid_graffiti` already exists, used ×2).
7. *Resonant rocks*: crystalline fields that chime on hit (an audio-only tell for the Veil/Phoebe family).
8. *Shepherded field*: fields kept in place by a precursor Shepherd Engine. Destroy it and the field disperses for 10 minutes.
9. *Ice fog fields*: icy rock plus nebula volume, so navigation works by sound and beacons (Nereid, Haumea).
10. *Field silhouettes visible from the map*: each composition reads as a glyph on the sector map, so players can navigate by shape.

### C. Hazard geography
**Existing (6):**
1. Four hazard types: dense asteroid, nebula, radiation, debris.
2. Hazard stacking in deep sectors (Ashfall radiation + debris ×2; Charon radiation + asteroid).
3. Industrial hazards: Vesta furnace/slag radiation and the Runaway Ladle.
4. Interior hazard sector: the Bolus throat (cone/iris/latch rules in `theBolus.js`).
5. Hazards that hide crime: Pallas fog cover, the Smuggler's Archipelago.
6. *Weather volumes*: storm lanes + radiation belts for Veil, Vesta and Io (`WEATHER_VOLUMES`), plus the Vesta ore winnow and the Ceres Cinder Sluice current.

**New (10):**
1. ★ *Hazard as timing gate*: radiation pulses on a 40 s cycle (Charon, Rhea). Cross between pulses; NPC haulers visibly wait for the window.
2. ★ *Hazard that NPCs exploit*: smugglers hide in nebula, so customs cutters loiter at the fog edge and you watch the game of hide-and-seek.
3. *Ion storms*: sector weather fronts that cross the map, kill radar and draw scavengers afterwards.
4. *Gravity wells*: The Anvil at Tethys as a sling-shot lane; extend to the Proteus "well mouth".
5. *Thermal plumes*: Vesta/Rhea vent columns that push ships around (a physics hazard, and a good place for a race course).
6. *Mines left from old wars* (minefield_wake exists as an encounter; make it persistent geography).
7. *Corrosive cloud*: hull damage over time; salvage inside is untouched because of it.
8. *Magnetic shear*: debris fields that align and spin when you fire mass drivers.
9. *Darkness*: zones with no light (Sedna Dark) where only lamps and ship lights show. Mothlight's lamps already prove the idea.
10. *Organic hazard*: Bolus-style tissue spreading into a neighbour sector (Ashfall growths, `alien_growth_*` family).
### D. Stations and infrastructure halos
**Existing (5):**
1. 7 station types (trade_hub, refinery, mining, fab, military, blackmarket, research) and growth ladders (`STATION_GROWTH_LADDERS`).
2. Lane furniture: `lane_pin` ×10, `transponder_gate` ×8, `nav_buoy`, `traffic_signal`, `lane_beacon`, `interdiction_buoy`.
3. Customs infrastructure: `customs_pylon`, `inspection_platform`, the Tethys Weigh, the Rubric stencil drone.
4. Work infrastructure: `worklight_tower` ×8, `freight_platform`, `transfer_arm`, `crusher_module`, `conveyor_truss`, `extraction_mast`.
5. Outlaw infrastructure: `improvised_dock`, `illicit_transfer_frame`, `pirate_sensor_mast`, `claim_outpost_*` (bastion, fence, catcher, refinery).

**New (10):**
1. ★ *A "front yard" kit for each station type*: a refinery always has a tailing pond, a fab station a test range, a military station a gunnery line, a research station a sample-buoy field.
2. ★ *Stations that visibly grow* when the player helps: growth ladders shown as scaffolding turning into new modules (`construction_frame`, `repair_scaffold`).
3. *Abandoned stations*: one per rim sector, being picked over by salvors.
4. *Pop-up markets*: a temporary `freight_platform` + `cargo_pod_*` bazaar that opens for 10 minutes in a field.
5. *Station quarantine*: pylons ring the station and traffic queues outside (reuses Charon's Quarantine Pylon Field).
6. *Billboards* (`station_billboard`, used ×2 today) that carry sector news about what the player did.
7. *Docking-queue choreography*: visible holding patterns that grow with traffic.
8. *Relay chains*: `comms_array` + `sensor_mast` chains you can sabotage or repair, which changes the sector's radar.
9. *Toll arches*: `gate_jump_ring` + `interdiction_buoy` as a pirate toll gate on a lane.
10. *Mobile stations*: the Borrowed Sun pattern (deploy → open → fold) reused for a travelling market.

### E. Visible NPC work (jobs in front of you)
**Existing (5):**
1. Six job phase graphs: miner, hauler, patrol, surveyor, salvor, tender (`npcJobs.js`; a test checks that they are genuinely different).
2. Ceres camera-scale pockets: Working Seam, Cathedral Grave, Refinery Pocket, Ambush Run (9 actor slots).
3. Helios pockets (4 slots): licensed traffic and salvaging.
4. Signature toys worked by NPCs: Claim Cracker, Excavator Jaws, Weigh Clamp, and others.
5. Named working machines: Kilnback (furnace tug), Pallet Jack, Ruckus (demolition tug), Morrow (rescue), Latch Nine (tender).

**New (10):**
1. ★ *Camera-scale pockets for every core sector*: 2–3 each (Tethys customs queue, Vesta pour line, Sker refit dock, Io mail sorting, Veil sample walk).
2. ★ *Job interruption scenes*: a hauler breaks down, a tender arrives, and the player helps or loots. Uses the interrupt/resume that `npcJobs.js` already supports.
3. *Construction crews*: `welding_drone` + `construction_frame` building something over the course of a session.
4. *Towing*: tugs dragging a `dead_hulk` to the `scrap_cage`.
5. *Refuelling*: a tanker coupling (`tanker_coupling`) to a waiting freighter, with a visible hose.
6. *Ore streams*: an `ore_sorter` + `conveyor_barge` line moving rock from field to refinery where you can see it.
7. *Beacon maintenance*: a tender replaces a dead `nav_buoy`, and the light comes back on.
8. *Survey grids*: surveyors lay `claim_mark` pins, and claim-jumpers follow behind them.
9. *Rescue drills*: Concord practises with `47a_rescue_capsule` near Helios.
10. *Shift change*: worker shuttles (`shuttle_dock`, `passenger_platform`) run between habitat pods and work sites on the shift clock.
### F. Traffic and lanes
**Existing (4):**
1. Eight traffic roles: hauler, tug, tourist, tanker, salvor, ore_carrier, customs, arclight.
2. 27 named lane contacts, about one per sector (Mira Bluepack, Kess of the Span, Cinder Run Courier, Ives of the Swallowed Rib…). Roles: courier 10, hauler 7, miner 2, surveyor 2, plus single express/ore_carrier/patrol/salvor/smuggler/tanker contacts.
3. Convoys: convoy_departure, curtain convoy, convoy interference, the Ilex Ark escort (Tethys → Ceres).
4. Traffic density per sector (`trafficPerMin`, 0–18).

**New (8):**
1. ★ *Lane personalities*: each named lane gets its own speed culture (Dione's "cleared lane" runs at a fixed pace; Io's mail lanes zigzag).
2. ★ *An express liner on a timetable*: the `massline_express_liner_v1` asset crosses the core on schedule, so you could set a clock by it.
3. *Pilgrim caravans* heading for the Veil and Phoebe shrines.
4. *Prison transfer*: a guarded barge with escorts — a breakout target.
5. *Funeral procession*: slow, lit hulls moving toward a `memorial_array`.
6. *Lane racers*: illegal racers on Dione with patrols chasing them.
7. *Refugee flight*: traffic leaves Io when control of the sector changes hands.
8. *Tourist destinations*: sightseeing shuttles at the Wreck Cathedral, the Anvil and the Candle Fleet. The `tourist` role already exists; it needs places to go.

### G. Law, crime and pursuit
**Existing (5):**
1. `lawSecurity.js` incidents: witnesses, a chase/fire signal on armed unlawful actors, responder **split** (one holder, the rest chase), and reacquisition when line of sight breaks.
2. Customs: patrol_scan, rehearsed scan, the customs logic puzzle, Tethys weigh-slips, Dione "customs reads, then the convoy leaves".
3. Tolls: pirate_toll (pay / refuse / run), with cargo-value and security gates.
4. Bounties and the wanted loop: bounty hunters, named hunters, Sker as the home of the wanted loop.
5. Impound and evidence: the Sker Impound Shelf, the Tethys Disputed Keg, the Customs Lamp.

**New (10):**
1. ★ *Ambient police chase*: an NPC smuggler running from a customs cutter crosses the camera. The player can assist either side, or just watch. The chase logic exists, but nothing stages it as a scene for the player to see (inference from grep).
2. ★ *Speed traps*: `traffic_signal` + `customs_pylon` lane sections with a posted limit. Speeders get pulled over, NPCs included.
3. *Stop-and-search*: an NPC hauler held at an `inspection_platform` while cargo pods are opened.
4. *Crime-scene cordons*: `interdiction_buoy` rings around a fresh wreck, with a patrol guarding the evidence.
5. *Corrupt patrol*: a Sker-side patrol taking a bribe, visible as a cargo-pod handoff.
6. *Jailbreak*: the prison-barge breakout (see F.4).
7. *Bounty board → physical bounty*: the target appears at a sector-specific hideout, built from one-off props.
8. *Smuggler dead-drops*: `cold_locker` caches that NPCs visit; staking one out reveals the courier.
9. *Witness memory*: NPCs who saw your crime flee or radio ahead, and the next station greets you differently.
10. *Faction law differences*: Concord arrests, DMC fines and impounds, Reach holds duels, Quiet erases records.

### H. Combat encounter placement
**Existing (5):**
1. Zone-gated combat deck (51 encounters): tolls on trade_lane / ambush_lane / outlaw_zone / refinery_approach, ambush snares, minefield wakes, PD screen walls.
2. Squad doctrine and formation: tether raiders ×3, foremen ×3, Vael ×3, dart shepherd, scissors, pincer.
3. Geometry-bound ambushes: the Ceres Ambush Run, the Sker gate camp, the Pallas wreck cover.
4. Pressure/cooldown pacing: `pressureCost`, `cooldownS`, a spawn budget, and tension scaling.
5. Survival arenas and the Crucible (`survivalArenas.js`, e.g. `thrown_bank`).

**New (10):**
1. ★ *Terrain-native fights*: each sector's motif shapes its ambushes (Vesta enemies use slag-fan cover; Haumea enemies drop ice on you).
2. ★ *Third-party fights*: two NPC factions already fighting when you arrive, so you choose a side or loot the losers.
3. *Hazard-baited ambushes*: pirates wait inside radiation and use the pulse timing against you.
4. *Escort sabotage*: a convoy member defects mid-escort.
5. *Siege*: pirates besieging a claim outpost (`claim_outpost_bastion`), with the defenders asking for help.
6. *Wreck-hunting packs*: scavenger gangs that circle any fresh wreck, including yours.
7. *Duels at Sker*: honour duels in an arena ring of `ash_pin` markers.
8. *Mine-laying*: enemies that leave persistent minefields in a lane.
9. *Retreat behaviour*: beaten pirates flee to a visible hideout you can follow them to.
10. *Ace territories*: each of the 16 aces owns a sector and leaves marks (graffiti rock, trophy pins) before they appear.
### I. Named antagonists, aces and bosses
**Existing (4):**
1. 16 named aces (Yara No-Cut, Toll Saint Venn, Boiler-King Orro, Iona False-Face, Voss of Shaft Seven, Wick Blackwrench…) and ace trophy heads.
2. 7 capital bosses: Ala, Brood Queen, Foreman, Iron Maw, Regent, Tendril, Tollman.
3. Authored machine antagonists: Scissorwake (cutter), Kilnback (furnace tug), Mothlight (four lamps, one real gun), Pallet Jack.
4. Landmark trophies: the Skerris Throne (trophy provenance mission).

**New (8):**
1. ★ *Ace home turf*: give each ace a sector, a hideout one-off, a lane they tax and a rumour line. Today the aces have names and kits but no place in the world.
2. ★ *A boss arena in each region*: put capital bosses where their geometry makes sense (Iron Maw in Vesta's slag fans, Brood Queen in the Bolus approach, Tollman at the Dione gate).
3. *Rival aces fighting each other*: a feud you can stumble into.
4. *Boss aftermath*: a beaten boss leaves a permanent wreck landmark (fits the `uniqueWrecks` pattern).
5. *Calling cards*: props an ace leaves behind (cut beacons, painted hulls via Rubric-style stencils).
6. *Hunted-by*: aces that hunt the player across sectors after a grudge.
7. *Boss telegraph at sector scale*: traffic disappears and lights dim before the boss arrives.
8. *Mercy outcomes*: spared aces come back as contacts (the "spared return" depth beat already does this; widen it).

### J. Lived vignettes and ambient civic life
**Existing (5):**
1. 176 generated lived vignettes (`lived-<zone>-toll-<faction>-<twist>`). 30 nouns × 6 zones: caskets, stamps, boots, hymns, kettles…
2. Hand-written civic ambients: kettle hold, berth vows, ash casket, name plate, relief lamp, invoice fight, tin hymn, loose cat, harvest orbit, skiff Saturday, courtesy honk, twelve degrees, wrong berth, second rinse.
3. Phase verbs: spawn, say, motion, prop, offer, grant, resolve, rep. Usually 3 choices.
4. `livedWorldDirector`: fires by zone type, scans every 6 s, 90 s gap (15 s for ambient), one live vignette at a time.
5. K1 faction vignettes: the Understory salvager, the Fulfillment fixed route, the Archive reading room, the Pitborn yard, the Verge prism.

**New (10):**
1. ★ *Sector overlay for lived vignettes*: the same noun gets a sector-specific cast, prop and line (a "kettle" in Ceres is a slurry kettle; in Sker it's a stolen still). This is the cheapest de-templating move available.
2. ★ *Situations other than toll*: re-skin the generator with wedding, strike, auction, quarantine, race, funeral, birth, inspection, duel and repair situations. Today 179 of 281 encounters are tolls.
3. *More archetypes*: add miner, tender, salvor, surveyor and courier casts (the job kernels already exist) alongside zealot, trader and lawman.
4. *Vignettes that leave props behind*: the scene resolves and its prop (casket, plaque, lamp) stays as a permanent marker.
5. *Overheard comms*: radio-only vignettes with no spawn, which are cheap and add atmosphere.
6. *Recurring characters*: the same mule trader keeps showing up across sectors and remembers you.
7. *Group scenes*: 3–5 ships (a skiff Saturday flotilla, a wedding convoy).
8. *Kids and pets*: the loose-cat tier of whimsy, more of it.
9. *Time-of-shift vignettes*: driven by the shift clock (A.1).
10. *Player echo*: vignettes that quote what the player did earlier ("you're the one who towed the tug").
### K. Environmental storytelling one-offs and easter eggs
**Existing (5):**
1. 29 deterministic station-relative one-offs, each with a "why" line. Examples: The Long Berth tug, the Strut Shrine, The Great Tanker, the Answering Buoy, the Runaway Ladle, the Customs Lamp, The Erased, the False Gate, the Watcher's Tithe, the Held Note.
2. *Physical one-offs*: 11 of the 29 carry `physicalBody` (tug, ladle, kegs, The Settling, The Erased, Impound Shelf, The Pour, Drift Choir, Held Note, The Dispute) — rope/shove props.
3. Memorials: `memorial_array` ×7, the Candle Fleet, the Helios Memorial Array zone.
4. Visual-only jokes: the Spare Keg, the Disputed Keg, The Settling, the Double Take.
5. Hidden lore buoys: the Love Letter Buoy (depth H4), the Answering Buoy.

**New (10):**
1. ★ *Interactive one-offs*: give every rim one-off a single verb (rope it, scan it, light it, return it). Physics bodies are already proven by the tug.
2. ★ *Easter-egg chains*: three one-offs in three sectors that form a story (a family-pod trail from Ceres to Nereid).
3. *Seasonal one-offs*: they change when the sector's state changes (strike banners, festival lamps).
4. *Player-made one-offs*: the player's first wreck, or the first claim they cracked, becomes a permanent marker.
5. *Graffiti rocks*: `asteroid_graffiti` with tags from aces and gangs, in more places.
6. *Ghost-ship sighting*: a hull visible only at a certain shift or angle.
7. *Impossible objects*: one per anomaly sector (a lit window in a dead hulk).
8. *Developer egg*: a hidden "Face in Space" rock formation (the game's name).
9. *Lost-and-found*: cargo pods with funny manifests that you return for a tiny reward.
10. *Miniature dioramas*: tiny prop scenes (a toy station on a rock) you only find by zooming in.

### L. Wrecks and aftermath
**Existing (5):**
1. 17 named unique wrecks (Vigilant, Ironsong, Lighthouse, Pale-Coil, Choir-Bell Aegis, Gravhand Tideline, Nestbreaker, Deepsurvey, Smokesong…) in 4 classes (military, ancient, battlefield, fresh), linked to missions, story commodities and rep.
2. The aftermath kit: about 60 `aftermath_*` wreck/fragment/debris pieces in fresh/derelict/stripped states and "authored-down" variants.
3. Salvage points and finite crates (Tally Three).
4. The Wreck Cathedral (Ceres), the Machine Ossuary (Ashfall), the Three Hull Garden.
5. Wreck-based depth beats: "wreck that knows you", corridor massacre, wreck herds.

**New (10):**
1. ★ *Wreck lifecycle*: fresh → stripped → derelict over real sessions as NPC salvors work it. The 3 states already exist as assets; nothing drives the change.
2. ★ *Battle sites you read*: wreck layouts that tell you who fired from where (scatter direction, turret orientation), with a scan that reconstructs the fight.
3. *Wreck-as-shelter*: hide inside a hulk from a storm or a patrol.
4. *Wreck reefs*: debris that collects fauna (Hull Leech, Casket Worm).
5. *Wreck auctions*: a salvage-rights bid at Eunomia's license board.
6. *Booby-trapped wrecks*: Reach-rigged hulks near Sker.
7. *Wrecks still talking*: a looping distress beacon (depth H1 "distress from inside", made permanent).
8. *Mass graveyard*: one sector-scale ship graveyard (Kepler "capsized bazaar" is the natural place).
9. *Wreck towing economy*: tow a hulk to a yard for payment (Towline Table pattern).
10. *Wreck rebuilt*: a wreck slowly rebuilt into a station module over time.
### M. Landmarks and landmark missions
**Existing (5):**
1. Landmark place props: `landmark_wreck_cathedral`, `landmark_skerris_throne`, `landmark_resonant_cathedral`, `landmark_candle_fleet`.
2. Landmark investigations (`landmarkMissions.js`): C6 Hyperion Caved Shaft, C9 Phoebe Shard Sphere song, C2 Veil Resonance Obelisk, C14 Pallas Quiessence census, C13d Sker Throne trophy, C12 Eris Metronome off-beat, C11 Sedna Ringworld Arc grid.
3. Way-of-life landmark column for every sector.
4. The Tethys Anvil (gravity well), the Pallas Ravel (a gravity loom holding a moon that is gone).
5. Composition focus: each field arrangement frames its landmark.

**New (10):**
1. ★ *Landmarks that do something on a schedule*: the Metronome ticks, the Obelisk hums, the Candle Fleet relights at shift change. Players learn the sector's rhythm from them.
2. ★ *Sightlines*: place every landmark so it is visible from the gate arrival point (camera-scale check, like the activity-pocket rule).
3. *Landmark weather*: each landmark gets its own local VFX (the Anvil's lensing, the Cathedral's dust).
4. *Landmark NPC culture*: pilgrims, tourists, guards and vandals around each landmark.
5. *Landmarks as navigation*: lane names refer to landmarks ("Throne-side").
6. *Damaged landmark*: a landmark changes after the player finishes its mission.
7. *Landmark rivalries*: two factions both claim it.
8. *Interior landmarks*: a fly-into space (the Bolus proves this works).
9. *Landmark photo mode*: a scan/photo mechanic that rewards visiting.
10. *Cross-sector landmark set*: the 7 C-missions linked into a meta-puzzle.

### N. Discovery chains and POI behaviours
**Existing (5):**
1. 7 POI behaviour families: lawful_station_yard, mining_field, derelict_salvage, anomaly_research, convoy_industrial_route, gravity_well_sounding, pirate_contested_nest.
2. Ring-search discovery (clue POI → search disc → pulse).
3. The Kettle Line: a *line* discovery chain that follows a debris trail.
4. Depth H1–H8: distress from inside, drifting bloom, wreck that knows you, love letter buoy, corridor massacre, patrol ambush, spared return, echo of player.
5. Mystery deck (5 encounters) and anomaly whispers.

**New (10):**
1. ★ *More chain shapes*: spiral, triangulation (three beacons), timed (follow a fading wake), sound (Veil/Phoebe resonance), shadow (Sedna lamps).
2. ★ *A discovery chain in every rim sector* (none have one today), reusing one-offs as clue POIs.
3. *Dead-reckoning clues*: a log gives bearing and distance from a landmark.
4. *Ecology tracking*: follow fauna trails to a nest.
5. *Signal triangulation* between `comms_array` relays.
6. *Treasure maps* from wreck logs.
7. *Chains that cross sectors*: begin in Ceres, end in Nereid.
8. *Competing searchers*: an NPC surveyor racing you to the cache.
9. *False trails*: Quiet sectors plant decoy clues.
10. *POI families 8–14*: colony life, shrine, race course, smuggler dead-drop, quarantine, boss lair, festival.

### O. Precursor machines and alien ecology
**Existing (5):**
1. 14 precursor machines (Surveyor Prism, Custodian, Gate Auditor, Witness, Shepherd Engine, Mason, Executor, Courier Frame, Conservator, Measure Engine, Boundary Walker, Appeals Clerk, Debris Sorter, Sleeping Jury), placed in Charon, Veil, Ashfall, Sker, Io and Pallas zones.
2. 20 alien fauna (Needle Swarm, Veil-Ray, Blind Shepherd, Hull Leech, Lantern Cyst, Casket Worm, Bristle Ram, Mourning Kite, Anchor Beast, Furnace Maw, Glassback, Wake Eel, Spindle Mother, Void Carrier, Archive Crab, Cold Bell, Suture Mite, Black Sail, Stone Lung, Pilgrim Spine).
3. Alien ecology sites: Charon grave, Veil glass, Ashfall choir, Veil-Ray nursery, Cinder nursery, Warm Freighter, Quiet Ice, Breathing Dock, Harvest Deep, Converted Yards, Empty Skin, Red Cable Yard, Shepherd's Ring…
4. The `alien_growth_*` props: filament, cyst, tendril, spore motes, memory knot, calcified collar, nerve lace.
5. Fold Aberrant "The Unclosed" (Verge containment), the Borrowed Voice.

**New (10):**
1. ★ *Spread fauna to the rim*: each rim sector gets 1–2 resident species tied to its hazard (Wake Eel in Triton, Glassback in Haumea ice, Furnace Maw in Rhea, Cold Bell in Sedna).
2. ★ *Precursor machines still doing their jobs*: the Debris Sorter sorts, the Mason builds, the Courier Frame delivers. Ambient visible work by non-human agents.
3. *Migration*: Mourning Kites crossing sectors on a schedule.
4. *Predator and prey*: Needle Swarm hunting Lantern Cysts, on camera.
5. *Fauna-industry conflict*: Hull Leeches infesting a Ceres freighter, with the crew asking for help.
6. *Machine courts*: Appeals Clerk + Sleeping Jury putting the player on trial.
7. *Taming*: guide a Blind Shepherd with lamps.
8. *Nests in wrecks* (see L.4).
9. *Precursor road*: Boundary Walkers patrolling an old border across 3 sectors.
10. *Alien growth on player structures* over long absences.
### P. Signature toys and environmental machinery (physics play)
**Existing (4):**
1. 9 environmental machines plus Ceres's Excavator Jaws: Claim Cracker (Helios), Weigh Clamp (Tethys), Shear Bar (Vesta), Scrap Baler (Sker), Bell Ringer (Io), Tailings Dragline (Charon), Cold Draw (Veil), Claim Scarecrow (Ashfall), Fissure Cracker (Haumea). Plus the Pallas debris-reef current + mines and the Eris Metronome beam.
2. Rope/tow/shove physics on bodies (the tug, salvage, the Towline Table).
3. Ruckus RU-7: a demolition tug whose work order is now "play".
4. Ravel's gravity loom and Morrow's momentum rescue as physics characters.

**New (8):**
1. ★ *A toy for each of the 13 remaining "explicitly none" sectors*: Nyx *Paper Shredder* (destroys manifests → heat), Hyperion *Cut Saw*, Kepler *Capsize Winch*, Orcus *Dim Lamp Post*, Rhea *Pour Gate*, Phoebe *Tuning Fork*, Nereid *Ice Sled*, Proteus *Well Bucket*, Triton *Wake Kite*, Eunomia *License Stamp*, Sedna *Patch Gun*, Dione *Lane Gate*, Bolus *Peristalsis Valve*.
2. ★ *NPCs using the toys in front of you*: every toy gets an NPC operator cycle (via the job kernel), so the player first *watches* the toy being used.
3. *Toy combos*: a Claim Cracker charge thrown into a Scrap Baler.
4. *Toy contests*: timed challenges with leaderboards at each toy.
5. *Toy damage*: break the toy and NPCs come to repair it (E.7 pattern).
6. *Portable toys*: buy a toy module and use it in other sectors.
7. *Environment-scale toys*: open a dam of rock (Haumea calving).
8. *Toy lore*: who built it, and why (a one-line plaque prop).

### Q. Heists, escorts and set-piece operations
**Existing (5):**
1. The Tethys mega-heist: Surface Launcher, Lawful Catcher, Quiet Fence Receiver, Berth Three, Transfer Yard, Concord Monitors (Ridge, Hollow, Shoal), sealed crates and the SP-07 flywheel.
2. Ilex Ark seed-ark escort (Tethys → Ceres, 3000 s deadline).
3. Red Kite courier course (Ceres, three handoffs).
4. Towline Table (Ceres, a towing assist with witness range).
5. Borrowed Sun mobile station (deploy/open/fold/transit).

**New (10):**
1. ★ *A heist per region*: Vesta foundry payroll, Sker impound break-in, Veil sample theft, Nyx paper vault.
2. ★ *Rescue set pieces*: a collapsing claim outpost, a station breach, a stranded liner (Morrow's momentum-rescue mechanic, scaled up).
3. *Salvage race*: three crews and one fresh capital wreck.
4. *Blockade run* across the Io contested floor.
5. *Mining rush*: a rich vein is discovered and the whole sector converges.
6. *Moving-station defence*: escort the Borrowed Sun through Pallas fog.
7. *Bounty extraction*: capture rather than kill (tow the disabled ship).
8. *Infiltration*: a fake transponder through Dione customs.
9. *Festival operation*: deliver lamps for the Candle Fleet relight.
10. *Evacuation*: Charon quarantine break-out.

### R. Character machines and named NPCs
**Existing (5):**
1. Authored characters: Vesper SV-3 (Helios), Morrow R-07 (Helios), Rubric HM-11 (Tethys customs stencil drone), Ruckus RU-7, Ravel (Pallas), Solstice SL-9 (lantern observatory), Ruud (a living work-suit on radiator fin 3), Hasp aboard the Second Rinse, Sable Venn ("Patchwork").
2. Intro encounters for the named machines (scissorwake/kilnback/mothlight/pallet_jack _intro).
3. Lane contacts as named recurring NPCs (27).
4. Faction characters through the K1 vignettes.
5. Save-persistent character state (`persistenceOwner` fields).

**New (10):**
1. ★ *One character per rim sector*: the 14 rim sectors currently have only a lane contact. Turn each contact into a full character with a place and a want.
2. ★ *Characters who travel*: Rubric repaints hulls in other sectors; Ruckus goes looking for new playgrounds.
3. *Character friendships*: Morrow rescues Ruckus.
4. *Character jobs you can watch*: Solstice charting the stars, Vesper conducting traffic.
5. *Character rivals*: a corrupt counterpart to Rubric at Sker.
6. *Hire a character as crew*.
7. *Characters remembering the player*.
8. *Character grief*: if a character dies, their memorial joins the arrays.
9. *Character festivals*: Vesper's choir night.
10. *Background crowd*: unnamed but costumed NPC ships for each faction.
---

## 3. Part 2 — 18 new categories (double the original 18)

Each new category is a whole kind of placement the game doesn't use yet, with 4 starter ideas. Every idea names the existing assets or systems it would reuse.

### S. Time and rhythm
1. ★ Shift clock per sector (`state.simTime` buckets): traffic mix, worklights (`worklight_tower`) on and off, and vignette tables change by shift.
2. Timetabled landmarks: the express liner, the Metronome, the Candle Fleet relight.
3. Payday at Sker: bars fill, duels start, the fence opens.
4. Night shift in Ceres: fewer miners, more claim-jumpers.

### T. Weather and sector-wide events
1. ★ Ion storm fronts crossing a sector: radar off, scavengers arrive after.
2. Meteor shower over Ceres: new rock spawns and a rush to claim it.
3. Solar flare at Helios: traffic shelters in station shadow.
4. Nebula tide at Pallas: fog advances and retreats, covering and revealing islands.

### U. The economy made visible
1. ★ A shortage shows up as traffic: when ore prices spike, more `ore_carrier` traffic and empty `container_rack_abandoned` at the station.
2. Bankruptcy: the `insolvent` roaming event, with props being repossessed.
3. Price war: two traders undercutting each other with billboards.
4. Boom town: a rim station grows its halo after sustained trade.

### V. Player legacy and world memory
1. ★ The player's deeds become props: towed tug moved, claim marks with your tag, a memorial for an NPC you lost.
2. NPC lines change after milestones.
3. Graves: player-ship wrecks persist as `aftermath_*` landmarks.
4. Statues: a heroic deed earns a `memorial_array` entry.

### W. Faction war and front lines
1. ★ A visible front at Io Reach: patrol lines, interdiction buoys, wrecks accumulating on the line.
2. Territory flips change beacons and lane furniture colour and type.
3. Supply runs to the front.
4. Ceasefire days with mixed patrols.

### X. Sound as geography
1. ★ Each zone type has an audio signature. Each sector has a "song" (the audio recipe exists per sector) that reveals POIs as you get closer.
2. Resonant crystal fields (Phoebe, Veil).
3. Industrial rhythm in Vesta: you hear the pour schedule.
4. Silence as a tell in the Bolus.

### Y. Light and darkness design
1. ★ Sedna Dark: only lamps, Mothlight-style decoys, Solstice's lantern.
2. Worklight towers as safety islands in dark fields.
3. Light pollution around Tethys hiding stealth runs.
4. Bioluminescent fauna as navigation (Lantern Cyst).

### Z. Comms, radio and chatter
1. ★ An overheard-radio layer: zone-specific chatter that refers to real nearby actors ("tug three, you're drifting").
2. Pirate radio station at Sker.
3. Emergency broadcast during an event.
4. Coded Quiet-faction transmissions as a puzzle.

### AA. Crowds and gatherings
1. ★ Festivals: Candle Fleet relight, choir night, skiff Saturday flotilla.
2. Markets: pop-up bazaars (D.4).
3. Weddings and funerals as convoys.
4. Protests: miners striking around the refinery with banners.
### AB. Races, sports and leisure
1. ★ A race course in each motif: Pallas reef pinball, Vesta plume slalom, Haumea ice canyon. Reuses `lane_pin`, `nav_buoy` and `traffic_signal` as gates.
2. Illegal drag on the Dione lane.
3. Rock-golf with the Claim Cracker.
4. Tourism: landmark tours with a guide NPC.

### AC. Rescue and disaster response
1. ★ Disaster events: a reactor leak at a claim outpost, a station hull breach. Morrow + `47a_rescue_capsule`.
2. Lifepod scatter after a fight, to be collected.
3. Fire on the Vesta pour line.
4. Cascade collapse in a Ceres shaft (C6 Caved Shaft, made dynamic).

### AD. Arrival choreography (the first 30 seconds)
1. ★ Gate arrival framing: every sector places its landmark, one activity pocket and its greeting in the arrival frame.
2. Customs queue at Tethys and Dione arrivals.
3. A "welcome" from the lane contact.
4. Gate camps at Sker and the Reach as an arrival threat.

### AE. Scale and spectacle
1. ★ Capital ships on the horizon (a Concord carrier, a DMC ore leviathan) passing at parallax distance.
2. Megastructure silhouettes in the skybox (Ringworld Arc for Sedna).
3. Planet-mass zones (`planetary_mass`) used as dramatic backdrops.
4. Fleet reviews at Helios.

### AF. Interiors and docks
1. ★ Fly-through docks (the `dock_interior` prop exists ×3): hangars you can enter.
2. Interior sectors in the Bolus style: the inside of a capital wreck.
3. Smuggler tunnels inside rocks.
4. Station-ring canyons.

### AG. Wayfinding culture
1. ★ Hand-made trail markers: `ash_pin`, `claim_mark` and graffiti pointing to secrets.
2. Faction-coded beacons.
3. Lies on the map: Quiet false beacons (the Nyx False Gate exists).
4. Old precursor roads.

### AH. Drones, pets and companions
1. ★ Work drones in swarms (`mining_drone`, `welding_drone`) around worked rocks.
2. A stray drone that follows the player.
3. A dog-like fauna companion (Blind Shepherd).
4. Courier drones you can intercept.

### AI. Mystery and horror pacing
1. ★ Escalating wrongness in the deep sectors: lights out, then traffic gone, then a voice (H-series beats, sequenced).
2. Things that move when you're not looking (Phoebe "the answer").
3. Vanished crews: ships drifting with their lights on.
4. Bolus spillover.

### AJ. Cross-sector consequence chains
1. ★ The player's action in sector A changes sector B (break a Tethys blockade → Pallas prices drop → smugglers move to Nyx).
2. Refugee and traffic migration.
3. Faction retaliation in neighbouring sectors.
4. Ripple rumours via lane contacts.
---

## 4. Combination brainstorm — 30 scenes built from existing assets

Each recipe uses **existing** props, actors and systems. *(new)* marks the rare missing piece.

| # | Scene | Props | Actors / systems | Sector |
|---|---|---|---|---|
| 1 | **Police chase across the lane** | `traffic_signal`, `customs_pylon` | smuggler hauler + customs cutter, `lawSecurity` chase/split | Tethys, Dione |
| 2 | **Stop-and-search** | `inspection_platform`, `cargo_pod_standard` (opened), `cargo_pod_hazmat` | patrol_lawman, mule_trader | Tethys |
| 3 | **Tow to the scrap yard** | `dead_hulk`, `scrap_cage`, `salvage_clamp` | tug (traffic), salvor job | Ceres, Sker |
| 4 | **Refuelling at the fog edge** | `tanker_coupling`, `slurry_tank` | tanker + hauler | Pallas |
| 5 | **Strike at the refinery** | `worklight_tower` off, `station_billboard`, `crusher_module` idle | miners clustered, patrol | Ceres, Hyperion |
| 6 | **Claim war** | `claim_mark` lines, `tally_post`, `claim_outpost_bastion` | two miner groups + tether raiders | Rhea, Ceres |
| 7 | **Fresh-wreck vultures** | `aftermath_wreck_*__fresh`, `aftermath_frag_*` | salvor packs, Hull Leech | any combat site |
| 8 | **Funeral convoy** | `memorial_array`, `habitat_pod` | slow hulls, choir_zealot | Helios, Veil |
| 9 | **Pirate toll arch** | `gate_jump_ring`, `interdiction_buoy`, `pirate_sensor_mast` | corsair_raider, pirate_toll | Sker, Kepler |
| 10 | **Mining rush** | `drill_platform`, `extraction_mast`, `mining_drone` | miners converge, claim jumpers | Nereid |
| 11 | **Quarantine queue** | Quarantine Pylon Field, `cold_locker` | traffic queuing, Custodian | Charon |
| 12 | **Pop-up bazaar** | `freight_platform`, `container_rack`, `cargo_pod_*`, `station_billboard` | traders, tourists | Kepler |
| 13 | **Beacon repair** | `nav_buoy` (dark → lit), `utility_module` | tender job | Dione, Haumea |
| 14 | **Smuggler dead-drop** | `cold_locker`, `illicit_transfer_frame` | smuggler lane contact | Nyx, Eris |
| 15 | **Prison barge breakout** | `freight_platform` + `customs_pylon` *(new barge hull)* | escort patrol, raiders | Dione → Sker |
| 16 | **Rescue at the breach** | `47a_rescue_capsule`, `repair_scaffold_bent` | Morrow, tender | Helios |
| 17 | **Ice calving** | icy rocks, `drill_platform_cold` | Fissure Cracker, surveyor | Haumea |
| 18 | **Pour line** | `conveyor_truss`, `radiator_bank`, `power_skid` | Kilnback, Shear Bar | Vesta |
| 19 | **Lantern walk** | `nav_buoy` lamps, Lantern Cyst | Solstice, pilgrims | Sedna |
| 20 | **Wreck-reef pinball** | `debris_chunk`, `aftermath_frag_*` | Ravel, the existing reef current + mines | Pallas |
| 21 | **Monitor dodge** | Concord Monitors Ridge/Hollow/Shoal | heist stealth | Tethys |
| 22 | **Mail sort** | `container_rack`, `transfer_arm`, Bell Ringer | courier lane contacts | Io |
| 23 | **Front-line wall** | `interdiction_buoy`, `aftermath_deb_corvette_*` | two faction patrols | Io |
| 24 | **Machine court** | `inspection_platform`, `memorial_array` | Appeals Clerk, Sleeping Jury | Ashfall |
| 25 | **Choir night** | `comms_array`, `observation_blister` | Vesper, tourists | Helios |
| 26 | **Graveyard salvage race** | `aftermath_wreck_liner_*`, `hull_rack` | 3 salvor crews | Kepler |
| 27 | **Well bucket** | `crusher_module` + `transfer_arm` | Proteus Well Bucket toy | Proteus |
| 28 | **Paper shredder** | `cold_locker`, `scrap_cage` | Nyx Shredder toy, Quiet couriers | Nyx |
| 29 | **The swallowing** | `alien_growth_*` around `habitat_pod_derelict` | Bolus spillover | Ashfall |
| 30 | **Express liner passing** | `massline_express_liner_v1`, `lane_beacon` lit in sequence | timetable | Helios–Tethys–Dione |
---

## 5. Part 3 — Sector scorecard

Scored 1–10 from the source audit. **Fresh** is the inverse of repetitiveness (10 = nothing repeats). **Util** = how well the sector uses the asset kit. **Cam** = how much reads at camera scale (144 WU frame; per `SECTOR_IDENTITY.md`). **Play** = how much you can physically do (toys, ropeable bodies, chains). These are qualitative judgments of what is authored and placed, not playtest numbers. The one measured input is the Helios/Ceres identity benchmark.

| Sector | Fun | Creat. | Fresh | Distinct | Style | Util | Cam | Play | **Avg** | Main issue |
|---|---|---|---|---|---|---|---|---|---|---|
| Ceres Belt | 9 | 9 | 7 | 9 | 8 | 9 | 9 | 9 | **8.6** | overloaded. Too many headline actors in one sector |
| Tethys Junction | 8 | 8 | 7 | 8 | 7 | 8 | 6 | 8 | **7.5** | heist is great; everyday customs not on camera |
| Helios Prime | 7 | 8 | 6 | 7 | 7 | 8 | 4 | 7 | **6.8** | thin at camera range (measured); calm with no visible crime |
| Ashfall Reach | 7 | 9 | 7 | 8 | 9 | 7 | 5 | 5 | **7.1** | rich authored zones, no traffic, little visible activity |
| Veil Nebula | 6 | 9 | 7 | 8 | 9 | 7 | 4 | 5 | **6.9** | beautiful but empty; "unread" can turn into "nothing here" |
| Charon Expanse | 6 | 8 | 6 | 7 | 7 | 7 | 5 | 6 | **6.5** | strong sites, few actors moving between them |
| Sker Haven | 7 | 7 | 6 | 7 | 7 | 6 | 5 | 6 | **6.4** | outlaw port shown mostly through combat; port life missing |
| Vesta Forge | 6 | 7 | 6 | 7 | 7 | 6 | 5 | 6 | **6.3** | the Ladle and Shear Bar are good; the pour schedule is invisible |
| Pallas Drift | 6 | 7 | 6 | 7 | 7 | 6 | 4 | 6 | **6.1** | Ravel + Quiessence are good; "reef pinball" toy missing |
| Io Reach | 6 | 7 | 5 | 6 | 6 | 6 | 4 | 5 | **5.6** | "contested floor" isn't shown; no visible front |
| The Bolus | 7 | 10 | 9 | 10 | 10 | 5 | 6 | 4 | **7.6** | unique interior; tiny cast |
| Dione Lane | 4 | 4 | 3 | 3 | 4 | 4 | 3 | 2 | **3.4** | reads as a Tethys copy (trade_hub + military, no hazard) |
| Hyperion Cut | 4 | 5 | 3 | 3 | 4 | 4 | 3 | 3 | **3.6** | Ceres clone (refinery + mining + asteroid); C6 mission saves it |
| Nereid Shoal | 4 | 4 | 3 | 4 | 4 | 4 | 3 | 2 | **3.5** | "ore sold same shift" duplicates Rhea's verb |
| Rhea Cinder | 4 | 5 | 3 | 4 | 5 | 4 | 3 | 2 | **3.8** | scorched-claim idea strong; no fire, no toy |
| Haumea Rift | 5 | 6 | 4 | 5 | 5 | 4 | 3 | 5 | **4.6** | has the Fissure Cracker + Deepsurvey wreck; best-equipped rim sector |
| Nyx March | 4 | 5 | 3 | 4 | 4 | 4 | 3 | 2 | **3.6** | 4th fence; False Gate is the one spark |
| Kepler Scar | 4 | 6 | 4 | 5 | 5 | 4 | 3 | 2 | **4.1** | "capsized bazaar" is unbuilt; should be the graveyard market |
| Eris Margin | 4 | 5 | 3 | 4 | 4 | 3 | 3 | 5 | **3.9** | Metronome mission is good; otherwise a fence again |
| Proteus Well | 4 | 5 | 3 | 4 | 4 | 3 | 3 | 2 | **3.5** | well mouth has no well physics |
| Orcus Shadow | 3 | 5 | 3 | 3 | 5 | 3 | 2 | 2 | **3.3** | 3rd "Vael research courier"; 1 neighbour, dead end |
| Triton Wake | 4 | 5 | 3 | 4 | 5 | 4 | 3 | 2 | **3.8** | Choir-Bell Aegis wreck + Watcher; wake mechanic missing |
| Phoebe Echo | 5 | 7 | 4 | 5 | 6 | 4 | 3 | 3 | **4.6** | Shard Sphere song + Pale-Coil wreck; needs the sound toy |
| Eunomia Gulf | 4 | 5 | 3 | 4 | 4 | 4 | 3 | 2 | **3.6** | license board + Gravhand wreck; no auction scene |
| Sedna Dark | 5 | 7 | 4 | 6 | 6 | 3 | 2 | 2 | **4.4** | Ringworld Arc is spectacular in concept; darkness unused |

**Patterns:**
- **Two tiers.** Core sectors average about 6.6; rim sectors (excluding the Bolus) average about 3.8. The gap is authoring, not concept: every rim way-of-life row has a usable idea.
- **Repetitive templates.** Three "Vael research courier" sectors (Orcus, Triton, Phoebe); four fence sectors (Nyx, Eris, Eunomia, Kepler); two "ore sold the same shift" sectors (Rhea, Nereid); two surveyor sectors (Haumea, Proteus). These pairs should each get opposite verbs.
- **Camera-scale is the weakest axis everywhere except Ceres.** It is the only sector with authored activity pockets at real scale.
- **Play is 2/10 for most rim sectors**, because 15 sectors have no toy.
---

## 6. Sector personality plans

Each plan gives: **Keep** (what already works), **Fix** (the gap), **Moves** (3–4 concrete additions), and a **30-second signature scene** (what the player sees on arrival).

### Core
**Helios Prime — "The Harbour"**
- Keep: Vesper, Morrow, Great Tanker, Answering Buoy, Candle Fleet, Claim Cracker.
- Fix: thin at camera scale; no visible crime.
- Moves: (1) pull 2 activity pockets inside the 144 WU arrival frame (docking queue choreography, rescue drill); (2) crime signature = fare-dodgers and unlicensed salvors chased off by a lawman (scene 1, gentle); (3) choir night (Vesper) on the shift clock; (4) express liner passes every N minutes.
- Signature: *traffic control waves you into a lit queue while a tug nudges the Great Tanker and a cadet patrol chases a fare-dodger past the Answering Buoy.*

**Ceres Belt — "The Working Belt"**
- Keep: everything.
- Fix: **de-congest**. Ceres has 8 headline actors.
- Moves: (1) move Pallet Jack's second home to Tethys only, and seed Hyperion with a Kilnback cousin; (2) add the night shift (claim-jumpers); (3) wreck lifecycle on the Cathedral approach; (4) strike event.
- Signature: *excavator jaws biting rock, ore barges streaming, Kilnback glowing, the Cathedral spire behind.*

**Tethys Junction — "The Trade Hub"**
- Keep: heist, Weigh Clamp, Rubric, Anvil, Customs Lamp.
- Fix: customs isn't happening on camera.
- Moves: (1) customs-queue activity pocket (stop-and-search, scene 2); (2) black-market side space with an always-on illicit transfer (`illicit_transfer_frame`); (3) speed traps on the shipping lanes; (4) Anvil sling-shot race.
- Signature: *a queue of haulers at the weigh, one pulled aside and opened, a smuggler bolting into the Anvil's lensing with a cutter behind.*

**Vesta Forge — "The Foundry"**
- Keep: Runaway Ladle, Shear Bar, slag fans.
- Fix: the pour schedule doesn't show.
- Moves: (1) pour-line pocket (scene 18) with a visible 3-minute cycle; (2) thermal plumes as physics hazards and a race course; (3) Iron Maw lair in the slag fans; (4) foundry payroll heist.
- Signature: *a molten pour lights the fans orange; haulers wait for the radiation pulse to drop, then go.*

**Pallas Drift — "The Debris Reef"**
- Keep: Ravel, Quiessence census, The Erased, the Archipelago.
- Fix: the reef current exists, but nothing on camera teaches it.
- Moves: (1) an NPC salvor working the reef current on camera; (2) nebula tide revealing and hiding islands; (3) customs cutters at the fog edge vs. smugglers (hide-and-seek); (4) Borrowed Sun escort through the fog.
- Signature: *rock bouncing between Ravel's loom threads while a smuggler ducks into fog and a cutter waits at the edge.*

**Io Reach — "The Contested Floor"**
- Keep: Held Dock, Mothlight, Bell Ringer, Smokesong wreck.
- Fix: the conflict isn't visible.
- Moves: (1) front-line wall (scene 23) that moves with control; (2) mail-sort pocket (scene 22): couriers still running through crossfire; (3) refugee flight on a flip; (4) blockade-run set piece.
- Signature: *two faction patrol lines facing each other across a buoy wall; a mail courier threads between them, ringing the bell.*

**Charon Expanse — "The Tailings Dark"**
- Keep: Quarantine Pylon Field, Containment Ring, The Line, Borrowed Voice, Tailings Dragline.
- Fix: few moving actors.
- Moves: (1) quarantine queue (scene 11); (2) Custodian and Debris Sorter working visibly; (3) evacuation set piece; (4) Hull Leech infestation scene.
- Signature: *ships idle outside the pylons while a Custodian scans them one by one; a dragline drags tailings across the dark.*

**Sker Haven — "The Outlaw Port"**
- Keep: Scrap Baler, Throne, Impound Shelf, Nestbreaker wreck.
- Fix: port life.
- Moves: (1) refit-dock pocket with an `improvised_dock`, welding drones and a fence haggle; (2) payday duels (`ash_pin` ring); (3) pirate radio; (4) impound break-in heist.
- Signature: *a gate camp waves you through for a fee; a ship is baled for scrap while two pilots circle in a duel ring.*

**Veil Nebula — "The Instrument Station"**
- Keep: Obelisk, Surge Shrine, Cold Draw, 8 authored zones, Vigilant wreck.
- Fix: the risk is plain emptiness.
- Moves: (1) pilgrim caravans as the only traffic, deliberate and slow; (2) audio geography from resonant crystal; (3) Veil-Ray nursery migration visible from the station; (4) a sample-walk pocket.
- Signature: *a line of pilgrim lamps in total dark, a Veil-Ray passing overhead, the Obelisk humming on a beat you start to learn.*

**Ashfall Reach — "The Vael Cache"**
- Keep: Machine Ossuary, Black Vault, Null Corridor, Claim Scarecrow, Lighthouse wreck.
- Fix: no traffic.
- Moves: (1) Vael salvage crews (2–3 ships) working the burn at camera range; (2) machine court (scene 24); (3) growth spilling over from the Bolus; (4) claims under the burn guarded by Scarecrows.
- Signature: *half-lit salvage crews cutting a hulk under a radiation burn while a Scarecrow turns to watch you.*

**The Bolus — "The Throat"**
- Keep: everything. This is the strongest identity in the game.
- Fix: the cast is tiny.
- Moves: (1) a Peristalsis Valve toy with timed openings; (2) one lost NPC to find; (3) Suture Mite and Stone Lung fauna; (4) spillover into the Ashfall and Veil approaches.
- Signature: *silence, a wall that breathes, one beacon, no answer.*
### Rim (Nyx → Dione): give each sector a different verb

The rule for the rim: **no two neighbouring rim sectors share a verb, a toy or a cast.** The duplicate templates are re-split below.

| Sector | New identity (keep the row, sharpen the verb) | Toy (new) | Signature scene | Named NPC (promote lane contact) |
|---|---|---|---|---|
| **Nyx March** | *Paper-burning fence*: freight without papers, so papers get destroyed | Paper Shredder | Quiet couriers feeding manifests into the shredder beside the False Gate, which shows a fake lane | Ash of the Unmanifested |
| **Hyperion Cut** | *The open cut*: a strip mine at monumental scale, unlike Ceres's seams | Cut Saw | A giant saw track slicing a moonlet in half; C6 Caved Shaft at the bottom | Ossa of the Cut Run |
| **Kepler Scar** | *Graveyard bazaar*: the capsized market *inside* a ship graveyard | Capsize Winch | Stalls bolted to capsized liner drums; a salvage race (scene 26) | Ferr of the Surplus Gate |
| **Orcus Shadow** | *Dim library*: an Archive vault (not a Vael courier) | Dim Lamp Post | Archive Crabs carrying records between lamp posts in near-dark | Isk of the Shadow Reading |
| **Rhea Cinder** | *Burning claim*: a sector that is literally on fire | Pour Gate | Fire fronts over the claim; miners racing the flames; Furnace Maw | Brand of the Scorched Seam |
| **Haumea Rift** | *Ice rift*: calving and fracture readings | Fissure Cracker (exists) | Ice calving (scene 17); Deepsurvey/Cassandra wreck in the crack | Quill Fractureline |
| **Eris Margin** | *The beat*: the Metronome sector, everything timed | Drift Net | Smugglers moving only on the off-beat; patrols on the beat | Wray / Nim lane contact |
| **Phoebe Echo** | *The song*: sound geography | Tuning Fork | Shard Sphere; fork resonances light up the hidden Pale-Coil | Nim of the Broken Song |
| **Nereid Shoal** | *Ice rush*: frontier boom town, gold-rush energy | Ice Sled | Mining rush (scene 10), pop-up bazaar | Iva of the Ice Cut |
| **Proteus Well** | *The well*: gravity well with a bucket economy | Well Bucket | Ships lowering buckets into the well; the den takes first pick | Low of the Well Sound |
| **Triton Wake** | *The wake*: a long-dead ship's wake still glowing | Wake Kite | Kites riding the wake glow; Choir-Bell Aegis at the end; Wake Eels | Pell Voss of the Wake |
| **Eunomia Gulf** | *Salvage court*: auctions and licences | License Stamp | Live auction of the Gravhand Tideline salvage rights | Wray of the License Board |
| **Sedna Dark** | *Lanterns in the dark*: a lighthouse economy | Patch Gun | Lantern walk (scene 19), the Ringworld Arc silhouette | Hale of the Dry Rim |
| **Dione Lane** | *Speed lane*: law of speed, racers vs. lane police | Lane Gate | Lane racers and an ambient police chase; express liner passing | Sable of the Cleared Run |

Rim duplicate pairs resolved: the Vael courier trio becomes Orcus *library*, Triton *wake* and Phoebe *song*. The fence quartet becomes Nyx *paper*, Eris *beat*, Eunomia *auction* and Kepler *graveyard market*. The same-shift ore pair becomes Rhea *fire* and Nereid *rush*. The surveyor pair becomes Haumea *ice* and Proteus *well*.
---

## 7. Part 4 — Build plans

Packets are ordered by value per cost. Owner files are the current seams. Every packet is verified by tests and the runtime witness, not by a playtest (repo rule: no playtest gates). *Effort*: S ≈ ½ day agent, M ≈ 1–2 days, L ≈ 3–5 days.

### Wave 1 — De-template the existing content (no new assets)
**BP-1 Sector overlay for lived vignettes** (L)
- What: add `src/data/livedSectorOverlays.js`, a map from `sectorId × noun` to `{castOverride, propPlaceId, lineVariants, situationAlt}`. `livedWorldDirector` resolves `sectorAt(player)` next to `zoneAt` and applies the overlay when it fires.
- Scope: overlays for the 10 core sectors × 30 nouns (300 rows; data only).
- Verify: a unit test that the same noun resolves to a different cast/prop in Ceres vs Tethys; determinism test (same seed → same overlay); extend `world.sector_identity` so the crime/rhythm columns differ.

**BP-2 New situations for the vignette generator** (M)
- What: add situations wedding, strike, auction, quarantine, race, funeral, inspection, duel and repair to the lived generator, plus miner, tender, salvor, surveyor and courier archetypes (they reuse the existing job-kernel ship bodies).
- Target: tolls fall from 179 to ≤ 90 of the catalog.
- Verify: catalog census test with a per-situation cap; `validate.js` schema.

**BP-3 Sector crime signature** (M)
- What: add a `crimeSignature` column to `sectorWayOfLife.js` and a deterministic scheduler that stages one crime scene per N minutes for each sector's signature (fare-dodge, claim-jump, manifest fraud, press-gang, paperless freight).
- Verify: the identity benchmark crime row differs for Helios vs Ceres (closes the measured 6/8 gap).

### Wave 2 — The world acting on itself, on camera
**BP-4 Ambient scene director ("world-vs-world")** (L)
- What: add `src/systems/ambientSceneDirector.js`, a registered system that stages NPC-only scenes inside the camera frame and keeps to the encounter director's spawn budget. First scenes: police chase (reuses the `lawSecurity` chase/split), tow to the yard, refuel, stop-and-search, fresh-wreck vultures, funeral convoy.
- Rules: at most 1 live scene; it must start within 200 WU of the player and cross the frame; the player may join either side, and if they do it hands off to the normal encounter or law owners.
- Verify: fixed-seed sim test that a chase spawns and resolves; witness capture showing ≥1 scene in frame within 120 s in Tethys/Dione; budget test.

**BP-5 Activity pockets for every core sector** (L)
- What: extend `sectorActivityPockets.js` with 2–3 pockets each for Tethys, Vesta, Pallas, Io, Charon, Sker, Veil and Ashfall (named in §6). Pull Helios pockets inside the 144 WU arrival frame.
- Verify: the existing camera-scale pocket checks; arrival-frame witness per sector.

**BP-6 Shift clock** (M)
- What: add `src/data/sectorShifts.js` (3 shifts per sector, sim-time based) consumed by traffic role weights, the lived-vignette table, worklight emissive state and landmark schedules.
- Verify: determinism test; traffic-mix differs by shift.
### Wave 3 — Rim sectors become places
**BP-7 Rim signature packet ×14** (L; can split per sector, S–M each)
- Per sector: (a) a sharpened way-of-life verb (§6 table); (b) 1 camera-scale activity pocket; (c) the lane contact promoted to a character with a place and a want; (d) one interactive verb on the existing one-off; (e) 1 discovery chain reusing the one-off as a clue POI; (f) 1 resident fauna species.
- Order: Kepler (graveyard bazaar), Dione (speed lane), Rhea (fire), Phoebe (song), Sedna (lanterns), then the rest.
- Verify: per-sector census test (every sector has ≥1 pocket, ≥1 interactive one-off, ≥1 chain); identity benchmark extended to pairwise distinctness across rim neighbours.

**BP-8 Signature toys ×15** (L total; S–M each)
- What: add rows to `environmentalMachinery.js` for the 15 "none" sectors (§2 P.1), each built from existing props plus physics bodies. Each gets an NPC operator cycle (tender/miner job kernel) so players watch it used first.
- Verify: toy physics tests modelled on the existing machinery tests.

### Wave 4 — Persistence and consequence
**BP-9 Wreck lifecycle** (M): a fresh → stripped → derelict transition driven by salvor-job visits; it swaps between the existing `aftermath_*` variants. Verify: save round-trip and transition determinism.

**BP-10 Player legacy props** (M): a persistent registry of player-caused markers (towed hulks, claims, memorials). Verify: save normalization test.

**BP-11 Cross-sector consequence chains** (L): economy and faction deltas propagate to neighbour sectors' traffic weights and rumours (lane contacts). Verify: sim test showing a Tethys blockade shifting Pallas/Nyx traffic.

### Wave 5 — Spectacle and set pieces
**BP-12 Regional heists ×4 + rescue set pieces ×3** (L): modelled on `heistFacilities.js` and `ilexArk.js`.
**BP-13 Boss lairs and ace territories** (M): `namedAces.js` gains `homeSectorId`, a hideout one-off and calling-card props. Capital bosses get sector arenas (Iron Maw in the Vesta slag fans, Tollman at the Dione gate, Brood Queen on the Bolus approach).

**BP-14 Horizon spectacle** (M): parallax capital ships and megastructure silhouettes (the Sedna Ringworld Arc).

**BP-15 Race courses per motif** (M): Pallas reef, Vesta plumes, Haumea ice canyon and the Dione drag, with lane furniture as gates.

### Sequencing
- BP-1, BP-2 and BP-3 go first. They need no art and improve every sector at once.
- BP-4 and BP-5 ship together. Between them they deliver the fantasy of "jobs happening in front of you".
- BP-7 and BP-8 run in parallel lanes, one agent per 3–4 rim sectors.
- Commission the new assets (§8) during Wave 2 so they land in time for Wave 3.
---

## 8. New assets to create

Ranked by how many scenes or sectors each asset unlocks. Everything not listed here can be built from the current kit.

| # | Asset | Kind | Unlocks | Sectors |
|---|---|---|---|---|
| 1 | **Police interceptor** (fast customs/Concord hull with a light bar) | ship | ambient chases, speed traps, stop-and-search | Helios, Tethys, Dione, Pallas |
| 2 | **Prison barge** + escort | ship | prison transfer, breakout | Dione → Sker |
| 3 | **Worker shuttle / crew bus** | ship | shift change, strikes, evacuations | all core |
| 4 | **Pilgrim hulk** (slow, hung with lamps) | ship | pilgrim caravans, funerals | Veil, Phoebe, Sedna |
| 5 | **Capital silhouettes ×2** (Concord carrier, DMC ore leviathan) | ship (LOD/parallax) | horizon spectacle, fleet review | Helios, Ceres, Io |
| 6 | **Ice-cutter / ice sled** | ship | ice rush, calving | Haumea, Nereid |
| 7 | **Racer hull** (stripped, oversized engine) | ship | lane racing, race courses | Dione, Pallas, Vesta |
| 8 | **Market stall module** (lit awning frame) | place | pop-up bazaars, Kepler graveyard market | Kepler, Nereid, Sker |
| 9 | **Hose / umbilical** (dynamic spline) | VFX/place | refuelling, transfers, Well Bucket | many |
| 10 | **Banner / strike sign** | place | strikes, festivals, protests | Ceres, Hyperion, Vesta |
| 11 | **Lantern buoy** (lamp-colour variants) | place | lantern walk, Candle Fleet relight, festivals | Sedna, Helios, Veil |
| 12 | **Fire-front VFX** + scorched-rock decal | VFX | Rhea's burning claim, Vesta fire | Rhea, Vesta |
| 13 | **Thermal plume VFX** | VFX | physics hazard, race course | Vesta, Rhea |
| 14 | **Ion storm front VFX** | VFX | sector weather | rim |
| 15 | **Cut Saw track** (monumental) | landmark | Hyperion's open cut | Hyperion |
| 16 | **Ringworld Arc** silhouette | skybox | Sedna spectacle | Sedna |
| 17 | **Toy kits ×15**: mostly kitbashed; new parts only for Tuning Fork, Wake Kite and Peristalsis Valve | place | §2 P.1 | rim |
| 18 | **Duel ring markers** | place | Sker duels | Sker |
| 19 | **Faction beacon variants** (colour/shape per faction) | place | territory flips, wayfinding | all |
| 20 | **Radio chatter VO pack** (~40 lines per zone type) | audio | overheard-radio layer | all |
| 21 | **Crowd liveries** (per-faction paint sets on existing hulls) | texture | background crowds | all |
| 22 | **Rim fauna ×4** (place existing species on the rim; model Wake Eel and Glassback if they don't exist yet) | creature | rim ecology | Triton, Haumea, Rhea, Sedna |

**Reuse first.** Kitbash before modelling anything new:
- `freight_platform` + `customs_pylon` makes a holding pen.
- `container_rack` + `station_billboard` makes a stall.
- `dead_hulk` + `scrap_cage` makes a yard.

The kit has 150+ place IDs, about 60 of them aftermath pieces. Most of §2–§4 needs only placement.

---

## 9. Measurement plan (keeping this honest)

- **Identity benchmark.** Extend `world.sector_identity` from the Helios/Ceres pair to every sector against each of its neighbours, and add a count of activity inside the camera frame.
- **Content census script.** Track, per sector, the number of pockets, one-offs, toys, chains, named NPCs and eligible vignette variants. Target: at least 6 per category per sector.
- **Repetition index.** In a 30-minute fixed-seed run, measure the share of fired encounters that share a template with another fired encounter. Today 176 of the 281 catalog entries come from one template family.
