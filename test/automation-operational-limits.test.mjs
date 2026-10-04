import test from 'node:test';
import assert from 'node:assert/strict';

import { assignTemplate, tickProgram } from '../src/systems/alphabet.js';
import { automation } from '../src/systems/automation.js';
import { economy } from '../src/systems/economy.js';
import {
  LIMIT_STAGE,
  OPERATING_STATE,
  applyFuelShortage,
  boundDemandQty,
  cycleSnapshot,
  describeProgrammedMinerOperation,
  evaluateProgrammedMiner,
  migrateDroneOperation,
  operatingCostPerMin,
  recordGrossUnits,
} from '../src/systems/automationOperations.js';
import { addToShipment, shipmentQty } from '../src/systems/cargoCustody.js';
import { automationNextAction } from '../src/ui/screens/automationPanel.js';
import { TRADERS } from '../src/data/automation.js';

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
  const bus = makeBus();
  Object.assign(state, {
    story: { flags: {}, persistentCargo: [] }, missions: { active: [] },
    factions: { faction_scn: { rep: 0 } }, economy: {}, conflicts: {},
    sectorSim: { field: { nodes: {} } }, ui: {}, nav: {},
  });
  const econ = Object.create(economy);
  econ.init({ state, bus, helpers: {}, registry: { get: () => null } });
  econ.newGame();
  const inst = Object.create(automation);
  inst.init({ state, bus, helpers: {}, registry: { get: (id) => id === 'economy' ? econ : null } });
  inst.newGame();
  inst._orePrice = () => 12;
  inst._stationPrice = () => 12;
  inst._capBudget = 0;
  return { state, inst, econ };
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

test('an empty miner stays at a depleted field while a partial shipment leaves for its depot', () => {
  const { state } = bootAutomation();
  const group = programmedGroup();
  let stored = 0;
  let moves = 0;
  const ctx = { state, group, operationUsed: () => stored, operationFull: () => false,
    steerTo: () => { moves++; return false; }, mineIntoCargo: () => assert.fail('no rock exists') };
  for (let tick = 0; tick < 120; tick++) tickProgram(group, ctx, 1 / 60);
  assert.equal(group.programState.pc, 0);
  assert.equal(moves, 0);
  stored = 1;
  tickProgram(group, ctx, 1 / 60);
  assert.equal(group.programState.pc, 1, 'the finite partial load still travels home');
});

test('empty depleted workers never report productive throughput during saved routing steps', () => {
  for (const programStep of ['mine', 'haul', 'sell']) {
    const op = evaluateProgrammedMiner({ fuel: 240, hasRock: false, hasDepot: true,
      shipmentUsed: 0, shipmentCap: 40, programStep, upkeepPerMin: 6, grossValuePerMin: 576 });
    assert.equal(op.operatingState, OPERATING_STATE.STALLED);
    assert.equal(op.limitStage, LIMIT_STAGE.NO_EXPOSED_FACE);
    assert.equal(op.operatingCostPerMin, 0);
    assert.equal(op.netThroughputPerMin, 0);
  }
  const loaded = evaluateProgrammedMiner({ fuel: 240, hasRock: false, hasDepot: true,
    shipmentUsed: 1, shipmentCap: 40, programStep: 'haul', upkeepPerMin: 6 });
  assert.equal(loaded.operatingState, OPERATING_STATE.RUNNING);
});

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

test('a trader without a drone fuel field still pays its authored upkeep', () => {
  const { state, inst } = bootAutomation();
  state.automation.traders.push({ id: 'hired', defId: TRADERS[0].id, status: 'active' });
  assert.equal(inst.totalUpkeepPerMin(), TRADERS[0].upkeepPerMin);
});

test('waiting programmed miners stop consuming operating fuel and upkeep', () => {
  const { state, inst } = bootAutomation();
  const group = programmedGroup({ operation: { operatingState: 'waiting' } });
  state.automation.drones.push(group);
  inst._burnOperatingFuel(group, { fuelRate: 1 }, 1);
  assert.equal(group.fuel, 240);
  assert.equal(inst.totalUpkeepPerMin(), 0);
});

test('reading an operation card does not mutate a saved drone', () => {
  const group = Object.freeze({ id: 'old', fuel: 10 });
  assert.doesNotThrow(() => describeProgrammedMinerOperation(group));
});

test('PQ-177.07 fuel shortage strands the machine and never deletes it', () => {
  const { state, inst } = bootAutomation();
  const group = programmedGroup({ fuel: 0.25 });
  // Fuel is spent while working. An empty depleted field now correctly waits without burning it.
  const rock = { id: 2, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, radius: 12,
    data: { oreHP: 14, oreHPMax: 14 } };
  state.entities.set(rock.id, rock);
  state.entityList.push(rock);
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
  const { inst, econ } = bootAutomation();
  inst._capBudget = 0;
  const group = programmedGroup();
  addToShipment(group, 'cmdty_ore_iron', 5, 40);
  const expected = econ.quoteAutomationIntake('station_helios', 'cmdty_ore_iron', 5);
  const result = inst._programSellCargo(group, 'station_helios');
  assert.equal(result.ok, true);
  assert.equal(result.receipt.credited, expected.total);
  assert.equal(result.receipt.stationId, 'station_helios');
  assert.equal(group.operation.lastSale.credited, expected.total);
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 0);
  assert.equal(inst._capBudget, 0, 'the bucket is not the primary bound on this route');
});

test('PQ-177.07 competing machines on a saturated depot do not double the take', () => {
  const { inst, econ } = bootAutomation();
  const initial = econ.quoteAutomationIntake('station_helios', 'cmdty_ore_iron', 100000);
  econ.bus.emit('economy:applyTradePressure', {
    stationId: 'station_helios', good: 'cmdty_ore_iron', vol: initial.fillable - 8,
  });
  const expected = econ.quoteAutomationIntake('station_helios', 'cmdty_ore_iron', 8);
  assert.equal(expected.fillable, 8);
  const first = programmedGroup({ id: 'drone-a' });
  const second = programmedGroup({ id: 'drone-b' });
  addToShipment(first, 'cmdty_ore_iron', 8, 40);
  addToShipment(second, 'cmdty_ore_iron', 8, 40);
  const saleA = inst._programSellCargo(first, 'station_helios');
  const saleB = inst._programSellCargo(second, 'station_helios');
  assert.equal(saleA.ok, true);
  assert.equal(saleA.receipt.credited, expected.total);
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
  assert.equal((saleA.receipt.credited + (saleB.ok ? saleB.receipt.credited : 0)), expected.total,
    'returns stay bounded by destination demand, not machine count');
});

test('programmed miners share finite rock depletion instead of minting the final unit twice', () => {
  const { inst, state } = bootAutomation();
  const rock = { id: 92, type: 'asteroid', alive: true, pos: { x: 0, z: 0 }, hull: 14, data: { oreHP: 14 } };
  state.entityList.push(rock);
  const first = programmedGroup({ id: 'one' });
  const second = programmedGroup({ id: 'two' });
  const def = { mineRate: 1, fuelRate: 1, bufferCap: 40 };
  inst._programMineIntoCargo(first, def, 10, rock);
  inst._programMineIntoCargo(second, def, 10, rock);
  assert.equal(shipmentQty(first, 'cmdty_ore_iron'), 1);
  assert.equal(shipmentQty(second, 'cmdty_ore_iron'), 0);
  assert.equal(rock.data.oreHP, 0);
  assert.equal(rock.alive, false);
  assert.ok(rock.data.respawnAt > state.simTime);
});

test('programmed extraction is bounded by available fuel and never produces ore without a rock', () => {
  const { inst } = bootAutomation();
  const group = programmedGroup({ fuel: 1 });
  const def = { mineRate: 1, fuelRate: 1, bufferCap: 40 };
  inst._programMineIntoCargo(group, def, 10);
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 0);
  const rock = { id: 93, alive: true, pos: { x: 0, z: 0 }, hull: 140, data: { oreHP: 140 } };
  inst._programMineIntoCargo(group, def, 10, rock);
  assert.equal(shipmentQty(group, 'cmdty_ore_iron'), 1);
  assert.equal(rock.data.oreHP, 126);
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

test('SF-115 a closed cycle reconciles mined inputs, service costs and the sale receipt', () => {
  const { inst, econ } = bootAutomation();
  inst._capBudget = 0;
  const group = programmedGroup();
  const def = { mineRate: 1, fuelRate: 1, bufferCap: 40, upkeepPerMin: 6 };
  recordGrossUnits(group, 5);
  addToShipment(group, 'cmdty_ore_iron', 5, 40);
  group.operation.operatingCostPerMin = 6; // as stamped by _syncProgrammedOperation each tick
  inst._burnOperatingFuel(group, def, 60);
  const expected = econ.quoteAutomationIntake('station_helios', 'cmdty_ore_iron', 5);
  const result = inst._programSellCargo(group, 'station_helios');
  assert.equal(result.ok, true);
  const cycle = group.operation.lastCycle;
  assert.ok(cycle, 'a realised sale closes the accounting cycle');
  assert.equal(cycle.minedUnits, 5);
  assert.equal(cycle.quantity, 5);
  assert.equal(cycle.credited, expected.total);
  assert.equal(cycle.fuelUsed, 60, 'fuel burned while running is booked');
  assert.equal(cycle.upkeepAccrued, 6, 'a minute of running upkeep is booked');
  assert.equal(cycle.heldUnits, 0);
  assert.equal(cycle.netCr, cycle.credited - cycle.upkeepAccrued);
  assert.equal(
    cycle.carryInUnits + cycle.minedUnits,
    cycle.quantity + cycle.withdrawnUnits + cycle.heldUnits,
    'the breakdown sums to real inventory movements',
  );
  const readout = describeProgrammedMinerOperation(group, def);
  assert.match(readout.cycleText, /net -?\d+ cr/i);
  assert.match(readout.accessibleSummary, /last run/i);
});

test('SF-115 a demand-bound sale keeps the refused stock as held inventory, not income', () => {
  const { inst, econ } = bootAutomation();
  inst._capBudget = 0;
  const group = programmedGroup();
  const def = { mineRate: 1, fuelRate: 1, bufferCap: 40, upkeepPerMin: 6 };
  econ.bus.emit('economy:applyTradePressure', {
    stationId: 'station_helios', good: 'cmdty_ore_iron',
    vol: econ.quoteAutomationIntake('station_helios', 'cmdty_ore_iron', 100000).fillable - 3,
  });
  recordGrossUnits(group, 8);
  addToShipment(group, 'cmdty_ore_iron', 8, 40);
  group.operation.operatingCostPerMin = 6;
  inst._burnOperatingFuel(group, def, 30);
  const result = inst._programSellCargo(group, 'station_helios');
  assert.equal(result.ok, true);
  assert.equal(result.receipt.quantity, 3);
  const cycle = group.operation.lastCycle;
  assert.equal(cycle.heldUnits, 5, 'the depot refused 5u — they stay aboard as held stock');
  assert.equal(cycle.credited, result.receipt.credited, 'income is only the receipt');
  assert.equal(group.operation.cycle.carryInUnits, 5,
    'the refused load carries into the next cycle so it is never counted twice');
});

test('SF-115 a stalled depot books nothing: stock and inputs stay unresolved', () => {
  const { inst, econ } = bootAutomation();
  const group = programmedGroup();
  const def = { mineRate: 1, fuelRate: 1, bufferCap: 40, upkeepPerMin: 6 };
  econ.bus.emit('economy:applyTradePressure', {
    stationId: 'station_helios', good: 'cmdty_ore_iron',
    vol: econ.quoteAutomationIntake('station_helios', 'cmdty_ore_iron', 100000).fillable,
  });
  recordGrossUnits(group, 8);
  addToShipment(group, 'cmdty_ore_iron', 8, 40);
  group.operation.operatingCostPerMin = 6;
  inst._burnOperatingFuel(group, def, 30);
  const result = inst._programSellCargo(group, 'station_helios');
  assert.equal(result.ok, false);
  assert.ok(group.operation.lastCycle == null, 'no sale, no closed cycle, no booked income');
  const open = cycleSnapshot(group, 8);
  assert.equal(open.minedUnits, 8);
  assert.equal(open.credited, 0);
  assert.equal(open.heldUnits, 8, 'everything mined is still held — unresolved, not income');
});

test('SF-115 a destroyed machine leaves a reconciled ledger in the loss log', () => {
  const { state, inst } = bootAutomation();
  const group = programmedGroup();
  const def = { mineRate: 1, fuelRate: 1, bufferCap: 40, upkeepPerMin: 6 };
  recordGrossUnits(group, 6);
  addToShipment(group, 'cmdty_ore_iron', 6, 40);
  group.operation.operatingCostPerMin = 6;
  inst._burnOperatingFuel(group, def, 12);
  state.automation.drones.push(group);
  inst._loseAsset('drone', group, 240, 'sector_helios_prime');
  const log = state.automation.meta.lostAssetsLog;
  const entry = log[log.length - 1];
  assert.ok(entry.breakdown, 'the loss entry carries the closed ledger');
  assert.equal(entry.breakdown.minedUnits, 6);
  assert.equal(entry.breakdown.withdrawnUnits, 6, 'the lost shipment is named, not silently zero');
  assert.equal(entry.breakdown.soldUnits, 0);
  assert.equal(entry.breakdown.credited, 0);
});

test('SF-115 a recalled machine books its banked stock as withdrawn, not sold', () => {
  const { state, inst } = bootAutomation();
  const group = programmedGroup();
  recordGrossUnits(group, 4);
  addToShipment(group, 'cmdty_ore_iron', 4, 40);
  state.automation.drones.push(group);
  inst.recallDrone('drone-1');
  assert.equal(group.operation.cycle.withdrawnUnits, 4,
    'stock banked at recall price leaves the ledger as a withdrawal');
  assert.equal(group.operation.cycle.soldUnits, 0);
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
