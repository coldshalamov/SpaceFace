import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOMB_DEFS, BOMB_IDS, BOMB_DRIFT } from '../src/data/bombs.js';
import { BombPresentationBatch, createBombPresentationPrecompileMesh } from '../src/render/bombPresentation.js';

function bomb(kind = 'bomb_singularity', id = 'salvo-a', born = 0, phase = 'field') {
  return { id, alive: true, type: 'bomb', pos: { x: 1200, z: -300 }, prevPos: { x: 1200, z: -300 },
    vel: { x: 60, z: 20 }, rot: 0.3,
    data: { bombId: kind, phase, spawnedAt: born, fieldStartedAt: born, armed: true } };
}
function world(time = 1) {
  return { mode: 'flight', simTime: time, world: { frameOrigin: { x: 1200, z: -300 } },
    settings: { video: {} }, render: { scene: new THREE.Scene() },
    rng: () => { throw new Error('Presentation must not consume simulation RNG'); } };
}
function positions(batch) { return batch.positions.slice(0, batch.count * 3); }
function surfaces(batch) { return batch.surfaces.slice(0, batch.count * 4); }
function xz(batch) {
  const points = [];
  for (let i = 0; i < batch.count * 3; i += 3) points.push(batch.positions[i], batch.positions[i + 2]);
  return points;
}

test('gravity and tar visibly deform while powered, then freeze exactly with a paused simulation', () => {
  for (const kind of ['bomb_singularity', 'bomb_goo']) {
    const state = world(), entity = bomb(kind), batch = new BombPresentationBatch(state.render.scene);
    batch.update(state, [entity], 1);
    const before = xz(batch);
    state.simTime += 0.25;
    batch.update(state, [entity], 1);
    assert.notDeepEqual(xz(batch), before, `${kind} changes shape, not just opacity`);
    const paused = positions(batch), pausedSurface = surfaces(batch);
    for (let i = 0; i < 4; i++) batch.update(state, [entity], 1);
    assert.deepEqual(positions(batch), paused);
    assert.deepEqual(surfaces(batch), pausedSurface);
    batch.dispose();
  }
});

test('same local deployment age repeats, separate identities vary, and simulation state stays untouched', () => {
  const state = world(), entity = bomb(), batch = new BombPresentationBatch(state.render.scene);
  const before = JSON.stringify(entity);
  batch.update(state, [entity], 1);
  const local = positions(batch), localSurface = surfaces(batch);
  assert.equal(JSON.stringify(entity), before);
  const later = bomb('bomb_singularity', entity.id, 400);
  state.simTime = 401;
  batch.update(state, [later], 1);
  assert.deepEqual(positions(batch), local, 'no session-clock-dependent starting choreography');
  assert.deepEqual(surfaces(batch), localSurface);
  later.id = 'salvo-b';
  batch.update(state, [later], 1);
  assert.notDeepEqual(positions(batch), local, 'stable identity variation is visible in the form');
  batch.dispose();
});

test('field reach remains authoritative through build, decay and reduced flash', () => {
  for (const kind of ['bomb_singularity', 'bomb_goo']) {
    const state = world(), entity = bomb(kind), batch = new BombPresentationBatch(state.render.scene);
    const radius = BOMB_DEFS[kind].radius;
    for (const age of [0, 0.15, 1, 2.6]) {
      state.simTime = age;
      batch.update(state, [entity], 1);
      let furthest = 0;
      for (let i = 0; i < batch.count * 3; i += 3) {
        furthest = Math.max(furthest, Math.hypot(batch.positions[i], batch.positions[i + 2]));
      }
      assert.ok(furthest >= radius - 0.01 && furthest <= radius + 1,
        `${kind}: birth/deformation must not change the indicated force reach`);
    }
    const fullPositions = positions(batch), fullSurface = surfaces(batch);
    state.settings.video.flashReduce = true;
    batch.update(state, [entity], 1);
    assert.deepEqual(positions(batch), fullPositions);
    assert.ok(surfaces(batch).some((v, i) => i % 4 === 1 && v < fullSurface[i]));
    state.simTime = 10;
    batch.update(state, [entity], 1);
    assert.equal(batch.count, 0, 'expired fields leave no live danger indicator');
    batch.dispose();
  }
});

test('every payload has a distinct source silhouette and every source respects reduced motion', () => {
  const signatures = new Set();
  const state = world(), batch = new BombPresentationBatch(state.render.scene);
  for (const kind of BOMB_IDS) {
    const entity = bomb(kind, 'same-salvo', 0, 'drift');
    batch.update(state, [entity], 1);
    signatures.add(JSON.stringify([...positions(batch)]));
    state.settings.video.motionReduce = true;
    batch.update(state, [entity], 1);
    const still = positions(batch), surface = surfaces(batch);
    state.simTime += 0.2;
    batch.update(state, [entity], 1);
    assert.deepEqual(positions(batch), still, kind);
    assert.deepEqual(surfaces(batch), surface, kind);
    state.settings.video.motionReduce = false;
    state.simTime = 1;
  }
  assert.equal(signatures.size, BOMB_IDS.length);
  batch.dispose();
});

test('all 24 gravity fields retain full smooth geometry and a bounded shared parcel batch', () => {
  const state = world(), entity = bomb(), batch = new BombPresentationBatch(state.render.scene);
  batch.update(state, [entity], 1);
  const oneCount = batch.count;
  const list = Array.from({ length: BOMB_DRIFT.maxWorldActive }, (_, id) => bomb('bomb_singularity', id));
  batch.update(state, list, 1);
  assert.equal(batch.count, oneCount * BOMB_DRIFT.maxWorldActive, 'no late-field truncation at capacity');
  assert.equal(batch.stats.drawCalls, 2, 'one surface batch and one mesh-parcel batch');
  assert.ok(batch.stats.particles > 0 && batch.stats.particles <= BOMB_DRIFT.maxWorldActive * 16);
  let peakHeat = 0;
  for (let i = 1; i < batch.count * 4; i += 4) peakHeat = Math.max(peakHeat, batch.surfaces[i]);
  assert.ok(peakHeat > 3, 'working folds carry HDR radiance for the production bloom threshold');
  const cook = createBombPresentationPrecompileMesh();
  assert.equal(cook.material.customProgramCacheKey(), batch.material.customProgramCacheKey());
  assert.deepEqual(Object.keys(cook.geometry.attributes).sort(), Object.keys(batch.geometry.attributes).sort());
  batch.dispose(); cook.geometry.dispose(); cook.material.dispose();
});

const parcels = batch => batch.particles?.system.particles.slice(0, batch.particles.live).map(p => [
  p.position.x, p.position.y, p.position.z, p.age, p.life, p.size.x, p.size.y,
  p.rotation.x, p.rotation.y, p.rotation.z, p.rotation.w, p.color.x, p.color.y, p.color.z, p.color.w,
]) || [];

test('bomb matter follows local age and its live source through pause, rewind and floating origin changes', () => {
  for (const kind of ['bomb_singularity', 'bomb_goo']) {
    const state = world(), entity = bomb(kind), batch = new BombPresentationBatch(state.render.scene);
    try {
      batch.update(state, [entity], 1);
      const first = parcels(batch);
      assert.ok(first.length >= 4 && first.length <= 16);
      assert.equal(batch.particles.system.particles[0].forceFlow[0], kind === 'bomb_goo' ? 9 : 0);
      batch.update(state, [entity], 1);
      assert.deepEqual(parcels(batch), first, 'paused frames never emit extra parcels or move live matter');
      state.simTime += 0.05;
      batch.update(state, [entity], 1);
      assert.notDeepEqual(parcels(batch), first, 'matter moves while the field is working');
      state.simTime = 1;
      batch.update(state, [entity], 1);
      assert.deepEqual(parcels(batch), first, 'rewind reconstructs the same local emission window');
      state.world.frameOrigin.x += 800; state.world.frameOrigin.z -= 250;
      batch.update(state, [entity], 1);
      const shifted = parcels(batch);
      for (let i = 0; i < first.length; i++) {
        assert.ok(Math.abs(shifted[i][0] - (first[i][0] - 800)) < 1e-9);
        assert.ok(Math.abs(shifted[i][2] - (first[i][2] + 250)) < 1e-9);
        shifted[i].slice(3).forEach((v, j) => assert.ok(Math.abs(v - first[i][j + 3]) < 1e-9,
          'rebasing preserves lifecycle and pose up to tangent-subtraction roundoff'));
      }
      entity.pos.x += 13; entity.pos.z -= 7;
      batch.update(state, [entity], 1);
      for (const p of parcels(batch)) assert.ok(Math.hypot(p[0] + 787, p[2] - 243) < BOMB_DEFS[kind].radius,
        'transport stays inside the actual moving field, never a stale source position');
      const bright = parcels(batch);
      state.settings.video.flashReduce = true;
      batch.update(state, [entity], 1);
      for (const [i, p] of parcels(batch).entries()) {
        assert.deepEqual(p.slice(0, 11), bright[i].slice(0, 11));
        assert.ok(p[12] < bright[i][12] * 0.5, 'flash reduction changes heat rather than trajectory or reach');
      }
      state.settings.video.motionReduce = true;
      batch.update(state, [entity], 1);
      assert.equal(batch.particles.live, 0, 'decorative transport retires under reduced motion');
      assert.equal(batch.particles.renderer.visible, false);
      assert.equal(batch.stats.drawCalls, 1, 'the truthful force surface remains');
      state.settings.video.motionReduce = false;
      state.simTime = BOMB_DEFS[kind].field.durationS;
      batch.update(state, [entity], 1);
      assert.equal(batch.particles.live, 0);
      assert.equal(batch.stats.drawCalls, 0);
    } finally { batch.dispose(); }
    assert.equal(state.render.scene.children.length, 0);
  }
});

test('bomb parcels allocate only for fields and repeat by deployment identity instead of session time', () => {
  const state = world(), batch = new BombPresentationBatch(state.render.scene);
  try {
    batch.update(state, [], 1);
    assert.equal(batch.particles, null);
    batch.update(state, [bomb('bomb_frag', 'salvo-a', 0, 'drift')], 1);
    assert.equal(batch.particles, null, 'ordinary drifting ordnance does not acquire field work');
    batch.update(state, [bomb('bomb_goo')], 1);
    const first = parcels(batch), cached = new Set(batch.particles.system.particles);
    state.simTime = 401;
    batch.update(state, [bomb('bomb_goo', 'salvo-a', 400)], 1);
    assert.deepEqual(parcels(batch), first);
    batch.update(state, [bomb('bomb_goo', 'salvo-b', 400)], 1);
    assert.notDeepEqual(parcels(batch), first);
    assert.ok(batch.particles.system.particles.every(p => cached.has(p)), 'frame sampling recycles all native particles');
    batch.update(state, [], 1);
    assert.equal(batch.stats.particles, 0);
    assert.equal(batch.stats.drawCalls, 0);
  } finally { batch.dispose(); }
});

test('source ribbons carry continuous width and length coordinates for filtered material edges', () => {
  const state = world(), batch = new BombPresentationBatch(state.render.scene);
  batch.ribbon(0, 0, 10, 0, 4, 1, 1, 1, 1);
  assert.equal(batch.count, 6);
  for (let i = 0; i < batch.count; i++) {
    const p = i * 3, s = i * 4;
    assert.equal(batch.surfaces[s], -batch.positions[p + 2] / 2,
      'both triangles use the same across coordinate at their shared physical edge');
    assert.equal(batch.surfaces[s + 2], batch.positions[p] / 10,
      'a material can resolve both the source and the end, rather than a constant UV');
  }
  batch.dispose();
});

test('bomb fields build from their source and stop transport during the authored shutdown handoff', () => {
  for (const kind of ['bomb_singularity', 'bomb_goo']) {
    const state = world(0.03), entity = bomb(kind), batch = new BombPresentationBatch(state.render.scene);
    const def = BOMB_DEFS[kind];
    const bodyReach = () => {
      let furthest = 0;
      // Eight six-vertex boundary fragments stay at the exact authoritative radius.
      for (let i = 48 * 3; i < batch.count * 3; i += 3) {
        furthest = Math.max(furthest, Math.hypot(batch.positions[i], batch.positions[i + 2]));
      }
      return furthest;
    };
    batch.update(state, [entity], 1);
    const ignition = bodyReach();
    state.simTime = 1;
    batch.update(state, [entity], 1);
    const working = bodyReach();
    assert.ok(working > ignition * 3, `${kind} physically grows out of its source`);
    const boundary = batch.positions.slice(0, 48 * 3);
    state.simTime = def.field.durationS - 0.22;
    batch.update(state, [entity], 1);
    assert.equal(batch.life.stage, 'release');
    const phases = surfaces(batch).filter((_, i) => i % 4 === 3);
    const heat = surfaces(batch).filter((_, i) => i % 4 === 1);
    const earlierShutdownReach = bodyReach();
    state.simTime += 0.1;
    batch.update(state, [entity], 1);
    assert.deepEqual(surfaces(batch).filter((_, i) => i % 4 === 3), phases,
      'retiring material no longer advertises powered force transport');
    assert.deepEqual(batch.positions.slice(0, 48 * 3), boundary,
      'the still-live force boundary must not shrink with its decorative body');
    assert.ok(surfaces(batch).some((value, i) => i % 4 === 1 && value < heat[(i - 1) / 4]),
      'reaction energy cools before authoritative expiry');
    if (kind === 'bomb_singularity') assert.ok(bodyReach() < earlierShutdownReach,
      'gravity closes into its source as a geometric shutdown, not merely an opacity fade');
    state.simTime = def.field.durationS;
    batch.update(state, [entity], 1);
    assert.equal(batch.count, 0);
    batch.dispose();
  }
});


test('singularity has a deep open channel and goo keeps a connected heavy membrane at maximum occupancy',()=>{
 const state=world(),batch=new BombPresentationBatch(state.render.scene);
 try{
  const section=batch.sectionA;
  batch.sampleSection(section,.45,0,0,100,1,1,.3,0,0);
  // Seven section vertices run from one raised shoulder, down through an exposed
  // cavity, and back up the other side. A flat hump or centreline cannot satisfy this.
  const leftY=section[1],middleY=section[10],rightY=section[19];
  assert.ok(leftY-middleY>15 && rightY-middleY>15);
  let lowX=Infinity,highX=-Infinity,lowZ=Infinity,highZ=-Infinity;
  for(let j=0;j<7;j++){lowX=Math.min(lowX,section[j*3]);highX=Math.max(highX,section[j*3]);lowZ=Math.min(lowZ,section[j*3+2]);highZ=Math.max(highZ,section[j*3+2]);}
  assert.ok(Math.hypot(highX-lowX,highZ-lowZ)>25,'the channel carries substantial width at its working scale');
  const entities=Array.from({length:BOMB_DRIFT.maxWorldActive},(_,i)=>bomb(i%2?'bomb_goo':'bomb_singularity',i));
  batch.update(state,entities,1);
  assert.equal(batch.stats.bombs,BOMB_DRIFT.maxWorldActive);
  assert.equal(batch.stats.overflow,0);
  assert.ok(positions(batch).every(Number.isFinite));
  assert.ok(batch.count<=batch.positions.length/3);
 }finally{batch.dispose();}
});
