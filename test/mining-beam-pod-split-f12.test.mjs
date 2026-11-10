import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import { BEAMS } from '../src/data/mining.js';
import { JETTISONED_CARGO_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { mining as miningBase } from '../src/systems/mining.js';

// §22 F12 — "the mining beam opens a pod". The same starter beam, aimed at a jettisoned cargo pod,
// holds for a bounded time, then the pod is gone and its commodity exists as loose pickup bodies.
// Aimed at a rock, mining is unchanged. No new fire mode, no ammo, no lockout.

const SEED = 7311;
const MK1 = BEAMS.find((b) => b.id === 'beam_mk1');

function bootBeam(entities) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };
  const state = {
    mode: 'flight',
    playerId: player.id,
    simTime: 0,
    tick: 0,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    player: { cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player], ...entities.map((e) => [e.id, e])]),
    entityList: [player, ...entities],
    world: { currentSectorId: 'sector_test' },
  };
  const bus = createBus();
  const events = { start: [], stop: [], denied: [], yield: [], podSplit: [], overheated: [], ventBonus: [] };
  bus.on('mining:start', (p) => events.start.push(p));
  bus.on('mining:stop', (p) => events.stop.push(p));
  bus.on('beam:denied', (p) => events.denied.push(p));
  bus.on('mining:yield', (p) => events.yield.push(p));
  bus.on('mining:podSplit', (p) => events.podSplit.push(p));
  bus.on('mining:overheated', (p) => events.overheated.push(p));
  bus.on('mining:ventBonus', (p) => events.ventBonus.push(p));
  let nextId = 900;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, player, events };
}

function makePod(overrides = {}) {
  return {
    id: 2,
    type: 'payload',
    alive: true,
    pos: { x: 40, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 3,
    mass: 5,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: {
      kind: 'payload',
      payloadType: JETTISONED_CARGO_PAYLOAD_TYPE,
      commodityId: 'cmdty_ore_iron',
      amount: 12,
      salvagePool: { cmdty_ore_iron: 12 },
      ...overrides,
    },
  };
}

function makeRock() {
  return {
    id: 4,
    type: 'asteroid',
    alive: true,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 400,
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_common_rock', oreHP: 140, oreHPMax: 140, commodityId: 'cmdty_silicate' },
  };
}

function holdTicks({ state, mining }, n) {
  for (let i = 0; i < n; i++) {
    state.input.fireGroup = 2;
    mining.update(SIM_DT, state);
    state.simTime += SIM_DT;
    state.tick += 1;
  }
}

function holdUntil({ state, mining }, cond, maxTicks) {
  for (let i = 0; i < maxTicks; i++) {
    holdTicks({ state, mining }, 1);
    if (cond()) return i + 1;
  }
  return maxTicks;
}

test('beam held on a cargo pod splits it once and spills the commodity as loose bodies', () => {
  const pod = makePod();
  const { state, bus, mining, player, events } = bootBeam([pod]);
  try {
    const beam = player.data.miningBeam;
    state.input.fireGroup = 2;

    const budget = Math.ceil(100 / (MK1.dps * SIM_DT)) + 4;
    const splitTick = holdUntil({ state, mining }, () => !pod.alive, budget);

    assert.ok(splitTick <= budget, `the pod must split inside the bounded hold (tick ${splitTick} > ${budget})`);
    assert.equal(pod.alive, false, 'the pod is gone');
    assert.equal(events.start.length, 1, 'one beam start edge');
    assert.equal(events.start[0].verb, 'split', 'the same beam reports the split verb');
    assert.equal(events.denied.length, 0, 'a splittable pod is never a denied target');
    assert.equal(events.podSplit.length, 1, 'the split receipt fires exactly once');
    assert.equal(events.podSplit[0].commodityId, 'cmdty_ore_iron');
    assert.equal(events.podSplit[0].qty, 12);

    const spilled = state.entityList.filter(
      (e) => e.type === 'pickup' && e.data && e.data.commodityId === 'cmdty_ore_iron');
    assert.ok(spilled.length >= 2, 'the commodity exists as loose bodies, not one lump');
    const spilledTotal = spilled.reduce((sum, e) => sum + e.data.amount, 0);
    assert.equal(spilledTotal, 12, `the spill totals the pod's whole manifest (got ${spilledTotal})`);

    // The gauge pegged before the split (4.5s < 5.6s hold) and the beam never locked — the F12 law.
    assert.ok(beam.heat >= beam.heatMax * 0.9, 'heat built through the hold, so the peg was crossed');
    assert.equal(events.overheated.length, 0, 'pegging a pod hold never emits a lockout');
    assert.equal(events.ventBonus.length, 0, 'a pod hold accrues no ore pulse to vent');

    // Idempotent: keep holding — the dead pod cannot split twice or mint duplicate bodies.
    holdTicks({ state, mining }, 30);
    assert.equal(events.podSplit.length, 1, 'held ticks after the split do not re-split');
    const spilledAfter = state.entityList.filter(
      (e) => e.type === 'pickup' && e.data && e.data.commodityId === 'cmdty_ore_iron');
    assert.equal(spilledAfter.reduce((sum, e) => sum + e.data.amount, 0), 12,
      'no duplicate commodity is minted after the pod is consumed');
  } finally {
    bus.clear();
  }
});

test('beam aimed at a rock still mines: ore arrives and the rock path gained no lockout', () => {
  const rock = makeRock();
  const { state, bus, mining, events } = bootBeam([rock]);
  try {
    state.input.fireGroup = 2;
    const tick = holdUntil({ state, mining }, () => events.yield.length > 0, 120);

    assert.ok(events.yield.length > 0, `ore must still arrive (none after ${tick} ticks)`);
    assert.equal(events.start.length, 1);
    assert.equal(events.start[0].verb, 'extract', 'the rock path keeps the extract verb');
    assert.equal(events.denied.length, 0, 'the rock path gained no denial');
    assert.equal(events.overheated.length, 0, 'the rock path gained no lockout');
    assert.equal(events.podSplit.length, 0, 'rocks never split');
  } finally {
    bus.clear();
  }
});

test('payloads that are not cargo pods stay out of the beam', () => {
  const panel = makePod({
    payloadType: 'cut_panel',
    commodityId: undefined,
    amount: undefined,
    salvagePool: { cmdty_scrap_metal: 4 },
  });
  const { state, bus, mining, events } = bootBeam([panel]);
  try {
    state.input.fireGroup = 2;
    holdTicks({ state, mining }, 90);

    assert.equal(panel.alive, true, 'a cut panel is not cracked open by the mining beam');
    assert.equal(events.start.length, 0, 'the beam never locks a non-cargo payload');
    assert.equal(events.podSplit.length, 0);
  } finally {
    bus.clear();
  }
});
