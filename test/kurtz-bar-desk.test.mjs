import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { emitBarContactChoice, generateContacts, getChoices } from '../src/ui/station/barContacts.js';
import { story } from '../src/systems/story.js';

test('Ash Cache seats Kurtz at the desk with ledger verbs', () => {
  const contacts = generateContacts('station_ashcache', {});
  const kurtz = contacts.find((row) => row.canonicalKey === 'kurtz');
  assert.ok(kurtz, 'Kurtz is a canonical Ashcache contact');
  assert.equal(kurtz.id, 'contact_station_ashcache_kurtz');
  const choices = getChoices(kurtz.role, kurtz);
  assert.ok(choices.some((row) => row.id === 'takeLedger'));
  assert.ok(choices.some((row) => row.id === 'openLedger'));
});

test('taking the ledger from the bar fires the Kurtz desk writer', () => {
  const state = createGameState(11);
  state.mode = 'flight';
  state.story.flags = {};
  const bus = createBus();
  const events = [];
  bus.on('ui:kurtzInteract', (payload) => events.push(payload));
  bus.on('ui:talkContact', () => { throw new Error('Kurtz ledger must not use generic talk'); });
  const system = Object.create(story);
  system.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  try {
    const emitted = emitBarContactChoice(bus, {
      contactId: 'contact_station_ashcache_kurtz',
      canonicalKey: 'kurtz',
      stationId: 'station_ashcache',
      choiceId: 'takeLedger',
    });
    assert.equal(emitted, 'ui:kurtzInteract');
    assert.equal(events.length, 1);
    assert.equal(events[0].action, 'takeLedger');
    assert.equal(state.story.flags.kurtz_desk_opened, true);
    assert.equal(state.story.flags.hasLedger, true);
  } finally {
    bus.clear();
  }
});
