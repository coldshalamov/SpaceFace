# C01-02 — The test suite follows the thirty-round course

**Commission:** EC-C01, follow-up to C01-01 (commit ca74e15f). **Size:** medium. **Tier:** D.

## Situation
C01-01 made the Swarm course thirty rounds with champions on 5/10/15/20/25/30 and a win at 30
(`swarmWaveOf` clamps to 30). About 67 test assertions still describe the retired endless course:
waves 31–275, the old every-tenth boss cadence (`S14 capital rows at 5,15,25`, `minors on ≡2,8 mod 10`,
`the seeded cadence deals a card to every special round`), wrap/escalation (`Iron Maw II at wave 145`),
late strain/brood/machine/event-deck content keyed past round 30 or to rounds that are now champion
rounds (`wave-10 is the authored event slot`), mass-gap/brood reserves keyed to wave 40+.
The C01-01 receipt (`.devshots/fleet/runs/C01-01-swarm-can-be-won.devin3.*/RECEIPT.md`) lists them.

## Job
For each failing assertion caused by C01-01 (not the ~35 that already failed before it):
1. If its **claim still exists** in the 30-round course (a cadence, a reserve, a card deal), rewrite
   the assertion to the 30-round truth (e.g. the round numbers it now happens on).
2. If its claim **no longer exists** (anything only past round 30), delete that test case and add one
   line to `test/RETIRED_SWARM_ENDLESS.md` (new file): test name — what it asserted — why it is gone.
3. Never edit an expected/golden data file to make a check pass.

Also produce, in your receipt, a list titled **"Content now unreachable"**: every enemy strain,
brood, machine, event card or boss variant that only appeared past round 30 (with its data id and
file). The named-rounds packet (G08-02) will fold the best of it back into rounds 1–30.

## Files you may edit
Test files under `test/` that fail because of C01-01; new `test/RETIRED_SWARM_ENDLESS.md`.
No `src/` edits — if a test exposes a real game bug, report it under Blocked.

## Checks
`node --test test/swarm*.test.mjs test/survival*.test.mjs test/crucible*.test.mjs` before and after;
paste both pass/fail counts. After your change the only failures may be the ones that failed before
C01-01 (name them).

Commit: `fleet(C01-02): Swarm tests follow the thirty-round course`.
