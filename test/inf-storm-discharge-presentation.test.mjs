import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLawArenaDressing } from '../src/render/lawArenaDressing.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';

const warning = { wave: 5, roomGeneration: 3, serial: 7, atSim: 20, expiresAtSim: 24, warningS: 1.25,
  segments: [{ ax: 0, az: 0, bx: 80, bz: 0 }, { ax: 80, az: 0, bx: 80, bz: 75 }],
  nodes: [{ x: 0, z: 0, radius: 30 }, { x: 80, z: 0, radius: 30 }, { x: 80, z: 75, radius: 30 }] };

test('bounded worker warning becomes the same steady path and is retired by the matching receipt', () => {
  const bridge = projectBridgeEvent('survivalArena:stormWarning', warning);
  assert.equal(bridge.dropped, false); assert.equal(bridge.lane, 'presentation');
  const wire = structuredClone(bridge.flat);
  const reader = createLawArenaDressing(), scene = new THREE.Scene(), receipts = [];
  assert.equal(reader.handleStormWarning(wire, scene, p => receipts.push(p)), true);
  const root = scene.getObjectByName('storm_discharge_warning');
  assert.ok(root);
  const segments = root.children.filter(n => n.name === 'storm_discharge_warning_segment');
  const rings = root.children.filter(n => n.name === 'storm_discharge_warning_node');
  assert.equal(segments.length, 2); assert.equal(rings.length, 3);
  assert.equal(segments[0].position.x, 40); assert.equal(segments[0].position.z, 0);
  assert.equal(rings[2].position.x, 80); assert.equal(rings[2].position.z, 75);
  assert.equal(receipts.length, 0, 'receipts wait for the reader update');
  reader.updateRoom(20.2, 1 / 60, { reducedMotion: true, reducedFlash: true });
  assert.deepEqual(receipts, [{ wave: 5, roomGeneration: 3, serial: 7 }]);
  const before = segments.map(s => [s.rotation.y, s.material.emissiveIntensity]);
  reader.updateRoom(21, 1 / 60, { reducedMotion: true, reducedFlash: true });
  assert.deepEqual(segments.map(s => [s.rotation.y, s.material.emissiveIntensity]), before);
  assert.equal(receipts.length, 1);
  assert.equal(reader.handleStormEnd({ wave: 5, roomGeneration: 3, serial: 6 }), false);
  assert.equal(scene.getObjectByName('storm_discharge_warning'), root, 'stale end cannot clear the live tell');
  assert.equal(reader.handleStormEnd({ wave: 5, roomGeneration: 3, serial: 7 }), true);
  assert.equal(scene.getObjectByName('storm_discharge_warning'), undefined);
  assert.equal(reader.handleStormWarning(wire, scene), false, 'duplicate cannot recreate an ended warning');
  assert.equal(reader.handleStormWarning({ ...wire, serial: 8 }, scene), true);
  reader.updateRoom(24, 1 / 60, {});
  assert.equal(scene.getObjectByName('storm_discharge_warning'), undefined, 'expired warning is removed');
  assert.equal(reader.handleStormWarning({ ...wire, roomGeneration: 4, serial: 9, expiresAtSim: 40 }, scene), true);
  assert.equal(reader.handleStormResolve({ wave: 5, roomGeneration: 4, serial: 9, atSim: 21,
    segments: [{ ax: 2, az: 3, bx: 60, bz: 4 }], nodes: [{ x: 2, z: 3 }, { x: 60, z: 4 }] }), true);
  const arc = scene.getObjectByName('storm_discharge_arc');
  assert.ok(arc);
  assert.equal(arc.children.filter(n => n.name === 'storm_discharge_warning_segment' && n.visible).length, 1);
  assert.equal(arc.children.find(n => n.name === 'storm_discharge_warning_segment').position.x, 31,
    'resolved arc uses accepted live endpoint positions');
  reader.handleReleased();
  assert.equal(scene.getObjectByName('storm_discharge_warning'), undefined, 'room release removes it');
  reader.resetStormPresentation();
  assert.equal(reader.handleStormWarning({ ...wire, roomGeneration: 1, serial: 1, expiresAtSim: 40 }, scene), true,
    'a new world can start a new generation');
  reader.resetStormPresentation();
  const unavailable = [];
  assert.equal(reader.handleStormWarning({ ...wire, roomGeneration: 1, serial: 2, expiresAtSim: 40 }, scene,
    receipt => unavailable.push(receipt)), true);
  reader.invalidateStormPresentation();
  assert.deepEqual(unavailable, [{ wave: 5, roomGeneration: 1, serial: 2, available: false }]);
  assert.equal(scene.getObjectByName('storm_discharge_warning'), undefined);
});

test('malformed, oversized and stale geometry is refused', () => {
  const reader = createLawArenaDressing(), scene = new THREE.Scene();
  assert.equal(reader.handleStormWarning({ ...warning, segments: Array(9).fill(warning.segments[0]) }, scene), false);
  assert.equal(reader.handleStormWarning({ ...warning, nodes: [{ x: 1, z: 1, radius: Infinity }] }, scene), false);
  assert.equal(reader.handleStormWarning(warning, scene), true);
  assert.equal(reader.handleStormWarning({ ...warning, roomGeneration: 2, serial: 999 }, scene), false);
  reader.resetStormPresentation();
});
