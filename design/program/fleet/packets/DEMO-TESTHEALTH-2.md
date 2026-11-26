# DEMO-TESTHEALTH-2 — fix the clear regressions, then triage the next test groups

**For:** Devin SWE-2 (long session; work through it steadily, commit as you go). **Kind:** fixes + triage.

Read `.devshots/fleet/runs/DEMO-TESTHEALTH-1.dsx.*/RECEIPT.md` (newest) first: a triage of red tests
on the demo route, with a class (b) list of real regressions.

## Part 1 — fix these class (b) items (each: verify, fix the code, run its test, commit)
1. `src/ui/station/lawFineDesk.js:26`: the three buttons ('Pay fine / Work the debt / Carry the
   warrant') never call `markStationControl`, so pad/keyboard/screen-reader labelling misses them
   (test/station-hud-kit.test.mjs).
2. `test/opening-raid-plate-bay.test.mjs`: since 7592bb895f the hold is a slot bag; the "full bay"
   fixture is not full under the slot law. Fix the FIXTURE so it is full under the slot law (that is
   a test-data fix, not weakening the assert).
3. `test/crucible-refit-focus.test.mjs`: re-run; 7f9ef78f25 may already have fixed it. If still red,
   find out why and fix it.
4. `src/core/runState.js:214` `validateRunStateForTick` caches its verdict per (run, tick) with
   skipNonJson, so a run mutated inside a tick keeps the previous ok:true
   (test/swarm-fracture-birth-clearance.test.mjs). Keep the per-tick saving (it is a performance fix):
   invalidate the cache when a run writer changes the run (find the run's writers / a version field;
   bump a `run._rev` on write if one exists or add it in the run owner), so the test passes without
   validating every tick.
Leave alone (design calls, the director decides): the first-hour economy floor, the plate-theft
escort AI, crucible-run-economy's wall-gun promise, the title attract tape.

## Part 2 — triage the next groups (like DEMO-TESTHEALTH-1, same classes a/b/c/d)
Groups, at most 40 files per command: `test/massline*`, `test/power*`, `test/arsenal*`,
`test/flight*`, `test/input*`, `test/save*`, `test/sim-*`, `test/worker*`, `test/world*`,
`test/mission*`, `test/market*`, `test/economy*`. Rewrite ONLY class (a) tests (a recent commit
deliberately changed the rule; name it in the message). Fix class (b) only when the fix is small
and obvious; otherwise list it.

## Rules
Before editing a file run `git diff -- <file>`; if it has changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `... commit "<msg>" <file>` after. Never
git add -A, reset, stash, restore or checkout. Never delete a test to make it pass; never edit
golden/expected files. Do not boot the game. `npm run check:sim` after any src/core or src/systems
change (report if it moves; never re-record).

## Receipt
Protocol headings; Part 1 per item fixed (commit) / not (why); Part 2 table: test | assert | class |
evidence | action; class (b) list most player-visible first.
