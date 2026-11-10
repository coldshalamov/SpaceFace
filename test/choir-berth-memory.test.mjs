import assert from 'node:assert/strict';
import test from 'node:test';

import { generateContacts } from '../src/ui/station/barContacts.js';

test('Helios remembers when Mercy makes the medical berth', () => {
  const contacts = generateContacts('station_helios', {
    player: { uniqueWrecks: { choirRelief: { evacuated: true } } },
  });
  const host = contacts.find((row) => row.choirReliefMemory === 'evacuated')
    || contacts.find((row) => row.role === 'barkeep');
  assert.ok(host);
  assert.equal(host.choirReliefMemory, 'evacuated');
  assert.match(host.line, /Mercy made the medical berth/);
});

test('a lost attendant becomes an empty-berth line', () => {
  const contacts = generateContacts('station_helios', {
    player: { uniqueWrecks: { choirRelief: { attendantLost: true } } },
  });
  const host = contacts.find((row) => row.choirReliefMemory === 'lost');
  assert.ok(host);
  assert.match(host.line, /empty berth/);
});
