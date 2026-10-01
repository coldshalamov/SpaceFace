import test from 'node:test';
import assert from 'node:assert/strict';

import { automation } from '../src/systems/automation.js';
import { DRONES } from '../src/data/automation.js';

// ECON-06 — drone ore sales land through the economy's grantCredits listener exactly once:
// automation emits the intent, it never writes player.credits itself, and the recall path
// banks the buffer through the same capped funnel the programmed depot sale uses.

function drive() {
  const events = [];
  const state = {
    simTime: 0,
    tick: 0,
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
  return {
    state,
    events,
    system,
    grants() {
      return events.filter((e) => e.event === 'economy:grantCredits');
    },
    // The per-minute cap bucket refills inside update() — tick the system so a bank call
    // has budget the way a live tick would have given it.
    tick(seconds = 60) { system.update(seconds, state); },
  };
}

function oreGroup() {
  const def = DRONES[0];
  return {
    id: 'drone-g1', defId: def.id, count: 1, tier: def.tier,
    sectorId: 'sector_helios_prime',
    buffer: 40, bufferCap: def.bufferCap,
    fuel: def.fuelMax, fuelMax: def.fuelMax,
    durability: def.durabilityMax, durabilityMax: def.durabilityMax,
    autoReturn: false, status: 'idle', ratePerMin: 0, entityIds: [],
  };
}

test('ECON-06: recalling a loaded drone emits one economy:grantCredits and writes no credits', () => {
  const h = drive();
  h.state.automation.drones.push(oreGroup());
  h.tick();
  const ok = h.system.recallDrone('drone-g1');
  assert.equal(ok, true);
  const grants = h.grants();
  assert.equal(grants.length, 1, 'the ore value lands through the economy listener once');
  assert.equal(grants[0].payload.reason, 'automation:drone');
  assert.ok(grants[0].payload.amount > 0, 'the buffered ore has value');
  assert.equal(h.state.player.credits, 1000, 'automation never writes credits itself');
});

test('ECON-06: an empty drone recalls with no grant intent', () => {
  const h = drive();
  const g = oreGroup();
  g.buffer = 0;
  h.state.automation.drones.push(g);
  assert.equal(h.system.recallDrone('drone-g1'), true);
  assert.equal(h.grants().length, 0, 'no ore, no sale');
});

test('ECON-06: creditPassive is the sole funnel — one intent per bank, capped not duplicated', () => {
  const h = drive();
  h.tick();
  h.system.creditPassive(100, 'drone');
  h.system.creditPassive(100, 'drone');
  const grants = h.grants();
  assert.equal(grants.length, 2, 'each bank call is one intent, no replay');
  assert.equal(h.state.player.credits, 1000, 'the funnel stays listener-mediated');
});
