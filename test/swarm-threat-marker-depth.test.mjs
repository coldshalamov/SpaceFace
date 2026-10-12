import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { syncSwarmThreatPlate } from '../src/render/visualFactory.js';

test('Swarm threat marks respect foreground depth, allegiance changes and nested orientation', () => {
  const world = new THREE.Group(), hull = new THREE.Group(); world.rotation.y = .4; hull.rotation.x = .2; world.add(hull);
  const camera = new THREE.PerspectiveCamera(); camera.rotation.x = -.7;
  const enemy = { type: 'ship', team: 1, radius: 12 };
  syncSwarmThreatPlate(hull, enemy, camera);
  const plate = hull.getObjectByName('sf-swarm-threat-plate'), core = hull.getObjectByName('sf-swarm-threat-core');
  assert.equal(plate.material.depthTest, true, 'solid foreground hulls occlude the mark');
  assert.equal(plate.material.depthWrite, false, 'the mark cannot occlude authored hull geometry');
  const orientation = new THREE.Quaternion(); plate.getWorldQuaternion(orientation);
  assert.ok(orientation.angleTo(camera.quaternion) < 1e-6, 'parent rotation does not tip the camera-facing rim');
  syncSwarmThreatPlate(hull, { ...enemy, team: 0 }, camera);
  assert.equal(plate.visible, false); assert.equal(core.visible, false);
  syncSwarmThreatPlate(hull, enemy, camera); assert.equal(plate.visible, true);
});
