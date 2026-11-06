// Wave G1 — the Massline bracket says CAN, OUT OF RANGE, or DENIED.
// A denied latch adds a three-word reason. The words never cover the player hull.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  resolveMasslineBracketRead,
  bracketReadText,
  bracketPaintText,
  bracketShapeId,
  placeBracketWords,
} from '../src/ui/masslineHud.js';

test('G1 cycles range, a valid target, and a denied target as three distinct strings', () => {
  const ready = resolveMasslineBracketRead('ready', null);
  const range = resolveMasslineBracketRead('out-of-range', 'out-of-range');
  const denied = resolveMasslineBracketRead('invalid', 'blocked');
  assert.equal(ready.state, 'CAN');
  assert.equal(range.state, 'OUT OF RANGE');
  assert.equal(denied.state, 'DENIED');
  assert.equal(bracketReadText(ready), 'CAN');
  assert.equal(bracketReadText(range), 'OUT OF RANGE');
  assert.equal(bracketReadText(denied), 'DENIED · LINE IS BLOCKED');
  const strings = new Set([ready.state, range.state, denied.state]);
  assert.equal(strings.size, 3);
  assert.equal(denied.reason.split(' ').length, 3);
  assert.doesNotMatch(bracketReadText(denied), /REPOSITION|CLOSE IN|PICK /);
  assert.equal(bracketPaintText(ready), '');
  assert.equal(bracketPaintText(range), '');
  assert.equal(bracketPaintText(denied), 'LINE IS BLOCKED');
  assert.equal(bracketShapeId(ready), 'can');
  assert.equal(bracketShapeId(range), 'range');
  assert.equal(bracketShapeId(denied), 'denied');
});

test('G1 bracket words do not overlap the player hull screen rect', () => {
  const hull = { x: 700, y: 400, w: 64, h: 64 };
  const onHull = placeBracketWords(
    { x: 732, y: 432 },
    hull,
    { w: 160, h: 18 },
    { w: 1440, h: 900 },
  );
  const overlaps = onHull.x < hull.x + hull.w
    && onHull.x + onHull.w > hull.x
    && onHull.y < hull.y + hull.h
    && onHull.y + onHull.h > hull.y;
  assert.equal(overlaps, false);
});

test('world words clear the measured portrait objective, radar, controls and captions', () => {
  const mark = Object.freeze({ x: 300, y: 290 });
  const obstacles = [
    { left: 14, top: 14, width: 176, height: 124 },
    { left: 242, top: 196, width: 136, height: 148 },
    { left: 18, top: 244, width: 216, height: 57 },
    { left: 182, top: 490, width: 196, height: 156 },
    { left: 56, top: 154, width: 278, height: 30 },
    { left: 14, top: 367, width: 366, height: 60 },
    { left: 12, top: 433, width: 162, height: 162 },
  ];
  const hull = { x: 163, y: 300, w: 64, h: 64 };
  const placed = placeBracketWords(mark, hull, { w: 160, h: 48 }, { w: 390, h: 664 }, obstacles);
  assert.notEqual(placed.hidden, true);
  for (const box of [...obstacles, { left: hull.x, top: hull.y, width: hull.w, height: hull.h }]) {
    assert.equal(placed.x < box.left + box.width && placed.x + placed.w > box.left
      && placed.y < box.top + box.height && placed.y + placed.h > box.top, false);
  }
  assert.ok(placed.x >= 8 && placed.y >= 8 && placed.x + placed.w <= 382 && placed.y + placed.h <= 656);
  assert.deepEqual(mark, { x: 300, y: 290 }, 'only the words move; the world mark remains on its body');
});

test('a full-screen HUD panel suppresses words rather than painting over its controls', () => {
  const placed = placeBracketWords({ x: 195, y: 300 }, null,
    { w: 160, h: 30 }, { w: 390, h: 664 },
    [{ left: 0, top: 0, width: 390, height: 664 }]);
  assert.equal(placed.hidden, true);
});
