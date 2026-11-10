import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { partitionUpdateSystems } from '../src/core/catchupPolicy.js';
import { createSimulation } from '../src/core/sim.js';
import { CALENDAR_CLOCK_IDS } from '../src/runtime/authoritativeSystemManifest.js';
import { crafting } from '../src/systems/crafting.js';
import { economy } from '../src/systems/economy.js';

function stub(name, ran) {
  return {
    name,
    update(dt, state) {
      ran.push({ name, dt, simTime: state && state.simTime, tick: state && (state.tick | 0) });
    },
  };
}

test('calendar owner dt deltas sum to simulation time through its last invocation at every fps', () => {
  for (const fps of [1, 2, 3, 4]) {
    const ran = [];
    const systems = [
      stub('physics', ran),
      ...CALENDAR_CLOCK_IDS.map((id) => stub(id, ran)),
    ];
    const sim = createSimulation({ seed: 1, systems });
    sim.state.runtime = { profileId: 'production' };
    sim.state.tick = 60;
    for (let i = 0; i < 600; i++) {
      sim.state.simCatchupIndex = i % fps;
      sim.step(1 / 60);
    }
    const physicsRows = ran.filter((row) => row.name === 'physics');
    const physicsSum = physicsRows.reduce((acc, row) => acc + row.dt, 0);
    assert.ok(Math.abs(physicsSum - 600 / 60) < 1e-9, `fps ${fps}: table keeps fixed dt, got ${physicsSum}`);
    for (const id of CALENDAR_CLOCK_IDS) {
      const rows = ran.filter((row) => row.name === id);
      const sum = rows.reduce((acc, row) => acc + row.dt, 0);
      const last = rows[rows.length - 1].simTime;
      assert.ok(Math.abs(sum - last) < 1e-6,
        `fps ${fps}: ${id} dt sum ${sum} must equal sim time through its last invocation ${last}`);
    }
    sim.dispose();
  }
});

test('a real crafting job accumulates game time: a 1 s job completes in about a second', () => {
  const craftingSystem = Object.create(crafting);
  craftingSystem._grantProduct = () => true;
  const sim = createSimulation({ seed: 1, systems: [craftingSystem] });
  sim.state.runtime = { profileId: 'production' };
  sim.state.crafting.queues.st_test = {
    bpId: 'test', elapsed: 0, total: 1, done: false, stationId: 'st_test',
  };
  for (let i = 0; i < 120 && sim.state.crafting.queues.st_test; i++) {
    sim.step(1 / 60);
  }
  assert.equal(sim.state.crafting.queues.st_test, null, 'the one-second job must finish');
  assert.ok(sim.state.simTime <= 1.6, `the job completed at simTime ${sim.state.simTime}`);
  sim.dispose();
});

test('a real economy system emits its first economy:tick inside ~5.5 simulation seconds', () => {
  const sim = createSimulation({ seed: 1, systems: [economy] });
  sim.state.runtime = { profileId: 'production' };
  const ticks = [];
  sim.bus.on('economy:tick', () => ticks.push(sim.state.simTime));
  for (let i = 0; i < 360 && ticks.length === 0; i++) {
    sim.step(1 / 60);
  }
  assert.equal(ticks.length, 1, 'economy:tick must arrive — the accumulator sees real elapsed time');
  assert.ok(ticks[0] <= 5.5, `first economy:tick at ${ticks[0]} s, not ~150 s`);
  sim.dispose();
});

test('updateDt gives production calendar owners elapsed sim time; table and foreign hosts keep fixed dt', () => {
  const bus = createBus();
  const state = { runtime: { profileId: 'production' }, simTime: 5, tick: 40 };
  const cal = stub('barkDirector', []);
  const tab = stub('physics', []);
  const partitions = partitionUpdateSystems([tab, cal], { state, bus });
  assert.equal(partitions.updateDt(tab, 1 / 60, state), 1 / 60, 'table owners keep the fixed dt');
  state.simTime = 5.5;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 0.5, 'elapsed sim time since the supplied baseline');
  state.simTime = 6;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 0.5);
  state.simTime = 6;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 0, 'a pause gap with unchanged simTime accrues zero');
  state.simTime = 2;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 1 / 60, 'a backwards clock uses fixed dt, never negative');
  state.simTime = Number.NaN;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 1 / 60, 'an invalid timestamp uses fixed dt');
  const legacy = { runtime: { profileId: 'legacy47a' }, simTime: 9, tick: 2 };
  assert.equal(partitions.updateDt(cal, 1 / 60, legacy), 1 / 60, 'legacy hosts keep fixed dt');
  const unprofiled = { simTime: 9, tick: 2 };
  assert.equal(partitions.updateDt(cal, 1 / 60, unprofiled), 1 / 60, 'unprofiled hosts keep fixed dt');
  const otherProd = { runtime: { profileId: 'production' }, simTime: 99, tick: 1 };
  assert.equal(partitions.updateDt(cal, 1 / 60, otherProd), 1 / 60, 'an unfamiliar state initializes from now');
  partitions.dispose();
});

test('updateDt falls back to fixed dt when finite endpoints overflow the subtraction', () => {
  const bus = createBus();
  const state = { runtime: { profileId: 'production' }, simTime: -1e308, tick: 2 };
  const cal = stub('missions', []);
  const partitions = partitionUpdateSystems([cal], { state, bus });
  state.simTime = 1e308;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 1 / 60,
    'a +Infinity elapsed delta must degrade to the fixed dt');
  state.simTime = 100;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 1 / 60,
    'the re-based stamp keeps guarding a backwards clock');
  state.simTime = 100.5;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 0.5, 'finite deltas recover normally');
  partitions.dispose();
});

test('game:new and save events reset the calendar clock baseline so restores never pay prior-run time', () => {
  const bus = createBus();
  const state = { runtime: { profileId: 'production' }, simTime: 100, tick: 2 };
  const cal = stub('missions', []);
  const partitions = partitionUpdateSystems([cal], { state, bus });
  state.simTime = 130;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 30, 'elapsed since the supplied baseline');
  bus.emit('game:new');
  state.simTime = 0.25;
  const afterNew = partitions.updateDt(cal, 1 / 60, state);
  assert.ok(afterNew >= 0 && afterNew <= 0.25, `post-reset elapsed must not reach the prior run, got ${afterNew}`);
  state.simTime = 60;
  partitions.updateDt(cal, 1 / 60, state);
  bus.emit('save:restoring');
  state.simTime = 500;
  bus.emit('save:loaded');
  state.simTime = 500.5;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 0.5,
    'a reset across the load boundary yields only post-reset elapsed time');
  partitions.dispose();
});

test('a partition without state or bus still queues and uses fixed dt on its first call', () => {
  const partitions = partitionUpdateSystems([stub('barkDirector', []), stub('physics', [])]);
  assert.equal(partitions.all.length, 2);
  const cal = partitions.calendar[0];
  const state = { runtime: { profileId: 'production' }, simTime: 50, tick: 30 };
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 1 / 60, 'the first call initializes from now');
  state.simTime = 51;
  assert.equal(partitions.updateDt(cal, 1 / 60, state), 1, 'later calls measure elapsed sim time');
  partitions.dispose();
});

test('partition dispose unsubscribes every clock listener and releases timestamps', () => {
  const bus = createBus();
  const listenerCount = () => {
    let n = 0;
    for (const set of bus._listeners.values()) n += set.size;
    return n;
  };
  const baseline = listenerCount();
  const partitions = partitionUpdateSystems([stub('missions', [])], { state: {}, bus });
  assert.equal(listenerCount(), baseline + 3, 'game:new, save:restoring and save:loaded each hold a listener');
  partitions.dispose();
  assert.equal(listenerCount(), baseline, 'dispose returns the bus to its baseline');
});
