// Massline rung 12 acceptance check: arc-preview render.
//
// vfx.js draws telemetry.arcPreview (rung 11 data) as a faint dashed ribbon from the ship along
// the predicted exit vector — visible only while tethered + viable, length scaled to peakSpeed,
// cosmetic-only (never writes sim state). Same headless harness shape as check-vfx-trail-bind.mjs:
// real THREE.Scene + real vfx.init/update; the arc is exercised through the actual update() path
// (the _arcPreviewActive gate), not by poking the private method.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';

const DT = 1 / 60;

assertVisibleAndAimedWhenViable();
assertLengthScalesWithPeakSpeed();
assertHiddenWhenNotViable();
assertHiddenWhenNoPreviewOrNoTether();
assertCosmeticOnly();

console.log('Massline arc-preview render checks OK');

function createHarness({ tether, arcPreview } = {}) {
  const scene = new THREE.Scene();
  const player = {
    id: 1, type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, rot: 0, radius: 6,
  };
  const state = {
    playerId: player.id,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    simTime: 1,
    settings: { video: { particleQuality: 'high' } },
    render: { scene },
    player: {
      tether: tether !== undefined ? tether
        : { active: true, targetId: 2, strain: 0.3, load: 0.75, restLength: 90, phase: 'loaded' },
      masslineTelemetry: {
        active: true,
        tangentialSpeed: 60,
        arcPreview: arcPreview !== undefined ? arcPreview
          : { peakSpeed: 90, exitAngle: 0, exitSpeed: 60, timeToWhip: 0, viable: true },
      },
    },
  };
  const system = Object.create(vfx);
  system.init({ state, bus: { on() { return () => {}; } }, helpers: {} });
  return { system, state, player };
}

function frames(h, n) {
  for (let i = 0; i < n; i += 1) h.system.update(DT);
}

// Far tip of the last dash along +x (exitAngle 0): the ribbon's reach.
function tipX(h) {
  const posArr = h.system._arcPreview.mesh.geometry.attributes.position.array;
  const last = (h.system._arcPreview.DASHES - 1) * 12;
  return posArr[last + 6]; // x of the dash-end vertex
}

// 1. Tethered + viable: the arc mesh exists, becomes visible, aims along the exit vector, and is
//    genuinely dashed (a gap between consecutive dashes).
function assertVisibleAndAimedWhenViable() {
  const h = createHarness();
  frames(h, 10);
  const arc = h.system._arcPreview;
  assert.ok(arc && arc.mesh, 'arc-preview object must exist after init');
  assert.equal(arc.mesh.visible, true, 'viable swing must show the arc preview');
  assert.ok(arc.mesh.material.opacity > 0.05, `visible arc must have real opacity; got ${arc.mesh.material.opacity}`);

  const posArr = arc.mesh.geometry.attributes.position.array;
  // exitAngle 0 -> ribbon extends +x from just off the hull (radius 6 + 2), on the vfx plane.
  assert.ok(Math.abs(posArr[0] - 8) < 1.5, `first dash must start off the hull; x=${posArr[0]}`);
  assert.ok(Math.abs(posArr[2]) < 1.5, `+x ray keeps z near 0; z=${posArr[2]}`);
  assert.ok(tipX(h) > 40, `ribbon must reach forward; tip=${tipX(h)}`);
  // Dashed: dash 1 starts beyond dash 0's end (a real gap).
  const dash0End = posArr[6];
  const dash1Start = posArr[12];
  assert.ok(dash1Start > dash0End + 0.5, `dashes must have gaps; d0end=${dash0End} d1start=${dash1Start}`);
}

// 2. Length is scaled to peakSpeed: a hotter swing draws a longer throw.
function assertLengthScalesWithPeakSpeed() {
  const slow = createHarness({ arcPreview: { peakSpeed: 40, exitAngle: 0, exitSpeed: 40, timeToWhip: 0, viable: true } });
  frames(slow, 10);
  const fast = createHarness({ arcPreview: { peakSpeed: 130, exitAngle: 0, exitSpeed: 90, timeToWhip: 0, viable: true } });
  frames(fast, 10);
  assert.ok(tipX(fast) > tipX(slow) + 30,
    `arc length must scale with peakSpeed; fast=${tipX(fast)} slow=${tipX(slow)}`);
}

// 3. Same swing but not viable: the arc must hide (after the short fade envelope).
function assertHiddenWhenNotViable() {
  const h = createHarness();
  frames(h, 10);
  assert.equal(h.system._arcPreview.mesh.visible, true, 'precondition: visible while viable');
  h.state.player.masslineTelemetry.arcPreview.viable = false;
  frames(h, 30); // fade-out envelope (~1/6 s) + margin
  assert.equal(h.system._arcPreview.mesh.visible, false, 'non-viable preview must hide the arc');
}

// 4. No preview data (cleared by telemetry) or no tether: hidden.
function assertHiddenWhenNoPreviewOrNoTether() {
  const noPreview = createHarness({ arcPreview: null });
  frames(noPreview, 10);
  assert.equal(noPreview.system._arcPreview.mesh.visible, false, 'null arcPreview must render nothing');

  const noTether = createHarness({ tether: { active: false, targetId: null, strain: 0, load: 0, restLength: 0, phase: 'slack' } });
  frames(noTether, 10);
  assert.equal(noTether.system._arcPreview.mesh.visible, false, 'inactive tether must render nothing');
}

// 5. Cosmetic-only: the render pass must not write the sim-owned subtrees it reads.
function assertCosmeticOnly() {
  const h = createHarness();
  const tetherBefore = JSON.stringify(h.state.player.tether);
  const telemetryBefore = JSON.stringify(h.state.player.masslineTelemetry);
  const velBefore = JSON.stringify(h.player.vel);
  frames(h, 20);
  assert.equal(JSON.stringify(h.state.player.tether), tetherBefore, 'render must not write tether');
  assert.equal(JSON.stringify(h.state.player.masslineTelemetry), telemetryBefore, 'render must not write telemetry');
  assert.equal(JSON.stringify(h.player.vel), velBefore, 'render must not steer the player');
}
