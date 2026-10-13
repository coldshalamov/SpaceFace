// SFQ-I046 — recognising a rescued contact does not pay, and a second hail
// after a real player-blob round trip still does not pay. Recognition stays.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { stationContactMemoryFor, stationContactMemoryLine } from '../src/data/stationContacts.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactLoadBoundary } from '../src/systems/stationContactLoadBoundary.js';
import { save } from '../src/save/saveSystem.js';

const CONTACT = 'barkeep_helios';
const TALK = {
  contactId: CONTACT,
  role: 'barkeep',
  stationId: 'station_helios',
  name: 'Helios Bar',
  choiceId: 'routes',
};

function boot() {
  const bus = createBus();
  const grants = [];
  bus.on('economy:grantCredits', (payload) => grants.push(payload));
  const state = {
    simTime: 42,
    meta: { seed: 4242 },
    player: {
      credits: 1000,
      heat: 0,
      cargo: { items: {} },
      stationContacts: {},
    },
    stationLife: { traffic: [], rescueNotices: {}, deeds: {} },
  };
  stationContactLoadBoundary.init({ state, bus });
  stationContacts.init({ state, bus });
  save.state = state;
  return { bus, state, grants };
}

test.afterEach(() => {
  stationContacts.destroy();
  stationContactLoadBoundary.destroy();
});

test('rescue recognition pays nothing, and a hail after save and load pays nothing again', () => {
  const { bus, state, grants } = boot();
  bus.emit('recovery:completed', {
    outcome: 'rescue',
    recoveryId: 'rec-4242',
    sectorId: 'sector_helios_prime',
  });

  bus.emit('ui:talkContact', TALK);
  const claimed = stationContactMemoryFor(state, CONTACT);
  assert.equal(claimed.rescueMemory.acknowledged, false);
  assert.equal(claimed.rescueMemory.recordId, 'rec-4242');
  assert.equal(state.player.credits, 1000);

  bus.emit('ui:talkContact', TALK);
  const recognised = stationContactMemoryFor(state, CONTACT);
  assert.equal(recognised.rescueMemory.acknowledged, true);
  const line = stationContactMemoryLine(recognised);
  assert.equal(line, 'Met 2 times · last discussed routes.');
  assert.equal(state.player.credits, 1000);

  const blob = save._serializePlayer();
  state.player.credits = 99999;
  state.player.stationContacts = {};
  bus.emit('save:restoring', {});
  save._restorePlayer(blob);
  bus.emit('save:loaded', {});

  const restored = stationContactMemoryFor(state, CONTACT);
  assert.equal(state.player.credits, 1000);
  assert.equal(stationContactMemoryLine(restored), line);
  assert.deepEqual(restored.rescueMemory, recognised.rescueMemory);

  bus.emit('ui:talkContact', TALK);
  const again = stationContactMemoryFor(state, CONTACT);
  assert.equal(state.player.credits, 1000);
  assert.deepEqual(again.rescueMemory, recognised.rescueMemory);
  assert.equal(stationContactMemoryLine(again), 'Met 3 times · last discussed routes.');
  assert.equal(grants.length, 0);
});
