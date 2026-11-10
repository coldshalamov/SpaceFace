# S-07 catalog — Charon Expanse (`sector_charon_expanse`)

Ledger register: expanse sector / wide empty, eerie. Sanctioned detail: anomalies, radio
ghosts, lonely sights.

## What the player literally perceives
- `src/data/sectors.js:559-605` — tier 2 charted belt sector, security 0.30, faction_dmc.
  One station (Expanse Refinery — deep-belt intake + hunter exchange with bounty board and
  scan_tech), three ore fields (two rare-exotic), radiation + dense-asteroid hazards.
- POI stack: `poi_colony` (claimable Abandoned Mining Colony, no flavor fields),
  `poi_charon_lung_marker` (beacon, has `rim_poi_lore` entry `charon_lung_marker` + a
  landmark_bleed carrier `lung_of_charon`), `poi_charon_tether_wreck` (distress-signal survivor
  pod, recovery encounter, landmark lore C7), `world_site_charon_cinder_nursery`
  (asteroidSites runtime row), and SEVEN anomaly POIs backed by authored zones
  (`authoredPlaces.js:159-235,446-466`): Warm Freighter, Three Hull Garden, Unidentified
  Lattice, Star Marker, Broken Shepherd, Preserved Cockpit, Empty Skin.
- Graffiti `tag_loc_067`-`tag_loc_077` + ads `ad_pulse_049`-`ad_pulse_056`: Lung Marker air
  scarcity, Ivo's 03:00 painting, Elroy's recycler count, tailings, Understory beds, snapped
  tether. Station-side walls are already written.
- Quiet Numbers is the eerie channel and Charon already haunts it: `numbers_43` "THE CHARON
  MANIFEST ANSWERS." Ballad Line is home-faction DMC — the lonely-song channel for this belt.

## What is thin
- Nine of eleven POIs produce a discovery record with no authored text — the widest
  discovery-copy gap of any assigned row. Every anomaly is a set piece with an authored zone
  `reason`, and the journal entry for finding it is a generic fallback.
- The tether wreck — an actual survivor recovery — has no plate either, despite landmark lore.
- "Radio ghosts" register is underfed: the Numbers channel has one Charon line for the whole
  sector's empty-belt mood; Ballad has none.
- `poi_colony` is bounty-mark-eligible and stays unplated (same mark-pool reason as S-06).

## Tone register
Wide, empty, eerie: air counted in canisters, birth records that start late, distress loops
that outlived the crew. DMC is tired, armed, blue-collar — the refinery that keeps the lights
on and files the hazards.

## Additive seams (clean files)
- `sectors.js` — `discoveryPlate` on the seven anomaly POIs + tether wreck + cinder nursery
  row (all mark-ineligible: anomaly type blocked, recovery encounter, runtimeOwner).
- `flavor/040-band.js` — append `numbers_station` (radio ghosts) + `ballad_line` (lonely
  sights) lines.
- `contactHail.js` — `faction_dmc` stance lines in the refinery shift voice.
- `barks.js` — `faction_dmc` base-cell appends.
- NOT used: `rim_poi_lore` (no runtime consumer), exact-count packs, new zones.
