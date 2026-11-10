# X-09 draft — Drifter: the yard ticket names what went wrong

Persona: The Drifter. Row §1P 567 (joint V-04). Audit: `X-09-audit.md`.

## Ground

When a rig comes back in pieces, the yard ticket says why in four words and an old hand says where
to practise. Nobody lectures. Today only a line-snap death points at the Range. The receipt already
classifies every cause (`playerDefeat.js:90-192`), so let it say one plain sentence.

## Cause → rung → line (existing rung ids, no reorder)

- Line snap / whip → `swing_do_not_pull`: *"The Range can teach swing, do not pull."* (unchanged)
- Terrain/ship collision, hull ram → `stopping_takes_room`:
  *"Came in hot. The Range teaches stopping takes room."*
- Thrown mass / arena impact from another body → `slip_a_gap`:
  *"Caught a thrown hull. The Range teaches slip the gap."*
- Weapon, player cap at 0 → `you_can_run_dry`: *"Ran the cap dry. The Range teaches you can run dry."*
- Weapon, otherwise → `boost_keep_speed`: *"Stood and traded. The Range teaches boost keeps the speed."*
- Environment/hazard → `slip_a_gap`: *"Sat in the bad field. The Range teaches slip the gap."*
- Self/unknown → silence. No guessing.

Each rung is offered **once per profile**. After that, the receipt shows only its cost lines (cargo
lost, coverage). That bill is what the Drifter remembers anyway.

## Lands in

- `src/combat/playerDefeat.js:451-462` `defeatRangeOffer`: replace the snap-only early return with a
  frozen `CAUSE_RUNGS` table keyed on what `buildDefeatReceipt` already computes (`context`,
  `source.kind`, physical tag, `weaponId`). The snap branch stays first and byte-identical, so
  `infer-b-world-teach.test.mjs:252-276,361-378` stays green.
- Memory: `player.hints['deathRung:'+rungId] = true`, the profile hints map with prefix keys like
  `fitFelt:`. `state.ui.deathRangeOfferedRung` is still written for the current receipt, so
  `gameOver.js:258-263,970-973` renders it with **no frontend change**.
- Rungs resolve via `rangeRungIndex`. A missing id means no offer, never a crash. `rangeRails.js` is
  untouched.
- Pins: one new test case per cause class beside the snap cases.

## Working life

Dying costs what it costs. The ticket tells you how it happened and where to practise, once per kind
of mistake.
