import assert from 'node:assert/strict';
import test from 'node:test';
import { PNG } from 'pngjs';
import { brightRegions, bodiesUnderRegion } from '../scripts/fleet/looks/look-03-pixels.mjs';

test('bright region scanner measures contiguous display luma and ignores small glints', () => {
  const png = new PNG({ width: 80, height: 60 });
  png.data.fill(0);
  for (let y = 5; y < 35; y++) for (let x = 10; x < 40; x++) {
    const i = (y * png.width + x) * 4;
    png.data.set([255, 249, 235, 255], i);
  }
  png.data.set([255, 255, 255, 255], (50 * png.width + 70) * 4);
  const regions = brightRegions(PNG.sync.write(png));
  assert.equal(regions.length, 1);
  assert.equal(regions[0].pixels, 900);
  assert.deepEqual(regions[0].bounds, { left: 10, right: 39, top: 5, bottom: 34 });
  assert.ok(Math.abs(regions[0].meanLuma - (255 * .2126 + 249 * .7152 + 235 * .0722)) < 1e-8);
  const candidates = bodiesUnderRegion(regions[0], [
    { id: 1, type: 'asteroid', defId: 'ast_common_rock', leaves: [],
      bounds: { left: 5, right: 45, top: 0, bottom: 40 } },
    { id: 2, bounds: { left: 50, right: 70, top: 40, bottom: 50 } },
    { id: 3, bounds: null },
  ]);
  assert.deepEqual(candidates.map(e => e.id), [1]);
});

test('white pixels on opposing row edges are separate regions', () => {
  const png = new PNG({ width: 4, height: 2 });
  png.data.fill(0);
  for (const pixel of [3, 4]) png.data.set([255, 255, 255, 255], pixel * 4);
  const regions = brightRegions(PNG.sync.write(png), 1);
  assert.equal(regions.length, 2);
  assert.ok(regions.every(r => r.pixels === 1));
});
