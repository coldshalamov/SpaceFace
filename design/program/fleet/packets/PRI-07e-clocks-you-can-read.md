# PRI-07e — Cinderglass: a readable inspection stop with one earned extension and real cover; Counterweight: the clock waits and practice is a choice (#982)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#982" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it describes every file in this slice). The intent is
commission EC-G15, "work that is enjoyable": every job gets a physical thing to do, never a progress bar
(`design/game/13_JOBS_AND_HEISTS.md`).

## What the player gets
On the Cinderglass run the inspection stop shows its thirty seconds, Dask grants one extension, the sealed pod really blocks sensors so you can use it as cover, and a greyed service says why. At the Counterweight registrar reading the briefing no longer starts the clock, and a live ranked attempt can be turned into practice (forfeiting the payout).

## Build
Three-way merge from PR #982 (merge-base `f95de0eb1ba7`), file by file:
- `src/features/cinderglassJob/contact.js`
- `src/features/cinderglassJob/convoy.js`
- `src/features/cinderglassJob/definition.js`
- `src/features/cinderglassJob/interception.js`
- `src/features/cinderglassJob/negotiation.js`
- `src/features/cinderglassJob/runtime.js`
- `src/features/counterweightCircuit/physical.js`
- `src/features/counterweightCircuit/prompts.js`
- `src/features/counterweightCircuit/readModel.js`
- `src/features/counterweightCircuit/runtime.js`

Tests to bring: test/cinderglass-*.test.mjs (five new plus the PR's change to cinderglass-job-physical), test/counterweight-briefing-apron.test.mjs, test/counterweight-live-practice.test.mjs.

## Required corrections (the PR is the draft; these make it right)
1. The Counterweight is also a public Circuits venue now (queue rows G18-05/G18-06, QUAL-06: F8 resets an attempt on its grid). Read master's current `counterweightCircuit/runtime.js` first; the practice-consent state must not break the F8 reset or the public Time Trial. Prove both still work in a test.
2. `sensorBlocking: true` on the pod uses the existing line-of-sight mechanism — confirm the flag is read by `lineOfSight.js` / `lawSecurity.js` on master and add nothing new to those files.
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
`node --test test/cinderglass-*.test.mjs test/counterweight-*.test.mjs`
then, in one call, the existing tests of the directories you touched
(`grep -ln "<each feature directory or module name>" test/*.mjs`) — report pass/fail counts; reds that
already fail on untouched master are reported, not "fixed". `npm run check:src-imports`. No game or
browser run.

Commit: `fleet(PRI-07e): <what the player now sees>`.
