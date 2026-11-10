import test from 'node:test';
import assert from 'node:assert/strict';
import { rollBountyMark } from '../src/data/bountyMarks.js';

test('RC-34: 500 rolls after killing a mark never return the name', () => {
  const dead = rollBountyMark({ seed: 4242, offerId: 'offer:0', sectorId: 'sector_helios_prime' }).name;
  for (let i = 0; i < 500; i++) {
    const mark = rollBountyMark({ seed: 4242, offerId: `offer:${i}`, sectorId: 'sector_helios_prime', exclude: [dead] });
    assert.notEqual(mark.name, dead, `offer:${i} dealt the dead name`);
  }
});

test('RC-34: old saves load — no ledger means the legacy roll, bit-identical', () => {
  for (let i = 0; i < 50; i++) {
    const offerId = `legacy:${i}`;
    const plain = rollBountyMark({ seed: 4242, offerId, sectorId: 'sector_helios_prime' });
    const emptyLedger = rollBountyMark({ seed: 4242, offerId, sectorId: 'sector_helios_prime', exclude: [] });
    assert.deepEqual(emptyLedger, plain);
    assert.ok(typeof plain.name === 'string' && plain.name.length > 0);
  }
});

test('RC-34: the next name in the walk is dealt, not an anonymous mark', () => {
  const args = { seed: 4242, offerId: 'offer:0', sectorId: 'sector_helios_prime' };
  const first = rollBountyMark(args);
  const redeal = rollBountyMark({ ...args, exclude: [first.name] });
  assert.notEqual(redeal.name, first.name);
  assert.ok(redeal.name, 'graveyard redeal still returns a named writ');
});
