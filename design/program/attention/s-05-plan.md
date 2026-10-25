# S-05 plan — Pallas Drift

Tribunal splice: **Drifter's kitchen-and-warning furniture + Archivist's kept mooring
+ Accountant's off-ledger float and doorbell.** One POI per thin spot the catalog
named; the faction texture ships as voice (Quiet barks) and numbers (the census
channel), not as new furniture rules.

## What ships

### `src/data/sectors.js` — five new Pallas POIs (inline pos, admitted GLBs)

1. `poi_pallas_mess_line` — **The Mess Line** (derelict, `place_container_rack`),
   market's south approach (~900,-1100). Ration pods staged for the outbound skiffs —
   the food surplus made visible (Drifter 1).
2. `poi_pallas_sker_ward` — **Skerward Ward-Buoy** (beacon, `place_nav_buoy`), the
   Sker leg (~-1400,2100). Local-maintained, reads both directions: last cheap air
   (Drifter 2).
3. `poi_pallas_eighteenth` — **The Eighteenth Mooring** (beacon, `place_lane_pin`),
   on the Quiessence's approach outside its 700 exclusion (~-1100,-1550). An empty
   kept berth, lamp burning — keep the place, don't ask the name (Archivist 1).
4. `poi_pallas_off_books` — **Off-Books Berth** (derelict, `place_cold_locker`), at
   the nebula's south rim (~250,1350). Unlogged freight in grease-pencil tallies
   (Accountant 1).
5. `poi_pallas_quiet_bell` — **The Quiet Bell** (beacon, `place_whistle`), on the
   Smuggler Den approach (~-950,700). Ring once on approach; the only record the
   house keeps (Accountant 2).

### `src/data/flavor/100-rim-poi-lore.js` — three entries

`pallas_eighteenth`, `pallas_quiet_bell`, `pallas_mess_line` — three-line scan lore
(first Pallas bindings in the pack).

### `src/data/barkSituationFill.js` — faction_quiet

+2 `patrol-greeting`, +1 `scan`: the den's etiquette spoken (knock once, no manifest,
the bell is the only roll call). Small — the Quiet's register is restraint.

### `src/data/flavor/040-band.js` — Quiet Numbers

+2 `numbers_` lines counting the mooring and the bell — the census voice noticing
the new furniture without naming it.

## Explicitly rejected

- **No second vigil/memorial POI** — the Eighteenth Mooring carries that weight;
  the belt's vigil already ships the form.
- **No claim/tag culture** — S-11's Faith Filing Ninth and Drift Tag own that;
  acknowledged in the catalog, untouched.
- **No marketEquilibriumFactor or services edits** — economy numbers belong to
  economy lanes; the Mess Line only makes the shipped 2.4 legible.
- **No Quiessence-adjacent props inside its 700 dressing exclusion.**

## Test

`node --test test/sector-geography.test.mjs` + `node --test test/pulse-08-barks.test.mjs`.
