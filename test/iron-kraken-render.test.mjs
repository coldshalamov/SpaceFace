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
  assert.ok(out.mantle > 0, 'the recovery aperture must remain visible with reduced motion');
  assert.equal(out.reducedMotion, true);
  assert.equal(out.reducedFlash, true);
  assert.equal(JSON.stringify([jet.fight, recovery.fight]), before);
});

test('pause holds all articulated matrices and lazily reveals the shallow recovery pump', () => {
  const run = runFor();
  const root = createIronKrakenVisual(run.entity);
  try {
    assert.equal(root.userData.ironKrakenRig.interior, null, 'living idle model must not preload a hidden interior');
    reach(run, 'siphon_jet', 'recovery', 0.4);
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
