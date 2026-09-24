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

// Owner, 2026-09-22, on the live HUD: "there's overlapping text". The G12 boxes centred the speed
// readout and the weapon name on the bottom band, where the ordnance rail lives, and hud.js pinned
// them there as position:fixed every slow tick -- only in the live game, so the bench never showed
// it. Both readouts belong to the cluster chassis; only the dock prompt keeps a computed box.
test('hud.js never pins the speed readout or the weapon name over the ordnance rail', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('function placeFlightReadouts'), src.indexOf('function unplaceFlightBox'));
  assert.ok(body.length > 0, 'placeFlightReadouts exists');
  assert.doesNotMatch(body, /\bplaceFlightBox\(\s*speedGaugeEl/, 'speed readout is not fixed-placed');
  assert.doesNotMatch(body, /\bplaceFlightBox\([^)]*sf-wpnstat/, 'weapon name is not fixed-placed');
  assert.match(body, /placeFlightBox\(\s*dock\s*,/, 'the dock prompt keeps its computed box');
});
