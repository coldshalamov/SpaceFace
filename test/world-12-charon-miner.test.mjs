import test from 'node:test';
import assert from 'node:assert/strict';

import { LANE_GIMMICK_LABELS, pickNamedLaneContact } from '../src/data/laneContacts.js';

test('WORLD-12 Charon Expanse traffic can include one named miner', () => {
  const contact = pickNamedLaneContact('sector_charon_expanse', 4242);
  assert.ok(contact);
  assert.equal(contact.id, 'lane_pell_claim_nine');
  assert.equal(contact.role, 'miner');
  assert.ok(contact.sectorIds.includes('sector_charon_expanse'));
  assert.equal(LANE_GIMMICK_LABELS[contact.gimmick], 'CLAIM TALLY');
  assert.equal(pickNamedLaneContact('sector_charon_expanse', 8008).id, contact.id);
});
