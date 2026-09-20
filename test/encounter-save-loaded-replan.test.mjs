// A load is a non-continuous sector enter. _onSectorEnter deliberately early-returns while
// _saveRestoring, and _onSaveLoaded is where the authored entry breath and planner were
// promised ("jump / load / boot enters still get the entry breath and planner"). Before this
// contract the handler rebuilt the director bag but never planned: pending stayed empty until
// the next day:tick — up to DAY_SECONDS (600 s) of dead air after every load — and pressure
// then warmed from zero on top of the wait. Real handler, real planner, compressed clock.

import assert from 'node:assert/strict';
import test from 'node:test';

import { encounterDirector } from '../src/systems/encounterDirector.js';

const SECTOR = 'sector_nyx_march';

function makeHarness({ simTime = 0 } = {}) {
  const entities = new Map();
  const player = {
    id: 1, type: 'ship', alive: true, hull: 400, hullMax: 400, shield: 200, shieldMax: 200,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, flags: {},
  };
  entities.set(1, player);
  const state = {
    playerId: 1,
    entities,
    simTime,
    tick: 0,
    player: { flags: {}, credits: 5000, cargo: { items: {} }, bounty: 0, heat: 0 },
    onboarding: { active: false, finished: true },
    ui: {},
    world: { currentSectorId: SECTOR },
    meta: { seed: 8008 },
    story: { beatIndex: 3 },
  };
  const events = [];
  const dir = Object.create(encounterDirector);
  dir.state = state;
  dir.bus = { emit(name, payload) { events.push({ name, payload }); }, on() {} };
  dir.helpers = { spawnEntity() { return null; } };
  // A representative saved bag: named grudges, receipts, cooldowns and stats ride the save;
  // live/pending/pressure are transient and the load must rebuild them.
  state.encounterDirector = {
    pending: [{ shapeId: 'stale_save_row' }], active: { old: {} },
    live: { older: {} }, plannedKey: `${SECTOR}#0`,
    pressure: { combat: 0, civilian: 0 }, noise: { mining: 0 }, window: [{ t: -5 }],
    cooldowns: { pirate_toll: 5 }, named: { cap_morra: { id: 'cap_morra' } },
    externalNamed: {}, receipts: [{ encounterId: 'old' }],
    stats: { fired: 7, resolved: 3, fizzled: 1 },
    lastMeaningfulAt: -1e9, lastAmbientAt: -1e9, lastMajorAt: -1e9, lastEndAt: -1e9,
    escalationSeeds: [], _accum: 0, proxStarve: {},
  };
  return { state, player, entities, events, dir };
}

test('save:loaded plans the current sector-day immediately instead of waiting for the next day:tick', () => {
  const { state, dir } = makeHarness();
  dir._onSaveLoaded();

  const fresh = state.encounterDirector;
  assert.notEqual(fresh.plannedKey, null, 'the load must leave a sector-day plan behind');
  assert.equal(fresh.plannedKey, `${SECTOR}#0`);
  assert.ok(fresh.pending.length > 0,
    'pending must be repopulated at load time — it used to stay empty until the next day:tick');
  for (const item of fresh.pending) {
    assert.ok(item.dueAt >= state.simTime, 'planned items schedule forward from the loaded clock');
    assert.equal(item.sectorId, SECTOR);
  }
});

test('save:loaded seeds the entry breath like a jump-in instead of warming pressure from zero', () => {
  const { state, dir } = makeHarness({ simTime: 3600 });
  dir._onSaveLoaded();

  const fresh = state.encounterDirector;
  assert.ok(fresh.pressure.combat >= 22,
    `entry grace pressure expected, got ${fresh.pressure.combat}`);
  assert.ok(fresh.pressure.civilian >= 30,
    `entry grace civilian pressure expected, got ${fresh.pressure.civilian}`);
  assert.equal(fresh.lastMeaningfulAt, 3600,
    'the sector-entry breath (≥30 s before beats) starts at the loaded clock');
  assert.deepEqual(fresh.window, [], 'the pacing window does not inherit the outgoing timeline');
});

test('save:loaded still carries the durable save-owned bags across the rebuild', () => {
  const { state, dir } = makeHarness();
  dir._onSaveLoaded();

  const fresh = state.encounterDirector;
  assert.equal(fresh.named.cap_morra.id, 'cap_morra', 'named grudges survive the load');
  assert.equal(fresh.receipts.length, 1, 'receipts survive the load');
  assert.equal(fresh.stats.fired, 7, 'stats survive the load');
  assert.ok(fresh.cooldowns.pirate_toll <= 5 + 900, 'cooldowns are clamped, not discarded');
  assert.deepEqual(fresh.live, {}, 'live encounters are transient and must not survive');
  assert.deepEqual(fresh.active, {}, 'the spawn budget hard-resets on load');
});
