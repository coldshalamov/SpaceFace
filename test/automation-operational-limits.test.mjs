import test from 'node:test';
import assert from 'node:assert/strict';

import { assignTemplate } from '../src/systems/alphabet.js';
import { automation } from '../src/systems/automation.js';
import {
  LIMIT_STAGE,
  OPERATING_STATE,
  applyFuelShortage,
  boundDemandQty,
  describeProgrammedMinerOperation,
  evaluateProgrammedMiner,
  migrateDroneOperation,
  operatingCostPerMin,
} from '../src/systems/automationOperations.js';
import { addToShipment, shipmentQty } from '../src/systems/cargoCustody.js';
import { automationNextAction } from '../src/ui/screens/automationPanel.js';

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

function bootAutomation(seed = 17707) {
  const state = {
    simTime: 40,
    meta: { seed },
    playerId: 1,
    mode: 'flight',
    player: {
      credits: 100_000,
      droneTierCap: 1,
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 },
      ownedShips: [],
      researchedNodes: ['tech_drone_control'],
    },
    world: { currentSectorId: 'sector_helios_prime', activeSector: null },
    entities: new Map(),
    entityList: [],
    automation: null,
  };
  const inst = Object.create(automation);
  inst.init({ state, bus: makeBus(), helpers: {}, registry: null });
  inst.newGame();
  inst._orePrice = () => 12;
  inst._stationPrice = () => 12;
  inst._capBudget = 0;
  return { state, inst };
}

function programmedGroup(overrides = {}) {
  const group = {
    id: 'drone-1',
    defId: 'drone_mk1',
    count: 1,
    oreType: 'cmdty_ore_iron',
    bufferCap: 40,
    buffer: 0,
    fuel: 240,
    fuelMax: 240,
    sectorId: 'sector_helios_prime',
    status: 'program',
    originPos: { x: 0, z: 0 },
    entityIds: [],
    ...overrides,
  };
  assignTemplate(group, 'mine_to_depot');
  return group;
}

test('PQ-177.07 a player can name why a second machine would help or sit idle', () => {
  const running = evaluateProgrammedMiner({
    fuel: 240,
    hasRock: true,
    hasDepot: true,
    shipmentUsed: 4,
    shipmentCap: 40,
    quoteOk: true,
    demandOpen: true,
    upkeepPerMin: 6,
    grossValuePerMin: 576,
  });
  assert.equal(running.operatingState, OPERATING_STATE.RUNNING);
  assert.equal(running.addingMachineHelps, true);
  assert.match(running.reason, /another would add cut/i);

  const saturated = evaluateProgrammedMiner({
    fuel: 240,
    programStep: 'sell',
    hasRock: true,
    hasDepot: true,
    shipmentUsed: 40,
    shipmentCap: 40,
    quoteOk: true,
    demandOpen: false,
    upkeepPerMin: 6,
  });
  assert.equal(saturated.limitStage, LIMIT_STAGE.DEMAND_SATURATION);
  assert.equal(saturated.addingMachineHelps, false);
  assert.match(saturated.reason, /would not sell more/i);
  assert.match(saturated.label, /depot is full/i);
});

test('PQ-177.07 operating cost is tied to operating state', () => {
  assert.equal(operatingCostPerMin(6, OPERATING_STATE.RUNNING), 6);
  assert.equal(operatingCostPerMin(6, OPERATING_STATE.STRANDED), 0);
  assert.equal(operatingCostPerMin(6, OPERATING_STATE.WAITING), 0);
  assert.equal(operatingCostPerMin(6, OPERATING_STATE.STALLED), 0);
});

test('PQ-177.07 fuel shortage strands the machine and never deletes it', () => {
  const { state, inst } = bootAutomation();
  const group = programmedGroup({ fuel: 0.25 });
  state.automation.drones.push(group);
  inst.update(1, state);
  assert.equal(state.automation.drones.length, 1);
  assert.equal(group.status, OPERATING_STATE.STRANDED);
  assert.equal(group.fuel, 0);
  assert.equal(group.operation.operatingState, OPERATING_STATE.STRANDED);
  assert.equal(group.operation.limitStage, LIMIT_STAGE.MISSING_INPUT);
  assert.equal(group.operation.operatingCostPerMin, 0);
  const readout = describeProgrammedMinerOperation(group, { bufferCap: 40, upkeepPerMin: 6 });
  assert.match(readout.accessibleSummary, /out of fuel/i);
  assert.match(readout.reason, /machine is still here/i);
});

test('PQ-177.07 a stranded machine resumes after fuel returns, including after Continue', () => {
  const { state, inst } = bootAutomation();
  const group = programmedGroup({ fuel: 0 });
  addToShipment(group, 'cmdty_ore_iron', 3, 40);
  state.automation.drones.push(group);
  applyFuelShortage(group);
  const saved = JSON.parse(JSON.stringify(inst.serialize()));
  inst.newGame();
  inst.deserialize(saved);
  const restored = state.automation.drones.find((row) => row.id === 'drone-1');
  assert.ok(restored, 'an old save keeps every machine');
  assert.equal(restored.status, OPERATING_STATE.STRANDED);
  assert.equal(shipmentQty(restored, 'cmdty_ore_iron'), 3);
  assert.equal(state.automation.drones.length, 1);

  const ok = inst.refuelDrone('drone-1');
  assert.equal(ok, true);
  assert.equal(restored.fuel, 240);
  assert.notEqual(restored.status, OPERATING_STATE.STRANDED);
  assert.ok(restored.fuel > 0);
});

test('PQ-177.07 one programmed miner sells through throughput, not the token bucket', () => {
  const { inst } = bootAutomation();
  inst._capBudget = 0;
  const group = programmedGroup();
  addToShipment(group, 'cmdty_ore_iron', 5, 40);
  const result = inst._programSellCargo(group, 'station_helios');
  assert.equal(result.ok, true);
  assert.equal(result.receipt.credited, 60);
  assert.equal(result.receipt.stationId, 'station_helios');
  assert.equal(group.operation.lastSale.credited, 60);
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 0);
  assert.equal(inst._capBudget, 0, 'the bucket is not the primary bound on this route');
});

test('PQ-177.07 competing machines on a saturated depot do not double the take', () => {
  const { inst } = bootAutomation();
  let sold = 0;
  const demand = 8;
  inst._quoteOperationSale = (_stationId, _good, qty) => {
    const room = Math.max(0, demand - sold);
    const take = Math.min(Math.max(0, qty | 0), room);
    if (take <= 0) return { unitAvg: 0, total: 0, quoteVersion: 0, fillable: 0, saturated: true };
    return { unitAvg: 12, total: 12 * take, quoteVersion: 12, fillable: take, saturated: false };
  };
  const first = programmedGroup({ id: 'drone-a' });
  const second = programmedGroup({ id: 'drone-b' });
  addToShipment(first, 'cmdty_ore_iron', 8, 40);
  addToShipment(second, 'cmdty_ore_iron', 8, 40);
  const saleA = inst._programSellCargo(first, 'station_helios');
  sold += saleA.receipt.quantity;
  const saleB = inst._programSellCargo(second, 'station_helios');
  assert.equal(saleA.ok, true);
  assert.equal(saleA.receipt.credited, 96);
  assert.equal(saleB.ok, false);
  assert.equal(saleB.reason, 'demand_saturation');
  assert.equal(shipmentQty(second, 'cmdty_ore_iron'), 8, 'the second machine keeps its load');
  const why = evaluateProgrammedMiner({
    fuel: 240,
    programStep: 'sell',
    hasDepot: true,
    hasRock: true,
    shipmentUsed: 8,
    shipmentCap: 40,
    quoteOk: true,
    demandOpen: false,
  });
  assert.equal(why.addingMachineHelps, false);
  assert.equal((saleA.receipt.credited + (saleB.ok ? saleB.receipt.credited : 0)), 96,
    'returns stay bounded by destination demand, not machine count');
});

test('PQ-177.07 demand bound sells only what the depot will take', () => {
  assert.equal(boundDemandQty(10, { fillable: 4, unitAvg: 12, total: 48 }), 4);
  assert.equal(boundDemandQty(10, { unitAvg: 0, total: 0, saturated: true }), 0);
});

test('PQ-177.07 migrate keeps a fuel-empty machine from an old save', () => {
  const group = {
    id: 'legacy-1',
    defId: 'drone_mk1',
    fuel: 0,
    fuelMax: 240,
    status: 'mining',
    buffer: 12,
  };
  migrateDroneOperation(group);
  assert.equal(group.status, OPERATING_STATE.STRANDED);
  assert.equal(group.operation.operatingState, OPERATING_STATE.STRANDED);
  assert.ok(group.operation);
});

test('PQ-177.07 the operations board asks to refuel a waiting drone', () => {
  const next = automationNextAction({
    player: { credits: 4000, researchedNodes: ['tech_drone_control'], ownedShips: [] },
    automation: {
      drones: [{ id: 'drone-1', defId: 'drone_mk1', status: 'stranded', fuel: 0 }],
      traders: [],
      outposts: [],
      fleet: [],
      meta: {},
      balance: { activeRefByTier: [250], passiveCapFrac: 0.45 },
    },
  });
  assert.equal(next.action, 'refuel');
  assert.equal(next.cta, 'Refuel');
  assert.match(next.body, /machine is still there/i);
});
