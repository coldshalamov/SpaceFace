import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { mining } from '../src/systems/mining.js';
import { CLASSIFIED_SALVAGE_COMMODITY_ID, COMMON_SALVAGE_COMMODITY_ID } from '../src/data/salvageLegality.js';

function createRng(seed = 4242) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function rigSalvageActions({ seed = 4242 } = {}) {
  const bus = createBus();
  const state = {
    simTime: 100,
    tick: 6000,
    playerId: 1,
    meta: { seed },
    entities: new Map(),
    entityList: [],
    rng: createRng(seed),
  };
  const spawns = [];
  bus.on('entity:spawnRequest', (p) => spawns.push(p));
  const sys = Object.create(salvageActions);
  sys.init({ state, bus, registry: { get: () => null } });
  return { state, bus, sys, spawns };
}

function rigMining({ seed = 4242, admissionAllowed = true } = {}) {
  const bus = createBus();
  const state = {
    simTime: 100,
    tick: 6000,
    playerId: 1,
    meta: { seed },
    entities: new Map(),
    entityList: [],
    rng: createRng(seed),
    player: { id: 1, targetId: null, cargo: { items: {}, usedVolume: 0, capVolume: 40 } },
  };
  const spawnedPickups = [];
  let allowAdmission = admissionAllowed;
  const helpers = {
    spawnEntity(spec) {
      if (!allowAdmission) return null;
      const pickup = { id: 800 + spawnedPickups.length, alive: true, ...spec };
      spawnedPickups.push(pickup);
      return pickup;
    },
  };
  const mine = Object.create(mining);
  mine.init({ state, bus, helpers, registry: { get: () => null } });
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const events = {
    yields: [],
    completed: [],
  };
  bus.on('mining:yield', (p) => events.yields.push(p));
  bus.on('salvage:completed', (p) => events.completed.push(p));

  return {
    state,
    bus,
    mine,
    player,
    helpers,
    events,
    spawnedPickups,
    setAdmission(allowed) { allowAdmission = allowed; },
  };
}

test('salvage vent core legality matches wreck parentType (positive military vs quiet civilian)', () => {
  const { state, bus, spawns } = rigSalvageActions({ seed: 4242 });

  // Positive case: military wreck ejects classified salvage core
  const militaryWreck = {
    id: 10,
    type: 'wreck',
    alive: true,
    pos: { x: 50, z: 50 },
    radius: 12,
    data: {
      parentType: 'military',
      unstableReactor: { dueAt: 500, damage: 20, vented: false, burst: false, towedClear: false },
    },
  };
  state.entities.set(militaryWreck.id, militaryWreck);
  state.entityList.push(militaryWreck);

  bus.emit('salvage:ventReactor', { wreckId: militaryWreck.id });
  assert.equal(spawns.length, 1, 'military wreck vents one core');
  assert.equal(spawns[0].spec.data.commodityId, CLASSIFIED_SALVAGE_COMMODITY_ID, 'military wreck core carries classified salvage');
  assert.equal(spawns[0].spec.data.commodityId, 'cmdty_classified_salvage');

  // Negative / quiet case: civilian wreck still ejects common salvage electronics core
  const civilianWreck = {
    id: 20,
    type: 'wreck',
    alive: true,
    pos: { x: -50, z: -50 },
    radius: 10,
    data: {
      parentType: 'civilian',
      unstableReactor: { dueAt: 500, damage: 20, vented: false, burst: false, towedClear: false },
    },
  };
  state.entities.set(civilianWreck.id, civilianWreck);
  state.entityList.push(civilianWreck);

  bus.emit('salvage:ventReactor', { wreckId: civilianWreck.id });
  assert.equal(spawns.length, 2, 'civilian wreck vents one core');
  assert.equal(spawns[1].spec.data.commodityId, COMMON_SALVAGE_COMMODITY_ID, 'civilian wreck core carries common electronics');
  assert.equal(spawns[1].spec.data.commodityId, 'cmdty_salvage_electronics');
});

test('draining wreck when pickup admission is refused retains unspawned salvage until retry succeeds', () => {
  const ctx = rigMining({ seed: 4242, admissionAllowed: false });
  const wreck = {
    id: 101,
    type: 'wreck',
    alive: true,
    pos: { x: 20, z: 0 },
    radius: 10,
    data: {
      salvagePool: { cmdty_scrap_metal: 4 },
      salvageTimeLeft: 0, // trigger flush of pool
    },
  };
  ctx.state.entities.set(wreck.id, wreck);
  ctx.state.entityList.push(wreck);

  // Positive case: admission refused -> unspawned salvage retained in pool, wreck kept alive, no salvage:completed
  ctx.mine._drainWreck(ctx.player, wreck, 18, 0.1);

  assert.equal(wreck.alive, true, 'wreck must stay alive when admission refuses pickups');
  assert.equal(wreck.data.salvagePool.cmdty_scrap_metal, 4, 'unspawned units returned to pool');
  assert.equal(ctx.events.yields.length, 0, 'no yield emitted when 0 units spawned');
  assert.equal(ctx.events.completed.length, 0, 'salvage:completed not emitted while unspawned units remain');

  // Retry succeeds: allow admission, drain again
  ctx.setAdmission(true);
  wreck.data.salvageTimeLeft = 0; // flush on next drain
  ctx.mine._drainWreck(ctx.player, wreck, 18, 0.1);

  assert.equal(wreck.alive, false, 'wreck destroyed once all units successfully spawned');
  assert.equal(ctx.events.yields.length, 1, 'yield emitted once spawned');
  assert.equal(ctx.events.yields[0].qty, 4, 'yield matches spawned quantity');
  assert.equal(ctx.events.completed.length, 1, 'salvage:completed emitted exactly once');
});

test('draining wreck with salvageSourceKey clears sourceKey on admission refusal so local pool retains balance', () => {
  const ctx = rigMining({ seed: 4242, admissionAllowed: false });
  let sourceLedgerQty = 5;
  ctx.helpers.salvage = {
    source: () => ({
      remainingQty: sourceLedgerQty,
      remainingPool: { cmdty_scrap_metal: sourceLedgerQty },
    }),
    drainSource: ({ requested }) => {
      const take = Math.min(requested.cmdty_scrap_metal || 0, sourceLedgerQty);
      sourceLedgerQty -= take;
      return {
        ok: true,
        taken: { cmdty_scrap_metal: take },
        source: { remainingQty: sourceLedgerQty, remainingPool: { cmdty_scrap_metal: sourceLedgerQty } },
      };
    },
  };

  const wreck = {
    id: 303,
    type: 'wreck',
    alive: true,
    pos: { x: 40, z: 0 },
    radius: 10,
    data: {
      salvageSourceKey: 'test-src-303',
      salvagePool: { cmdty_scrap_metal: 5 },
      salvageTimeLeft: 0,
    },
  };
  ctx.state.entities.set(wreck.id, wreck);
  ctx.state.entityList.push(wreck);

  ctx.mine._drainWreck(ctx.player, wreck, 18, 0.1);

  assert.equal(wreck.alive, true, 'wreck stays alive when admission refused');
  assert.equal(wreck.data.salvageSourceKey, null, 'salvageSourceKey cleared so subsequent drains use local pool');
  assert.equal(wreck.data.salvagePool.cmdty_scrap_metal, 5, 'local pool retained unspawned salvage');
  assert.equal(ctx.events.completed.length, 0);

  // Now retry with admission allowed
  ctx.setAdmission(true);
  wreck.data.salvageTimeLeft = 0;
  ctx.mine._drainWreck(ctx.player, wreck, 18, 0.1);

  assert.equal(wreck.alive, false, 'wreck completed after retry');
  assert.equal(ctx.events.yields.length, 1);
  assert.equal(ctx.events.yields[0].qty, 5);
  assert.equal(ctx.events.completed.length, 1);
});

test('quiet case: normal drain with admission emits salvage:completed once and sets wreck.alive to false', () => {
  const ctx = rigMining({ seed: 4242, admissionAllowed: true });
  const wreck = {
    id: 202,
    type: 'wreck',
    alive: true,
    pos: { x: 30, z: 0 },
    radius: 10,
    data: {
      salvagePool: { cmdty_scrap_metal: 2, cmdty_salvage_electronics: 1 },
      salvageTimeLeft: 0,
    },
  };
  ctx.state.entities.set(wreck.id, wreck);
  ctx.state.entityList.push(wreck);

  ctx.mine._drainWreck(ctx.player, wreck, 18, 0.1);

  assert.equal(wreck.alive, false, 'wreck marked dead after full drain');
  assert.equal(ctx.events.completed.length, 1, 'salvage:completed emitted once');
  assert.equal(ctx.spawnedPickups.length, 2, 'two pickup lots spawned');
});
