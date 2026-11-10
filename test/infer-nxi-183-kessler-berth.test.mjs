// NXI-183 — the freight line names Kessler at Helios, an existing contact, on every first-hour route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COLD_START, STORY_ENTRY_CONTACT } from '../src/data/narrative.js';
import { generateContacts } from '../src/ui/station/barContacts.js';

test('Contract 47-A is Kessler at the Helios cargo desk', () => {
  assert.equal(STORY_ENTRY_CONTACT.contactId, 'kessler');
  assert.equal(STORY_ENTRY_CONTACT.stationId, 'station_helios');
  assert.deepEqual([...STORY_ENTRY_CONTACT.routes], ['trade', 'combat', 'salvage']);
  const line = COLD_START.find((row) => row.id === 'cold_next_berth');
  assert.match(line.text, /Kessler/);
  assert.match(line.text, /Contract 47-A/);
  const kessler = generateContacts('station_helios').find((row) => row.canonicalKey === 'kessler');
  assert.ok(kessler);
});
