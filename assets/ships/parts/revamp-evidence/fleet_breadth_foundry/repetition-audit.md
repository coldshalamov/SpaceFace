# Fleet Breadth Foundry — Live Repetition Audit

**Branch:** `codex/fleet-breadth-foundry-20260720` @ `c740ae01`
**Machine-readable twin:** `repetition-audit.json`
**Method:** runtime maps + spawn systems only (`partsLibrary.js`, `visualOverrides.js`, `world.js`, `traffic.js`, `combat.js`, sector anchors). Filenames and prose inventories are not usage proof.

---

## Executive summary — first 30 minutes

A new player in **Helios Prime** sees almost no combat variety: `enemyDensity` is **0**, so the sky is **traffic + stations + lane props**.

What repeats:

1. **One fighter body for every lawful patrol/escort** — `ship_wasp` → production Wasp whole-ship (`wasp_production_v1.glb`), tinted by sector owner palette. SCN, MTS, DMC, Free all fly the same fighter.
2. **Three Helios civilian bodies for all cargo life** — hauler → `helios_span`, courier → `helios_lark`, miner → `helios_cradle`. Role differs; faction does not.
3. **One trade-hub station mesh for core powers** — Helios (SCN), Tethys (MTS), later Drift/Reach reuse `place_station_trade_hub` with color only.
4. **Lane beacons and billboards** stamp every core approach with the same tall pole and ad frame.
5. **Jump gates** all use `place_gate_jump_ring`.
6. When the player leaves high-sec, **Ashline** hostiles appear — but **reaver and corsair share one rig body**, and several enemy types still fall through to the **production Wasp** or **modular hulls** because they are missing from the hostile whole-ship map.

Faction identity on the live route is mostly **`paletteFor` hull/accent/thruster colors**, not construction grammar. That is the core breadth problem.

**Live admission path (important):** `renderer.js` installs overrides with `directAuthoredMount: true`. Ships skip procedural `FACTION_BUILDERS` and go through `wrapShipWithAuthoredParts`. Authored GLBs are what the player sees when admission succeeds.

---

## Top 10 variation targets

| Rank | Runtime id | Why first | Suggested families (construction, not tint) |
|---:|---|---|---|
| 1 | `place_station_trade_hub` | First dock; SCN/MTS/Free share one mesh | Concord plated hub / Meridian gantry hub / Free patchwork hub |
| 2 | `wholeship_wasp_production_v1` | Highest concurrent traffic combat silhouette | SCN patrol kit / MTS escort fairings / Free militia plates |
| 3 | `wholeship_helios_span` | Dominant hauler weight (30 base) | Sealed corporate hold / DMC ore-box / Reach scrap hauler |
| 4 | `place_lane_beacon` | Up to 4 per core sector along every gate | Tower beacon / industrial strobe spar / scavenged beacon |
| 5 | `hull_interceptor` | Sole high-sec ambient hostile hull (`patrol_lawman`) | Law interceptor kit / raider interceptor kit |
| 6 | `wholeship_helios_cradle` | Belt industrial identity | DMC claw barge / Free prospector / Quiet stripped hold |
| 7 | `wholeship_ashline_rig` | Reaver **and** corsair map to one body | Hook scavenger / blade raider |
| 8 | `place_station_blackmarket` | Highest station archetype count (8); Quiet/Reach/Vael | Cloaked warren / scrap warren / growth dock |
| 9 | `place_gate_jump_ring` | Every sector transition | Concord ring / truss gate / scavenged hoop |
| 10 | `weapon_pulse_cannon` | Default modular gun multiplies on hardpoints | Military shroud / industrial clamp / pirate weld jacket |

Full donor table with `file:line` citations: see `repetition-audit.json` → `donors`.

---

## Faction sameness table

| Factions that currently look like recolors | Shared live asset | Where it shows | Cite |
|---|---|---|---|
| SCN, MTS, Free | `place_station_trade_hub` | Core trade stations | `sectorAnchors.js` + `sectors.js` factionIds; `partsLibrary.js:58` |
| Quiet, Reach, Vael | `place_station_blackmarket` | Smuggler dens / Sker / Ashcache / frontier | anchors + `partsLibrary.js:61` |
| DMC, Choir | `place_station_mining` | Belt Outpost vs Choir depot | `sectors.js` stations; anchors |
| **All sector owners (traffic)** | Helios Span / Lark / Cradle + production Wasp patrols | Ambient freighters & patrols | `traffic.js:64-85`; `partsLibrary.js:429-433,387-390` |
| Reach hostiles (reaver **and** corsair) | `ashline_rig` | Mid-route pirates | `partsLibrary.js:417-418` |
| SCN law vs modular hornet paths | `hull_interceptor` | `patrol_lawman` ambient | `world.js:129,1623-24`; `enemies.js:134-136` |
| Any modular ship | Seed-picked fins/cockpits | Not faction-keyed | `partsLibrary.js:2230-2235` |

**Palette-only differentiator:** `paletteFor` in `partsLibrary.js:4569-4588` reads `FACTION_PALETTES` (`src/data/palettes.js`). Fourteen faction colors; far fewer construction answers.

---

## What actually spawns (default route)

### Traffic (`src/systems/traffic.js`)

| Role | Ship def | Live visual | Base weight |
|---|---|---|---:|
| hauler | `ship_mule` | **helios_span** whole-ship | 30 |
| courier | `ship_kestrel` | **helios_lark** whole-ship (player Kestrel protected) | 18 |
| miner | `ship_pelican` | **helios_cradle** whole-ship | 16 |
| patrol | `ship_wasp` | **wasp_production_v1** whole-ship | 14 |
| escort | `ship_wasp` | **wasp_production_v1** | 8 |
| smuggler | `ship_drifter` | modular **hull_multirole** | 6 |
| pirate | `ship_hornet` | modular **hull_interceptor** | 5 |
| rescue | `ship_drifter` | modular **hull_multirole** | 3 |
| express | `ship_mule` | modular **hull_freighter** (not Span — trafficRole `express` absent from whole-ship traffic map) | 3 |

Helios: 6–8 concurrent; high-sec mix suppresses smugglers/pirates and boosts patrol.

### Hostiles (`world.js` + `enemies.js` + whole-ship maps)

| Condition | Pool / body |
|---|---|
| security ≥ 0.6 | `patrol_lawman` → modular `hull_interceptor` |
| lower security | reaver / swarmer / corsair |
| `wasp_swarmer` | **ashline_dart** |
| `reaver_pirate`, `corsair_raider` | **ashline_rig** (shared) |
| `bruiser_brawler` | **ashline_lode** |
| Gaps | `lancer_sniper`, `choir_zealot`, `quiet_ghost` → production Wasp; `mine_layer_jackal` → modular multirole; `pd_screen_escort` → modular corvette |

### Stations (CORE + frontier anchors)

| Archetype | Approx global count | Multi-faction? |
|---|---:|---|
| `place_station_blackmarket` | 8 | Yes (Quiet/Reach/Vael+) |
| `place_station_trade_hub` | 6 | Yes (SCN/MTS/Free+) |
| `place_station_research` | 6 | Yes |
| `place_station_mining` | 5 | Yes (DMC/Choir+) |
| `place_station_military` | 3 | SCN-heavy |
| `place_station_refinery` | 3 | DMC-heavy |
| `place_station_fab` | 1 | DMC |

### Field props (highest early instance rates)

1. `place_lane_beacon` — core dressing
2. `place_gate_jump_ring` — every gate
3. `place_station_billboard` — core stations
4. `place_nav_buoy` + `place_mining_drone` — belt
5. `place_debris_chunk` / `place_dead_hulk` — POI + fringe

---

## Modular part pools (only when not whole-ship)

- **Hulls:** strict `HULL_FILE_BY_DEF_ID` (`partsLibrary.js:369-383`). `hull_gunship` is in the library contract but **not** defId-mapped → effectively unreferenced on default route.
- **Engines:** defId/driveId maps (`ENGINE_FILE_BY_*`) — vector / ion_small / industrial dominate modular traffic.
- **Fins & cockpits:** pure seed hash over full pools — variety without faction meaning.
- **Weapons:** `weapon_pulse_cannon` default; turret/lance/rail/gatling/heavy by facing/id.
- **Greebles:** role buckets; **Vael skips greebles** (`authoredGreebleMounts`).

---

## Detail that survives gameplay distance

| Survives (bold reads) | Vanishes / fails |
|---|---|
| Whole-ship silhouettes, station massing | Modular greebles at 0.14–0.16 target length |
| Tall beacons, long hulks/barges | Micro rivet/wear on single-material hulls |
| Large thruster plumes (with runtime fixes) | High-frequency 1024 detail after mips |
| Panel splits / large trim bands | Fin edge-wear as identity |

Evidence of distance failure already in code: vector-drive plume normalization (`partsLibrary.js:3796-3802`).

---

## Downstream guidance

1. Prefer **variant families on the top 10** over new random greeble packs.
2. Fix **hostile whole-ship coverage gaps** so enemy roles do not silently become production Wasps.
3. Wire **fin/engine/weapon** selection by role/faction where files already exist (e.g. radiator vs swept smuggler fins) — seed-only pools waste authored diversity.
4. Treat **trade hub + patrol Wasp + Helios Span + lane beacon** as the minimum “first hour no longer feels samey” set.
5. Do **not** dilute the player Kestrel; traffic is already correctly diverted to Helios Lark.

---

## Unreferenced / non-route notes

| Asset | Status |
|---|---|
| `hull_gunship` | In `PART_LIBRARY_CONTRACT`, not in `HULL_FILE_BY_DEF_ID` |
| `wholeships/pelican.glb`, legacy `wasp.glb` | Manifest entries; not in live `WHOLE_SHIP_*` maps |
| `place_dock_interior*` | UI hangar only (`shipPreviewMount.js`), not flight props |
| LOD1/LOD2 whole-ship files | Catalogued; live whole-ship seam uses LOD0 |
