<!-- LIFETIME: CAMPAIGN -->
# Q2 - status

**Owner:** Lane 7 QUALITY & VERDICTS. **Route list:** [ROUTES.md](ROUTES.md).

## Done

- The written route list: R1 smoke, R2 first hour, R3 Act I, R4 Acts II-IV, R5 Swarm 1-15, R6
  station screens, R7 save/continue, R8 settings/input, R9 Crucible/racing/sandbox, R10 soak. Each
  names the beats, the pass rule, the red flags and the walk-record shape.

## First pass

- **R1 is green:** `node scripts/check-game-playable.mjs` 18/18 (BOOT, LAUNCH, PILOT, HULL, WORLD,
  CONTROLS, LANE-FWD, SAVE, CONTINUE, reloaded pilot/hull/world/controls, CLEAN, SHADER, ASSETS,
  AUTHORED HULL). The only warning is authored pipeline staging after 25 s on a contended host; the
  route still draws a stand-in and passes, so it is filed to E6/E9, not Q2.
- **R5/R6/R7 focused checks already exist** (`check:crucible:run`, `check:station-tabs`,
  `check:market-first-loop`, `check:save-import-safety`, `check:title-continue-runtime`); they are
  not a substitute for the walk but they catch the mechanical regressions before a walker spends
  an hour.

## Next

1. Walk R2/R3 on the ordinary route after the W1 fixer lands; record the ten "what next" answers.
2. Walk R5 after the E3 Line regression fix (the Crucible must keep latch/tow/throw).
3. Walk R6 at 960x540 and 1920x1080 after the UI-layout PR batch lands.
4. File only material defects; repeat the route, not the whole board.
