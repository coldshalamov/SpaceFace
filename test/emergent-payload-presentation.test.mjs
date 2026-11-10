import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EmergentPayloadPresentation } from '../src/render/forceLanguage/emergentPayloadPresentation.js';
import { createEmergentPrimitivePools } from '../src/render/forceLanguage/emergentPrimitivePools.js';

function fixture() {
  const scene = new THREE.Scene();
  let origin = 0;
  const view = new EmergentPayloadPresentation(scene, { toLocal: (x, z, out) => Object.assign(out, { x: x - origin, z }) });
  const a = { id: 1, alive: true, pos: { x: 20, z: 10 }, rot: 0, radius: 8 };
  const b = { id: 2, alive: true, pos: { x: 100, z: 10 }, rot: 0, radius: 10 };
  const world = { projectiles: [], stickies: [], coatings: [], polarities: [], hijacks: [], gongs: [], springs: [], links: [], owners: {} };
  const state = { simTime: 1, settings: {}, entities: new Map([[1, a], [2, b]]), emergent: world };
  const step = (dt = 1 / 60) => { state.simTime += dt; view.update(dt, state); };
  return { scene, view, state, world, a, b, step, rebase: value => { origin = value; } };
}
function position(mesh, index = 0) {
  const matrix = new THREE.Matrix4(); mesh.getMatrixAt(index, matrix);
  return new THREE.Vector3().setFromMatrixPosition(matrix);
}

test('all traveling primitive payloads have distinct visible geometry at their real positions', () => {
  const { view, state, world, step, rebase } = fixture();
  try {
    const kinds = ['sticky', 'primer', 'grav', 'mass', 'polarity', 'hijack', 'gong', 'quantum', 'shrapnel'];
    world.projectiles = kinds.map((kind, i) => ({ alive: true, kind, x: 50 + i, z: 12, vx: 200, vz: 0, age: 0.2 }));
    const before = structuredClone(world);
    step();
    const geometrySignatures = new Set();
    for (let i = 0; i < kinds.length; i++) {
      const mesh = view.meshes.get(kinds[i]);
      assert.equal(mesh.count, 1); assert.equal(mesh.visible, true);
      assert.equal(position(mesh).x, 50 + i);
      geometrySignatures.add(JSON.stringify(Array.from(mesh.geometry.attributes.position.array)));
    }
    assert.equal(geometrySignatures.size, kinds.length, 'travel identity is in the silhouette, not just tint');
    assert.deepEqual(world, before, 'presentation does not write the projectile ledger');
    rebase(40); view.update(2, state);
    assert.equal(position(view.meshes.get('mass')).x, 13, 'floating-origin updates preserve the world anchor while paused');
    for (const shot of world.projectiles) shot.alive = false;
    step();
    assert.equal(view.slots.size, 0, 'consumed shots stop drawing immediately rather than flying through their target');
  } finally { view.dispose(); }
});

test('attached hardware follows actual hosts, first-target tags and links, then retires', () => {
  const { scene, view, state, world, a, b, step } = fixture();
  try {
    world.stickies.push({ hostId: 1, ox: 3, oz: 2, armed: true });
    world.coatings.push({ hostId: 1, until: 5 });
    world.polarities.push({ hostId: 2, charge: -1 });
    world.hijacks.push({ hostId: 2, until: 5 });
    world.gongs.push({ hostId: 1, next: 1.45, left: 4 });
    world.springs.push({ aId: 1, bId: 2, rest: 40 });
    world.links.push({ aId: 1, bId: 2 });
    world.owners[7] = { grav: 1, quantum: 2 };
    step();
    for (const [kind, count] of Object.entries({ sticky: 1, primer: 3, polarity: 2, hijack: 1, gong: 3, spring: 1, link: 1, grav: 1, quantum: 1 })) {
      assert.equal(view.meshes.get(kind).count, count, `${kind} state is visible`);
    }
    assert.equal(position(view.meshes.get('sticky')).x, 23);
    a.pos.x += 10; step();
    assert.equal(position(view.meshes.get('sticky')).x, 33);
    assert.equal(position(view.meshes.get('spring')).x, (a.pos.x + b.pos.x) / 2);
    b.alive = false; step();
    assert.equal(view.meshes.get('link').count, 0, 'dead endpoints never leave a live-looking connection');
    for (const key of Object.keys(world)) world[key] = key === 'owners' ? {} : [];
    step();
    const frozen = position(view.meshes.get('sticky')).clone();
    view.update(10, state);
    assert.deepEqual(position(view.meshes.get('sticky')), frozen, 'paused residue does not fall or expire on display time');
    step(0.3);
    assert.equal(view.slots.size, 0);
    for (const mesh of view.meshes.values()) assert.equal(mesh.visible, false);
  } finally { view.dispose(); }
  assert.equal(scene.children.length, 0);
});

test('world replacement clears old mechanisms and reduced motion freezes gong stroke', () => {
  const { view, state, world, step } = fixture();
  try {
    world.gongs.push({ hostId: 1, next: 1.45, left: 4 });
    state.settings.video = { motionReduce: true, flashReduce: true };
    step();
    const matrix = Array.from(view.meshes.get('gong').instanceMatrix.array);
    step(0.2);
    assert.deepEqual(Array.from(view.meshes.get('gong').instanceMatrix.array), matrix);
    assert.ok(view.meshes.get('gong').material.emissiveIntensity < 0.2);
    state.emergent = { projectiles: [] }; step();
    assert.equal(view.slots.size, 0);
  } finally { view.dispose(); }
});

test('viscosity retains its horizontal reach while its wet crests stay below ship bodies', () => {
  const pools = createEmergentPrimitivePools();
  try {
    const field = { x: 0, z: 0, radius: 56, life: 5 };
    pools.update({ simTime: 1, emergent: { fields: [field], presentationCount: 1,
      presentation: [{ kind: 'gel', x: 0, z: 0, scale: 56 }] } });
    const matrix = new THREE.Matrix4(), scale = new THREE.Vector3();
    pools.gels.getMatrixAt(0, matrix); scale.setFromMatrixScale(matrix);
    assert.equal(scale.x, 56); assert.equal(scale.z, 56);
    assert.ok(scale.y <= 5, 'large radius does not turn the deposit into a tall opaque mound');
  } finally { pools.dispose(); }
});
