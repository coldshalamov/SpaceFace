import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  collectOpeningEffectSubjects,
  openingEffectWarmAllowed,
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
  const warm = await readFile(new URL('../src/render/openingEffectWarm.js', import.meta.url), 'utf8');
  assert.match(warm, /if \(firstCharged\) spentMs \+= spent;/);
});

test('warm touches run under a total budget with a per-touch timeout, and the live cause-mark layer is a root', async () => {
  const mod = await import('../src/render/openingEffectWarm.js');
  assert.ok(mod.OPENING_EFFECT_ROOT_NAMES.includes('sf-cause-marks'));
  assert.ok(mod.OPENING_WARM_TOUCH_BUDGET_MS > 0 && mod.OPENING_WARM_TOUCH_TIMEOUT_MS > 0);
  assert.ok(mod.OPENING_WARM_TOUCH_TIMEOUT_MS < mod.OPENING_WARM_TOUCH_BUDGET_MS);
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /budgetMs: OPENING_WARM_TOUCH_BUDGET_MS,\s*timeoutMs: OPENING_WARM_TOUCH_TIMEOUT_MS,/);
  const warm = await readFile(new URL('../src/render/openingEffectWarm.js', import.meta.url), 'utf8');
  assert.match(warm, /if \(spentMs >= budgetMs\)/);
  assert.match(warm, /resolve\('timeout'\), timeoutMs/);
  assert.match(warm, /receipt\.timedOut\.push\(key\)/);
  const THREE = await import('three');
  const scene = new THREE.Scene();
  const marks = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  marks.name = 'sf-cause-marks'; marks.visible = false;
  scene.add(marks);
  assert.deepEqual(mod.collectOpeningEffectSubjects(scene, new Set()).map((row) => row.key), ['root:sf-cause-marks']);
});

test('the opening effect warm runs only where the opening cook is not awaited (#434 review A)', async () => {
  const khr = { extensions: { get: (name) => (name === 'KHR_parallel_shader_compile' ? {} : null) } };
  const noKhr = { extensions: { get: () => null } };
  assert.equal(openingEffectWarmAllowed({ gpu: { software: true, tier: 'software' }, renderer: khr }), true);
  assert.equal(openingEffectWarmAllowed({ gpu: { software: false, tier: 'integrated' }, renderer: noKhr }), true);
  assert.equal(openingEffectWarmAllowed({ gpu: { software: false, tier: 'discrete' }, renderer: khr }), false);
  assert.equal(openingEffectWarmAllowed({ gpu: null, renderer: khr }), false);
  assert.equal(openingEffectWarmAllowed(), false);
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const a = renderer.indexOf('  _touchOpeningEffectFamilyUnderShell() {');
  const body = renderer.slice(a, renderer.indexOf('  _parkBoundedWarmRoots() {', a));
  const gate = body.indexOf('if (!openingEffectWarmAllowed({ gpu: state.render && state.render.gpu, renderer: this.renderer })) {');
  assert.ok(gate > 0, 'gate present');
  // The gate returns before the warm marks itself active, builds the subset or schedules a sweep.
  assert.ok(gate < body.indexOf('this._openingEffectWarmActive = true;'));
  assert.ok(gate < body.indexOf('warmupOpeningEffectSubset('));
  assert.ok(gate < body.indexOf('setTimeout('));
  assert.match(body.slice(gate, gate + 300), /reason: 'parallel-compile-cook'/);
});

test('exemplar teardown chains on the touch\'s own done; a step error clears the active flag (#434 B, C)', async () => {
  const renderer = await readFile(new URL('../src/render/renderer.js', import.meta.url), 'utf8');
  const a = renderer.indexOf('  _touchOpeningEffectFamilyUnderShell() {');
  const body = renderer.slice(a, renderer.indexOf('  _parkBoundedWarmRoots() {', a));
  assert.match(body, /result = await timedTouch\(touch, key, subject\);/);
  assert.match(body, /if \(result && result\.done\) result\.done\.then\(teardown, teardown\);/);
  assert.match(body, /try \{ flushExemplars\(\); \} catch \(_\) \{[^}]*\}\s*this\._openingEffectWarmActive = false;/);
  assert.match(body, /return await sweep\(\);\s*\} catch \(error\) \{[\s\S]{0,160}return stop\('error'\);/);
  const vfx = await readFile(new URL('../src/render/vfx.js', import.meta.url), 'utf8');
  assert.doesNotMatch(vfx, /options\.ribbonExemplar/);
});

const freshReceipt = () => ({ touched: [], touchMs: {}, failed: 0, timedOut: [], skipped: [] });

test('timedTouch is bounded by its timeout and returns a non-thenable (1 s touch, 100 ms timeout -> ~100 ms)', async () => {
  const { createTimedTouch } = await import('../src/render/openingEffectWarm.js');
  const receipt = freshReceipt();
  const timedTouch = createTimedTouch({ clock: () => performance.now(), budgetMs: 4000, timeoutMs: 100, receipt });
  const slow = () => new Promise((resolve) => setTimeout(resolve, 1000));
  const t0 = performance.now();
  const result = await timedTouch(slow, 'slow', {});
  const waited = performance.now() - t0;
  assert.ok(waited >= 90 && waited < 400, `returned after ${Math.round(waited)} ms`);
  assert.equal(typeof result.then, 'undefined', 'result must not be thenable');
  assert.equal(result.started, true);
  assert.deepEqual(receipt.timedOut, ['slow']);
  const t1 = performance.now();
  assert.equal(await result.done, true);
  assert.ok(performance.now() - t1 > 700, 'done follows the touch itself');
  // Never-settling touch: the call still returns at the timeout.
  const t2 = performance.now();
  const hung = await timedTouch(() => new Promise(() => {}), 'hung', {});
  assert.ok(performance.now() - t2 < 400);
  assert.equal(hung.started, true);
  // Budget spent -> no touch starts.
  const tight = createTimedTouch({ clock: () => performance.now(), budgetMs: 50, timeoutMs: 100, receipt: freshReceipt() });
  await tight(slow, 'first', {}); // uncharged
  await tight(slow, 'second', {}); // charged ~100 ms
  assert.equal(tight.budgetSpent(), true);
  const skipped = await tight(() => { throw new Error('must not start'); }, 'third', {});
  assert.deepEqual(skipped, { started: false, done: null });
});

test('a touch that never settles leaves the warm inactive and no exemplar mounted once loading ends', async () => {
  const THREE = await import('three');
  const { render } = await import('../src/render/renderer.js');
  const scene = new THREE.Scene();
  const touched = [];
  const state = {
    mode: 'loading',
    playerId: 1,
    entities: new Map([[1, { id: 1 }]]),
    render: {
      gpu: { software: true, tier: 'software' },
      admissionRunGeneration: 7,
      touchSubjectExactTarget: (subject) => { touched.push(subject.name); return new Promise(() => {}); },
      warmupOpeningEffectSubset: () => ({ skipped: false, plasma: false, plumes: 0, ribbon: false, initMs: 0, ms: 0 }),
      restLiveFlightEffectsAfterCook: () => {},
      releaseOpeningEffectSubset: () => ({ skipped: true }),
    },
  };
  const owner = { state, scene, renderer: { extensions: { get: () => null } } };
  render._touchOpeningEffectFamilyUnderShell.call(owner);
  assert.equal(owner._openingEffectWarmActive, true);
  // Both exemplars time out (1 s each) without ever settling; the sweep must keep moving.
  await new Promise((resolve) => setTimeout(resolve, 2600));
  assert.deepEqual(touched, ['SF_OpeningStandInWarm', 'SF_PhaseBlinkOpeningWarm']);
  assert.ok(state.render.openingEffectWarm.sweeps >= 2, `sweeps ${state.render.openingEffectWarm.sweeps}`);
  state.mode = 'flight';
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(owner._openingEffectWarmActive, false);
  assert.equal(state.render.openingEffectWarm.reason, 'shell-released');
  assert.deepEqual(state.render.openingEffectWarm.timedOut, ['exemplar:standIn', 'exemplar:phaseBlink']);
  const left = [];
  scene.traverse((o) => { if (/OpeningWarm/.test(o.name || '')) left.push(o.name); });
  assert.deepEqual(left, []);
});
