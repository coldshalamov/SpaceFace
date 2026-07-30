# assets/concept/ — Reference Art (NOT Runtime)

> **REFERENCE ONLY.** Nothing in this tree is loaded by the game at runtime. It exists so artists
> and agents know the target look before authoring Blender GLBs or new portrait gens.
>
> **Machine index:** `assets/concept/index.json` (concept_id → path → `blender_part_id` / sector placement).
> **Pipeline doc:** `design/world-identity/PIPELINE.md` (cited in index.json).
> **Generation ledger:** `VISUAL_ASSET_PLAN.md` (historical IDs; not implementation authority).
> **Graphics quality route:** `docs/visual-assets/README.md`; generated-reference handoffs are in
> `docs/visual-assets/AGENT_PROMPTS.md` §§ E–F.

---

## Status

| Field | Value |
|---|---|
| Bundled in release | ❌ Not in `BUNDLED_ROOTS` |
| Runtime references | ❌ None in `src/` or `styles/` |
| Safe to browse for mood | ✅ |
| Safe to wire into gameplay | ❌ **Never** — use authored GLBs or `assets/portraits/` instead |

---

## Folder layout

| Subfolder | Contents | Typical use |
|---|---|---|
| `archetypes/` | Station/gate archetype mood boards | Silhouette and material reference for `place_station_*` / `place_gate_jump_ring` GLBs |
| `sectors/` | Per-sector overview paintings | Landmark/station placement briefs |
| `cities/` · `landmarks/` | Named location identity | Future landmark GLBs (`assets/QUEUE.md`) |
| `ships/` | Ship silhouette concepts | Blender wholeship/hull authoring briefs — **not** the live `wholeships/*.glb` files |
| `people/` | NPC mood references | Portrait generation briefs → export to `assets/portraits/` |
| `factions/` | Faction visual grammar | Palette/trim hints for `FACTION_PALETTES` + ship accents |
| `planets/` · `styles/` | Environment/style bibles | Background/nebula tone references |
| `map/` | Universe chart art | Starmap UI direction (UI uses procedural/DOM today) |

---

## Concept → live asset mapping

`index.json` ties concepts to intended asset roles. It does not prove the target is built, accepted,
released, or wired. Verify exact status through the ship/place manifest, release manifest, runtime
maps, asset checks, and current captures.

**Promotion path:** concept JPG → Blender export → `assets/ships/parts/` → finalize → release build → `parts_manifest.json` + `partsLibrary.js`.

Concept comparisons may use silhouette overlap as a diagnostic, but no universal numeric similarity
threshold proves quality. Promotion depends on the asset's intended role, player-camera silhouette,
material/readability review, runtime validation, and measured performance.

---

## Agent rules

1. **Do not** add `assets/concept/` paths to `src/` — `check-asset-reachability` will flag NOT BUNDLED.
2. **Do not** substitute a concept JPG for a missing GLB — flight will look wrong and bypass the asset contract.
3. **Do** read `index.json` before authoring a new `place_*` or hull to find the approved mood reference.
4. **Do** copy the *look* into Blender/portrait outputs under the proper live folders (`ships/parts/`, `portraits/`).
5. **Do** record prompt, input/output hashes, tool/model when exposed, selected/rejected traits, and
   license/provenance for generated references. If the selected generation method is unavailable,
   use the bounded Codex terminal handoff rather than a text-only substitute.

---

## Related live assets (where concepts land)

| Target type | Live location | Registry |
|---|---|---|
| Stations/places | `assets/ships/release/parts/places/` | `partsLibrary.js` `PLACE_FILES` |
| Modular hulls | `assets/ships/release/parts/hulls/` | `HULL_FILE_BY_DEF_ID` |
| Bar portraits | `assets/portraits/*.jpg` | `src/data/portraits.js` |
| Menu/codex stills | `assets/cinematics/C-INTRO-*.jpg` | `uiRoot.js`, `codex.js` |

See `assets/AGENTS.md` for asset-class and promotion routing.
