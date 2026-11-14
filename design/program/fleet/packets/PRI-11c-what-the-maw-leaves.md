# PRI-11c — The Iron Maw leaves wreckage you can use in round six (#942, rebuilt)

**Lane 2. Run after: PRI-11b (shares `swarmBrood.js`).** Read `design/program/fleet/PR-INTAKE.md` first (including "A busy
file is never a reason to stop" — use `scripts/fleet/own-commit.sh`; other agents work in Swarm files
every day). Then `.devshots/pr-intake/reviews/recon-942.md` rows **F9, F10, F11, F12, F31**: for each feature they
give the PR commits and files, which round it belonged to, what `design/game/12_SWARM_THE_PIT.md` makes
of that round today, what master already has (file:line) and the per-tick costs. PR #942 staged an
older, different course; master now has the thirty named rounds (`src/data/swarmCourse.js`,
`swarmCourseCast.js`, `swarmTwists.js`). **Build the idea into today's course on today's owners; never
transplant a file.** Read the PR for behaviour and tests only:
`git show refs/remotes/pull/942:<path>`, `git diff f95de0eb1ba7 refs/remotes/pull/942 -- <path>`.

## What the player gets
When the round-five boss dies its ballast and plates settle in clear space instead of on top of you, one hand-sized offcut stays through round six as cover or as something to throw, and boss chunks bowl through the Brood.

## Direction (the lead's decisions)
1. Seat the wreckage through the existing capital-boss aftermath owner (`src/systems/capitalBossRuntime.js`, `src/missions/capitalBossSpawn.js`) with the arena's clearance search; nothing spawns inside the pilot's immediate flight path (PRX-HIVE landed that rule for Hive walls — same rule).
2. The kept offcut is an ordinary dynamic debris body the arena already owns (it keeps its lifetime through round six, then releases normally). Do not bring `swarmFoundryWreck.js` / `swarmOpeningWreck.js` as files; one data row and one keep-flag are enough.
3. Chunk bowling: a thrown or drifting boss chunk damages Brood it passes through, through the existing thrown-body damage owner ("thrown bodies hit ships" — the one-feel ruling in `design/game/README.md`). If that already works for Brood on master, write the test and change nothing.

## Always
- One owner per fact; no second clock, ledger or population beside the wave owner and the Brood.
- No per-tick allocation or whole-entity-list scan; placement work happens at wave start.
- Seeded RNG draw order outside the changed beat stays as it is; same seed → same round.
- Retry, Continue and `?swarmRound=N` starts behave as today. Endless rounds past 30 are untouched.
- Performance is judged at round 20 (`design/game/README.md` ruling 4): add nothing that runs there every tick.
- Do not edit golden/expected files; `design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that
  already fail — report them, do not "fix" them.

## Tests
adapt the PR's Maw ballast / wreck-scatter / offcut tests to the real aftermath owner; add the bowling case. Through the real owners with a real seed; they must fail on the old code.

## Checks
The named tests; the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. One look through the lock where the packet changes what is on screen:
`node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=<the round> --rounds=1 --duration=40 --out=.devshots/fleet/pri-11c`
— say what you saw and name the capture paths. If the lock is busy, finish everything else first, then wait for it.

Commit(s): `fleet(PRI-11c): <what the player now sees>`.
