import test from 'node:test';
import assert from 'node:assert/strict';
import { coalescedEventSkips } from '../src/core/simLaneMain.js';

// One worker reply can carry the same full-value "changed" notification for one ship dozens of
// times (run start: 80 copies each of three types). Only the last copy per (type, ship) carries
// information; everything else in the reply replays untouched and in order.
test('a reply replays only the newest stats/cargo/slots notification per ship', () => {
  const events = [
    { t: 'ship:statsChanged', p: { shipId: 1, derived: { a: 1 } } },   // 0 superseded by 4
    { t: 'ship:cargoCapChanged', p: { shipId: 1, cargoCap: 10 } },      // 1 superseded by 5
    { t: 'credits:changed', p: { amount: 5 } },                         // 2 gameplay: kept
    { t: 'ship:statsChanged', p: { shipId: 2, derived: { a: 2 } } },   // 3 other ship: kept
    { t: 'ship:statsChanged', p: { shipId: 1, derived: { a: 3 } } },   // 4 newest for ship 1
    { t: 'ship:cargoCapChanged', p: { shipId: 1, cargoCap: 12 } },      // 5 newest
    { t: 'credits:changed', p: { amount: 6 } },                         // 6 kept (never coalesced)
    { t: 'ship:slotsChanged', p: { shipId: 1, slots: 4 } },             // 7 only copy
  ];
  const skip = coalescedEventSkips(events);
  assert.deepEqual([...skip].sort((a, b) => a - b), [0, 1]);
  const replayed = events.filter((_, i) => !skip.has(i)).map((ev) => ev.t);
  assert.deepEqual(replayed, ['credits:changed', 'ship:statsChanged', 'ship:statsChanged',
    'ship:cargoCapChanged', 'credits:changed', 'ship:slotsChanged']);
});

test('nothing is skipped when no notification repeats, or when a payload names no ship', () => {
  assert.equal(coalescedEventSkips([
    { t: 'ship:statsChanged', p: { shipId: 1 } },
    { t: 'ship:statsChanged', p: { shipId: 2 } },
    { t: 'physics:impact', p: { aId: 1, bId: 2 } },
    { t: 'physics:impact', p: { aId: 1, bId: 2 } },
  ]), null);
  assert.equal(coalescedEventSkips([
    { t: 'ship:statsChanged', p: {} },
    { t: 'ship:statsChanged', p: {} },
    { t: 'ship:statsChanged', p: null },
  ]), null);
});
