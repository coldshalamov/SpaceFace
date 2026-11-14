# PRI-07b — The Morrowlight tender: restock pods, patch the hull, hold a paid booking, plan the departure (#982)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#982" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it describes every file in this slice). The intent is
commission EC-G15, "work that is enjoyable": every job gets a physical thing to do, never a progress bar
(`design/game/13_JOBS_AND_HEISTS.md`).

## What the player gets
The salvage tender can move supplies from your hold into a recovery pod, patch your hull from a pod's stock, hold and resume a prepaid service, let you choose hull-first or armour-first repair, and tell you before you leave which locker can top you up.

## Build
Three-way merge from PR #982 (merge-base `f95de0eb1ba7`), file by file:
- `src/features/salvageTender/departure.js` (new)
- `src/features/salvageTender/model.js`
- `src/features/salvageTender/physical.js`
- `src/features/salvageTender/runtime.js`
- `src/features/salvageTender/services.js`

Tests to bring: test/tender-*.test.mjs (the eight new files in the PR) and the PR's change to test/pro-experiences-salvageTender.test.mjs.

## Required corrections (the PR is the draft; these make it right)
1. Master landed its own tender work after the PR was written (`PARK-01`: tender haul / store sentence, commits c6fc0a8ac7fc and b044fc412852). Read master's current files before merging; where both sides built the same thing, master's stays and the PR's copy is dropped — say which.
2. Cargo moves only through `cargo.js` writers and repairs only through the station-services writer the PR names; if a merged hunk writes `cargo.items`, hull or credits directly, route it through the owner.
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
`node --test test/tender-*.test.mjs test/pro-experiences-salvageTender.test.mjs`
then, in one call, the existing tests of the directories you touched
(`grep -ln "<each feature directory or module name>" test/*.mjs`) — report pass/fail counts; reds that
already fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or
browser run.

Commit: `fleet(PRI-07b): <what the player now sees>`.
