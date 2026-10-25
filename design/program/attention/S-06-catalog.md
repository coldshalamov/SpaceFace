# S-06 catalog — Io Reach (`sector_io_reach`)

Ledger register: reach sector / frontier industry. Sanctioned detail: reach flavor, outpost marks.

## What the player literally perceives
- `src/data/sectors.js:520-557` — tier 2 charted fringe sector, security 0.35, faction_free.
  Two stations with authored `chartNote` (Reach Station "contested floor", Mercenary Outpost
  "writ wall"), two asteroid fields, a dense-asteroid hazard and a nebula hazard, five POIs.
- POI stack: `poi_merc` (colony, Quiet mercenary post — same display name as the station, no
  flavor fields), `poi_cruiser` (Derelict Cruiser, already plated: The Wreck Cathedral, with
  landmark lore C1 + a landmark_bleed carrier), `poi_claim_pallas` (claimable industrial moon,
  no flavor fields), `poi_io_shepherds_ring` + `poi_io_listening_field` (anomaly signals,
  runtimeOwner materialized, each backed by an authored `authoredPlaces.js` zone `reason`).
- Graffiti local_wall tags `tag_loc_056`-`tag_loc_066` and ad_board `ad_pulse_041`-`ad_pulse_048`
  already carry the Reach register: temporary boards, weld pools, air shares, lane meters,
  freeboard fees, contested charts.
- The Static is banded `homeSectors: [io_reach, sker_haven]` (`bandRadio.js:36-40`) — its roast
  voice is literally at home here. The Margin is home-faction free/quiet — audible at both
  stations.
- Quiet + Frontier NPC voices exist (`faction_quiet`, `faction_free` in `barks.js` and
  `CONTACT_HAIL_LINES`) but are generic — no outpost-flavored lines anywhere in the sector's
  voice surfaces.

## What is thin
- The two anomaly POIs scan-identify and materialize rich authored sites, but the chart-level
  first-discovery moment is silent: no `discoveryPlate` → the HUD plate falls back to the bare
  POI name and the codex journal gets no authored body (compare the plated precedent at
  `poi_anomaly` in Veil and `test/inference-deep-anomaly-plates.test.mjs`).
- The claimable moon and the Quiet colony carry zero copy — but both are bounty-mark-eligible
  (`bountyMarks.js markPoiEligible`), so plating them would shrink the writ pool. Left alone.
- Reach Station's "contested" flag is a data flag with no voice surface backing it; the outpost
  marks (Quiet contracting, air shares, weld pools) exist only on station-side walls/ads, not
  on the radio or hail channels a pilot actually hears in flight.

## Tone register
Frontier industry with a used-tools accent: welds, meters, berth ledgers, weigh-slips. The
Reach voice is predatory arithmetic ("weigh while you talk"); the Quiet outpost is terse vetting.

## Additive seams (clean files)
- `sectors.js` — `discoveryPlate` on the two anomaly POIs (mark-pool-safe: anomaly type is
  already blocked; already live actors via `scannerSignalKind`).
- `flavor/040-band.js` — append `the_static` lines (no repBand — repBand order is asserted).
- `contactHail.js` — append `faction_quiet` + `faction_free` stance lines (helix is the only
  exact-count cell; every other cell must simply stay ≥3).
- `barks.js` — append `faction_quiet` situation lines (all cells saturate at 12 via fill;
  appending to the base array is additive, index 0 preserved).
- NOT used: `graffiti`/`ad_board` (exact-count assertions 365/353), `landmark_lore` (exact 19),
  `rim_poi_lore` (validated but has no runtime consumer — silent text), POI `chartNote`
  (station-only render path).
