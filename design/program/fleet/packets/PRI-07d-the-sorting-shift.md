# PRI-07d — The shipbreaking yard: a starter-friendly LARK refit, re-clamping a part, and an honest paid closeout (#982)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#982" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it describes every file in this slice). The intent is
commission EC-G15, "work that is enjoyable": every job gets a physical thing to do, never a progress bar
(`design/game/13_JOBS_AND_HEISTS.md`).

## What the player gets
New LARK lots can arrive as a lighter postal-sorting refit a starter ship can work. The yard tells you the next physical step from the live work. A part you released by mistake can be re-clamped while your Line holds it still. When the motor and the cassette are delivered you can close the shift for pay.

## Build
Three-way merge from PR #982 (merge-base `f95de0eb1ba7`), file by file:
- `src/features/shipbreakingYard/guidance.js` (new)
- `src/features/shipbreakingYard/layouts.js`
- `src/features/shipbreakingYard/model.js`
- `src/features/shipbreakingYard/physics.js`
- `src/features/shipbreakingYard/runtime.js`

Tests to bring: test/shipbreaking-*.test.mjs (five new) and the PR's change to test/pro-experiences-shipbreakingYard.test.mjs.

## Required corrections (the PR is the draft; these make it right)
1. Saved yards with variants 0–5 load unchanged; variants 6–11 are admitted. Historical layouts 0–5 must be byte-identical to master.
2. Guidance is derived when the work graph changes (part released, delivered, coupled), not recomputed every tick.
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
`node --test test/shipbreaking-*.test.mjs test/pro-experiences-shipbreakingYard.test.mjs`
then, in one call, the existing tests of the directories you touched
(`grep -ln "<each feature directory or module name>" test/*.mjs`) — report pass/fail counts; reds that
already fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or
browser run.

Commit: `fleet(PRI-07d): <what the player now sees>`.
