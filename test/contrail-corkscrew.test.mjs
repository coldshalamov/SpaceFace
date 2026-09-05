// PQ-139.04 — tumbling ships corkscrew their trail.
// Vision (design/VISION.md): "he becomes a projectile" — a spun ship reads as spun from across the screen.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  ContrailTrail, spinHelixOffset, SPIN_HELIX_AMP_WU, SPIN_HELIX_REF_RAD_S, MIN_STEP_WU,
} from '../src/render/thruster/ribbon/contrailTrail.js';

test('the helix offset is zero at rest, grows with spin, and saturates at a hard tumble', () => {
  assert.equal(spinHelixOffset(0, 1.0), 0, 'a ship that is not spinning leaves the trail exactly where it was');
  assert.equal(spinHelixOffset(NaN, 1.0), 0);
  const half = Math.abs(spinHelixOffset(SPIN_HELIX_REF_RAD_S / 2, Math.PI / 2));
  const full = Math.abs(spinHelixOffset(SPIN_HELIX_REF_RAD_S, Math.PI / 2));
  const over = Math.abs(spinHelixOffset(SPIN_HELIX_REF_RAD_S * 5, Math.PI / 2));
  assert.ok(half > 0 && half < full, 'a slower spin draws a narrower helix');
  assert.equal(full, SPIN_HELIX_AMP_WU);
  assert.equal(over, SPIN_HELIX_AMP_WU, 'a wild tumble does not fling the trail off the screen');
});

function flyStraight(trail, { spin, ticks = 240, speed = 60, dt = 1 / 60 }) {
  const nozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
  for (let i = 0; i < ticks; i++) {
    nozzle.x += speed * dt;            // the ship flies +x; the exhaust points -x (aft)
    trail.update(dt, nozzle, { drive: 1, boost: 0, dash: 0, spin });
  }
  return trail.samplePositions();
}

test('a spun hull records a corkscrew across its exhaust axis; an unspun hull records a straight line', () => {
  const still = new ContrailTrail(THREE, {});
  const spun = new ContrailTrail(THREE, {});
  const a = flyStraight(still, { spin: 0 });
  const b = flyStraight(spun, { spin: 12.0 }); // the trail keeps a fixed number of samples; a fast spin fits whole turns in that window
  const lateral = (pts) => pts.map((p) => Math.abs(p.z));
  assert.ok(a.length > 10 && b.length > 10, 'both trails recorded history (the nozzle moved more than MIN_STEP_WU each tick)');
  assert.ok(Math.max(...lateral(a)) < 1e-9, 'no spin: the recorded line is the flown line');
  const maxZ = Math.max(...lateral(b));
  assert.ok(maxZ > SPIN_HELIX_AMP_WU * 0.9 && maxZ <= SPIN_HELIX_AMP_WU + 1e-9,
    `spin: the recorded line swings a hull's width across the exhaust axis (got ${maxZ.toFixed(2)} WU) — "he becomes a projectile"`);
  // The helix has the period of the spin: at 12 rad/s the recorded window holds whole turns, so the sign flips.
  const signs = b.map((p) => Math.sign(p.z)).filter((s) => s !== 0);
  let flips = 0;
  for (let i = 1; i < signs.length; i++) if (signs[i] !== signs[i - 1]) flips += 1;
  assert.ok(flips >= 3, `the helix turns with the hull (sign flips ${flips})`);
  // Sampling is still gated on the raw nozzle: the same flight records the same number of samples.
  assert.equal(a.length, b.length, 'the corkscrew moves where samples are recorded, never whether they are');
  assert.ok(MIN_STEP_WU > 0);
});
