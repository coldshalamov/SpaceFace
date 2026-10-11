# Asset Experience Program — agentic pipeline spec

*How SpaceFace turns the assets it already owns, the assets it is missing, and the placements that carry them into a deeper, less repetitive player experience — and the agentic pipeline that produces, admits, wires and gates that work.*

Baseline: `coldshalamov/SpaceFace` @ `master` (`9d86b046bc42`, 2026-10-11). This spec supersedes no prior document; it consolidates `design/world-identity/WORLD_PLACEMENT_AUDIT.md` (the placement audit carried into this program), `needed-assets.md`, `assets/QUEUE.md`, `design/ASSET_REPURPOSE_POOL.md`, `design/program/world-depth-2026-10-02/ASSET_FAMILIES.md`, and `docs/visual-assets/*` into one executable program.

Every claim in §1–§3 cites an artifact another agent can re-check. Where this spec proposes names not yet in canon, the item is marked **[proposal]**.

---

## 1. What we have, and how it is used today

### 1.1 Authored asset stock (verified counts)

| Layer | Stock | Authority / registry |
|---|---|---|
| Ship parts | ~1,090 part GLBs (`assets/ships/parts/`), 63 manifest ids in `parts_manifest.json` with gaps listed in `needed-assets.md` §1 | `parts_manifest.json` → `src/render/partsLibrary.js` |
| Release wholeships | `assets/ships/release/render-packages/<family>/render-package.json` entries; families incl. aftermath debris kits, works-*, yard-tug, wreck-cathedral | `src/render/renderPackageManifest.js` (584-line registration table) |
| Fleet wholeships | `fleet_player_bodies_v1` families: atlas, bastion, colossus, drifter, hornet, ironback, kestrel, leviathan, ranger, warden, wasp | `tools/blender/forge/fleet.json` |
| Places | `assets/places/` build trees; ~20 place slots missing GLBs (`needed-assets.md` §1) | place render packages |
| Unshipped authored GLBs | `m4_ashline_v2` (134 MB), `kestrel_borrowed_time_v2`, `kestrel_borrowed_time_v3`, `m4_hero_hauler` (26 MB), `m5_kestrel_upgrade` (69 MB, owner-supplied) | `design/ASSET_REPURPOSE_POOL.md` |
| Procedural life | `src/render/faunaVisuals.js` (rays, cysts, leeches, worms, beasts, kites, eels + growth morphologies); `src/render/machineVisuals.js` (Prism, Custodian, Auditor + site props) | `src/data/precursorMachines.js`, ecology data |
| Capital hulls / bosses | `ship_warden → ship_colossus → ship_leviathan` (`src/data/shipRoleLattice.js`); `dreadnought_boss` "Iron Maw" (`src/data/enemies.js:217`, Vael, Ashfall); `ship_saucer` tier-5 exotic (`src/data/ships.js:395`, swarmEarned) | `src/data/ships.js`, `src/data/enemies.js` |
| Forge pipeline | `tools/blender/forge/` — `forge.py`, `forge_export.py`, `forge_textures.py`, `fleet.json`, `ships/*.py` per-hull scripts, `briefs/{ships,places,landmarks,trade_hub}.md`, domain kits (`claim_outpost_kit.py`, `dock_interior_kit.py`, `quiessence_freighter_kit.py`, `hub_overlay_kit.py`, `mcp_design_kit.py`, `brood_*`, `ceres_second_measure_kit.py`) | `tools/blender/forge/FORGE.md` |

### 1.2 How assets reach the player (the placement stack)

The audit (§"placement stack") enumerated the layers that turn data into a scene: sector fields → silhouettes → battle dressings → places/stations → economy/crime → NPC traffic → ambient scenes → camera/postFX → Play-sector showmanship. The runtime seams are:

- **Encounter/content data**: `src/data/encounters/**` (incl. `capital-boss/` subdir), `src/data/missions.js`, `src/data/enemies.js`, `src/data/combatDefs.js`, `src/data/commodities.js`, `src/data/commodityFlavor.js`, `src/data/conflictReactions.js`
- **Sector personality**: sector data + mood/personality modules (`src/data/` sector files; see audit §"sector personality plans")
- **Ambient/lived runtime**: PR #264 added `src/data/sectorLivedOverlays.js`, `src/data/ambientScenes.js`, `src/systems/livedWorldRuntime.js` (ported forward as chunk F1); existing ambient machinery in `src/data/environmentalMachinery.js`
- **Render wiring**: `src/render/renderPackageManifest.js`, `src/render/partsLibrary.js`, `src/render/renderer.js`, `src/data/modelTruthCensus.json`, `src/data/collisionProxyManifests.js`
- **Audio**: `src/data/audioRecipes.js`, `src/audio/audioSystem.js`
- **UI presentation**: `src/ui/threatHalo.js`, cinematic/postFX presets

### 1.3 Acceptance gates that already exist

`npm run check:assets:live`, `npm run check:asset-status`, `npm run check:asset-reachability`, `npm run perf:gltf`, `npm run check:asset-classifications`, `npm run check:asset-startup-readiness`, `npm run check:asset-runtime-disposal`, plus `node --test test/*.test.mjs` suites and scenario validators (`scripts/sf.mjs validate`, `check:contracts`). `assets/AGENTS.md` is the authority: the manifest decides acceptance; never infer validity from filename/size. Tri budgets (`assets/QUEUE.md`): part ≤15k, wholeship ≤20k, prop ≤3k, landmark ≤10k.

---

## 2. Where the experience is thin (weak asset classes)

From the audit's sector scorecard (core ~6.6, rim ~3.8) and family coverage:

1. **Camera-scale staging** — weakest cell program-wide: far-z landmark belts, postFX preset tallies, and composition tuned to the flight camera rather than prop scale.
2. **Play sector pressure** — motel/carnival/announcer/arena/popup placeholders read as un-authored.
3. **Field silhouettes & wayfinding** — rim sectors especially; fields exist but don't form readable macroforms.
4. **Battles** — dressing exists but lacks staged readability (cover lines, wreck aftermath, escalation cues).
5. **Institution frontage** — stations lack authored customs/salvage/relief/repair/black-market fronts (ASSET_FAMILIES §D).
6. **Economy & crime made visible** — claims, smuggler lanes, custody/handover props under-placed.
7. **Placeholder bodies** — `popup uses`, `palace`, `fortress`, `hotel` read as un-authored stand-ins.
8. **Place wholeships** — 20 place slots lack GLBs (`needed-assets.md` §1).
9. **Ship parts backlog** — ~43 manifest part gaps + ~31 QUEUE gaps (`needed-assets.md` §2–3).
10. **Occupational hulls** — traffic exists but work-identity silhouettes (police, prison, shuttle, pilgrim, cutter, racer) are missing (audit §8, ASSET_FAMILIES §A).

---

## 3. What we must create or place — consolidated queue

Merges every open queue. Item IDs are stable handles for chunk prompts. **[P]** = proposal new to this spec.

### 3.1 Unshipped-but-authored (adopt, don't rebuild)

- **RP-1..5** — `m4_ashline_v2`, `m4_hero_hauler`, `kestrel_borrowed_time_v2`, `kestrel_borrowed_time_v3`, `m5_kestrel_upgrade`: resolve per `ASSET_REPURPOSE_POOL.md` (registered render packages + at least one placement consumer each; retired-id collision handling per `assets/AGENTS.md`).

### 3.2 Missing GLBs from `needed-assets.md` + `assets/QUEUE.md`

- **PL-1..20** — place wholeships (20 place slots).
- **PT-A** — hulls/cockpits/engines/weapons/fins manifest gaps (~28).
- **PT-B** — greebles/skids/pods manifest gaps (~15).
- **Q1** — blocked wholeship repairs: kestrel / pelican / wasp "hull body missing".
- **Q2** — claim props (7), hunter_sig_rails (12), module_vis parts (7).
- **Q3** — 5–6 landmarks.

### 3.3 BP-08 world-identity assets (`needed-assets.md` §2)

- **BP-8a** — 8 faction station overlays; **BP-8b** — 5 landmarks; **BP-8c** — 3 ring gates; **BP-8d** — 5 wreck/beacon bodies; **BP-8e** — 2 hero asteroids.

### 3.4 Audit §8 new-asset list

- **ID-H** identity hulls: police interceptor, prison barge, worker shuttle, pilgrim hulk, capital silhouette ×2, ice-cutter/sled, racer hull.
- **ID-P** civic props: market stall module, hose/umbilical, banner, lantern buoy, toy kits ×15, duel rings, faction beacons.
- **ID-V** VFX/audio: fire-front, thermal-plume, ion-storm VFX parameter sets; Cut Saw track; radio chatter (~40 lines/zone); crowd liveries; rim fauna ×4.

### 3.5 New units for a less "skinned" world [P]

Differentiation through **behavior + silhouette**, not recolor. Each unit = enemy/NPC def (`src/data/enemies.js` or NPC equivalent) + doctrine hooks (`src/data/combatDefs.js`, `src/ai/combatDoctrine.js`) + encounter entry + placement hooks + hull (Forge script or manifest reuse). The **Lattice Warden** (unmerged `devin/1791167345-lattice-warden`: hull + `src/combat/latticeWarden.js` + `src/render/latticeWardenTethers.js` + encounter + tests) is the reference pattern and is integrated as chunk **F2**.

| Unit | Behavior promise | Silhouette source |
|---|---|---|
| `npc_customs_interceptor` | boards/scan-denies, pursues only within jurisdiction lanes | police interceptor (ID-H) |
| `npc_prison_warden_barge` | escorts a slow barge; frees prisoners if cracked | prison barge (ID-H) |
| `npc_media_drone` | orbits events/bosses, streams "live" feed chatter | small prop hull |
| `npc_fuel_tender` | refuels stranded ships; skittish near fights | tanker-family reuse or ID-P |
| `npc_quarantine_corvette` | cordons contaminated sites; warning shots, then force | institutional hull |
| `npc_courier_relay` | timed lane runs; interceptable cargo manifests | worker shuttle (ID-H) |
| `npc_storm_prospector` | works ion-storm/fire-front edges; harvests then bolts | ice-cutter/sled (ID-H) |
| `enemy_assassin` | single-target stalking, disengages after mark resolves | existing stealth hull or new |
| `npc_diplomat_yacht` | escorted VIP transit; killing it has faction cost | pilgrim hulk family |
| `enemy_duel_champion` | challenges at duel rings; rule-bound combat | racer hull (ID-H) |

### 3.6 Placeholder replacements [P]

- **PH-1..4** — authored replacements for `popup uses`, `palace`, `fortress`, `hotel` placeholders: distinct macroforms + flythrough sockets per audit placeholders cell.

### 3.7 Placement packets (experience-side)

- **PP-1** fields/wayfinding — macroform belts + readable approach lanes in sectors scoring ≤4 fields.
- **PP-2** battles — staged cover lines, aftermath wrecks, escalation silhouettes at battle sites.
- **PP-3** institution frontage — customs pen, salvage court, relief berth, repair quay, black-market intake on appropriate station archetypes (ASSET_FAMILIES §D).
- **PP-4** economy/crime — claims, handover/custody props, smuggler lane markers, market presence.
- **PP-5** Play pack — motel, carnival, announcer, orbital arena, popup-use replacements.
- **PP-6** camera scale — far-z landmark belts + postFX preset tallies; Play first, then core sectors.

---

## 4. The agentic pipeline contract

Each chunk follows the same lifecycle. "Asset" here means GLB + registration + consumer wiring, not just a file in `assets/`.

1. **Brief** — pick items from §3; write/obey the Forge brief format (`tools/blender/forge/briefs/*.md`): silhouette purpose, tri budget, anchors (drive/RCS/socket transforms, Blender +X nose/+Y port/+Z up surviving GLTF→XZ), damage/state expectations, consumer.
2. **Author** — Forge script in `tools/blender/forge/ships|places|landmarks/` or a kit; produce GLB(s). If the Blender toolchain is unavailable on the agent's VM, produce the complete script + registration and mark the GLB `pending_render` in `ASSET_STATUS.json` rather than emitting an unverified binary — then record the gap in structured output.
3. **Admit** — add/update manifest entries (`parts_manifest.json` or render-package `render-package.json`), `src/render/renderPackageManifest.js`, `src/render/partsLibrary.js`, `src/data/modelTruthCensus.json` and `assets/ASSET_STATUS.json` per `assets/AGENTS.md`.
4. **Wire** — at least one live consumer per asset: encounter/mission/NPC placement, ambient scene, field/silhouette packet, or UI/audio hook. An admitted asset with no consumer is incomplete.
5. **Verify** — `node --test` for touched test seams; the relevant `check:asset-*`/`check:assets:*` script; `perf:gltf` budgets. Evidence = commands run + output summaries in the structured report. **No playtest claims** — verification is command-level evidence only.
6. **Land** — push to the chunk branch `aep/<id>`; the merge gate lands it on `devin/1760294-asset-experience-program` after the 3-reviewer consensus.

**File-ownership rule:** chunks own disjoint *new* files wherever possible. Shared registries (`renderPackageManifest.js`, `parts_manifest.json`, `modelTruthCensus.json`, `enemies.js`, `fleet.json`, `ASSET_STATUS.json`, `package.json`) may be touched minimally; merge order is serialized and the landing agent resolves conflicts, preferring additive union over replacement.

---

## 5. Chunk decomposition (execution units)

Phases run in order; chunks inside a phase run in parallel. Every chunk gets: implementation agent → gate of 3 successive reviewers → landing agent.

### Phase F — foundation (bring unmerged prior work forward)

| Id | Unit | Scope |
|---|---|---|
| **F1** | Port PR #264 world-placement program | merge `devin/1791689614-world-placement-program` (audit waves 1–2: `sectorLivedOverlays`, `ambientScenes`, `livedWorldRuntime`, ~15 encounters 569–584, sector overlays) onto integration; resolve conflicts; run lived/ambient + contracts tests |
| **F2** | Integrate Lattice Warden | merge `devin/1791167345-lattice-warden` (hull GLB, `latticeWarden.js`, `latticeWardenTethers.js`, encounter `capital-boss/lattice-warden.js`, enemies +40, audio recipes, `fleet.json`, tests, `design/characters/LATTICE_WARDEN.md`); resolve render-package/census/enemies conflicts; `node --test test/lattice-warden.test.mjs` + capital-boss score contract |

### Phase C — asset creation

| Id | Unit | §3 items |
|---|---|---|
| **C1** | Place wholeships | PL-1..20 (20 place GLBs + packages + ≥1 consumer each) |
| **C2** | Parts backlog — combat | PT-A (~28 hull/cockpit/engine/weapon/fin parts) |
| **C3** | Parts backlog — dressing + QUEUE | PT-B + Q1 + Q2 + Q3 (greebles/skids/pods, kestrel/pelican/wasp hull-body repair, claim props, hunter_sig_rails, module_vis, 5–6 landmarks) |
| **C4** | BP-08 pack | BP-8a..e (8 station overlays, 5 landmarks, 3 ring gates, 5 wreck/beacon, 2 hero asteroids) |
| **C5** | Identity hulls | ID-H (police interceptor, prison barge, worker shuttle, pilgrim hulk, 2 capital silhouettes, ice-cutter/sled, racer) |
| **C6** | Civic props + VFX/audio | ID-P + ID-V (stall, hose, banner, buoy, toy kits, duel rings, beacons; fire/thermal/ion VFX; Cut Saw track; radio chatter; crowd liveries; rim fauna) |
| **C7** | Repurpose pool | RP-1..5 adoption |

### Phase P — placement/experience (consumes F1's seams)

| Id | Unit | §3 items |
|---|---|---|
| **P1** | Fields + battles | PP-1 + PP-2 |
| **P2** | Frontage + economy | PP-3 + PP-4 |
| **P3** | Play + camera | PP-5 + PP-6 |

### Phase U — units & placeholders

| Id | Unit | §3 items |
|---|---|---|
| **U1** | New units pack | §3.5 roster (10 units: defs + doctrines + encounters + placement hooks + hull source) |
| **U2** | Placeholder replacements | PH-1..4 |

Chunk sizes are calibrated to one focused agent session each; reviewers check against this spec's item lists, `assets/AGENTS.md` authority, budgets, and the pipeline contract (§4) — plus whether the result could be improved *beyond* spec.

---

## 6. Review-gate protocol (applies to every chunk and to the final packet)

1. The implementation agent lands work on `aep/<id>` and reports `{branch, files, checks_run, gaps}`.
2. **Reviewer 1** audits: spec completeness (every §3 item of the chunk), pipeline-contract compliance, budgets, evidence. Approve → Reviewer 2. Else → a fixer agent resolves findings on the same branch, then a fresh reviewer re-audits.
3. **Reviewer 2** audits code/data quality: conventions, no temp formats (guardrails), CRLF discipline, honest-vs-cosmetic placement, improvement opportunities *beyond* spec. Same fix loop.
4. **Reviewer 3** audits integration risk + experience quality: merge-safety vs. integration HEAD, duplicate/absence claims, whether the result makes the world deeper/less repetitive *better than specified*. Same fix loop.
5. Only when all three reviewers have approved does the landing agent merge `aep/<id>` into `devin/1760294-asset-experience-program`, run the chunk's verification suite on the merged tree, and push.
6. Fix loops are bounded at 3 rounds per reviewer; a chunk that exhausts them is marked **disputed** (findings recorded; program continues; surfaced to the user in the final report).
7. After all chunks land or are disputed, the **final wave gate** runs the same 3-successive-reviewer protocol over `git diff master...devin/1760294-asset-experience-program` against this entire spec. Only when all three agree the packet optimally implements the spec is the program done.

---

## 7. Measurement (what "deeper, less repetitive" means)

- Sector scorecard deltas vs audit baseline (fields, silhouettes, battles, places, economy/crime, Play, camera); every sector ≥ audit-target or gap documented.
- Unique-model coverage: % of placed objects referencing authored GLBs vs placeholder/procedural; placeholder list (PH-*) at zero.
- Queue drain: `needed-assets.md`/QUEUE/§3 item counts before→after; every landed asset has ≥1 consumer.
- Check gates green: `check:assets:live`, `check:asset-status`, `check:asset-reachability`, `perf:gltf`, `node --test` suites touched.
- Evidence discipline: every claim cites a command or file; no unverified "looks better" language.
