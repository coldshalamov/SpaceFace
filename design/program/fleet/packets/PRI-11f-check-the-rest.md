# PRI-11f — The rest of #942, checked against today's Swarm one by one (#942, rebuilt)

**Lane 2. Run after: PRI-11c.** Read `design/program/fleet/PR-INTAKE.md` first (including "A busy
file is never a reason to stop" — use `scripts/fleet/own-commit.sh`; other agents work in Swarm files
every day). Then `.devshots/pr-intake/reviews/recon-942.md` rows **F18, F22, F26, F27, F28 (verify), F17 and F21 (gap list), F25, F29, F30, F32 (skip)**: for each feature they
give the PR commits and files, which round it belonged to, what `design/game/12_SWARM_THE_PIT.md` makes
of that round today, what master already has (file:line) and the per-tick costs. PR #942 staged an
older, different course; master now has the thirty named rounds (`src/data/swarmCourse.js`,
`swarmCourseCast.js`, `swarmTwists.js`). **Build the idea into today's course on today's owners; never
transplant a file.** Read the PR for behaviour and tests only:
`git show refs/remotes/pull/942:<path>`, `git diff f95de0eb1ba7 refs/remotes/pull/942 -- <path>`.

## What the player gets
Small real gaps get fixed: the round-ten exit choice, heavy reinforcements that stay in their room, arrivals that never appear outside the boundary, a Bank that always leaves a dodge corridor, a Hive sac that lands where its body did.

## Direction (the lead's decisions)
1. For each of F18, F22, F26, F27, F28: write the PR's behaviour test against master first. Passes unchanged → master already does it; keep the test, change nothing, say so. Fails → fix it in the owner the recon names, smallest change.
2. F17/F21: from the recon's gap list, give any enemy whose first appearance in the thirty rounds has no `debut:` flag in `src/data/swarmCourseCast.js` that flag (data only), keeping each round's cast totals. The Forge Regent belongs to round 30 (`design/game/12_SWARM_THE_PIT.md`), not 25 — move nothing else.
3. Do not build F16, F19, F20 (an alternate 34-round course the design replaced), F25, F29, F30, F32 (already on master or unresolved): list them in the receipt as not built, one line each with the recon's reason.

## Always
- One owner per fact; no second clock, ledger or population beside the wave owner and the Brood.
- No per-tick allocation or whole-entity-list scan; placement work happens at wave start.
- Seeded RNG draw order outside the changed beat stays as it is; same seed → same round.
- Retry, Continue and `?swarmRound=N` starts behave as today. Endless rounds past 30 are untouched.
- Performance is judged at round 20 (`design/game/README.md` ruling 4): add nothing that runs there every tick.
- Do not edit golden/expected files; `design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that
  already fail — report them, do not "fix" them.

## Tests
one test file per verified feature, named `test/swarm-942-<feature>.test.mjs`. Through the real owners with a real seed; they must fail on the old code.

## Checks
The named tests; the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. One look through the lock where the packet changes what is on screen:
`node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=<the round> --rounds=1 --duration=40 --out=.devshots/fleet/pri-11f`
— say what you saw and name the capture paths. If the lock is busy, finish everything else first, then wait for it.

Commit(s): `fleet(PRI-11f): <what the player now sees>`.
