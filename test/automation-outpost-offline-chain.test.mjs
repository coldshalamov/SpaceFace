// Phase B1 — offline catch-up must run the same coarse drone -> outpost -> sale chain as presence.
// Receipt convention under test: grossCr is pre-efficiency; droneCr/outpostCr are each efficiency-
// scaled contributions; credited is the owner-safe grant after efficiency and the passive cap.
import test from 'node:test';
import assert from 'node:assert/strict';

import { automation, AUTOMATION_PASSIVE_TUNING } from '../src/systems/automation.js';

const LOCAL_SECTOR = 'sector_helios_prime';
const REMOTE_SECTOR = 'sector_frontier_remote';
const WINDOW_START_MS = 9_000_000_000_000;
const ELAPSED_SEC = 10;

const PRICE = Object.freeze({
  cmdty_ore_iron: 10,
  cmdty_ore_copper: 20,
  cmdty_alloys: 100,
});

function makeBus() {
  const handlers = new Map();
  const emitLog = [];
  return {
    emitLog,
    on(event, fn) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event).push(fn);
    },
    off() {},
    emit(event, payload) {
      emitLog.push({ event, payload });
      for (const fn of (handlers.get(event) || []).slice()) fn(payload);
    },
  };
}

function boot(seed = 0x0FF1CE) {
  const state = {
    simTime: 1000,
    meta: { seed },
    playerId: 1,
    mode: 'flight',
    player: {
      credits: 100_000,
      droneTierCap: 5,
      stats: {},
      cargo: { items: {}, usedVolume: 0, usedMass: 0, capVolume: 200, capMass: 200 },
      ownedShips: [],
    },
    world: { currentSectorId: LOCAL_SECTOR, activeSector: null },
    entities: new Map(),
    entityList: [],
    automation: null,
  };
  const bus = makeBus();
  const inst = Object.create(automation);
  inst.init({ state, bus, helpers: {}, registry: null });
  inst.newGame();
  inst._orePrice = (commodityId) => PRICE[commodityId] || 1;
  state.automation.meta.lastTickTime = WINDOW_START_MS;
  state.automation.meta.lastOfflineWindowStart = 0;
  bus.emitLog.length = 0;
  return { state, bus, inst };
}

function addDrone(state, {
  id,
  oreType,
  buffer = 0,
  sectorId = LOCAL_SECTOR,
} = {}) {
  const drone = {
    id,
    defId: 'drone_mk1',
    count: 1,
    sectorId,
    oreType,
    buffer,
    bufferCap: 60,
    fuel: 240,
    fuelMax: 240,
    durability: 40,
    status: 'mining',
    entityIds: [],
  };
  state.automation.drones.push(drone);
  return drone;
}

function addOutpost(state, {
  id,
  defId = 'outpost_refinery',
  sectorId = LOCAL_SECTOR,
  autoSell = true,
} = {}) {
  const outpost = {
    id,
    defId,
    level: 1,
    sectorId,
    storage: 0,
    autoSell,
    raidCooldown: 0,
    status: 'producing',
    ratePerMin: 0,
  };
  state.automation.outposts.push(outpost);
  return outpost;
}

test('offline catch-up preserves banked outpost output when auto-sell is disabled', () => {
  const { state, inst } = boot();
  addDrone(state, { id: 'drone_local_iron', oreType: 'cmdty_ore_iron', buffer: 4 });
  const refinery = addOutpost(state, {
    id: 'refinery_manual_collection',
    autoSell: false,
  });

  const receipt = catchUp(inst);

  assert.equal(refinery.storage, 5,
    'manual-collection output must remain banked exactly as it does during live simulation');
  assert.equal(receipt.outpostCr, 0,
    'disabled auto-sell must not silently liquidate stored alloys while the player is away');
});

test('offline catch-up never reinterprets a programmed drone as a legacy buffer miner', () => {
  const { state, inst } = boot();
  const programmed = addDrone(state, {
    id: 'drone_programmed',
    oreType: 'cmdty_ore_iron',
    buffer: 7,
  });
  programmed.program = { templateId: 'mine_to_depot', pc: 0, registers: {} };

  const receipt = catchUp(inst);

  assert.equal(programmed.buffer, 7,
    'program-owned state must not be consumed by the legacy mine-and-liquidate catch-up path');
  assert.equal(receipt.droneCr, 0,
    'a programmed drone needs program-aware settlement, never invented legacy ore income');
});

function catchUp(inst) {
  return inst.runOfflineCatchup({ nowMs: WINDOW_START_MS + ELAPSED_SEC * 1000 });
}

function events(bus, event) {
  return bus.emitLog.filter((entry) => entry.event === event);
}

function accounting(receipt) {
  return {
    elapsedSec: receipt.elapsedSec,
    offlineEff: receipt.offlineEff,
    grossCr: receipt.grossCr,
    grossOfflineCr: receipt.grossOfflineCr,
    credited: receipt.credited,
    droneCr: receipt.droneCr,
    outpostCr: receipt.outpostCr,
    traderCr: receipt.traderCr,
    ownerSafePressure: receipt.ownerSafePressure,
    grantIntentsOnly: receipt.grantIntentsOnly,
    tradePressureEvents: receipt.tradePressureEvents,
  };
}

test('offline extraction feeds a local refinery before only the residual drone stock is valued', () => {
  const { state, inst } = boot();
  const iron = addDrone(state, { id: 'drone_local_iron', oreType: 'cmdty_ore_iron', buffer: 4 });
  addOutpost(state, { id: 'refinery_local' });

  const receipt = catchUp(inst);

  // 4 banked + (0.8/s * 10s) = 12 iron. The refinery can make five alloys in this window,
  // consuming ten iron at its authored 2:1 ratio. Only the two-iron residue may be valued directly.
  const expectedResidualIron = 2;
  const expectedAlloys = 5;
  const expectedDroneGross = expectedResidualIron * PRICE.cmdty_ore_iron;
  const expectedOutpostGross = expectedAlloys * PRICE.cmdty_alloys
    * AUTOMATION_PASSIVE_TUNING.outpostAutosellMult;

  assert.equal(iron.buffer, 0, 'the residual buffer is valued only after local recipe consumption');
  assert.equal(receipt.droneCr, expectedDroneGross * receipt.offlineEff,
    'consumed feedstock must not also be credited as raw drone output');
  assert.equal(receipt.outpostCr, expectedOutpostGross * receipt.offlineEff,
    'offline alloys must be derived from and valued after the consumed iron');
  assert.equal(receipt.grossCr, expectedDroneGross + expectedOutpostGross);
  assert.equal(receipt.grossOfflineCr, receipt.droneCr + receipt.outpostCr);
});

test('wrong-commodity and off-sector buffers cannot feed an offline refinery', () => {
  const { state, inst } = boot();
  addDrone(state, {
    id: 'drone_local_copper',
    oreType: 'cmdty_ore_copper',
    buffer: 2,
    sectorId: LOCAL_SECTOR,
  });
  addDrone(state, {
    id: 'drone_remote_iron',
    oreType: 'cmdty_ore_iron',
    buffer: 4,
    sectorId: REMOTE_SECTOR,
  });
  addOutpost(state, { id: 'refinery_local', sectorId: LOCAL_SECTOR });

  const receipt = catchUp(inst);

  // Each drone also extracts eight units during the window. Neither buffer is a valid local iron
  // feed, so both remain unconsumed by the recipe and are accounted only as residual drone value.
  const expectedCopper = 2 + 8;
  const expectedRemoteIron = 4 + 8;
  const expectedDroneGross = expectedCopper * PRICE.cmdty_ore_copper
    + expectedRemoteIron * PRICE.cmdty_ore_iron;

  assert.equal(receipt.outpostCr, 0, 'a refinery without same-sector iron cannot create alloys');
  assert.equal(receipt.droneCr, expectedDroneGross * receipt.offlineEff,
    'mismatched and remote stock stays outside the recipe and is valued unchanged');
  assert.equal(receipt.grossCr, expectedDroneGross);
});

test('offline streaming extraction can feed production before the drone buffer cap', () => {
  const { state, inst } = boot();
  addDrone(state, { id: 'drone_streaming_iron', oreType: 'cmdty_ore_iron', buffer: 0 });
  addOutpost(state, { id: 'refinery_streaming' });

  const elapsedSec = 120;
  const receipt = inst.runOfflineCatchup({ nowMs: WINDOW_START_MS + elapsedSec * 1000 });

  // The drone extracts 96 iron over the window. A live refinery would consume that flow as it
  // arrives and make 48 alloys; the drone's 60-unit storage cap must not truncate feed before the
  // refinery sees it.
  const expectedAlloys = 48;
  const expectedOutpostGross = expectedAlloys * PRICE.cmdty_alloys
    * AUTOMATION_PASSIVE_TUNING.outpostAutosellMult;
  assert.equal(receipt.droneCr, 0, 'all streamed iron is consumed before residual valuation');
  assert.equal(receipt.outpostCr, Math.round(expectedOutpostGross * receipt.offlineEff));
  assert.equal(receipt.grossCr, expectedOutpostGross);
});

test('long offline windows settle auto-selling production at coarse minute cadence', () => {
  const { state, inst } = boot();
  const longRange = addDrone(state, { id: 'drone_long_window', oreType: 'cmdty_ore_iron', buffer: 0 });
  longRange.fuel = 2_000;
  longRange.fuelMax = 2_000;
  const refinery = addOutpost(state, { id: 'refinery_long_window', autoSell: true });

  const elapsedSec = 20 * 60;
  const receipt = inst.runOfflineCatchup({ nowMs: WINDOW_START_MS + elapsedSec * 1000 });

  // 0.8 iron/s * 1200s = 960 iron -> 480 alloys. Auto-sell clears the 300-unit storage
  // at the existing minute cadence, so a one-shot storage clamp must not erase 180 alloys.
  const expectedAlloys = 480;
  const expectedOutpostGross = expectedAlloys * PRICE.cmdty_alloys
    * AUTOMATION_PASSIVE_TUNING.outpostAutosellMult;
  assert.equal(refinery.storage, 0);
  assert.equal(receipt.droneCr, 0);
  assert.equal(receipt.outpostCr, Math.round(expectedOutpostGross * receipt.offlineEff));
  assert.equal(receipt.grossCr, expectedOutpostGross);
});

test('offline production is bounded by drone fuel and removes an exhausted group deterministically', () => {
  const { state, inst } = boot();
  const iron = addDrone(state, {
    id: 'drone_one_second_of_fuel',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
  });
  iron.fuel = 1;
  addOutpost(state, { id: 'refinery_fuel_bounded', autoSell: true });

  const elapsedSec = 120;
  const receipt = inst.runOfflineCatchup({ nowMs: WINDOW_START_MS + elapsedSec * 1000 });

  // Mk1 fuelRate is 1/s: one second yields 0.8 iron -> 0.4 alloys, then the group is lost.
  const expectedAlloys = 0.4;
  const expectedOutpostGross = expectedAlloys * PRICE.cmdty_alloys
    * AUTOMATION_PASSIVE_TUNING.outpostAutosellMult;
  assert.equal(state.automation.drones.length, 0);
  assert.equal(iron.fuel, 0);
  assert.equal(receipt.lost, 1);
  assert.equal(receipt.droneCr, 0);
  assert.equal(receipt.outpostCr, Math.round(expectedOutpostGross * receipt.offlineEff));
  assert.equal(receipt.grossCr, expectedOutpostGross);
});

test('offline upkeep accrues through a fuel-bounded drone lifetime before retirement', () => {
  const { state, inst } = boot();
  const iron = addDrone(state, {
    id: 'drone_one_minute_of_upkeep',
    oreType: 'cmdty_ore_iron',
    buffer: 0,
  });
  iron.fuel = 60;

  const elapsedSec = 120;
  const receipt = inst.runOfflineCatchup({ nowMs: WINDOW_START_MS + elapsedSec * 1000 });

  assert.equal(state.automation.drones.length, 0);
  assert.equal(receipt.lost, 1);
  assert.equal(receipt.upkeep, 6,
    'Mk1 upkeep is charged for its one fuel-bounded operating minute, not erased on retirement');
});

test('a drone already out of fuel cannot feed a refinery before its offline loss is settled', () => {
  const { state, inst } = boot();
  const empty = addDrone(state, {
    id: 'drone_empty_at_window_start',
    oreType: 'cmdty_ore_iron',
    buffer: 4,
  });
  empty.fuel = 0;
  addOutpost(state, { id: 'refinery_must_not_consume_lost_buffer', autoSell: true });

  const receipt = catchUp(inst);

  assert.equal(state.automation.drones.length, 0);
  assert.equal(receipt.lost, 1);
  assert.equal(receipt.droneCr, 0);
  assert.equal(receipt.outpostCr, 0,
    'a zero-duration group is lost with its buffer before any facility can consume it');
});

test('offline raid cooldown expires at its boundary and production resumes for remaining time', () => {
  const { state, inst } = boot();
  addDrone(state, { id: 'drone_after_raid', oreType: 'cmdty_ore_iron', buffer: 0 });
  const refinery = addOutpost(state, { id: 'refinery_recovering', autoSell: true });
  refinery.status = 'raided';
  refinery.raidCooldown = 30;

  const elapsedSec = 120;
  const receipt = inst.runOfflineCatchup({ nowMs: WINDOW_START_MS + elapsedSec * 1000 });

  // Thirty seconds blocked, ninety seconds producing at 0.5 alloy/s.
  const expectedAlloys = 45;
  const expectedOutpostGross = expectedAlloys * PRICE.cmdty_alloys
    * AUTOMATION_PASSIVE_TUNING.outpostAutosellMult;
  assert.equal(refinery.raidCooldown, 0);
  assert.equal(refinery.status, 'producing');
  assert.equal(receipt.outpostCr, expectedOutpostGross * receipt.offlineEff);
});

test('an input-free hab hub keeps its authored passive offline output', () => {
  const { state, inst } = boot();
  addOutpost(state, { id: 'hab_local', defId: 'outpost_habhub' });

  const receipt = catchUp(inst);

  const expectedGross = 12 * ELAPSED_SEC;
  assert.equal(receipt.droneCr, 0);
  assert.equal(receipt.outpostCr, expectedGross * receipt.offlineEff,
    'input-free passive recipes remain productive without fabricated feedstock');
  assert.equal(receipt.grossCr, expectedGross);
});

test('offline chain receipts are deterministic, idempotent, and owner-safe', () => {
  function once() {
    const { state, bus, inst } = boot(0xD371);
    const creditsBefore = state.player.credits;
    addDrone(state, { id: 'drone_local_iron', oreType: 'cmdty_ore_iron', buffer: 4 });
    addOutpost(state, { id: 'refinery_local' });

    const first = catchUp(inst);
    const grantsAfterFirst = events(bus, 'economy:grantCredits').length;
    const pressureAfterFirst = events(bus, 'economy:applyTradePressure').length;

    // Rewind only the save clock, as a duplicate save:loaded delivery would. The settled window
    // anchor must prevent a second chain, grant, or pressure mutation.
    state.automation.meta.lastTickTime = WINDOW_START_MS;
    const second = inst.runOfflineCatchup({
      nowMs: WINDOW_START_MS + ELAPSED_SEC * 1000 + 50,
    });

    return {
      first: accounting(first),
      second: {
        skipped: second.skipped,
        skipReason: second.skipReason,
        credited: second.credited,
      },
      grantsAfterFirst,
      grantsAfterSecond: events(bus, 'economy:grantCredits').length,
      pressureAfterFirst,
      pressureAfterSecond: events(bus, 'economy:applyTradePressure').length,
      directCreditsDelta: state.player.credits - creditsBefore,
    };
  }

  const firstRun = once();
  const secondRun = once();

  assert.deepEqual(firstRun, secondRun, 'the same coarse state and seed settles identically');
  assert.equal(firstRun.first.grossOfflineCr,
    firstRun.first.droneCr + firstRun.first.outpostCr + firstRun.first.traderCr,
    'receipt components reconcile to the efficiency-scaled gross');
  assert.equal(firstRun.grantsAfterFirst, firstRun.first.credited > 0 ? 1 : 0);
  assert.equal(firstRun.grantsAfterSecond, firstRun.grantsAfterFirst, 'duplicate load emits no grant');
  assert.deepEqual(firstRun.second, { skipped: true, skipReason: 'idempotent', credited: 0 });
  assert.equal(firstRun.pressureAfterFirst, 0);
  assert.equal(firstRun.pressureAfterSecond, 0);
  assert.equal(firstRun.first.ownerSafePressure, true);
  assert.equal(firstRun.first.grantIntentsOnly, true);
  assert.equal(firstRun.first.tradePressureEvents, 0);
  assert.equal(firstRun.directCreditsDelta, 0, 'automation emits intents and never writes credits');
});
