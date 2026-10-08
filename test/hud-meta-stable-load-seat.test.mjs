import test from 'node:test';
import assert from 'node:assert/strict';
import { seatStableLoadClearOfSpeedDial, STABLE_LOAD_DIAL_CLEARANCE_PX } from '../src/ui/hudMeta.js';

const fakeDoc = (dialRect) => ({
  defaultView: { innerHeight: 882 },
  querySelector: (selector) => (selector === '.orr-speeddial' && dialRect ? { getBoundingClientRect: () => dialRect } : null),
});
const line = () => ({ style: {}, getBoundingClientRect: () => ({ left: 22, right: 160, top: 618, bottom: 634, height: 16 }) });

test('the STABLE LOAD line stands above the ORRERY speed dial instead of across it', () => {
  const l = line();
  seatStableLoadClearOfSpeedDial(l, fakeDoc({ left: 18, right: 200, top: 496, bottom: 666, height: 170 }));
  assert.equal(l.style.bottom, `max(248px, ${882 - 496 + STABLE_LOAD_DIAL_CLEARANCE_PX}px)`);
  const away = line();
  seatStableLoadClearOfSpeedDial(away, fakeDoc({ left: 600, right: 780, top: 700, bottom: 870, height: 170 }));
  assert.equal(away.style.bottom, '', 'a dial elsewhere keeps the authored seat');
  const none = line();
  assert.equal(seatStableLoadClearOfSpeedDial(none, fakeDoc(null)), null, 'no ORRERY dial: nothing to clear');
});
