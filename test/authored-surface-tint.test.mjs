import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { applyAuthoredSurfaceTint, authoredSurfaceTintRole } from '../src/render/partsLibrary.js';

test('default authored hull tint preserves PBR calibration and never adds fake emission', () => {
  const map = new THREE.Texture();
  const roughnessMap = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map,
    roughnessMap,
    roughness: 0.93,
    metalness: 0.81,
  });

  applyAuthoredSurfaceTint(material, '#75808a', 'hull', false);

  assert.strictEqual(material.map, map);
  assert.strictEqual(material.roughnessMap, roughnessMap);
  assert.equal(material.roughness, 0.93);
  assert.equal(material.metalness, 0.81);
  assert.equal(material.emissive.getHex(), 0);
  assert.ok(material.color.r > 0.8 && material.color.g > 0.8 && material.color.b > 0.8,
    'faction identity may bias an authored surface but must not repaint it flat gray');
});

test('an explicit player paint remains a color multiplier without replacing surface maps', () => {
  const map = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.88, metalness: 0.72 });

  applyAuthoredSurfaceTint(material, '#334455', 'hull', true);

  assert.strictEqual(material.map, map);
  assert.equal(material.color.getHexString(), '334455');
  assert.equal(material.roughness, 0.88);
  assert.equal(material.metalness, 0.72);
  assert.equal(material.emissive.getHex(), 0);
});

test('machinery receives only a subtle identity bias and warning paint remains authored', () => {
  const machinery = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.84, metalness: 0.74 });
  applyAuthoredSurfaceTint(machinery, '#206070', 'dark', false);
  assert.ok(machinery.color.r > 0.85 && machinery.color.g > 0.85 && machinery.color.b > 0.85);
  assert.equal(machinery.roughness, 0.84);
  assert.equal(machinery.metalness, 0.74);

  assert.equal(authoredSurfaceTintRole({}, { name: 'Material_Warning_Red' }), 'none');
  assert.equal(authoredSurfaceTintRole({}, { name: 'Material_Mechanical' }), 'dark');
  assert.equal(authoredSurfaceTintRole({}, { name: 'Material_Emissive_Cyan' }), 'none');
  assert.equal(authoredSurfaceTintRole({}, { name: 'Material_Emissive_Orange' }), 'none');
  assert.equal(authoredSurfaceTintRole({}, { name: 'Material_Emissive_DriveCore' }), 'thruster');
});

test('exported semantic roles separate paint from functional material identities', () => {
  const role = (spacefaceMaterialRole, name = 'Misleading_Material_Hull') => authoredSurfaceTintRole({}, {
    name,
    userData: { spacefaceMaterialRole },
  });

  assert.equal(role('painted_armor', 'SF_GOLDEN_V1_PAINTED_ARMOR'), 'hull');
  assert.equal(role('accent'), 'accent');
  assert.equal(role('dark_composite'), 'dark');
  assert.equal(role('recessed_mechanical'), 'dark');
  for (const semantic of [
    'exposed_alloy',
    'canopy_glass',
    'sensor_lens',
    'maintenance_mark',
    'engine_ceramic',
    'heat_affected_alloy',
    'copper_coil',
  ]) {
    assert.equal(role(semantic), 'none', `${semantic} must preserve its authored material identity`);
  }
});

test('structural safety tags and legacy naming remain backward compatible', () => {
  const painted = { name: 'Material_Hull', userData: { spacefaceMaterialRole: 'painted_armor' } };
  assert.equal(authoredSurfaceTintRole({ canopy: true }, painted), 'none');
  assert.equal(authoredSurfaceTintRole({ drive: 'plume' }, painted), 'thruster');
  assert.equal(authoredSurfaceTintRole({}, { name: 'Material_Mechanical' }), 'dark');
  assert.equal(authoredSurfaceTintRole({}, {
    name: 'Material_Mechanical',
    userData: { spacefaceMaterialRole: 'future_unknown_role' },
  }), 'dark', 'unknown semantic roles must fall through to legacy name resolution');
  assert.equal(authoredSurfaceTintRole({ tint: 'accent' }, { name: 'Unclassified' }), 'accent');
});
