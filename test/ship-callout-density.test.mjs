// Geometry contracts, not screenshot pixel goldens: dense sockets must remain distinguishable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { separateBeads, pointsBox, layoutHullCallouts, fitHullInk } from '../src/ui/ship/calloutLayout.js';

function separated(points, gap) {
  for (let i = 0; i < points.length; i++) for (let j = 0; j < i; j++) {
    assert.ok(Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) >= gap - 1e-9,
      `socket ${i} overlaps ${j}`);
  }
}

for (const count of [2, 9, 10, 24, 64]) test(`${count} coincident sockets each retain a distinct bead`, () => {
  const source = Array.from({ length: count }, (_, id) => Object.freeze({ x: 180, y: 40, id }));
  const placed = separateBeads(Object.freeze(source), 14);
  separated(placed, 14);
  assert.deepEqual(placed.map(p => p.id), source.map(p => p.id));
  assert.ok(placed.every(p => p.x === 180));
  assert.deepEqual(placed[0], source[0]);
  assert.deepEqual(source.map(p => p.y), Array(count).fill(40));
});

test('empty input and separated sockets do not acquire jitter', () => {
  assert.deepEqual(separateBeads([]), []);
  const source = [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 0, y: 30 }];
  assert.deepEqual(separateBeads(source), source);
  assert.deepEqual(separateBeads(separateBeads(source)), source);
});

test('an unsorted chain cannot re-collide with an earlier visited socket', () => {
  const points = [56, 0, 42, 14, 28, 0, 0, 0, 0, 0, 0, 0].map((y, id) => ({ x: 100, y, id }));
  const placed = separateBeads(points, 14);
  separated(placed, 14);
  assert.deepEqual(separateBeads(placed, 14), placed, 'running the solver again must not move solved beads');
});

test('deterministic clustered projections stay separated without changing their identity or x', () => {
  let state = 4242;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 2 ** 32; };
  for (let run = 0; run < 100; run++) {
    const points = Array.from({ length: 32 }, (_, id) => ({ x: random() * 30, y: random() * 30, id }));
    const placed = separateBeads(points, 12);
    separated(placed, 12);
    assert.deepEqual(separateBeads(points, 12), placed);
    assert.deepEqual(placed.map(({ x, id }) => [x, id]), points.map(({ x, id }) => [x, id]));
  }
});

for (const gap of [0, -1, NaN, Infinity]) test(`non-positive/non-finite gap ${gap} never invents coordinates`, () => {
  const points = [{ x: 10, y: 10 }, { x: 10, y: 10 }];
  assert.deepEqual(separateBeads(points, gap), points);
});

test('missing projections preserve their array positions without affecting valid beads', () => {
  const points = [null, { x: 4, y: NaN }, { x: 100, y: 20 }, undefined, { x: 100, y: 20 }];
  const placed = separateBeads(points, 12);
  assert.equal(placed[0], null); assert.equal(placed[3], undefined);
  assert.ok(Number.isNaN(placed[1].y));
  separated([placed[2], placed[4]], 12);
  assert.equal(placed[2].y, 20);
});

for (const bad of [{ x: NaN, y: 2 }, { x: 2, y: NaN }, { x: Infinity, y: 2 }, { x: 2, y: -Infinity }]) {
  test(`invalid projected point ${JSON.stringify(bad)} cannot poison a valid keep-out`, () => {
    assert.deepEqual(pointsBox([{ x: 10, y: 20 }, bad, null, { x: 30, y: 40 }], 4),
      { left: 6, top: 16, right: 34, bottom: 44 });
  });
}

test('a projection with no valid points has no bounding box', () => {
  assert.equal(pointsBox([]), null);
  assert.equal(pointsBox([null, { x: 1, y: NaN }]), null);
});

test('centre-line column balancing keeps explicit sides and deterministic tie breaking', () => {
  const dots = Array.from({ length: 8 }, (_, id) => ({ x: 250, y: 30 + id * 30, w: 80, h: 20 }));
  dots[0].side = 'right';
  const placed = layoutHullCallouts({ dots, bounds: { left: 0, top: 0, right: 500, bottom: 400 },
    keepOut: { left: 200, top: 20, right: 300, bottom: 350 }, gap: 16 });
  assert.deepEqual(placed.map(p => p.side), ['right', 'left', 'left', 'right', 'left', 'right', 'left', 'right']);
});

test('a phone-sized feasible two-column layout keeps cards off the hull and inside the stage', () => {
  const bounds = { left: 0, top: 0, right: 362, bottom: 300 };
  const hull = { left: 134, top: 30, right: 228, bottom: 270 };
  const dots = Array.from({ length: 8 }, (_, i) => ({ x: i % 2 ? 210 : 152, y: 45 + Math.floor(i / 2) * 58,
    w: 110, h: 42, side: i % 2 ? 'right' : 'left' }));
  const placed = layoutHullCallouts({ dots, bounds, keepOut: hull, gap: 16 });
  for (const p of placed) {
    assert.ok(p.left >= bounds.left && p.right <= bounds.right);
    assert.ok(p.top >= bounds.top && p.bottom <= bounds.bottom);
    assert.ok(p.right <= hull.left - 16 || p.left >= hull.right + 16);
    assert.ok(p.leader.flat().every(Number.isFinite));
  }
  for (let i = 0; i < placed.length; i++) for (let j = 0; j < i; j++) {
    const a = placed[i], b = placed[j];
    assert.ok(!(a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom));
  }
});

test('the poster fit still reserves real label gutters in a phone-width stage', () => {
  const region = { left: 0, top: 0, right: 362, bottom: 280 };
  const { imgRect, inkRect } = fitHullInk({ region, reserveX: 126, reserveY: 8, imageAspect: 16 / 9 });
  assert.ok(inkRect.left >= 126 && inkRect.right <= 362 - 126);
  assert.ok(inkRect.top >= 8 && inkRect.bottom <= 280 - 8);
  assert.ok(Object.values(imgRect).every(Number.isFinite));
});
