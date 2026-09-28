# CR-CHAIN-1 — braid 5/5: a wreck towed through a search

**Built:** encounter 354, THE SWEEP (`src/data/encounters/354-the-sweep.js`). Row 47 closes
at 5/5 — all named rumor-braids are built.

## The braid

An SCN customs pair sweeps a corridor band — two cutters shuttling the search line on
real velocity-driven legs — and a marked prize hull (einsteinium + xenium salvage pool,
tetherable debris under the ordinary contract) is parked on the far side. The player's
tow is the braid: latch the hull and drag it through the sweep's off-beat. Detection is
physical — the marked hull inside a sweeper's 300 WU scan reach burns the run: cutters
drop inspection, commit onto the player, and the tow costs lawful rep.

## Resolutions

- `lifted` — the hull dragged clear through to the near side unspotted: fence pays.
- `fought_through` — the sweep pair is down; the prize stays where it lies.
- `prize_gone` — the hull is collected or destroyed under the sweep.
- `burned_gone` — spotted, then the patrol ships out on schedule.
- `sweep_ends` — deadline: the corridor is just a lane again.

All resolutions release the cast unstamped — the cutters keep being customs.

## Validation

`test/cr-chain-1-the-sweep.test.mjs` — 5/5 green:

- Shape registered (`patrol` deck, patrol × lawful zones × faction_scn).
- Cutters shuttle along the corridor axis passive; the wreck sits on the side opposite
  the player's approach, past the band edge, carrying the marked pool.
- Detection: the wreck within scan reach burns — cutters go hostile onto the towing
  player, SCN rep delta −2.
- `lifted` on a clean pull pays `sweep:lifted`; the cast releases without despawn stamps.
- `sweep_ends` resolves on the deadline.

## Unit note

The planner assigns squad ships role `'squad'` when the shape has no `civilian` block
(role `'raider'` is the predation path's mark) — the runtime filters on `'squad'`,
recorded here because `no_cast` aborts surface only as `resolved_on_fire`.
