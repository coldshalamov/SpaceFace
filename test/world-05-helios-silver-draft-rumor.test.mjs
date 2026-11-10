import test from 'node:test';
import assert from 'node:assert/strict';

import { generateContacts } from '../src/ui/station/barContacts.js';

// WORLD-05 — a new game's Helios bar can name the Silver-Draft before the player has scanned
// the wreck. The rumor retires once the player already holds that wreck's bearing.

const FRESH = { player: {}, world: {} };

test('WORLD-05 a fresh game Helios barkeep carries the Silver-Draft rumor', () => {
  const contacts = generateContacts('station_helios', FRESH);
  const host = contacts.find((c) => c.rumorSourceRef === 'bar.helios_meridian.silver_draft');
  assert.ok(host, 'no contact carries the Silver-Draft rumor');
  assert.equal(host.role, 'barkeep', 'the barkeep is the rumor voice');
  assert.match(host.line, /silver-draft/i, 'the spoken line names the wreck');
});

test('WORLD-05 the rumor retires once the wreck bearing is known', () => {
  const scanned = {
    player: { uniqueWrecks: { bearings: { wreck_mts_silver_draft: { known: true } } } },
    world: {},
  };
  const contacts = generateContacts('station_helios', scanned);
  assert.equal(
    contacts.some((c) => c.rumorSourceRef === 'bar.helios_meridian.silver_draft'),
    false,
    'a scanned wreck must not keep paying out its discovery rumor',
  );
});
