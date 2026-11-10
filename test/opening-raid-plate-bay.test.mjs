// The day-0 hauler says the raiders' plate is already in the salvage bay when every raider
// is down. That sentence is the deposit. Escape, theft, a dead hauler, and flying on do not
// say it, and they do not fill the bay. Dock cash-in is the existing salvage owner.
import test from 'node:test';
import assert from 'node:assert/strict';

import { runtime } from '../src/data/encounters/344-opening-hauler-raid.js';
import { cashInSalvage } from '../src/systems/cargo.js';
import { PRODUCTION_FEATURES, LEGACY47A_FEATURES } from '../src/runtime/runtimeProfiles.js';

const PLATE = 'cmdty_comp_hullplate';

function playerState(features) {
  return {
    meta: { seed: 4242 },
    simTime: 20,
    player: { credits: 0 },
    runtime: { features },
    entities: new Map(),
  };
}

function drive({ hauler, raiders, raiderEscaped = false, now = 20, features = PRODUCTION_FEATURES, custody = true, player = {}, content }) {
  const logs = [];
  const live = {
    phase: 'conflict',
    deadlineAt: 100,
    ids: [1, 2],
    roles: { 1: 'hauler', 2: 'raider' },
    data: custody ? { freightCargoCustody: { terminal: true, raiderEscaped } } : {},
    outcome: null,
  };
  const d = {
    aliveCount(_live, role) {
      if (role === 'hauler') return hauler;
      if (role === 'raider') return raiders;
      return 0;
    },
    despawnAll() {},
    resolve(row, outcome, options) {
      row.outcome = outcome;
      row.phase = 'done';
      row.resolveOptions = options;
      return outcome;
    },
    emit(event, payload) { logs.push({ event, payload }); },
    grant(amount, reason) { logs.push({ event: 'grant', amount, reason }); },
    rep() {},
  };
  const state = playerState(features);
  Object.assign(state.player, player);
  if (content) state.content = content;
  runtime.tick(d, live, state, now);
  return { live, logs, state, director: d };
}

function plateQty(state) {
  return state.player.salvageBay?.items?.[PLATE] || 0;
}

test('seed 4242: killing the raiders puts one hull plate in the bay, and a dock pays it', () => {
  const defended = drive({ hauler: 1, raiders: 0 });
  assert.equal(defended.live.outcome, 'defended');
  assert.equal(plateQty(defended.state), 1);
  assert.equal(defended.state.player.salvageBay.usedVolume, 0.7);
  const paid = cashInSalvage(defended.state);
  assert.equal(paid.units, 1);
  assert.equal(paid.credits, 65);
  assert.deepEqual(paid.lots, [{ commodityId: PLATE, qty: 1, credits: 65 }]);
  assert.equal(plateQty(defended.state), 0);
  const line = defended.logs.find((row) => row.event === 'comms:log');
  assert.match(line.payload.text, /plate's in your bay/);
});

test('seed 4242: legacy profile and the unpaid endings leave the bay empty', () => {
  const legacy = drive({ hauler: 1, raiders: 0, features: LEGACY47A_FEATURES });
  assert.equal(legacy.live.outcome, 'defended');
  assert.equal(legacy.state.player.salvageBay, undefined);
  assert.doesNotMatch(legacy.logs.find((row) => row.event === 'comms:log').payload.text, /plate's in your bay/);

  for (const ending of [
    { hauler: 0, raiders: 1, raiderEscaped: true, outcome: 'robbed' },
    { hauler: 0, raiders: 1, raiderEscaped: false, outcome: 'hauler_destroyed' },
    { hauler: 1, raiders: 2, now: 100, outcome: 'raid_over' },
    { hauler: 1, raiders: 0, raiderEscaped: true, outcome: 'robbed' },
  ]) {
    const row = drive(ending);
    assert.equal(row.live.outcome, ending.outcome);
    assert.equal(plateQty(row.state), 0, ending.outcome);
  }
});

test('a full salvage bay receives the plate value once, without invented cargo or lost rewards', () => {
  const row = drive({ hauler: 1, raiders: 0,
    player: { salvageBay: { items: { cmdty_ore_iron: 600 }, usedVolume: 600 } } });
  assert.equal(plateQty(row.state), 0);
  assert.equal(row.state.player.salvageBay.usedVolume, 600);
  assert.equal(row.state.player.salvageBay.items.cmdty_ore_iron, 600);
  assert.deepEqual(row.logs.filter((entry) => entry.event === 'grant'), [
    { event: 'grant', amount: 250, reason: 'convoy:guard' },
    { event: 'grant', amount: 65, reason: 'convoy:plate_overflow' },
  ]);
  assert.match(row.logs.find((entry) => entry.event === 'comms:log').payload.text, /bay is full.*65 cr/);
  runtime.tick(row.director, row.live, row.state, 21);
  assert.equal(row.logs.filter((entry) => entry.event === 'grant').length, 2);
});

test('overflow settlement values the plate through the active commodity content', () => {
  const row = drive({ hauler: 1, raiders: 0,
    player: { salvageBay: { items: {}, usedVolume: 600 } },
    content: { commodities: { [PLATE]: { basePrice: 200, volPerU: 0.7, massPerU: 1, legality: 'legal' } } },
  });
  assert.equal(row.logs.find((entry) => entry.reason === 'convoy:plate_overflow').amount, 120);
  assert.equal(plateQty(row.state), 0);
});

test('seed 4242: a physical escape pays hazard pay and does not invent a plate', () => {
  const carrierId = 1;
  const raiderId = 2;
  const manifest = {
    manifestId: 'fm_escape',
    lines: [{ commodityId: 'cmdty_fuel_cells', qty: 8 }],
    totalQty: 8,
  };
  const carrier = {
    id: carrierId,
    alive: true,
    occupantGeneration: 3,
    pos: { x: 400, z: 0 },
    vel: { x: 0, z: 0 },
    data: { cargoManifest: manifest },
  };
  const raider = {
    id: raiderId,
    alive: true,
    occupantGeneration: 4,
    pos: { x: -400, z: 0 },
    vel: { x: 0, z: 0 },
  };
  const state = playerState(PRODUCTION_FEATURES);
  state.entities.set(carrierId, carrier);
  state.entities.set(raiderId, raider);
  const live = {
    id: 'raid-escape',
    phase: 'conflict',
    deadlineAt: 1000,
    ids: [carrierId, raiderId],
    roles: { [carrierId]: 'hauler', [raiderId]: 'raider' },
    causality: {},
    data: {
      physicalEscape: {
        carrierId,
        generation: 3,
        manifestId: manifest.manifestId,
        totalQty: 8,
        lines: JSON.stringify(manifest.lines.map((line) => [line.commodityId, line.qty])),
        origin: { x: 0, z: 0 },
        intervenedAt: 0,
        clearSince: null,
        raiderGenerations: { [String(raiderId)]: 4 },
      },
    },
  };
  const d = {
    state,
    aliveCount(_live, role) {
      if (role === 'hauler') return 1;
      if (role === 'raider') return 1;
      return 0;
    },
    despawnAll() {},
    resolve(row, outcome) {
      row.outcome = outcome;
      row.phase = 'done';
      return outcome;
    },
    emit() {},
    grant() {},
    rep() {},
    _scriptEvent() {},
    clearPredation() {},
    now() { return 0; },
  };
  runtime.tick(d, live, state, 10);
  assert.equal(live.phase, 'conflict');
  assert.equal(plateQty(state), 0);
  runtime.tick(d, live, state, 14);
  assert.equal(live.outcome, 'defended');
  assert.equal(live.causality.resolutionMethod, 'physical_escape');
  assert.equal(plateQty(state), 0);
  assert.equal(state.player.salvageBay, undefined);
});
