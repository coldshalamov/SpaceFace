# PRI-11b — Each Brood family is met alone first, beside the thing that answers it (#942, rebuilt)

**Lane 2. Run after: PRI-11a.** Read `design/program/fleet/PR-INTAKE.md` first (including "A busy
file is never a reason to stop" — use `scripts/fleet/own-commit.sh`; other agents work in Swarm files
every day). Then `.devshots/pr-intake/reviews/recon-942.md` rows **F3, F5, F6, F7, F8 (and F2, F4 as ideas)**: for each feature they
give the PR commits and files, which round it belonged to, what `design/game/12_SWARM_THE_PIT.md` makes
of that round today, what master already has (file:line) and the per-tick costs. PR #942 staged an
older, different course; master now has the thirty named rounds (`src/data/swarmCourse.js`,
`swarmCourseCast.js`, `swarmTwists.js`). **Build the idea into today's course on today's owners; never
transplant a file.** Read the PR for behaviour and tests only:
`git show refs/remotes/pull/942:<path>`, `git diff f95de0eb1ba7 refs/remotes/pull/942 -- <path>`.

## What the player gets
The first time a Brood family appears in the course (Spitter round 3, Cyst 9, Leecher 11, Glassback 13, Bellows 17) one of it arrives alone, next to the piece of the room that beats it — a throwable beside the Spitter's acid mark, a scrape wall for the Leecher, loose mass for the Glassback. The rest of the family follows once it is dead or after a short ceiling.

## Direction (the lead's decisions)
1. One mechanism for every family, owned by the Brood (`src/systems/swarmBrood.js`), driven by data (`src/data/swarmBrood.js`): a per-family debut recipe `{ round, familyId, needs: "throwable" | "escapeLane" | "scrapeSurface" | "looseMass", ceilingS }`. The first member is placed by the existing clearance/arrival search (`src/systems/swarmSafety.js` `findSwarmArrival`), extended only with the one geometric check each recipe names. If the room cannot satisfy the recipe, the family arrives the ordinary way — never a teleported prop, never a stall.
2. It reuses PRI-11a's beat pattern: the wave owner knows a debut is open and holds that family's remaining cohort; other families and ships are not held. One debut per round at most.
3. Bring none of the PR's per-family files (`swarmOpeningSpitter.js`, `swarmOpeningCyst.js`, `swarmOpeningLeecher.js`, `swarmOpeningGlassback.js`, `swarmBellowsPocket.js`, `swarmOpeningCrossfire.js`, `swarmOpeningFlanks.js`) — five copies of one idea. Take from them only the geometric predicates (swept throw lane, scrape surface test) and the behaviours their tests describe.
4. A debut is announced by the existing name card / twist line seam only (`src/data/swarmCourse.js`); no new text.
5. Cost: placement work happens once at wave start; per tick the debut checks one entity id.

## Always
- One owner per fact; no second clock, ledger or population beside the wave owner and the Brood.
- No per-tick allocation or whole-entity-list scan; placement work happens at wave start.
- Seeded RNG draw order outside the changed beat stays as it is; same seed → same round.
- Retry, Continue and `?swarmRound=N` starts behave as today. Endless rounds past 30 are untouched.
- Performance is judged at round 20 (`design/game/README.md` ruling 4): add nothing that runs there every tick.
- Do not edit golden/expected files; `design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that
  already fail — report them, do not "fix" them.

## Tests
new `test/swarm-brood-debuts.test.mjs` through the real arena/wave owners: for each of the five families, first appearance fields exactly one member with its recipe satisfied; cohort arrives on its death and at the ceiling; unsatisfiable room falls back to today's arrival; a later round with the same family has no debut; same seed → same placement. Through the real owners with a real seed; they must fail on the old code.

## Checks
The named tests; the capped sweep PR-INTAKE allows (twelve files, four minutes each);
`npm run check:src-imports`. One look through the lock where the packet changes what is on screen:
`node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --start-round=<the round> --rounds=1 --duration=40 --out=.devshots/fleet/pri-11b`
— say what you saw and name the capture paths. If the lock is busy, finish everything else first, then wait for it.

Commit(s): `fleet(PRI-11b): <what the player now sees>`.
