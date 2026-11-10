// Wave G13 — the player's hull is not a caption surface.
// The Massline bracket is the one mark allowed on the hull.

import test from 'node:test';
import assert from 'node:assert/strict';

import { hudStringCoversHull, placeHudString, shipGlyphBox } from '../src/ui/hudAttention.js';

test('G13 strings clear the player hull and the bracket may stay', () => {
  const hull = Math.max(shipGlyphBox().width, shipGlyphBox().height);
  const player = { x: 640, y: 360 };
  const onNose = placeHudString({ x: 640, y: 348 }, player, hull);
  assert.equal(hudStringCoversHull({
    x: onNose.x, y: onNose.y, playerX: player.x, playerY: player.y, hullLengthPx: hull,
  }), false);
  assert.ok(Math.hypot(onNose.x - player.x, onNose.y - player.y) >= hull);

  const bracket = placeHudString({ x: 650, y: 370 }, player, hull, { exempt: true });
  assert.equal(bracket.x, 650);
  assert.equal(bracket.y, 370);
  assert.equal(hudStringCoversHull({
    x: bracket.x, y: bracket.y, playerX: player.x, playerY: player.y, hullLengthPx: hull, exempt: true,
  }), false);

  assert.equal(hudStringCoversHull({
    parentBillboard: 'player', x: 20, y: 20, playerX: player.x, playerY: player.y, hullLengthPx: hull,
  }), true);
});
