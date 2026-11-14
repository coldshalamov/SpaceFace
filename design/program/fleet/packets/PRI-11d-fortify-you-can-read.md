# PRI-11d — Fortify: what you bought, what it cost you last round, and that it is ready (#942, rebuilt)

**Lane 2. Run after: nothing.** Read `design/program/fleet/PR-INTAKE.md` first (including "A busy
file is never a reason to stop" — use `scripts/fleet/own-commit.sh`; other agents work in Swarm files
every day). Then `.devshots/pr-intake/reviews/recon-942.md` rows **F13, F14**: for each feature they
give the PR commits and files, which round it belonged to, what `design/game/12_SWARM_THE_PIT.md` makes
of that round today, what master already has (file:line) and the per-tick costs. PR #942 staged an
older, different course; master now has the thirty named rounds (`src/data/swarmCourse.js`,
`swarmCourseCast.js`, `swarmTwists.js`). **Build the idea into today's course on today's owners; never
transplant a file.** Read the PR for behaviour and tests only:
`git show refs/remotes/pull/942:<path>`, `git diff f95de0eb1ba7 refs/remotes/pull/942 -- <path>`.

## What the player gets
Before a round the Fortify screen says which of your defences are in place and what was lost last round. Arrivals in round two meet the defences you paid for instead of spawning past them.

## Direction (the lead's decisions)
1. Master's Armory was rebuilt today (PR #1074 port: `src/ui/orrery/cruciblePreparationLayouts.js`, `crucibleArmory.js`, `src/ui/screens/crucibleDraft.js`); the Fortify surface is `src/ui/swarmFortifyPanel.js` / `src/ui/orrery/swarmFortifyLayouts.js`. Read them first; add the readiness read in their current pattern (short labels, existing tokens, 12px floor). Do not bring `src/ui/swarmFortifyReadiness.js` as a parallel file.
2. Arrivals respect placed defences: the arrival search treats a placed defence's footprint as occupied and prefers a bearing that faces one. Change `src/systems/swarmFortifyEffects.js` / the arrival search only; no new owner.
3. Shoot `node scripts/ui-bench.mjs --shot=crucible-fortify` at 1440x900 and `--viewport=390x844` into `.devshots/fleet/pri-11d/`, open the PNGs yourself, fix cut-off or overlapping text, name the paths.

## Always
- One owner per fact; no second clock, ledger or population beside the wave owner and the Brood.
- No per-tick allocation or whole-entity-list scan; placement work happens at wave start.
- Seeded RNG draw order outside the changed beat stays as it is; same seed → same round.
- Retry, Continue and `?swarmRound=N` starts behave as today. Endless rounds past 30 are untouched.
- Performance is judged at round 20 (`design/game/README.md` ruling 4): add nothing that runs there every tick.
- Do not edit golden/expected files; `design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that
  already fail — report them, do not "fix" them.

## Tests
adapt the PR's fortify readiness and fortified-flanks tests. Through the real owners with a real seed; they must fail on the old code.

## Checks
The named tests; the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. One look through the lock where the packet changes what is on screen:
`node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=<the round> --rounds=1 --duration=40 --out=.devshots/fleet/pri-11d`
— say what you saw and name the capture paths. If the lock is busy, finish everything else first, then wait for it.

Commit(s): `fleet(PRI-11d): <what the player now sees>`.
