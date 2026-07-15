# P1 — Sector Signature Landmarks

**Thread:** depth-P1 · **Reads:** `00_DEPTH_PROGRAM.md`, `assets/AGENTS.md`, `assets/ships/AGENTS.md`, `design/spec3/SPEC3-F9-asset-pipeline.md` · **Status:** PLAN
**Thread pitch:** Every named zone in the galaxy currently dresses itself from the same ~13 shared prop meshes. A player flying through three sectors recognizes the same `place_dead_hulk`, the same `place_nav_buoy`, the same `place_conveyor_barge` — only the fog color changes. This pipeline produces **one bespoke hero landmark per signature named zone** so places read as places. It is the spatial pipeline that makes both story beats (P2) and faction identity (P3) land in real, memorable locations.

---

## Ground truth (verified against the working tree 2026-07-12)

- **Place-GLB runtime registry:** `src/render/partsLibrary.js:59-75` — the flat `PLACE_FILES` array. A new place GLB **must** be appended here to resolve at runtime. `PLACE_FILE_BY_ID` (line 76) is derived from it. `STATION_ARCHETYPE_FILES` (line 44) is the parallel list for station bodies.
- **Loading path:** a place prop spawns as an `fx` entity with `data.placeId` (e.g. `'place_lane_beacon'`). `partsLibrary.js` builds a procedural fallback (`buildFallbackPlaceProp` line 807), wraps it, then async-swaps in the authored GLB via `loadAuthoredPart`. A **broken or missing GLB silently falls back to procedural geometry — no error.** So "it renders" is not proof the authored asset is wired.
- **Three asset registries (all required for a wired asset — `assets/AGENTS.md` §3):**
  1. `assets/ships/parts/parts_manifest.json` — authoring source of truth. Add a `parts[]` entry with `category: "places"` and append to `runtimeSlots.place`.
  2. `assets/ships/release/release_manifest.json` — auto-written by `scripts/build-sg04-release-assets.mjs`. **Do not hand-edit.**
  3. `src/render/partsLibrary.js` — `PLACE_FILES` (line 59) for runtime resolution.
- **Placement / dressing:** `src/systems/world.js:1209-1345`. `_spawnDressing(sector, active, rng)` dispatches on palette-class to one of four functions (`_spawnCoreDressing` / `_spawnBeltDressing` / `_spawnFringeDressing` / `_spawnAnomalyDressing`), each calling `_spawnPlaceProp(active, sector, placeId, pos, options)` (line 1347). POI-anchored landmarks use the `landmarkGlb` + `landmark: true` fields on POI entries (e.g. `src/data/frontierRegions/west.js:320`) — the POI spawn path (`world.js` ~line 1200) already stamps these.
- **Performance metadata:** manifest limits are profiling alarms and packaging safeguards, not visual targets. Choose geometry, materials, textures, LODs, and compression from screen-space need; preserve quality by optimizing draw structure, reuse, culling, and representation before removing visible detail.
- **Pre-queued landmark slots:** `assets/QUEUE.md` already reserves hero slots — `landmark_beacon_spire`, `landmark_wreck_cathedral`, `landmark_veil_obelisk`, `landmark_pit_anchor`, `landmark_vault_maw`, `landmark_tower_crown`. **This pipeline actualizes that queue.** Any numeric estimates in the queue are planning history, not visual ceilings.

Current asset status comes from the live manifests and runtime maps, not this plan. Merge static detail into sensible material/animated roles and validate representative scenes with the current asset and performance checks.

---

## §1. Why

24 sectors carry authored named zones — "Cruiser Graveyard" (`zone_io_derelict`, `sector_io_reach`), "The Veil Anomaly" (`zone_veil_anomaly`, `sector_veil_nebula`), "Iron Maw Approach" (`zone_ashfall_approach`, `sector_ashfall_reach`) — but every `wreck`/`derelict`/`derelict_field` zone gets the same generic `place_dead_hulk` / `place_debris_chunk`. The zone's *name* promises a hero asset; the *screen* delivers a shared prop. This is the single biggest "feels repetitive" driver in the spatial layer, and it's cheap to fix: the assets are pre-queued, the wiring seams exist, and one agent can ship one landmark per iteration.

## §2. The design

A "signature landmark" is **one bespoke GLB placed at one named zone**, tied to that zone's faction and (where applicable) a story beat. The pipeline runs per-landmark:

- **Step 1 — Pick a target** from the backlog (§5). Priority order is story-beat-tied first (they stage P2).
- **Step 2 — Author the GLB** in Blender per the current asset pipeline. Spend detail where it affects silhouette, material response, scale, interaction, or close exposure; merge static detail into sensible material/animated roles. Use runtime material roles when they serve the art direction, extending the documented contract when a stronger result requires it. Filename: `place_landmark_<name>.glb` under `assets/ships/parts/places/`.
- **Step 3 — Register in all 3 registries:** add `parts[]` entry (category `places`) + `runtimeSlots.place` append in `parts_manifest.json`; append to `PLACE_FILES` in `src/render/partsLibrary.js:59`. (Release manifest is auto-written.)
- **Step 4 — Wire placement** at the target zone. Two clean seams (§3 details both):
  - (a) For a POI-anchored landmark: set `landmarkGlb: 'place_landmark_<name>'` + `landmark: true` on the POI entry in `sectorAnchors.js` (core) or the matching `frontierRegions/*.js`.
  - (b) For a zone-center landmark: add a spawn call in the matching `_spawn*Dressing` function (`world.js:1209-1345`) gated on the zone's presence (the dressing functions already spawn relative to anchors — copy that idiom).
- **Step 5 — Prove it.** Run `npm run check:asset-reachability`, `npm run check:assets:live`, `npm run check:asset-status`. Screenshot the landmark in-play into `.devshots/` (default game path, no probe special-casing). Run the no-regression floor.

## §3. Architecture & wiring (touch files)

| Touch | Purpose | Notes |
|---|---|---|
| `assets/ships/parts/places/place_landmark_<name>.glb` | new authored asset | Blender export per SPEC3-F9 |
| `assets/ships/parts/parts_manifest.json` | add `parts[]` + `runtimeSlots.place` | registry 1 of 3 |
| `src/render/partsLibrary.js:59` | append to `PLACE_FILES` | registry 3 of 3; release manifest (2) auto-writes |
| `src/data/sectorAnchors.js` **OR** `src/data/frontierRegions/{west,north,east,south}.js` | set `landmarkGlb` + `landmark:true` on the target POI | seam (a); prefer this for POI-anchored landmarks |
| `src/systems/world.js` (`_spawn*Dressing`, ~1209-1345) | add a placement call gated on the target zone | seam (b); for zone-center landmarks without a POI anchor |
| `.devshots/` | screenshot pair (default game) | acceptance evidence |

Keep the change coherent and scoped to the landmark. Do not hand-edit generated release manifests. Before editing shared asset or render integration, verify current ownership signals and coordinate only with genuinely active work.

## §4. Key code — faction tint flows through `paletteFor`

A landmark gets its faction tint automatically if it spawns as a place prop with `factionId`. `_spawnPlaceProp` (`world.js:1353`) already sets `factionId: sector.factionId || null` and `data.paletteClass`. The authored GLB then tints via:

```js
// src/render/partsLibrary.js:3110 — the runtime tint resolver
function paletteFor(entity) {
  const faction = entity.factionId && FACTION_PALETTES[entity.factionId];
  if (faction) return { hull: faction.hull||faction.primary,
                        accent: faction.accent||faction.primary,
                        thruster: faction.thruster||...,
                        dark: faction.secondary||'#111820' };
  // ... team 0/1 / grey fallbacks
}
```

**Implication for the GLB author:** use the material slot convention `Material_Hull` / `Material_Accent` (and `Material_Emissive` for glow). The runtime classifier (`partsLibrary.js:2755`) maps these to `tintRole`s and applies the faction palette. So one GLB reads as Concord-blue in Helios and Vael-green in the Veil without re-authoring — *if* the slots are named correctly. This is how P1 and P3 (Faction Kits) compose.

## §5. Assets & generation — the landmark backlog

Priority order = story-beat tie-in first (stages P2), then faction-distinctiveness, then place-evocativeness. Each row is one iteration.

| Pri | Landmark (file name) | Target zone (file:line) | Sector | Faction | Implied hero asset | QUEUE slot |
|---|---|---|---|---|---|---|
| 1 | `place_landmark_wreck_cathedral` | `zone_io_derelict` — `sectorZones.js:161` | io_reach | free | Broken Concord cruiser hull, split superstructure | `landmark_wreck_cathedral` ✓ |
| 2 | `place_landmark_veil_obelisk` | `zone_veil_anomaly` — `sectorZones.js:206` | veil_nebula | vael | Alien anomaly construct the Vael guard | `landmark_veil_obelisk` ✓ |
| 3 | `place_landmark_pit_anchor` | `zone_helios_memorial` — `sectorZones.js:87` | helios_prime | scn | Memorial beacon to the lost Pit convoy (story beat) | `landmark_pit_anchor` ✓ |
| 4 | `place_landmark_vault_maw` | `zone_ashfall_vault` — `sectorZones.js:219` | ashfall_reach | vael | Sealed records cache — endgame goal (story beat) | `landmark_vault_maw` ✓ |
| 5 | `place_landmark_iron_maw` | `zone_ashfall_approach` — `sectorZones.js:216` | ashfall_reach | vael | The Iron Maw dreadnought holding the approach (named boss) | (new) |
| 6 | `place_landmark_drill_rig` | `poi_hyperion_driller` — `west.js:289` | hyperion_cut | dmc | Collapsed mining drill rig | (new) |
| 7 | `place_landmark_colony_barge` | `zone_charon_colony` — `sectorZones.js:180` | charon_expanse | free | Struggling colony barge trading air/salvage | (new) |
| 8 | `place_landmark_scar_battlegroup` | `poi_kepler_hulk` — `west.js:407` | kepler_scar | reach | Scarred battlegroup wreck → pirate bazaar | (new) |
| 9 | `place_landmark_echo_shrine` | station Echo Shrine — `north.js:259` | phoebe_echo | vael | Vael relic shrine / resonance site | (new) |
| 10 | `place_landmark_well_mouth` | `poi_proteus_hulk` — `east.js:194` | proteus_well | quiet | Smuggler "well-mouth" hulk landmark | (new) |

**First worked example (the template):** priority 1, `place_landmark_wreck_cathedral` at `zone_io_derelict`. A split-hull cruiser silhouette with authored hull/accent/emissive material roles, placed via the zone's existing POI/wreck anchor. Choose geometry and LOD from the landmark's actual exposure and measured scene cost. This proves the full pipeline end-to-end.

## §6. Libraries / tooling

- Blender + the SpaceFace export script (`assets/ships/parts/blender/` authoring + `spaceface_export.py` per SPEC3-F9-37). Build-time only — no runtime dep.
- Check scripts (existing): `scripts/check-asset-reachability.mjs`, `check-assets-live.mjs`, `check-asset-status.mjs`, `check-parts-manifest.mjs`. **No new check required** for P1 — the existing asset checks are sufficient. (If a landmark-specific reachability gap emerges, model a new `scripts/check-landmark-wiring.mjs` on `check-asset-reachability.mjs`, but don't pre-build it.)

## §7. Build plan (per iteration)

1. Check current asset/Blender ownership signals. If another process actively owns an overlapping path, choose a non-overlapping target or coordinate the handoff; a stale marker is not permanent ownership.
2. Author `place_landmark_<name>.glb`, review it in engine at its actual exposure distances, and iterate against visible defects.
3. `git add -N assets/ships/parts/places/place_landmark_<name>.glb` immediately.
4. Register: append `parts[]` + `runtimeSlots.place` in `parts_manifest.json`; append to `PLACE_FILES` in `src/render/partsLibrary.js:59`.
5. Wire placement: set `landmarkGlb` + `landmark:true` on the target POI (seam a), OR add a gated spawn call in the matching `_spawn*Dressing` (seam b).
6. Run acceptance: `npm run check:asset-reachability` green · `npm run check:assets:live` green (failureCount: 0) · `npm run check:asset-status` · `npm run check:visual-stability`.
7. Screenshot the landmark in-play into `.devshots/` (default game path — no probe special-casing, Wired Feature Policy).
8. Run the no-regression floor: `npm run check:sim:compare` (hashEqual:true) + `node scripts/check-tether-gameplay.mjs`.
9. Update the QUEUE row status and this doc's `**Status:**` line.
10. Print the 10-line summary.

## §8. Anti-patterns

- **DON'T** wire a landmark that silently falls back to procedural geometry and call it done. A broken/missing GLB renders *something* — verify the authored asset actually loads (`check:assets:live` failureCount:0 + screenshot).
- **DON'T** treat a triangle count as either a quality target or an automatic reason to reduce visible quality. Profile representative scenes and solve actual bottlenecks structurally.
- **DON'T** hand-edit `release_manifest.json` — it's auto-written by the release build.
- **DON'T** place a landmark on a bare radial ring — use the existing anchor-relative placement idiom (`offsetAlongRadial`, `polarOffset` relative to gate/station/field/POI). A landmark floating in empty space feels wrong.
- **DON'T** author one GLB per faction tint — use `Material_Hull`/`Material_Accent` slots and let `paletteFor` tint at runtime. One asset, many factions.
- **DON'T** roll an existing asset back to "fix" a perf or asset-structure conflict during another graphics lane — report it (AGENTS.md §6 Concurrent-agent ownership).

## §9. Ambition ceiling

Each signature landmark is also a **story stage**. Once P2 (Story-Beat Embodiment) is running, a landmark gains: an authored comms beat fired on `sector:enter`, a scan interaction (`scan:completed`), a tied encounter (`encounterDirector`), and possibly a wreck class (`wreckClasses.js`) with its own salvage pool. The landmark is the *anchor*; the story is the *activity*. Beyond even that: a small number of landmarks (3–5) could become **player-claimable** via the existing `claimableBodies.js` system — the Cruiser Graveyard as a salvage claim, the Vault Maw as an endgame objective. That's the ceiling; don't build it in P1, but author landmarks that *could* support it (sensible bounds, a clear focal point).

---

## Dispatch block (copy into the agent thread)

> **You are THREAD depth-P1 — Sector Signature Landmarks only.**
>
> Read in order: root `AGENTS.md` · `design/depth-program/00_DEPTH_PROGRAM.md` · this file · `assets/AGENTS.md` · `assets/ships/AGENTS.md` · `design/spec3/SPEC3-F9-asset-pipeline.md`. Then stop reading and do the work.
>
> **Target landmark:** `<LANDMARK_ID>` (e.g. `place_landmark_wreck_cathedral` at `zone_io_derelict`, `sector_io_reach` — see §5 backlog row).
>
> **Concurrency:** verify whether any lock/build marker belongs to a live overlapping process. Coordinate active overlap; ignore stale residue after confirming it is stale.
>
> **Do:** author and review the GLB at its real in-game exposure, register it through the current manifest/build/runtime path, wire placement at the named zone, screenshot into `.devshots/`, and run the named acceptance checks.
>
> **FORBIDDEN:** `git checkout .` / `git reset --hard` / `git stash` / `git clean` / `git restore` on tracked files (AGENTS.md §3). Editing `release_manifest.json` by hand. Editing legacy `flight.js`/`ai.js`/`flightDynamics.js`. Silent procedural fallback masquerading as "done." Hand-editing `test/*.expected.json`. Touching another lane's files (§3).
>
> **Acceptance:** `npm run check:asset-reachability` green · `npm run check:assets:live` green (failureCount: 0) · `npm run check:asset-status` · `npm run check:visual-stability` · `npm run check:sim:compare` (hashEqual:true) · `node scripts/check-tether-gameplay.mjs` · screenshot pair in `.devshots/`.
>
> Report what landmark shipped, where it is placed, observed runtime cost, which checks pass, screenshot paths, and any known follow-up work. Do not optimize for a fixed line count.
