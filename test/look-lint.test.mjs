import test from 'node:test';
import assert from 'node:assert/strict';
import { PNG } from 'pngjs';
import { lumaAt, blownFraction, blownStats, ringContrast, summarizeBodies, lintFrame } from '../scripts/fleet/looks/look-lint.mjs';

function image(w, h, fill) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fill(x, y);
    const i = (y * w + x) * 4;
    png.data[i] = r; png.data[i + 1] = g; png.data[i + 2] = b; png.data[i + 3] = 255;
  }
  return png;
}
const gray = (v) => [v, v, v];

test('luma uses Rec.709 weights', () => {
  assert.ok(Math.abs(lumaAt(image(1, 1, () => [255, 0, 0]), 0, 0) - 255 * 0.2126) < 1e-9);
  assert.ok(Math.abs(lumaAt(image(1, 1, () => gray(100)), 0, 0) - 100) < 1e-9);
});

test('blownFraction counts only luma strictly above 240 and finds the largest region', () => {
  const png = image(100, 100, (x, y) => {
    if (x < 20 && y < 20) return gray(255);
    if (x >= 50 && x < 55 && y >= 50 && y < 55) return gray(250);
    if (x >= 70 && x < 80 && y >= 70 && y < 80) return gray(240);
    return gray(10);
  });
  assert.equal(blownFraction(png), (400 + 25) / 10000);
  const stats = blownStats(PNG.sync.write(png));
  assert.equal(stats.largestRegion, 400 / 10000);
  assert.deepEqual(stats.largestRegionBounds, { left: 0, right: 19, top: 0, bottom: 19 });
  assert.equal(stats.regions.length, 2);
});

test('ringContrast: bright body on dark space reads strongly positive, flat field reads zero', () => {
  const cx = 60, cy = 60, r = 20;
  const body = image(120, 120, (x, y) => (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r ? gray(200) : gray(20)));
  const c = ringContrast(body, cx, cy, r, r);
  assert.ok(Math.abs(c.inside - 200) < 1e-9 && Math.abs(c.outside - 20) < 1e-9);
  assert.ok(Math.abs(c.contrast - 180) < 1e-9);
  assert.ok(c.signed > 0);
  assert.ok(Math.abs(c.michelson - 180 / 220) < 1e-9);
  assert.equal(ringContrast(image(120, 120, () => gray(90)), cx, cy, r, r).contrast, 0);
});

test('ringContrast handles ellipses and refuses rings that fall mostly off screen', () => {
  const body = image(160, 120, (x, y) => (((x + 0.5 - 80) / 40) ** 2 + ((y + 0.5 - 60) / 15) ** 2 <= 1 ? gray(180) : gray(30)));
  assert.ok(ringContrast(body, 80, 60, 40, 15).contrast > 140);
  assert.equal(ringContrast(body, 0, 0, 40, 15), null, 'body on the corner has under 40% of its rings on screen');
  assert.equal(ringContrast(body, 80, 60, 0.5, 0.5), null, 'sub-pixel body is not measurable');
});

test('summarizeBodies returns the median and the three worst by Michelson contrast', () => {
  const rows = [0.5, 0.1, 0.9, 0.3, 0.7].map((m, i) => ({ id: i, type: 'ship', michelson: m, contrast: m * 100 }));
  const s = summarizeBodies(rows);
  assert.equal(s.count, 5);
  assert.equal(s.medianMichelson, 0.5);
  assert.equal(s.median, 50);
  assert.deepEqual(s.worst.map((r) => r.id), [1, 3, 0]);
  assert.deepEqual(summarizeBodies([]), { count: 0, median: null, medianMichelson: null, worst: [] });
});

test('lintFrame ties it together on a synthetic frame', () => {
  const png = image(200, 100, (x, y) => (Math.hypot(x - 100, y - 50) <= 15 ? gray(255) : gray(5)));
  const out = lintFrame(PNG.sync.write(png), [{ id: 7, type: 'asteroid', cx: 100, cy: 50, rx: 15, ry: 15 }]);
  assert.ok(out.blownArea > 0.03 && out.blownArea < 0.04);
  assert.equal(out.bodiesMeasured, 1);
  assert.equal(out.bodyContrast.worst[0].id, 7);
  assert.ok(out.bodyContrast.median > 200);
});
