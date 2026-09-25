// PQ-029.00 — the live Range teaches the tractor throw.
//
// Seed 29000. A player who opens the Range can run the tractor_throw rung.
// This drives that rung (not the scenario file): latch, spin the boom, cut.
// Prints duration and release speed / that hull's cruise.
import assert from 'node:assert/strict';
import test from 'node:test';

import { mulberry32 } from '../src/core/rng.js';
import {
  RANGE_RAIL_ROWS,
  TRACTOR_THROW_DRILL_ID,
  TRACTOR_THROW_DRILL_SECONDS,
  createTractorThrowRung,
  rangeRungIndex,
  tickTractorThrowDrill,
} from '../src/ui/screens/range.js';

const SEED = 29000;
const DT = 1 / 60;
const THROW_RATIO = 1.2;
// Latch, yaw the boom for 24 ticks, cut on tick 25. The pod still has line left,
// so hull yaw alone is enough swing to clear the gate above cruise.
const CUT_TICK = 25;

test('the Range throw drill finishes inside 60s at >= 1.2x cruise on seed 29000', () => {
  const rng = mulberry32(SEED);
  assert.ok(rng() >= 0, 'seed 29000 must drive the fixture rng');

  const row = RANGE_RAIL_ROWS.find((entry) => entry.id === TRACTOR_THROW_DRILL_ID);
  assert.ok(row, 'a player opening the Range has no tractor throw rung');
  assert.equal(rangeRungIndex(TRACTOR_THROW_DRILL_ID), 7);
  assert.ok(row.durationSeconds <= 60, `drill must teach inside 60 s, got ${row.durationSeconds}`);
  assert.equal(TRACTOR_THROW_DRILL_SECONDS, 60);

  const sim = createTractorThrowRung({ variant: 'light', shipId: 'ship_kestrel' });
  assert.equal(sim.payload.mass, 4, 'the teaching payload is the light pod');
  const cruise = sim.cruise;
  assert.ok(cruise > 0, 'the hull must have a cruise speed');

  let result = { verdict: null };
  const limitTicks = Math.ceil(TRACTOR_THROW_DRILL_SECONDS / DT) + 2;
  for (let tick = 0; tick < limitTicks && !result.verdict; tick += 1) {
    const input = {};
    let toggleTether = false;
    if (tick === 0) toggleTether = true;
    if (tick > 0 && tick < CUT_TICK) input.turnRight = true;
    if (tick === CUT_TICK) toggleTether = true;
    result = tickTractorThrowDrill(sim, DT, { input, toggleTether });
  }

  const release = sim.tether.throwSpeed;
  const ratio = release / cruise;
  console.log(`RANGE_THROW seed=${SEED} duration=${sim.timeS.toFixed(2)}s limit=${TRACTOR_THROW_DRILL_SECONDS} release=${release.toFixed(1)} cruise=${cruise} ratio=${ratio.toFixed(2)}`);
  assert.ok(result.verdict, 'the drill must reach a verdict');
  assert.equal(result.verdict.kind, 'clear', result.verdict.because || 'drill did not clear');
  assert.ok(result.cleared, 'clearing the gate marks the rung taught');
  assert.ok(sim.timeS <= TRACTOR_THROW_DRILL_SECONDS, `taught in ${sim.timeS.toFixed(2)}s, over the 60 s bar`);
  assert.ok(ratio >= THROW_RATIO, `release must be >= ${THROW_RATIO}x cruise (${(THROW_RATIO * cruise).toFixed(1)}), got ${release.toFixed(1)} (${ratio.toFixed(2)}x)`);
});
