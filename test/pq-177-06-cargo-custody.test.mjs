import test from 'node:test';
import assert from 'node:assert/strict';

import { tickProgram } from '../src/systems/alphabet.js';
import { automation } from '../src/systems/automation.js';
import { addToShipment, commitShipmentSale, shipmentQty, shipmentUsed } from '../src/systems/cargoCustody.js';
import { economy } from '../src/systems/economy.js';
import { addCargo } from '../src/systems/cargo.js';

function makeBus() {
  const handlers = new Map();
  return {
    on(event, handler) {
      const list = handlers.get(event) || [];
      list.push(handler);
      handlers.set(event, list);
    },
    emit(event, payload) {
      for (const handler of [...(handlers.get(event) || [])]) handler(payload);
    },
  };
}

function bootMiner() {
  const state = {
    player: {
      credits: 0,
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
    },
  };
  const inst = Object.create(automation);
  inst.state = state;
  inst.bus = makeBus();
  inst._nearestAsteroid = () => null;
  inst._playerPos = () => ({ x: 0, z: 0 });
  inst._orePrice = () => 10;
  inst._stationPrice = () => 12;
  inst._credited = 0;
  inst.creditPassive = (amount) => {
    inst._credited += amount;
    return amount;
  };
  return {
    state,
    inst,
    group: {
      id: 'drone-1',
      count: 1,
      oreType: 'cmdty_ore_iron',
      bufferCap: 40,
      sectorId: 'sector_helios_prime',
    },
    def: { mineRate: 0.8, bufferCap: 40 },
  };
}

function mineTwoSeconds(inst, group, def) {
  const dt = 1 / 60;
  for (let i = 0; i < 120; i++) inst._programMineIntoCargo(group, def, dt);
}

function bootEconomy() {
  const state = {
    mode: 'flight',
    simTime: 12,
    meta: { seed: 17706 },
    player: {
      credits: 100_000,
      cargo: { items: {}, capVolume: 1_000, usedVolume: 0, usedMass: 0 },
      marketMemory: {},
      tradeLedger: [],
      tradeLots: {},
      stats: {},
    },
    story: { flags: {} },
    factions: { faction_scn: { rep: 0 } },
    economy: {},
    conflicts: {},
    sectorSim: { field: { nodes: {} } },
    world: { currentSectorId: 'sector_helios_prime', sectors: {} },
    ui: {},
    nav: {},
    entities: new Map(),
    entityList: [],
  };
  const econ = { ...economy };
  econ.init({ state, bus: makeBus(), helpers: {}, registry: { get: () => null } });
  econ.newGame();
  return { state, econ };
}

test('PQ-177.06 programmed miner fills the operation shipment, not the player hold', () => {
  const { state, inst, group, def } = bootMiner();
  addCargo(state, 'cmdty_ore_iron', 5);
  mineTwoSeconds(inst, group, def);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 5, 'manual cargo is untouched');
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 1, 'two seconds at 0.8u/s grants one shipment unit');
});

test('PQ-177.06 a worker sale cannot spend or discount the player hold', () => {
  const { state, inst, group, def } = bootMiner();
  addCargo(state, 'cmdty_ore_iron', 7);
  mineTwoSeconds(inst, group, def);
  const first = inst._programSellCargo(group, 'station_helios');
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(first.receipt.stationId, 'station_helios');
  assert.equal(first.receipt.quoteVersion, 12);
  assert.equal(first.receipt.unitPrice, 12);
  assert.equal(state.player.cargo.items.cmdty_ore_iron, 7, 'the worker sold its shipment, not the hold');
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 0);
  assert.equal(inst._credited, 12);
});

test('PQ-177.06 retry and save/reload of a mid-sale intent duplicate nothing', () => {
  const { state, inst, group, def } = bootMiner();
  mineTwoSeconds(inst, group, def);
  group.saleSeq = 1;
  group.pendingSale = {
    intentId: 'drone-sale:drone-1:1',
    stationId: 'station_helios',
    good: 'cmdty_ore_iron',
    quantity: 1,
  };
  const mid = JSON.parse(JSON.stringify(group));
  const first = inst._programSellCargo(mid, 'station_helios');
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, false);
  assert.equal(inst._credited, 12);

  const afterCommit = JSON.parse(JSON.stringify(mid));
  afterCommit.pendingSale = {
    intentId: first.receipt.id,
    stationId: 'station_helios',
    good: 'cmdty_ore_iron',
    quantity: 1,
  };
  const replay = inst._programSellCargo(afterCommit, 'station_helios');
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.receipt.id, first.receipt.id);
  assert.equal(inst._credited, 12, 'the replay did not pay again');
  assert.equal(state.player.cargo.items.cmdty_ore_iron || 0, 0);

  addToShipment(afterCommit, 'cmdty_ore_iron', 1, 40);
  const collision = commitShipmentSale(afterCommit, {
    intentId: first.receipt.id,
    stationId: 'station_helios',
    good: 'cmdty_ore_iron',
    quantity: 9,
    unitPrice: 12,
    total: 108,
    quoteVersion: 12,
  }, () => 108);
  assert.equal(collision.ok, false);
  assert.equal(collision.reason, 'receipt_id_collision');
  assert.equal(inst._credited, 12);
  assert.equal(shipmentQty(afterCommit, 'cmdty_ore_iron'), 1, 'a colliding retry does not take stock');
});

test('PQ-177.06 a market execute with an intent id is one commit', () => {
  const { state, econ } = bootEconomy();
  addCargo(state, 'cmdty_food', 4);
  const stationId = 'station_helios';
  const first = econ.execute(stationId, 'cmdty_food', 'sell', 2, { intentId: 'sale:17706:a' });
  assert.equal(first.ok, true);
  assert.equal(first.duplicate, undefined);
  assert.equal(first.receipt.stationId, stationId);
  assert.ok(first.receipt.unitPrice > 0);
  const creditsAfter = state.player.credits;
  const leftover = state.player.cargo.items.cmdty_food;
  const roundTrip = JSON.parse(JSON.stringify(econ.serialize()));
  econ.newGame();
  state.player.credits = creditsAfter;
  state.player.cargo.items = {};
  state.player.cargo.usedVolume = 0;
  state.player.cargo.usedMass = 0;
  addCargo(state, 'cmdty_food', leftover);
  econ.deserialize(roundTrip);
  const replay = econ.execute(stationId, 'cmdty_food', 'sell', 2, { intentId: 'sale:17706:a' });
  assert.equal(replay.duplicate, true);
  assert.equal(replay.receipt.id, 'sale:17706:a');
  assert.equal(state.player.credits, creditsAfter);
  assert.equal(state.player.cargo.items.cmdty_food, leftover);
});

function fieldProgramCtx({ operationFull, playerUsed = 0, playerCap = 40 }) {
  const player = { id: 1, alive: true, type: 'player', pos: { x: 0, z: 0 } };
  const rock = { id: 2, alive: true, type: 'asteroid', pos: { x: 8, z: 0 }, data: {} };
  const station = {
    id: 3,
    alive: true,
    type: 'station',
    pos: { x: -20, z: 0 },
    data: { stationId: 'station_helios' },
  };
  const entities = new Map([[1, player], [2, rock], [3, station]]);
  let mined = 0;
  let soldAt = null;
  const group = {
    id: 'drone-1',
    program: { templateId: 'mine_to_depot' },
    programState: { pc: 0, waitT: 0, cargoWasFull: false },
    originPos: { x: 0, z: 0 },
    deployRange: 450,
    bufferCap: 2,
    oreType: 'cmdty_ore_iron',
  };
  const ctx = {
    state: {
      playerId: 1,
      player: { cargo: { items: {}, usedVolume: playerUsed, capVolume: playerCap } },
      entities,
      entityList: [player, rock, station],
    },
    group,
    steerTo: () => true,
    mineIntoCargo: () => { mined += 1; },
    sellMinedCargo: (stationId) => { soldAt = stationId; },
    operationFull: () => operationFull(group),
  };
  return {
    ctx,
    group,
    mined: () => mined,
    soldAt: () => soldAt,
  };
}

test('PQ-177.06 mine_to_depot leaves the field when the shipment is full, not the player hold', () => {
  const { ctx, group, mined } = fieldProgramCtx({
    operationFull: (g) => shipmentUsed(g) >= 2,
    playerUsed: 0,
    playerCap: 40,
  });
  addToShipment(group, 'cmdty_ore_iron', 2, 2);
  tickProgram(group, ctx, 1 / 60);
  assert.equal(group.programState.pc, 1, 'a full shipment hauls to the depot');
  assert.equal(mined(), 0, 'a full shipment does not keep mining');
});

test('PQ-177.06 a full player hold does not freeze a worker with shipment room', () => {
  const { ctx, group, mined } = fieldProgramCtx({
    operationFull: (g) => shipmentUsed(g) >= 2,
    playerUsed: 40,
    playerCap: 40,
  });
  tickProgram(group, ctx, 1 / 60);
  assert.equal(group.programState.pc, 0, 'room in the shipment keeps the mine step live');
  assert.equal(mined(), 1);
});

test('PQ-177.06 the sell step quotes the depot station, not a missing beacon', () => {
  const { ctx, group, soldAt } = fieldProgramCtx({
    operationFull: () => false,
  });
  group.programState.pc = 2;
  tickProgram(group, ctx, 1 / 60);
  assert.equal(soldAt(), 'station_helios');
  assert.equal(group.programState.pc, 3);
});
