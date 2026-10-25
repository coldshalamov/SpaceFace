import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  VFX_EVENT_TRIANGLES,
  createVfxEventGeometry,
} from '../src/render/vfx/runtime/eventGeometry.js';
import {
  advancesFieldBodyOrdinal,
  rewriteFieldDescriptor,
} from '../src/render/vfx/runtime/forceRecipe.js';
import { SweptSurfaceBatch } from '../src/render/forceLanguage/sweptSurfaceBatch.js';
import { createTransientVfxMaterial } from '../src/render/combat/transientVfxMaterials.js';
import { ExplosionRupture } from '../src/render/combat/explosionRupture.js';
import { ForceParticleFlow } from '../src/render/vfx/forceParticleFlow.js';

function wellBody() {
  const values = new Float32Array(36);
  values[0] = 30; values[2] = -25; values[3] = 0;
  values[4] = 0; values[5] = 0; values[6] = 1.55; values[7] = 160; values[8] = 15;
  values[9] = 8; values[10] = 5; values[12] = 0.3; values[13] = 0.7; values[14] = 1;
  values[15] = 0.88; values[16] = 1; values[17] = 0.2; values[18] = 0; values[19] = 0;
  values[20] = 1; values[21] = 1; values[22] = 1; values[23] = 190;
  values[24] = 0; values[25] = 0.7; values[26] = -1; values[27] = 0.86;
  values[28] = 2; values[29] = 0; values[30] = 0.2; values[31] = 1.22;
  values[32] = 30; values[33] = -25; values[34] = 0.2; values[35] = 1;
  return values;
}

test('the shared event carrier spends its triangle budget on closed volumes', () => {
  const geometry = createVfxEventGeometry();
  assert.equal(geometry.userData.triangleBudget, VFX_EVENT_TRIANGLES);
  assert.equal(geometry.getAttribute('aEventSection').count, geometry.getAttribute('position').count);
  assert.ok(geometry.getIndex().count / 3 <= 768, 'the carrier does not grow the old sheet cost');
  assert.equal(geometry.userData.spacefaceTransientTechnique, 'closed-folded-event-volumes');
  geometry.dispose();
});

test('the field picture compiler layers segmented working bands and quiets the perimeter', () => {
  const source = wellBody();
  const out = new Float32Array(36);
  const first = rewriteFieldDescriptor(source, 0, out);
  assert.ok(first.every(Number.isFinite));
  assert.ok(first[6] - first[5] < 1.05, 'the long spiral cloth becomes a segmented band');
  assert.ok(first[7] > first[8], 'the band carries material inward');
  assert.ok(first[9] >= 1.4, 'the working channel keeps a substantial width');
  assert.equal(first[18], 1, 'the band keeps radial transport');

  const boundary = new Float32Array(source);
  boundary[29] = 1;
  const quiet = rewriteFieldDescriptor(boundary, 0, new Float32Array(36));
  assert.ok(quiet[15] < boundary[15], 'the measured perimeter is quieter than the body');

  const seed = new Float32Array(source);
  seed[28] = 1;
  const untouched = rewriteFieldDescriptor(seed, 0, new Float32Array(36));
  assert.deepEqual(Array.from(untouched), Array.from(seed), 'Seed keeps its authored constraint geometry');

  assert.equal(advancesFieldBodyOrdinal(source), true);
  assert.equal(advancesFieldBodyOrdinal(seed), false);
});

test('only the deployed field owner compiles its picture; other matter keeps its descriptors', () => {
  const field = new SweptSurfaceBatch(null, { capacity: 2, name: 'SF_FieldForceLanguage', fieldVolume: true });
  const matter = new SweptSurfaceBatch(null, { capacity: 2, name: 'SF_ActionAnswers', fieldVolume: true });
  const source = wellBody();
  field.begin();
  matter.begin();
  field.add(source);
  matter.add(source);
  field.end();
  matter.end();
  assert.notDeepEqual(Array.from(field.attributes[1].array.slice(0, 4)), Array.from(source.slice(4, 8)));
  assert.deepEqual(Array.from(matter.attributes[1].array.slice(0, 4)), Array.from(source.slice(4, 8)));
  field.dispose();
  matter.dispose();
});

test('transient buckets use closed event volumes while smoke keeps its density film', () => {
  const glow = createTransientVfxMaterial('glow', 1.7);
  const ring = createTransientVfxMaterial('ring', 1.45);
  const smoke = createTransientVfxMaterial('smoke', 1, new THREE.Data3DTexture(new Uint8Array(8), 2, 2, 2));
  assert.equal(glow.userData.spacefaceTransientTechnique, 'closed-folded-event-volumes');
  assert.equal(glow.uniforms.uEventKind.value, 2);
  assert.equal(ring.uniforms.uEventKind.value, 4);
  assert.equal(smoke.userData.spacefaceTransientTechnique, 'baked-density-film');
  assert.ok(smoke.uniforms.uDensityFilm);
  glow.dispose();
  ring.dispose();
  smoke.dispose();
});

test('affected bodies receive body-local aura parcels and a real contact light', () => {
  const flow = new ForceParticleFlow(null, { capacity: 12 });
  const environment = {
    count: 1,
    records: [{ x: 4, z: 2, radius: 6, strength: 1, vx: 0, vz: 0, material: 0 }],
  };
  const emitted = flow.emit({
    kind: 'well', x: 0, z: 0, radius: 60, count: 6, life: 0.6, environment,
  });
  assert.ok(emitted > 0);
  const aura = flow.inspect().aura;
  assert.ok(aura > 0, 'a third of the parcels become body-local aura motes');
  assert.equal(flow.contactLight.active, true, 'the aura requests a real pooled contact light');
  assert.ok(flow.contactLight.range >= 56);
  assert.ok(flow.contactLight.intensity > 3);
  flow.dispose();
});

test('destruction publishes the same closed carrier through its existing instance contract', () => {
  const scene = new THREE.Scene();
  const owner = new ExplosionRupture(scene, { capacity: 4 });
  owner.emitPhase('rupture', {
    serial: 3, classId: 'ordinary', radius: 14, sourceType: 'ship', cause: 'generic',
    x: 0, z: 0, dirX: 1, dirZ: 0, targetVelocityX: 0, targetVelocityZ: 0,
  });
  owner.update(0.12);
  assert.equal(owner.mesh.geometry.userData.spacefaceTransientTechnique, 'closed-folded-event-volumes');
  assert.ok(owner.mesh.geometry.instanceCount > 0);
  assert.equal(owner.mesh.geometry.getAttribute('aEventSection').count > 0, true);
  owner.dispose();
  assert.equal(scene.children.length, 0);
});
