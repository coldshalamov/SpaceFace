import assert from 'node:assert/strict';
import test from 'node:test';

import { DRONES } from '../src/data/automation.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  automation,
  droneBayCapacityForState,
} from '../src/systems/automation.js';
import {
  buildSlotList,
  droneBayCompatibleSlotCount,
  droneBayCountForFittings,
  getDerivedStats,
} from '../src/systems/ships.js';
import {
  automationNextAction,
  automationScreen,
  describeAutomationPurchase,
} from '../src/ui/screens/automationPanel.js';

const BAY_ID = 'mod_drone_bay_l';
const HULL_ID = 'ship_ranger';
const DRONE = DRONES.find((def) => def.tier === 1) || DRONES[0];

function fittingsWithBays(count = 1) {
  const hull = SHIPS.find((def) => def.id === HULL_ID);
  const slots = buildSlotList(hull);
  const fittings = new Array(slots.length).fill(null);
  const baySlots = slots
    .map((slot, index) => ({ slot, index }))
    .filter(({ slot }) => slot.type === 'utility' && slot.size === 'L');
  for (let index = 0; index < Math.min(count, baySlots.length); index += 1) {
    fittings[baySlots[index].index] = BAY_ID;
  }
  return fittings;
}

function makeState({
  bays = 0,
  researched = ['tech_drone_control'],
  tier = 1,
  credits = 1_000_000,
  hullId = HULL_ID,
} = {}) {
  const fittings = hullId === HULL_ID ? fittingsWithBays(bays) : [];
  return {
    playerId: 1,
    player: {
      activeShipIndex: 0,
      credits,
      droneTierCap: tier,
      researchedNodes: researched,
      moduleInventory: [],
      ownedShips: [{ defId: hullId, fittings }],
    },
    automation: { drones: [], traders: [], outposts: [], fleet: [] },
    world: { currentSectorId: 'sector_helios_prime' },
  };
}

function makeAutomationHost(state) {
  const events = [];
  const charges = [];
  const host = Object.create(automation);
  Object.assign(host, {
    state,
    bus: { emit: (name, payload) => events.push({ name, payload }) },
    _charge(amount, reason) {
      charges.push({ amount, reason });
      return true;
    },
    _allocId: (() => { let id = 0; return () => ++id; })(),
    _playerPos: () => ({ x: 10, z: 20 }),
    _currentFieldId: () => null,
    _currentOreId: () => 'cmdty_ore_iron',
    _spawnDroneEntities() {},
  });
  return { host, events, charges };
}

test('ships derives Drone Bay capacity only from compatible active-hull fittings', () => {
  assert.equal(droneBayCompatibleSlotCount('ship_kestrel'), 0);
  assert(droneBayCompatibleSlotCount(HULL_ID) > 0);
  assert.equal(droneBayCountForFittings(HULL_ID, fittingsWithBays(1)), 1);
  assert.equal(droneBayCountForFittings(HULL_ID, fittingsWithBays(2)), 2);
  assert.equal(getDerivedStats(HULL_ID, fittingsWithBays(1)).droneBayCount, 1);

  const hull = SHIPS.find((def) => def.id === HULL_ID);
  const slots = buildSlotList(hull);
  const incompatible = new Array(slots.length).fill(null);
  incompatible[slots.findIndex((slot) => slot.type !== 'utility')] = BAY_ID;
  assert.equal(droneBayCountForFittings(HULL_ID, incompatible), 0);
  assert.equal(droneBayCountForFittings('missing_hull', fittingsWithBays(1)), 0);
});

test('capacity is per active bay, Drone Swarm is deduplicated, and malformed tech fails closed', () => {
  const base = makeState({ bays: 1 });
  assert.deepEqual(droneBayCapacityForState(base), {
    bayCount: 1,
    compatibleSlotCount: droneBayCompatibleSlotCount(HULL_ID),
    droneControlResearched: true,
    extraPerBay: 0,
    perBay: 1,
    capacity: 1,
    used: 0,
    available: 1,
  });

  base.player.researchedNodes.push('tech_drone_swarm', 'tech_drone_swarm');
  assert.equal(droneBayCapacityForState(base).capacity, 2);

  const swarm = TECH_NODES.find((node) => node.id === 'tech_drone_swarm');
  const original = swarm.unlocks.extraDronePerBay;
  try {
    swarm.unlocks.extraDronePerBay = '1';
    assert.equal(droneBayCapacityForState(base).capacity, 1);
    swarm.unlocks.extraDronePerBay = true;
    assert.equal(droneBayCapacityForState(base).capacity, 1);
    swarm.unlocks.extraDronePerBay = Infinity;
    assert.equal(droneBayCapacityForState(base).capacity, 1);
  } finally {
    swarm.unlocks.extraDronePerBay = original;
  }
});

test('purchase gates tier then live bay capacity before charge and deploy event', () => {
  const fittedWithoutTech = makeAutomationHost(makeState({ bays: 1, researched: [] }));
  assert.equal(fittedWithoutTech.host.buyDrone(DRONE.id), false);
  assert.equal(fittedWithoutTech.charges.length, 0);
  assert.match(fittedWithoutTech.events.at(-1).payload.text, /research drone control/i);

  const noBay = makeState({ bays: 0 });
  noBay.player.moduleInventory.push(BAY_ID);
  const denied = makeAutomationHost(noBay);
  assert.equal(denied.host.buyDrone(DRONE.id), false);
  assert.equal(denied.charges.length, 0);
  assert.equal(noBay.automation.drones.length, 0);
  assert.equal(denied.events.filter((event) => event.name === 'asset:deployed').length, 0);

  const state = makeState({ bays: 1 });
  const live = makeAutomationHost(state);
  assert.equal(live.host.buyDrone(DRONE.id), true);
  assert.equal(live.charges.length, 1);
  assert.equal(state.automation.drones.length, 1);
  assert.equal(live.events.filter((event) => event.name === 'asset:deployed').length, 1);
  assert.equal(live.host.buyDrone(DRONE.id), false, 'duplicate event sees the updated live ledger');
  assert.equal(live.charges.length, 1, 'at-cap denial occurs before charging');
  assert.equal(state.automation.drones.length, 1);

  const higherTier = DRONES.find((def) => def.tier > 1);
  if (higherTier) {
    const tierFirst = makeAutomationHost(makeState({ bays: 0, tier: 1 }));
    assert.equal(tierFirst.host.buyDrone(higherTier.id), false);
    assert.match(tierFirst.events.at(-1).payload.text, /tier locked/i);
  }
});

test('ship switch/refit can leave existing drones over cap but never deletes them', () => {
  const state = makeState({ bays: 1, researched: ['tech_drone_control', 'tech_drone_swarm'] });
  state.automation.drones.push({ id: 1 }, { id: 2 });
  assert.equal(droneBayCapacityForState(state).available, 0);

  state.player.ownedShips.push({ defId: HULL_ID, fittings: fittingsWithBays(0) });
  state.player.activeShipIndex = 1;
  const afterSwitch = droneBayCapacityForState(state);
  assert.equal(afterSwitch.capacity, 0);
  assert.equal(afterSwitch.used, 2);
  assert.equal(state.automation.drones.length, 2);
  const denied = makeAutomationHost(state);
  assert.equal(denied.host.buyDrone(DRONE.id), false);
  assert.equal(denied.charges.length, 0);

  state.player.activeShipIndex = 99;
  assert.equal(droneBayCapacityForState(state).capacity, 0);
  const continued = JSON.parse(JSON.stringify({ player: state.player, automation: state.automation }));
  assert.equal(droneBayCapacityForState(continued).capacity, 0);
  assert.equal(continued.automation.drones.length, 2);
});

test('Automation purchase copy matches the backend bay and capacity gates', () => {
  const tierLocked = DRONES.find((def) => def.tier > 1);
  if (tierLocked) {
    assert.equal(describeAutomationPurchase('drone', tierLocked, makeState({ bays: 0, tier: 1 })).state, 'tier');
  }

  const starterBeforeResearch = describeAutomationPurchase('drone', DRONE,
    makeState({ hullId: 'ship_kestrel', researched: [] }));
  assert.equal(starterBeforeResearch.state, 'drone_hull');
  assert.match(starterBeforeResearch.title, /research drone control/i);
  assert.match(starterBeforeResearch.title, /L utility slot/i);

  const starterAfterResearch = describeAutomationPurchase('drone', DRONE,
    makeState({ hullId: 'ship_kestrel', researched: ['tech_drone_control'] }));
  assert.equal(starterAfterResearch.state, 'drone_hull');
  assert.doesNotMatch(starterAfterResearch.title, /research drone control/i);
  assert.match(starterAfterResearch.title, /L utility slot/i);

  const compatibleBeforeResearch = describeAutomationPurchase('drone', DRONE,
    makeState({ bays: 0, researched: [] }));
  assert.equal(compatibleBeforeResearch.state, 'drone_tech');

  const noBay = describeAutomationPurchase('drone', DRONE, makeState({ bays: 0, credits: 0 }));
  assert.equal(noBay.state, 'drone_bay');
  assert.match(noBay.label, /fit drone bay/i);

  const fullState = makeState({ bays: 1 });
  fullState.automation.drones.push({ id: 1 });
  const full = describeAutomationPurchase('drone', DRONE, fullState);
  assert.equal(full.state, 'drone_capacity');
  assert.match(full.label, /1\/1/);

  const available = describeAutomationPurchase('drone', DRONE, makeState({ bays: 1 }));
  assert.equal(available.state, 'available');
  assert.equal(available.disabled, false);
});

test('no-slot recommendation opens the real Helios Shipworks route', () => {
  const undocked = makeState({ hullId: 'ship_kestrel', researched: ['tech_drone_control'] });
  const pushed = [];
  const mapEvents = [];
  const undockedScreen = Object.create(automationScreen);
  undockedScreen._ctx = {
    state: undocked,
    bus: { emit: (name, payload) => mapEvents.push({ name, payload }) },
    screenManager: { pushScreen: (id) => pushed.push(id) },
  };
  undockedScreen._onAction('openShipworksRoute', 'shipworks');
  assert.deepEqual(pushed, ['galaxyMap']);
  assert.equal(undocked.ui.mapOpenIntent.stationId, 'station_helios');
  assert.equal(undocked.ui.mapOpenIntent.sectorId, 'sector_helios_prime');
  assert.equal(mapEvents.some((event) => event.name === 'ui:fleetOrder'), false);

  const next = automationNextAction(undocked);
  assert.equal(next.action, 'openShipworksRoute');
  assert.equal(next.cta, 'Plot Helios Shipworks');

  const docked = makeState({ hullId: 'ship_kestrel', researched: ['tech_drone_control'] });
  docked.ui = { docked: true, dockedStationId: 'station_helios' };
  const stationEvents = [];
  let closed = 0;
  const dockedScreen = Object.create(automationScreen);
  dockedScreen._ctx = { state: docked, bus: { emit: (name, payload) => stationEvents.push({ name, payload }) } };
  dockedScreen._close = () => { closed += 1; };
  dockedScreen._onAction('openShipworksRoute', 'shipworks');
  assert.equal(closed, 1);
  assert.deepEqual(stationEvents, [{ name: 'station:navigate', payload: { destination: 'shipworks' } }]);
  assert.equal(automationNextAction(docked).cta, 'Open Shipworks');
});

test('catalog still identifies Drone Bay L as the capacity-bearing module', () => {
  const bay = MODULES.find((def) => def.id === BAY_ID);
  assert.equal(bay.slotType, 'utility');
  assert.equal(bay.size, 'L');
  assert.equal(bay.mods.droneBay, 1);
});
