// Recalling a mining drone names the credits that recall paid.
import assert from 'node:assert/strict';
import test from 'node:test';

import { automation } from '../src/systems/automation.js';
import { DRONES } from '../src/data/automation.js';

function drive() {
  const events = [];
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 4242 },
    player: { id: 'player', credits: 1000, hints: {} },
    settings: { gameplay: {} },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
    automation: null,
  };
  const bus = {
    on() { return () => {}; },
    emit(event, payload) { events.push({ event, payload }); },
  };
  const system = Object.create(automation);
  system.init({ state, bus, helpers: {}, registry: null });
  return { state, events, system };
}

function loadedDrone() {
  const def = DRONES[0];
  return {
    id: 'drone-g1',
    defId: def.id,
    count: 1,
    tier: def.tier,
    sectorId: 'sector_helios_prime',
    oreType: 'cmdty_ore_iron',
    buffer: def.bufferCap,
    bufferCap: def.bufferCap,
    fuel: def.fuelMax,
    fuelMax: def.fuelMax,
    durability: def.durabilityMax,
    durabilityMax: def.durabilityMax,
    autoReturn: false,
    status: 'idle',
    ratePerMin: 0,
    entityIds: [],
  };
}

function recallLine(events) {
  const toast = events.find((event) => (
    event.event === 'toast'
    && event.payload
    && String(event.payload.text).startsWith('Drone recalled')
  ));
  return toast ? String(toast.payload.text) : '';
}

function namedOreCr(line) {
  const match = line.match(/\+(\d+) cr ore/);
  return match ? Number(match[1]) : null;
}

function granted(events) {
  return events.filter((event) => (
    event.event === 'economy:grantCredits'
    && event.payload
    && event.payload.reason === 'automation:drone'
  ));
}

test('a recall before the cap refills does not claim the ore hold was paid (seed 4242)', () => {
  const h = drive();
  const drone = loadedDrone();
  h.state.automation.drones.push(drone);
  const gross = h.system._droneBufferValue(drone);
  assert.ok(gross > 0);
  assert.equal(h.system._capBudget, 0);
  assert.equal(h.system.recallDrone('drone-g1'), true);
  const line = recallLine(h.events);
  assert.equal(namedOreCr(line), 0);
  assert.equal(line.includes(String(gross)), false);
  assert.equal(granted(h.events).length, 0);
});

test('a recall against one minute of cap names the credits that minute paid (seed 4242)', () => {
  const h = drive();
  const drone = loadedDrone();
  h.state.automation.drones.push(drone);
  const gross = h.system._droneBufferValue(drone);
  const minute = h.system.passiveCapPerMin();
  assert.ok(gross > minute);
  h.system._capBudget = minute;
  assert.equal(h.system.recallDrone('drone-g1'), true);
  const paid = granted(h.events);
  assert.equal(paid.length, 1);
  assert.ok(paid[0].payload.amount > 0);
  assert.ok(paid[0].payload.amount < gross);
  assert.equal(namedOreCr(recallLine(h.events)), paid[0].payload.amount);
});
