import test from 'node:test';
import assert from 'node:assert/strict';
import { placeRadarObjectiveLabel } from '../src/ui/radar.js';

const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('an edge-pinned objective label never clamps back over its own marker', () => {
  for (const size of [150, 180, 220]) {
    const c = size / 2;
    for (const [mx, my] of [[c + 6, 9], [c - 6, 9], [size - 9, c], [9, c], [c, size - 9]]) {
      const plate = placeRadarObjectiveLabel(118, mx, my, size, c, c - 8);
      assert.ok(!overlaps(plate, { x: mx - 8, y: my - 8, width: 16, height: 16 }),
        `${size}px radar: the label at (${plate.x},${plate.y}) covers the marker at (${mx},${my})`);
      assert.ok(plate.x >= 0 && plate.y >= 0 && plate.x + plate.width <= size && plate.y + plate.height <= size);
    }
  }
});
