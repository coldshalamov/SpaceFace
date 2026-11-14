# PRI-07a — RATCHET's workshop: the Quiet Relay, the receiving crew and what comes next (#982)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#982" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it describes every file in this slice). The intent is
commission EC-G15, "work that is enjoyable": every job gets a physical thing to do, never a progress bar
(`design/game/13_JOBS_AND_HEISTS.md`).

## What the player gets
The rig workshop gains a third order — the Quiet Relay, two fragile loads that take real shock damage if you bang them — offered only after the needle and kiln jobs are delivered and settled. When you bring work back, the receiving crew is there with the delivered originals and says how it went; the board names the next earned order.

## Build
Three-way merge from PR #982 (merge-base `f95de0eb1ba7`), file by file:
- `src/features/rigWorkshop/aftermath.js` (new)
- `src/features/rigWorkshop/cargoImpact.js` (new)
- `src/features/rigWorkshop/jobs.js`
- `src/features/rigWorkshop/persistence.js`
- `src/features/rigWorkshop/runtime.js`

Tests to bring: test/rig-*.test.mjs (the nine new files in the PR) and the PR's change to test/pro-experiences-rigWorkshop.test.mjs.

## Required corrections (the PR is the draft; these make it right)
1. `src/features/rigWorkshop/runtime.js` is the one real conflict: master added "defer optional workshop offers during urgent encounters", combat/native-recovery/save integration and `counted()` wording in the same regions. Keep every master behaviour; add the PR's earned-work gating and the aftermath / hand-off / original-course flows around it.
2. `cargoImpact.js` routes relay-cargo collisions into combat damage: confirm it subscribes once, on install, to the collision event the game really emits (find the emitter), filters by its own cargo ids first, and does no work for other collisions.
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
`node --test test/rig-*.test.mjs test/pro-experiences-rigWorkshop.test.mjs`
then, in one call, the existing tests of the directories you touched
(`grep -ln "<each feature directory or module name>" test/*.mjs`) — report pass/fail counts; reds that
already fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or
browser run.

Commit: `fleet(PRI-07a): <what the player now sees>`.
