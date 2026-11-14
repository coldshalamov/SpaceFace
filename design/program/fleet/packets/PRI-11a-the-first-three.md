# PRI-11a — Swarm round one: three Wasps first, then the rest through the same gate (#942, rebuilt)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first. Then `.devshots/pr-intake/reviews/recon-942.md`
**Part A** (what master does on an ordinary round-one launch, with file:line for every number) and row
**F1**; and the senior review's rebuild plan, `.devshots/pr-intake/reviews/codex-dot-big.md` "#942".

## The problem (measured by the recon)
`design/game/20_THE_FIRST_HOUR.md` promises the first **three Wasps enter before the pack**;
`design/game/12_SWARM_THE_PIT.md` names round 1 *ten Wasps, one gate*. On master, on the ordinary route
(training option off), all ten Wasps dispatch at t≈0 (`src/data/swarmCourseCast.js:62-65`) **and** the
Brood's opening cohort floods every bearing in the same instant (`src/systems/swarmArena.js:1040-1052`,
`src/data/swarmBrood.js`). A newcomer's first throw happens inside a crowd. PR #942 tried to fix this
with a second clock inside the Brood owner and three Mites; that foundation is wrong (two release owners,
wrong cast) — **bring none of its `swarmOpeningVolley.js` / `openingBeat` / `openingRamp` code.**

## Build — one owner, one schedule
Round 1 of the authored course on the ordinary route becomes:
1. **t = 0:** three Wasps through the round's one gate (gate index 0). Nothing else. No Brood.
2. **The beat ends** when the first of these happens: one of the three dies; or the pilot has acted
   (the existing "pilot has acted" fact — `swarmPilotHasActed` / the first-action token in
   `src/systems/swarmSafety.js`) and 10 active sim-seconds have passed since; or 20 active sim-seconds
   since the wave started (a pilot who does nothing still gets a round).
3. **Then:** the remaining seven Wasps come through the same gate in the existing batch cadence, and the
   Brood hold releases (its ordinary round-1 plan, unchanged in size).
How:
- Author it in the cast table: round 1's package becomes two packages on gate 0 — three Wasps `atTick: 0`,
  seven Wasps owed to the beat (use the existing `staged`/owed-arrival package semantics the wave owner
  already has for debuts — `survivalWave.js` ~1059-1067 — or add one explicit field such as
  `afterOpeningBeat: true`; do not add a parallel ledger).
- The **wave owner** (`src/systems/survivalWave.js`) owns the beat and releases the owed package through
  its existing pending schedule. Active time only (paused time does not count); repeated updates must not
  spend the clock twice; a blocked seat stays owed and is retried at the existing cadence, never burst.
- The **Brood** (`src/systems/swarmArena.js` `_onWaveStarted` / the Brood plan) asks the wave owner
  whether the opening beat is still open before admitting its round-1 cohort, and is told when it ends
  (an event the wave owner emits once, e.g. `swarm:openingBeatEnded { wave, runToken }` — sim-side only,
  no lane forwarding needed; check). No second timer in the Brood.
- Scope: authored course, round 1, ordinary route, every arena whose round-1 cast is the Wasp gate.
  Rounds 2–30, endless rounds, circuits, practice and `?swarmRound=N` starts past round 1 are untouched.
  The optional training lesson (`applyOpeningLesson`, one Wasp, 45 s) keeps working exactly as today when
  the player turns it on — prove it.
- Do **not** change the kill quota (`SWARM_OPENING_QUOTA`), the Brood population law, any other round's
  cast, or seeded RNG draw order outside this beat. If the quota of fifteen makes the round outlast the
  design's "ten Wasps", say so under "Guesses I made" with the numbers — the lead will decide.
- Retry and Continue: the beat re-arms with the run token exactly like the existing first-action
  protection; a retried round one opens with three again.

## Tests — new `test/swarm-opening-first-three.test.mjs`, through the real wave/arena owners and a real seed
- Ordinary launch: at the first materialised tick exactly three Wasps are alive and zero Brood bodies.
- Kill one → the seven arrive through gate 0 (same bearing as the three) and the Brood cohort begins.
- Never act → the rest arrive at the 20 s ceiling, not before.
- Act without killing → the rest arrive 10 active seconds after the first action.
- Pause during the beat → no time is spent; resume continues it.
- Retry → three again. Round 2 → unchanged from master (compare its first-tick composition with and
  without this change by asserting today's numbers).
- Training option on → today's single-Wasp lesson, unchanged.
- No duplicate arrivals when `update` runs twice in a tick; total Wasps fielded by the cast = ten.
Adapt the useful cases from the PR's `test/swarm-opening-{volley,beat,course,pack-spacing,arrival-ramp}.test.mjs`
(blocked seats stay owed, no teleports, same-seed retry) and drop the ones that pin three Mites, an
18-body packet or a 0.75 s clock.

## Files you may edit
`src/data/swarmCourseCast.js`, `src/systems/survivalWave.js`, `src/systems/survivalWavePlanner.js`,
`src/systems/swarmArena.js`, `src/systems/swarmBrood.js` (hold/release hook only), the new test, and
existing Swarm tests that pin round one's first-tick flood (list each with the one-line reason;
`design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that already fail — report, do not "fix").
Another agent works the Swarm reds (queue row KNOWN-REDS-SWARM): a file with foreign changes in
`git diff` is not yours — do the rest, re-check every ten minutes for up to thirty, then report Blocked.

## Checks
The new test; then `node --test test/swarm-course-cast.test.mjs test/crucible-swarm-arena.test.mjs test/swarm-first-throw-contact.test.mjs test/swarm-opening-terrain.test.mjs test/swarm-opening-court-continuity.test.mjs`
(four minutes per file); `npm run check:src-imports`.
One look through the lock: `node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=swarm --rounds=1 --duration=45 --out=.devshots/fleet/pri-11a`
— say what is on screen at 2 s, 8 s and 20 s (three Wasps alone? when does the pack arrive?), and name the
capture paths.

Commit: `fleet(PRI-11a): Swarm round one opens with three Wasps; the pack and the Brood follow the first kill`.
