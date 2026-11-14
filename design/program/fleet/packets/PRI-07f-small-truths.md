# PRI-07f — Beam repair spends credits then scrap; Elroy's ledger tells his real fate; the Nest waypoint reads the live Nest; Rookside remembers (#982)

**Lane 3.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#982" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it describes every file in this slice). The intent is
commission EC-G15, "work that is enjoyable": every job gets a physical thing to do, never a progress bar
(`design/game/13_JOBS_AND_HEISTS.md`).

## What the player gets
A broke pilot can repair with scrap (one unit buys 20 hull, the remainder is kept). Kurtz's ledger records what actually happened to Elroy instead of always "deceased". The Nest waypoint shows the live state (returns, Wasps left, exposed or guarded). Rookside keeps its return state through a save and says when the paid run is optional.

## Build
Three-way merge from PR #982 (merge-base `f95de0eb1ba7`), file by file:
- `src/systems/beamRepairResources.js` (new)
- `src/combat/industrialBeam.js`
- `src/systems/mining.js`
- `src/story/campaign47a/elroyLedger.js` (new)
- `src/systems/story.js`
- `src/data/narrative.js`
- `src/data/nestVisit.js`
- `src/missions/compostRoute.js`
- `src/systems/faction_understory.js`

Tests to bring: test/beam-repair-resources.test.mjs, test/elroy-ledger-outcome.test.mjs, test/nest-active-read.test.mjs, test/rookside-nest-return.test.mjs, test/charon-compost-first-feed.test.mjs, and the PR's changes to test/tethys-tally-passage.test.mjs and test/fixtures/tethys-tally-native.mjs.

## Required corrections (the PR is the draft; these make it right)
1. Four separate commits (repair · Elroy · Nest · Rookside), each with its own tests, so one can be reverted alone.
2. `mining.js` is large and busy: three-way merge only the `_applyRepair` / tool-state hunks; if it conflicts, keep master and re-apply the call to `applyFundedBeamRepair` by hand.
3. New saved field `player.beamRepairMaterialHp`: missing → 0; never negative; never above 20.
4. **Short words.** Every new or changed player-facing string (toast, radio line, button, detail text) is
   one short plain sentence — no second explanatory sentence, nothing over about 80 characters. Shorten
   as you port; tests that pin a long sentence follow the short one.
5. **Guards, not ceremony.** Keep a check that protects real state (an entity was replaced, a save was
   loaded mid-callback). Where the PR stacks several checks of the same fact in one function, keep one at
   the boundary. Do not add new ones.
6. Read each merged function once as a whole after merging. If it reads or writes state another system
   owns, it must go through that owner's method or event — fix it or list it under Blocked.

## Files you may edit
The source and test files named above, plus existing tests that pin a replaced sentence (list each with
a reason). Nothing under `design/`, no PR docs, no `build_map.md`.

## Checks
`node --test test/beam-repair-resources.test.mjs test/elroy-ledger-outcome.test.mjs test/nest-active-read.test.mjs test/rookside-nest-return.test.mjs test/charon-compost-first-feed.test.mjs test/tethys-tally-passage.test.mjs`
then, in one call, the existing tests of the directories you touched
(`grep -ln "<each feature directory or module name>" test/*.mjs`) — report pass/fail counts; reds that
already fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or
browser run.

Commits (four): `fleet(PRI-07f): <what the player now sees>`.
