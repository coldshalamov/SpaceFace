# S-08 catalog — Sker Haven (`sector_sker_haven`)

Ledger register: haven sector (skerris) / haven refuge, skerris culture. Sanctioned detail:
haven dressing, refugee texture, shrine bits.

## What the player literally perceives
- `src/data/sectors.js:607-663` (pre-edit line numbers) — tier 3 UNCHARTED fringe sector,
  security 0.08, faction_reach. One rep-gated blackmarket station (Sker Bazaar — "vouched for
  or you're cargo"), one rare-exotic field, two dense-asteroid pockets.
- POI stack: `poi_bounty` (Bounty Wrecks — active-scan salvage + recovery encounter),
  `poi_stash` (hidden stolen-goods cache), `poi_sker_throne` (the hero landmark — welded-hull
  fortress with GLB, archive signal, landmark lore C13d, and an existing discoveryPlate), plus
  four anomaly POIs (Harvest Deep, Null Causeway, Red Snow, Quiet Dock) each backed by an
  authored `authoredPlaces.js` zone `reason`.
- Graffiti `tag_loc_078`-`tag_loc_087` + ads `ad_pulse_057`-`ad_pulse_064`: empty berths, Rook
  tagging crew as threats, name boards, cold bunks, the Haven toll, found keels, receipts as
  guarantees — the refugee-haven voice is already strong on station surfaces.
- The Static is banded home here (`bandRadio.js:37`) — Reach roast radio plays loud in-sector;
  the Margin is home-faction for free/quiet and reaches it via traffic.
- Ballad Line is home-faction Reach too — the memorial-song channel; the Throne's
  welded-dead register is a natural fit.

## What is thin
- Six of seven POIs have empty discovery records — including `poi_bounty` (a whole wreck field
  players triangulate and fly down) and `poi_stash` (a findable hidden cache). The Throne is the
  only plated POI.
- "Shrine bits": the skerris practice of welding names/dead into structures exists in landmark
  lore and graffiti but never reaches the radio — one ballad line and one margin note fix that.
- Reach voice cells exist but nothing in them is Haven-specific — no name boards, cold berths,
  or vouch culture in `faction_reach` barks/hails.

## Tone register
Refugee haven under raider law: tolls, name boards, cold bunks priced like bunkers, receipts as
the only scripture. Skerris texture is memorial-practical — weld the dead into the structure,
count berths like debts.

## Additive seams (clean files)
- `sectors.js` — `discoveryPlate` on six POIs (all already mark-ineligible: wreck/recovery,
  hidden cache, four anomalies).
- `flavor/040-band.js` — append `the_static` (Haven toll/bunk humor), `the_margin` (bazaar
  receipts + a shrine plate — no "Tessera" text, so no eventKey needed), `ballad_line` (welded
  dead memorial).
- `contactHail.js` — `faction_reach` stance lines in the vouch/weigh register.
- `barks.js` — `faction_reach` base-cell appends with Haven specifics.
- NOT used: exact-count packs, `rim_poi_lore` (no consumer), new zones/props.
