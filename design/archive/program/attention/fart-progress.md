# devin-fart — faction-art seam progress (build_map §1C lane `faction-art`, rows 495/512/514/543)

Session started 2026-10-25. Task: land the four open faction-art rows, one at a time,
smallest honest scope first. Per row: complete unit OR honestly landable data/kit portion +
PARTIAL mark naming the precise gap. Follow the forge pipeline exactly (fleet.json bindings,
publish.mjs promotion, census/validation). Pathspec commit + push per row; LANDED_REVIEW row
each; board cells updated honestly.

Blender: `C:\Program Files\Blender Foundation\Blender 5.1\blender.exe` (5.1.2) — `blender`
is NOT on PATH; set `BLENDER` env for publish.mjs.
Shared-tree caution: devin-infb is live in the same generated pipeline (fleet.json,
parts_manifest.json, release/, pilots.json, renderPackageManifest.js, modelTruthCensus).
Preserve their dirty work; pathspec-commit only my paths.

## Current-state survey (done 2026-10-25)

- **495 (rocks, §33.2 + 05 §2):** data layer landed already — `src/data/rockSubstances.js`
  defines ROCK_BODIES = 8 substances × 3 sizes (pebble/boulder/monolith). Art side: only
  5 authored rocks exist (place_asteroid_rock_a/b/c, seamed, graffiti). Runtime field rocks
  are procedural displaced icospheres (visualFactory AST_TYPE, instanced pool); debris
  spawns never consult placeId — authored GLBs are consumed via authoredPlaces /
  claimableBodies / swarmArenaLadder placeIds rosters.
- **512 (station kits, §34.4 + 05 §5):** 7 station archetypes published; overlay mechanism
  exists ONLY for trade_hub (`TRADE_HUB_OVERLAY_FILE_BY_FACTION` in partsLibrary.js):
  free/mts/scn overlays live. 11 factions have no kit; other archetypes have no overlay
  routing at all.
- **514 (hull kits, §34.5 + 05 §4):** pattern = `tools/blender/forge/variant.py` palette
  variants + `*_FACTION_KIT_BY_FACTION` swaps in `applyFactionWholeShipKit`
  (partsLibrary.js ~1985-2116). Live: span→{dmc,mts,reach}, wasp→{free,mts,scn},
  rig→{quiet}, cradle→{dmc}; hostile-id routed: hornet_scn, wasp_quiet_ghost,
  dart_choir, lode_vael. Missing kits: helix, fulfillment, archive, pitborn (junk),
  understory (overgrowth), vergelayers. Every faction shipRole hullId is a player hull id.
- **543 (faces, §34.8 + 05 §6):** portraits.js has 8 canon keys; assets/portraits has
  ~21 jpgs + locals pool (7 roles × 8, barkeep 16). Missing canon: sula_dree, callum
  (oakes), wex, sump (witness/elroy/vale deliberately unshown). 11 new faces (03 §4.2):
  all missing. Culture pools (03 §2): 8 cultures × 8 faces — none exist; LOCAL_PORTRAIT_POOL
  is role-keyed, culture pools need a parallel mechanism. Generation route:
  `codex exec -m gpt-5.5` via `tools/art/imagegen_variants.py` + `cut_portraits.py`
  (proven on this box 2026-10-03).

## Row ledger

| Row | Status | Landed sha / gap |
|---|---|---|
| 495 24-body rock family | PARTIAL — landed 1ae25fa430 | gap: instanced field-rock pool still procedural (render-lane reroute); authored family owns debris/hero/claim bodies |
| 512 fourteen station kits | OPEN | — |
| 514 hull kits + Overgrowth/junk | PARTIAL — landed b2e766b27a | all six uncovered factions kitted on their dominant live hulls; gap: off-kit hulls in the same factions (helix security Wasps, understory arbitrary loss-ledger hulls, choir pilgrim transports) still production paint |
| 543 portrait pools | OPEN | — |

## Working notes / decisions

- Kit coverage rule (514): a variant kit is authored on the hull each faction actually
  fields live — `src/data/factionPresence.js` plans are the guaranteed-hull authority
  (archive courier = Drifter at Pallas, pitborn yard tender = Ironback at Ashfall/Vesta/
  Ceres, verge prisms = Ranger), `shipRoles` in `src/data/factions/*.js` covers berth
  keepers/missions/conflicts. New `*_FACTION_KIT_BY_FACTION` maps in partsLibrary hang the
  kit off the resolved base file keyed by `entity.factionId`; the player is faction_free
  and stays production paint. `variant.main` bakes any `*_bank` attr (Kestrel uses
  `ani01_bank` — the old ani38-only guard silently shipped a bankless MOTION_ hull).
- Rock ids: `place_rock_{substance}_{pebble|boulder|monolith}` — 24 forge place GLBs;
  shared builder `tools/blender/forge/rock_family.py`, thin per-body ship files.
- Live-wiring plan for rocks: swarmArenaLadder `placeIds` rosters (census-validated) +
  claim sites where substance matches sector fiction. Full reroute of the instanced
  procedural field to authored bodies is render-lane (L-PICTURE) scope — record as the
  residual gap, not silently claimed.

## 2026-10-25 — row 495 mid-flight

Landed so far (uncommitted):
- `tools/blender/forge/rock_family.py` shared deterministic builder + 24 thin ship files
  `place_rock_{sub}_{pebble|boulder|monolith}.py` — 8 substances × 3 sizes, seeded faceted
  `stone` cores + substance signature (veins/rime/fissures/spikes/welds).
- 24 fleet.json place entries + 24 parts_manifest rows (synced: tris/bytes/bounds filled).
- 24 source GLBs in assets/ships/parts/places/ + 24 release GLBs (release manifest updated).
- pilots.json: 24 new pilots; render packages rebuilt (388); model-truth census regenerated
  (24 rock rows present).
- Live wiring: swarmArena `_spawnDebrisRock` stamps substance (env-material → substance map;
  slag rides rock slot; wreck-material slots stay hulls) + authoredGeologySkin placeId sized
  to the spawn radius; applyRockSubstance owns restitution/break/density. world.js field hero
  now picks `place_rock_<sub>_<class>` by the slot's deterministic substance roll (falls back
  to legacy authoredPlaceId). saveEnvelopeSectorWarm warms the same substance at midpoint
  class. claimableBodies retargeted: 14 sites → family bodies matching sector substance
  (junk pebble/boulder/monolith covered — junk never rolls in the debris rotation).
- Fixed pre-existing red: worldSiteAssetBindings sp07 pin stale since 427da4f27c.
- Known pre-existing red (NOT mine): check-atlas-integrity proxyAssetsAvailable
  (place_io_reach_wreck/customs_pylon/comms_array/haumea_fracture_mouth/hush_gap — GLBs never
  landed); rock-surface-library renderer source regex; check-parts-manifest fails on
  devin-infb's rhea/proteus GLBs until their manifest rows land.
## 2026-10-26 — row 495 landed (PARTIAL)

Second pass finished the mid-flight list:
- Look-bench stills reviewed (8 substances shot place+close). Found one real defect:
  substance dressing (glints/embers/sheens/fissures/lamps, plus veins) sat at fixed lifts
  (0.86–0.92·r) while `F.rock` displaces the surface to k≈0.80±0.24·r — parts floated past
  the silhouette in hollows. Fix: `_lump_k`/`_surf` in rock_family.py recompute the seeded
  broad-lump term (inverse of the mesh's seed·1.7 Z-rotation, minus the core's −0.12·r sink,
  clamped under the quarry cut face) so every dressing part hugs the actual displaced
  surface. Rebuilt all 24, republished, re-shot: embers/glints now read as seated seams.
- Re-ran focused tests after rebuild: zc-a34 25/25, crucible-swarm-arena 17/17,
  rock-family+rock-core+census+world-site 15/15, check-parts-manifest 7570 ok/0 fail,
  release-manifest-pins 388 consistent. rock-surface-library keeps its ONE pre-existing
  renderer-regex failure (renderer.js untouched; same failure at HEAD).
- Row status: PARTIAL, not DONE — the authored family is now the runtime body for every
  authored-rock slot (swarm debris, field heroes, claim sites), but the massed instanced
  field-rock pool still draws procedural geometry. That reroute is render-lane
  (L-PICTURE/rock-surface) scope: thousands of instances per field need an instancing path
  for authored GLBs, not 24 cloned roots.
