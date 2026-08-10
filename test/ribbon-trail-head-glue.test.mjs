// U01-TRAILS characterization: trail head / first-segment lag-skip under acceleration,
// frame-rate jitter, and delayed display frames.
//
// Defect under test: after a large per-frame socket displacement, the rendered ribbon head must
// stay glued to the live nozzle AND the first history sample must remain within one sample-spacing
// of that nozzle. The old equal-fraction subdivision capped at RIBBON_TRAIL_INTERPOLATION_CAP left
// a long first chord (live → history[1]) that reads as the trail skipping/detaching behind the ship
// even when the two head vertices sat on the nozzle.

import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createRibbonTrail,
  RIBBON_TRAIL_INTERPOLATION_CAP,
} from '../src/render/engineTrailSurfaces.js';

const SPACING = 3;
const DISCONTINUITY = 640;
const PERIOD = 1 / 30;
const EPS = 1e-4;

function headCenter(mesh) {
  const pos = mesh.geometry.attributes.position.array;
  return {
    x: (pos[0] + pos[3]) * 0.5,
    z: (pos[2] + pos[5]) * 0.5,
  };
}

/** Most-recent committed history sample after rebuild (centers[1] → verts 2/3). */
function firstHistoryCenter(mesh) {
  const pos = mesh.geometry.attributes.position.array;
  return {
    x: (pos[6] + pos[9]) * 0.5,
    z: (pos[8] + pos[11]) * 0.5,
  };
}

function hypot2(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

{
  const scene = new THREE.Scene();
  // Capacity well above the per-frame insert budget so the cap, not the ring, is the limiter.
  const trail = createRibbonTrail(scene, '#39d0ff', 48, 2);
  const mesh = trail.getMesh();
  const owner = { id: 'u01-char' };

  trail.follow(0, 0, 0, 1 / 60, owner, SPACING, DISCONTINUITY, PERIOD);
  trail.rebuild(0.85, 0.1, 1, 1.6);
  assert.equal(mesh.visible, false, 'seed pose must not draw a degenerate card');

  // Delayed display frame at high speed: 100 WU in one step (≈ 1000 WU/s at 10 Hz hitch).
  // With the legacy cap-of-8 equal-fraction fill, last committed lands at 87.5 and the first
  // ribbon segment spans 12.5 WU — more than 4× sample spacing — which is the visible skip.
  const hitchX = 100;
  const hitchZ = 0;
  trail.follow(hitchX, hitchZ, 0, 0.1, owner, SPACING, DISCONTINUITY, PERIOD);
  trail.rebuild(0.85, 0.2, 2, 1.6);

  assert.equal(mesh.visible, true, 'a long delayed frame must produce a visible wake');
  const head = headCenter(mesh);
  assert.ok(
    hypot2(head.x, head.z, hitchX, hitchZ) < EPS,
    `trail head must stay glued to the nozzle after a hitch (head=${head.x},${head.z})`,
  );

  const hist = firstHistoryCenter(mesh);
  const firstSeg = hypot2(head.x, head.z, hist.x, hist.z);
  assert.ok(
    firstSeg <= SPACING + EPS,
    `first ribbon segment must stay within sample spacing after a hitch `
      + `(segment=${firstSeg.toFixed(3)} WU, spacing=${SPACING}, `
      + `history=(${hist.x.toFixed(3)},${hist.z.toFixed(3)}), `
      + `cap=${RIBBON_TRAIL_INTERPOLATION_CAP}) — this is the lag/skip chord behind the ship`,
  );

  // Sustained acceleration + frame-rate jitter: every display frame the head stays socket-bound
  // and the first segment never opens into a detach chord.
  let x = hitchX;
  let z = hitchZ;
  const frames = [
    { dt: 1 / 60, speed: 180 },
    { dt: 1 / 30, speed: 260 },
    { dt: 0.08, speed: 420 },
    { dt: 1 / 120, speed: 420 },
    { dt: 0.05, speed: 600 },
    { dt: 1 / 60, speed: 720 },
    { dt: 0.09, speed: 900 },
    { dt: 1 / 45, speed: 900 },
  ];
  for (let i = 0; i < frames.length; i++) {
    const { dt, speed } = frames[i];
    const step = speed * dt;
    // Mild curve so the ribbon has non-axis-aligned segments (camera-relative skip cases).
    const yaw = 0.04 * i;
    x += Math.cos(yaw) * step;
    z += Math.sin(yaw) * step;
    const rot = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    trail.follow(x, z, rot, dt, owner, SPACING, DISCONTINUITY, PERIOD);
    trail.rebuild(0.9, 0.1 * i, 3 + i, 1.7);

    const h = headCenter(mesh);
    const headErr = hypot2(h.x, h.z, x, z);
    assert.ok(
      headErr < EPS,
      `frame ${i}: head detached from nozzle by ${headErr.toFixed(5)} WU `
        + `at speed=${speed} dt=${dt}`,
    );

    const stats = trail.inspect();
    if (stats.renderedCount >= 2) {
      const fh = firstHistoryCenter(mesh);
      const seg = hypot2(h.x, h.z, fh.x, fh.z);
      assert.ok(
        seg <= SPACING + EPS,
        `frame ${i}: first segment ${seg.toFixed(3)} WU exceeds spacing ${SPACING} `
          + `(speed=${speed}, dt=${dt}) — skip/detach chord`,
      );
    }
  }

  // Cadence-reduced head sync must preserve the same glue contract without a full rebuild.
  const beforeRebuilds = trail.inspect().fullRebuildCount;
  x += 6;
  z += 1.5;
  trail.follow(x, z, 0.1, 1 / 60, owner, SPACING, DISCONTINUITY, PERIOD);
  assert.equal(trail.syncHead(0.8, 0.3, 9, 1.5), true);
  const synced = headCenter(mesh);
  assert.ok(
    hypot2(synced.x, synced.z, x, z) < EPS,
    `syncHead must keep the nozzle pair glued (got ${synced.x},${synced.z})`,
  );
  assert.equal(
    trail.inspect().fullRebuildCount,
    beforeRebuilds,
    'syncHead must not rebuild full history',
  );

  trail.dispose();
}

console.log('ribbon-trail-head-glue: characterization + glue contract PASS');
