import assert from 'node:assert/strict';
import test from 'node:test';

import {
  COMMON_ROCK_MATERIAL_ROLES,
  COMMON_ROCK_UV_TRANSFORMS,
  COMMON_ROCK_VARIANTS,
  displacementScalar,
  geologyLatticeHash,
  macroTone,
  sampleGeology,
  silhouetteRadius,
  surfaceResponse,
} from '../src/render/objectSpaceGeology.js';

test('five common-rock buckets have deterministic structural identities', () => {
  assert.equal(COMMON_ROCK_VARIANTS.length, 5);
  const hashes = COMMON_ROCK_VARIANTS.map((_, index) => geologyLatticeHash(index));
  assert.equal(new Set(hashes).size, 5, 'variants must differ in geometry fields, not only tint');
  assert.deepEqual(hashes, COMMON_ROCK_VARIANTS.map((_, index) => geologyLatticeHash(index)));
});

test('each common-rock bucket carries a distinct attached microtexture orientation', () => {
  assert.equal(COMMON_ROCK_UV_TRANSFORMS.length, COMMON_ROCK_VARIANTS.length);
  const fingerprints = COMMON_ROCK_UV_TRANSFORMS.map((transform) => JSON.stringify(transform));
  assert.equal(new Set(fingerprints).size, COMMON_ROCK_VARIANTS.length);
  for (const transform of COMMON_ROCK_UV_TRANSFORMS) {
    assert.equal(transform.scale.length, 2);
    assert(transform.scale.every((value) => Number.isFinite(value) && value >= 0.5 && value <= 1.75));
    assert(Number.isFinite(transform.rotation) && Math.abs(transform.rotation) < Math.PI);
    assert(transform.offset.every((value) => Number.isFinite(value) && value >= 0 && value < 1));
  }
});

test('macro geology stays bounded and carries joints, strata, and regolith', () => {
  for (let variant = 0; variant < COMMON_ROCK_VARIANTS.length; variant++) {
    let sawJoint = false;
    let sawRegolith = false;
    let minHeight = Infinity;
    let maxHeight = -Infinity;
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      const x = Math.cos(angle);
      const y = Math.sin(angle * 1.7) * 0.7;
      const z = Math.sin(angle);
      const sample = sampleGeology(x, y, z, variant);
      sawJoint ||= sample.fracture > 0.55;
      sawRegolith ||= sample.regolith > 0.2;
      const displacement = displacementScalar(x, y, z, variant);
      minHeight = Math.min(minHeight, displacement);
      maxHeight = Math.max(maxHeight, displacement);
      const color = macroTone(x, y, z, variant);
      assert(color.every((channel) => Number.isFinite(channel) && channel >= 0.3 && channel <= 1.35));
    }
    assert.equal(sawJoint, true, `variant ${variant} exposes structural joints`);
    assert.equal(sawRegolith, true, `variant ${variant} exposes regolith accumulation`);
    assert(maxHeight - minHeight > 0.025, `variant ${variant} has meaningful macro relief`);
  }
});

test('geological roles differ in PBR response rather than tint alone', () => {
  assert.deepEqual(Object.keys(COMMON_ROCK_MATERIAL_ROLES), [
    'matrix',
    'fracture',
    'regolith',
    'ferrite',
  ]);
  assert(COMMON_ROCK_MATERIAL_ROLES.fracture.roughness > COMMON_ROCK_MATERIAL_ROLES.matrix.roughness);
  assert(COMMON_ROCK_MATERIAL_ROLES.regolith.roughness > COMMON_ROCK_MATERIAL_ROLES.fracture.roughness);
  assert(COMMON_ROCK_MATERIAL_ROLES.fracture.ao < COMMON_ROCK_MATERIAL_ROLES.matrix.ao);
  assert(COMMON_ROCK_MATERIAL_ROLES.ferrite.metalness > 0.5);
  assert(COMMON_ROCK_MATERIAL_ROLES.ferrite.roughness < COMMON_ROCK_MATERIAL_ROLES.matrix.roughness);
  assert(COMMON_ROCK_MATERIAL_ROLES.fracture.normalStrength > COMMON_ROCK_MATERIAL_ROLES.matrix.normalStrength);
  assert(COMMON_ROCK_MATERIAL_ROLES.regolith.normalStrength < COMMON_ROCK_MATERIAL_ROLES.matrix.normalStrength);
  assert(COMMON_ROCK_MATERIAL_ROLES.ferrite.normalStrength < COMMON_ROCK_MATERIAL_ROLES.regolith.normalStrength);
});

test('all five silhouettes and material fields are deterministic, bounded, and role-bearing', () => {
  const silhouetteFingerprints = [];
  for (let variant = 0; variant < COMMON_ROCK_VARIANTS.length; variant++) {
    const roleMax = { matrix: 0, fracture: 0, regolith: 0, ferrite: 0 };
    const silhouette = [Infinity, -Infinity];
    const materialRanges = {
      ao: [Infinity, -Infinity],
      roughness: [Infinity, -Infinity],
      metalness: [Infinity, -Infinity],
      normalStrength: [Infinity, -Infinity],
    };
    const fingerprint = [];
    for (let index = 0; index < 4096; index++) {
      const y = 1 - 2 * (index + 0.5) / 4096;
      const angle = index * 2.399963229728653;
      const radial = Math.sqrt(Math.max(0, 1 - y * y));
      const x = radial * Math.cos(angle);
      const z = radial * Math.sin(angle);
      const radius = silhouetteRadius(x, y, z, variant);
      if (index % 64 === 0) fingerprint.push(radius);
      const response = surfaceResponse(x, y, z, variant);
      silhouette[0] = Math.min(silhouette[0], radius);
      silhouette[1] = Math.max(silhouette[1], radius);
      for (const role of Object.keys(roleMax)) {
        roleMax[role] = Math.max(roleMax[role], response.roleWeights[role]);
      }
      for (const field of Object.keys(materialRanges)) {
        materialRanges[field][0] = Math.min(materialRanges[field][0], response[field]);
        materialRanges[field][1] = Math.max(materialRanges[field][1], response[field]);
      }
      assert.equal(surfaceResponse(x, y, z, variant).variantName, response.variantName);
    }
    silhouetteFingerprints.push(fingerprint);
    assert(silhouette[0] >= 0.52 && silhouette[1] <= 1.1);
    assert(silhouette[1] - silhouette[0] > 0.3, `variant ${variant} has a non-spherical macro silhouette`);
    assert(roleMax.matrix > (variant === 2 ? 0.55 : 0.7),
      `variant ${variant} retains coherent matrix expanses around its authored role emphasis`);
    assert(roleMax.fracture > 0.8, `variant ${variant} exposes fracture-wall response`);
    assert(roleMax.regolith > 0.3, `variant ${variant} exposes localized regolith response`);
    assert(roleMax.ferrite > 0.8, `variant ${variant} exposes a sparse ferrite response`);
    assert(materialRanges.roughness[1] - materialRanges.roughness[0] > 0.3);
    assert(materialRanges.metalness[1] - materialRanges.metalness[0] > 0.5);
    assert(materialRanges.ao[1] - materialRanges.ao[0] > 0.18);
    assert(materialRanges.normalStrength[1] - materialRanges.normalStrength[0] > 0.4);
  }
  for (let a = 0; a < silhouetteFingerprints.length; a++) {
    for (let b = a + 1; b < silhouetteFingerprints.length; b++) {
      const rms = Math.sqrt(silhouetteFingerprints[a].reduce((sum, value, index) => (
        sum + (value - silhouetteFingerprints[b][index]) ** 2
      ), 0) / silhouetteFingerprints[a].length);
      assert(rms > 0.075, `variants ${a}/${b} need visibly distinct macro profiles (rms ${rms})`);
    }
  }
});
