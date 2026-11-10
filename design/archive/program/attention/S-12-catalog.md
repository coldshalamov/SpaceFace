# S-12 catalog — Landmarks

Ledger register: monumental, mournful. Sanctioned detail: lore plaques, memorial arrays,
pilgrim traffic. Named in the ledger: candle fleet, cathedral, skerris throne. Surface files:
`src/data/sectors.js`, `src/data/sectorAnchors.js`,
`src/data/flavor/080-landmark-lore.js`, `src/data/worldOneOffs.js`.

## What the player literally perceives
- Nineteen physical landmark targets (`080-landmark-lore.js`), each a scan-lore entry with
  `programSlot` C1–C15 (+C13a–e), `targetRef`, `displayName`, location, 3–5 scan lines.
  The sector cards wire them through `flavorTargetRef` + `scannerSignalKind: 'archive'`
  (e.g. `poi_memorial` → `landmark_c3_candle_fleet`, `poi_cruiser` →
  `landmark_c1_wreck_cathedral_concord_vigilant`, `poi_sker_throne` →
  `landmark_c13d_skerris_throne`).
- Hero landmarks get hero scale: Candle Fleet `place_landmark_candle_fleet` at
  placeTargetRadius 100 (sectorAnchors.js:45-48), the cathedral `place_io_reach_wreck` at
  48, Skerris Throne `place_landmark_skerris_throne`.
- Pilgrim/memorial dressing already exists in one place: `oneoff_strut_shrine`
  (worldOneOffs.js) — plates and ribbons on a truss at Ceres — and the Candle Fleet's own
  ritual content (pit-line cache, smear markers, relighting procession).

## What is thin
- Scan lore: twelve of nineteen entries carry only 4 of the 5 allowed lines (test cap is
  3–5, `depth-program-flavor-loader.test.mjs:237`). The entries that most need a fifth
  beat — Obelisk (C2), Vault Maw (C4), the C6–C10 frontier landmarks, most C13 variants,
  Metronome-adjacent C15 — are exactly the ones at 4.
- Pilgrim traffic: the landmarks are monuments with a bare surroundings. Nobody left a
  light. There is one memorial array prop (`place_memorial_array`, shipped and used once
  at the strut shrine) and one mooring prop (`place_nav_buoy`) — but no POI beside a
  landmark carries the "people still come here" read the ledger asks for.
- The three ledger-named landmarks (Candle Fleet, Wreck Cathedral, Skerris Throne) each
  sit alone at their anchor; the Vault Maw is similarly bare.

## Constraints discovered
- landmark_lore `entries` array is exact-pinned by `programSlot` deepEqual
  (LANDMARK_TARGETS) — no new entries. But `lines` inside an entry are count-tolerant up
  to 5; ids stay `c<slot>_<nn>` unique.
- `WORLD_ONE_OFFS.length === 33` is exact-pinned (world-one-offs.test.mjs:25) — no new
  one-offs this row.
- `discoveryPlate` ⇒ bounty-mark-ineligible; all dressing additions are new POIs (pool
  neutral).
- POI `chartNote` is a station-only render path — plates are the prose seam on POIs.
- `sectors.js` has the foreign `appendSectorWonderPois` hunk — add inside `pois:` arrays
  and `sectorAnchors.js` pois blocks only.

## Additive seams (clean)
- `flavor/080-landmark-lore.js` — append one scan line (`*_05`) to each four-line entry:
  C2, C4, C6, C7, C8, C9, C10, C13a, C13b, C13c, C13e, C15. Twelve lines, no entry-count
  change, all stay within the 3–5 contract.
- `sectors.js` + `sectorAnchors.js` — memorial-array / pilgrim-mooring POIs beside the
  Candle Fleet (Helios), Wreck Cathedral (Io), Skerris Throne (Sker), Vault Maw (Ashfall).
  New POIs carry `discoveryPlate` prose in the monument register; anchors carry the
  packaged props (`place_memorial_array`, `place_nav_buoy`, `place_ash_pin`).
