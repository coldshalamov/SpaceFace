// PQ-130.02 "Surgical drive" — the cadence law, proved on the real drill clock without a browser.
//
// ASTEROID_WORKS_DESIGN_LAW.md §4 / §11.7 and ASTEROID_WORKS_PLAYFIELD.md §5 item 9 say the rig is
// a heavy machine you PLACE:
//
//   1. a tap toward an empty cell seats exactly one cell and stops — every time;
//   2. a hold shorter than MOVE_HOLD_DELAY_S can never produce a second cell;
//   3. a hold past the delay cruises, still one cell per beat, at MOVE_CRUISE_INTERVAL_S (inside
//      the authored 0.22–0.28 s/cell band);
//   4. releasing stops the chain at the current cell;
//   5. a tap toward ROCK is a bore bite you can see — real progress on the target cell, the
//      crack/bite hooks fed, and no movement;
//   6. browser key auto-repeat is NOT the movement clock. The drill clock is.
//
// The discriminating assertion in here is the timestamp of the SECOND cell. It lands at the hold
// delay (~0.183 s), not at the cruise interval (0.25 s) and not at the old 0.06 s rocket beat
// (~0.067 s), so both named constants are load-bearing: zero MOVE_HOLD_DELAY_S and this file goes
// red, widen the cruise interval and it goes red for a different reason.
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  drill,
  DRILL_CONST,
  MOVE_HOLD_DELAY_S,
  MOVE_CRUISE_INTERVAL_S,
  MOVE_COOLDOWN_BASE,
  MOVE_COOLDOWN_CARGO,
  BORE_BITE_S,
  BORE_BITE_HOLD_S,
  moveCooldownForLoad,
  materialHardness,
} from '../src/systems/drill.js';
import { cargo } from '../src/systems/cargo.js';
import { createDrillInputController } from '../src/ui/screens/drill.js';
import { createAsteroidController, MODES } from '../src/ui/asteroid/asteroidController.js';

const STEP = 1 / 60;              // the drill clock's fixed step
const CRUISE_BAND = [0.22, 0.28]; // design law §4 / SCREENS_E §6: steerable in a tunnel

function createBus() {
  const handlers = new Map();
  return {
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type)?.delete(fn);
    },
    emit(type, payload) {
      const set = handlers.get(type);
      if (!set) return;
      for (const fn of set) fn(payload);
    },
  };
}

function setup(seed = 130002) {
  const state = createGameState(seed);
  const bus = createBus();
  const ctx = {
    state,
    bus,
    helpers: { routeCombatDamage() { return { ok: true }; } },
    registry: { get() { return null; } },
  };
  cargo.init(ctx);
  drill.init(ctx);
  state.player.cargo = { items: {}, usedVolume: 0, capVolume: 100, capMass: 100 };
  if (!state.entities.has(state.playerId)) {
    state.entities.set(state.playerId, { id: state.playerId, hull: 100, hullMax: 100, data: {} });
  }
  assert.ok(drill.begin(seed), 'drill session begins');
  return { state, bus, ctx };
}

/** Hollow a vertical shaft and park the rover at its top with a clean beat clock. */
function carveShaft(state, rows = 40) {
  const d = state.drill;
  const col = d.avatar.col;
  for (let r = 0; r < rows; r++) {
    d.field[col][r] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1 };
  }
  d.avatar.row = 0;
  d.avatar.fromCol = col;
  d.avatar.fromRow = 0;
  d.avatar.moveDuration = 0;
  d.avatar.moveElapsed = 0;
  d.moveCooldown = 0;
  return col;
}

/**
 * Press a direction, run the drill clock for `holdSteps` fixed steps, then release and let the
 * world settle. Returns the sim-time stamp of every cell the rover actually crossed, with t=0 at
 * the press acknowledgment.
 */
function holdRun(state, controls, direction, holdSteps, settleSteps = 90) {
  const commits = [];
  let row = state.drill.avatar.row;
  let col = state.drill.avatar.col;
  const sample = (t) => {
    if (state.drill.avatar.row !== row || state.drill.avatar.col !== col) {
      row = state.drill.avatar.row;
      col = state.drill.avatar.col;
      commits.push(Number(t.toFixed(5)));
    }
  };
  controls.press(direction);
  sample(0);
  for (let i = 1; i <= holdSteps; i++) {
    controls.tick(STEP);
    sample(i * STEP);
  }
  controls.release(direction);
  sample(holdSteps * STEP);
  for (let i = 1; i <= settleSteps; i++) {
    controls.tick(STEP);
    sample((holdSteps + i) * STEP);
  }
  return commits;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 1. The authored constants ARE the law (playfield §3 bans the 0.06 s rocket, and a slower one).
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  assert.ok(MOVE_HOLD_DELAY_S > 0, 'a zero hold delay would make every tap chainable');
  assert.ok(MOVE_HOLD_DELAY_S >= 0.15 && MOVE_HOLD_DELAY_S <= 0.22,
    `hold delay must be the authored ~180 ms, got ${MOVE_HOLD_DELAY_S}`);
  assert.ok(MOVE_CRUISE_INTERVAL_S >= CRUISE_BAND[0] && MOVE_CRUISE_INTERVAL_S <= CRUISE_BAND[1],
    `cruise beat must sit in the authored ${CRUISE_BAND[0]}–${CRUISE_BAND[1]} s/cell band, got ${MOVE_CRUISE_INTERVAL_S}`);
  assert.equal(MOVE_COOLDOWN_BASE, MOVE_CRUISE_INTERVAL_S, 'the sim beat IS the cruise interval');
  assert.equal(moveCooldownForLoad(0), MOVE_CRUISE_INTERVAL_S, 'empty holds cruise at the base beat');
  assert.ok(moveCooldownForLoad(1) <= CRUISE_BAND[1] + 1e-9,
    `full holds must still steer: ${moveCooldownForLoad(1)} s/cell`);
  assert.ok(MOVE_COOLDOWN_CARGO > 0, 'cargo still has to cost something');
  assert.ok(MOVE_HOLD_DELAY_S < MOVE_CRUISE_INTERVAL_S,
    'the delay is the floor under the first repeat; the cruise beat is slower still');
  assert.equal(DRILL_CONST.MOVE_HOLD_DELAY_S, MOVE_HOLD_DELAY_S, 'DRILL_CONST publishes the delay');
  assert.equal(DRILL_CONST.MOVE_CRUISE_INTERVAL_S, MOVE_CRUISE_INTERVAL_S, 'DRILL_CONST publishes the beat');
  assert.ok(BORE_BITE_S > 0 && BORE_BITE_HOLD_S > BORE_BITE_S, 'a bite lasts longer than it takes');
  console.log(JSON.stringify({
    ok: true,
    section: 'cadence-constants',
    MOVE_HOLD_DELAY_S,
    MOVE_CRUISE_INTERVAL_S,
    fullHolds: moveCooldownForLoad(1),
    BORE_BITE_S,
    BORE_BITE_HOLD_S,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 2. A tap seats exactly one cell — pressed and released inside the same frame, and again with
//    a sub-threshold hold. Never two.
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const { state } = setup();
  carveShaft(state);
  const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });

  const instant = holdRun(state, controls, 'down', 0, 180);
  assert.equal(instant.length, 1, `a bare tap must seat exactly one cell, got ${instant.length}`);
  assert.equal(state.drill.avatar.row, 1, 'the tap moved the rover one cell and stopped');

  // Three consecutive taps: three cells, no chaining, and no swallowed press — even when the
  // second tap arrives while the previous beat is still running down.
  const before = state.drill.avatar.row;
  for (let i = 0; i < 3; i++) {
    controls.press('down');
    controls.release('down');
    for (let k = 0; k < 6; k++) controls.tick(STEP); // 0.1 s apart: inside the beat, deliberately
  }
  for (let k = 0; k < 60; k++) controls.tick(STEP);
  assert.equal(state.drill.avatar.row - before, 3,
    `three taps must seat three cells, got ${state.drill.avatar.row - before}`);
  console.log(JSON.stringify({ ok: true, section: 'tap-seats-one', instant, taps: state.drill.avatar.row - before }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 3. The hold delay is a real boundary: below it one cell, above it two — and the second cell
//    lands AT the delay, which is what makes MOVE_HOLD_DELAY_S load-bearing rather than decorative.
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const delaySteps = Math.ceil(MOVE_HOLD_DELAY_S / STEP); // the first step at/after the delay
  {
    const { state } = setup(130003);
    carveShaft(state);
    const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });
    const short = holdRun(state, controls, 'down', delaySteps - 1, 180);
    assert.equal(short.length, 1,
      `a ${((delaySteps - 1) * STEP).toFixed(4)} s hold is a tap: one cell, got ${short.length}`);
  }
  {
    const { state } = setup(130004);
    carveShaft(state);
    const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });
    const long = holdRun(state, controls, 'down', delaySteps + 1, 180);
    assert.ok(long.length >= 2,
      `a ${((delaySteps + 1) * STEP).toFixed(4)} s hold must have crossed the delay, got ${long.length}`);
    assert.equal(long.length, 2, `and must not burst past it, got ${long.length} cells`);
    assert.ok(Math.abs(long[1] - MOVE_HOLD_DELAY_S) <= STEP + 1e-9,
      `the second cell must land at the hold delay, got ${long[1]} s (delay ${MOVE_HOLD_DELAY_S} s)`);
    assert.ok(long[1] < MOVE_CRUISE_INTERVAL_S,
      'the delay, not the cruise interval, is what gates the second cell');
    assert.ok(long[1] > 4 * STEP,
      `the old 0.06 s rocket put the second cell near ${(4 * STEP).toFixed(4)} s; got ${long[1]} s`);
    console.log(JSON.stringify({ ok: true, section: 'hold-delay-boundary', delaySteps, long }));
  }
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 4. A real hold cruises: one cell per beat, inside the authored band, and release stops it dead.
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const { state } = setup(130005);
  carveShaft(state);
  const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });

  const holdSteps = 120; // 2 s
  const commits = holdRun(state, controls, 'down', holdSteps, 120);

  // Cell 1 is the tap and cell 2 is delay-gated; the steady state starts at cell 3.
  const cruiseGaps = [];
  for (let i = 3; i < commits.length; i++) cruiseGaps.push(commits[i] - commits[i - 1]);
  assert.ok(cruiseGaps.length >= 4, `a 2 s hold should cruise several cells, saw ${commits.length}`);
  const mean = cruiseGaps.reduce((a, b) => a + b, 0) / cruiseGaps.length;
  for (const gap of cruiseGaps) {
    assert.ok(gap >= CRUISE_BAND[0] - 1e-9 && gap <= CRUISE_BAND[1] + 1e-9,
      `every cruise beat must sit in ${CRUISE_BAND[0]}–${CRUISE_BAND[1]} s, got ${gap}`);
  }
  assert.ok(Math.abs(mean - MOVE_CRUISE_INTERVAL_S) <= STEP + 1e-9,
    `cruise cadence must be the authored beat, got ${mean} s/cell`);

  // A 2 s hold is ~8 cells at the authored beat. The 0.06 s rocket did ~30.
  assert.ok(commits.length <= 12, `a 2 s hold is a walk, not a launch: ${commits.length} cells`);
  assert.ok(commits.length >= 6, `a 2 s hold must actually travel: ${commits.length} cells`);

  // Release stopped the chain: nothing moved during the 2 s of settle ticks after the release.
  const lastCommit = commits[commits.length - 1];
  assert.ok(lastCommit <= holdSteps * STEP + 1e-9,
    `release must stop the chain at the current cell; a cell landed at ${lastCommit} s after a ${holdSteps * STEP} s hold`);
  assert.equal(controls.hasActiveIntent(), false, 'nothing is still armed after release');
  assert.equal(controls.hasOwedSeat(), false, 'a cruise step is not an owed seat — release cancels it');
  console.log(JSON.stringify({ ok: true, section: 'cruise', cells: commits.length, mean }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 5. A tap toward ROCK is a bite you can see: real bore progress, the crack/bite hooks fed, the
//    bit left visibly seated in the cell afterwards, and the rover exactly where it was.
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const { state, bus } = setup(130006);
  const col = carveShaft(state, 6);
  const sparks = [];
  bus.on('drill:spark', (p) => sparks.push(p));

  const rockRow = 3;
  state.drill.avatar.row = rockRow - 1;
  state.drill.avatar.fromRow = rockRow - 1;
  state.drill.moveCooldown = 0;
  state.drill.field[col][rockRow] = {
    type: 'rock', hp: 20, maxHp: 20, hardness: 1, ore: null, hazard: false, tierReq: 1, risk: 'low',
  };
  const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });

  controls.press('down');
  const tile = state.drill.field[col][rockRow];
  const cut = 20 - tile.hp;
  const nibble = drill.getDrillDPS() * STEP;
  const promised = BORE_BITE_S * drill.getDrillDPS() / materialHardness(tile);

  assert.ok(cut > 0, 'a tap on rock is never a silent no-op');
  assert.ok(cut >= promised * 0.95, `the bite must deliver its authored lump: cut ${cut}, promised ${promised}`);
  assert.ok(cut >= nibble * 5, `a bite must be visible, not a 1/60 s nibble (${cut} vs ${nibble})`);
  assert.equal(state.drill.avatar.row, rockRow - 1, 'a bite is not a launch — the rover did not move');
  assert.equal(state.drill.boreBites, 1, 'the session counted exactly one bite');

  const biteSpark = sparks.find((p) => p.bite);
  assert.ok(biteSpark, 'the bite feeds the drill:spark hook the renderer already listens to');
  assert.equal(biteSpark.col, col);
  assert.equal(biteSpark.row, rockRow);
  assert.ok(biteSpark.bore > 0 && biteSpark.bore < 1, `spark carries bore progress, got ${biteSpark.bore}`);
  assert.ok(Math.abs(biteSpark.bore - cut / 20) < 1e-9, 'published bore progress matches the rock');

  // Key up. The crack stage is drawn off avatar.isDrilling / drillTarget, so a bite that retired
  // on keyup would be invisible — the bit stays seated for the rest of BORE_BITE_HOLD_S.
  controls.release('down');
  assert.equal(state.drill.avatar.isDrilling, true, 'the bit stays seated so the bite can be seen');
  assert.deepEqual(state.drill.avatar.drillTarget, { col, row: rockRow }, 'still aimed at the bitten cell');
  for (let i = 0; i < Math.ceil(BORE_BITE_HOLD_S / STEP) + 2; i++) controls.tick(STEP);
  assert.equal(state.drill.avatar.isDrilling, false, 'and lets go once the bite has been read');
  assert.equal(state.drill.avatar.drillTarget, null, 'the bore target retires with the linger');
  assert.equal(state.drill.avatar.row, rockRow - 1, 'lingering never moves the rover');

  // Holding continues the bore rather than restarting it.
  const hpAtRest = state.drill.field[col][rockRow].hp;
  controls.press('down');
  for (let i = 0; i < 30; i++) controls.tick(STEP);
  assert.ok(state.drill.field[col][rockRow].hp < hpAtRest - 5,
    'a hold on rock keeps boring the same cell');
  controls.release('down');
  console.log(JSON.stringify({ ok: true, section: 'bore-bite', cut, promised, nibble }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 6. Mashing is precision, never a shortcut. Measured, not asserted from the same constant that
//    sets the gate: over an identical window of drill-clock time, on an identical rock, a mashed
//    bore must cut STRICTLY LESS than an honest hold. (A bite that added work on top of the
//    continuous grind made tapping the optimal way to mine; the pre-paid lookahead is what fixes
//    it, and this row is what notices if the lookahead ever goes away.)
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const ENDLESS_ROCK = 1e6;
  function boreCut(seed, style, steps) {
    const { state } = setup(seed);
    const col = carveShaft(state, 6);
    const rockRow = 3;
    state.drill.avatar.row = rockRow - 1;
    state.drill.avatar.fromRow = rockRow - 1;
    state.drill.moveCooldown = 0;
    state.drill.field[col][rockRow] = {
      type: 'rock', hp: ENDLESS_ROCK, maxHp: ENDLESS_ROCK, hardness: 1,
      ore: null, hazard: false, tierReq: 1, risk: 'low',
    };
    const controls = createDrillInputController({ drillSys: drill, getState: () => state.drill });
    if (style === 'mash') {
      // press consumes one fixed step, the following tick consumes another: 2 steps per cycle.
      for (let i = 0; i < steps / 2; i++) {
        controls.press('down');
        controls.release('down');
        controls.tick(STEP);
      }
    } else {
      controls.press('down');
      for (let i = 1; i < steps; i++) controls.tick(STEP);
      controls.release('down');
    }
    return { cut: ENDLESS_ROCK - state.drill.field[col][rockRow].hp, bites: state.drill.boreBites };
  }

  const steps = 240; // 4 s of drill-clock time either way
  const mash = boreCut(130007, 'mash', steps);
  const hold = boreCut(130009, 'hold', steps);
  const window = steps * STEP;

  assert.ok(mash.bites >= 2, `mashing must still bite — it is throttled, not ignored (${mash.bites})`);
  assert.ok(mash.cut > 0, 'a mashed bore still cuts rock');
  assert.ok(mash.cut < hold.cut,
    `mashing must never out-cut an honest hold: ${mash.cut.toFixed(2)} vs ${hold.cut.toFixed(2)} HP in ${window}s`);
  // Holding delivers real time as real work: the lookahead is a preview, never a tax.
  const holdRate = hold.cut / (window * drill.getDrillDPS());
  assert.ok(holdRate > 0.95 && holdRate <= 1.0 + 1e-9,
    `a hold must cut one second of rock per second, got ${holdRate.toFixed(4)} of nominal`);
  console.log(JSON.stringify({
    ok: true, section: 'mash-vs-hold', window,
    mashCut: Number(mash.cut.toFixed(3)), holdCut: Number(hold.cut.toFixed(3)),
    ratio: Number((mash.cut / hold.cut).toFixed(3)), bites: mash.bites, holdRate: Number(holdRate.toFixed(4)),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// 7. Browser key auto-repeat is not the movement clock (design law §11.7, SCREENS_E §6). The
//    DRIVE delegation drops repeat keydowns on the floor, and hands off between two held keys.
// ─────────────────────────────────────────────────────────────────────────────────────────────
{
  const { state } = setup(130008);
  carveShaft(state);
  const controlMap = { left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'], scan: ['KeyF'] };
  const controller = createAsteroidController({
    drillSys: drill,
    getDrillState: () => state.drill,
    controlMap,
    hooks: {},
  });
  assert.equal(controller.state.mode, MODES.DRIVE, 'the screen opens in DRIVE');

  const key = (code, repeat = false) => ({ code, repeat, preventDefault() {}, stopImmediatePropagation() {} });
  const startRow = state.drill.avatar.row;

  controller.onKeyDown(key('KeyS'));
  // The OS now floods repeats far faster than any beat. Not one of them may move the rig.
  for (let i = 0; i < 40; i++) controller.onKeyDown(key('KeyS', true));
  assert.equal(state.drill.avatar.row - startRow, 1,
    `auto-repeat must not be the movement clock, moved ${state.drill.avatar.row - startRow} cells`);
  for (let i = 0; i < Math.ceil(MOVE_HOLD_DELAY_S / STEP) - 2; i++) {
    controller.tick(STEP);
    for (let k = 0; k < 3; k++) controller.onKeyDown(key('KeyS', true));
  }
  assert.equal(state.drill.avatar.row - startRow, 1,
    'still one cell while the hold is under the delay, however many repeats arrive');
  controller.onKeyUp(key('KeyS'));
  for (let i = 0; i < 120; i++) controller.tick(STEP);
  assert.equal(state.drill.avatar.row - startRow, 1, 'and the release ends it at one cell');

  // Two directions held; releasing the steering one hands the rig to the key still down.
  const beforeCol = state.drill.avatar.col;
  for (let r = 0; r < 40; r++) {
    state.drill.field[beforeCol - 1][r] = { type: 'empty', hp: 0, maxHp: 0, ore: null, hazard: false, tierReq: 1 };
  }
  controller.onKeyDown(key('KeyS'));   // down
  controller.onKeyDown(key('KeyA'));   // left takes over
  const rowAtHandoff = state.drill.avatar.row;
  controller.onKeyUp(key('KeyA'));     // left released; down is still physically down
  for (let i = 0; i < 40; i++) controller.tick(STEP);
  assert.ok(state.drill.avatar.row > rowAtHandoff,
    'the still-held direction picks the rig back up instead of stalling it');
  controller.onKeyUp(key('KeyS'));
  const settled = state.drill.avatar.row;
  for (let i = 0; i < 120; i++) controller.tick(STEP);
  assert.equal(state.drill.avatar.row, settled, 'with every key up, the rig is parked');
  console.log(JSON.stringify({ ok: true, section: 'key-repeat-is-not-the-clock' }));
}

console.log('asteroid-drive-cadence: PASS');
