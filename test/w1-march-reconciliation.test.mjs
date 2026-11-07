// W1 — Provost March's reconciliation counter has a writer (the last frozen depth counter).
// Deed: a PLAYER aftermath wreck recovery completing (`aftermathWreck:completed` with
// `byPlayer: true`) bumps `march.reconciliation` once per durable marker, clamped by the def.
// A rival scavenger strip or a site auto-reconcile fires the same event without the receipt and
// must not file. Run: node --test test/w1-march-reconciliation.test.mjs

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createGameState } from '../src/core/gameState.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactCounterValue, CONTACT_COUNTER_DEFS } from '../src/data/stationContacts.js';
import { barContactIntelTags } from '../src/ui/station/barContacts.js';
import { aftermathWrecks, salvageCompletedByPlayer } from '../src/systems/aftermathWrecks.js';
import { compileFinaleContent } from '../src/story/endings/finaleContent.js';

function boot(seed = 47) {
  const state = createGameState(seed);
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers });
  core.preStep(1 / 60, state);
  return { state, bus };
}

function contactsFor(booted) {
  const contacts = { ...stationContacts };
  contacts.init({ state: booted.state, bus: booted.bus, helpers: {} });
  return contacts;
}

const MARCH_TRACKER = 'march.reconciliation';
const MARCH_CONTACT = CONTACT_COUNTER_DEFS[MARCH_TRACKER].contactId;

test('March files a player-recovered wreck exactly once, keyed by the durable marker', () => {
  const { state, bus } = boot();
  contactsFor({ state, bus });

  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 0, 'counter starts at 0');

  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_1', wreckId: 'wreck_a', sectorId: 'sector_helios_prime', byPlayer: true,
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 1, 'one wreck filed');

  // The same wreck re-reported does not file twice (dedup by receipt).
  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_1', wreckId: 'wreck_a', sectorId: 'sector_helios_prime', byPlayer: true,
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 1, 'same wreck deduped');

  // A different wreck files again.
  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_2', wreckId: 'wreck_b', sectorId: 'sector_ceres_belt', byPlayer: true,
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 2, 'second wreck filed');

  // Same recycled numeric wreckId, different durable marker: this is a different hull and files.
  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_3', wreckId: 'wreck_b', sectorId: 'sector_ceres_belt', byPlayer: true,
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 3,
    'a recycled wreckId must not dedupe a different marker');

  // Same marker, different wreck body: one hull, one filing.
  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_3', wreckId: 'wreck_c', sectorId: 'sector_ceres_belt', byPlayer: true,
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 3,
    'the durable marker is the identity');
});

test('a scavenger strip or site auto-reconcile never files for March', () => {
  const { state, bus } = boot();
  contactsFor({ state, bus });

  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_scav', wreckId: 'wreck_scav', sectorId: 'sector_helios_prime',
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 0, 'no player receipt, no deed');

  bus.emit('aftermathWreck:completed', {
    markerId: 'mk_scav2', wreckId: 'wreck_scav2', sectorId: 'sector_helios_prime', byPlayer: false,
  });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 0, 'explicit false is not a player filing');

  bus.emit('aftermathWreck:completed', { sectorId: 'sector_helios_prime', byPlayer: true });
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), 0, 'no id, no deed');
});

test('March counter clamps at its def bound', () => {
  const { state, bus } = boot();
  contactsFor({ state, bus });

  const def = CONTACT_COUNTER_DEFS[MARCH_TRACKER];
  for (let i = 0; i < def.max + 3; i++) {
    bus.emit('aftermathWreck:completed', {
      markerId: `mk_${i}`, wreckId: `wreck_${i}`, sectorId: 'sector_ceres_belt', byPlayer: true,
    });
  }
  assert.equal(stationContactCounterValue(state, MARCH_TRACKER), def.max, 'counter clamps at def max');
});

test('the counter and receipt flags survive save/load and keep deduping', () => {
  const first = boot(71);
  contactsFor(first);
  for (const markerId of ['mk_a', 'mk_b']) {
    first.bus.emit('aftermathWreck:completed', {
      markerId, wreckId: `wreck_${markerId}`, sectorId: 'sector_ceres_belt', byPlayer: true,
    });
  }
  assert.equal(stationContactCounterValue(first.state, MARCH_TRACKER), 2);
  const savedCounters = structuredClone(first.state.player.stationContactCounters);
  const savedContacts = structuredClone(first.state.player.stationContacts);
  assert.equal(Object.keys(savedContacts[MARCH_CONTACT].flags).length, 2,
    'two receipt flags are on the saved record');

  const second = boot(72);
  second.state.player.stationContactCounters = savedCounters;
  second.state.player.stationContacts = savedContacts;
  contactsFor(second);
  assert.equal(stationContactCounterValue(second.state, MARCH_TRACKER), 2, 'counter survives the load');

  // A replayed completion for a filed marker must not count again across the load.
  for (const markerId of ['mk_a', 'mk_b']) {
    second.bus.emit('aftermathWreck:completed', {
      markerId, wreckId: `recycled_${markerId}`, sectorId: 'sector_ceres_belt', byPlayer: true,
    });
  }
  assert.equal(stationContactCounterValue(second.state, MARCH_TRACKER), 2, 'receipt flags dedupe after load');

  second.bus.emit('aftermathWreck:completed', {
    markerId: 'mk_c', wreckId: 'wreck_c', sectorId: 'sector_ceres_belt', byPlayer: true,
  });
  assert.equal(stationContactCounterValue(second.state, MARCH_TRACKER), 3, 'a new marker still files');
});

test('the March receipt is deterministic across payload ordering and seeds', () => {
  const run = (seed, events) => {
    const { state, bus } = boot(seed);
    contactsFor({ state, bus });
    for (const event of events) bus.emit('aftermathWreck:completed', event);
    return stationContactCounterValue(state, MARCH_TRACKER);
  };
  const events = [
    { markerId: 'mk_1', wreckId: 'wreck_a', sectorId: 'sector_helios_prime', byPlayer: true },
    { markerId: 'mk_2', wreckId: 'wreck_b', sectorId: 'sector_ceres_belt', byPlayer: true },
  ];
  assert.equal(run(47, events), run(47, events.slice().reverse()),
    'report order does not change the count');
  assert.equal(run(47, events), run(99, events), 'the receipt does not depend on the seed');
});

test('the battle report row keeps Record when War and Contact precede it', () => {
  const { state, bus } = boot();
  contactsFor({ state, bus });
  state.player.stationContactCounters = {
    ...state.player.stationContactCounters,
    [MARCH_TRACKER]: 2,
  };
  state.player.stationContacts = {
    ...state.player.stationContacts,
    [MARCH_CONTACT]: {
      met: true, talkCount: 1, canonicalKey: MARCH_CONTACT, name: 'Provost March', flags: {},
    },
  };
  state.conflicts = {
    'faction_scn:faction_dmc': { state: 'war', playerLean: 0 },
  };
  const tags = barContactIntelTags(
    { id: MARCH_CONTACT, role: 'barkeep', factionId: 'faction_scn', canonicalKey: MARCH_CONTACT },
    state,
    'station_helios',
  );
  assert.equal(tags.length, 2);
  assert.equal(tags[0].label, 'War');
  assert.equal(tags[1].label, 'Record', 'the live counter is never clipped by Contact');
  assert.match(tags[1].text, /2/);
});

test('the salvage:completed seam credits only the player beam, never a gravedigger or booth disposal', () => {
  const payloads = [
    { wreckId: 1 },                                   // mining.js beam: sourceless
    { wreckId: 2, source: 'mining' },
    { wreckId: 3, source: 'gravedigger:bury' },       // autonomous bury
    { wreckId: 4, source: 'gravedigger:bury', paid: true }, // paid compost
    { wreckId: 5, source: 'rook:booth' },             // a sale, not a recovery
  ];
  assert.deepEqual(payloads.map(salvageCompletedByPlayer), [true, true, false, false, false]);

  const calls = [];
  const owner = {
    _completeByEntity(payload, options) {
      calls.push({ source: payload.source || null, byPlayer: options.byPlayer });
      return true;
    },
  };
  for (const payload of payloads) aftermathWrecks._salvageCompleted.call(owner, payload);
  assert.deepEqual(calls.map((row) => row.byPlayer), [true, true, false, false, false],
    'the seam passes byPlayer only for player beam work');
});

test('March record tag stays hidden at zero', () => {
  const { state, bus } = boot();
  contactsFor({ state, bus });
  const tags = barContactIntelTags(
    { id: MARCH_CONTACT, role: 'barkeep', factionId: 'faction_scn', canonicalKey: MARCH_CONTACT },
    state,
    'station_helios',
  );
  assert.equal(tags.some((tag) => tag.label === 'Record'), false,
    'a zero counter is not a filed record');
});

test('a last call names March only after a guard actually filed a hull', () => {
  const facts = {
    contactCounters: {},
    credits: 1200, debt: 0, assetProxyCr: 0, netWorthCr: 1200,
    incidentIds: [], smuggledValue: 0, heat: 0, kills: 0,
    lungOutcome: null, namedDebts: [], rescueContractIds: [], survivorPods: {},
    archiveSources: [], tradeCount: 0, routeContracts: 0,
  };
  const untouched = compileFinaleContent('A', facts);
  assert.ok(untouched, 'the finale compiles with an untouched yard counter');
  assert.equal(
    untouched.beats.some((b) => b.kind === 'comms' && /MARCH/.test(String(b.sender))),
    false,
    'an unmoved counter must not invent a last call',
  );

  const moved = compileFinaleContent('A', {
    ...facts,
    contactCounters: { [MARCH_TRACKER]: 1 },
  });
  const line = moved.beats.find((b) => b.kind === 'comms' && /MARCH/.test(String(b.sender)));
  assert.ok(line, 'a moved counter is why the last-call line exists');
  assert.match(line.text, /reconciled clean/);
});
