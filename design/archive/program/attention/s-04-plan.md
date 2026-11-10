# S-04 plan — Vesta Forge

Tribunal splice: **Drifter's hot-face workplace + Set Dresser's waste-and-signature
grammar + Archivist's Choir verses and hedge tallies.** The foundry gets a workforce,
a signature, and a waste stream.

## What ships

### `src/data/sectors.js` — five new Vesta POIs (inline pos, admitted GLBs)

Hot-face workplace (Drifter, with the Archivist's splice inside the Lead Hedge plate):

1. `poi_vesta_hot_face` — **Hot Face Claim** (beacon, `place_claim_mark`), inside the
   radiation rim (~-480,-320). Worked on twenty-minute watches; the pin is re-stamped
   every rotation.
2. `poi_vesta_lead_hedge` — **The Lead Hedge** (derelict, `place_container_rack`), at
   the hazard's north rim (~-540,140). Lead-lined staging containers; the plate carries
   the Archivist's splice — chalk watch-tallies, some columns ending mid-tally.

Signature and waste (Set Dresser):

3. `poi_vesta_guild_stamps` — **Guild Stamp Post** (beacon, `place_tally_post`), on the
   Outlying Yard approach (~-700,420). Every shift's maker's mark on one post; oldest
   stamps at the base, worn to ghosts.
4. `poi_vesta_reject_run` — **Reject Run** (derelict, `place_container_rack`), on the
   Tethys leg (~1500,-900). Mis-stamped plate dumped mid-route: unsigned work does not
   leave Vesta.
5. `poi_vesta_kilnward` — **Kilnward Buoy** (beacon, `place_nav_buoy`), the bare Charon
   leg (~1600,2400). Guild-marked; plate convoys form on it at the edge of the map.

### `src/data/flavor/100-rim-poi-lore.js` — three entries

`vesta_hot_face`, `vesta_lead_hedge`, `vesta_guild_stamps` — three-line scan lore.

### `src/data/barkSituationFill.js` — faction_dmc

+2 `scan`, +1 `patrol-greeting`: watch-roster voice ("hold the burn to twenty," "your
watch, your stamp"). Small — Ceres already shipped five DMC fills this program.

### `src/data/flavor/040-band.js` — Choir Vespers

+3 `vespers_` verses (the watch rotation, the names the slag keeps, the stamp that
outlives the stamper) — the Choir already owns the sector's shift-rhythm register.

## Explicitly rejected

- **No separate memorial POI** — the belt just shipped a vigil; the Lead Hedge's plate
  carries the count instead (non-redundancy).
- **No station/service changes** — flavor only; economy and services lists are other
  lanes' surfaces.
- **No hazard/mechanics edits** — the burn stays identical; only its story changes.

## Test

`node --test test/sector-geography.test.mjs` + `node --test test/pulse-08-barks.test.mjs`.
