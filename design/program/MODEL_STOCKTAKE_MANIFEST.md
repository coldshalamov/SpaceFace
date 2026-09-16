<!-- LIFETIME: DURABLE -->
# 3D stocktake manifest — live maps, 2026-09-09

Research only. No modeling. No wiring. Hitch / Kestrel frozen.

Counted from live selectors and checks, not a filename grep. Dated catalogs
(`needed-assets.md`, `VISUAL_ASSET_CATALOG.md` 2026-08-08, `GRAPHICS_ORPHAN_CENSUS.md`
2026-08-09) are archaeology. Every row below was re-proved against the working tree.

**How to read a row:** one player-visible slot, or one unused authored body. Grade is
chase camera (`play_chase` / `play_chase_abeam` / `play_chase_close`) versus Hitch.
A packaged file is not accepted art. LOD1/2, cabins, and studio crops are not missing
pieces.

**Evidence this pass**

| Instrument | Result |
|---|---|
| `WHOLE_SHIP_FILE_BY_*` + `PLACE_FILES` + `PACKAGED_LIVE_WHOLE_SHIP_FILES` in `src/render/partsLibrary.js` | Maps below |
| `SOURCE_ROUTE_ALLOWLIST` in `src/render/assetLoader.js` | One exception: `fin_crystalline.glb` (duplicate node name) |
| `src/data/ships.js` | 13 buyable identities |
| `assets/ships/release/release_manifest.json` | 227 packaged rows; 35 wholeship ids including factory hulls, liner, tanker, cutter |
| `npm run check:live-whole-ship-admission` | Pass (6). Reaver / 47-A interceptor publish `ashline_rig.glb` when `assetRef` / `lootTableId` is set |
| `npm run check:asset-reachability` | **Fail.** 514 referenced, 512 retail-routable. Two painted-planet PNGs are outside bundled roots |
| Default New Game (`src/main.js`) | Player Hitch at `{0,0}`, Helios Prime, `spawn47aOpeningScene({ liveColdStartSafe: true })` |
| Owner playtest 2026-09-08 | Hitch reads as a ship. A nearby NPC sheds parts / pink glow. Reverse reads as two needles |
| Browser chase stills this session | **Unavailable.** Visual grades that need a picture are `unproven` unless the live path is code-built (tube) or the owner already named the defect |

**Allowlist law (empty admission).** Live play mounts a zero-draw substrate
(`directAuthoredMount: true`). A ship publishes only if `wholeShipVisualForEntity` picks a
file **and** that file is in `PACKAGED_LIVE_WHOLE_SHIP_FILES`. Hitch (player) and Wasp are
the only *required* whole-ships. Def-map factory hulls sit in `WHOLE_SHIP_FILE_BY_DEF_ID`
and in the release manifest, but they are **not** required and **not** on the allowlist.
§13D’s “factory bodies now load” is overstated: they load only if something forces
`requiredWholeShip`. Otherwise the ship is modular kit or blank space.

---

## 0. Verdict key

| Verdict | Meaning |
|---|---|
| KEEP | Live, complete, same game as Hitch at chase size |
| ADMIT | Packaged complete body the loader still refuses, or a referenced file that cannot publish |
| IMPROVE-IN-PLACE | Live file exists; form or surfacing is the weakness |
| ENCLOSE | Accessory-only / floating parts; needs a meeting hull |
| REPURPOSE | Unused authored body that beats live after package + chase stills |
| REMAP-AFTER-PROOF | Factory remaster of an already-live hull. Do not swap until packaged **and** better |
| RETIRE | Half-built, superseded, or cannot beat live. Do not wire |
| COMMISSION-LAST | Default-route hole the shelf cannot fill |

---

## 1. Opening Helios / Kessler flyby (Wave A camera)

Player at `{0,0}`. 47-A scavengers and the official tug are parked far (`liveColdStartSafe`).
What is actually on the first picture:

| Slot | Live file | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| Player Hitch | `wholeships/kestrel.glb` (`SF_K0_KESTREL_BORROWED_TIME_V4`) | yes / yes (allowlist + required) | accepted (owner) | V2–V9 / M5 extras — freeze only | **KEEP** |
| Reverse / brake jets | code VFX (`PLAYER_RETRO_VOLUME` + leftover `_emitReverseNozzleTrail`) | n/a | wrong-game (owner: two needles) | none — do not add a second trail | **IMPROVE-IN-PLACE** → `PQ-193.02` |
| 47-A evidence spindle | code-built, no file (`scenarioProps47a.js`) | n/a | tube | no shelf body | **COMMISSION-LAST** after Wave A; model-first → `PQ-193.04` |
| 47-A civilian rescue pod | code-built, no file | n/a | tube | `pods/pod_cargo_container.glb` is a different job | **COMMISSION-LAST** → `PQ-193.04` |
| Kessler handoff beacon | code-built, no file | n/a | tube | `place_lane_beacon.glb` is the tutorial mark, not this | **COMMISSION-LAST** → `PQ-193.04` |
| Bourse carrier wreck | code-built, no file | n/a | tube | wreck-aftermath pack (skipped on Helios) | **IMPROVE-IN-PLACE** / same-slot model → `PQ-193.04` |
| Generic TOW / payload can | code-built, no file (`visualFactory` payload) | n/a | tube | `pod_cargo_container.glb` | Point A at B after upgrade → `PQ-193.04` |
| Tutorial lane beacon | `places/place_lane_beacon.glb` | yes / yes | unproven (likely tube-plus-ring) | everyday kit law props | **IMPROVE-IN-PLACE** → `PQ-193.03` |
| Helios lane pin | `places/place_lane_pin.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** → `PQ-193.11` |
| Helios tally post | `places/place_tally_post.glb` | yes / yes | unproven (cube foot risk) | — | **IMPROVE-IN-PLACE** → `PQ-193.11` |
| Helios claim mark | `places/place_claim_mark.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** → `PQ-193.11` |
| Helios cold locker | `places/place_cold_locker.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** → `PQ-193.11` (named with the lane set) |
| Common rocks on the starter field | code-built asteroid | n/a | tube / lumpy | `place_asteroid_rock_*` (rarer) | **IMPROVE-IN-PLACE** later; not Wave A |
| Helios trade hub (far, 1280 WU) | `places/place_station_trade_hub.glb` | yes / yes | unproven | foundry faction overlays | **IMPROVE-IN-PLACE** → `PQ-193.12` if fallback; overlays `PQ-193.09` |
| Station fallback if the hub misses | code-built fat cylinder + hoops | n/a | tube | authored station GLBs | **ENCLOSE** never show → `PQ-193.12` |
| Ambient courier / miner / hauler | Lark / Cradle / Span (below) | yes / yes | unproven candidate | factory `helios_*_production_v1` — do not remap | **IMPROVE-IN-PLACE** → `PQ-193.01` then `PQ-050.16`–`.18` |
| Ambient smuggler (`ship_drifter`, no traffic map) | modular kit, no whole-ship | parts yes / whole-ship no | falls-apart | `drifter_production_v1` (unpackaged-live) | **ENCLOSE** → `PQ-193.00` / `.01` |
| Ambient pirate (`ship_hornet`, no traffic map) | modular kit, no whole-ship | parts yes / whole-ship no | falls-apart | live Hornet candidate | **ENCLOSE** → `PQ-193.00` / `.01` |
| Patrol / escort | `wholeships/wasp_production_v1.glb` (required) | yes / yes | accepted file; kits unread | foundry Wasp militia / escort / patrol | **KEEP** body; kits `PQ-193.09` |

§13D missed these opening-table facts: the official 47-A tug and the scavenger wing are
**not** on the first picture (parked ~1.7–2.1 km). The first lockable junk is modular
smuggler / pirate traffic, not the Rig. The 47-A props on camera are still cylinders.

---

## 2. 47-A cast when it arrives (same default route, later beats)

| Slot | Live file | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| Scavenger interceptor / harasser / thief | `wholeships/ashline_rig.glb` via `assetRef` `enemy_reaver_*` | yes / yes | candidate (one silhouette for three jobs) | foundry Corsair Blade, Reaver Hook; factory `ashline_rig_production_v1` | **IMPROVE-IN-PLACE** identity split → `PQ-193.06` / `PQ-050.15` |
| Official recovery tug | **no whole-ship.** `ship_mule` + dead `assetRef` `asset.slice.meridian_recovery_tug`. Live path skips `buildConcordPatrol` | mule factory packaged, **not** allowlisted; tug body unused here | falls-apart (modular mule) | `yard_tug.glb` (already live occupational); Concord shipKit (dead) | **ENCLOSE** with a packaged tug/complete mule → `PQ-193.01` |
| Kessler (comms) | no 3D body | n/a | n/a | — | not a model slot |

---

## 3. Buyable / flyable roster (`ships.js`)

`WHOLE_SHIP_FILE_BY_DEF_ID` names a file for all 13. `requiresProductionWholeShip` is
**only** player Hitch and any Wasp. `PACKAGED_LIVE` includes Hitch + Wasp only among
player hulls.

| Slot | Live file (map) | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| Hitch / Kestrel | `kestrel.glb` | yes / yes | accepted | freeze extras | **KEEP** |
| Wasp | `wasp_production_v1.glb` | yes / yes | accepted (`parts_manifest`) | blocked `wasp.glb`; factory clone | **KEEP** body; residual stills `PQ-050.12` if Hitch still wins |
| Pelican | `pelican_production_v1.glb` | yes / **no** allowlist; **not required** | invisible or modular | blocked `pelican.glb`; factory clone RETIRE | **ADMIT** → `PQ-193.00`; quality `PQ-050.10` |
| Mule | `mule_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory clone RETIRE | **ADMIT** → `PQ-193.00`; quality `PQ-050.11` |
| Drifter | `drifter_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree is this identity | **ADMIT** → `PQ-193.00`; remaster `PQ-050.02` |
| Hornet | `hornet_production_v1.glb` | yes / **no**; **not required** | invisible or modular; wired candidate is not the live player path | factory tree | **ADMIT** → `PQ-193.00`; form `PQ-050.01` (do not duplicate) |
| Ironback | `ironback_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.04` |
| Bastion | `bastion_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.05` |
| Atlas | `atlas_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.06` |
| Ranger | `ranger_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.03` |
| Warden | `warden_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.07` |
| Colossus | `colossus_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.08` |
| Leviathan | `leviathan_production_v1.glb` | yes / **no**; **not required** | invisible or modular | factory tree | **ADMIT** → `PQ-193.00`; `PQ-050.09` |
| Modular kit hulls (10) | `hulls/hull_*.glb` | yes / kit path | falls-apart as a live ship | — | **RETIRE** as a published ship. Keep as library fallback only until `PQ-193.00` ends the substitute |

Archaeology: `needed-assets.md` still marks Hitch / Pelican / Wasp **blocked**. Live: Hitch
and Wasp production are up; only legacy `pelican.glb` / `wasp.glb` stay blocked.

---

## 4. Hostile / traffic / occupational ships

| Slot | Live file | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| Ashline Dart (`wasp_swarmer`, `choir_zealot`) | `ashline_dart.glb` | yes / yes | candidate | v2 Dart; factory `ashline_dart_production_v1` | **IMPROVE-IN-PLACE** live; remaster `PQ-050.13`; factory **REMAP-AFTER-PROOF** |
| Ashline Lode (bruiser / PD / field anchor) | `ashline_lode.glb` | yes / yes | candidate | v2 Lode; factory remaster | **IMPROVE-IN-PLACE** → `PQ-050.14`; factory **REMAP-AFTER-PROOF** |
| Ashline Rig (reaver, jackal, corsair, tether) | `ashline_rig.glb` | yes / yes | candidate; Corsair shares it | Corsair Blade FIELD; Reaver Hook VARIANT; factory remaster | **IMPROVE-IN-PLACE**; Corsair **REPURPOSE** → `PQ-193.06` |
| Lancer / ghost | Wasp production | yes / yes | accepted | Wasp kits | **KEEP** |
| Mule trader hostile | Helios Span | yes / yes | candidate | Span kits | **KEEP** body |
| Helios Lark (`courier`) | `helios_lark.glb` | yes / yes | candidate | factory Lark remaster | **IMPROVE-IN-PLACE** → `PQ-050.16`; factory **REMAP-AFTER-PROOF** |
| Helios Cradle (`miner`) | `helios_cradle.glb` | yes / yes | candidate | factory Cradle | **IMPROVE-IN-PLACE** → `PQ-050.17`; factory **REMAP-AFTER-PROOF** |
| Helios Span (`hauler`) | `helios_span.glb` | yes / yes | candidate | DMC / MTS / Reach kits | **IMPROVE-IN-PLACE** → `PQ-050.18`; kits `PQ-193.09` |
| Ore barge | `ore_barge.glb` | yes / yes | candidate | factory remaster; incubator donor; `ore_barge_b` | **IMPROVE-IN-PLACE** → `PQ-050.19` |
| Repair tender | `repair_tender.glb` | yes / yes | candidate | factory remaster | **IMPROVE-IN-PLACE** → `PQ-050.20` |
| Salvage cutter | `salvage_cutter.glb` | yes / yes | candidate | factory remaster; `salvage_cutter_damaged` | **IMPROVE-IN-PLACE** → `PQ-050.21` |
| Survey pin | `survey_pin.glb` | yes / yes | candidate | factory remaster | **IMPROVE-IN-PLACE** → `PQ-050.22` |
| Rescue lifter | `rescue_lifter.glb` | yes / yes | candidate | incubator donor | **IMPROVE-IN-PLACE** (no extra PQ; stay on `rescue`) |
| Prospector skiff | `prospector_skiff.glb` | yes / yes | candidate | incubator donor | **IMPROVE-IN-PLACE** |
| Scrap sweeper | `scrap_sweeper.glb` | yes / yes | candidate | incubator donor | **IMPROVE-IN-PLACE** |
| Apron shuttle | `apron_shuttle.glb` | yes / yes | candidate | not the liner | **IMPROVE-IN-PLACE** |
| Yard tug | `yard_tug.glb` | yes / yes; **`TRAFFIC_ROLES.tug` is live** | candidate (2026-08-18 stills called it a missing-hull kit; NOW work enclosed the working tug) | incubator donor | **IMPROVE-IN-PLACE** (not FIELD). Hull-triage “held” is stale |
| Express liner | `massline_express_liner_v1.glb` | yes in release / **not** `PACKAGED_LIVE` | invisible risk on `express` | stopped-Lark donor RESERVED | **ADMIT** → `PQ-193.00`; G7 `PQ-049.05` (do not duplicate) |
| Volatiles tanker | `volatiles_tanker.glb` | yes / **not** allowlist; **no** `TRAFFIC_ROLES.tanker` | falls-apart (held 8257fd9e) | incubator donor; `volatiles_tanker_b` | **ENCLOSE** then spawn → `PQ-193.08` |
| Inspection cutter | `inspection_cutter.glb` | yes / **not** allowlist; **no** `TRAFFIC_ROLES.customs` | falls-apart (held) | incubator `customs_cutter` donor | **ENCLOSE** then ambient `customs` only → `PQ-193.08`. Enemy `customs_cutter` stays Hornet |
| Helios Arclight | unused `m4_hero_hauler/.../helios_arclight.glb` | no / no | unused | unique heavy | **REPURPOSE** → `PQ-193.07`. Do not steal Span or Atlas |
| Construction rig | incubator only | no | unused / box-tube | no live sibling | **COMMISSION-LAST** after Waves A–B (enclose donor, then a job). No new leaf now |
| Ore barge B / tanker B | incubator only | no | unused | second silhouettes | **REPURPOSE** after the live barge/tanker close. Not variety-first |

---

## 5. Places, stations, kit, wrecks

### 5a. Helios / default-route places

| Slot | Live file | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| Helios trade hub | `place_station_trade_hub.glb` | yes / yes | unproven | 3 foundry overlays | **IMPROVE-IN-PLACE**; overlays `PQ-193.09` |
| Coalition military dock | `place_station_military.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** → `PQ-193.12` |
| Memorial array | `place_memorial_array.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** |
| Helios yard debris | `place_debris_chunk.glb` | yes / yes | unproven | dock/hulk remaster | **IMPROVE-IN-PLACE** → `PQ-193.10` |
| Helios ash pin / whistle | `place_ash_pin.glb` / `place_whistle.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** → `PQ-193.11` |
| Jump gates (Helios rim) | `place_gate_jump_ring.glb` on `type:'station'` + `archetypeGlb` | yes / yes | unproven. Census A “no file” is **false** | `visualFactory.buildGate` leftover hoop | **IMPROVE-IN-PLACE** → `PQ-193.05`. Fallback hoop **RETIRE** once the GLB holds |
| Everyday kit on Helios (core, ≤4) | 46 legal place GLBs; `UNUSED` list is empty | yes / yes | unproven | — | **IMPROVE-IN-PLACE** if tube; fielding `PQ-136.01` already routed |
| Wreck-aftermath pack | 44 release places | yes / yes | not on Helios (`SKIP_SECTORS`) | — | **KEEP** routing. Quality in other sectors is `PQ-136.00` leftover, not Wave A |

### 5b. Other live place / station selectors (`PLACE_FILES` + dressing maps)

| Slot | Live file | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| Nav buoy | `place_nav_buoy.glb` | yes / yes | unproven / tube-plus-ring | — | **IMPROVE-IN-PLACE** → `PQ-193.03` |
| Cargo pod (authored) | `pods/pod_cargo_container.glb` | yes / yes | unproven / tube | kit cargo pods | **IMPROVE-IN-PLACE** → `PQ-193.03` |
| Conveyor barge | `place_conveyor_barge.glb` | yes / yes | unproven | — | **IMPROVE-IN-PLACE** |
| Mining-drone **place** | `place_mining_drone.glb` | yes / yes | unproven | entity drone is a different slot | **IMPROVE-IN-PLACE**; then point the entity at it (`PQ-193.05`) |
| Dead hulk | `place_dead_hulk.glb` | yes / yes | unproven | dock/hulk remaster | **IMPROVE-IN-PLACE** → `PQ-193.10` |
| Ceres bait wreck / grave shard | dedicated place GLBs | yes / yes | unproven | aftermath pack | **IMPROVE-IN-PLACE** |
| Billboard / seamed rock / graffiti / rock a–c | place GLBs | yes / yes | unproven | code rocks | **IMPROVE-IN-PLACE** |
| Claim outpost base / refinery / relay / bastion | place GLBs | yes / yes | unproven | — | **IMPROVE-IN-PLACE** |
| Wreck Cathedral | `place_landmark_wreck_cathedral.glb` | yes / yes | unproven | PQ-018 route | **IMPROVE-IN-PLACE** (presentation, not a new hull) |
| Other station archetypes (refinery, blackmarket, fab, mining, research) | `place_station_*.glb` | yes / yes | unproven | fallback cylinder | **IMPROVE-IN-PLACE** → `PQ-193.12` |
| Opening dock remaster | live dock/hulk/debris files | yes / yes | remaster stuck at live presentation | military/grit dock never in that slice | **IMPROVE-IN-PLACE** → `PQ-193.10` |

---

## 6. Code-built world objects (census A, re-proved)

| Slot | Live file | Packaged / allowed | Chase vs Hitch | Shelf cousins | Verdict |
|---|---|---|---|---|---|
| 47-A spindle / rescue pod / Kessler beacon / Bourse wreck / TOW can | code-built, no file | n/a | tube | see §1 | **COMMISSION-LAST** / same-slot → `PQ-193.04` |
| Ore / loot gems | code-built diamond | n/a | tube | freight cans reuse payload | leave unless a later campaign |
| Credit chips | code-built hex | n/a | tube | — | leave (small pickup) |
| Common asteroids | code-built | n/a | tube | named rock GLBs | **IMPROVE-IN-PLACE** later; upgrade B then point A |
| Station fallback | code-built | n/a | tube | authored stations | **RETIRE** from default route → `PQ-193.12` |
| Jump-gate **fallback hoop** | code-built (`buildGate`) | n/a | tube | **live gate is a GLB** | **RETIRE** after `PQ-193.05` stills pass |
| Mining-drone **entity** | code-built diamond + arms | n/a | tube | `place_mining_drone.glb` | **REPURPOSE** the place file → `PQ-193.05` |
| Onboarding trainer / gunnery buoy | `type:'drone'` (code-built) | n/a | tube | same | **IMPROVE-IN-PLACE** → `PQ-193.05` if it is on the player route |
| Generic wreck | code-built tube spine | n/a | tube | aftermath pack | **REPURPOSE** pack pieces → `PQ-193.05` / `PQ-136.00` |
| Disc mine | code-built puck | n/a | tube | — | **COMMISSION-LAST** → `PQ-193.05` |
| Vector mine / impulse charge | code-built | n/a | tube | — | **COMMISSION-LAST** with mines if they show on the default route |
| Mass seed | code-built | n/a | tube | — | **COMMISSION-LAST** → `PQ-193.05` |
| Massline snare ends | code-built | n/a | tube | — | **COMMISSION-LAST** → `PQ-193.05` |
| Flyable planet site | shader ball | n/a | other language | — | keep shader; not a GLB commission |
| Distant suns | shader ball | n/a | — | — | keep |
| Distant painted planets | `assets/background/quiet-planets.png` + ring plate | **not retail-routable** | invisible / sprite fallback in Electron/web package | — | **ADMIT** the two plates into the bundle. Not Wave A. No new PQ |

Census C (effects, HUD, Asteroid Works interiors, nav beads) stays off this list.

---

## 7. Unused authored bodies (shelf)

Not slots. Verdict so nobody wires the wrong file.

| Body | File / tree | Packaged / allowed | Why it is shelf | Verdict |
|---|---|---|---|---|
| Legacy Pelican / Wasp wholeships | `wholeships/pelican.glb`, `wasp.glb` | no; `status: blocked` | accessory-only, no `Material_Hull` | **RETIRE** |
| Factory Pelican / Mule / Wasp clones | `fleet_player_bodies_v1/{pelican,mule,wasp}/` | no | hash ≠ dedicated live package; Wasp clone once dropped hull <800 | **RETIRE** |
| Factory Ashline / Helios / work-fleet `*_production_v1` | on disk in parts (and some release folders); **not** live selectors | not the live allowlist | earlier remap made traffic invisible | **REMAP-AFTER-PROOF** → matching `PQ-050.13`–`.22` |
| Ashline v2 Dart / Lode / Rig | `m4_ashline_v2/source` | no | remaster candidates | **REMAP-AFTER-PROOF** with `PQ-050.13`–`.15` |
| Hitch V2 / V3 / V4 extras / M5 / DIE LAUGHING | kestrel trees | freeze | not replacements | **RETIRE** as live options (freeze / donor only) |
| Foundry Corsair Blade | `var_ashline_rig_corsair_blade_v01.glb` | no | unused kit | **REPURPOSE** → `PQ-193.06` |
| Foundry Reaver Hook | `var_ashline_rig_reaver_hook_v01.glb` | no | unused kit | **REPURPOSE** → `PQ-193.06` / `PQ-050.15` |
| Foundry Span DMC / MTS / Reach | three `var_helios_span_*` | no | unused kits | **REPURPOSE** → `PQ-193.09` |
| Foundry Wasp militia / escort / patrol | three `var_wasp_*` | no | unused kits | **REPURPOSE** → `PQ-193.09` |
| Foundry trade-hub overlays (Free / MTS / SCN) | three `var_station_trade_hub_*` | no | unused | **REPURPOSE** → `PQ-193.09` |
| Foundry weapon skins | three pulse-cannon variants | no | garnish | later; not this board |
| Helios Arclight | `m4_hero_hauler` | no | unused | **REPURPOSE** → `PQ-193.07` |
| Massline liner source / release_candidates | liner tree | release row exists; not allowlisted | express mapped, not admitted | **ADMIT** → `PQ-193.00`; accept `PQ-049.05` |
| Stopped-Lark donor | liner reference | no | never-runtime | **RETIRE** as a live Lark |
| Incubator NPC donors (11 live siblings) | `npc_activity_pack/source/*.glb` | no | hash ≠ live re-authors | **RETIRE** (do not copy) |
| Incubator construction rig / barge B / tanker B / damaged cutter | same pack | no | no live sibling or wreck variant | **REPURPOSE** after enclose / after live close |
| shipKit heroes (Concord, Reaver, Meridian, Drift barge, Quiet raider, Vael) | `src/render/ships/*.js` | n/a | **dead on live play** (`directAuthoredMount` skips them) | **RETIRE**. Do not treat as the opening NPC |
| `fin_crystalline.glb` source route | release part | allowlisted source exception | cannot package until rename | **IMPROVE-IN-PLACE** when a fin leaf exists; not Wave A |

---

## 8. Modular kit parts (not missing ships)

These are real files. They must not stand in for a complete hull.

| Slot family | Files | Packaged | Verdict |
|---|---|---|---|
| Cockpits (3) | `cockpit_dome/slab/recessed.glb` | yes | KEEP as kit; never a ship |
| Engines (6) | ion / vector / industrial / resonator / plasma | yes | KEEP as kit |
| Fins (6) | wedge / radiator / smuggler / crystalline / delta / stabilator | yes (crystalline source-route exception) | KEEP as kit |
| Weapons (6) | pulse / heavy / turret / lance / gatling / rail | yes | KEEP as kit |
| Greebles (7) | vents / hatches / pipes / rcs / antennas / nav / armor | yes | KEEP as kit |
| Gear (2) | skid trio / quad | yes | KEEP as kit |
| Utility / repair pods | `pod_utility.glb`, `pod_repair_patch.glb` | yes | KEEP as kit |
| Hitch LOD1/2, roster LOD1/2 | separate files | Hitch yes; others later | **later performance**, not this broken-picture list |

---

## 9. Counts (slots + shelf, not files)

| Bucket | Rows | Notes |
|---|---:|---|
| Opening-flyby slots (§1) | 19 | Wave A camera |
| 47-A later-cast slots (§2) | 3 | same route, later beats |
| Buyable roster + modular substitute (§3) | 14 | 13 ships + kit-as-ship |
| Hostile / traffic / occupational / held (§4) | 24 | includes Arclight + construction + B variants |
| Places / stations / kit / wrecks (§5) | 22 | plus everyday/aftermath as packs |
| Code-built census A (§6) | 16 | gates re-proved: live file exists |
| Unused authored / dead heroes (§7) | 22 | one verdict each |
| Kit part families (§8) | 8 families | not extra ships |

Every row has one verdict. Chase stills this session were unavailable: tube / owner /
allowlist rows are proven; “candidate vs Hitch-plus” rows stay `unproven` until
`play_chase` stills exist.

---

## 10. Archaeology, re-proved

| Dated claim | Live truth 2026-09-09 |
|---|---|
| `needed-assets.md`: Hitch / Pelican / Wasp blocked | Hitch live + frozen. Wasp production `accepted`. Legacy `pelican.glb` / `wasp.glb` blocked. Production Pelican is a candidate, not blocked |
| Catalog 2026-08-08: treat as inventory | Archaeology only |
| Hull triage 2026-08-24: tug / tanker / cutter held | Tanker and cutter still held. **Yard tug is live** (`TRAFFIC_ROLES.tug` + allowlist) |
| Census A: gates have no model file | **False.** Gates spawn as stations with `place_gate_jump_ring.glb` |
| PQ-136 “80 unused incubator models” | Everyday unused list is empty. Wreck pack is routed, skipped on Helios. Occupational six are live except tanker/cutter |
| “Factory player hulls now load” (§13D) | Files and packages exist. Player path does **not** require them. Modular or blank until `PQ-193.00` |
