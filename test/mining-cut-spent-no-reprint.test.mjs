import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { allocateEntityId } from '../src/core/entity.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import { mining as miningBase } from '../src/systems/mining.js';

// A held beam on a wreck CUT must free the section exactly once. The old _applyCut reset its
// progress and re-spawned a payload every time the threshold re-crossed (a cargo printer).

function boot(wreckData) {
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 6, flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };
  const wreck = {
    id: 42, type: 'wreck', alive: true, pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 10, mass: 300, hull: 1, hullMax: 1, data: { ...wreckData },
  };
  const state = {
    mode: 'flight', playerId: player.id, simTime: 0, tick: 0, meta: { seed: 4242 },
    rng: mulberry32(4242),
    player: { credits: 100, cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player], [wreck.id, wreck]]),
    entityList: [player, wreck], freeIds: [], nextEntityId: 100,
    world: { currentSectorId: 'sector_test' },
  };
  const bus = createBus();
  const ev = { cut: [], start: [], stop: [] };
  bus.on('salvage:cutComplete', (p) => ev.cut.push(p));
  bus.on('mining:start', (p) => ev.start.push(p));
  bus.on('mining:stop', (p) => ev.stop.push(p));
  const helpers = {
    spawnEntity(spec) {
      const e = { alive: true, ...spec, id: spec && spec.id != null ? spec.id : allocateEntityId(state), data: spec.data || {} };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      return e;
    },
  };
  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, wreck, ev };
}

function hold(state, mining, seconds) {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) {
    state.input.fireGroup = 2;
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
  }
}

const payloads = (state) => state.entityList.filter((e) => e.id >= 100);

test('holding the beam on a finished cut mints its payload once, not per threshold crossing', () => {
  const { state, bus, mining, wreck, ev } = boot({});
  try {
    hold(state, mining, 4);
    assert.equal(ev.cut.length, 1, 'the cut completes');
    assert.equal(wreck.data.cutSpent, true, 'the finished cut is latched as spent');
    const afterFirst = payloads(state).length;
    assert.ok(afterFirst >= 1);
    hold(state, mining, 60);
    assert.equal(ev.cut.length, 1, 'a long hold on the spent hulk does not complete another cut');
    assert.equal(payloads(state).length, afterFirst, 'no further payload entities are minted');
    assert.equal(ev.start.length, 1, 'the spent hulk does not re-announce a fresh lock every tick');
  } finally { bus.clear(); }
});

test('a spent cut stays spent after the beam is released and re-held', () => {
  const { state, bus, mining, ev } = boot({});
  try {
    hold(state, mining, 4);
    const minted = payloads(state).length;
    state.input.fireGroup = 0;
    mining.update(SIM_DT, state);
    hold(state, mining, 10);
    assert.equal(ev.cut.length, 1);
    assert.equal(payloads(state).length, minted);
  } finally { bus.clear(); }
});

test('a wreck carrying a real salvage pool drains that pool instead of printing generic panels', () => {
  const { state, bus, mining, wreck, ev } = boot({ salvagePool: { cmdty_scrap_metal: 6 } });
  try {
    hold(state, mining, 30);
    assert.equal(ev.cut.length, 0, 'no generic cut panel beside the real pool');
    assert.ok(!wreck.data.cutSpent);
    const left = Object.values(wreck.data.salvagePool || {}).reduce((a, b) => a + b, 0);
    assert.ok(left < 6, 'the real pool drained');
  } finally { bus.clear(); }
});
