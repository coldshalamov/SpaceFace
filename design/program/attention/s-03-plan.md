# S-03 plan — Tethys Junction

Tribunal splice: **Drifter's convoy voice + Set Dresser's four-roads grammar +
Skeptic's one real bite.** The junction gets legs, a voice, and teeth — in that order
of mass.

## What ships

### `src/data/sectors.js` — five new Tethys POIs (inline pos, Tally-vocabulary GLBs)

Io convoy leg (Drifter + Set Dresser — southeast corridor, the frontier run):

1. `poi_tethys_marshal_nine` — **Convoy Marshal Nine** (beacon, `place_nav_buoy`),
   Io leg mid (~1500, 1400). The MTS marshal buoy that counts hulls out the door.
2. `poi_tethys_formup` — **Form-Up Post** (beacon, `place_tally_post`), staggered off
   the marshal (~1650, 1560). Convoys assemble on its lamps in groups of three —
   the same count grammar as the Tally, outbound direction.
3. `poi_tethys_refused` — **Refused Consignment** (derelict, `place_cargo_pod_standard`),
   parked off-lane near the form-up (~1560, 1700). Freight that failed the outbound
   count and was set aside, still tagged.

Vesta leg (Set Dresser + Skeptic):

4. `poi_tethys_second_count` — **Second Count Buoy** (beacon, `place_nav_buoy`), Vesta
   leg (~-1000, 1150). A dead pre-Meridian Concord count station: the toll's older
   layer, lamps out, mount still standing.
5. `poi_tethys_refiled` — **The Re-filed Hull** (derelict, `place_dead_hulk`), farther
   down the Vesta leg (~-1500, 1450). Impounded mid-lane when its desk collapsed;
   still flagged HELD. The Skeptic's lane story with a punchline.

(The Skeptic's Toll Rebate Cache is folded into `poi_tethys_refiled` as a `contents`
line would lie — a HELD hull isn't lootable lawfully. Instead the payoff stays at
`poi_tethys_refused`: give it no contents — the tag forbids opening — and the bite
is the *reading*, consistent with the sector's "nothing may be legally opened" joke.
Cache payoff rejected on non-redundancy: Ceres just shipped one.)

### `src/data/flavor/100-rim-poi-lore.js` — three entries

`tethys_marshal_nine`, `tethys_second_count`, `tethys_refiled` — three-line scan lore,
two-bureaucracies register.

### `src/data/barkSituationFill.js` — faction_mts

+3 `patrol-greeting`, +2 `scan` in convoy-marshal voice (count the interval, hold the
lane, the Tally owes you a window).

### `src/data/flavor/040-band.js`

- **Fulfillment Routing** +2 lines that name the junction's legs (kept minimal per
  the Skeptic's redundancy warning — the channel carries the abstract voice; two
  concrete leg names is all it needs).
- **The Static** +2 lines heckling Marshal Nine and the Re-filed Hull by name.

## Explicitly rejected

- **No new channel** — Fulfillment Routing already is the convoy/logistics voice;
  a new channel is infrastructure-adjacent and fails cost.
- **No changes to the Tally zone or its checkpointed props** — WF-03 is shipped work;
  `everydaySpaceKitDressing.js` skip rules untouched.
- **No ad-board adds** — catalog shows Tethys notice density is already adequate.

## Test

`node --test test/sector-geography.test.mjs` + `node --test test/pulse-08-barks.test.mjs`
+ `node --test test/depth-program-flavor-loader.test.mjs` (pack bindings).
