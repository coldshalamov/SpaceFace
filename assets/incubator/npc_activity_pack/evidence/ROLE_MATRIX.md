<!-- LIFETIME: DURABLE -->
# Existing-role audit matrix — what has a face, what only has behavior

Compiled 2026-08-08 from `src/systems/npcJobs.js` (6 job kinds), `src/systems/traffic.js`
(12 traffic roles), `src/render/npcJobSignatureVfx.js` (13 signal profiles),
`src/render/partsLibrary.js` (runtime whole-ship selectors),
`design/graphics-sprints/VISUAL_ASSET_CATALOG.json` (83-row release census),
`design/fiction/THE_WORKING_LIGHT.md` + `THE_WORKING_TRADES.md`. This matrix is the
duplication guard for the `npc_activity_pack`: a family is authored here ONLY where the
"missing art" column says so.

| Role | Sim presence | Silhouette today | Visible equipment today | Visible work state today | Faction variation today | Route behavior | Missing art → pack action |
|---|---|---|---|---|---|---|---|
| miner | job kind + traffic role | **Helios Cradle whole-ship** (22.2 m) | authored mining craft | `blind_cone` cut-beam onto real rock, `home_under_rock` | paint accents via `factionAccentVariants`; `factionHullFor` substitution | home↔field cycle | **COVERED — do not re-author.** Pack adds the weight classes around it only. |
| hauler | job kind + traffic role | **Helios Span whole-ship** (28.5 m) | authored cargo craft | `mouth_open`, `heavy_burn`, `spilling_the_count` | as above | station→station one-shot | **COVERED — do not re-author.** |
| courier | traffic role (no job — `_buildJobSpec` returns null) | **Helios Lark whole-ship** (18.2 m) | authored courier craft | none (no job ⇒ no signal) | as above | ambient | Hull covered; missing WORK is a sim gap, not an art gap. No pack family. |
| patrol | job kind + traffic role | `hull_fighter.glb` modular fallback (shared with escort) | generic fighter | `on_the_pin` sweep | modular part accents | 4-beat ring | Distinct LAW identity missing → **`customs_cutter`** (authority/inspection language; patrol/escort keep the fighter hull). |
| escort | traffic role (no job) | `hull_fighter.glb` (identical to patrol) | generic fighter | none; fiction's `borrowed_shadow` has NO signal profile | — | ambient | Signal gap documented for a future lane; no new hull (escort SHOULD share fighter bones per fiction). |
| surveyor | job kind + traffic role | `hull_multirole.glb` fallback | none — boom/pin exist only as VFX streaks | `reading_the_dark` | — | 4-mark lattice | **`survey_pin`** — give the spine/paddles/range-mast/crab-boom a real mesh. |
| salvor | job kind + traffic role | `hull_miner.glb` fallback (reads as a miner) | none — shears/umbrellas/cradle are VFX-only | `picking_the_bones` | — | yard↔hulk cycle | **`salvage_cutter`** — author the dossier's cutter (also resolves the fiction↔code hull contradiction). |
| tender | job kind + traffic role | `hull_multirole.glb` fallback | none — plate rack/boom/bar are VFX-only | `hull_open` | — | berth↔client, DEPART-only cycle | **`repair_tender`** — author the dossier's Mule-frame tender. |
| smuggler | traffic role (no job) | `hull_multirole.glb` | none | none (fiction: signal IS absence) | — | ambient | **Deliberate omission** — smuggler skins legitimate families; tells documented in manifest. |
| pirate | traffic role (no job) | Ashline Rig whole-ship (via hostile selector) | authored raider | none | — | ambient | Covered by Ashline family; costume-seam notes only. |
| rescue | traffic role (no job) | `hull_multirole.glb` | none | none; only the VICTIM's `breaking_the_pattern` exists | — | ambient | **`rescue_lifter`** — the responder's red-white authority. |
| express | traffic role (job path bypassed) | `hull_freighter.glb` (identical to hauler) | none | none | — | V3 boost lanes | **`liner_shuttle`** — speed 247 finally gets a hull that explains it. |
| tanker | NONE (commodities exist: `cmdty_ice_water` etc.) | none | none | none | — | — | **`volatiles_tanker`** (+ variant B) — hazard-cargo hauler class. |
| tug / lighter | fiction dossier only (TRADES §6) | none | none | none | — | — | **`yard_tug`** — full dossier, zero code presence. |
| prospector | fiction dossier only (TRADES §5) | none | none | none | — | — | **`prospector_skiff`** — the one-crew claim hunter below the Cradle. |
| ore carrier | implied (Ironback def unused; no barge GLB exists) | none | none | none | — | — | **`ore_barge`** (+ variant B) — bulk class above the Cradle. |
| construction | NONE (poi family `convoy_industrial_route` implies it) | none | none | none | — | — | **`construction_rig`** — the origin of every dock. |
| debris cleanup | NONE (`cmdty_scrap_metal`, 5 wreck classes exist) | none | none | none | — | — | **`scrap_sweeper`** — collects, never cuts. |

Station-side operations (`stationSideEventVfx.js`: hauler_dock / patrol_launch /
repair_drone / cargo_tractor) are station-anchored presentation, not craft — no overlap.

**Counts:** 12 pack families, 15 GLBs (ore_barge ×2, volatiles_tanker ×2,
salvage_cutter +damaged). 6 sim job kinds all end up visually distinct; 9 previously
asset-less occupational roles gain hulls; 2 roles are deliberate, fiction-grounded
omissions (smuggler, pirate).
