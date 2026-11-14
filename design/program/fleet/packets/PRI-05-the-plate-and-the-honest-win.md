# PRI-05 — Gauntlet wave 20 really fights over the plate, and only a real clear counts as the win (#994)

**Lane 2.** Read `design/program/fleet/PR-INTAKE.md` first, then the "#994" section of
`.devshots/pr-intake/reviews/grunt-ec-b.md` (it lists every file and what master already has).

## Why
The thirty-wave scored course already plans a wave-20 system event (`src/data/survivalActs.js`
`WAVE_20_SYSTEM_EVENT`, id `foundry_plate_theft`) and the announcer already says *"Steal the plate."*
(`src/systems/survivalAnnounce.js` ~line 368) — but nothing happens: there is no plate event. PR #994
built one. Separately, "authored victory" is decided loosely (`src/systems/survivalUnlocks.js`
`isAuthoredVictory`, `src/systems/survivalRecords.js` `compact.outcome === 'victory'`), so results that
never cleared the course can claim its rewards.

## Build — three commits

### 1. Only a real clear of the course counts (`fleet(PRI-05): only a real clear of the thirty-wave course claims its win`)
- Bring `src/data/survivalCourse.js` from the PR (`isAuthoredCourse`, `isAuthoredCourseVictory`).
- `survivalRecords.js`: `authoredVictory` comes from `isAuthoredCourseVictory(result, run)`;
  `survivalUnlocks.js`: delete the loose local `isAuthoredVictory`, thread `run` through
  `meetsUnlockCondition` / `evaluateUnlocks` as the PR does (three-way merge both files).
- `survivalWavePlanner.js` `applyDifficulty`: spread `...pkg` instead of enumerating fields (the PR's
  one-hunk change) so authored package fields survive the difficulty re-map. Port nothing else from the
  PR's planner diff.
- **Do not break the Swarm win.** A genuine Swarm run that clears round 30 from round 1 (`C01-01`,
  "THE PIT IS YOURS") must count for every record and unlock exactly as it does on master today. Find
  how that result reaches `survivalRecords` (ruleset, mode stamps) and prove it with a test; if the PR's
  gate would reject it, widen `isAuthoredCourse` to admit that ruleset — do not special-case the caller.
  A run started past round 1 (`?round=N`, practice, circuit, endless "Keep going" past 30 entered
  without the clear) must not count.
- Tests: bring `test/crucible-course-identity.test.mjs` and the PR's line in `test/crucible-meta.test.mjs`;
  add the Swarm cases above.

### 2. The plate event (`fleet(PRI-05): wave 20 — the screens tow the bank plate away unless you stop them`)
- Bring `src/systems/foundryPlateTheft.js` and wire it into `src/systems/survivalArena.js` the way the PR
  does (create it with the room, `preparePlateTheftRoom` at install, arm on the wave-20 plan, `update`,
  `clear` on teardown, expose in diagnostics). Master rewrote the same regions of `survivalArena.js`
  (toys, course machinery): three-way merge and keep all of master's work.
- First confirm the wave-20 plan on master really fields `pd_screen_escort` in the scored course. If it
  fields a different escort id, the thief is that id — say so in the receipt.
- **Fix the PR's cost:** `update` filters the whole `state.entityList` every tick while armed. Collect
  the wave's candidate thieves once when the wave materialises (or on the entity-spawn event the arena
  already hears) and keep them; per tick only check the kept few. No per-tick array allocation.
- The module must stay what its header says: it chooses endpoints and reads poses; it never writes a
  pose, a kill, a reward or the wave-clear verdict.

### 3. It has to matter (`fleet(PRI-05): keeping the plate pays; losing it is said out loud`)
The PR's event has no stakes — kept or stolen, nothing changes. Give it one clear consequence:
- **Kept** (status `secured`: wave cleared with the plate alive and not stolen) pays a bonus. The reward
  owner pays it, not the theft module: `src/systems/survivalRewards.js` listens for
  `survivalArena:plateTheft` with status `secured` and emits one `run:awardRequested`
  `{ credits, reason: 'plate_kept', wave: 20 }`, once per run (guard on the payload's `runToken`).
  Amount: half of what wave 20's ordinary clear pays from the same table `survivalRewards` already uses
  (round down); name the number in the receipt.
- **Stolen** pays nothing.
- **Words** (`survivalAnnounce.js`), exactly these, replacing the old plate lines:
  - wave-20 objective: `They want the bank plate. Stop the tow.`
  - once, when a thief first targets it: `They're on the plate.`
  - appended to the wave-clear line: kept → `Plate kept.` · stolen → `Plate's gone.`
  Remove the old `Steal the plate…` / `holds the plate` / `A plate-theft signature.` wording.
- Tests: bring `test/crucible-plate-theft.test.mjs` and `test/crucible-plate-theft-ai.test.mjs`; add the
  bonus-once case (real `run:awardRequested` through `runSession.award`), stolen-pays-nothing, and the
  three lines. Assertions that pin the PR's old announcer text follow the new text.

## Drop, do not port
`src/render/renderer.js`, `src/render/renderPackageManifest.js`, `assets/**`, `test/ashline-*.test.mjs`
(stale Ashline repair); `src/data/survivalActs.js` and `src/systems/survivalWave.js` changes (master's
`capitalScore` / `gauntletRegent` path already runs the Regent's score). Bring
`test/crucible-forge-regent.test.mjs` only if it passes unchanged against master's mechanism; otherwise
leave it out and say so.

## Files you may edit
`src/data/survivalCourse.js`, `src/systems/foundryPlateTheft.js`, `src/systems/survivalArena.js`,
`src/systems/survivalAnnounce.js`, `src/systems/survivalRecords.js`, `src/systems/survivalUnlocks.js`,
`src/systems/survivalWavePlanner.js`, `src/systems/survivalRewards.js`, the test files named above, and
existing tests that pin the replaced announcer text or the loose victory rule (list each with a reason).

## Checks
`node --test test/crucible-course-identity.test.mjs test/crucible-meta.test.mjs test/crucible-plate-theft.test.mjs test/crucible-plate-theft-ai.test.mjs`
then the existing tests of what you touched, in one call:
`node --test $(grep -ln "survivalUnlocks\|survivalRecords\|survivalAnnounce\|survivalRewards\|survivalArena" test/*.mjs | tr '\n' ' ')`
— report pass/fail counts; `design/program/fleet/packets/KNOWN-REDS-SWARM.md` lists reds that already
fail on master (report, do not "fix"). `npm run check:src-imports`.
One look through the lock, after all three commits:
`node scripts/fleet/game-lock.mjs run -- npm run player-truth -- --mode=gauntlet --start-wave=20 --waves=1 --duration=60 --out=.devshots/fleet/pri-05-plate`
(if that flag set is not supported, find the nearest supported one with `npm run player-truth -- --help`
and say which you used) — say whether the escorts visibly line onto the plate and whether a line of the
three appears.
