import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  collectOpeningEffectSubjects,
  OPENING_EFFECT_PLUME_DRIVE_RE,
} from '../src/render/openingEffectWarm.js';

const mesh = (name, materialName) => {
  const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  m.name = name;
  m.material.name = materialName || '';
  return m;
};

test('one subject per measured effect family; families that do not link post-lift on master stay out', () => {
  const scene = new THREE.Scene();
  const plasma = new THREE.Group(); plasma.name = 'sf-liquid-plasma-root';
  plasma.add(mesh('strand', ''));
  plasma.add(mesh('inner', 'plume:family_industrial_main_plume:core'));
  scene.add(plasma);
  scene.add(mesh('a', 'plume:family_industrial_main_plume:core'));
  scene.add(mesh('b', 'plume:family_industrial_main_plume:core'));
  scene.add(mesh('c', 'plume:family_vector_main_plume:core'));
  scene.add(mesh('c2', 'plume:family_industrial_main_plume:distortion'));
  scene.add(mesh('d', 'SF_ActionPrimitiveMatter'));
  scene.add(mesh('e', 'Forge_ore_barge_paint'));
  scene.add(mesh('f', 'SF_FilteredForceParticleTransport'));
  scene.add(mesh('SF_TrailStreakInstances', ''));
  scene.add(mesh('SF_RibbonTrail', ''));
  const jets = new THREE.Group(); jets.name = 'sf-overflow-jets'; jets.add(mesh('jet', ''));
  scene.add(jets);
  const seen = new Set();
  const keys = collectOpeningEffectSubjects(scene, seen).map((row) => row.key).sort();
  assert.deepEqual(keys, [
    'material:SF_ActionPrimitiveMatter',
    'material:SF_FilteredForceParticleTransport',
    'material:plume:family_industrial_main_plume:core',
    'root:SF_RibbonTrail',
    'root:sf-liquid-plasma-root',
    'root:sf-overflow-jets',
  ]);
  scene.add(mesh('g', 'SF_StructuralPlateMaterial'));
  assert.deepEqual(collectOpeningEffectSubjects(scene, seen).map((row) => row.key),
    ['material:SF_StructuralPlateMaterial']);
  assert.ok(OPENING_EFFECT_PLUME_DRIVE_RE.test('plume:family_industrial_main_plume:core'));
  assert.ok(!OPENING_EFFECT_PLUME_DRIVE_RE.test('plume:hitch_kestrel_main_plume:core'));
});

test('the effect warm runs under loading only and builds the narrow subset, not the full live-flight warmup', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /if \(profile === 'opening'\) this\._touchOpeningEffectFamilyUnderShell\(\);/);
  const a = renderer.indexOf('  _touchOpeningEffectFamilyUnderShell() {');
  const body = renderer.slice(a, renderer.indexOf('  _parkBoundedWarmRoots() {', a));
  assert.match(body, /admissionRunGeneration : undefined\) === generation/);
  assert.match(body, /if \(!loading\(\) \|\| Date\.now\(\) - startedAt > 90000\) return stop\('shell-released'\);/);
  assert.match(body, /warmupOpeningEffectSubset\(\{ plumeMaterialRe: OPENING_EFFECT_PLUME_DRIVE_RE \}\)/);
  assert.doesNotMatch(body, /warmupLiveFlightEffects\(/);
  assert.doesNotMatch(body, /boot-overlay/);
  assert.match(body, /releaseOpeningEffectSubset\(\)/);
});

test('the subset warm drives no RCS, retro jets or per-NPC ribbons and never disposes the exemplar program', async () => {
  const vfx = await readFile(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  const a = vfx.indexOf('  warmupOpeningEffectSubsetForLoading(options = {}) {');
  const b = vfx.indexOf('  restLiveFlightEffectsAfterCook() {', a);
  assert.ok(a > 0 && b > a);
  const body = vfx.slice(a, b);
  assert.doesNotMatch(body, /rcs|retroVolume|_ribbonTrails/i);
  const release = body.slice(body.indexOf('  releaseOpeningEffectSubset() {'));
  assert.doesNotMatch(release, /dispose\(/);
});

test('late first-link exemplars: stand-in + marker share the live materials; phase blink keeps both programs alive', async () => {
  const { createOpeningStandInWarmSubject } = await import('../src/render/visualOverrides.js');
  const { createPhaseBlinkWarmSubject } = await import('../src/render/phaseBlinkPresentation.js');
  const standIn = createOpeningStandInWarmSubject();
  assert.equal(standIn.name, 'SF_OpeningStandInWarm');
  assert.equal(standIn.children.length, 2);
  for (const mesh of standIn.children) assert.ok(mesh.material.isMeshStandardMaterial);
  assert.equal(standIn.children[0].material.userData.authoredResolvingMarker, true);
  // The stand-in material is the cached shared one: a second exemplar reuses it.
  assert.equal(createOpeningStandInWarmSubject().children[0].material, standIn.children[0].material);
  const blink = createPhaseBlinkWarmSubject();
  assert.equal(blink.children.length, 2);
  assert.notEqual(blink.children[0].material.fragmentShader, blink.children[1].material.fragmentShader);
  assert.ok(blink.children[0].material.uniforms.uZip);
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /\['exemplar:standIn', createOpeningStandInWarmSubject\]/);
  assert.doesNotMatch(renderer, /this\.bloom\.prepareResources\(\(\) => Promise\.resolve\(\)\)/);
});

test('warm touches start with the subset instead of waiting for the burst to drain (fx4-fx6 load)', async () => {
  const mod = await import('../src/render/openingEffectWarm.js');
  assert.equal(mod.OPENING_OVERFLOW_TOUCH_MIN_DELAY_MS, undefined);
  assert.ok(mod.OPENING_EFFECT_MATERIAL_RE.test('SF_ExplosionRupture_material-transport'));
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(renderer, /overflowBurstDrained/);
  assert.match(renderer, /if \(firstTouchCharged\) touchSpentMs \+= spent;/);
});

test('warm touches run under a total budget with a per-touch timeout, and the live cause-mark layer is a root', async () => {
  const mod = await import('../src/render/openingEffectWarm.js');
  assert.ok(mod.OPENING_EFFECT_ROOT_NAMES.includes('sf-cause-marks'));
  assert.ok(mod.OPENING_WARM_TOUCH_BUDGET_MS > 0 && mod.OPENING_WARM_TOUCH_TIMEOUT_MS > 0);
  assert.ok(mod.OPENING_WARM_TOUCH_TIMEOUT_MS < mod.OPENING_WARM_TOUCH_BUDGET_MS);
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /touchSpentMs >= OPENING_WARM_TOUCH_BUDGET_MS/);
  assert.match(renderer, /resolve\('timeout'\), OPENING_WARM_TOUCH_TIMEOUT_MS/);
  assert.match(renderer, /receipt\.timedOut\.push\(key\)/);
  const THREE = await import('three');
  const scene = new THREE.Scene();
  const marks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  marks.name = 'sf-cause-marks'; marks.visible = false;
  scene.add(marks);
  assert.deepEqual(mod.collectOpeningEffectSubjects(scene, new Set()).map((row) => row.key), ['root:sf-cause-marks']);
});
