# PRI-02 — When the survivor's air runs out, the rescue really pays less

**Lane 3.** Follows the re-land of PR #921 (commit `893b7195893f`). Read `design/program/fleet/PR-INTAKE.md`
("What built properly means") first.

## The problem
The survivor-pod owner has always meant: 210 s of air, then the payout decays over 240 s to 45 %
(`src/systems/survivorPod.js`: `OXYGEN_WINDOW_S`, `OXYGEN_DECAY_WINDOW_S`, `MIN_REWARD_MULTIPLIER`,
`rewardMultiplier()`, and the scan label "oxygen depleted - survivor stable, payout decaying"). But the
price is only stamped onto the board offer once, when the offer is posted (`_stampOffer`), and the
accepted contract copies that stamped number. So waiting costs nothing, and #921's card had to say
`AIR SPENT · SURVIVOR STABLE` — a countdown with no consequence. Make the consequence real, then say it.

## Build
1. **One price function, owned by the survivor owner.** In `src/systems/survivorPod.js` add an exported
   pure read helper `survivorRescueQuote(state, salvagePointId)` returning
   `{ reward_cr, base_cr, decaying, atFloor } | null` — `null` when there is no live promoted record
   (missing, stripped). `reward_cr` is exactly today's formula in `_stampOffer`
   (`max(round(template × min), round(template × multiplier))`) evaluated at `state.simTime`.
   `decaying` = air spent and not yet at the floor; `atFloor` = at the 45 % floor. `_stampOffer` uses it
   too, so there is one formula.
2. **The price is re-read when the rescue commits.** In `_chooseRescue`, add `reward_cr` (from the quote)
   to the `survivorPod:rescueSelected` payload. In `src/systems/missionObjectiveOps.js`
   `_onSurvivorRescueSelected`, before `acceptMission`: if `payload.reward_cr` is a finite non-negative
   number **lower** than `offer.reward_cr`, set `offer.reward_cr = payload.reward_cr` (missions owns the
   board row; the survivor owner supplies the price; it can only go down, never up). If `acceptMission`
   refuses, restore the previous `offer.reward_cr`.
3. **The card tells the truth, in few words.** In `src/ui/wreckChoicePrompt.js` `_podStatus`: while air
   remains keep `AIR <n>s`; once spent show `AIR SPENT · PAYS <reward> cr` using `survivorRescueQuote`
   (format the number the way neighbouring UI formats credits); at the floor the same string simply
   stops changing — add no extra word. Keep the existing
   once-per-displayed-second cache: recompute only when the whole second changes, and call
   `updateDecision` only when the string changed. Remove the `SURVIVOR STABLE` wording and its comment.
4. Old saves: a record with no decay fields already normalises to the constants — keep that. Do not add
   saved fields.

## Tests (`test/wreck-choice-oxygen-continuity.test.mjs`, extend; the file already has real fixtures)
- Rescue chosen before the air runs out → accepted mission reward equals the full stamped reward.
- Rescue chosen 120 s after the air ran out → accepted reward equals `survivorRescueQuote(...).reward_cr`
  at that time, is lower than the stamped reward and higher than the floor.
- Rescue chosen long after (past the decay window) → reward equals the 45 % floor exactly.
- A refused accept (use the existing refusal fixture) leaves the board offer's `reward_cr` unchanged.
- The card status reads `AIR SPENT · PAYS <n> cr` after depletion and `<n>` falls as `simTime` advances.
- Replace the existing assertions that pin `AIR SPENT · SURVIVOR STABLE` and "reward equals the stamped
  reward after depletion" — those pinned the old behaviour.

## Files you may edit
`src/systems/survivorPod.js`, `src/systems/missionObjectiveOps.js`, `src/ui/wreckChoicePrompt.js`,
`test/wreck-choice-oxygen-continuity.test.mjs`, and any existing test under `test/` that pins the old
survivor reward-at-accept behaviour (list each in the receipt with the one-line reason).

## Checks
`node --test test/wreck-choice-oxygen-continuity.test.mjs`, then every test that names the survivor pod:
`grep -ln "survivorPod\|survivor_pod" test/*.mjs` — run them all in one `node --test` call and report
pass/fail counts; a test already failing on untouched master is reported, not "fixed".
`npm run check:src-imports`. No game or browser run.

Commit: `fleet(PRI-02): a spent air clock really lowers the rescue payout, and the card shows the price`.
