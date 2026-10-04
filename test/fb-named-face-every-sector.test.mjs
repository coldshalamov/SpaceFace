// FB-128 — The five sectors without a named lane contact get one, stamped on their traffic
//
// Pins:
// 1. All 24 sectors resolve at least one named contact from pickNamedLaneContact.
// 2. The contact pick is deterministic across seeds and sectors.
// 3. The 5 previously missing sectors resolve their authored contacts:
//    - ashfall_reach: Sile of the Half-Lit Cache (courier)
//    - orcus_shadow: Isk of the Shadow Reading (courier)
//    - phoebe_echo: Nim of the Broken Song (courier)
//    - triton_wake: Pell Voss of the Wake (courier)
//    - sedna_dark: Hale of the Dry Rim (tanker)
// 4. Contacts include required identity properties (id, name, callsign, role, hail, memoryHook).

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { NAMED_LANE_CONTACTS, pickNamedLaneContact } from '../src/data/laneContacts.js';

test('FB-128: all 24 sectors resolve at least one named contact', () => {
  assert.equal(SECTORS.length, 24, '24 live sectors');

  for (const sector of SECTORS) {
    const contact = pickNamedLaneContact(sector.id, 4242);
    assert.ok(contact, `Sector ${sector.id} must resolve a named lane contact`);
    assert.ok(typeof contact.id === 'string' && contact.id.length > 0, `${sector.id} contact has id`);
    assert.ok(typeof contact.name === 'string' && contact.name.length > 0, `${sector.id} contact has name`);
    assert.ok(typeof contact.callsign === 'string' && contact.callsign.length > 0, `${sector.id} contact has callsign`);
    assert.ok(typeof contact.role === 'string' && contact.role.length > 0, `${sector.id} contact has role`);
  }
});

test('FB-128: the five former gap sectors resolve their authored contacts with role and voice', () => {
  const gapSectors = [
    { id: 'sector_ashfall_reach', contactId: 'lane_ashfall_cache_voice', role: 'courier' },
    { id: 'sector_orcus_shadow', contactId: 'lane_orcus_shadow_courier', role: 'courier' },
    { id: 'sector_phoebe_echo', contactId: 'lane_phoebe_echo_courier', role: 'courier' },
    { id: 'sector_triton_wake', contactId: 'lane_triton_wake_courier', role: 'courier' },
    { id: 'sector_sedna_dark', contactId: 'lane_sedna_dark_tanker', role: 'tanker' },
  ];

  for (const item of gapSectors) {
    const contact = pickNamedLaneContact(item.id, 4242);
    assert.ok(contact, `Contact must resolve for ${item.id}`);
    assert.equal(contact.id, item.contactId, `Expected ${item.contactId} for ${item.id}`);
    assert.equal(contact.role, item.role, `Expected role ${item.role} for ${item.id}`);
    assert.ok(typeof contact.hail === 'string' && contact.hail.length > 0, `Hail line authored for ${contact.id}`);
    assert.ok(typeof contact.memoryHook === 'string' && contact.memoryHook.length > 0, `Memory hook authored for ${contact.id}`);
  }
});

test('FB-128: contact pick is deterministic across seeds and calls', () => {
  for (const sector of SECTORS) {
    const first = pickNamedLaneContact(sector.id, 4242);
    const second = pickNamedLaneContact(sector.id, 4242);
    assert.equal(first.id, second.id, `Pick must be deterministic for ${sector.id} on seed 4242`);

    const otherSeed = pickNamedLaneContact(sector.id, 9999);
    assert.ok(otherSeed, `Pick must resolve for ${sector.id} on seed 9999`);
  }
});
