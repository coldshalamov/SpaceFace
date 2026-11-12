// G16-04 — floating words merge, cap at four by priority, and seat clear of the HUD rects.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FT_MAX_LIVE, FT_PRIORITY, FT_YIELD_OPACITY, floatPriority, parseFloatWord, formatFloatWord,
  mergeFloatWord, findMergeTarget, pickEvictee, seatOutOfRects,
} from '../src/ui/floatingTextRules.js';

test('same word merges: figures sum, plain words count', () => {
  const a = parseFloatWord('+12 SHUNTED');
  mergeFloatWord(a, parseFloatWord('+256 SHUNTED'));
  assert.equal(formatFloatWord(a), '+268 SHUNTED');
  const f = parseFloatWord('FRIENDLY FIRE');
  for (let i = 0; i < 3; i++) mergeFloatWord(f, parseFloatWord('FRIENDLY FIRE'));
  assert.equal(formatFloatWord(f), 'FRIENDLY FIRE ×4');
  assert.equal(parseFloatWord('FRIENDLY FIRE ×4').count, 4);
  assert.equal(parseFloatWord('37'), null, 'a bare damage number never merges');
});

test('merge needs the same word within 1.5 s and 220 px', () => {
  const items = [{ key: 'SHUNTED', x: 100, y: 100, born: 10 }, { key: 'PRESSED', x: 100, y: 100, born: 10 }];
  assert.equal(findMergeTarget(items, 'SHUNTED', 200, 100, 11), 0);
  assert.equal(findMergeTarget(items, 'SHUNTED', 400, 100, 11), -1, 'too far');
  assert.equal(findMergeTarget(items, 'SHUNTED', 120, 100, 11.6), -1, 'too late');
  assert.equal(findMergeTarget(items, 'CAROMED', 100, 100, 10.5), -1, 'different word');
});

test('cap of four: lowest priority, then oldest, gives way; outranked newcomer is dropped', () => {
  assert.equal(FT_MAX_LIVE, 4);
  const items = [
    { priority: FT_PRIORITY.earned, born: 1 }, { priority: FT_PRIORITY.damage, born: 3 },
    { priority: FT_PRIORITY.damage, born: 2 }, { priority: FT_PRIORITY.status, born: 0 },
  ];
  assert.equal(pickEvictee(items.slice(0, 3), 0), -2, 'room below the cap');
  assert.equal(pickEvictee(items, FT_PRIORITY.damage), 2, 'oldest damage number yields');
  assert.equal(pickEvictee(items, FT_PRIORITY.earned), 2);
  const high = items.map((i) => ({ ...i, priority: FT_PRIORITY.earned }));
  assert.equal(pickEvictee(high, FT_PRIORITY.damage), -1, 'a damage number cannot evict earned words');
});

test('priorities: damage < status < earned', () => {
  assert.equal(floatPriority('sf-ft--hull'), FT_PRIORITY.damage);
  assert.equal(floatPriority('sf-ft--kill'), FT_PRIORITY.status);
  assert.equal(floatPriority('sf-ft--bounty'), FT_PRIORITY.earned);
  assert.equal(floatPriority('x', { earned: true }), FT_PRIORITY.earned);
});

test('a label under a panel slides clear; with no seat it fades to 35%', () => {
  const bounds = { w: 1280, h: 720 };
  const panel = { x: 0, y: 0, w: 300, h: 120 };
  const box = { x: 40, y: 60, w: 120, h: 24 };
  const seat = seatOutOfRects(box, [panel], bounds);
  assert.equal(seat.fade, 1);
  assert.ok(seat.y >= 124 || seat.x >= 304, 'moved out of the panel');
  assert.equal(seatOutOfRects({ x: 600, y: 300, w: 80, h: 20 }, [panel], bounds).fade, 1);
  const wall = { x: 0, y: 0, w: 1280, h: 720 };
  const none = seatOutOfRects(box, [wall], bounds);
  assert.equal(none.fade, FT_YIELD_OPACITY);
  assert.deepEqual([none.x, none.y], [box.x, box.y]);
});

test('a label under the centre countdown column moves aside', () => {
  const column = { x: 540, y: 20, w: 200, h: 160 };
  const seat = seatOutOfRects({ x: 560, y: 100, w: 150, h: 22 }, [column], { w: 1280, h: 720 });
  assert.equal(seat.fade, 1);
  const moved = { x: seat.x, y: seat.y, w: 150, h: 22 };
  assert.ok(moved.x + moved.w <= column.x || moved.x >= column.x + column.w || moved.y >= column.y + column.h || moved.y + moved.h <= column.y);
});

import { createFloatLedger } from '../src/ui/floatingTextRules.js';

test('ledger: merges across layers, caps at four, drops an outranked newcomer', () => {
  let t = 0;
  const L = createFloatLedger({ now: () => t });
  const a = L.admit({ text: '+12 SHUNTED', x: 100, y: 100, priority: 2 });
  assert.equal(a.action, 'new');
  let shown = '';
  a.entry.refresh = (s) => { shown = s; };
  t = 0.4;
  const m = L.admit({ text: '+256 SHUNTED', x: 160, y: 90, priority: 2 });
  assert.equal(m.action, 'merged');
  assert.equal(shown, '+268 SHUNTED');
  assert.equal(L.live.length, 1);
  for (const w of ['PRESSED', 'CAROMED', 'COLLATERAL']) assert.equal(L.admit({ text: w, x: 900, y: 500, priority: 2 }).action, 'new');
  assert.equal(L.live.length, 4);
  assert.equal(L.admit({ text: '41', x: 0, y: 0, priority: 0 }).action, 'dropped');
  let evicted = false;
  L.live[0].evict = () => { evicted = true; };
  const n = L.admit({ text: 'BANKED', x: 50, y: 700, priority: 2 });
  assert.equal(n.action, 'new');
  assert.equal(L.live.length, 4);
  assert.ok(evicted, "oldest earned word gave up its seat");
  t = 5;
  assert.equal(L.admit({ text: '+3 SHUNTED', x: 100, y: 100, priority: 2 }).action, 'new', 'window elapsed: no merge');
});
