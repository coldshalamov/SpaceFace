// Debris / cargo lane — authored fragment families.
//
// The bar these tests hold: four genuinely distinct authored constructions with their own material
// response, solid matter that never becomes a light, bounded pools, a single impacts entry point
// that obeys the unsigned-axis rule, and a collection beat carried by the object rather than by a
// firework thrown around where it used to be.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';

import {
  FRAGMENT_ATLAS_SIZE,
  FRAGMENT_DETAIL,
  FRAGMENT_FAMILY,
  FRAGMENT_FAMILY_LIST,
  FRAGMENT_POOL_CEILING,
  buildFragmentGeometry,
  createFragmentAtlas,
  createFragmentMaterial,
  fragmentBandRect,
  resolveFragmentFamily,
} from '../src/render/vfx/fragmentFamilies.js';
import { QuarksVfxSystem } from '../src/render/vfx/quarksSystem.js';
import { makeImpactRecord, createImpactRecord } from '../src/render/combat/impactEventRecord.js';
import {
  createPickupMotionTracker,
  resolveIntakeAlignment,
  resolveIntakeStretch,
  resolveIntakeYaw,
  TRACTOR_INTAKE_RANGE_WU,
} from '../src/render/pickupMotionPresentation.js';

function signature(geometry) {
  const p = geometry.getAttribute('position').array;
  let h = 0x811c9dc5;
  for (let i = 0; i < p.length; i++) {
    h = Math.imul(h ^ Math.round(p[i] * 4096), 0x01000193) >>> 0;
  }
  return h;
}

function extentOf(geometry) {
  geometry.computeBoundingBox();
  const b = geometry.boundingBox;
  return { x: b.max.x - b.min.x, y: b.max.y - b.min.y, z: b.max.z - b.min.z };
}

// ---------------------------------------------------------------------------------------------
// Authored construction
// ---------------------------------------------------------------------------------------------

test('each family is its own authored construction, not one primitive rescaled', () => {
  const built = FRAGMENT_FAMILY_LIST.map((family) => ({
    family,
    geo: buildFragmentGeometry(family, { detail: FRAGMENT_DETAIL.NEAR }),
  }));

  const signatures = new Set();
  const proportions = [];
  for (const { family, geo } of built) {
    const position = geo.getAttribute('position');
    assert.ok(position.count > 4, family + ' cannot silently render a quad');
    assert.ok(position.array.every(Number.isFinite), family + ' positions must be finite');
    assert.ok(geo.getAttribute('normal').array.every(Number.isFinite), family + ' normals finite');
    assert.ok(geo.getAttribute('uv').array.every(Number.isFinite), family + ' uvs finite');
    const e = extentOf(geo);
    assert.ok(e.x > 0 && e.y > 0 && e.z > 0, family + ' must occupy all three axes');
    signatures.add(signature(geo));
    // A rescale of another family would share these ratios; an authored form does not.
    proportions.push({ family, ratio: [e.y / e.x, e.z / e.x] });
  }
  assert.equal(signatures.size, FRAGMENT_FAMILY_LIST.length, 'no two families share a vertex set');

  for (let i = 0; i < proportions.length; i++) {
    for (let j = i + 1; j < proportions.length; j++) {
      const a = proportions[i];
      const b = proportions[j];
      const same = Math.abs(a.ratio[0] - b.ratio[0]) < 0.02 && Math.abs(a.ratio[1] - b.ratio[1]) < 0.02;
      assert.ok(!same, a.family + ' and ' + b.family + ' must not be the same shape rescaled');
    }
  }

  for (const { geo } of built) geo.dispose();
});

test('authored construction is deterministic across builds', () => {
  for (const family of FRAGMENT_FAMILY_LIST) {
    const a = buildFragmentGeometry(family, { detail: FRAGMENT_DETAIL.NEAR });
    const b = buildFragmentGeometry(family, { detail: FRAGMENT_DETAIL.NEAR });
    assert.equal(signature(a), signature(b), family + ' must build identically every time');
    a.dispose();
    b.dispose();
  }
});

test('every face is UV-mapped inside its own family region of the shared atlas', () => {
  for (const family of FRAGMENT_FAMILY_LIST) {
    for (const detail of [FRAGMENT_DETAIL.NEAR, FRAGMENT_DETAIL.FAR]) {
      const geo = buildFragmentGeometry(family, { detail });
      const uv = geo.getAttribute('uv');
      // Region bounds derived from the family's own bands: nothing may sample a neighbour.
      const bands = ['0', '1', '2'].map((_, i) => fragmentBandRect(family, i));
      const u0 = Math.min(...bands.map((r) => r.u0));
      const u1 = Math.max(...bands.map((r) => r.u1));
      const v0 = Math.min(...bands.map((r) => r.v0));
      const v1 = Math.max(...bands.map((r) => r.v1));
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i);
        const v = uv.getY(i);
        assert.ok(u >= u0 - 1e-6 && u <= u1 + 1e-6, family + '/' + detail + ' u escaped its region');
        assert.ok(v >= v0 - 1e-6 && v <= v1 + 1e-6, family + '/' + detail + ' v escaped its region');
      }
      geo.dispose();
    }
  }
});

test('the far representation sheds detail while keeping silhouette and material identity', () => {
  for (const family of FRAGMENT_FAMILY_LIST) {
    const near = buildFragmentGeometry(family, { detail: FRAGMENT_DETAIL.NEAR });
    const far = buildFragmentGeometry(family, { detail: FRAGMENT_DETAIL.FAR });
    const nearTris = near.getAttribute('position').count / 3;
    const farTris = far.getAttribute('position').count / 3;
    assert.ok(farTris < nearTris, family + ' far must be cheaper than near');
    assert.ok(farTris > 4, family + ' far must still be a solid, not an icon');
    const a = extentOf(near);
    const b = extentOf(far);
    // Silhouette survives: proportions stay within a tenth, so the form is recognisably the same.
    assert.ok(Math.abs(b.x / a.x - 1) < 0.12, family + ' far keeps its width');
    assert.ok(Math.abs(b.z / a.z - 1) < 0.12, family + ' far keeps its length');
    assert.ok(Math.abs(b.y / a.y - 1) < 0.12, family + ' far keeps its thickness');
    near.dispose();
    far.dispose();
  }
});

// ---------------------------------------------------------------------------------------------
// Material identity — rule M1
// ---------------------------------------------------------------------------------------------

test('every family is opaque lit matter with emission disabled, sharing two atlas pages', () => {
  const atlas = createFragmentAtlas();
  assert.equal(atlas.albedo.image.width, FRAGMENT_ATLAS_SIZE);
  assert.equal(atlas.surface.image.width, FRAGMENT_ATLAS_SIZE);

  const materials = FRAGMENT_FAMILY_LIST.map((f) => createFragmentMaterial(f, atlas));
  const roughness = new Set();
  for (const mat of materials) {
    assert.equal(mat.type, 'MeshStandardMaterial', 'solids are scene-lit, never additive');
    assert.equal(mat.transparent, false, 'a fragment is never a ghost');
    assert.equal(mat.depthWrite, true, 'a fragment writes depth like the solid it is');
    assert.equal(mat.blending, THREE.NormalBlending, 'no additive blending on solid matter');
    assert.equal(mat.emissive.getHex(), 0x000000, 'M1: a fragment never emits');
    assert.equal(mat.emissiveIntensity, 0, 'M1: a fragment never emits');
    assert.equal(mat.emissiveMap, null, 'M1: no emissive texture either');
    // One texture pair for the whole class keeps this to a single shader program family.
    assert.equal(mat.map, atlas.albedo);
    assert.equal(mat.roughnessMap, atlas.surface);
    assert.equal(mat.metalnessMap, atlas.surface);
    assert.ok(mat.userData.spacefaceSharedMaterialRole, 'joins an existing shared role');
    roughness.add(mat.roughness);
  }
  // Distinct material response, not four tints of one surface: ice must not answer light like rock.
  assert.equal(roughness.size, FRAGMENT_FAMILY_LIST.length, 'each family has its own finish');

  for (const mat of materials) mat.dispose();
  atlas.dispose();
});

test('material routing sends solid matter to a family and everything else to silence', () => {
  assert.equal(resolveFragmentFamily('hull'), FRAGMENT_FAMILY.METAL);
  assert.equal(resolveFragmentFamily('armor'), FRAGMENT_FAMILY.METAL);
  assert.equal(resolveFragmentFamily('rock'), FRAGMENT_FAMILY.STONE);
  assert.equal(resolveFragmentFamily('ceramic'), FRAGMENT_FAMILY.STONE);
  assert.equal(resolveFragmentFamily('ice'), FRAGMENT_FAMILY.ICE);
  assert.equal(resolveFragmentFamily('cargo'), FRAGMENT_FAMILY.CARGO);
  assert.equal(resolveFragmentFamily('cmdty_ice_water'), FRAGMENT_FAMILY.ICE);
  assert.equal(resolveFragmentFamily('cmdty_ore_iron'), FRAGMENT_FAMILY.STONE);
  assert.equal(resolveFragmentFamily('cmdty_consumer_goods'), FRAGMENT_FAMILY.CARGO);
  // A shield, an energy hit, a missing id: this lane throws no solid matter at all.
  assert.equal(resolveFragmentFamily('shield'), null);
  assert.equal(resolveFragmentFamily('unknown'), null);
  assert.equal(resolveFragmentFamily(null), null);
  assert.equal(resolveFragmentFamily(''), null);
  assert.equal(resolveFragmentFamily(undefined), null);
});

// ---------------------------------------------------------------------------------------------
// Runtime behaviour
// ---------------------------------------------------------------------------------------------

test('idle solid families cost nothing and never emit without a causal burst', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  for (let frame = 0; frame < 40; frame++) quarks.update(0.05);
  for (const name of ['miningEjecta', 'collisionSpall', 'shrapnel', 'iceSpall', 'cargoDebris']) {
    assert.equal(quarks[name].particleNum, 0, name + ' must stay empty while idle');
    assert.equal(quarks[name].emissionOverTime.value, 0, name + ' must have no idle emission');
  }
  quarks.dispose();
});

test('stone events share one batch, so two families of event cost one draw call', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  const mining = quarks.renderer.systemToBatchIndex.get(quarks.miningEjecta);
  const collision = quarks.renderer.systemToBatchIndex.get(quarks.collisionSpall);
  assert.equal(mining, collision, 'mining chips and rock spall are one stone batch');
  assert.equal(
    quarks.miningEjecta.instancingGeometry,
    quarks.collisionSpall.instancingGeometry,
    'shared geometry is what makes the merge possible',
  );
  // Five authored solid systems, four solid batches (stone merged), plus brass.
  const solidBatches = new Set([
    quarks.miningEjecta, quarks.collisionSpall, quarks.shrapnel, quarks.iceSpall,
    quarks.cargoDebris, quarks.casingEjection,
  ].map((s) => quarks.renderer.systemToBatchIndex.get(s)));
  assert.equal(solidBatches.size, 5, 'six solid systems draw through five batches');
  quarks.dispose();
});

test('solid pools are bounded: a flood is truncated, never grown', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  const cases = [
    ['shrapnel', () => quarks.spawnExplosion(0, 0, 0, 400)],
    ['iceSpall', () => quarks.spawnIceSpall(0, 0, 0, 0, 1, 0, 400)],
    ['cargoDebris', () => quarks.spawnCargoDebris(0, 0, 0, 0, 1, 0, 400)],
    ['collisionSpall', () => quarks.spawnCollisionSpall(0, 0, 0, 0, 1, 0, 400)],
    ['miningEjecta', () => quarks.spawnMiningEjecta(0, 0, 0, 0, 1, 0, 400)],
  ];
  for (const [name, fire] of cases) {
    const sys = quarks[name];
    const batch = quarks.renderer.batches[quarks.renderer.systemToBatchIndex.get(sys)];
    const ceiling = batch.maxParticles;
    for (let i = 0; i < 12; i++) fire();
    assert.ok(sys.particleNum <= ceiling, name + ' stayed inside its pool');
    assert.equal(batch.maxParticles, ceiling, name + ' batch never reallocated');
  }
  // Every ceiling is the authored family budget, not the library's 1000-instance default.
  for (const family of FRAGMENT_FAMILY_LIST) {
    assert.ok(FRAGMENT_POOL_CEILING[family] > 0 && FRAGMENT_POOL_CEILING[family] < 1000);
  }
  quarks.dispose();
});

test('ice and cargo fragments stay opaque solids for their whole life and retire unsynchronised', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  quarks.spawnIceSpall(0, 0, 0, 0, 1, 0, 12);
  quarks.spawnCargoDebris(0, 0, 0, 0, 1, 0, 12);
  const deaths = [];
  let previous = quarks.iceSpall.particleNum + quarks.cargoDebris.particleNum;
  assert.ok(previous > 0, 'both families spawned');
  for (let frame = 0; frame < 40; frame++) {
    quarks.update(0.05);
    for (const sys of [quarks.iceSpall, quarks.cargoDebris]) {
      const batch = quarks.renderer.batches[quarks.renderer.systemToBatchIndex.get(sys)];
      assert.equal(batch.material.transparent, false);
      assert.equal(batch.material.depthWrite, true);
      assert.equal(batch.material.blending, THREE.NormalBlending);
      for (let i = 0; i < sys.particleNum; i++) {
        assert.equal(sys.particles[i].color.w, 1, 'retirement never exposes a see-through fragment');
      }
    }
    const live = quarks.iceSpall.particleNum + quarks.cargoDebris.particleNum;
    if (live < previous) deaths.push(frame);
    previous = live;
  }
  assert.equal(previous, 0, 'cosmetic matter retires rather than lingering');
  assert.ok(deaths.length >= 3, 'fragments leave over several frames, not all at once');
  quarks.dispose();
});

test('the distance representation swaps in place without stranding a batch', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  const batchCount = quarks.renderer.batches.length;
  const before = quarks.shrapnel.instancingGeometry.getAttribute('position').count;
  const ceiling = quarks.renderer.batches[quarks.renderer.systemToBatchIndex.get(quarks.shrapnel)].maxParticles;

  assert.equal(quarks.setFragmentDetail(FRAGMENT_DETAIL.FAR), true);
  assert.equal(quarks.setFragmentDetail(FRAGMENT_DETAIL.FAR), false, 'idempotent');

  const after = quarks.shrapnel.instancingGeometry.getAttribute('position').count;
  assert.ok(after < before, 'far representation is cheaper');
  assert.equal(quarks.renderer.batches.length, batchCount, 'no emptied batch was left behind');
  const batch = quarks.renderer.batches[quarks.renderer.systemToBatchIndex.get(quarks.shrapnel)];
  assert.equal(batch.maxParticles, ceiling, 'the pool ceiling survives a detail change');
  assert.equal(batch.geometry.getAttribute('position'), quarks.shrapnel.instancingGeometry.getAttribute('position'));
  assert.equal(
    quarks.renderer.systemToBatchIndex.get(quarks.miningEjecta),
    quarks.renderer.systemToBatchIndex.get(quarks.collisionSpall),
    'the stone merge survives a detail change',
  );

  quarks.spawnExplosion(0, 0, 0, 20);
  quarks.update(0.016);
  assert.ok(quarks.shrapnel.particleNum > 0, 'the family still works after the swap');
  quarks.dispose();
});

// ---------------------------------------------------------------------------------------------
// The impacts-lane contract
// ---------------------------------------------------------------------------------------------

test('emitFromImpact reads the record and emits solid matter for solid materials only', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  const rec = createImpactRecord();

  makeImpactRecord(rec, {
    x: 5, y: 0, z: 9, nx: 0, ny: 0, nz: 1, axisSigned: true,
    severity: 0.8, materialId: 'hull', radiusWU: 3, simTime: 2,
  });
  assert.ok(quarks.emitFromImpact(rec) > 0, 'a hull strike throws metal');
  assert.ok(quarks.shrapnel.particleNum > 0);

  makeImpactRecord(rec, {
    x: 0, y: 0, z: 0, nx: 1, ny: 0, nz: 0, axisSigned: true,
    severity: 0.7, materialId: 'ice', radiusWU: 2, simTime: 3,
  });
  assert.ok(quarks.emitFromImpact(rec) > 0, 'an ice strike throws ice');
  assert.ok(quarks.iceSpall.particleNum > 0);
  assert.equal(quarks.cargoDebris.particleNum, 0, 'ice did not leak into another family');

  // A shield hit belongs to the shield lane; this lane must add nothing to it.
  const before = quarks.shrapnel.particleNum + quarks.iceSpall.particleNum
    + quarks.collisionSpall.particleNum + quarks.cargoDebris.particleNum;
  makeImpactRecord(rec, {
    x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, axisSigned: true,
    severity: 1, materialId: 'shield', radiusWU: 4, simTime: 4,
  });
  assert.equal(quarks.emitFromImpact(rec), 0, 'a shield throws no solid matter');
  const after = quarks.shrapnel.particleNum + quarks.iceSpall.particleNum
    + quarks.collisionSpall.particleNum + quarks.cargoDebris.particleNum;
  assert.equal(after, before);

  quarks.dispose();
});

test('emitFromImpact never fabricates a direction from an unsigned collision axis (E2)', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  const poses = [];
  const realPose = quarks._poseFrom.bind(quarks);
  quarks._poseFrom = (x, y, z, dx, dy, dz) => {
    poses.push([dx, dy, dz]);
    return realPose(x, y, z, dx, dy, dz);
  };

  const signed = createImpactRecord();
  makeImpactRecord(signed, {
    x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, axisSigned: true,
    severity: 0.6, materialId: 'rock', radiusWU: 2, simTime: 1,
  });
  quarks.emitFromImpact(signed);
  assert.equal(poses.length, 1, 'a signed normal has one outward side');
  assert.deepEqual(poses[0], [0, 0, 1]);

  poses.length = 0;
  const unsigned = createImpactRecord();
  makeImpactRecord(unsigned, {
    x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 1, axisSigned: false,
    severity: 0.6, materialId: 'rock', radiusWU: 2, simTime: 1,
  });
  quarks.emitFromImpact(unsigned);
  assert.equal(poses.length, 2, 'an unsigned axis gets two symmetric half-bursts');
  assert.deepEqual(poses[0].map((v) => -v), poses[1], 'the halves are exact opposites');

  quarks.dispose();
});

test('emitFromImpact survives a malformed record without throwing', () => {
  const quarks = new QuarksVfxSystem({ scene: new THREE.Scene() });
  for (const junk of [
    null, undefined, {}, { materialId: 'hull' },
    { materialId: 'hull', severity: Number.NaN, x: Number.NaN },
    { materialId: 42, severity: 5 },
    { materialId: 'hull', severity: 1, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, axisSigned: false },
  ]) {
    assert.doesNotThrow(() => quarks.emitFromImpact(junk));
  }
  quarks.dispose();
});

test('the debris lane subscribes to nothing: the impacts lane owns contact timing', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../src/render/vfx/quarksSystem.js', import.meta.url)), 'utf8',
  );
  assert.ok(!/\bbus\s*\.\s*on\s*\(/.test(source), 'no event bus subscription');
  assert.ok(!/addEventListener\s*\(/.test(source), 'no DOM subscription');
  assert.ok(source.includes('emitFromImpact'), 'the single entry point is present');
});

test('cosmetic fragments never become collectibles or extra bodies', () => {
  const scene = new THREE.Scene();
  const quarks = new QuarksVfxSystem({ scene });
  const children = scene.children.length;
  quarks.spawnCargoDebris(10, 0, 10, 0, 1, 0, 20);
  quarks.spawnExplosion(0, 0, 0, 30, { cargoShare: 0.6 });
  quarks.update(0.016);
  assert.equal(scene.children.length, children, 'no fragment added an object to the world');
  assert.ok(quarks.cargoDebris.particleNum > 0, 'cargo panels did come off the freighter');
  // A cosmetic panel carries no value and no identity a collector could claim.
  for (let i = 0; i < quarks.cargoDebris.particleNum; i++) {
    const p = quarks.cargoDebris.particles[i];
    assert.equal(p.commodityId, undefined);
    assert.equal(p.amount, undefined);
  }
  quarks.dispose();
});

// ---------------------------------------------------------------------------------------------
// Collection: the object arriving
// ---------------------------------------------------------------------------------------------

test('intake alignment is bounded, monotone and absent until the last stretch', () => {
  assert.equal(resolveIntakeAlignment(9999), 0);
  assert.equal(resolveIntakeAlignment(TRACTOR_INTAKE_RANGE_WU), 0);
  assert.equal(resolveIntakeAlignment(Number.NaN), 0);
  assert.equal(resolveIntakeAlignment(0), 1);
  let previous = 0;
  for (let d = TRACTOR_INTAKE_RANGE_WU; d >= 0; d -= 1) {
    const a = resolveIntakeAlignment(d);
    assert.ok(a >= previous - 1e-9, 'alignment hardens as the drop closes');
    assert.ok(a >= 0 && a <= 1, 'alignment bounded');
    previous = a;
  }
});

test('the intake squeezes across the throat and draws out along the approach', () => {
  const idle = resolveIntakeStretch(0);
  assert.equal(idle.transverse, 1);
  assert.equal(idle.along, 1);
  const deep = resolveIntakeStretch(1);
  assert.ok(deep.transverse < 1, 'squeezed across the throat');
  assert.ok(deep.along > 1, 'drawn out along the approach');
  assert.ok(deep.transverse > 0.5 && deep.along < 1.6, 'anisotropy stays believable');
  const out = { transverse: 0, along: 0 };
  assert.equal(resolveIntakeStretch(0.5, out), out, 'out-param reused, no per-frame allocation');
  // The yaw points the body's local +Z at the collector.
  const yaw = resolveIntakeYaw(1, 0);
  assert.ok(Math.abs(Math.sin(yaw) - 1) < 1e-9 && Math.abs(Math.cos(yaw)) < 1e-9);
});

test('a collected drop settles, turns to the scoop and is drawn in, with no firework', () => {
  const tracker = createPickupMotionTracker();
  const player = { pos: { x: 0, z: 0 } };
  const mesh = {
    userData: {},
    children: [],
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(v) { this.x = v; this.y = v; this.z = v; } },
  };

  // Far out: the drop tumbles freely on all three axes.
  const far = { id: 'far-drop', pos: { x: 260, z: 0 } };
  for (let i = 0; i < 30; i++) tracker.updatePickupMotion(far, mesh, i * 0.016, 0.016, player);
  assert.notEqual(mesh.rotation.x, 0, 'free tumble uses pitch');
  assert.notEqual(mesh.rotation.z, 0, 'free tumble uses roll');

  // At the scoop: pitch and roll are handed to the intake and the body faces the collector.
  const close = { id: 'close-drop', pos: { x: 7, z: 0 } };
  const closeMesh = {
    userData: {},
    children: [],
    rotation: { x: 0, y: 0, z: 0 },
    position: { x: 0, y: 0, z: 0 },
    scale: { x: 1, y: 1, z: 1, set(x, y, z) { this.x = x; this.y = y; this.z = z; }, setScalar(v) { this.x = v; this.y = v; this.z = v; } },
  };
  for (let i = 0; i < 90; i++) tracker.updatePickupMotion(close, closeMesh, i * 0.016, 0.016, player);
  assert.ok(Math.abs(closeMesh.rotation.x) < 0.2, 'the chaotic pitch settles into the intake');
  assert.ok(Math.abs(closeMesh.rotation.z) < 0.2, 'the chaotic roll settles into the intake');
  const expectedYaw = resolveIntakeYaw(-7, 0);
  const delta = Math.atan2(Math.sin(closeMesh.rotation.y - expectedYaw), Math.cos(closeMesh.rotation.y - expectedYaw));
  assert.ok(Math.abs(delta) < 0.25, 'the body has turned to face the scoop');
  assert.ok(closeMesh.scale.z > closeMesh.scale.x, 'drawn in lengthwise, not shrunk in place');
  assert.ok(closeMesh.scale.x > 0.1, 'compression never inverts the body');

  tracker.prune(new Set());
});
