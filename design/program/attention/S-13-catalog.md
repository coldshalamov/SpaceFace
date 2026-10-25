# S-13 catalog — Debris/wreck fields

Ledger register: aftermath. Sanctioned detail: named dead, salvage notes, kill-marks.
Joint with board row ATT-S13. Surface files: `src/data/sectors.js`,
`src/data/sectorAnchors.js`, `src/data/frontierRegions/*`, `src/data/uniqueWrecks.js`,
`src/data/wreckAftermathDressing.js`, `src/data/worldOneOffs.js`.

## What the player literally perceives
- Twenty-four wreck/derelict/debris POIs exist across core + frontier cards. Nine already
  carry plates (`poi_driller`, `poi_pwreck`, `poi_cruiser`, `poi_freighter`, the Helios
  yard furniture, `poi_kepler_hulk`, `poi_proteus_hulk`, `poi_hyperion_driller`).
- Ten wreck/derelict POIs have no `discoveryPlate` at all — the player finds a named
  wreck and the journal writes nothing:
  `poi_charon_tether_wreck`, `poi_bounty` (core); `poi_nyx_wreck` (west);
  `poi_rhea_slag`, `poi_haumea_probe`, `poi_eris_wreck` (north);
  `poi_nereid_wreck`, `poi_triton_wreck` (east); `poi_eunomia_hulk`, `poi_eunomia_debris`
  (south).
- Procedural aftermath: `wreckAftermathDressing.js` seeds wreck fields per sector (cap 4,
  battle 6, core 2, skips Helios) — generic family grammar, deliberately no names.
- Unique wrecks (D1–D14) are the rumor→salvage contract — pinned by CANON in
  depth-program-r2-registry; the named dead live in `victimLabel` (ship names, not crews).
- The named-dead surface that already exists: `historyWear.js` memorial rows pull real
  victim names from the loss ledger (runtime-authored); `senna_name` graffiti templates
  fill `{name}` from `story.recoveredNames`. There is no static dead-roll data file —
  "named dead" lands where plates can carry the names.

## What is thin
- The ten unplated wrecks are silent at the discovery moment — no casualty, no salvage
  note, no mark of who fired. The aftermath register (named dead, salvage notes,
  kill-marks) exists in the world's voice (Senna, testimony graffiti) but not at the
  sites themselves.
- No memorial marker sits beside any wreck field — nothing the player can find that says
  "somebody counted these."

## Constraints discovered
- `discoveryPlate` on a POI removes it from the bounty-writ pool
  (`bountyMarks.js:133` — "must not trespass authored content"). Plating an *existing*
  wreck POI shrinks that sector's lair pool — a real gameplay delta. The fix: put plates
  on NEW adjacent memorial/stake POIs beside the wreck sites; the wreck stays a candidate,
  the dead get names. Net pool change: zero.
- UNIQUE_WRECKS slot list is exact-pinned — no new unique wrecks, no drop edits.
- `WRECK_AFTERMATH_*` dressing is a seeded family grammar — extending it means new
  machinery; out of scope. Its rows also carry no copy surface.
- `worldOneOffs` count is pinned at 33 — no new one-offs.
- Frontier POIs need whitelist types (beacon/derelict/wreck) + anchor rows with pos and
  landmarkGlb; plates should still obey the 60–420/3–48 contract.
- Memorial props are legal: `place_memorial_array`, `place_nav_buoy`, `place_ash_pin`,
  `place_tally_post`, `place_dead_hulk`, `place_debris_chunk` — all packaged.

## Additive seams (clean)
- `sectors.js` + `sectorAnchors.js` — memorial POIs beside the two unplated core wrecks
  (`poi_charon_tether_wreck`, `poi_bounty` at Sker) plus one salvage-note marker in the
  Ceres aftermath scatter.
- `frontierRegions/west.js` — memorial beside `poi_nyx_wreck`.
- `frontierRegions/north.js` — memorials beside `poi_rhea_slag`, `poi_haumea_probe`,
  `poi_eris_wreck`.
- `frontierRegions/east.js` — memorials beside `poi_nereid_wreck`, `poi_triton_wreck`.
- `frontierRegions/south.js` — memorials beside `poi_eunomia_hulk`, `poi_eunomia_debris`.
- Every plate names a dead crew member or two (named dead), notes what was stripped
  (salvage note), and where the kill marks read (kill-marks) — the row's three sanctioned
  details per site.
