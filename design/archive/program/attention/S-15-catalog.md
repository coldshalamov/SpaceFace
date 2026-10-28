# S-15 catalog — The Bolus

Ledger register: viscera interior + The Swallowed Rib station — organic. Sanctioned detail:
organ dressing, rib-station texture, harvest flavor. Surface files: `src/data/theBolus.js`,
`src/data/bolusLore.js`, `src/data/bolusPlay.js`, `src/data/sectorAnchors.js` (merges
`BOLUS_ANCHORS` at line 312), `src/data/sectors.js:851` (card mount).

## What the player literally perceives
- An `interiorHost` sector (`theBolus.js`): one research station (`station_bolus_rib`,
  "The Swallowed Rib", chartNote already authored — "Concord files this volume as Lane
  Contamination"), one empty grit field (`f_bolus_grit`, count 0 — a dressing anchor,
  not a minable field), zero hazards, one POI (`poi_bolus_charon_buoy`, a beacon —
  NO discoveryPlate, no GLB).
- A pinned deterministic interior: `planBolusLayout(1)` = 99 rows — 14 knobs, 3 mouth
  lanterns, 4 motes, a false lip ≥1800 mass, scale/pearl roles (bolus-lore.test.mjs).
- Three named zones: Cartilage Road, The Lumen, The Cough — each with an authored
  `reason` already in register.
- `bolusPlay.js` nursery coords (-560,-400), berth (-980,-900), school/fingerling radii —
  the biology lives in those constants; no named place on the chart says so.
- `BOLUS_LORE` carries twenty keyed toast lines (chart/stitches/wall/acid/iris/tooth/
  light/drum/film×3/hush/comb/shy/breath/grit/ring/pearl/pearlShut/scale/lip) — every key
  flag-triggered; untriggered keys are dead text.

## What is thin
- The interior has exactly one POI in a 5,000+ WU gut. The Cough — "what the gut would
  not keep is piled here" — is a named zone with zero physical find inside it. No
  swallowed hull, no dead crew, no harvest trace.
- The station's work (gullet harvest, research berth) has no adjacent dressing: no
  watch buoy, no specimen pin.
- The buoy POI carries no plate — its own name is the whole discovery.
- `bolusPlay` names a nursery volume that no zone, POI, or text ever calls by name.

## Constraints discovered
- The 99-row layout is exact-pinned: do NOT touch `planBolusLayout` inputs, body tables,
  or `BOLUS_LORE` keys (every key is flag-triggered and test-pinned; new keys would be
  dead text).
- `BOLUS_ANCHORS.pois` merges into SECTOR_ANCHORS — new bolus POIs need anchor rows
  there; `sector-geography.test.mjs` pos rule applies.
- POI type whitelist for frontier-style checks covers beacon/derelict/wreck/cache —
  beacon + derelict fit swallowed trash and watch hardware.
- `discoveryPlate` ⇒ mark-ineligible; new POIs only (the gut has no bounty pool anyway —
  interiorHost, but stay consistent).
- Zone additions follow the BOLUS_ZONES record shape (id/name/type/factionId/reason/
  center/radius). Zone types are free-text in core data (frontier whitelist does not
  apply here; still reuse an existing type: `anomaly_deep`/`derelict_field`).
- `sectors.js` foreign hunk (`appendSectorWonderPois`) does not touch the bolus card or
  `theBolus.js` — clean file to edit.

## Additive seams (clean)
- `theBolus.js` — +2 POIs on the sector card: `poi_bolus_manifest` (derelict — a
  swallowed hauler hulk inside the Cough, plate naming its dead crew = named dead +
  harvest flavor) and `poi_bolus_rib_watch` (beacon — the Rib's watch buoy off the
  station berth, plate in the station's clipped register).
- `theBolus.js` `BOLUS_ANCHORS` — matching anchor rows (`place_dead_hulk`,
  `place_nav_buoy`, visualRadius).
- `theBolus.js` `BOLUS_ZONES` — +1 zone `zone_bolus_nursery` "The Nursery" at the
  `bolusPlay` nursery coordinates, type `anomaly_deep`, faction_free, authored `reason`
  naming the fingerlings — makes the existing play volume chart-legible.
- `discoveryPlate` on `poi_bolus_charon_buoy` — it is a beacon; a plate is legal, cheap,
  and it is the gut's only doorway sign.
