<!-- LIFETIME: RECEIPT -->
# PQ-130.02 Surgical drive — receipt

**State:** done (2026-08-21, commit `fc9d09ae`). **Law:** design law §4, §11.7; playfield §5 item 9; SCREENS_E §6.

## What shipped
- The drill clock owns the cadence: `tickInput(held, dt, { impulse })` — a press is one impulse
  step. Empty face: seat exactly one cell, stamp `MOVE_HOLD_DELAY_S = 0.18s` (no second cell can
  land inside the delay). Past the delay: cruise one cell per `MOVE_CRUISE_INTERVAL_S = 0.24s`
  (`MOVE_COOLDOWN_CARGO = 0.03` → 0.27s full). Rock face: one `BORE_BITE_S = 0.18s` lump of bore
  work, pre-paid as lookahead (`d.boreDebt`) so mashing measures 0.81× an honest hold, never more;
  the bit lingers `BORE_BITE_HOLD_S = 0.45s` so the bite is visible after keyup.
- `createDrillInputController` (src/ui/screens/drill.js) owns no cadence of its own; bounded
  fixed-step catch-up; a tap's promised seat survives keyup, a cruise step does not.
- `asteroidController.js`: OS auto-repeat keydowns discarded; physical key state tracked so releasing
  one of two held directions hands the rig to the other.
- `scripts/check-drill-smooth.mjs` rewritten to the law; fails the banned 0.06s rocket by behaviour
  ("~30 cells in 2s of held key"), independent of the constants. Two rows red on master since
  2026-07-16 repaired (`rockBudgetMax` pinned a product; refill row staged away-time before `end()`).
- New `test/asteroid-drive-cadence.test.mjs` (`npm run check:asteroid-drive-cadence`), 7 sections,
  mutation-tested (deleting the delay consumer, restoring 0.06s, zeroing the bite, removing the
  lookahead each turn it red).

## Evidence
- `asteroid-drive-cadence: PASS` — hold-delay-boundary second cell at 0.183s; cruise mean 0.25s/cell;
  bore-bite cut 3.24 vs 0.30 nibble, rover did not move; mash-vs-hold ratio 0.812, holdRate 1.0;
  key-repeat-is-not-the-clock.
- `check-drill-smooth: PASS` (move-cadence advanced 8, mean 0.25).
- `npm run check:playable`: 14/14 green at the implementer's run.
- `check:baseline` 8/12 at exit: the four sim/determinism links fail on 47a golden divergence caused
  by another lane's uncommitted `ai.js` / `tacticalAI.js` / `physics.js` / `activityScheduler.js` /
  `traffic.js`; reverting this leaf's files reproduces the reds identically. Not this leaf's.
- Drill-adjacent suites green: drill-polish, drill-yield-feedback, asteroid-sites, pq024 ×2,
  contact-ring-law, site-lane-network-contract, ui-screen-imports.

## Handed to the renderer leaf (.03/.07)
- A partially bored cell springs back to pristine when the bit leaves: `syncDigTarget` gates on the
  live `digCell`; drive the sink and crack-stage decal off `tile.hp / tile.maxHp` for any cell with
  `hp < maxHp`.
- `drill:spark` now carries `bore` (0–1) and `bite` (true on a tap); the screen forwards both to
  `renderer.notify('spark')` — consume them (bite flash / spark magnitude).
- BUILD-mode cursor still moves on OS key-repeat (a cursor, not the rig) — `.09`.
- Camera catch-up escape (`CAM_MAX_CELLS_S` cap) is moot at 0.24s/cell; keep an escape for safety.
