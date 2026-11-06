<!-- LIFETIME: CAMPAIGN -->
# Sectors inventory (W1)

Built 2026-11-06 from `src/data/sectors.js` (master) plus its supporting tables. Every claim cites
file + field. The "10 sectors" are the CORE_SECTORS list (`sectors.js:52-1503`); the master file
also merges 11 frontier sectors (`src/data/frontierRegions/`), the Bolus interior card
(`src/data/theBolus.js bolusSectorCard()`), heist facilities, claimable bodies, planet states and
sector wonders via the `SECTORS` pipeline (`sectors.js:1505-1519`).

Identity grades used below:
- **set pieces** — authored hero landmarks, playable encounters, quest furniture with discoveryPlates.
- **chain** — a staged ambient causal chain runs in the sector (`traffic.js` choreography) and/or an authored activity-pocket cast flies it.
- **name+hazard** — name, tier/security, palette class and a hazard circle; little else.

---

## 1. Sector graph

Topology lives in two places: `neighbors` arrays on each sector (`src/data/sectors.js`) and the
physical gate positions in `src/data/sectorAnchors.js` (`CORE_SECTOR_ANCHORS`, gates at
`0.82 * worldRadius` on the bearing to the neighbor's map position) plus the frontier gate patches
appended from `src/data/frontierRegions/index.js` (`FRONTIER_CORE_GATE_PATCHES`). Map positions are
graph units; each unit is 4096 WU of world lattice (`src/data/sectorCoordinates.js`
`SECTOR_ORIGIN_LATTICE_WU`), so distances below are derived lattice distances.

| Sector | Map pos | Tier | Security | Charted | Faction | worldRadius |
|---|---|---|---|---|---|---|
| Helios Prime | (0,0) | 0 | 0.98 | yes | scn | 3500 |
| Ceres Belt | (-3,2) | 1 | 0.72 | yes | dmc | 4200 |
| Tethys Junction | (3,2) | 1 | 0.65 | yes | mts | 4000 |
| Vesta Forge | (0,4) | 1 | 0.60 | yes | dmc | 4300 |
| Pallas Drift | (-5,5) | 2 | 0.42 | yes | mts | 4500 |
| Io Reach | (5,5) | 2 | 0.35 | yes | free | 4600 |
| Charon Expanse | (2,7) | 2 | 0.30 | yes | dmc | 4800 |
| Sker Haven | (-7,8) | 3 | 0.08 | **no** | reach | 5000 |
| Veil Nebula | (7,9) | 3 | 0.12 | **no** | free | 5200 |
| Ashfall Reach | (4,11) | 4 | 0.05 | **no** | vael | 5500 |

Edges (both directions; gate pos = sector-local in `sectorAnchors.js`):

- **Helios Prime ↔ Ceres Belt** (~14.8k WU; gates Helios (-2388,1592) / Ceres (2866,-1910)). Travel lane `lane_helios_ceres` "Helios–Ceres Ore Run" (`travelLaneRoutes.js`).
- **Helios Prime ↔ Tethys Junction** (~14.8k WU; gates (±2388,1592)). Travel lane `lane_helios_tethys` "Helios–Tethys Textile Run" — the original authored lane.
- **Helios Prime ↔ Vesta Forge** (4 mu ≈ 16.4k WU; gates (0,±2870)/(0,∓3526)).
- **Ceres Belt ↔ Tethys Junction** (6 mu ≈ 24.6k WU; gates (3444,0)/(−3280,0)).
- **Ceres Belt ↔ Pallas Drift** (~14.8k WU; gates (-1910,2866)/(2047,-3070)).
- **Ceres Belt → Hyperion Cut** (frontier patch, gate (-3080,-1540)).
- **Tethys Junction ↔ Vesta Forge** (~14.8k WU; gates (-2729,1819)/(2934,-1956)).
- **Tethys Junction ↔ Io Reach** (~14.8k WU; gates (1819,2729)/(-2092,-3138)).
- **Tethys Junction → Nereid Shoal, Dione Lane** (frontier patches, gates (3235,539)/(2813,-1688)). Lane `lane_tethys_dione` "Tethys–Dione Cleared Run".
- **Vesta Forge ↔ Charon Expanse** (~14.8k WU; gates (1956,2934)/(-2183,-3275)). Lane `lane_ceres_vesta` "Ceres–Vesta Slag Run" (Ceres↔Vesta chord).
- **Pallas Drift ↔ Io Reach** (10 mu ≈ 41k WU — the longest core edge; gates (3690,0)/(-3772,0)).
- **Pallas Drift ↔ Sker Haven** (~14.8k WU; gates (-2047,3070)/(2274,-3411)). Lane `lane_pallas_sker` "Pallas–Sker Drift Cut".
- **Pallas Drift → Nyx March** (frontier patch, gate (-3580,-895)).
- **Io Reach ↔ Charon Expanse** (~14.8k WU; gates (-3138,2092)/(3275,-2183)). Lane `lane_io_charon` "Io–Charon Claim Run".
- **Io Reach → Nereid Shoal** (frontier patch, gate (3374,-1687)).
- **Io Reach ↔ Veil Nebula** (~18.3k WU; gates (1687,3374)/(-1907,-3814)).
- **Charon Expanse ↔ Ashfall Reach** (~18.3k WU; gates (1760,3520)/(-2017,-4034)).
- **Charon Expanse → The Bolus** (frontier patch, gate `BOLUS_CHARON_GATE_POS`).
- **Sker Haven ↔ Veil Nebula** (√197 ≈ 14 mu ≈ **57.5k WU** — the longest edge in the graph; gates (4090,292)/(-4253,-304)).
- **Sker Haven → Kepler Scar, Rhea Cinder** (frontier patches).
- **Veil Nebula ⇢ Ashfall Reach** — **wormhole**, not a border: `wormholeTo: { sectorId: 'sector_ashfall_reach', gatedBy: 'tech:tech_long_range_survey', machineGate: 'route_veil_ashfall' }` (`sectors.js:1235`); gate spawned by `world.js:3294` at (680,4120).
- **Veil Nebula → Proteus Well, Triton Wake** (frontier patches).
- **Ashfall Reach → Eris Margin, Sedna Dark, The Bolus** (frontier patches).

**Shape:** one hub pair (Helios–Tethys) at the top; two downward branches — west (Ceres→Pallas→Sker)
and east (Vesta→Charon→Ashfall) — with Pallas↔Io (41k WU) as the single west-east crosslink,
Sker↔Veil (57.5k WU) as the deep-rim link, and the tech-gated Veil wormhole as the secret third
road into Ashfall. Journey-usable fact: every path from Helios to Ashfall passes either Charon
(the honest road, 3 jumps) or the wormhole (the survey-gated shortcut).

Charted=false sectors (Sker, Veil, Ashfall) hide bearings until data is bought (`surveyDataPrice`,
`sectors.js:1547` — bar sells partial nav data for a neighbor, price by tier) or surveyed and filed
(`src/data/surveyCharts.js` chart-filing bounty; `src/systems/surveyFix.js` `bearingCharted`).

---

## 2. Per-sector sheets

### 2.1 Helios Prime — grade: **set pieces + chain** (strongest in the game)
- **Stations** (`sectors.js:63-69`, anchors `sectorAnchors.js:27-30`): Helios Station (trade_hub L, scn; trade/shipyard/refuel/repair/missions; standing iron shortage `marketEquilibriumFactors.cmdty_ore_iron: 0.09`), Coalition HQ (military M; missions/repair/refuel).
- **POIs/landmarks** (`sectors.js:105-298`): Tutorial Beacon; **Vesper's Rehearsal** (SV-3 kinetic choir — playable scan/massline toy); **The Candle Fleet** (hero memorial, `place_landmark_candle_fleet`, placeTargetRadius 100, drives landmark quest `landmark_c3_pit_bearing`); Outer Yard Derelict; lane furniture set (Corridor Pin, Weigh-Point, Starter Seam Claim, Bonded Cold Locker w/ payable silverium, Bay 7); Ash Pin; Outer Yard Whistle; **The Pit Line** (quest cache); Checkpoint Niner (customs buoy on the bare HQ chord); Smear Marker 7; **Relief-Freighter Choir-Tender** (unique-wreck program: rumor → bearing ring → fixed position, `runtimeOwner: 'uniqueWrecks'`); gate-leg beat furniture (Shift Bell 3, Misdeclared Marker 12-K, Lost Freight Apron, Overtime Berth); Seam Tag 19; Pilgrim Mooring.
- **Hazards:** none — `enemyDensity: 0` by contract ("Tutorial home sector: NO hostile spawns", `sectors.js:58-60`).
- **Factions doing things:** SCN harbour watch; the causal chain is **"claim day"** (`sectorCausalChains.js:135-245`, 4 links: prospector stakes claim → customs pullover → prospectors posture → claim jump) flown by the 4-hull pocket cast (`sectorActivityPockets.js:789-963`: seam miner, seam fence, freight hauler, customs patrol); cycle news `helios_claim_story` posts to `station_helios`.
- **Visual:** bespoke `helios_core` profile (`sectorVisualProfiles.js:45-107`): AZURE sky, painted plate `helios-amber-estuary` + baked `sky-helios-orbital-void`, one signature ringed gas giant, exposure 0.99. Rock arrangement "The Open Hand" (`sectorCompositions.js:44-54`). Music: **A dorian, glass, civic room** (`scoreDirector.js:66`).
- **Zones** (`sectorZones.js:97-114`): Concord Core, Sanctioned Claim, Freight Spine, Customs Corridor (patrol presence), Memorial Array.
- **Missing:** nothing structural. It is the reference sector.

### 2.2 Ceres Belt — grade: **set pieces + chain**
- **Stations:** Ceres Refinery (refinery M, dmc; ore_buy/refine/trade/refuel/repair/missions; fuel-cell surplus 2.4; "a contracts desk" comment at `sectors.js:314-322`), Belt Outpost (mining S; food shortage 0.1).
- **POIs:** **Wreck Cathedral** (hero site `world_site_wreck_cathedral`, asteroidSites-owned body); **Second Measure Shipbreak** (world site, visualRadius 210); **RU-7 RUCKUS Open Work Order** (playable: hail + Massline-throw the pressure core); **The Star Lantern SL-9** (Solstice, playable prisms); Kettle Line drift trail (3 authored convoy pieces, `kettleLine.js`); Refinery Flare Rack (first light on the Helios inbound leg); Inbound Weigh Pin; Throughline Weigh Beacon; Claim Forty-Tag + Re-stake on Forty (claim-law pair); Ash Pin on the Pallas Leg; Cathedral Vigil (names Okafor, Breen); Lapsed Claim Cache (payable); Short-Ration Pod; Shaft 7 Stake; Three-Lamp Corner; Abandoned Driller ("Sold Twice"); The Closed Refinery (alienEcology).
- **Hazards:** one dense_asteroid circle (600,-400 r700). Zone layer adds **Belt-Shadow Ambush** (Reach pirates with detonator darts — "the first fight a new pilot goes LOOKING for", `sectorZones.js:124-136`) and the Cinder Sluice current (authored place, `authoredPlaces.js`).
- **Factions doing things:** DMC seam crew; the Ceres chain (11 catalog events) lives in `traffic.js:821` (`CERES_CAUSAL_CHAIN`) and is the oldest staged day; 9-hull activity pocket cast (`sectorActivityPockets.js:20-686`); cycle news `helios`-style via traffic owner.
- **Visual:** bespoke `ceres_belt` rig (`sectorVisualProfiles.js:413-424`): dusty neutral key 0xf0e2c8, dwarf planet dim upper-left. Arrangement "The Quarry Cathedral" (strata). Music: **F# aeolian, grit**.
- **Missing:** nothing structural; the ambush zone is the intended first-fight set piece.

### 2.3 Tethys Junction — grade: **set pieces + chain**
- **Stations:** Tethys Trade Hub (trade_hub L, mts; `missionProfile: 'contracts_hub'`, escort board anchor, live DMC:MTS dispatch conflict key), Customs Gate (military S, scn; toll/scan/refuel).
- **POIs:** the **Tally queue** (7-piece authored toll plaza on the Helios approach: queue buoys, scan-gate red/green sides, The Tally Post WT-TETH-19, Held-for-Count Rack, Seized Cargo Pod, Count-Face Worklight); **RUBRIC HM-11 Marking Line** (playable stencil-drone puzzle); Black Market Contact (hidden Quiet ambush-scan); Weigh-Slip Buoy; Customs Log Relay; The Split Station (alienEcology); outbound-leg furniture (Convoy Marshal Nine, Form-Up Post, Refused Consignment); Second Count Buoy (dead Concord toll layer); The Re-filed Hull; Braid Tally; PQ-019 heist facility anchors (`heistFacilities.js` via `appendPq019FacilityPois`).
- **Hazards:** no `hazards` array, but the zone layer carries **The Anvil** planetary gravity well on the southern approach (`zone_tethys_anvil`, wayOfLife row hazardGeometry).
- **Factions doing things:** **"the quiet handoff"** chain (`sectorCausalChains.js:287-444`, 5 links: tanker holds → patrol shift change → criminal handoff → smuggler breaks w/ real jettisoned pickups → observation stop) flown by a **12-hull** pocket cast (`sectorActivityPockets.js:1417+`) — the biggest authored cast; news `tethys_quiet_handoff` to `station_customs`.
- **Visual:** bespoke `tethys` profile (`sectorVisualProfiles.js:282-325`) — the only sector allowed to carry the galaxy plate `sky-galactic-spur`; no hero planet. Arrangement "The Shipping Lanes" (braid). Music: **C mixolydian, signal**.
- **Missing:** nothing structural; this is the act-2-feel hub.

### 2.4 Vesta Forge — grade: **set pieces + chain**
- **Stations:** Forge Foundry (fab M, dmc; module_craft), Forge Outlying Yard (fab S), Refuel Depot (mining S, **faction_choir** — "The Choir posts shift work in verses").
- **POIs:** **The Resonant Cathedral** (hero landmark `place_landmark_resonant_cathedral`, placeTargetRadius 110, Choir, lore `landmark_c13e_resonant_cathedral`); **HOOK-LEFT Fin-3** (RUUD — playable living-suit anomaly); Red Cable Yard (alienEcology); Derelict Freighter "Slag-Run Nineteen"; Cold Drill Four; **Gallery Rock** (welder graffit wall); Hot Face Claim (radiation-watch claim); The Lead Hedge (chalk watch-tallies); Guild Stamp Post; Reject Run; Kilnward Buoy (signed lane keeper on the Charon leg); Slag-Choir Relay + Shift-End Ore Cache (hidden scan finds).
- **Hazards:** radiation pocket (-540,-480 r600) = Slag Radiation Field zone; wayOfLife also names a storm lane.
- **Factions doing things:** **"the feedstock day"** chain (`sectorCausalChains.js:502-660`, 4 links: haulers rendezvous → hazmat escort → yard break → scavengers at fresh wreck, gated on BOTH middles) flown by an 8-hull cast (`sectorActivityPockets.js:1185+`); news `vesta_feedstock_day` to `station_forge`.
- **Visual:** bespoke `vesta_forge` rig (`sectorVisualProfiles.js:385-394`): hot orange-white key 0xffc98f, warm fill bounce, barren rocky hero. Arrangement "The Slag Fans" (fan motif). Music: **E phrygian, forge**.
- **Missing:** nothing structural.

### 2.5 Pallas Drift — grade: **set pieces, no chain**
- **Stations:** Drift Market (trade_hub M, mts; food surplus 2.4 — "the fringe's kitchen"), Smuggler Den (blackmarket S, faction_quiet).
- **POIs:** **The Quiessence** (hero landmark — 17 intact freighters holding formation, lore `landmark_c14_quiessence`, bandLandmarkFleet 17); **RAVEL The Unraveller** (playable three-weights challenge); **The Smuggler's Archipelago** (4-hulk wreck fence along the Sker run: Archipelago Hulk, Gutted Lighter, Split Freighter, Toll Hulk — each with a plate); The Eighteenth Mooring (drift custom for the 18th ship); Off-Books Berth; The Quiet Bell (den doorbell); The Mess Line; Skerward Ward-Buoy; Faith Filing Ninth; Drift Tag; Pirate Wreckage; Hidden Cache; Empty Habitat (alienEcology) / Empty Foundry (machineLayer).
- **Hazards:** nebula (400,600 r800) — "the murk eats the scanner".
- **Factions doing things:** Quiet run the den; Reach stages the Sker-run ambush zone (`zone_pallas_ambush`, raiders [3,4]). A **10-hull** activity-pocket cast flies salvage loops (`sectorActivityPockets.js:983-1184`) but **no staged causal chain** — absent from `SECTOR_CAUSAL_CHAIN_DEFS` (`sectorCausalChains.js:675-704` lists only Helios/Tethys/Vesta/Dione).
- **Visual:** bespoke `pallas_drift` rig (`sectorVisualProfiles.js:396-405`): cold blue-white key 0xd9e6ff, ice hero body. Arrangement "The Smuggler's Archipelago" (islands). Music: **D lydian, drift**.
- **WayOfLife row exists** (`sectorWayOfLife.js:112-124`) but `signatureToy: 'explicitly none'`.
- **Missing for a journey:** a staged day (the 10 hulls loop; nothing composes them into an afternoon) and a signature toy.

### 2.6 Io Reach — grade: **name+plates+zones** (mid identity)
- **Stations:** Reach Station (trade_hub M, free, `contested: true`), Mercenary Outpost (blackmarket M, quiet; bounty board `missionProfile`, minRep −30).
- **POIs:** Derelict Cruiser (**The Wreck Cathedral** plate — the Concord Vigilant story, flavor `landmark_c1_wreck_cathedral_concord_vigilant`; the *other* Wreck Cathedral name, in Io not Ceres); **Vigil Array** (refitted every founding day, nine ribbons + one blank); Quiet Mast; Burn Claim Pin; Shepherd's Ring (alienEcology); Listening Field (machineLayer); Pallas Industrial Moon (claimable colony body).
- **Hazards:** dense_asteroid + nebula ("The mail flies the gap" — wayOfLife).
- **Factions doing things:** zones only — Contested Lane patrol, Cruiser Graveyard scavengers, Quiet guards picket at the merc camp (`standingHostileBelow: -30`, `sectorZones.js:200-218`). **No activity pocket cast, no causal chain.**
- **Visual:** shared `fringe` family profile (no bespoke rig; `PROFILE_BY_ID` maps io_reach → fringe, `sectorVisualProfiles.js:459`). Arrangement "The Last Anchorage". Music: **G aeolian, reach**.
- **Missing for a journey:** a living cast; the mail-run wayOfLife ("Carry the Reach mail and leave") is text only — no chain or pocket flies it.

### 2.7 Charon Expanse — grade: **anomaly field, thin human layer**
- **Stations:** Expanse Refinery (refinery M, dmc; bounty board `missionProfile`, scan_tech).
- **POIs:** strong non-human set — Cinder Nursery (world site), Warm Freighter, Three Hull Garden, Unidentified Lattice, Star Marker, Broken Shepherd, Preserved Cockpit, The Empty Skin (alienEcology/machineLayer, all with plates); human set: Abandoned Mining Colony (claimable), Lung Marker, **Snapped-Tether Hab-Pod** (distress + survivor pod, lore `landmark_c7_lung_of_charon`), **Tether Memorial** (names burned per bunk), Reader's Stake, Slurry Relic.
- **Hazards:** radiation (300,-700) + dense_asteroid (-600,500); the zone layer adds the Ashfall Approach Ambush (Reach raiders [3,5]).
- **Factions doing things:** refinery watch + writ wall (wayOfLife). **No pocket cast, no causal chain.** Faction presence: Understory Afterwake node parks here (`factionPresence.js` `presence_understory_charon`).
- **Visual:** **no bespoke rig** — falls through the nebulaTint lookup to the belt family (`sectorVisualProfiles.js:467-472`). Arrangement "The Broken Procession" (strata). Music: **B dorian, cold**.
- **Missing for a journey:** the claim-crew/hunter-board day is prose (`sectorWayOfLife.js:153-166`); nothing flies it.

### 2.8 Sker Haven — grade: **set pieces + small cast, no chain**
- **Stations:** Sker Bazaar (blackmarket M, reach, `repGated: true` — "vouched for or you're cargo").
- **POIs:** **The Skerris Throne** (hero landmark — fortress welded from captured hulls, `place_landmark_skerris_throne`, placeTargetRadius 150, on the Pallas approach chord); Bounty Wrecks (recovery encounter); Stash Cache (stolen goods); Vane's Tally (toll-saint ledger); Marked Rock ("the only honest history in the sector"); Penance Moor; Bounty Tally; plus machine/alien sites (Harvest Deep, Null Causeway, Red Snow, Quiet Dock).
- **Hazards:** two dense_asteroid pockets at 0.6 intensity; zone layer: Skerris Deep picket (`standingHostileBelow: 0`), **Reach Gate-Camp** ambush zone ("Anything that jumps in is scanned, then swarmed"), Press-Gang Seams.
- **Factions doing things:** a 4-hull pocket cast (`sectorActivityPockets.js:1884+`); **no causal chain**.
- **Visual:** bespoke `sker_haven` rig (`sectorVisualProfiles.js:408-412`): sodium amber key 0xffb45e over the Throne. Arrangement "The Concealed Harbour" (crescent). Music: **Bb phrygian, rust**.
- **Missing for a journey:** the vouch/refit/hunt loop is prose; the gate-camp is a fight, not a scene.

### 2.9 Veil Nebula — grade: **puzzle set piece, no human cast**
- **Stations:** Research Station Veil (research M, free; scan_tech — "Sells readings it won't explain").
- **POIs:** **The Resonance Obelisk** (hidden; 3-ping triangulation minBaselineWu 350, lore `landmark_c2_resonance_obelisk`); **The Veil Wormhole** (tech-gated road to Ashfall); Far Sounding (second, unlisted aperture); Quiet Ice, Pale Spire, Silent Gate, Black Orchard, Containment Ring, Exception Chamber (machine/alien plates); Murmur Buoy; Choir Tag.
- **Hazards:** sector-filling nebula (r3000, intensity 0.9) + radiation; zone layer: Blind Nebula, The Veil Anomaly (**Vael presence packs**), Wormhole Threshold.
- **Factions doing things:** none staged — **no pocket cast, no chain.** Vael guard the anomaly via zone presence.
- **Visual:** `anomaly` family profile (cold-halo plate, wormhole landmark bias, ice ringed hero). Arrangement "The Missing Centre" (rift). Music: **Eb lydian, choir**.
- **Missing for a journey:** the instrument-station day is prose; nothing moves here except Vael.

### 2.10 Ashfall Reach — grade: **boss set piece + hazard machine**
- **Stations:** Ruined Cache Station (blackmarket S, vael, `repGated`).
- **POIs:** **Boss Arena Signal** (the Iron Maw Deep-Mower/Deep-Mother boss; `defeatNews` fires on kill, lore `landmark_c5_iron_maw`); **Ancient Vault** (`unlockAfterBossId: 'poi_boss'` — the growth-archive payoff); The Vault Maw (c4); Kurtz's Mark; Burn Lamp; Keykeeper's Watch; machine/alien set (Breathing Dock, Gate Underlayer, Ranked Frames, Black Vault, Active Maintenance, Converted Yards, Towed Moonlet, Old Sterile Zone, The Line).
- **Hazards:** the **Roaming Burn** — a *moving* radiation hazard (840 WU core circling a 2000 WU envelope on a deterministic law in `environmentalMachinery.js` `ASHFALL_BURN_*`; `afterBossDefeat` drops intensity and re-points it at the boss grave, `sectors.js:1355-1365`) + two debris fields. This is the only authored moving hazard in the core ten.
- **Factions doing things:** Vael cache hands (wayOfLife); zone layer: Iron Maw Approach (Vael packs), Kurtz's Cache, Edge Seams. **No pocket cast, no chain.**
- **Visual:** anomaly family via tint (no bespoke rig). Arrangement "The Severed Jaw" (rift). Music: **C# aeolian, ash**.
- **Missing for a journey:** the burn-lee work rhythm is prose; the boss + vault is the set piece.

### Frontier ring (context for act 3+)
11 more sectors hang off the core ten (`frontierRegions/` west/north/east/south): Hyperion Cut (Ceres), Nyx March (Pallas), Kepler Scar + Rhea Cinder (Sker), Nereid Shoal (Io+Tethys), Dione Lane (Tethys), Proteus Well + Triton Wake (Veil), Eris Margin + Sedna Dark (Ashfall), The Bolus (Charon+Ashfall, wet-interior `viscera` palette). Dione Lane has the fourth staged chain (`DIONE_CAUSAL_CHAIN`, convoy day); six frontier sectors have authored **sector wonders** (`sectorWonders.js`: Unwritten Bridge, Last Lantern, Red Sun Engine, Glass Harp, Ship Inside the Ice, Stepwell); ten have physical-law approach hazards (`sectorPhysicalLaws.js`). All have composed music beds (`sectorScoreBeds.js`) and wayOfLife rows. Most of the 10 core sectors do **not** have composed beds — core identity rides `SECTOR_SCORE_IDENTITY` instead.

---

## 3. Identity plumbing — where sector identity changes would land

| File | What it carries per sector | Fields already supported |
|---|---|---|
| `src/data/sectors.js` | the master card | `name`, `tier`, `security`, `charted`, `scenic`, `factionId`, `position`, `worldRadius`, `palette` (SECTOR_PALETTE_CLASSES core/belt/fringe/anomaly/viscera: key/rim/fill/ambient/fog/fogDensity/nebulaTint/dust), `trafficPerMin`, `enemyDensity`, `enemyLevel`, `neighbors`, `stations[]` (services, marketEquilibriumFactors, chartNote, missionProfile, boardAnchorType, dispatchLabel, repGated, contested), `fields[]`, `hazards[]` (type/center/radius/intensity, `moving`, `afterBossDefeat`), `pois[]` (type, name, pos, landmarkGlb, visualRadius, placeTargetRadius, discoveryPlate, chartNote, scannerSignalKind, runtimeOwner, flavorTargetRef, landmark, hidden, requiresActiveScan, contents, triangulation, wormholeTo…), `wormholeTo`, `industries` |
| `src/data/sectorVisualProfiles.js` | sky/light/post identity | family profiles + `PER_SECTOR_RIGS` (bespoke rigs already exist for vesta_forge, pallas_drift, sker_haven, ceres_belt; helios_core and tethys are bespoke families). Fields: `skyPalette`, `lighting` (ambient/key/rim/fill + per-channel keyColor/fillColor/rimColor/ambientColor), `background.paintedSky` (plate/strength/parallax/saturation), `background.sky` (baked backdrop plate), `background.structure` (recipeId, structureKind, star/cluster/flare densities, band geometry, landmarkBias), `background.composition` (planetChance, wormholeChance, ringChance, planetTypes, cometInterval, signatureHero with screenNdc), `post` (exposure, bloomStrengthScale, bloomThresholdBias), `galaxyPlate`. Resolver: `resolveSectorVisualProfile` (`:467`) — ashfall_reach and charon_expanse currently have **no** PROFILE_BY_ID row and fall through the nebulaTint lookup. Consumers: `src/render/spaceBackground.js`, `src/render/renderer.js`, `src/render/fleetLook.js`, `src/systems/environmentMaterials.js` |
| `src/data/sectorCompositions.js` | rock-arrangement art direction | per sector: `name` ("The Open Hand", "The Quarry Cathedral", …), `intent` (one line), `focus`, `stationHalo`, `routeHalfWidth`, `motif` (crescent/strata/braid/fan/islands/rift), per-field motif overrides. All 25 sectors have rows |
| `src/audio/scoreDirector.js` | sector music identity | `SECTOR_SCORE_IDENTITY` (`:65`): **every** sector incl. all 10 core has a unique (tonic, mode, tempo, colour, room) row + label; `FACTION_SCORE_COLOUR` gives each faction an interval cell + timbre. Consumers: `src/audio/themeMatrix.js`, `themeCompose.js`, `bandBeds.js`, `scoreDirector.js` itself |
| `src/audio/sectorScoreBeds.js` | composed per-sector beds | `PARTS` table — **frontier sectors + the Bolus only** (nyx_march … the_bolus); the 10 core sectors have no row, so their bed is derived purely from the score identity |
| `src/data/sectorWayOfLife.js` | the one-line identity contract | per sector: `sentence`, `verb`, `rhythm`, `law`, `crime`, `ships`, `structures`, `hazardGeometry`, `landmark`, `signatureToy` (several toys are `'explicitly none'`: Pallas, Nyx, Kepler, Orcus, Rhea, Eris, Phoebe, Nereid, Proteus, Triton, Eunomia, Sedna, Dione, Bolus) |
| `src/data/livedSectorOverlays.js` | ambient crew voice | per sector: `crew` name, `situations`, 6 `lines` ("Our …" barks) — all sectors covered |
| `src/data/sectorPhysical.js` | one physical quirk | per sector one differing ratio among `rockMass / trafficSpeed / gravity / patrolResponse` (e.g. Vesta rockMass 2.2, Charon patrolResponse 2.2, Io rockMass 0.65) |
| `src/data/sectorZones.js` | named zones + reason strings | per zone: `name`, `type`, `factionId`, `reason` (the "why does this exist here" line), `center/radius`, `threat`, `presence` (archetypes, size, doctrine, formation, standingHostileBelow, spawnCenter) |
| `src/data/sectorCausalChains.js` | staged ambient stories | Helios/Tethys/Vesta (+Dione) chain defs: link ids from the microevent catalog, actorSlots, seeds/interruptSeeds, phase names/durations/cues, `cycleNewsText` |
| `src/data/sectorActivityPockets.js` | authored ambient casts | Ceres 9, Helios 4, Pallas 10, Vesta 8, Tethys 12, Sedna 4, Sker 4 hulls; pocket ids, actor slots, route topology, service slots |
| `src/data/sectorWonders.js` | frontier wonder machines | 6 authored tow-and-cut set pieces (frontier only) |
| `src/data/sectorAnchors.js` | fixed geography | station/gate/field/poi positions + landmark GLBs; `applySectorAnchors` merges into SECTORS |

**Gap statement (data-only):** music identity exists for every sector but composed *beds* exist only
for the frontier; visual profile *rigs* exist for 6 of the 10 core (missing bespoke rows: io_reach
rides `fringe`, charon_expanse rides `belt`, veil_nebula rides `anomaly`, ashfall_reach rides
`anomaly` — all via tint fallback, which is a deliberate default, not a defect). There is no
per-sector palette/music *hook field on the sector card itself* — identity resolves by sector id
through the tables above.

---

## 4. Travel / interdiction plumbing — exact files and behavior

**Graph + gates**
- `src/data/sectors.js` — `neighbors` arrays (chart topology); `wormholeTo` on Veil (tech gate).
- `src/data/sectorAnchors.js` — `CORE_SECTOR_ANCHORS` gate positions (bearing-derived, `bearingGate`, `GATE_R = 0.82`); `applySectorAnchors` merges gates into the sector card.
- `src/data/frontierRegions/index.js` — `FRONTIER_CORE_NEIGHBOR_PATCHES` (adds frontier ids to core neighbors) and `FRONTIER_CORE_GATE_PATCHES` (adds the physical gates).
- `src/systems/world.js` — `enterSector(sectorId, {fromJump})` (`:1145`, chunked twin `:1159`) materializes target + corridor, sets membership, emits `sector:enter`; jump path validates + charges gate toll (`:6532-6550`) and spawns the wormhole gate with `gatedBy`/`machineGate` (`:3294-3300`). Gate toll amount: `gateTollFor` (`src/data/travelChoices.js:15`) — security > 0.6 → 50 + 200·security cr.
- `src/data/sectorCoordinates.js` — the 4096 WU lattice, Voronoi membership (`sectorMembershipAtGlobal`), residency tiers FULL/REDUCED/RECORD_ONLY (cap 3, `planMaterializedResidents`); continuous free-flight crossing a Voronoi edge never teleports.

**Travel lanes (optional infrastructure on an edge)**
- `src/data/travelLaneRoutes.js` — 6 authored lanes (Helios–Tethys, Helios–Ceres, Ceres–Vesta, Pallas–Sker, Tethys–Dione, Io–Charon): ×2.5 drive ceiling/ramp, 512 WU corridor, beacon chain derived from sector origins at 1024 WU spacing, one `disruptedSegments` entry each, `ambushShapeId: 'ambush_snare'`.
- `src/systems/travelLanes.js` — read-model implementation: boost via `propulsionKernel.normalizeTravelDrive` overrides; dead segment sets `state.player.travelDrive.disrupted` which `src/systems/input.js:116-122` pins in Cooldown (the slowdown); disrupted-segment ambush publishes `lane:ambushArmed` (`:1179`) then requests an authored `ambush_snare` encounter from encounterDirector.

**Gate scenes**
- `src/systems/gateControlDirector.js` — seeded director (`mulberry32(hash32(seed, sectorId, gateTo, dayIndex))`) fires on `jump:chargeStart`: banded toll via `src/data/gateControl.js planGateScene` (emits `economy:chargeCredits`, never a direct write), ≤2 passive scan-wing ships, wanted-player skip, 120 s per-gate cooldown. Cannot deadlock the jump — world owns the timer.

**Interdiction (the "arrival dice-roll")**
- `src/systems/encounterDirector.js` `_onSectorEnter` (`:689`) — on non-continuous entry it reseeds pressure pools by security (entry grace ≈30 s breath) and calls `_planSector(sectorId)`, which plans the sector-day beat list with the per-sector/day seeded RNG; continuous (free-flight) entries do NOT replan. `_seedCeresActivityAmbush` arms the authored Ceres throughline ambush pack.
- `src/systems/encounterScripts.js:597-613` — **cruise interdiction**: an ambush shape near a cruising player warns (`snare_warn`) then, once, emits `cruise:snareRequest` + `interdiction:triggered`; `src/systems/cruise.js:243` applies the stumble (D5: the snare is defeated by a vector break or manual cruise-drop inside the warning — "the counterplay IS the design").
- `src/data/ambushSignatures.js` — the scannable telegraphs for ambush shapes (dead beacon, cargo bait, callsign echo, sensor tripline, false distress, towed bell lure).
- `src/systems/dangerModel.js:466-471` — `mining_noise` / loud-extraction impulses raise an `interdiction_wave` danger that draws hunters (noise = interdiction draw).
- `src/systems/environmentalMachinery.js:1665` — the Ashfall blackout vents `sfx_travel_interdiction` (environmental interdiction audio cue).

**Charted/survey (why the rim is dark)**
- `src/data/sectors.js` `charted: false` on Sker/Veil/Ashfall + `surveyDataPrice` (bar sells neighbor nav data by tier); `src/data/surveyCharts.js` chart-filing bounty (300 + 220·sites + 850·tier cr, +2 SCN rep); `src/systems/surveyFix.js` `bearingCharted`; `src/data/surveyCartography.js` durable survey memory.

**Sector-entry presentation**
- `src/systems/presentationAdapters.js:676,952` — `sectorArrivalAudio` on arrival cues; `src/audio/themeMatrix.js` + `scoreDirector.js` switch the score identity on sector change; `src/render/spaceBackground.js` swaps sky plates/profile.
