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
