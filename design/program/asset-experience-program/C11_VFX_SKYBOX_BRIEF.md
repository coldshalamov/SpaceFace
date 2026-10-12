# C11 chunk brief — VFX parameter sets, Cut Saw landmark, Ringworld Arc skybox

Chunk: `c11-vfx-skybox` (spec §5 row C11). Branch: `aep/c11-vfx-skybox`.
Items: ID-V (fire-front, thermal-plume, ion-storm VFX parameter sets), ID-L (Cut Saw
monumental landmark, Hyperion Cut), ID-S (Ringworld Arc skybox/backdrop artifact, Sedna Dark).

## Pipeline decisions (per spec §4: specify during brief which system draws it)

- **ID-V → the environmental-weather/field pipeline.** The parameter sets live in
  `src/data/environmentVfxProfiles.js` (`ENVIRONMENT_VFX_PROFILES`), a frozen registry of the
  three authored presentation parameter blocks (tint/accent/edge tint, particle-burst
  multipliers, and fire_front's `scorch` band spec). A `WEATHER_VOLUMES` row in
  `src/data/environmentalMachinery.js` carries a `vfxProfile` id onto both the volume and its
  field spec; `normalizeField` (fieldKernel) passes it through and `fields.js _publish` puts it
  on the live record, so `fieldForcePresentation` styles each front from the parameter set
  rather than the generic kind signature. Mechanics are unchanged — sheets still bend shots
  and shove traffic on the shared warning/surge/calm cycle; the parameter sets are
  presentation-only. Ion storms use `hazardType: 'nebula'` so `scanScale` 0.4 inside is the
  radar kill the front promises; fire fronts and plumes use `debris_current` (physics hazard).
  The "scorched-rock decal" (audit row 12) ships as the fire front's `scorch` band: a charred
  strip the front draws along its own outer edges — the burnt ground line it leaves against
  the rock, rendered through the same swept-surface machinery, not a texture asset.

  Volumes: `vesta_fire_front`, `rhea_fire_front` (sheets); `vesta_thermal_plume`,
  `rhea_thermal_plume` (cones); `eris_ion_storm`, `nyx_ion_storm` (sheets). Sectors
  `sector_rhea_cinder`, `sector_eris_margin`, `sector_nyx_march` join `WEATHER_SECTOR_IDS`.
  Positions are authored clear of stations, gates, ore fields, hazards and named POIs in
  `frontierRegions/*.js` / `sectorAnchors.js`.

- **ID-S → the deep-field backdrop pipeline.** The Ringworld Arc is `structures[]` art, not a
  GLB: a new `ringworld_arc` painter in `src/render/deepFieldStructureArt.js` (deterministic
  authored canvas art, same contract as `relay_mast`/`derelict_hauler`) carried by a new
  `sedna_ringworld_arc` recipe in `src/render/deepFieldStructureRecipes.js`. A new
  `PER_SECTOR_RIGS.sector_sedna_dark` rig (base `anomaly`, bespoke cold lantern lighting)
  forks `background.structure.recipeId` to that recipe — the Arc hangs in Sedna's sky and
  nowhere else; `signatureHero: null` because the Arc IS the hero. The rig merge was extended
  one level: `rig.structure` now merges onto the family's `background.structure` (sky plate,
  paintedSky, intensity stay inherited). `poi_sedna_ringworld`'s
  `flavorTargetRef: 'landmark_c11_ringworld_arc'` names this artifact.

- **ID-L → the Forge landmark pipeline.** `place_landmark_cut_saw` is authored in
  `tools/blender/forge/ships/place_landmark_cut_saw.py` (fleet.json entry, layout `place`,
  `new_place: true`, own sockets). Design: a monumental tracked saw rig mid-stroke on a
  moonlet it is slicing in two — twin rock halves with sawn kerf faces, a railed track bed, a
  gantry carriage carrying a 30 m toothed blade, coolant spray bar, spoil heaps, survey mast
  and kerf-side work lamps. The Caved Shaft (`poi_hyperion_driller`) sits at the bottom of the
  same open cut. Preview GLB builds cleanly: **lod0 32964 tris** (landmark Forge class, inside
  the manifest `trianglesPerLandmark` fence). The release GLB is **pending_render**: the
  preview binary proves the script but the release publish chain (parts GLB + release
  manifest + generated wiring registries) is deferred per the spec's fallback; the manifest
  entry is `status: 'blocked'` / `ASSET_STATUS.json` `BLOCKED` with `pending_render` notes,
  and no wired registry (PLACE_FILES, runtimeSlots, landmarkGlb POI anchors,
  renderPackageManifest, modelTruthCensus, release_manifest) references it.

## Gates named by this brief

- `npm run check:visual-stability` (spec card gate)
- `npm run check:authored-place-runtime` (spec card gate)
- **PostFX/backdrop gate (this brief's pick):** the deep-field/backdrop shard —
  `node --test test/deep-field-structure-recipes.test.mjs test/sector-visual-profiles.test.mjs
  test/deep-sky-plate-pipeline.test.mjs test/space-background-sector-transition.test.mjs`
- Touched seams: `node --test test/environmental-weather.test.mjs` (volume roster + physics),
  `npm run check:asset-status` (blocked-asset wiring fence), `npm run check:vfx-techniques`
  (glow-card inventory ratchet — no new card constructions were added; the scorch band rides
  the existing swept-surface member).

## Evidence

- `blender -b --python tools/blender/forge/ships/place_landmark_cut_saw.py` →
  `[forge] ... preview/place_landmark_cut_saw.glb place lod0 tris=32964 sockets=own`
  (Blender 5.2.2, installed via choco on this VM; preview artifact is gitignored).
- `fleet-look.mjs` renders: `.devshots/forge-cut-saw/` (inspect/close/top).
- No playtest claims: sim-side changes are weather-volume data + a publish-side prop; visual
  claims are limited to the fleet-look stills and the deep-field painter's bake contract.
