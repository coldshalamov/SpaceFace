# DEMO-SWARM-BUDGET-1 — Swarm rounds use the director-approved budgets

**For:** GLM (text only). **Kind:** one data rule + test migration. Commit your own files.

Swarm is the demo. The owner says the rounds feel flooded and drag. The approved round budget
(director 2026-11-20) is written in the header of `src/data/swarmCourseCast.js`:

    round:  1  2  3  4  5B  6  7  8  9 10B 11 12 13 14 15B 16 17 18 19 20B 21 22 23 24 25B 26 27 28 29 30B
    bodies: 10 16 20 24 18 26 28 30 32 22  30 32 33 34 24  34 35 36 37 26  36 37 38 39 28  38 39 40 40 30

Live today, `swarmCourseQuota(w)` in `src/data/swarmMode.js` returns 10 19 22 28 23 40 42 42 42 26 42 42 (rounds 1-12).

## Do
1. In `src/data/swarmCourseCast.js` export `SWARM_ROUND_BUDGET` (a frozen array of the 30 numbers
   above, index 0 = round 1) and a helper `swarmRoundBudget(wave)` returning the number for
   rounds 1-30 and 0 past 30.
2. In `src/data/swarmMode.js` make `swarmCourseQuota(wave)` return the round-1 cast count as now,
   else `swarmRoundBudget(wave)` when it is > 0, else `swarmQuota(wave)` (the endless ladder past
   round 30 is unchanged). Do NOT change `swarmQuota`, `swarmConcurrent` or any cap; only the
   course quota reader. Update the header comment ("the swarm lead switches it…") to say it is live.
3. Find tests that pin the old counts: `grep -rln "swarmCourseQuota\|killTarget\|swarmRoundPreview" test`
   and run them (`node --test <file>`), at most 12 files per run. A test that asserts an old course
   count gets the new number with the message reason "approved round budgets in swarmCourseCast.js
   (director 2026-11-20)". A test that fails for any other reason: do not touch it; list it.
4. Run `npm run check:sim`. If the golden moves, say so in the receipt (do not re-record it).

## You may edit
`src/data/swarmCourseCast.js`, `src/data/swarmMode.js`, `test/**`.
Before editing any file run `git diff -- <file>`; if it shows changes you did not make, use
`bash scripts/fleet/own-commit.sh begin <file>` before and `bash scripts/fleet/own-commit.sh commit "<msg>" <file>` after.
Never git add -A, reset, stash, restore or checkout. Commit by exact path.

## Receipt
Protocol headings; the new rounds 1-12 printed from `swarmCourseQuota`; a table of tests changed
(file | old | new) and tests left red (file | assert | suspected cause); check:sim result.
