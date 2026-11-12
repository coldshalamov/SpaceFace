import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createDeterministicEventTrace } from '../src/core/eventTrace.js';

test('a full event trace retains ordered receipts and can start a fresh sequence', () => {
  const bus = createBus();
  const state = { tick: 0, simTime: 0 };
  const trace = createDeterministicEventTrace(bus, state, { cap: 3, events: ['jump:arrive', 'tether:cut'] });
  for (let tick = 0; tick <= 7; tick += 1) {
    state.tick = tick;
    state.simTime = tick / 60;
    bus.emit(tick % 2 ? 'jump:arrive' : 'tether:cut', { body: { z: -tick, x: tick } });
  }
  const rows = trace.snapshot();
  assert.deepEqual(rows.map(({ seq, tick, type, payload }) => [seq, tick, type, payload.body]), [
    [5, 5, 'jump:arrive', { x: 5, z: -5 }],
    [6, 6, 'tether:cut', { x: 6, z: -6 }],
    [7, 7, 'jump:arrive', { x: 7, z: -7 }],
  ]);
  rows[0].payload.body.x = 0;
  assert.equal(trace.snapshot()[0].payload.body.x, 5);

  trace.clear();
  assert.deepEqual(trace.snapshot(), []);
  bus.emit('jump:arrive', { sectorId: 'sector_ceres_belt' });
  assert.deepEqual(trace.snapshot(), [{
    seq: 0, tick: 7, simTime: 0.116667, type: 'jump:arrive', payload: { sectorId: 'sector_ceres_belt' },
  }]);
  trace.dispose();
  bus.emit('tether:cut', {});
  assert.equal(trace.snapshot().length, 1);
});
