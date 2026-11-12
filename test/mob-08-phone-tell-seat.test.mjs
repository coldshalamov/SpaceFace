import test from 'node:test';
import assert from 'node:assert/strict';
import { seatPhoneTell, placementHits, TELL_COMPACT_SIZE } from '../src/ui/phoneTellSeat.js';

const keys = [{ x: 600, y: 300, width: 200, height: 80 }];
const at = (x, y) => (d) => ({ x, y, width: d.width, height: d.height });

test('a clear full chip keeps its seat', () => {
  const r = seatPhoneTell(at(200, 100), keys, { width: 240, height: 30 });
  assert.equal(r.compact, false);
  assert.equal(r.placement.width, 240);
});

test('a chip that would print on the keys shrinks to its kind word when that is clear', () => {
  // full chip (240 wide) centred at 560 reaches x 440..680 and hits the keys at 600; compact 84 wide centred at 500 does not
  const place = (d) => (d.width > 100 ? { x: 560, y: 340, width: d.width, height: d.height } : { x: 500, y: 340, width: d.width, height: d.height });
  const r = seatPhoneTell(place, keys, { width: 240, height: 30 });
  assert.equal(r.compact, true);
  assert.equal(r.placement.width, TELL_COMPACT_SIZE.width);
  assert.equal(placementHits(r.placement, keys), false);
});

test('a chip with no clear seat at either size hides', () => {
  assert.equal(seatPhoneTell(at(650, 340), keys, { width: 240, height: 30 }), null);
});
