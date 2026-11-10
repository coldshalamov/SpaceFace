# S-09 catalog — Veil Nebula (`sector_veil_nebula`)

Ledger register: nebula sector / fogged, strange. Sanctioned detail: nebula phenomena, veil
cult texture, sightings.

## What the player literally perceives
- `src/data/sectors.js` — tier 3 uncharted scenic sector, security 0.12, faction_free,
  anomaly palette. One research station ("Instruments first, hospitality never"), a gas-cloud
  field, a sector-wide nebula hazard at 0.9 intensity, a gated wormhole route to Ashfall.
- POI stack: `poi_anomaly` (Resonance Obelisk — hidden, triangulated, ALREADY plated +
  landmark lore C2 + a landmark_bleed carrier), `poi_wormhole` + `poi_veil_far_sounding`
  (wormhole type — gated transit and an unlisted second aperture), and six anomaly POIs
  (Quiet Ice, Pale Spire, Silent Gate, Black Orchard, Containment Ring, Exception Chamber)
  each backed by authored `authoredPlaces.js` zone reasons.
- Band: `numbers_station` is banded `homeSectors: [pallas_drift, veil_nebula]` — the eerie
  counting channel literally lives here. `margin_34` already name-drops "the Veil line".
- Choir Vespers is the cult-texture channel (ritual Pattern voice); the obelisk already bleeds
  a carrier ident ("RESONANCE: THE OBELISK COUNTS YOUR SCANS").
- A Vael patrol encounter (`332-resonance-obelisk-patrol.js`) orbits the obelisk — vael hails
  and barks are genuinely heard in this sector.
- Graffiti `tag_loc_089`-`tag_loc_099` + ads `ad_pulse_065`-`ad_pulse_072`: telemetry, Vael
  filings, scan leases, dark-band blanks — station surfaces already dense.

## What is thin
- Eight POIs file empty discovery records — both wormholes and all six machine/ecology sites.
  The one plated POI (the obelisk) is also the only one with landmark lore.
- "Sightings" is the sanctioned texture with the least coverage: the numbers channel has one
  Veil line (`numbers_26`, "THE VEIL STATION HAS NO SWITCHBOARD") for the whole sector.
- The veil-cult register exists only inside the obelisk's own bleed carrier — nothing carries
  it into the ordinary band or hail surfaces.

## Tone register
Fogged and strange: instruments that see too much, a cult that prays to a pulse, researchers
who sell readings and withhold explanations. Vael presence is contractual menace in the mist.

## Additive seams (clean files)
- `sectors.js` — `discoveryPlate` on eight POIs (wormhole type is mark-blocked; anomalies are
  mark-blocked; nothing in this sector is in a writ pool).
- `flavor/040-band.js` — append `numbers_station` (sightings format) + `choir_vespers`
  (veil-cult verses) lines.
- `contactHail.js` — `faction_vael` neutral (the obelisk patrol's voice) + `faction_free`
  allied (research station).
- NOT used: `hush` (bound to `planet_hush` in Eunomia — wrong sector, deliberately
  single-site), `rim_poi_lore` (no consumer), exact-count packs, new zones.
