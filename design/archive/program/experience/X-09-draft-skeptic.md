# X-09 draft — The Skeptic

**Verdict.** An after-action offer is a promise: the Range will teach the thing that killed you. Only a
slack-line snap makes that promise today (`playerDefeat.js:438-462`). Crash into a rock three times and the
defeat screen says nothing.

**Proposal — map only the causes a real rung teaches.** In `defeatRangeOffer` (`:451-462`), check snap →
`swing_do_not_pull` first. Otherwise read the label `buildDefeatReceipt` already computes
(`physicalWeaponLabelFromDamage`, `:90-142`) together with `source.kind` (`:165-192`):

| cause | offer |
|---|---|
| `'arena impact'`, source self/environment | `stopping_takes_room` (`rangeRails.js:43`) |
| `'hull ram'`, source self/environment (you flew into it) | `slip_a_gap`, "Touch nothing." (`:65-70`) |
| gunfire, a contact's ram or throw, hazards (deep-core gas) | **none** |

No rung teaches dodging guns or gas, so offering one would be a lie. Pinned TEACH-08 already asserts that a
weapon death offers nothing (`infer-b-world-teach.test.mjs:265-278, 368-378`).

The line uses the existing template (`:460`): "The Range can teach Stopping takes room." No rung is appended
or reordered (`rangeRails.js:7-8`).

**Once per rung, not once ever.** The single string `state.ui.deathRangeOfferedRung` blocks every later
lesson (`:454`). Instead:
- gate on a new array, `state.ui.deathRangeOfferedRungs`, seeded from the legacy string;
- still write `deathRangeOfferedRung` = the latest rung, so the pinned `=== 'swing_do_not_pull'` holds.

Old saves keep their swing flag and gain the new lessons.

**Poke → reward.**
- Ram a wall at speed: the braking rung is offered.
- Die by snap later: swing is still offered, once.
- Get shot down: the screen stays quiet instead of faking a lesson.

Every offered rung is a real drill, so the promise can be redeemed.

**Edge.** A hostile's thrown-mass kill on you (`source.kind 'contact'`) gets no offer. You were outplayed, not
careless; that is X-02's lesson.

**Regression risk.** Keep green:
- `infer-b-world-teach` (both TEACH-08 tests unchanged)
- `sfq-b058-defeat-cause-readout`, `death-slide`, `damage-death-recovery`, `defeat-mercy`
- Range door funnel tests
- `gameOver.js:258-263` render

New test: a self-terrain death offers `stopping_takes_room` once; a repeat offers nothing; a later snap still
offers swing. Joint with V-04.
