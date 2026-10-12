# Asset Experience Program — agentic pipeline spec

*How SpaceFace turns the assets it already owns, the assets it is missing, and the placements that carry them into a deeper, less repetitive player experience — and the agentic pipeline that produces, admits, wires and gates that work.*

Baseline: `coldshalamov/SpaceFace` @ `master` (`9d86b046bc42`, 2026-10-11). This spec supersedes no prior document; it consolidates `design/world-identity/WORLD_PLACEMENT_AUDIT.md` (the placement audit carried into this program), `needed-assets.md`, `assets/QUEUE.md`, `design/ASSET_REPURPOSE_POOL.md`, `design/program/world-depth-2026-10-02/ASSET_FAMILIES.md`, and `docs/visual-assets/*` into one executable program.

Every claim in §1–§3 cites an artifact another agent can re-check. Where this spec proposes names not yet in canon, the item is marked **[proposal]**.

**Queue-ingestion rule (applies to every §3 item):** each item carries `{source file, item id, manifest row, on-disk path, lifecycle status}` verified by a named command at spec time — not copied from prose. Recheck the tuple when its source or the candidate changes (§6). Two source docs are inventories of *coverage*, not missing-file ledgers, and are labeled as such below.

---

## 1. What we have, and how it is used today

### 1.1 Authored asset stock (verified counts @ `9d86b046bc42`)

| Layer | Stock | Authority / registry |
|---|---|---|
| Ship parts | 325 GLBs under `assets/ships/parts/` (incl. `parts/places/`); 194 entries in `parts_manifest.json` — every entry has a GLB on disk. Status split: 179 default, 12 `integration_candidate`, 2 `blocked`, 1 `accepted` | `parts_manifest.json` → `src/render/partsLibrary.js` |
| Release wholeships | `assets/ships/release/render-packages/<family>/render-package.json` entries; families incl. aftermath debris kits, works-*, yard-tug, wreck-cathedral | `src/render/renderPackageManifest.js` — **generated** registration table, 3,519 lines / ~351 pilots ("Do not edit by hand") |
| Forge fleet registry | `tools/blender/forge/fleet.json` (~116 entries: ~70 place-layout, ~31 NPC-layout, ~15 player-layout per ASSET_FAMILIES §2). `assets/ships/fleet_player_bodies_v1/` is a **source directory**, not a fleet.json key | `tools/blender/forge/publish.mjs` |
| Places | `assets/ships/parts/places/` = 85 GLBs; 96 `place_*` manifest entries. `assets/ASSET_STATUS.json` tracks 23 place assets (20 `place_*` ids + 3 dock interiors), **all `VISIBLE_IN_PLAY`**. `assets/places/` is a 9-file `lane_furniture/` docs/evidence stub, not the place stock | `ASSET_STATUS.json`, `partsLibrary.js PLACE_FILES` |
| Admission debt | 12 `integration_candidate` `*_production_v1` wholeships (atlas, bastion, colossus, hornet, ironback, leviathan, saucer, massline_express_liner, mule, pelican, ranger, warden); 2 `blocked` rows (`wholeship_pelican`, `wholeship_wasp` — superseded by their `production_v1` replacements); `wholeship_wasp_production_v1` = `accepted`, `wiringStatus: live_player_wasp` | `parts_manifest.json` status fields, `check:asset-status` |
| Unshipped authored GLBs | Only two pool items still exist on disk: `assets/ships/m5_kestrel_upgrade/` (.blend source dir, 69 MB, owner-supplied) and `assets/incubator/npc_activity_pack/evidence/role-identification-sheet.png`. `m4_ashline_v2`, `kestrel_borrowed_time_v2/_v3`, `m4_hero_hauler` were deleted 2026-09-08 (never-wired cleanup; recoverable from git history) | `design/ASSET_REPURPOSE_POOL.md` |
| Procedural life | `src/render/faunaVisuals.js` (rays, cysts, leeches, worms, beasts, kites, eels + growth morphologies — Wake Eel, Glassback, Furnace Maw, Cold Bell already built procedurally); `src/render/machineVisuals.js` (Prism, Custodian, Auditor + site props) | `src/data/precursorMachines.js`, `src/data/alienEcology.js` |
| Capital hulls / bosses | `ship_warden → ship_colossus → ship_leviathan` (`src/data/shipRoleLattice.js`); `dreadnought_boss` "Iron Maw" (`src/data/enemies.js:217`, Vael, Ashfall); `ship_saucer` tier-5 exotic (`src/data/ships.js:401`, swarmEarned) | `src/data/ships.js`, `src/data/enemies.js` |
| NPC/enemy roster | ~79 enemy defs in `enemies.js` (zero `npc_*` ids — there is no canonical NPC-def seam yet); `occupationalTrafficCraft.js` occupational hulls (inspection_cutter, volatiles_tanker, apron_shuttle, yard_tug, prospector_skiff, scrap_sweeper, rescue_lifter…); `namedAces.js` = 16 aces; `laneContacts.js` = 27 contacts (10 courier); `traffic.js` 8 roles | `src/data/occupationalTrafficCraft.js`, `namedAces.js`, `laneContacts.js` |
| Forge pipeline | `tools/blender/forge/` — `forge.py`, `forge_export.py`, `forge_textures.py`, `fleet.json`, `ships/*.py` per-hull scripts, `briefs/{ships,places,landmarks,trade_hub}.md`, domain kits (`claim_outpost_kit.py`, `dock_interior_kit.py`, `quiessence_freighter_kit.py`, `hub_overlay_kit.py`, `mcp_design_kit.py`, `brood_*`, `ceres_second_measure_kit.py`) | `tools/blender/forge/FORGE.md` |

**`needed-assets.md` is a coverage inventory, not a missing-GLB ledger** ("ACTIVE COVERAGE INVENTORY"; T1/T2 = screenshot counts). Its §A 63 manifest ids all have GLBs; the real backlog it records is finish/screenshot-tier work (ids without a `FULL FINISH` note: ~19 of 20 places, ~29 of 43 non-place parts). `assets/QUEUE.md` lists 36 rows, of which 3 (kestrel/pelican/wasp "blocked — hull body missing") are **stale** — `wholeship_kestrel` is rebuilt, unblocked and live (39,518 tris, LOD family, 9 sockets); the manifest-blocked pelican/wasp rows are superseded by `production_v1` replacements. Per `assets/AGENTS.md`: *never infer validity from … an old queue sentence.*

### 1.2 How assets reach the player (the placement stack)

The audit enumerated **12 layers**: (1) galaxy graph `sectors.js` → (2) way-of-life `sectorWayOfLife.js` → (3) composition `sectorCompositions.js` → (4) semantic zones `sectorZones.js`/`frontierRegions/*` → (5) activity pockets `sectorActivityPockets.js` → (6) traffic & jobs `traffic.js`/`npcJobs*.js`/`laneContacts.js` → (7) encounters `data/encounters/*`/`encounterDirector`/`livedWorldDirector` → (8) authored places `authoredPlaces.js`/`alienEcology.js`/`precursorMachines.js` → (9) one-offs `worldOneOffs.js` → (10) wrecks `uniqueWrecks.js`/`wreckAftermathDressing.js` → (11) characters & machines (`vesper.js`, `morrow.js`, `namedAces.js`, capital bosses…) → (12) set pieces & bosses (`heistFacilities.js`, `ilexArk.js`, `capital-boss/*`). The runtime seams are:

- **Encounter/content data**: `src/data/encounters/**` (incl. `capital-boss/` subdir, `index.generated.js` — **generated** by `build-encounter-index.mjs`), `src/data/missions.js`, `src/data/enemies.js`, `src/data/combatDefs.js`, `src/data/commodities.js`, `src/data/commodityFlavor.js`, `src/data/conflictReactions.js`, `src/data/barks.js` (faction×situation deterministic radio corpus — the hook for zone/actor chatter)
- **Sector personality**: `src/data/sectors.js`, `src/data/sectorWayOfLife.js`, `src/data/sectorCompositions.js`, `src/data/sectorZones.js`
- **Ambient/lived runtime**: PR #264's branch `devin/1791689614-world-placement-program` adds `src/data/livedSectorOverlays.js` + 16 `scene-*` encounters (569–584) + ~190 regenerated `lived-*` vignette files + edits to `src/systems/livedWorldDirector.js`, `src/systems/vignetteInterpreter.js`, `scripts/build-lived-vignettes.mjs`, `index.html` modulepreload registry (ported forward as chunk **F1** — note: `ambientScenes.js`, `livedWorldRuntime.js`, `ambientSceneDirector.js` do **not** exist on that branch; a world-vs-world scene director remains audit BP-4 scope, see §3.8); existing ambient machinery in `src/data/environmentalMachinery.js` + `src/systems/environmentalMachinery.js` (incl. `WEATHER_VOLUMES` — static frozen belts, not moving fronts)
- **Render wiring**: `src/render/renderPackageManifest.js` (generated), `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/data/modelTruthCensus.json` (generated), `src/data/collisionProxyManifests.js`, `index.html` modulepreload registry (generated marker-managed block, byte-compared by `sync-modulepreload.mjs --check`)
- **Audio**: `src/data/audioRecipes.js`, `src/audio/audioSystem.js`
- **UI presentation**: `src/ui/threatHalo.js`, cinematic/postFX presets
- **Law/crime semantics**: `src/systems/lawSecurity.js` (real jurisdiction, witness/chase/split behaviour — the behavior owner for customs/interceptor placements)

### 1.3 Acceptance gates that already exist

- **Art umbrella**: `npm run check:art` (~24 gates: `check:asset-pipeline-contract`, `check:graphics:asset-receipts`, `check:kestrel:wholeship` + kestrel test/checks ×4, `check-parts-manifest`, `check-sg04-release-assets`, `check-lod`, `check-collision-debug`, `check-concord-patrol`, `check-reaver-pirate`, `check-faction-ships`, `check:station-archetype-wiring`, `check:station-archetype-glb-load`, `check:authored-place-runtime`, `check:opening-place-remaster`, `check:shipworks:dock-composition`, `check:sector-arrival-admission`, `check:assets:live`, `check:visual-stability`, `check:47a:visuals`, `check:asset-classifications`)
- **Lifecycle/registry**: `check:asset-status` (blocked-manifest enforcement on `parts_manifest.json`), `check:asset-reachability`, `check:asset-startup-readiness`, `check:asset-runtime-disposal`, `check:content-census` (`report-content-census.mjs --check --summary`), `report-asset-status.mjs`
- **Freshness of generated files**: `build:encounter-index` + `sync-modulepreload.mjs --check` (byte-compared; `.gitattributes` pins `eol=lf` because CRLF checkout on Windows fails the byte comparison — workers must not introduce CRLF into generated files), `build:render-package-pilots` checks (`-pilots`, `-coverage`, `-plan`)
- **Perf**: `npm run perf:gltf` (`audit-gltf-assets.mjs` — a *report* flagging >30k single-LOD files, not a pass/fail budget gate), `node --test test/*.test.mjs`, `check:contracts`, `scripts/sf.mjs validate`
- **Look gate**: `node scripts/fleet-look.mjs --file=… --views=inspect,close,top` before wiring a body (`assets/ships/AGENTS.md`: "do not wire a body that has not been looked at in fleet-look at chase/close zoom")
- **Measurement harness**: `scripts/lib/bench/scenarios/world.sector_identity.mjs` (seed 4242, 144 WU camera-ring census — the vehicle for §7 scorecard/identity axes)

`assets/AGENTS.md` is the authority: the manifest decides acceptance; never infer validity from filename/family/size/an old queue sentence; never hand-edit generated release metadata.

**Triangle-budget authorities (reconciled — do not mix):** (a) `parts_manifest.json.budgets` = the structural fence: `trianglesPerPart [500,32000]`, `trianglesPerLandmark [500,1100000]`, byte/texture caps — enforced by `check-parts-manifest`; (b) Forge brief budgets = per-class authoring targets: ships LOD0 10k–45k, places 30k–70k, trade_hub 50k–90k; (c) `assets/QUEUE.md` numbers (part ≤15k, wholeship ≤20k with ≥800 hull-body tris floor, prop ≤3k, landmark ≤10k) apply **only to QUEUE rows** and QUEUE itself defers to "the live manifest/exporter contract". Rule: author to the Forge brief for the class; the manifest `budgets` field is the hard fence; reviewers enforce (a)+(b), not (c) for non-QUEUE work.

### 1.4 Registries: hand-edited vs generated (merge-law table)

| Hand-edited (agents may touch) | Generated (never hand-edit; regenerate after merge) |
|---|---|
| `assets/ships/parts/parts_manifest.json` (incl. `status`/`statusNote`), `tools/blender/forge/fleet.json`, `assets/ASSET_STATUS.json`, `src/data/enemies.js`, `src/data/combatDefs.js`, `src/data/encounters/*.js` (per-encounter files), `laneContacts.js`, `sectorActivityPockets.js`, `livedSectorOverlays.js`, `occupationalTrafficCraft.js`, `environmentalMachinery.js`, `barks.js`, `package.json` | `src/render/renderPackageManifest.js`, `src/data/modelTruthCensus.json`, `src/data/encounters/index.generated.js`, `index.html` modulepreload block, `assets/ships/release/release_manifest.json`, `render-packages/*/render-package.json` rows |

Admit path = the generator chain from `assets/ships/AGENTS.md`: `check-parts-manifest.mjs --sync` → `build-sg04-release-assets.mjs --no-clean --only <id>` → `refresh-render-package-pilots.mjs --only=<key>` + `build-render-package-pilots.mjs --only=<key>` → `model-truth-census.mjs` + `splice-census-rows.mjs --match=/<file>.glb` → `check:render-package-pilots` / `-coverage` / `-plan`. (`tools/blender/forge/publish.mjs` wraps the same chain for forge ships.)

---

## 2. Where the experience is thin (weak asset classes)

From the audit's sector scorecard (core ~6.6, rim ~3.8) and family coverage — restated against verified repo state:

1. **Camera-scale staging** — weakest measured axis: `Cam ≤4` in Helios, Veil, Pallas, Io and every rim sector (scorecard column `Cam`; only Ceres has authored activity pockets at real scale). The gap is *actors inside the 144 WU arrival frame* (audit BP-5, AD.1), not far-z scenery.
2. **Templated vignettes** — 176 of 281 encounters are generated `lived-*` vignettes; `situation: toll` alone is 179/281; played by 3 archetypes through the same verbs. (The F1 merge de-templates situations; the overlay tables stay per-sector work.)
3. **Zone-type-not-sector gating** — `livedWorldDirector` fires by zone type; ~15 encounters are sector-gated; a `trade_lane` in Dione reads like one in Tethys. Root cause of "same everywhere".
4. **Rim sectors lack pockets/toys/chains/characters** — 15 sectors have no signature toy ("explicitly none"), every rim sector has exactly 1 static one-off, no rim sector has a discovery chain, and rim lane contacts aren't full characters (audit BP-7/BP-8).
5. **Institution frontage** — stations lack authored customs/salvage/relief/repair/black-market fronts (ASSET_FAMILIES §D); these are **assets to commission**, not just placements.
6. **Finish tier, not missing files** — 19 of 20 place ids and ~29 of 43 non-place manifest ids lack `FULL FINISH`; places also lack the repaired/shut-down/damaged/occupied state variants ASSET_FAMILIES §D requires.
7. **Field silhouettes & wayfinding** — rim sectors especially; fields exist but don't form readable macroforms at camera scale.
8. **Battle readability** — dressing exists but lacks staged cover lines, wreck aftermath and escalation cues.
9. **Economy & crime made visible** — claims, smuggler lanes, custody/handover props under-placed; the audit's crime-signature row is empty for most sectors.
10. **Occupational hull gaps** — the real missing silhouettes are police interceptor, prison barge, worker shuttle, pilgrim hulk, capital silhouettes, ice-cutter, racer (audit §8); most work-traffic roles already exist in `occupationalTrafficCraft.js`.
11. **Admission debt** — 12 `integration_candidate` wholeships pending admission + 2 superseded `blocked` rows + stale QUEUE statuses; the "adopt, don't rebuild" lane is real and cheaper than new authoring.
12. **Duplicate templates inside the roster itself** — four fence sectors (Nyx/Eris/Eunomia/Kepler), three Vael-courier sectors (Orcus/Triton/Phoebe), two same-shift ore sectors (Rhea/Nereid), two surveyor sectors (Haumea/Proteus) need opposite verbs (audit §6 rim table).

*(Former items "popup/palace/fortress/hotel/motel/carnival/announcer/arena placeholders" and "20 missing place GLBs" were spec bugs: those placeholder names exist nowhere in `src/`, `assets/` or the audit — the audit has no 'placeholders cell' — and all 20 place ids are `VISIBLE_IN_PLAY`. The real placeholder-adjacent findings are the templated vignettes and the fence-sector duplication above; see §3.6.)*

---

## 3. What we must create or place — consolidated queue

Merges every open queue. Item IDs are stable handles for chunk prompts. **[P]** = proposal new to this spec. Every item lists its verification tuple `{source file → item id(s) → manifest row → on-disk path → status}`; chunks must re-run the listed check before claiming items.

### 3.1 Unshipped-but-authored (adopt, don't rebuild)

The repurpose pool was consolidated without path-checking; verified disk truth:

- **RP-1** — `assets/ships/m5_kestrel_upgrade/` (.blend source, owner-supplied): run the .blend→GLB pipeline (export via Forge or documented Blender path → fleet-look → admit chain) → candidate player upgrade tier or named NPC hull. Verify: `test -d assets/ships/m5_kestrel_upgrade`.
- **RP-2** — `assets/incubator/npc_activity_pack/evidence/role-identification-sheet.png` (exists): design input for §3.5 silhouette sheet; wire as the §3.5 reference attachment, not a render asset.
- **RP-3** — deleted pool dirs `m4_ashline_v2`, `kestrel_borrowed_time_v2`, `kestrel_borrowed_time_v3`, `m4_hero_hauler` (zero files under `assets/` on master and on this branch; deleted by the 2026-09-08 never-wired cleanup): **explicit restore-or-retire decision per dir**. If adopted: restore from git history, then fleet-look + admit chain + ≥1 consumer. If retired: record the owner-facing decision in the chunk report. Do not commission work assuming the files exist.
- **AD-1..12** — the 12 `integration_candidate` `*_production_v1` wholeships (atlas, bastion, colossus, hornet, ironback, leviathan, saucer, massline_express_liner, mule, pelican, ranger, warden): admission/promotion work — run the admit chain + wire confirmed consumers; each was already reviewed at preview tier. Verify: `node -e "…parts.filter(p=>p.status==='integration_candidate')"`. This lane *is* "adopt, don't rebuild".
- **Q1** — stale QUEUE rows resolved to residual work: admit `wholeship_pelican_production_v1` (currently `integration_candidate`, `wiringStatus: live_player_pelican`) and retire/repair the `blocked` `wholeship_pelican` + `wholeship_wasp` rows vs their `production_v1` replacements (`wholeship_wasp_production_v1` already `accepted`/`live_player_wasp`). `wholeship_kestrel` is **live** — no work. Verify: `npm run check:asset-status`.

### 3.2 Finish-tier queue from `needed-assets.md` §A + `assets/QUEUE.md`

All §A ids have GLBs on disk (verified: 194/194 manifest entries). The work is **finish-tier revamp + screenshot-tier closure + state variants** (per `VISUAL_ASSET_PRODUCTION_STANDARD` and ASSET_FAMILIES §D states: repaired, shut-down, damaged, occupied) — a surfacing/look pipeline (`fleet-look.mjs` inspect/close/top + admit chain), not Forge new-GLB commissions.

- **PL-1..20** — the 20 place ids, itemized (each = finish pass + needed-assets story-role note as the brief + ≥1 state variant where §D applies):
  - *stations (8)*: `place_station_trade_hub` (FULL FINISH reference — its "→ faction redesign" note feeds §3.6 PH-3), `place_station_refinery`, `place_station_military`, `place_station_blackmarket`, `place_station_mining`, `place_station_fab`, `place_station_research`, `place_station_billboard`
  - *fields/wrecks (7)*: `place_asteroid_seamed`, `place_asteroid_rock_a`, `place_asteroid_rock_b`, `place_asteroid_rock_c`, `place_asteroid_graffiti`, `place_dead_hulk`, `place_debris_chunk`
  - *props/machines (5)*: `place_lane_beacon`, `place_nav_buoy`, `place_conveyor_barge`, `place_mining_drone`, `place_gate_jump_ring`
  - Verify: each id's `ASSET_STATUS.json` row + `parts_manifest.json` entry exist (`lifecycle: VISIBLE_IN_PLAY` — these are revamps of live assets; coordinate visual churn).
- **PT-A** — 17 non-place finish-tier ids: `hull_starter`, `cockpit_recessed`, `engine_resonator`, `engine_vector`, `engine_plasma_ring`, `weapon_pulse_cannon`, `weapon_heavy_cannon`, `weapon_turret_dual`, `weapon_lance`, `weapon_gatling`, `weapon_railgun`, `fin_wedge`, `fin_radiator_grid`, `fin_swept_smuggler`, `fin_crystalline`, `fin_delta`, `fin_stabilator`.
- **PT-B** — 12 finish-tier ids: `greeble_vents`, `greeble_hatches`, `greeble_pipes`, `greeble_rcs`, `greeble_antennas`, `greeble_nav_lights`, `greeble_armor_plates`, `skid_trio`, `skid_quad`, `pod_utility`, `pod_cargo_container`, `pod_repair_patch`.
- **Q2** — 27 QUEUE rows (genuinely missing — no manifest entry): `claim_hopper`, `claim_battery_mast`, `claim_hangar_frame`, `claim_hab_ring`, `claim_sensor_dish`, `claim_depot_silo`, `claim_teleport_ring`; `hunter_sig_rail_01`..`hunter_sig_rail_12`; `module_vis_battery_S/M/L`, `module_vis_drill_head`, `module_vis_cargo_pod`, `module_vis_shield_emitter`, `module_vis_salvage_claw`, `module_vis_tow_winch`. QUEUE budgets apply to these rows only (prop ≤3k? — use each row's listed tri budget; module_vis rows are `wantsVisual` parts ≤1.2k).
- **Q3** — 6 QUEUE landmark rows with a canonical-id ruling (see ID map, chunk F3): `landmark_beacon_spire`, `landmark_veil_obelisk`, `landmark_pit_anchor`, `landmark_vault_maw`, `landmark_tower_crown` commission as `place_landmark_*` per manifest convention; **`landmark_wreck_cathedral` → retire** — already satisfied by shipped+wired `place_landmark_wreck_cathedral` (census/partsLibrary/worldSiteManifests bound). needed-assets `place_landmark_cathedral_wreck` names the same shipped asset — do not author a fourth spelling.

### 3.3 BP-08 world-identity assets (`needed-assets.md` §B — genuinely missing)

- **BP-8a** — 8 faction station overlays: `place_station_concord_hub`, `place_station_meridian_exchange`, `place_station_drift_refinery`, `place_station_reach_den`, `place_station_quiet_cache`, `place_station_choir_shrine`, `place_station_free_waystation`, `place_station_vael_spire`. (Existing `var_station_trade_hub_{scn,mts,free}_overlay_v01` variants are trade-hub overlays only — reuse technique, don't duplicate.)
- **BP-8b** — 5 landmarks under canonical `place_landmark_*` ids: `place_landmark_vault_maw`, `place_landmark_crystal_spire`, `place_landmark_pit_anchor`, `place_landmark_cathedral_wreck` → **renamed** `place_landmark_cathedral_wreck_ii` or folded into the shipped cathedral's state variants (F3 rules; do not collide with `place_landmark_wreck_cathedral`), `place_landmark_billboard_array`.
- **BP-8c** — 3 ring gates: `place_gate_concord`, `place_gate_merchant`, `place_gate_reach`.
- **BP-8d** — 5 wreck/beacon bodies: `place_wreck_freighter`, `place_wreck_patrol`, `place_wreck_miner`, `place_wreck_capital_section`, `place_comm_beacon`.
- **BP-8e** — 2 hero asteroids: `place_asteroid_luminite`, `place_asteroid_ice`.

### 3.4 Audit §8 new-asset list (all 22 items mapped)

- **ID-H** identity hulls (7): police interceptor, prison barge, worker shuttle, pilgrim hulk, capital silhouettes ×2 (Concord carrier, DMC ore leviathan — try `leviathan`/`massline_express_liner`/`ilex_ark` as parallax bodies first before commissioning new), ice-cutter/sled, racer hull.
- **ID-P** civic props (7): market stall module, hose/umbilical (dynamic spline), banner/strike sign, lantern buoy, toy kits ×15 (mostly kitbash — new parts only for Tuning Fork, Wake Kite, Peristalsis Valve), duel ring markers, faction beacon variants.
- **ID-V** VFX/audio (5): fire-front VFX + scorched-rock decal, thermal-plume VFX, ion-storm-front VFX, radio chatter corpus (~40 lines/zone type ≈ 560 lines — **must be zone/actor-referential** per audit Z.1: line selection keyed to the live census so "tug three, you're drifting" names a real tug; `barks.js` is the seam), crowd liveries (per-faction texture sets on existing hulls).
- **ID-L** — Cut Saw track (monumental landmark for Hyperion's open cut — audit §8.15 files it under *landmarks*, not VFX).
- **ID-S** — Ringworld Arc skybox silhouette for Sedna (audit §8.16/AE.2 — a **skybox/parallax** artifact, not a GLB: owner = the skybox/backdrop pipeline; specify during brief which system draws it).
- **ID-F** — institution frontage structures (5, per ASSET_FAMILIES §D): customs pen, salvage court, relief berth, repair quay, black-market intake — authored structures that attach to/sit beside existing station archetypes. PP-3 cannot place what doesn't exist; these are the assets.
- **ID-FA** — rim fauna site casts (not GLBs): Wake Eel, Glassback, Furnace Maw and Cold Bell already exist procedurally in `faunaVisuals.js`; the work is `alienEcology.js` site casts + placement (Triton, Haumea, Rhea, Sedna), not new models.
- Audit toy-kit note: of the 15 toy kits, only Tuning Fork / Wake Kite / Peristalsis Valve need new parts; the other 12 kitbash from the existing prop kit — and toys are **systems** (`environmentalMachinery.js` rows + NPC operator cycles via the job kernel), owned by the rim packets in §3.7/§5, not filed as loose props.

### 3.5 New units for a less "skinned" world [P]

Differentiation through **behavior + silhouette**, not recolor. Each unit = (a) a def in the named seam, (b) doctrine hooks, (c) encounter entry, (d) placement hooks with **sector/faction gating and a one-line "why here"**, (e) a hull source — reuse first, commission only where named, (f) a **behavior owner**: a lawSecurity jurisdiction, an `npcJobs` site, an encounter id, or a scene directory entry; a unit whose placement has no functioning consumer fails review exactly like an unwired asset. Two def seams exist and are not interchangeable: the **traffic/NPC path** (`occupationalTrafficCraft.js` + `traffic.js` roles + `npcJobs`/`laneContacts`) and the **enemy path** (`enemies.js` + `combatDefs.js` + `combatDoctrine`). The **Lattice Warden** (unmerged `devin/1791167345-lattice-warden`: hull + `src/combat/latticeWarden.js` + `src/render/latticeWardenTethers.js` + encounter + tests) is the reference pattern and lands as chunk **F2**.

| Unit | Behavior promise | Sector/faction gate ("why here") | Def seam | Hull source (dedupe vs existing roster) |
|---|---|---|---|---|
| `npc_customs_interceptor` | boards/scan-denies, pursues only within jurisdiction lanes | SCN/MTS customs lanes — Tethys, Dione, Helios | traffic/NPC | **variant of existing** `customs_cutter`/`inspection_cutter` (`hornet_scn_interdictor.glb` exists): doctrine+silhouette variant, not a new def family |
| `npc_prison_warden_barge` | escorts a slow barge; frees prisoners if cracked | Dione→Sker transfer route (audit F.4/G.6) | traffic + encounter | prison barge (ID-H) |
| `npc_media_drone` | orbits events/bosses, streams zone/actor-referential "live" chatter (audit Z.1 — not canned lines) | core sectors w/ camera pockets (Tethys, Ceres, Helios) | traffic/NPC | `inspection_cutter` variant or new small **wholeship** (wholeship budget, not prop ≤3k) — pick in brief |
| `npc_fuel_tender` | refuels stranded ships; skittish near fights | Pallas fog edge, Charon, rim lanes | traffic/NPC | **reuse** `volatiles_tanker`/`repair_tender` + tender job kernel — no new hull |
| `npc_quarantine_corvette` | cordons contaminated sites; warning shots, then force | Charon quarantine fields (QPF exists) | traffic + encounter | institutional hull variant — name source in brief (`inspection_cutter` heavy variant or ID-H commission) |
| `npc_courier_relay` | timed lane runs; interceptable cargo manifests | Io mail lanes, Dione express lane | traffic/NPC | **promote existing courier lane contacts** (10 exist) to timed-manifest runs; hull = `apron_shuttle`/worker shuttle (ID-H) |
| `npc_storm_prospector` | works ion-storm/fire-front edges; harvests then bolts | sectors with real storm systems | traffic/NPC | **conditional**: `WEATHER_VOLUMES` are static belts — requires the moving weather-front system (deferred item, §3.8) or this unit is cut; ice-cutter/sled (ID-H) if it proceeds |
| `enemy_assassin` | single-target stalking, disengages after mark resolves | Sker/Reach grudge territory | enemy path | existing stealth-frame hull or [proposal] new — must differentiate from the 16 named aces + wanted-hunter loop (state the differentiation in brief) |
| `npc_diplomat_yacht` | escorted VIP transit; killing it has faction cost | Helios↔Tethys corridor, Veil pilgrim lanes | traffic/NPC | pilgrim hulk family (ID-H) |
| `enemy_duel_champion` | challenges at duel rings; rule-bound combat | Sker payday duels (ash_pin rings), Reach sectors | enemy path | racer hull (ID-H); differentiate from aces |

### 3.6 Placeholder replacements [P]

The earlier `popup uses`/`palace`/`fortress`/`hotel`/`motel`/`carnival`/`announcer`/`arena` targets were fabricated — zero hits in `src/`, `assets/` or the audit. The real "placeholder" work is template/generic content, re-scoped:

- **PH-1** — templated `lived-*` vignettes (176/281 share one template family, 179 tolls): absorbed by **F1** (16 scene encounters + de-templated situations + sector overlays) and extended per-sector by the rim packets (§3.7 PR). Residual metric = §7 repetition index.
- **PH-2** — un-authored faction station presence: = **BP-8a** (8 faction overlays) — owned by chunk C7, not duplicated here.
- **PH-3** — generic `place_station_*` archetypes awaiting faction redesign (needed-assets marks `place_station_trade_hub` "Generic trade hub (→ faction redesign)"): state-variant/faction-overlay work layered onto the C1 finish pass.
- **PH-4** — fence-sector duplication (Nyx/Eris/Eunomia/Kepler) + Vael-courier trio (Orcus/Triton/Phoebe): opposite-verb resolution via rim packets (§3.7 PR, audit §6 table).

### 3.7 Placement packets (experience-side)

- **PP-1** fields/wayfinding — macroform belts + readable approach lanes in sectors scoring **`Cam ≤4`** on the audit scorecard (the actual column: Fun/Creat./Fresh/Distinct/Style/Util/Cam/Play): Helios, Veil, Pallas, Io + all rim sectors.
- **PP-2** battles — staged cover lines, aftermath wrecks, escalation silhouettes at battle sites.
- **PP-3** institution frontage — customs pen, salvage court, relief berth, repair quay, black-market intake placed on appropriate station archetypes (ASSET_FAMILIES §D). **Consumes ID-F** (§3.4/C10): the packet places authored structures, it does not kitbash them ad hoc.
- **PP-4** economy/crime — claims, handover/custody props, smuggler lane markers, market presence.
- **PP-5** Play pack (re-scoped to real items) — signature toys as systems (`environmentalMachinery.js` rows + NPC operator cycles so players watch them used), pop-up bazaars and festivals built from the existing kit (audit §2-AA/D.4), duel rings at Sker, lantern walks, express-liner timetable. No phantom "motel/carnival/arena" commissions.
- **PP-6** camera scale — the audit's measured axis: activity pockets and actors inside the 144 WU arrival frame + gate-arrival framing (audit AD.1, BP-5) for every sector. Run measured core fixes (pull Helios's pockets inside the frame; Tethys customs on camera) **in parallel with** the rim packets — the evidence does not support "Play first, then core".
- **PR-1/PR-2** — rim signature packets (audit BP-7 ×14, the biggest de-skinning lever): per sector = sharpened way-of-life verb (audit §6 table) + 1 camera-scale activity pocket + promoted lane-contact character + interactive verb on the one-off + 1 discovery chain + resident fauna + its signature toy system (BP-8 machinery+operator). Order per audit: Kepler, Dione, Rhea, Phoebe, Sedna, then the rest. No two neighbouring rim sectors share a verb, a toy or a cast.

### 3.8 Deferred queues — explicit dispositions (so "consolidates every open queue" is checkable)

| Source | Disposition |
|---|---|
| Audit BP-9 wreck lifecycle | **Deferred** — simulation-state work (fresh→stripped→derelict driven by salvor jobs), not an asset-program packet. Reuse `aftermath_*` families when scheduled. |
| Audit BP-10 player legacy props | **Deferred** — persistence-registry feature, not art. |
| Audit BP-11 cross-sector consequence chains | **Deferred** — economy/faction simulation work. |
| Audit BP-12 regional heists + rescue set pieces | **Deferred** — mission-system work; needs heistFacilities/ilexArk owners. |
| Audit BP-13 boss lairs / ace territories | **Partially in scope** — `namedAces.homeSectorId` + hideout one-offs feed PP-4/PR packets (placement); boss-arena geometry deferrals stay mission work. |
| Audit BP-14 horizon spectacle | **Partially in scope** — ID-S Ringworld Arc + capital parallax hulls (ID-H) are commissioned here; the full parallax fleet system stays deferred. |
| Audit BP-15 race courses per motif | **Partially in scope** — Dione drag + PP-5 toy/lane-furniture gates; full course system deferred. |
| ASSET_FAMILIES §A (Anvil collector/rack/cradle, Ceres heavy-handling, public-service extensions) | **Deferred** — world-depth production families larger than this program; ID-H covers the audit §8 hulls only. |
| ASSET_FAMILIES §B combat bodies (line-cutter, formation anchor, launcher/carrier) | **Deferred** — opponent-design work; check `shipRoleLattice` first when scheduled. |
| ASSET_FAMILIES §C authored configuration grammar | **Deferred** — build-system policy question (visible modules vs Forge no-bolt-on), needs owner ruling. |
| ASSET_FAMILIES §E mechanism/moving-cover library | **Deferred** — beyond current packets; SP-07/Sluice precedents stand. |
| ASSET_FAMILIES §F fauna anatomy guilds | **Deferred** — procedural `faunaVisuals.js` path is live; enrichment is its own program. |
| ASSET_FAMILIES §G ancient-machine family | **Deferred** — `machineVisuals.js` path is live. |
| ASSET_FAMILIES §H Brood/Foundry bodies + boss/arena anatomy | **Deferred** — Swarm-track scope. |
| ASSET_FAMILIES §I intact→fractured→salvaged wreck families | **Partially in scope** — §D state variants ride the C1/C2 finish passes; the universal anatomy system defers. |
| `design/program/02_REMAINING_WORK.md` graphics rows (M0-ASSET-INTEGRITY residuals, PQ-022 corridor promotion, PQ-045 four Ceres occupation ships, PQ-050 fleet remaster, M4-ASHLINE-V2 unwired) | **Cross-check, don't absorb** — owned by their own programs; the final wave gate (§6.7) must note overlap or contradiction. |

---

## 4. The agentic pipeline contract

Each chunk follows the same lifecycle. "Asset" here means GLB + registration + consumer wiring, not just a file in `assets/`. This contract **supersedes Forge brief HARD RULES** where they conflict: a chunk agent may touch `fleet.json`/manifests via the generator path and must commit/push its own branch; brief rules still bind Forge *authoring* discipline (anchors, sockets, LOD families).

0. **Ingest** — before writing a brief, re-verify the §3 item's tuple `{source file, item id, manifest row, on-disk path, lifecycle status}` by command (e.g. `git ls-files`, `parts_manifest` query, `ASSET_STATUS` row). Record the relevant result once; recheck only changed or conflicting inputs.
1. **Brief** — pick items from §3; write/obey the Forge brief format (`tools/blender/forge/briefs/*.md`): silhouette purpose, tri budget (per §1.3 authority resolution), anchors (drive/RCS/socket transforms, Blender +X nose/+Y port/+Z up surviving GLTF→XZ), damage/state expectations, consumer.
2. **Author** — Forge script in `tools/blender/forge/ships|places|landmarks/` or a kit; produce GLB(s). If the Blender toolchain is unavailable on the agent's VM, produce the complete script + all source registration and mark the GLB **`pending_render`** per the fallback semantics below — never emit an unverified binary; record the gap in structured output naming the missing GLB ids.
3. **Look** — `node scripts/fleet-look.mjs --file=… --views=inspect,close,top` on every produced hull/place before wiring (`assets/ships/AGENTS.md`: "do not wire a body that has not been looked at"). Attach captures to the chunk report.
4. **Admit** — run the generator chain (§1.4), never hand-editing generated files: `check-parts-manifest --sync` → `build-sg04-release-assets --only` → `refresh/build-render-package-pilots --only` → `model-truth-census` + `splice-census-rows` → `check:render-package-pilots*`. Hand-edit only the hand-edited registries (§1.4 table).
5. **Wire** — at least one live consumer per asset: encounter/mission/NPC placement, ambient scene, field/silhouette packet, or UI/audio hook. **Honest-vs-cosmetic rule:** a placement must drive runtime behaviour or state — wiring into a real consumer (director eligibility, encounter decks, job sites, jurisdiction maps), not decorative duplication. An admitted asset with no consumer is incomplete.
6. **Verify** — `node --test` for touched test seams; the chunk's named gate commands (§5 scope cards); `perf:gltf` report attached. Evidence = commands run + output summaries in the structured report. **No playtest claims** — verification is command-level evidence only.
7. **Land** — publish the fulfilled, directly verified chunk by exact paths on the current owned branch; preserve concurrent work and sync master.

**`pending_render` fallback semantics (the no-Blender path):**
- For part/wholeship assets: `parts_manifest.json` `status:"blocked"` + `statusNote:"pending_render — Forge script complete, GLB not yet built"` (the existing `status`/`statusNote` pattern; `check:asset-status` already enforces blocked ≠ wired).
- For `place_*` assets tracked in `ASSET_STATUS.json`: add `PENDING_RENDER` to that file's `lifecycle_enum` — a **schema amendment owned by chunk F3**, which also updates `report-asset-status.mjs`/any enum consumers.
- Registries that must stay **empty** for an unbuilt GLB: `renderPackageManifest.js`, `modelTruthCensus.json`, `release_manifest.json`, `runtimeSlots`, `partsLibrary` wiring maps, `PLACE_FILES` — entries there require real bytes/hash.
- The chunk's gap report must name the still-missing GLB ids so a later render pass can be scheduled.

**File-ownership rule:** chunks own disjoint *new* files wherever possible. Shared registries (§1.4 table) may be touched minimally. Merge order is serialized (§6 landing order); the landing agent resolves conflicts **preferring additive union over replacement for hand-edited files only** — and validates it with a unique-id lint + each file's own check script. **Generated files are never union-merged**: they are regenerated after merge (hash/content pins make textual union corrupt). On Windows checkouts `.gitattributes` `eol=lf` must be respected so byte-freshness checks still mean what they say.

---

## 5. Chunk decomposition (execution units)

Phases run in order; chunks inside a phase run in parallel. Each chunk names its outcome, implements the live consumer, and passes the direct checks that can falsify that outcome. Each chunk row is a **scope card**: `§3 items · seams to touch · gate commands · known conflict surfaces`.

### Phase F — foundation (bring unmerged prior work forward; registry groundwork)

| Id | Unit | Scope card |
|---|---|---|
| **F1** | Port PR #264 world-placement program | Merge `devin/1791689614-world-placement-program` (~930-file diff vs master; own surface ≈ `livedSectorOverlays.js` + 16 `scene-*` encounters 569–584 + ~190 regenerated `lived-*` files + `livedWorldDirector`/`vignetteInterpreter`/`build-lived-vignettes.mjs`/`index.html` edits). **Seams:** `src/data/livedSectorOverlays.js`, `src/systems/livedWorldDirector.js`, `src/data/encounters/**`, `index.html`. **Gates:** re-run `build-encounter-index.mjs` + `build-lived-vignettes.mjs` + `sync-modulepreload.mjs --check` + `check:contracts` + lived/vignette tests + catalog census showing `toll` ≤90; the modulepreload registry resolves by regeneration, not hand-merge (indent churn expected). |
| **F2** | Integrate Lattice Warden | Merge `devin/1791167345-lattice-warden` (branch diff includes `src/combat/latticeWarden.js`, `src/render/latticeWardenTethers.js`, `capital-boss/lattice-warden.js`, `test/lattice-warden.test.mjs`, `design/characters/LATTICE_WARDEN.md`, enemies +40, `fleet.json` +8 — plus ~280 regenerated `render-package.json`/`release_manifest.json` rows and `combatDoctrine`/`enemyMind`/`engagementAuthority`/`temperament`/`capitalBoss*`/`missions`/`threatHalo` diffs; the regenerated output is the bulk of the conflict surface). **Gates:** `node --test test/lattice-warden.test.mjs` + capital-boss score contract; regenerate census/pilots/encounter-index/modulepreload **after** merge — never union-merge generated rows. |
| **F3** | Registry & schema groundwork | Add `PENDING_RENDER` to `assets/ASSET_STATUS.json` `lifecycle_enum` + update enum consumers (`report-asset-status.mjs`); publish the canonical-id map (landmark collisions ruled per §3.2/§3.3); run the §3 queue-ingestion verification pass and emit the machine-checkable item table chunks diff against. **Gates:** `check:asset-status`, `report-asset-status` run clean; the id map lands as a table inside this spec or `needed-assets.md` note. |

### Phase C — asset creation & admission

| Id | Unit | §3 items | Scope notes |
|---|---|---|---|
| **C1** | Place finish tier — stations | PL stations (8): trade_hub, refinery, military, blackmarket, mining, fab, research, billboard | Finish/state-variant passes per §D + fleet-look evidence; PH-3 faction-redesign note lands here. Gates: `check:art` subset (`check:station-archetype-*`, `check:authored-place-runtime`, `check:visual-stability`) + admit chain. |
| **C2** | Place finish tier — fields/props | PL fields/wrecks (7) + props/machines (5): seamed, rock_a/b/c, graffiti, dead_hulk, debris_chunk, conveyor_barge, mining_drone, lane_beacon, nav_buoy, gate_jump_ring | Same finish contract. Gates: `check:authored-place-runtime`, `check:visual-stability`, `check:lod`. |
| **C3** | Parts finish — combat | PT-A (17) | Finish passes on existing GLBs (no new commissions). Gates: `check-parts-manifest --sync`, `check:kestrel:*` if hull-adjacent, `check:visual-stability`. |
| **C4** | Parts finish — dressing | PT-B (12) | Same. |
| **C5** | QUEUE dressing pack | Q2 (27: 7 claim + 12 hunter_sig + 8 module_vis) | True missing-GLB commissions at QUEUE row budgets. Gates: `check-parts-manifest`, `check:assets:live`, `check:asset-classifications`. |
| **C6** | QUEUE + BP-08 landmarks & gates | Q3 (5 commissions + cathedral retire ruling) + BP-8b (5) + BP-8c (3) | Canonical `place_landmark_*`/`place_gate_*` ids per F3 map — no fourth spelling of the wreck cathedral. Gates: `check:authored-place-runtime`, `check:lod`, `check:assets:live`. |
| **C7** | BP-08 station overlays + wrecks/beacon + hero rocks | BP-8a (8) + BP-8d (5) + BP-8e (2) | Reuse `var_station_trade_hub_*_overlay` technique. Gates: `check:station-archetype-*`, `check:authored-place-runtime`, `check:assets:live`. |
| **C8** | Admission lane | AD-1..12 + Q1 residual | Generator-chain admission only (no new GLBs): `check-parts-manifest --sync` → release/pilot rebuild `--only` → census splice → `check:render-package-pilots*`. Confirm each hull's `wiringStatus` consumer. Gates: `check:art` subset + `check:asset-status`. |
| **C9** | Identity hulls | ID-H (7) | Forge commissions at ships-brief budgets (10–45k LOD0); capital silhouettes try leviathan/liner/ark reuse first. Gates: fleet-look + `check:faction-ships`, `check:assets:live`. |
| **C10** | Civic props + frontage | ID-P (7) + ID-F (5) | ID-F structures are assets (attach to station archetypes); toy kits: only Tuning Fork/Wake Kite/Peristalsis Valve get new parts, rest kitbash. Gates: `check:authored-place-runtime`, `check:assets:live`, `check:lod`. |
| **C11** | VFX + landmark + skybox | ID-V VFX (3 parameter sets) + ID-L Cut Saw + ID-S Ringworld Arc | Three different pipelines: VFX param sets, monumental landmark GLB, skybox/backdrop artifact. Gates: `check:visual-stability`, `check:authored-place-runtime`, plus whichever postFX/backdrop check the brief names. |
| **C12** | Comms + liveries + fauna casts | ID-V chatter (~560 lines, zone/actor-referential via `barks.js`) + crowd liveries + ID-FA (`alienEcology.js` casts) | Chatter must key to live census, not canned lines — reviewer 2 checks referentiality. Gates: `check:bark-director`, `check:bark-silence`, texture/livery checks, ecology site checks. |
| **C13** | Repurpose/adoption lane | RP-1..3 | RP-1 .blend→GLB pipeline; RP-2 wire as §3.5 reference; RP-3 = restore-from-git-history or retire per item (verify dirs absent first). Gates: fleet-look + admit chain for anything admitted. |

### Phase P — placement/experience (consumes F1's seams; lands after C feeds it)

| Id | Unit | §3 items | Scope notes |
|---|---|---|---|
| **P1** | Fields + battles | PP-1 + PP-2 | Selector = `Cam ≤4` scorecard sectors (Helios, Veil, Pallas, Io + rim). Gates: encounter-index build + `check:contracts` + composition checks. |
| **P2** | Frontage + economy | PP-3 + PP-4 | PP-3 places C10's ID-F structures on station archetypes — dependency: C10 lands first or this chunk sequences after it. Gates: `check:authored-place-runtime`, `check:station-archetype-*`, encounter checks. |
| **P3** | Rim packets wave 1 | PR-1 (Kepler, Dione, Rhea, Phoebe, Sedna) | Per audit order + table: verb + pocket + promoted contact + one-off verb + chain + fauna + toy system (`environmentalMachinery.js` row + operator job). Gates: per-sector census test (≥1 pocket/chain/toy), `check:contracts`, lived-world tests. |
| **P4** | Rim packets wave 2 | PR-2 (remaining 9 rim sectors: Nyx, Hyperion, Orcus, Haumea, Eris, Nereid, Proteus, Triton, Eunomia) | Same contract; duplicate-verb rule between neighbours enforced by reviewers. |
| **P5** | Play + camera | PP-5 + PP-6 | Toy-system coverage audit, pop-up bazaars/festivals from kit, duel rings at Sker; Helios pockets into the 144 WU frame + Tethys customs on camera + gate-arrival framing elsewhere. Gates: `world.sector_identity` camera census delta, `check:sector-arrival-admission`, activity-pocket checks. |

### Phase U — units & placeholder cleanup

| Id | Unit | §3 items | Scope notes |
|---|---|---|---|
| **U1** | NPC-path roster | §3.5 traffic/NPC units (customs variant, fuel tender, courier relay, media drone, quarantine corvette, diplomat yacht) | Each unit owns its own placement hook (job site/lane/encounter) so ordering can't strand it; sector/faction gate + "why here" mandatory per table. Lattice Warden is the in-tree template. |
| **U2** | Enemy-path roster + conditional | §3.5 enemy units (assassin, duel champion) + prison-barge escort + `npc_storm_prospector` **only if** a moving weather-front system is commissioned in its chunk (else record cut) | enemies.js + combatDefs + combatDoctrine seam; differentiation vs 16 aces stated per unit. Gates: combat-doctrine tests, encounter checks. |
| **U3** | Generic-archetype cleanup | PH-3 residual + census red-row triage | De-duplicate generic `place_station_*` reads vs faction overlays; own the "placeholder at zero" §7 metric (`modelTruthCensus`/`check:asset-classifications` red rows attributable to this program). |

Chunk sizes are calibrated to one focused agent session each; the finish-tier chunks (C1–C4) are surfacing passes, not 20 full brief→author→wire lifecycles. Reviewers check against this spec's item lists, `assets/AGENTS.md` authority, budgets per §1.3, and the pipeline contract (§4) — plus whether the result could be improved *beyond* spec.

---

## 6. Direct review and landing

This is a planning backlog. PR #278 adds this specification and its placement audit; it does not implement the commissioned assets, NPCs, world facts or capital hunts. Those rows remain planned until their live consumers exist.

1. Name the requested outcome, exact owned paths and done condition. Read the current manifest and consumer; preserve shipped work and foreign dirty files.
2. Author, admit and wire the complete outcome through the existing Forge and game path. Run the smallest relevant source, asset and public-route checks. Inspect the real picture for an appearance claim.
3. Review specification compliance, then implementation quality. Additional review or verification requires a named uncertainty that can change the fix, verdict or significant risk. Resolve material findings; repeated reviewer agreement is not a completion condition.
4. Regenerate affected manifests and indexes once at the coherent integration boundary. Publish only fulfilled work, with its actual checks and any material remaining limit. Follow the current repository branch/ownership rules rather than the historical integration branch.
5. Stop when the outcome exists, direct verification passes and no unresolved issue can materially change it. A source-only or pending-render candidate remains explicitly incomplete for its missing live result; no consensus ceremony turns it into shipped content.
---

## 7. Measurement (what "deeper, less repetitive" means)

Named commands, concrete targets:

- **Identity/camera axis** — `scripts/lib/bench/scenarios/world.sector_identity.mjs` (seed 4242, 144 WU camera-ring census) extended to rim sectors + camera-frame census; per-cell targets: every core sector ≥2 camera pockets, every rim sector ≥1 pocket + 1 toy + 1 chain + 1 named NPC. Scorecard re-run on the same rubric (Fun/Creat./Fresh/Distinct/Style/Util/Cam/Play): rim avg 3.8 → ≥5, no rim sector `Cam` ≤3.
- **Content census** — `npm run check:content-census` (`report-content-census.mjs --check --summary`) tracking pockets, one-offs, toys, chains, named NPCs, vignette variants per sector; audit §9 target: **≥6 per category per sector**.
- **Repetition index** — fixed-seed 30-minute run measuring the share of fired encounters that share a template with another fired encounter; baseline **176/281 one family (toll = 179/281)**; target: meaningfully lower share with `toll` ≤90 catalog entries post-F1.
- **Unique-model coverage** — `modelTruthCensus.json` green/red rows + `check:asset-classifications` red rows attributable to this program → driven to zero for the §3 scope; placeholder stand-ins (PH redefined) at zero.
- **Queue drain (corrected counts)** — before→after per queue: 36 QUEUE rows (27 Q2 + 5 landmark commissions + 1 cathedral retire + 3 stale wholeship rows resolved), ~29 part finishes (PT-A 17 + PT-B 12), ~19 place finishes (PL), 23 BP-08 ids, 12 integration_candidate admissions, 2 blocked-row dispositions, 22 audit §8 items, plus PP/PR placement coverage per sector.
- **Landing gate** — full `npm run check:art` umbrella green + `check:asset-status`, `check:asset-reachability`, `check:content-census`, `check:contracts`, `node --test` suites touched, generated-freshness checks (`build-encounter-index`, `sync-modulepreload --check`, `build:render-package-pilots*`) clean.
- **Evidence discipline** — every claim cites a command or file; no unverified "looks better" language.
