import test from 'node:test';
import assert from 'node:assert/strict';

import { stationReceiptOverlapsControls } from '../src/ui/station/stationApp.js';

test('receipt collision checks overflowing destination controls, not only their rail wrapper', () => {
  const receipt = { left: -6, top: 730, right: 134, bottom: 766 };
  const tab = { getBoundingClientRect: () => ({ left: 22, top: 742, right: 104, bottom: 770 }) };
  const offRowControl = { getBoundingClientRect: () => ({ left: 200, top: 742, right: 270, bottom: 770 }) };

  assert.equal(stationReceiptOverlapsControls(receipt, [tab, offRowControl]), true,
    'the Factions tab hitbox is checked even when its rail wrapper clips above it');
  assert.equal(stationReceiptOverlapsControls(receipt, [offRowControl]), false,
    'a receipt is not displaced by a control outside its measured box');
});
