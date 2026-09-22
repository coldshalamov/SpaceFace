// Wave G12 — the dock prompt, the speed readout, and the weapon name do not share pixels.

import test from 'node:test';
import assert from 'node:assert/strict';

import { flightInstrumentRects, flightReadoutsDisjoint, rectsOverlap } from '../src/ui/hudAttention.js';

function disjoint(a, b) {
  return !rectsOverlap(a, b);
}

test('G12 readout boxes are disjoint at 1280x720 and 1920x1080', () => {
  for (const [width, height] of [[1280, 720], [1920, 1080]]) {
    assert.equal(flightReadoutsDisjoint(width, height), true, `${width}x${height}`);
    const boxes = flightInstrumentRects(width, height);
    assert.equal(disjoint(boxes.dockPrompt, boxes.speedReadout), true);
    assert.equal(disjoint(boxes.dockPrompt, boxes.weaponName), true);
    assert.equal(disjoint(boxes.speedReadout, boxes.weaponName), true);
    assert.ok(boxes.dockPrompt.y + boxes.dockPrompt.height < boxes.speedReadout.y);
    assert.ok(boxes.speedReadout.x + boxes.speedReadout.width <= boxes.weaponName.x);
  }
});
