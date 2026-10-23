// The other half of the stall notice (see physics-authority-stall.test.mjs): the shared Rapier runtime
// can be sitting in its failure backoff (15 s -> 120 s) because ANOTHER start failed. This physics
// instance then mints nothing and sees no rejection of its own, but the ship is just as dead, so
// `rapierRuntimeBlocked()` alone is enough to report it.
//
// Its own file: the runtime caches a successful load for the whole process, so the two failed loads
// below only fail in a process where no earlier test started Rapier.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { loadRapierCompatRuntime, rapierRuntimeBlocked } from '../src/core/rapierCompatRuntime.js';

test('a retry backoff that is still blocking counts even when this instance saw no rejection', async (t) => {
  const clock = { t: 5000 };
  Object.defineProperty(performance, 'now', { value: () => clock.t, configurable: true, writable: true });
  t.after(() => { delete performance.now; });

  const failing = () => loadRapierCompatRuntime({ importModule: async () => { throw new Error('no wasm (test)'); } });
  await failing().catch(() => {});
  await failing().catch(() => {});
  assert.equal(rapierRuntimeBlocked(), true, 'precondition: two failures arm the backoff');

  const bus = createBus();
  const sim = createSimulation({ seed: 260926, bus, systems: [physics] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, mass: 24,
    hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  const stalled = [];
  const toasts = [];
  bus.on('physics:authorityStalled', (p) => stalled.push(p));
  bus.on('toast', (p) => toasts.push(p));

  for (let i = 0; i < 100; i += 1) { clock.t += 1000 * SIM_DT; sim.step(SIM_DT); }
  assert.equal(stalled.length, 0, 'not before 3 s');
  for (let i = 0; i < 100; i += 1) { clock.t += 1000 * SIM_DT; sim.step(SIM_DT); }
  assert.equal(stalled.length, 1, 'reported once the 3 s have passed');
  assert.equal(toasts.length, 1);
  assert.ok(stalled[0].retryInMs > 0, 'the payload says how long until the next attempt');
});
