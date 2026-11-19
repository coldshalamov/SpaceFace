# B3C — Words batch: review fixes

> **Pipeline (director, 2026-11-19):** make NO git writes. Edit only the files below, surgically;
> other agents keep uncommitted work in them. Keep CRLF line endings. Run only the named tests.

The director's batch B3 (`.devshots/director/pending/b3.patch`) renamed loading text, death-cause
labels and Run Over copy. The adversarial review
`.devshots/director/reviews/2026-11-19T03-24-02-b3-words-and-first-run-modal.md` (findings at the
top) found these. Fix exactly them:

1. **Gauntlet loading shows "Swarm".** In `src/ui/loadingPresenter.js` choose the display name from
   the selected ruleset (`crucibleSetup.survivalRuleset` — find where the destination is set and the
   Gauntlet ruleset id): "Swarm" for the swarm ruleset, "Gauntlet" for the gauntlet ruleset; keep it
   when later progress updates arrive.
2. **A Detonator Dart kill goes unnamed.** Victim damage arrives as `impulse_charge` with
   `chargeId: 'detonator_dart'` (`src/systems/impulseCharges.js` ~1439). In
   `src/combat/playerDefeat.js` label that source 'dart blast' in the hit history and the defeat
   receipt (the batch only matched the dart's own self-destruct tag).
3. **'blast' suppresses the `you_can_run_dry` lesson** (`src/combat/playerDefeat.js` ~559): keep the
   lesson's eligibility independent of the new display label.
4. **Neutron slug crush ticks read 'blast'.** Preserve the `crush` phase in the damage origin and
   label a fatal crush tick 'crush'.
5. **"You converged on …" survives** in the Run Over story (`src/ui/screens/crucible.js` ~3106) and
   `test/pq-174-06-death-and-story.test.mjs` (~392) requires it: remove the duplicate story sentence
   and update the test with the reason in its message.

**Files:** `src/ui/loadingPresenter.js`, `src/combat/playerDefeat.js`, `src/ui/screens/crucible.js`,
`src/systems/impulseCharges.js` (edit only if the charge id must be carried), the tests below.
**Tests:** `node --test test/pq-174-06-death-and-story.test.mjs test/crucible-results.test.mjs` plus
every test that imports `loadingPresenter.js` or `playerDefeat.js` (`grep -l` them). Report pass/fail.
