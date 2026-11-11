# C01-01 — A Swarm run can be won: thirty rounds, the Forge Regent, a win screen

**Commission:** EC-C01 the ending (decision D2: "an ending you can win"). **Size:** medium-large. **Tier:** D.

## Why
Today a Swarm run has no end: the round cap is 999 and nobody wins. A run that can be won is what
makes players come back ("a first win takes several tries").

## Read first
- The design: `git show origin/experience-commissions/EC-G13-integration-director:design/program/experience-commissions/12_SWARM_THE_PIT.md`
  — sections "The Course — thirty rounds with names" and "The bosses, in one line each" (bosses on
  rounds 5, 10, 15, 20, 25, 30; round 30 is the Forge Regent).
- Where the round count and the 999 cap live: `grep -rn "999" src/data/swarm*.js src/systems/survival*.js`,
  and `src/systems/survivalEndless.js`, `survivalResults.js`, `survivalRecords.js`.
- Which bosses exist in data: `grep -rln "boss" src/data/swarm*.js src/data/survival*.js`.

## What to build
1. The Swarm course is **30 rounds**. Clearing round 30 (boss dead and the round's enemies cleared)
   **ends the run as a win**.
2. Round 30 spawns the Forge Regent if it exists in data, else the closest existing boss (name it in
   your receipt). Rounds 5/10/15/20/25 spawn their design bosses only if those exist; do not author
   new boss AI.
3. The results screen for a win has the title **`THE PIT IS YOURS`**, then the existing run summary.
   A loss keeps today's screen. Records keep wins separately (`wins` count, best win time).
4. No endless play beyond 30 in this packet.

## Files you may edit
`src/data/swarm*.js`, `src/systems/survival*.js`, the Swarm results UI file you find (name it;
`git diff` first), new test `test/swarm-win.test.mjs`. Not `src/ui/hud.js`.

## Checks
- `node --test test/swarm-win.test.mjs`: a run forced to round 30 whose boss and enemies die ends
  with outcome `win`; a death on round 30 is a loss; records count one win.
- `node --test test/survival*.test.mjs test/swarm*.test.mjs` — report failures, and for each say
  whether your change caused it (read the assertion; never use git stash).
- If `?swarmRound=N` exists in the boot code (packet G17-01), say whether `?swarmRound=30` reaches
  the boss.

Commit: `fleet(C01-01): a Swarm run can be won at round thirty`.
