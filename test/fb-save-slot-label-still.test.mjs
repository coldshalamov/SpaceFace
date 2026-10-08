// FB-130 — a slot label and a bounded still live beside the envelope data.
// The checksum is the data's. Seed 4242 is the fixture's seed, not a score.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fnv1a } from '../src/save/checksum.js';
import { slotCardFromEnvelopeData } from '../src/save/saveSystem.js';
import { boundSlotThumbnail, stampSlotCard } from '../src/save/slotStill.js';

const SEED = 4242;

function envelope() {
  return {
    fmt: 'spaceface-save',
    version: 1,
    savedAt: '2026-10-08T12:00:00.000Z',
    playtimeS: 90,
    slot: '2',
    checksum: 'data-only',
    data: {
      player: { credits: SEED, ownedShips: [{ defId: 'ship_kestrel' }], activeShipIndex: 0 },
      world: { currentSectorId: 'sector_helios_prime' },
      meta: {},
    },
  };
}

test('FB-130 label and still sit outside the checksum, and an old envelope still loads', () => {
  const env = envelope();
  const checksum = env.checksum;
  const dataJson = JSON.stringify(env.data);
  const small = 'data:image/png;base64,' + 'aa'.repeat(40);
  stampSlotCard(env, { label: '  Helios night  ', thumbnail: small }, {});
  assert.equal(env.label, 'Helios night');
  assert.equal(env.thumbnail, small);
  assert.equal(env.checksum, checksum);
  assert.equal(JSON.stringify(env.data), dataJson);
  assert.equal(fnv1a(dataJson), fnv1a(JSON.stringify(env.data)));

  const card = slotCardFromEnvelopeData('2', env);
  assert.equal(card.label, 'Helios night');
  assert.equal(card.thumbnail, small);
  assert.equal(card.credits, SEED);

  const bare = slotCardFromEnvelopeData('2', envelope());
  assert.equal(bare.label, undefined);
  assert.equal(bare.thumbnail, undefined);
  assert.equal(bare.slot, '2');

  const next = envelope();
  stampSlotCard(next, {}, { label: 'Helios night', thumbnail: small });
  assert.equal(next.label, 'Helios night', 'an autosave with no new label keeps the name');
  stampSlotCard(next, { label: '' }, { label: 'Helios night' });
  assert.equal(next.label, undefined);

  const huge = 'data:image/png;base64,' + 'aa'.repeat(40000);
  assert.equal(boundSlotThumbnail(huge), undefined);
  const dropped = envelope();
  stampSlotCard(dropped, { thumbnail: huge }, { thumbnail: small });
  assert.equal(dropped.thumbnail, undefined, 'a new still that does not fit is omitted');
});
