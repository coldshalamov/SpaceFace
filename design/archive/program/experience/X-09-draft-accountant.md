# X-09 draft — The Accountant

## Schema

`defeatRangeOffer` (`playerDefeat.js:451`) returns `{rungId, once, line}`, and `gameOver.js:258-263`
already renders any offer. All 16 rungs exist (`rangeRails.js:41-110`). No UI change, no rung
appended or reordered.

## Proposal

1. **Cause→rung map** in `playerDefeat.js`. The first matching row wins.

   | lethal read | rung |
   |---|---|
   | `isSlackLineSnapDeath` (unchanged, first) | `swing_do_not_pull` |
   | label `'arena impact'` or `'hull ram'`, source `self`/`environment` | `stopping_takes_room` |
   | label `'thrown mass'` from a `contact` | `slip_a_gap` |
   | `WEAPON_BY_ID.has(weaponId)` | `boost_keep_speed` |
   | context `deep_core_gas` / `salvage_reactor` | `slip_a_gap` |

   Labels come from `physicalWeaponLabelFromDamage` (`:90-142`) and the source from
   `defeatSource` (`:166`). Nothing is newly classified.
2. **One offer per rung, per profile.** The current gate has two faults. It blocks every later rung
   after the first (`:454`), and it lives in session-only `state.ui`. Move the gate to
   `state.player.hints['rangeOffer_' + rungId]`. That bag is saved and shallow-merged
   (`saveSystem.js:7444`), so no migration is needed. Keep writing the
   `state.ui.deathRangeOfferedRung` mirror so `infer-b-world-teach.test.mjs:263` holds.
3. **Line.** Keep the shipped template, e.g. "The Range can teach stopping takes room."

## Cost and authority

`hints` is not on the single-writer list in `src/AGENTS.md`. Credits, cargo, heat, rep and ship
stats are untouched.

## Numbers

Five offers per profile at most. A player dying 3–6 times in hour one hears at most one line per
cause and never a repeat.

## Determinism and save

There are no draws. One boolean hints key is added per offered rung.

## Tests

- Extend `infer-b-world-teach.test.mjs`:
  - each map row gives its rung;
  - the same cause twice gives `null`;
  - a new cause after the swing offer still offers;
  - a gun death never gives the swing rung (keeps `:277`);
  - a legacy save offers normally.
- Keep green: `sfq-b058-defeat-cause-readout`, `defeat-mercy`, `range-door-funnel`,
  `check:save-schema`.

## Coordination

This is joint with V-04. Its tribunal judges whether each rule is the right lesson.

**Verdict: shippable, S.**
