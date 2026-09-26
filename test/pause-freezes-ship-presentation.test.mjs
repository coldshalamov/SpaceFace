// Pause freeze: world-anchored ship presentation rides the sim clock and the
// time-effects-scaled frame delta — a held world holds still instead of animating
// on wall time (kill-cam hard freeze, bullet-time, restore latch, lab holds).
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';

import { finalizeShip } from '../src/render/ships/shipKit.js';

const RENDERER = new URL('../src/render/renderer.js', import.meta.url);

function kitFanShip() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  root.add(hull);
  const fan = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial());
  hull.add(fan);
  finalizeShip({
    root, hull, decals: [], driveParts: { fan },
    entity: { radius: 10, vel: { x: 60, z: 0 } }, designRadius: 10,
  });
  return { root, fan };
}

test('the drive-fan closure is a pure function of the clock it is fed', () => {
  const { root, fan } = kitFanShip();
  assert.equal(typeof root.userData.updateDriveState, 'function');
  root.userData.updateDriveState(null, 10);
  const parked = fan.rotation.x;
  root.userData.updateDriveState(null, 20);
  const spinning = fan.rotation.x;
  assert.notEqual(spinning, parked, 'a moving sim clock spins the fan');
  // The freeze case: the same clock fed again must leave the picture identical.
  root.userData.updateDriveState(null, 20);
  assert.equal(fan.rotation.x, spinning, 'a held clock holds the picture still');
});

test('syncEntityViews feeds simNow to the world-anchored closures', () => {
  const src = readFileSync(RENDERER, 'utf8');
  assert.match(src, /const simNow = Number\.isFinite\(this\.state && this\.state\.simTime\)/);
  assert.match(src, /updateRuntimeState\(entity, simNow\)/);
  assert.match(src, /updateDamageState\(entity, simNow\)/);
  assert.match(src, /updateDriveState\(entity, simNow\)/);
  assert.match(src, /setShieldShellClock\(shieldBubble\.material, simNow/);
});

test('the per-entity motion block and flash decay ride the scaled presentation delta', () => {
  const src = readFileSync(RENDERER, 'utf8');
  assert.match(src, /_presentationFrameDt = Math\.max\(0, this\._lastFrameDt \* presentationTs\)/);
  assert.match(src, /if \(entity && !farSpeck && presFrameDt > 0\)/);
  assert.match(src, /updateShipPitchPresentation\(this\.state, this\._presentationFrameDt\)/);
  // No wall-clock dt feeds the micro-motion block: the old fallback would force a
  // motion step during the restore latch that is supposed to publish a held picture.
  assert.doesNotMatch(src, /const frameDt = this\._lastFrameDt \|\| 0\.016667/);
});
