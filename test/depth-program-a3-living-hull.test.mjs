import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  LIVING_HULL_GRIME_MAX,
  LIVING_HULL_HEAT_SCORCH_MAX,
  LIVING_HULL_KILL_TALLY_MAX,
  LIVING_HULL_REPAIR_PATCH_MAX,
  defaultLivingHull,
  livingHullAfterWash,
  livingHullCyclesSinceWash,
  livingHullGrimeAt,
  livingHullWithGraffiti,
  livingHullWithKill,
  livingHullWithRepair,
  livingHullWithVent,
  normalizeLivingHull,
} from '../src/core/livingHull.js';
import { economy, SERVICE_PRICES } from '../src/systems/economy.js';
import { ships } from '../src/systems/ships.js';
import { serviceQuote } from '../src/ui/screens/services.js';

function reduceTimes(seed, count, reducer) {
  let value = seed;
  for (let i = 0; i < count; i += 1) value = reducer(value, i + 1);
  return value;
}

function runtime() {
  const bus = createBus();
  const entity = {
    id: 1,
    type: 'ship',
    alive: true,
    hull: 30,
    hullMax: 100,
    armorHp: 10,
    armorMax: 50,
    data: { defId: 'ship_kestrel' },
  };
  const state = {
    simTime: 0,
    tick: 0,
    playerId: entity.id,
    entityList: [entity],
    entities: new Map([[entity.id, entity]]),
    ui: { dockedStationId: 'station_helios' },
    player: {
      credits: 1000,
      activeShipIndex: 0,
      ownedShips: [
        { defId: 'ship_kestrel', fittings: [], livingHull: defaultLivingHull(0) },
        { defId: 'ship_mule', fittings: [], livingHull: defaultLivingHull(0) },
      ],
    },
  };
  const shipSystem = Object.create(ships);
  shipSystem.init({ state, bus, helpers: {} });
  const economySystem = Object.create(economy);
  economySystem.state = state;
  economySystem.bus = bus;
  economySystem._lastDockedStation = 'station_helios';
  return { state, bus, entity, shipSystem, economySystem };
}

test('Living Hull reducers are bounded, deterministic, and a wash erases only grime', () => {
  const start = defaultLivingHull(0);
  const killed = reduceTimes(start, 30, livingHullWithKill);
  const vented = reduceTimes(killed, 30, livingHullWithVent);
  const repaired = reduceTimes(vented, 30, (hull, atT) => livingHullWithRepair(hull, {
    restoredHull: 25,
    restoredArmor: 0,
    hullMax: 100,
    armorMax: 50,
    beforeProtection: 0.5,
  }, atT));
  const marked = livingHullWithGraffiti(repaired, {
    line: '  SHE STILL BITES  ',
    author: ' Dock Rat ',
  }, 400);

  assert.equal(killed.killTally, LIVING_HULL_KILL_TALLY_MAX);
  assert.equal(vented.heatScorch, LIVING_HULL_HEAT_SCORCH_MAX);
  assert.equal(repaired.repairPatches, LIVING_HULL_REPAIR_PATCH_MAX);
  assert.equal(marked.graffitiLine, 'SHE STILL BITES');
  assert.equal(marked.graffitiAuthor, 'Dock Rat');
  assert.equal(livingHullCyclesSinceWash(marked, 10_000), 16);
  assert.equal(livingHullGrimeAt(marked, 10_000), LIVING_HULL_GRIME_MAX);

  const washed = livingHullAfterWash(marked, 10_000);
  assert.equal(livingHullGrimeAt(washed, 10_000), 0);
  assert.equal(washed.washCount, 1);
  assert.equal(washed.killTally, marked.killTally);
  assert.equal(washed.repairPatches, marked.repairPatches);
  assert.equal(washed.heatScorch, marked.heatScorch);
  assert.equal(washed.graffitiLine, marked.graffitiLine);
});

test('canonical combat, berth, and bulkhead receipts stay on the active owned hull without rebuilds', () => {
  const { state, bus, entity, shipSystem } = runtime();
  const appearanceEvents = [];
  const livingEvents = [];
  bus.on('ship:appearanceChanged', (payload) => appearanceEvents.push(payload));
  bus.on('ship:livingHullChanged', (payload) => livingEvents.push(payload));

  for (let i = 0; i < 20; i += 1) {
    bus.emit('lossLedger:recorded', { kind: 'ship', killedByPlayer: true, shipDefId: 'ship_wasp' });
  }
  for (let i = 0; i < 8; i += 1) {
    bus.emit('weapons:vent', { phase: 'start', ownerId: entity.id });
  }
  bus.emit('graffiti:show', { where: 'bulkhead', line: 'Kestrel remembers', author: 'Mara' });

  const kestrelHistory = state.player.ownedShips[0].livingHull;
  assert.equal(kestrelHistory.killTally, LIVING_HULL_KILL_TALLY_MAX);
  assert.equal(kestrelHistory.heatScorch, LIVING_HULL_HEAT_SCORCH_MAX);
  assert.equal(kestrelHistory.graffitiLine, 'Kestrel remembers');
  assert.equal(entity.data.livingHull, kestrelHistory, 'the live entity mirrors the durable owned hull');
  assert.equal(appearanceEvents.length, 0, 'history updates must not request mesh rebuild/admission');
  assert.ok(livingEvents.length > 0);

  state.player.activeShipIndex = 1;
  shipSystem.reconcileLivingHull();
  bus.emit('lossLedger:recorded', { kind: 'ship', killedByPlayer: true, shipDefId: 'ship_scythe' });
  assert.equal(state.player.ownedShips[0].livingHull.killTally, LIVING_HULL_KILL_TALLY_MAX);
  assert.equal(state.player.ownedShips[1].livingHull.killTally, 1);

  state.simTime = 9000;
  delete state.player.ownedShips[1].livingHull;
  shipSystem.reconcileLivingHull();
  assert.equal(livingHullGrimeAt(state.player.ownedShips[1].livingHull, state.simTime), 0,
    'an old save begins clean when its optional record is first normalized');
});

test('repair berths sell a priced wash while preserving tallies, patches, scorch, and graffiti', () => {
  const { state, bus, entity, shipSystem, economySystem } = runtime();
  state.simTime = 2400;
  state.player.ownedShips[0].livingHull = normalizeLivingHull({
    ...defaultLivingHull(0),
    killTally: 7,
    heatScorch: 2,
    graffitiLine: 'NO GODS IN VACUUM',
    graffitiAuthor: 'Mara',
  }, 0);
  shipSystem.reconcileLivingHull();

  const repairReceipts = [];
  bus.on('service:completed', (payload) => repairReceipts.push(payload));
  economySystem.handleService({ type: 'repair' });
  assert.equal(entity.hull, entity.hullMax);
  assert.equal(entity.armorHp, entity.armorMax);
  assert.equal(state.player.ownedShips[0].livingHull.repairPatches, 1);
  assert.ok(repairReceipts[0].restoredHull > 0);
  assert.ok(repairReceipts[0].restoredArmor > 0);
  assert.ok(repairReceipts[0].beforeProtection < 0.65);

  const beforeWash = state.player.ownedShips[0].livingHull;
  const quote = serviceQuote('hull_wash', state, entity);
  assert.equal(quote.cost, SERVICE_PRICES.hullWashCr);
  assert.equal(quote.disabled, false);
  assert.match(quote.detail, /Surface grime 36%/);
  assert.match(quote.detail, /tallies, patches, scorch, and marks stay/);

  const creditsBefore = state.player.credits;
  economySystem.handleService({ type: 'hull_wash' });
  const afterWash = state.player.ownedShips[0].livingHull;
  assert.equal(state.player.credits, creditsBefore - SERVICE_PRICES.hullWashCr);
  assert.equal(livingHullGrimeAt(afterWash, state.simTime), 0);
  assert.equal(afterWash.washCount, 1);
  assert.equal(afterWash.killTally, beforeWash.killTally);
  assert.equal(afterWash.repairPatches, beforeWash.repairPatches);
  assert.equal(afterWash.heatScorch, beforeWash.heatScorch);
  assert.equal(afterWash.graffitiLine, beforeWash.graffitiLine);
  assert.equal(serviceQuote('hull_wash', state, entity).disabled, true);

  state.simTime += 600;
  state.ui.dockedStationId = 'station_beltout';
  economySystem._lastDockedStation = 'station_beltout';
  const deniedCredits = state.player.credits;
  const deniedRecord = state.player.ownedShips[0].livingHull;
  economySystem.handleService({ type: 'hull_wash' });
  assert.equal(state.player.credits, deniedCredits);
  assert.equal(state.player.ownedShips[0].livingHull, deniedRecord);
});
