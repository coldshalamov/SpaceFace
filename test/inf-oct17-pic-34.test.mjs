// PIC-34 — a returning nemesis hull wears the scars from its last defeat.
// Seed 4242. The rival that was driven off comes back on a new hull carrying that
// defeat's scar set, and the living-hull presentation resolves one mark per scar.
// A departure that is not a defeat leaves the next hull clean.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { livingHullScars, livingHullWithScar } from '../src/core/livingHull.js';
import { createLivingHullPresentation } from '../src/render/livingHullPresentation.js';
import { boot } from '../scripts/nemesis/harness.mjs';

const SEED = 4242;

function hullHit(t, boss, dx, dz, hullDamage) {
  t.bus.emit('combat:damage', {
    targetId: boss.id,
    attackerId: t.state.playerId,
    hullDamage,
    armorDamage: 0,
    isPlayer: false,
    before: { hullMax: 100, armorMax: 40 },
    pos: { x: boss.pos.x + dx, z: boss.pos.z + dz },
  });
}

function markPose(mesh, index) {
  const matrix = new THREE.Matrix4();
  mesh.getMatrixAt(index, matrix);
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  matrix.decompose(position, quaternion, scale);
  return { position, scale };
}

function present(record) {
  const controller = createLivingHullPresentation();
  const root = new THREE.Group();
  root.userData.authoredAssetState = 'authored';
  controller.attach(root);
  controller.sync(record, 10, { id: 7, radius: 12, bank: 0, pitch: 0 });
  const mesh = controller.root.getObjectByName('LivingHull_HeatScorch');
  return { controller, mesh };
}

test('PIC-34: seed 4242 defeat scars resolve as marks, and a scar-free hull stays quiet', () => {
  let hull = livingHullWithScar(null, {
    id: 'weapon:8:bow', cause: 'weapon', surface: 'weapon', band: 'crushing', facing: 'bow', tick: 8,
  }, 8);
  hull = livingHullWithScar(hull, {
    id: 'weapon:48:stern', cause: 'weapon', surface: 'weapon', band: 'hard', facing: 'stern', tick: 48,
  }, 48);
  const scars = livingHullScars(hull);
  assert.deepEqual(scars.map((scar) => scar.facing), ['bow', 'stern']);

  const shown = present(hull);
  try {
    assert.equal(shown.mesh.count, scars.length, 'one resolved mark per scar from the defeat set');
    assert.equal(shown.controller.diagnostics().visible, true, 'the scarred hull is wearing the marks');
    const bow = markPose(shown.mesh, 0);
    const stern = markPose(shown.mesh, 1);
    assert.ok(bow.position.z > stern.position.z, 'the bow scar sits forward of the stern scar');
    assert.ok(bow.scale.x > stern.scale.x, 'a crushing scar reads larger than a hard scar');
    const version = shown.mesh.instanceMatrix.version;
    assert.equal(shown.controller.sync(hull, 10, { id: 7, radius: 12, bank: 0, pitch: 0 }), false);
    assert.equal(shown.mesh.instanceMatrix.version, version, 'a steady scar set does not reupload marks');
  } finally {
    shown.controller.dispose();
  }

  const quiet = present({ killTally: 0, repairPatches: 0, heatScorch: 1, lastWashAtT: 0, graffitiLine: null });
  try {
    assert.equal(quiet.mesh.count, 1, 'heat scorch without a scar set does not invent defeat marks');
    const heat = markPose(quiet.mesh, 0);
    assert.ok(heat.position.x < -0.3, 'the authored heat mark stays where it was');
    const empty = present(null);
    try {
      assert.equal(empty.mesh.count, 0, 'a hull with no history draws no scar marks');
      assert.equal(empty.controller.diagnostics().visible, false);
    } finally {
      empty.controller.dispose();
    }
  } finally {
    quiet.controller.dispose();
  }
});

test('PIC-34: seed 4242 a nemesis re-spawn carries the retained defeat scar set onto the new hull', () => {
  const t = boot({ seed: SEED });
  try {
    assert.equal(t.state.meta.seed, SEED);
    const first = t.start();
    const boss = t.state.entities.get(first.bossId);
    hullHit(t, boss, 12, 0, 0);
    assert.equal(boss.data.livingHull, undefined, 'a shield hit leaves no scar');
    hullHit(t, boss, 12, 0, 22);
    hullHit(t, boss, 12, 0, 22);
    let worn = livingHullScars(boss.data.livingHull);
    assert.equal(worn.length, 1, 'the same blow does not file twice');
    assert.equal(worn[0].facing, 'bow');
    assert.equal(worn[0].band, 'crushing');
    t.advance(0.6);
    hullHit(t, boss, -12, 0, 8);
    worn = livingHullScars(boss.data.livingHull);
    assert.deepEqual(worn.map((scar) => [scar.facing, scar.band]), [
      ['bow', 'crushing'],
      ['stern', 'hard'],
    ]);

    t.escape();
    const record = t.state.nemesis.defeatRecord;
    assert.ok(record, 'the defeat keeps a scar record');
    assert.deepEqual(record.scars.map((scar) => [scar.facing, scar.band]), [
      ['bow', 'crushing'],
      ['stern', 'hard'],
    ]);
    const saved = t.engine.serialize();
    t.engine.deserialize(saved);
    assert.deepEqual(t.state.nemesis.defeatRecord.scars.map((scar) => scar.facing), ['bow', 'stern']);

    t.until(() => t.state.nemesis.active, 450);
    const next = t.state.nemesis.active;
    assert.notEqual(next.bossId, first.bossId, 'the return is a new hull');
    const returned = t.state.entities.get(next.bossId);
    const carried = livingHullScars(returned.data && returned.data.livingHull);
    assert.deepEqual(carried.map((scar) => [scar.id, scar.facing, scar.band]), worn.map((scar) => [scar.id, scar.facing, scar.band]),
      'the new hull wears the retained scar set from the defeat record');

    const shown = present(returned.data.livingHull);
    try {
      assert.equal(shown.mesh.count, carried.length, 'the returned hull resolves one mark per retained scar');
      const bow = markPose(shown.mesh, 0);
      const stern = markPose(shown.mesh, 1);
      assert.ok(bow.position.z > stern.position.z);
    } finally {
      shown.controller.dispose();
    }
  } finally {
    t.destroy();
  }
});

test('PIC-34: seed 4242 a return that is not a defeat does not wear scars', () => {
  const t = boot({ seed: SEED });
  try {
    const first = t.start();
    const boss = t.state.entities.get(first.bossId);
    hullHit(t, boss, 12, 0, 22);
    assert.equal(livingHullScars(boss.data.livingHull).length, 1, 'the live hull did take a scar');
    t.leave();
    assert.equal(t.state.nemesis.defeatRecord, undefined, 'leaving is not a defeat record');
    t.until(() => t.state.nemesis.active, 450);
    const returned = t.state.entities.get(t.state.nemesis.active.bossId);
    assert.notEqual(returned.id, first.bossId);
    assert.equal(returned.data.livingHull, undefined, 'the next hull does not inherit a fight the rival did not lose');
    const shown = present(returned.data.livingHull);
    try {
      assert.equal(shown.mesh.count, 0);
    } finally {
      shown.controller.dispose();
    }
  } finally {
    t.destroy();
  }
});
