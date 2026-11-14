# PRI-07c — Salvage crews pause to repair, split work honestly and remember; Hinge lets you rehearse and tow its crew (#982)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#982" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it describes every file in this slice). The intent is
commission EC-G15, "work that is enjoyable": every job gets a physical thing to do, never a progress bar
(`design/game/13_JOBS_AND_HEISTS.md`).

## What the player gets
A damaged salvage crew stops and waits instead of dying on the job, then resumes it. Crews offer keel-relief and three-way splits and remember whether you kept the deal. At the Hinge disaster site you can run one free rehearsal before the real alarm, and a crew member you are towing stops fighting your line.

## Build
Three-way merge from PR #982 (merge-base `f95de0eb1ba7`), file by file:
- `src/features/salvageOutfits/index.js`
- `src/features/salvageOutfits/persistence.js`
- `src/features/salvageOutfits/readModel.js`
- `src/features/industrialDisasters/causality.js`
- `src/features/industrialDisasters/physicalSite.js`
- `src/features/industrialDisasters/presentation.js`
- `src/features/industrialDisasters/runtime.js`

Tests to bring: test/salvage-outfits-*.test.mjs (five new), test/industrial-*.test.mjs (three new), and the PR's changes to test/pro-experiences-industrialDisasters.test.mjs and test/anvil-worker-world-promotion.test.mjs.

## Required corrections (the PR is the draft; these make it right)
1. New saved fields (`learnedMassLimit`, `repairHold`, `three_way` agreements, memory causes): an old save without them loads and behaves as before — add one literal old-shape test per feature directory.
2. `repairHold` must be decided on a damage event or the crew's existing slow cadence, not by scanning hulls every tick.
3. **Short words.** Every new or changed player-facing string (toast, radio line, button, detail text) is
   one short plain sentence — no second explanatory sentence, nothing over about 80 characters. Shorten
   as you port; tests that pin a long sentence follow the short one.
4. **Guards, not ceremony.** Keep a check that protects real state (an entity was replaced, a save was
   loaded mid-callback). Where the PR stacks several checks of the same fact in one function, keep one at
   the boundary. Do not add new ones.
5. Read each merged function once as a whole after merging. If it reads or writes state another system
   owns, it must go through that owner's method or event — fix it or list it under Blocked.

## Files you may edit
The source and test files named above, plus existing tests that pin a replaced sentence (list each with
a reason). Nothing under `design/`, no PR docs, no `build_map.md`.

## Checks
`node --test test/salvage-outfits-*.test.mjs test/industrial-*.test.mjs test/pro-experiences-industrialDisasters.test.mjs test/anvil-worker-world-promotion.test.mjs`
then, in one call, the existing tests of the directories you touched
(`grep -ln "<each feature directory or module name>" test/*.mjs`) — report pass/fail counts; reds that
already fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or
browser run.

Commit: `fleet(PRI-07c): <what the player now sees>`.
