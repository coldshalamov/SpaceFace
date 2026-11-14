# PRI-11e — Turret beams stop at cover, recoveries are named, and Cryo says what the weather is doing (#942, rebuilt)

**Lane 2. Run after: nothing.** Read `design/program/fleet/PR-INTAKE.md` first (including "A busy
file is never a reason to stop" — use `scripts/fleet/own-commit.sh`; other agents work in Swarm files
every day). Then `.devshots/pr-intake/reviews/recon-942.md` rows **F15, F23, F24**: for each feature they
give the PR commits and files, which round it belonged to, what `design/game/12_SWARM_THE_PIT.md` makes
of that round today, what master already has (file:line) and the per-tick costs. PR #942 staged an
older, different course; master now has the thirty named rounds (`src/data/swarmCourse.js`,
`swarmCourseCast.js`, `swarmTwists.js`). **Build the idea into today's course on today's owners; never
transplant a file.** Read the PR for behaviour and tests only:
`git show refs/remotes/pull/942:<path>`, `git diff f95de0eb1ba7 refs/remotes/pull/942 -- <path>`.

## What the player gets
A turret's beam visibly stops at the rock it cannot shoot through. A recovery (shield back, hull patched) is named when it happens. In Cryo Drift the room tells you a cold front is charging and when it has passed.

## Direction (the lead's decisions)
1. This is presentation: render reads the simulation's facts, never the reverse. Beam clipping uses the line-of-sight result the simulation already computed for the shot; if the simulation does not publish the hit point, publish it from the owner that fires the beam (one field on the existing event) rather than re-raycasting in render.
2. The lead's look pass (queue LOOK-04) is working in `src/render/**`: use `scripts/fleet/own-commit.sh` for any render file that already shows another agent's edits; keep your change to the beam end-point and nothing else there.
3. Recovery names and Cryo cues go through the existing juice/announce seams (`src/data/swarmJuice.js`, `src/systems/swarmJuice.js`), four words or fewer each (`SHIELD BACK`, `COLD FRONT`, `FRONT PASSED`). `src/systems/cryoWeatherRead.js` may be brought as a helper if it only reads.

## Always
- One owner per fact; no second clock, ledger or population beside the wave owner and the Brood.
- No per-tick allocation or whole-entity-list scan; placement work happens at wave start.
- Seeded RNG draw order outside the changed beat stays as it is; same seed → same round.
- Retry, Continue and `?swarmRound=N` starts behave as today. Endless rounds past 30 are untouched.
- Performance is judged at round 20 (`design/game/README.md` ruling 4): add nothing that runs there every tick.
- Do not edit golden/expected files; `design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that
  already fail — report them, do not "fix" them.

## Tests
adapt the PR's turret-presentation, recovery-naming and cryo tests. Through the real owners with a real seed; they must fail on the old code.

## Checks
The named tests; the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. One look through the lock where the packet changes what is on screen:
`node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=<the round> --rounds=1 --duration=40 --out=.devshots/fleet/pri-11e`
— say what you saw and name the capture paths. If the lock is busy, finish everything else first, then wait for it.

Commit(s): `fleet(PRI-11e): <what the player now sees>`.
