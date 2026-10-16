import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import { collectOpeningEffectSubjects } from '../src/render/openingEffectWarm.js';

const mesh = (name, materialName) => {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  m.name = name;
  m.material.name = materialName || '';
  return m;
};

test('one subject per effect family; plumes of one family dedupe; unrelated meshes are ignored', () => {
  const scene = new THREE.Scene();
  const plasma = new THREE.Group(); plasma.name = 'sf-liquid-plasma-root';
  plasma.add(mesh('strand', ''));
  plasma.add(mesh('inner', 'plume:family_industrial_main_plume:core'));
  scene.add(plasma);
  scene.add(mesh('a', 'plume:family_industrial_main_plume:core'));
  scene.add(mesh('b', 'plume:family_industrial_main_plume:core'));
  scene.add(mesh('c', 'plume:family_vector_main_plume:distortion'));
  scene.add(mesh('d', 'SF_ActionPrimitiveMatter'));
  scene.add(mesh('e', 'Forge_ore_barge_paint'));
  scene.add(mesh('SF_TrailStreakInstances', ''));
  const seen = new Set();
  const keys = collectOpeningEffectSubjects(scene, seen).map((row) => row.key).sort();
  assert.deepEqual(keys, [
    'material:SF_ActionPrimitiveMatter',
    'material:plume:family_industrial_main_plume:core',
    'material:plume:family_vector_main_plume:distortion',
    'root:SF_TrailStreakInstances',
    'root:sf-liquid-plasma-root',
  ]);
  // A second sweep only returns families it has not touched yet.
  scene.add(mesh('f', 'SF_FilteredForceParticleTransport'));
  assert.deepEqual(collectOpeningEffectSubjects(scene, seen).map((row) => row.key),
    ['material:SF_FilteredForceParticleTransport']);
});

test('the opening warm starts the effect sweep, guarded by loading and admission generation', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /if \(profile === 'opening'\) this\._touchOpeningEffectFamilyUnderShell\(\);/);
  assert.match(renderer, /admissionRunGeneration : undefined\) === generation/);
  assert.match(renderer, /if \(state\.mode !== 'loading'\) return stop\('shell-released'\);/);
});
