// EXP-03: a Helix hail answers in the Directorate's voice. Seed 4242.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTACT_HAIL_LINES,
  CONTACT_HAIL_STANCES,
  contactHailLineFor,
  createContactHailOffer,
} from '../src/data/contactHail.js';

test('seed 4242: every Helix stance is a hail, and the offer speaks it', () => {
  const helix = CONTACT_HAIL_LINES.faction_helix;
  assert.ok(helix);
  for (const stance of CONTACT_HAIL_STANCES) {
    assert.equal(helix[stance].length, 3);
    for (const line of helix[stance]) {
      assert.match(line, /INVOICE|INTERDICTION|UNDER ORDERS/);
    }
    const picked = contactHailLineFor('faction_helix', stance, 4242);
    assert.equal(helix[stance].includes(picked), true);
  }

  const entity = {
    id: 'hx-4242',
    factionId: 'faction_helix',
    data: { callsign: 'ADJUDICATOR' },
  };
  const state = {
    meta: { seed: 4242 },
    playerId: 1,
    factions: { faction_helix: { rep: 0 } },
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const offer = createContactHailOffer(state, {
    enabled: true,
    kind: 'worker',
    entity,
    targetId: entity.id,
  }, 'helix-hail-4242', 999);
  assert.equal(offer.kind, 'worker');
  assert.match(offer.lines[1], /INVOICE|INTERDICTION|UNDER ORDERS/);
});
