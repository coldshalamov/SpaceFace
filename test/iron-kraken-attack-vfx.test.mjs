import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { IRON_KRAKEN_HEAVY } from '../src/data/encounters/capital-boss/iron-kraken.js';
import { resolveBossShapes, circleIntersectsBossShape } from '../src/combat/capitalBossGeometry.js';
import { createIronKrakenAttackVfx, getIronKrakenAttackVfxResources,
  ironKrakenAttackLocalFrame } from '../src/render/ironKrakenAttackVfx.js';

const profile = IRON_KRAKEN_PROFILES.heavy;
function fixture(beatId = 'siphon_jet', phase = 'active') {
  const root = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(profile.coreRadius); root.add(body);
  const entity = { id: 'kraken', alive: true, hull: profile.hull, rot: .7,
    pos: { x: 73, z: -46 } };
  const target = { pos: { x: -85, z: 139 } };
  const beat = IRON_KRAKEN_HEAVY.score.beats.find(b => b.id === beatId);
  const fight = { fightId: 'vfx-test', phase, clock: beat.tellTicks + (phase === 'active' ? 15 : -15),
    cast: { id: 'vfx-test:1', beatId, startedAt: 0, fired: phase === 'active',
      shapes: resolveBossShapes(beat, entity, target) } };
  const fx = createIronKrakenAttackVfx(root, profile); body.add(fx.aperture);
  const update = (a11y = {}) => {
    root.position.set(entity.pos.x, 0, entity.pos.z); root.rotation.y = -entity.rot;
    fx.update(entity, fight, {}, 10000, a11y); root.updateMatrixWorld(true);
  };
  update();
  return { root, body, entity, target, beat, fight, fx, update };
}
function visibleMeshes(fx) { return fx.group.children.filter(mesh => mesh.visible); }
function snapshot(fx) {
  return fx.group.children.map(mesh => ({ visible: mesh.visible, matrix: mesh.matrix.toArray(),
    geometry: mesh.geometry.uuid,
    uniforms: Object.fromEntries(Object.entries(mesh.material.uniforms).map(([key, value]) => [key, value.value])) }));
}
function beginRecovery(run, cancelled = false) {
  run.fight.clock = run.beat.tellTicks + run.beat.activeTicks + 1;
  run.fight.cast = null; run.fight.phase = 'recovery';
  run.fight.recovery = { beatId: run.beat.id, startedAt: run.fight.clock,
    durationTicks: run.beat.recoverTicks, heading: 0, cancelled };
  run.update();
}

// Independent geometric tests: actual mesh envelope vertices must lie inside the same damage
// shapes, and closed edges must have exactly two incident triangles. No string/source snapshots.
for (const beatId of ['siphon_jet', 'arm_rake', 'ink_ring']) {
  test(`${beatId} shares the authoritative locked footprint under source translation and yaw`, () => {
    const run = fixture(beatId);
    try {
      const { fight, fx, entity } = run;
      const shapes = structuredClone(fight.cast.shapes);
      assert.equal(fx.inspect().activeCount, shapes.length);
      const world = new THREE.Vector3();
      const inspect = () => {
        const meshes = visibleMeshes(fx);
        for (let i = 0; i < meshes.length; i++) {
          const mesh = meshes[i], positions = mesh.geometry.attributes.position;
          for (let j = 0; j < positions.count; j++) {
            world.fromBufferAttribute(positions, j).applyMatrix4(mesh.matrixWorld);
            assert.ok(circleIntersectsBossShape(world, 0.0001, shapes[i]), `${beatId} vertex ${j} left its damage footprint`);
          }
        }
      };
      inspect();
      entity.pos.x += 61; entity.pos.z -= 42; entity.rot -= 1.2;
      run.update(); inspect();
      assert.deepEqual(fight.cast.shapes, shapes, 'presentation must never drag the cast with the source');
    } finally { run.fx.dispose(); }
  });
}

test('pressure and sector meshes are closed manufactured volumes, without points/cards', () => {
  const resources = getIronKrakenAttackVfxResources();
  for (const geometry of [resources.jet, resources.rake, resources.ink]) {
    assert.equal(geometry.userData.spacefaceSharedAsset, true);
    const position = geometry.attributes.position;
    assert.ok(position.count >= 400);
    assert.ok(geometry.boundingBox.max.y > geometry.boundingBox.min.y);
    const incidence = new Map(), index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) for (let j = 0; j < 3; j++) {
      const a = index[i + j], b = index[i + (j + 1) % 3];
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      incidence.set(key, (incidence.get(key) || 0) + 1);
    }
    for (const count of incidence.values()) assert.equal(count, 2, `${geometry.name} has an unclosed envelope edge`);
  }
});

test('cast tells charge only the attached throat; missing/fake cast data cannot invent attacks', () => {
  const run = fixture('siphon_jet', 'tell');
  try {
    assert.equal(run.fx.inspect().activeCount, 0);
    assert.equal(visibleMeshes(run.fx).length, 0);
    assert.equal(run.fx.inspect().aperture, 'charge');
    assert.equal(run.fx.aperture.parent, run.body);
    assert.equal(run.fx.aperture.position.x, 1.01);
    run.fight.phase = 'active'; // A phase string alone is not a fired attack receipt.
    run.update();
    assert.equal(run.fx.inspect().activeCount, 0);
    run.fight.cast.fired = true;
    run.fight.cast.shapes[0].radius = NaN;
    run.update();
    assert.equal(run.fx.inspect().activeCount, 0);
    run.fight.cast.beatId = 'unrecognized_attack'; run.update();
    assert.equal(run.fx.inspect().activeCount, 0);
  } finally { run.fx.dispose(); }
});

test('every live lane and sector is marked in full on the first damaging tick', () => {
  for (const beatId of ['siphon_jet', 'arm_rake', 'ink_ring']) {
    const run = fixture(beatId, 'tell');
    try {
      assert.equal(visibleMeshes(run.fx).length, 0);
      run.fight.clock = run.beat.tellTicks;
      run.fight.phase = 'active'; run.fight.cast.fired = true;
      run.update();
      const first = visibleMeshes(run.fx);
      assert.equal(first.length, run.fight.cast.shapes.length);
      for (const mesh of first) {
        assert.equal(mesh.material.uniforms.uProgress.value, 0);
        assert.equal(mesh.material.uniforms.uActive.value, 1);
        assert.ok(mesh.material.uniforms.uCoverage.value >= .1,
          'the full active envelope must not wait for pressure arrival or a travelling rake');
      }
      run.fight.clock += Math.floor(run.beat.activeTicks / 2);
      run.update({ reducedMotion: true, reducedFlash: true });
      for (const mesh of visibleMeshes(run.fx)) {
        assert.ok(mesh.material.uniforms.uProgress.value > 0);
        assert.equal(mesh.material.uniforms.uCoverage.value, .12,
          'steady danger coverage remains independent of travel, motion and flash detail');
      }
      beginRecovery(run);
      for (const mesh of visibleMeshes(run.fx)) {
        assert.equal(mesh.material.uniforms.uActive.value, 0);
        assert.equal(mesh.material.uniforms.uCoverage.value, 0,
          'harmless residue must lose full-volume active coverage immediately');
      }
    } finally { run.fx.dispose(); }
  }
});

test('pause holds fields while accessibility preserves silhouettes and suppresses only flow/heat', () => {
  const run = fixture('ink_ring');
  try {
    const first = snapshot(run.fx);
    for (let i = 0; i < 5; i++) run.update();
    assert.deepEqual(snapshot(run.fx), first);
    run.fight.clock += 8; run.update();
    assert.notDeepEqual(snapshot(run.fx), first, 'fixed simulation clock must animate empty-space attacks');
    const normal = visibleMeshes(run.fx)[0].material.uniforms;
    assert.equal(normal.uMotion.value, 1); assert.equal(normal.uFlash.value, 1);
    run.update({ reducedMotion: true, reducedFlash: true });
    const reduced = snapshot(run.fx);
    for (const mesh of visibleMeshes(run.fx)) {
      assert.equal(mesh.material.uniforms.uMotion.value, 0);
      assert.ok(mesh.material.uniforms.uFlash.value > 0 && mesh.material.uniforms.uFlash.value < .5);
      assert.equal(mesh.material.uniforms.uActive.value, 1);
    }
    run.update({ reducedMotion: true, reducedFlash: true });
    assert.deepEqual(snapshot(run.fx), reduced);
    assert.equal(run.fx.inspect().activeCount, 2);
  } finally { run.fx.dispose(); }
});

test('recovery drops danger immediately, drains retained matter, and displays the actual weakpoint cue', () => {
  const run = fixture('siphon_jet');
  try {
    const original = visibleMeshes(run.fx)[0], geometry = original.geometry;
    beginRecovery(run);
    assert.equal(run.fx.inspect().activeCount, 0);
    assert.equal(run.fx.inspect().releasingCount, 1);
    assert.equal(original.material.uniforms.uActive.value, 0);
    assert.equal(run.fx.inspect().aperture, 'recovery');
    assert.equal(original.geometry, geometry, 'retirement keeps existing material instead of spawning a new flash');
    const releaseFlow = original.material.uniforms.uTime.value;
    run.fight.clock += 12; run.update();
    assert.ok(original.material.uniforms.uRelease.value > 0);
    assert.ok(original.material.uniforms.uTime.value > releaseFlow);
    run.fight.clock += 60; run.update();
    assert.equal(visibleMeshes(run.fx).length, 0);
    assert.equal(run.fx.inspect().releasingCount, 0);
    assert.equal(run.fx.inspect().aperture, 'recovery', 'the weakpoint outlives harmless field cooling');
    run.fight.clock = run.fight.recovery.startedAt + run.fight.recovery.durationTicks;
    run.update(); assert.equal(run.fx.inspect().aperture, 'off');
  } finally { run.fx.dispose(); }
});

test('countering a harmless tell does not invent a discharge or a death flash', () => {
  const run = fixture('arm_rake', 'tell');
  try {
    beginRecovery(run, true);
    assert.equal(run.fx.inspect().activeCount, 0);
    assert.equal(run.fx.inspect().releasingCount, 0);
    assert.equal(visibleMeshes(run.fx).length, 0);
  } finally { run.fx.dispose(); }
});

test('suspension, destruction, ownership changes and time reversal clear stale geometry', () => {
  for (const stop of [
    r => { r.fight.suspended = true; },
    r => { r.fight.terminal = 'victory'; },
    r => { r.entity.alive = false; },
    r => { r.entity.hull = 0; },
    r => { r.entity.id = 'replacement'; r.fight.phase = 'intro'; r.fight.cast = null; },
    r => { r.fight.clock = 0; r.fight.phase = 'intro'; r.fight.cast = null; },
  ]) {
    const run = fixture('ink_ring');
    try {
      stop(run); run.update();
      assert.equal(visibleMeshes(run.fx).length, 0);
      assert.equal(run.fx.inspect().activeCount, 0);
      assert.equal(run.fx.inspect().releasingCount, 0);
    } finally { run.fx.dispose(); }
  }
});

test('retained matter supports world-origin reprojection while the source moves independently', () => {
  const run = fixture('arm_rake');
  try {
    beginRecovery(run);
    const mesh = visibleMeshes(run.fx)[0], before = mesh.getWorldPosition(new THREE.Vector3());
    run.fx.rebase(1000, -500);
    run.entity.pos.x -= 1000; run.entity.pos.z += 500;
    run.update();
    const after = mesh.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(after.x - (before.x - 1000)) < 1e-6);
    assert.ok(Math.abs(after.z - (before.z + 500)) < 1e-6);
  } finally { run.fx.dispose(); }
});

test('pool updates keep geometry/buffers stable and disposal leaves shared resources alive', () => {
  const a = fixture('ink_ring'), b = fixture('siphon_jet');
  let sharedDisposed = 0, privateDisposed = 0;
  const resources = getIronKrakenAttackVfxResources();
  const onShared = () => sharedDisposed++;
  for (const geometry of Object.values(resources)) geometry.addEventListener('dispose', onShared);
  const materials = [...a.fx.group.children.map(mesh => mesh.material), a.fx.aperture.material];
  for (const material of materials) material.addEventListener('dispose', () => privateDisposed++);
  try {
    const meshes = [...a.fx.group.children], buffers = Object.values(resources).map(g => g.attributes.position.array);
    const simulation = JSON.stringify([a.entity, a.fight]);
    for (let i = 0; i < 30; i++) a.update();
    assert.deepEqual(a.fx.group.children, meshes);
    for (let i = 0; i < buffers.length; i++) assert.equal(Object.values(resources)[i].attributes.position.array, buffers[i]);
    assert.equal(JSON.stringify([a.entity, a.fight]), simulation);
    a.fx.dispose(); a.fx.dispose();
    assert.equal(privateDisposed, 5); assert.equal(sharedDisposed, 0);
    assert.equal(a.fx.group.parent, null); assert.equal(a.fx.aperture.parent, null);
    assert.equal(a.fx.inspect().disposed, true);
    a.update(); assert.equal(visibleMeshes(a.fx).length, 0);
    b.update(); assert.equal(b.fx.inspect().activeCount, 1);
  } finally {
    for (const geometry of Object.values(resources)) geometry.removeEventListener('dispose', onShared);
    a.fx.dispose(); b.fx.dispose();
  }
});

test('local frame conversion uses the actual origin and permits a reversed locked jet', () => {
  const entity = { pos: { x: 17, z: 32 }, rot: Math.PI / 2 }, out = {};
  const shape = { kind: 'lane', a: { x: 10, z: 40 }, b: { x: -10, z: 40 }, radius: 4 };
  assert.equal(ironKrakenAttackLocalFrame(shape, entity, out), out);
  assert.ok(Math.abs(out.x - 8) < 1e-6); assert.ok(Math.abs(out.z - 7) < 1e-6);
  assert.equal(out.length, 20); assert.equal(out.radius, 4);
  assert.equal(out.yaw, -Math.PI / 2);
});
