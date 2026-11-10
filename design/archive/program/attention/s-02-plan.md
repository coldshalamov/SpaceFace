# S-02 plan — Ceres Belt

Tribunal splice: **Drifter's claim grammar + Skeptic's aftermath-and-payoff +
Archivist's named dead and ballads.** All three argued from different evidence
(working present / player poking / canonical memory); the plan keeps one spine from each
so the belt reads as a company town that works, kills, and remembers.

## What ships

### `src/data/sectors.js` — six new Ceres POIs (inline pos, existing GLBs)

Claim grammar (Drifter) — three pins tell the whole town in one cluster plus one spread:

1. `poi_ceres_claim_tag` — **Claim Forty-Tag** (beacon, `place_claim_mark`), on
   f_ceres_1's south rim (~640,-500). A worked claim's pin, stamps still legible.
2. `poi_ceres_restake` — **Re-stake on Forty** (beacon, `place_claim_mark`, smaller
   radius), ~30 WU away (~676,-512). A second pin stamped over the first: the claim
   was lapsed by a dead crew and re-filed by their replacement.
3. `poi_ceres_ash_pin` — **Ash Pin on the Pallas Leg** (beacon, `place_ash_pin`),
   southwest corridor (~-1100, 2000) — the bare Pallas leg's only furniture: a claim
   pin burned to its socket, still transmitting a survey ID for a crew that isn't.

Aftermath + payoff (Skeptic):

4. `poi_ceres_vigil` — **Cathedral Vigil** (beacon, `place_worklight_tower`), on the
   Wreck Cathedral approach (~380, 2640). A worklight left burning for the Second
   Measure's dead; the plate names two of them.
5. `poi_ceres_lapsed_cache` — **Lapsed Claim Cache** (cache, `place_debris_chunk`,
   `contents: { cmdty_ore_copper }`), southwest leg (~-420, 1240). One real payoff —
   the pin-holder never came back; the plate explains the lapse.

Ration economy (Drifter):

6. `poi_ceres_short_ration` — **Short-Ration Pod** (derelict,
   `place_cargo_pod_standard`), on the Belt Outpost approach (~1400,-1150). A
   provisions pod that missed its window — the `cmdty_food: 0.1` shortage made
   physical.

### `src/data/flavor/100-rim-poi-lore.js` — four entries

`ceres_claim_tag`, `ceres_vigil`, `ceres_lapsed_cache`, `ceres_ash_pin` — three-line
scan lore in the belt's tally voice, bound to the new poiIds (Archivist surface).

### `src/data/barkSituationFill.js` — faction_dmc

+3 `scan`, +2 `patrol-greeting` lines: tally-talk, wet-weigh, paper-first claim
etiquette (Drifter's miner chatter).

### `src/data/flavor/040-band.js` — The Ballad Line

+4 `ballad_` verses (appended at the tail — 64–67 at write time; the channel grew
past 63 while the plan was drafted): the wet weigh, the re-stake, the pin that
still pings (Archivist — Ballad Line is already the DMC-home channel).

## Explicitly rejected

- **No ad-board adds** — Ceres already carries 8+ tagged notices; non-redundancy
  axis fails.
- **No new faces/traffic picks** — the pick pool is pinned (Rell/Jorah contract).
- **No checkpointed-prop touches** — `everydaySpaceKitDressing.js` skip rules and
  `sectorAnchors.js` stay untouched; all geometry is inline in sectors.js per the
  S-01 precedent.

## Test

`node --test test/sector-geography.test.mjs` (pos/POI contract) and
`node --test test/pulse-08-barks.test.mjs` (bark fill contract).
