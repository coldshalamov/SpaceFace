// The deferred corpse-decoration lane (burst fix): entity:killed fan-out used to call
// spawnEntity recursively inside the kill emit, so a wave wipeout minted every wreck,
// shard, pod and tear-off chip inside the routeDamage stack that billed it. Kill listeners
// now enqueue helpers.deferEntitySpawnJob; lifetimeSweep drains a bounded number per step
// through the spawnBudget mint lane — owe, never drop. Run:
//   node --test test/core-deferred-spawn.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';

const DT = 1 / 60;

function harness() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.tick = 40;
  state.simTime = 1;
  state.ui = {};
  state.world = { currentSectorId: 'sector_helios_prime', sectors: {} };
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers };
}

test('enqueued jobs drain through lifetimeSweep, bounded per step, FIFO, never dropped', () => {
  const h = harness();
  const spawned = [];
  const order = [];
  for (let i = 0; i < 12; i += 1) {
    h.helpers.deferEntitySpawnJob(() => {
      order.push(i);
      spawned.push(h.helpers.spawnEntity({
        type: 'wreck', pos: { x: i, z: 0 }, vel: { x: 0, z: 0 }, hull: 1, hullMax: 1,
        data: { markerId: `m${i}` },
      }));
    });
  }
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 12);
  h.state.tick += 1;
  core.lifetimeSweep(DT, h.state);
  assert.equal(spawned.length, 8, 'the step drains at most the per-step job bound');
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 4, 'the remainder stays owed');
  h.state.tick += 1;
  core.lifetimeSweep(DT, h.state);
  assert.equal(spawned.length, 12, 'a later step settles the whole debt — nothing dropped');
  assert.deepEqual(order, [...Array(12).keys()], 'jobs run in enqueue order');
  assert.ok(spawned.every((e) => e && e.alive !== false && e.type === 'wreck'));
  core.destroy();
});

test('the mint lane gates decoration but always lets at least one owed job run', () => {
  const h = harness();
  h.helpers.spawnBudget = makeBudgetApi(h.state);
  // A hostile wave's grant charges the lane — corpse decoration sees the committed mints.
  h.helpers.spawnBudget.consumeMint(16);
  let ran = 0;
  for (let i = 0; i < 4; i += 1) {
    h.helpers.deferEntitySpawnJob(() => { ran += 1; });
  }
  core.lifetimeSweep(DT, h.state);
  assert.equal(ran, 1, 'an exhausted mint lane still drains one job — owed work cannot starve');
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 3);
  h.state.tick += 1;
  core.lifetimeSweep(DT, h.state);
  assert.equal(ran, 4, 'the re-opened lane settles the debt next step');
  core.destroy();
});

function withQuietErrors(fn) {
  const originalError = console.error;
  const logged = [];
  console.error = (...args) => { logged.push(args.map(String).join(' ')); };
  try { fn(); } finally { console.error = originalError; }
  return logged;
}

test('a job that throws is owed a retry on a later step: a passing fault loses nothing and order is kept', () => {
  const h = harness();
  const ran = [];
  let faults = 0;
  h.helpers.deferEntitySpawnJob(() => { ran.push('a'); });
  h.helpers.deferEntitySpawnJob(() => { ran.push('flaky'); faults += 1; if (faults < 3) throw new Error('passing fault'); });
  h.helpers.deferEntitySpawnJob(() => { ran.push('b'); });
  let logged = [];
  logged = withQuietErrors(() => {
    core.lifetimeSweep(DT, h.state);
    assert.deepEqual(ran, ['a', 'flaky'], 'the step stops at the failed job; the jobs behind it keep their turn');
    assert.equal(h.helpers.pendingEntitySpawnJobs(), 2, 'the failed job is still owed, at the front');
    core.lifetimeSweep(DT, h.state);
    assert.deepEqual(ran, ['a', 'flaky', 'flaky'], 'the next step tries the same job first');
    assert.equal(h.helpers.pendingEntitySpawnJobs(), 2);
    core.lifetimeSweep(DT, h.state);
  });
  assert.deepEqual(ran, ['a', 'flaky', 'flaky', 'flaky', 'b'], 'the third try succeeds and the queue carries on in order');
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 0);
  assert.equal(logged.length, 2, 'each failed try is logged once');
  assert.ok(logged.every((line) => line.includes('deferred spawn job failed')));
  core.destroy();
});

test('a job that keeps failing is dropped after three tries, logged, and cannot stall the rest', () => {
  const h = harness();
  const ran = [];
  let tries = 0;
  h.helpers.deferEntitySpawnJob(() => { tries += 1; throw new Error('poison'); });
  h.helpers.deferEntitySpawnJob(() => { ran.push('b'); });
  let logged = [];
  logged = withQuietErrors(() => {
    core.lifetimeSweep(DT, h.state);
    core.lifetimeSweep(DT, h.state);
    assert.deepEqual(ran, [], 'while the job still has tries left, nothing runs past it');
    core.lifetimeSweep(DT, h.state);
  });
  assert.equal(tries, 3, 'one try per step, three in all');
  assert.deepEqual(ran, ['b'], 'the job behind a dropped one runs in the same step');
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 0);
  assert.equal(logged.length, 3);
  assert.ok(logged[2].includes('dropped'), 'the last log says the job was dropped');
  core.destroy();
});

test('state teardown drops the decoration queue — continuous handoffs keep it', () => {
  const h = harness();
  h.helpers.deferEntitySpawnJob(() => {});
  h.bus.emit('sector:exit', {});
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 0, 'a hard sector exit retires old-sector jobs');
  h.helpers.deferEntitySpawnJob(() => {});
  h.bus.emit('sector:exit', { continuous: true });
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 1, 'a membership handoff keeps the world');
  h.bus.emit('save:restoring', {});
  assert.equal(h.helpers.pendingEntitySpawnJobs(), 0, 'a restore retires captured-state jobs');
  core.destroy();
});
