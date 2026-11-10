import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LINE_CLASSES, normalizeLineProgression } from '../src/data/lineProgression.js';
import { lineProgression } from '../src/systems/lineProgression.js';
import { physicsLogLine, PHYSICS_LOG_EVENTS } from '../src/data/physicsLog.js';
import { createBus } from '../src/core/eventBus.js';
import { readLineVisualProfile, applyLineClassCableProfile } from '../src/render/lineVisualProfile.js';
import { createLineHardware } from '../src/render/lineHardware.js';

function record() {
  return { primitives: [
    { name: 'LOD0_authored_drum', geometry: new THREE.CylinderGeometry(.5, .5, .4, 8),
      material: new THREE.MeshStandardMaterial({ color: 0xa0a0a0 }), matrix: new THREE.Matrix4() },
    { name: 'LOD1_authored_drum', geometry: new THREE.BoxGeometry(1, 1, 1),
      material: new THREE.MeshStandardMaterial(), matrix: new THREE.Matrix4() },
  ] };
}

test('each saved class I–VIII paints distinct real hull hardware and the data-owned cable width', async t => {
  const part = record();
  t.after(() => part.primitives.forEach(p => { p.geometry.dispose(); p.material.dispose(); }));
  const signatures = [], widths = [];
  for (const cls of LINE_CLASSES) {
    const bus = createBus(), state = { playerId: 1, player: { tether: { active: true } },
      entities: new Map(), lineProgression: normalizeLineProgression({ tonnageLoggedT: cls.unlockTonnageT }), render: {} };
    const system = Object.create(lineProgression); system.init({ state, bus });
    const saved = JSON.parse(JSON.stringify(system.serialize()));
    system.deserialize(saved);
    const before = JSON.stringify(state.lineProgression);
    const outer = new THREE.Group(), hull = new THREE.Group(); hull.scale.setScalar(6);
    outer.add(hull); outer.userData.hull = hull;
    const player = { id: 1, alive: true, mass: 20, radius: 6, view: { root: outer } };
    const rig = createLineHardware(state, { loadPart: async () => part });
    assert.equal(await rig.ready, true);
    assert.equal(rig.update(player), true);
    assert.equal(rig.root.parent, hull, 'canonical radius-scaled hull owns normalized fittings');
    assert.equal(rig.root.getWorldScale(new THREE.Vector3()).x, 6);
    const head = rig.root.children[0], pads = rig.root.children.slice(1).filter(p => p.visible);
    assert.equal(pads.length, cls.hardware.anchorPads);
    assert.equal(head.children[0].children.length, 1, 'only the production LOD0 body is mounted');
    assert.equal(rig.root.userData.lineClass, cls.label);
    assert.equal(head.userData.winch, cls.hardware.winch);
    signatures.push(`${head.scale.x}:${pads.length}:${pads[0].scale.x}`);
    const profile = readLineVisualProfile(state);
    const cable = { coreHalfWidth: 1, sheathHalfWidth: 2, collarCrownHalfWidth: 3, collarLipHalfWidth: 4 };
    applyLineClassCableProfile(cable, profile); widths.push(cable.coreHalfWidth);
    assert.equal(cable.coreHalfWidth, cls.hardware.cableWidth);
    const heated = { coreHalfWidth: 1, sheathHalfWidth: 2 };
    applyLineClassCableProfile(heated, { ...profile, heat: 1 });
    assert.equal(heated.coreHalfWidth, cable.coreHalfWidth, 'heat does not change the physical filament width');
    assert.equal(heated.sheathHalfWidth, cable.sheathHalfWidth * 3, 'hot glow extends beyond the white filament');
    assert.equal(JSON.stringify(state.lineProgression), before, 'the renderer never grants progression or buffs');
    assert.equal(player.mass, 20); assert.equal(player.radius, 6);
    const oldHull = hull; player.view.root = new THREE.Group(); rig.update(player);
    assert.equal(oldHull.children.length, 0, 'same-id hull replacement reparents the visual rig');
    assert.equal(rig.root.parent, player.view.root);
    rig.dispose(); assert.equal(player.view.root.children.length, 0);
    assert.equal(part.primitives[0].material.emissiveIntensity, 1, 'cached material is never retinted');
  }
  assert.equal(new Set(signatures).size, 8);
  assert.ok(widths.every((width, i) => i === 0 || width > widths[i - 1]));
});

test('cancelled authored admission never attaches a late class rig', async () => {
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const state = { lineProgression: normalizeLineProgression(null), render: {} };
  const rig = createLineHardware(state, { loadPart: () => pending });
  rig.dispose(); release(null);
  assert.equal(await rig.ready, false);
  assert.equal(rig.update({ view: { root: new THREE.Group() } }), false);
  assert.equal(rig.root.parent, null);
});

test('first held record and exact12.4t record reach the existing LOG once across save/load', () => {
  const bus = createBus(), messages = [];
  const target = { id: 2, mass: 12.4 };
  const state = { simTime: 10, playerId: 1, player: {}, entities: new Map([[2, target]]) };
  const system = Object.create(lineProgression); system.init({ state, bus });
  bus.on('line:recordStamped', payload => messages.push(physicsLogLine('line:recordStamped', payload)));
  bus.emit('tether:latched', { targetId: 2 });
  assert.deepEqual(messages, ['12 T. CORRECT.', '12,400 KG. THEY KNEW THE MASS. SO DO YOU.']);
  assert.ok(PHYSICS_LOG_EVENTS.includes('line:recordStamped'));
  const saved = JSON.parse(JSON.stringify(system.serialize()));
  system.deserialize(saved);
  bus.emit('tether:latched', { targetId: 2 });
  assert.equal(messages.length, 2, 'Continue cannot reprint an earned record');
  target.mass = 412;
  bus.emit('tether:latched', { targetId: 2 });
  assert.equal(messages.at(-1), '412 T. CORRECT.');
});
