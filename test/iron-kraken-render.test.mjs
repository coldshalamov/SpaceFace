import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IRON_KRAKEN_PROFILES } from '../src/data/ironKraken.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { createCapitalBossFight, stepCapitalBossFight } from '../src/combat/capitalBossScore.js';
import { createIronKrakenVisual, ironKrakenAnimationPose } from '../src/render/ironKrakenVisuals.js';
import { entityVisualCullRadius } from '../src/render/visualCullRadius.js';

let serial = 0;
function runFor(variant = 'heavy') {
  const p = IRON_KRAKEN_PROFILES[variant], id = `render-test-${++serial}`, fightId = `test:${id}`;
  const entity = { id, type: 'ship', alive: true, rot: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: p.coreRadius, visualRadius: p.armReach, hull: p.hull, hullMax: p.hull,
    data: { shipId: 'ship_bastion', lootTableId: p.enemyId, enemyTypeId: p.enemyId,
      ironKraken: { variant: p.variant, scale: p.scale, fightId } } };
  const target = { id: `${id}:target`, alive: true, hull: 140, hullMax: 140,
    radius: 14, pos: { x: p.armReach * 1.2, z: 0 } };
  const fight = createCapitalBossFight({ encounterId: p.scoreId, fightId, bossId: id, targetId: target.id });
  const state = { simTime: 0, entities: new Map([[id, entity], [target.id, target]]),
    capitalBossEncounters: { version: 1, fights: { [fightId]: fight }, orders: {} } };
  return { p, entity, target, fight, state, tick: -1, recovery: null,
    score: requireCapitalBossEncounter(p.scoreId).score };
}

function reach(run, beatId, phase, progress = 0.5) {
  for (let attempts = 0; attempts < 6000; attempts++) {
    run.tick++;
    run.state.simTime = run.tick / 60;
    const facts = stepCapitalBossFight(run.fight, { tick: run.tick, simTime: run.state.simTime,
      boss: run.entity, target: run.target, active: true });
    for (const fact of facts) if (fact.type === 'recovery') {
      run.recovery = { beatId: fact.beatId, start: run.fight.clock - 1, duration: fact.durationTicks };
    }
    const f = run.fight;
    if (f.phase !== phase) continue;
    if (!beatId && phase === 'intro' && f.clock >= run.score.introTicks * progress) return run;
    const beat = run.score.beats.find(item => item.id === beatId);
    if (phase === 'recovery' && run.recovery?.beatId === beatId
      && f.clock - run.recovery.start >= run.recovery.duration * progress) return run;
    if (f.cast?.beatId !== beatId) continue;
    const age = f.clock - f.cast.startedAt - (phase === 'active' ? beat.tellTicks : 0);
    if (age >= (phase === 'active' ? beat.activeTicks : beat.tellTicks) * progress) return run;
  }
  throw new Error(`Unreachable native score pose: ${beatId}/${phase}`);
}

function update(root, run, a11y = {}) {
  root.userData.updateAuthoredMotion(run.entity, run.state.simTime, a11y, run.state);
  root.updateMatrixWorld(true);
}

function resources(root) {
  const geometry = new Set(), shared = new Set(), privateMaterials = new Set(), matrices = new Set();
  root.traverse(node => {
    if (node.geometry) geometry.add(node.geometry);
    for (const m of Array.isArray(node.material) ? node.material : node.material ? [node.material] : []) {
      (m.userData.spacefaceSharedAsset ? shared : privateMaterials).add(m);
    }
    if (node.isInstancedMesh) matrices.add(node.instanceMatrix);
  });
  return { geometry, shared, privateMaterials, matrices };
}

function poseSnapshot(root) {
  const values = [];
  root.updateMatrixWorld(true);
  root.traverse(node => {
    values.push(...node.matrix.elements);
    if (node.isInstancedMesh) values.push(...node.instanceMatrix.array);
  });
  return values;
}

function visibleBounds(root) {
  const box = new THREE.Box3(), part = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverseVisible(node => {
    if (!node.geometry) return;
    if (node.isInstancedMesh) {
      node.computeBoundingBox();
      part.copy(node.boundingBox);
    } else {
      if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
      part.copy(node.geometry.boundingBox);
    }
    box.union(part.applyMatrix4(node.matrixWorld));
  });
  return box;
}

test('the articulated builder rejects a generic ship identity', () => {
  assert.throws(() => createIronKrakenVisual({ id: 1, type: 'ship', data: { shipId: 'ship_bastion' } }), /Iron Kraken/);
});

test('heavy and colossus share reusable geometry while retaining private poses and emission', () => {
  const a = createIronKrakenVisual(runFor('heavy').entity);
  const b = createIronKrakenVisual(runFor('colossus').entity);
  const ar = resources(a), br = resources(b);
  let sharedDisposals = 0, privateDisposals = 0;
  const sharedListeners = [...ar.geometry, ...ar.shared];
  const onShared = () => sharedDisposals++;
  for (const resource of sharedListeners) resource.addEventListener('dispose', onShared);
  for (const resource of ar.privateMaterials) resource.addEventListener('dispose', () => privateDisposals++);
  try {
    assert.ok([...ar.geometry].every(item => item.userData.spacefaceSharedAsset && br.geometry.has(item)));
    assert.ok([...ar.shared].every(item => br.shared.has(item)));
    assert.ok([...ar.privateMaterials].every(item => !br.privateMaterials.has(item)));
    assert.ok([...ar.matrices].every(item => !br.matrices.has(item)));
    assert.notEqual(a.userData.ironKrakenRig.points, b.userData.ironKrakenRig.points);
    a.userData.disposeIronKraken();
    assert.equal(sharedDisposals, 0, 'one teardown must not free another character’s shapes or palette');
    assert.equal(privateDisposals, ar.privateMaterials.size, 'private light response and jet materials must be released');
    assert.equal(a.userData.updateAuthoredMotion, undefined, 'disposed model must release its animation callback');
    b.userData.disposeIronKraken();
  } finally {
    for (const resource of sharedListeners) resource.removeEventListener('dispose', onShared);
    a.userData.disposeIronKraken(); b.userData.disposeIronKraken();
  }
});

test('the real fight clock drives jet, recovery and reduced-motion pose without writing simulation', () => {
  const jet = reach(runFor(), 'siphon_jet', 'active');
  const recovery = reach(runFor(), 'siphon_jet', 'recovery');
  const before = JSON.stringify([jet.fight, recovery.fight]);
  const out = {};
  assert.equal(ironKrakenAnimationPose(jet.fight, 9999, {}, out), out);
  assert.equal(out.jetActive, true);
  assert.equal(out.time, jet.fight.clock / 60, 'fight time must win over arbitrary presentation wall time');
  assert.equal(out.mantle, 0);
  ironKrakenAnimationPose(recovery.fight, 9999, { reducedMotion: true, reducedFlash: true }, out);
  assert.equal(out.jetActive, false);
  assert.ok(out.aperture > 0, 'the frontal recovery aperture must remain visible with reduced motion');
  assert.equal(out.mantle, 0, 'a jet vents the front throat without arbitrarily disassembling its crown');
  assert.equal(out.reducedMotion, true);
  assert.equal(out.reducedFlash, true);
  assert.equal(JSON.stringify([jet.fight, recovery.fight]), before);
});

test('pause holds all articulated matrices and lazily reveals the shallow recovery pump', () => {
  const run = runFor();
  const root = createIronKrakenVisual(run.entity);
  try {
    assert.equal(root.userData.ironKrakenRig.interior, null, 'living idle model must not preload a hidden interior');
    reach(run, 'ink_ring', 'recovery', 0.4);
    const simulation = JSON.stringify(run.fight);
    update(root, run);
    assert.ok(root.userData.ironKrakenRig.interior?.visible);
    const before = poseSnapshot(root);
    for (let i = 0; i < 12; i++) update(root, run);
    assert.deepEqual(poseSnapshot(root), before);
    assert.equal(JSON.stringify(run.fight), simulation);
    update(root, run, { reducedMotion: true, reducedFlash: true });
    const reduced = poseSnapshot(root);
    update(root, run, { reducedMotion: true, reducedFlash: true });
    assert.deepEqual(poseSnapshot(root), reduced);
    assert.ok(reduced.every(Number.isFinite));
  } finally { root.userData.disposeIronKraken(); }
});

for (const variant of ['heavy', 'colossus']) {
  test(`${variant} warning and recovery poses stay finite and inside the authored cull envelope`, () => {
    for (const [beat, phase] of [[null, 'intro'], ['arm_rake', 'tell'], ['siphon_jet', 'active'],
      ['siphon_jet', 'recovery'], ['ink_ring', 'active']]) {
      const run = reach(runFor(variant), beat, phase);
      const root = createIronKrakenVisual(run.entity);
      try {
        update(root, run);
        assert.ok(poseSnapshot(root).every(Number.isFinite), `${beat}/${phase} has a non-finite transform`);
        const box = visibleBounds(root);
        assert.ok(!box.isEmpty(), 'real pose must have visible geometry');
        const radius = entityVisualCullRadius(run.entity, root);
        const actual = Math.max(...[box.min.x, box.max.x].flatMap(x => [box.min.z, box.max.z].map(z => Math.hypot(x, z))));
        assert.ok(radius + 0.1 >= actual, `${beat}/${phase}: cull radius ${radius.toFixed(2)} is below visible extent ${actual.toFixed(2)}`);
      } finally { root.userData.disposeIronKraken(); }
    }
  });
}

test('a detached mantle plate disappears on the same side as its physical attachment', () => {
  for (const plate of requireCapitalBossEncounter(IRON_KRAKEN_PROFILES.heavy.scoreId).plates) {
    const run = reach(runFor(), 'arm_rake', 'recovery');
    run.fight.plates.find(p => p.id === plate.id).attached = false;
    const root = createIronKrakenVisual(run.entity);
    try {
      update(root, run);
      const shell = root.userData.ironKrakenRig.shell, matrix = new THREE.Matrix4();
      const anchorAngle = Math.atan2(plate.anchor.z, plate.anchor.x);
      const expected = (Math.round(anchorAngle / (Math.PI * 2) * shell.count) + shell.count) % shell.count;
      for (let i = 0; i < shell.count; i++) {
        shell.getMatrixAt(i, matrix);
        assert.equal(Math.abs(matrix.determinant()) < 1e-8, i === expected,
          `${plate.id} must remove its own visible petal, not the opposite side`);
      }
    } finally { root.userData.disposeIronKraken(); }
  }
});

test('production direct authored mounting preserves the articulated rig and admission', async () => {
  const { createVisualFactory } = await import('../src/render/visualFactory.js');
  const { installVisualOverrides } = await import('../src/render/visualOverrides.js');
  const { wrapShipWithAuthoredParts } = await import('../src/render/partsLibrary.js');
  const factory = createVisualFactory();
  installVisualOverrides(factory, { directAuthoredMount: true, authoredShips: true });
  const run = runFor();
  const root = factory.build(run.entity);
  try {
    assert.ok(root.userData.ironKrakenRig, 'the direct mount must not return an empty generic ship admission substrate');
    assert.equal(run.entity.presentationAdmission, 'ready');
    assert.equal(typeof root.userData.updateAuthoredMotion, 'function');
    assert.equal(root.userData.requestAuthoredUpgrade, undefined);
    assert.equal(wrapShipWithAuthoredParts(run.entity, root), root, 'fleet/preview wrapping must preserve the same primary asset');
  } finally { root?.userData.disposeIronKraken?.(); }
});

test('restoring an earlier fight discards future attack blends and same-clock plate tears apply immediately', () => {
  const run=reach(runFor(),'siphon_jet','active',.6),root=createIronKrakenVisual(run.entity);
  let fresh;
  try {
    update(root,run);
    assert.ok(root.userData.ironKrakenRig.body.rotation.z<-.9);
    Object.assign(run.fight,{clock:0,phase:'intro',cast:null,recovery:null,nextAt:120});run.state.simTime=0;
    update(root,run);
    fresh=createIronKrakenVisual(run.entity);update(fresh,run);
    assert.deepEqual(Array.from(root.userData.ironKrakenRig.armor.instanceMatrix.array),
      Array.from(fresh.userData.ironKrakenRig.armor.instanceMatrix.array));
    assert.equal(root.userData.ironKrakenRig.body.rotation.z,fresh.userData.ironKrakenRig.body.rotation.z);
    run.fight.plates.find(p=>p.id==='mantle_port').attached=false;
    update(root,run);
    const matrix=new THREE.Matrix4();root.userData.ironKrakenRig.shell.getMatrixAt(6,matrix);
    assert.ok(Math.abs(matrix.determinant())<1e-8,'same-clock receipt removes its attached panel');
    assert.equal(root.userData.ironKrakenRig.attackVfx.inspect().activeCount,0);
  } finally {root.userData.disposeIronKraken();fresh?.userData.disposeIronKraken();}
});

test('committed fields stay fixed while the presented body interpolates and the render origin changes', () => {
  const run=reach(runFor(),'siphon_jet','active',.4),root=createIronKrakenVisual(run.entity);
  const scene=new THREE.Scene();scene.add(root);
  const origin={x:100000,z:-50000};run.state.render={scene};run.state.world={frameOrigin:origin};
  run.entity.pos={x:35,z:12};run.entity.rot=.30;
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  const shape=run.fight.cast.shapes[0];
  try {
    for(const [x,z,heading] of [[30,9,.20],[32,10,.24],[34,11,.28]]) {
      root.position.set(x-origin.x,0,z-origin.z);root.rotation.y=-heading;
      update(root,run);
      const field=root.userData.ironKrakenRig.attackVfx.group.children.find(part=>part.visible);
      assert.ok(field,'the actual live cast has a field');
      a.set(0,0,0).applyMatrix4(field.matrixWorld);b.set(1,0,0).applyMatrix4(field.matrixWorld);
      assert.ok(Math.hypot(a.x+origin.x-shape.a.x,a.z+origin.z-shape.a.z)<1e-7);
      assert.ok(Math.hypot(b.x+origin.x-shape.b.x,b.z+origin.z-shape.b.z)<1e-7);
    }
    origin.x+=8192;origin.z-=4096;root.position.x-=8192;root.position.z+=4096;
    update(root,run);
    const field=root.userData.ironKrakenRig.attackVfx.group.children.find(part=>part.visible);
    a.set(0,0,0).applyMatrix4(field.matrixWorld);
    assert.ok(Math.hypot(a.x+origin.x-shape.a.x,a.z+origin.z-shape.a.z)<1e-7);
  } finally {root.userData.disposeIronKraken();}
});

test('hydraulic bridges remain attached to both adjacent sleeve ends across bent and streaming poses', () => {
  const run=runFor(),root=createIronKrakenVisual(run.entity),matrix=new THREE.Matrix4();
  const a=new THREE.Vector3(),b=new THREE.Vector3(),expected=new THREE.Vector3();
  try {
    for(const [beat,phase] of [[null,'intro'],['arm_rake','active'],['siphon_jet','active'],['ink_ring','recovery']]) {
      reach(run,beat,phase,.5);update(root,run);
      const rig=root.userData.ironKrakenRig;
      for(let arm=0;arm<8;arm++)for(let link=0;link<22;link++) {
        const point=arm*23*3+link*3,frame=arm*22*9+link*9;
        const p=rig.points,f=rig.frames;
        const length=Math.hypot(p[point+3]-p[point],p[point+4]-p[point+1],p[point+5]-p[point+2]);
        const gap=length*(link<4?.14:.10);
        expected.set(p[point]+f[frame+3]*gap,p[point+1]+f[frame+4]*gap,p[point+2]+f[frame+5]*gap);
        rig.joints.getMatrixAt(arm*22+link,matrix);
        b.set(0,.5,0).applyMatrix4(matrix);
        assert.ok(b.distanceTo(expected)<.016,'outgoing rod enters the sleeve instead of hanging beside it');
        if(link>0) {
          const prev=point-3,plen=Math.hypot(p[point]-p[prev],p[point+1]-p[prev+1],p[point+2]-p[prev+2]);
          const proportion=link-1<4?.14:.10;
          expected.set(p[point]-(p[point]-p[prev])*proportion,
            p[point+1]-(p[point+1]-p[prev+1])*proportion,p[point+2]-(p[point+2]-p[prev+2])*proportion);
          assert.ok(plen>0);a.set(0,-.5,0).applyMatrix4(matrix);
          assert.ok(a.distanceTo(expected)<.016,'incoming rod remains seated as the elbow changes angle');
        }
      }
      if(rig.capSpindle.visible)assert.ok(Math.abs(rig.capSpindle.position.y+rig.capSpindle.scale.y*.5-rig.crown.position.y)<1e-8);
    }
  } finally {root.userData.disposeIronKraken();}
});
