# FIX-R4b — An invalid `?sector=` falls back to the ordinary boot

**Lane 3.** Source: `design/program/fleet/reviews/2026-11-11-b14da677.md`, finding [LOW] "An invalid sector
parameter still skips the menu and starts a fresh run" (`src/main.js:~735`, G17-02 commit 7040bd2c).

## Job
With `?sector=not_a_real_sector`, the game logs "starting normally" but still suppresses first-run
onboarding, dismisses the confirm and emits `game:new`. Change the `?sector=` block so that the launch,
the onboarding override, the confirm dismissal and the arrival polling run **only for a resolved sector id**;
for an invalid id, log the one plain line and leave the ordinary boot (title, menu, first-run prompt)
completely untouched.

## Checks
Extend `test/start-in-sector.test.mjs` (or the pure helper it tests) with an invalid id → no launch, no
overrides. `node --test test/start-in-sector.test.mjs`. Change only the `?sector=` block in `src/main.js`
and its test. Commit: `fix(G17-02): an invalid ?sector= leaves the ordinary boot alone`.
