import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSwarmThreatPlate } from '../src/render/visualFactory.js';

// design/overhaul/07 section 6: hulls read by silhouette and paint; a 2D plate only on the
// player's current target and on bosses.
function plateVisible(entity, targetId) {
  const hull = new THREE.Group();
  const camera = new THREE.PerspectiveCamera();
  syncSwarmThreatPlate(hull, entity, camera, null, targetId);
  const plate = hull.getObjectByName('sf-swarm-threat-plate');
  return !!plate && plate.visible === true;
}

test('an ordinary hostile wears no 2D plate', () => {
  assert.equal(plateVisible({ id: 7, type: 'ship', team: 1, radius: 12 }, null), false);
  assert.equal(plateVisible({ id: 7, type: 'ship', team: 1, radius: 12 }, 99), false);
});

test('the current target wears the plate, and only while targeted', () => {
  assert.equal(plateVisible({ id: 7, type: 'ship', team: 1, radius: 12 }, 7), true);
});

test('a boss wears the plate untargeted', () => {
  assert.equal(plateVisible({ id: 8, type: 'ship', team: 1, radius: 20, data: { isBoss: true } }, null), true);
  assert.equal(plateVisible({ id: 9, type: 'ship', team: 1, radius: 20, flags: { boss: true } }, null), true);
});

test('a plate hides again when the hull loses target status', () => {
  const hull = new THREE.Group(); const camera = new THREE.PerspectiveCamera();
  const e = { id: 7, type: 'ship', team: 1, radius: 12 };
  syncSwarmThreatPlate(hull, e, camera, null, 7);
  const plate = hull.getObjectByName('sf-swarm-threat-plate');
  assert.equal(plate.visible, true);
  syncSwarmThreatPlate(hull, e, camera, null, null);
  assert.equal(plate.visible, false);
});
