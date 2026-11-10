import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { generateContacts } from '../src/ui/station/barContacts.js';

test('WORLD-05 a new game Helios bar can name the Silver-Draft before it is scanned', () => {
  const state = createGameState(4242);
  const contacts = generateContacts('station_helios', state);
  const named = contacts.find((contact) => contact.rumorSourceRef === 'bar.helios_meridian.silver_draft');
  assert.ok(named, 'Helios contacts include the Silver-Draft rumor');
  assert.match(String(named.line), /Silver-Draft/i);

  state.player.uniqueWrecks = {
    bearings: { wreck_mts_silver_draft: { wreckId: 'wreck_mts_silver_draft', phase: 'rumored' } },
  };
  const after = generateContacts('station_helios', state);
  assert.equal(after.some((contact) => contact.rumorSourceRef === 'bar.helios_meridian.silver_draft'), false);
});
