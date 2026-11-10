import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEEP_FIELD_VOID_SIZE, DEEP_FIELD_FINISHES, DEBRIS_FRACTURE_PLANES,
  projectDebrisVertex, rgbaMipBytes,
} from '../src/render/deepFieldDesign.js';

// Fibonacci directions exercise the entire closed surface without nondeterministic samples.
function directions(count = 2048) {
  return Array.from({ length: count }, (_, i) => {
    const y = 1 - 2 * (i + 0.5) / count;
    const a = i * Math.PI * (3 - Math.sqrt(5));
    const r = Math.sqrt(1 - y * y);
    return [r * Math.cos(a), y, r * Math.sin(a)];
  });
}

for (let variant = 0; variant < 2; variant++) {
  test(`fracture ${variant} is bounded, non-collapsed and inside every authored plane`, () => {
    const out = [0, 0, 0];
    for (const d of directions()) {
      assert.equal(projectDebrisVertex(...d, variant, out), out, 'scratch must be retained');
      assert.ok(out.every(Number.isFinite));
      const radius = Math.hypot(...out);
      assert.ok(radius > 0.45 && radius <= 1.53, `invalid radius ${radius}`);
      for (const p of DEBRIS_FRACTURE_PLANES[variant]) {
        assert.ok(p[0] * out[0] + p[1] * out[1] + p[2] * out[2] <= p[3] + 1e-10);
      }
    }
  });
  test(`fracture ${variant} keeps substantial thickness instead of the old 0.38-Y disc`, () => {
    const spans = [0, 1, 2].map(axis => {
      const d = [0, 0, 0]; d[axis] = 1;
      const positive = projectDebrisVertex(...d, variant)[axis];
      d[axis] = -1;
      return positive - projectDebrisVertex(...d, variant)[axis];
    });
    assert.ok(Math.min(...spans) / Math.max(...spans) > 0.48);
  });
}

test('silhouettes are distinct, deterministic, and independent of direction magnitude', () => {
  let difference = 0;
  for (const d of directions(128)) {
    const a = projectDebrisVertex(...d, 0);
    const b = projectDebrisVertex(...d, 1);
    difference += Math.hypot(...a.map((v, i) => v - b[i]));
    assert.deepEqual(a, projectDebrisVertex(...d, 0));
    const scaled = projectDebrisVertex(...d.map(v => v * 17), 0);
    assert.ok(a.every((v, i) => Math.abs(v - scaled[i]) < 1e-12));
  }
  assert.ok(difference / 128 > 0.1, 'not the same pebble with a different name');
});

test('invalid directions fail finite and reuse caller storage', () => {
  const scratch = [1, 2, 3];
  for (const direction of [[0, 0, 0], [NaN, 0, 0], [Infinity, 1, 0]]) {
    assert.equal(projectDebrisVertex(...direction, 0, scratch), scratch);
    assert.deepEqual(scratch, [0, 0, 0]);
  }
});

test('mip budget measures an actual RGBA8 chain, not a rounded multiplier', () => {
  assert.equal(rgbaMipBytes(1), 4);
  assert.equal(rgbaMipBytes(2), 20);
  assert.equal(rgbaMipBytes(2048), 22_369_620);
  assert.equal(rgbaMipBytes(DEEP_FIELD_VOID_SIZE), 5_460);
  assert.equal(rgbaMipBytes(NaN), 4);
});

test('regional finishes remain physical, non-emissive, immutable and distinct', () => {
  assert.equal(Object.keys(DEEP_FIELD_FINISHES).length, 4);
  assert.equal(Object.isFrozen(DEEP_FIELD_FINISHES), true);
  const signatures = new Set();
  for (const finish of Object.values(DEEP_FIELD_FINISHES)) {
    assert.equal(Object.isFrozen(finish), true);
    assert.ok(finish.roughness >= 0.7 && finish.roughness <= 1);
    assert.ok(finish.metalness >= 0 && finish.metalness <= 0.12);
    assert.ok(finish.normalStrength > 0 && finish.normalStrength < 1);
    signatures.add(JSON.stringify(finish));
  }
  assert.equal(signatures.size, 4);
});
