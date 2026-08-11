#!/usr/bin/env node
// Offline proof that palette color variants and scenario one-offs share program-family keys
// (the same identity performanceSceneMetrics uses via spacefaceProgramFamily / material.name).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { runMaterialSharingContractProbe } from '../src/render/partsLibrary.js';
import { build47aScenarioProp } from '../src/render/scenarioProps47a.js';

function materialKey(material) {
  if (!material) return 'none';
  const family = material.userData && material.userData.spacefaceProgramFamily;
  const name = family || material.name || material.type || 'material';
  const transparent = material.transparent ? ':transparent' : ':opaque';
  const blending = material.blending != null ? `:blend${material.blending}` : '';
  return `${name}${transparent}${blending}`;
}

function collectKeys(root) {
  const keys = new Set();
  const byName = new Map();
  root.traverse((object) => {
    if (!object?.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      const key = materialKey(material);
      keys.add(key);
      if (!byName.has(material.name)) byName.set(material.name, material);
    }
  });
  return { keys, byName };
}

// --- SF_Shared palette color variants: distinct instances, shared program-family names ---
const probe = runMaterialSharingContractProbe(THREE);
assert.equal(probe.hullProgramFamilyShared, true, 'hull color variants share program-family name');
assert.equal(probe.mechanicalProgramFamilyShared, true, 'mechanical color variants share program-family name');
assert.equal(probe.maplessHullCanonicalized, true, 'mapless hull still canonicalizes into textured');

// --- Scenario props: many semantic names, few program families ---
const refs = [
  'asset.slice.47a_spindle',
  'asset.slice.bourse_carrier_wreck',
  'asset.slice.civilian_pod',
  'asset.slice.kessler_handoff_beacon',
];
const scenarioKeys = new Set();
const scenarioNames = new Set();
for (const assetRef of refs) {
  const root = build47aScenarioProp({
    id: `${assetRef}_matkey`,
    type: assetRef.includes('beacon') ? 'beacon' : assetRef.includes('wreck') ? 'wreck' : 'payload',
    radius: assetRef.includes('beacon') ? 80 : 10,
    data: { assetRef },
  });
  assert.ok(root, `expected prop for ${assetRef}`);
  const { keys, byName } = collectKeys(root);
  for (const key of keys) scenarioKeys.add(key);
  for (const name of byName.keys()) scenarioNames.add(name);
  // Every mesh material should publish a program family (or zone basic).
  root.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    for (const mat of mats) {
      assert.ok(
        mat.userData?.spacefaceProgramFamily,
        `${object.name} material ${mat.name} missing spacefaceProgramFamily`,
      );
    }
  });
}

// Semantic debug names stay (batching tests + art readability).
assert.ok(scenarioNames.has('Spindle_Signal_Pulse'));
assert.ok(scenarioNames.has('CivilianPod_Distress_Red'));
assert.ok(scenarioNames.has('HandoffBeacon_Quiet_Violet'));

// Program-family collapse: 4 props with ~12+ named materials map into a handful of families.
assert.ok(
  scenarioKeys.size <= 6,
  `scenario program families should be <=6, got ${scenarioKeys.size}: ${[...scenarioKeys].join(', ')}`,
);
assert.ok(scenarioNames.size >= 10, 'semantic material names should still be present for debug');

// Expected families present.
const familyList = [...scenarioKeys].join(' ');
assert.match(familyList, /SF_Scenario_standard/);
assert.match(familyList, /SF_Scenario_glow/);

console.log('material-program-family-keys:');
console.log(`  probe hull/mechanical program-family share: ok`);
console.log(`  scenario semantic names: ${scenarioNames.size}`);
console.log(`  scenario program-family keys: ${scenarioKeys.size} (${[...scenarioKeys].join(', ')})`);
console.log('PASS');
