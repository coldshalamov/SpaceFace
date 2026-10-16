import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

import {
  collectOpeningEffectSubjects,
  openingEffectWarmAllowed,
  OPENING_EFFECT_PLUME_DRIVE_RE,
} from '../src/render/openingEffectWarm.js';
import { render } from '../src/render/renderer.js';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function flushMicrotasks(times = 12) {
  let chain = Promise.resolve();
  for (let i = 0; i < times; i++) chain = chain.then(() => {});
  return chain;
}

function installFakeTimers() {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const realNow = performance.now.bind(performance);
  const jobs = new Map();
  let nextId = 0;
  let now = 0;
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    jobs.set(id, { callback, delay: Number(delay) || 0 });
    return id;
  };
  globalThis.clearTimeout = (id) => { jobs.delete(id); };
  performance.now = () => now;
  return {
    runNext(delay) {
      const entry = [...jobs.entries()].find(([, job]) => delay === undefined || job.delay === delay);
      if (!entry) return false;
      jobs.delete(entry[0]);
      now += entry[1].delay;
      entry[1].callback();
      return true;
    },
    pending(delay) {
      return [...jobs.values()].filter((job) => delay === undefined || job.delay === delay).length;
    },
    restore() {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
      performance.now = realNow;
    },
  };
}

function makeWarmOwner(state, touchSubjectExactTarget) {
  const owner = Object.create(render);
  owner.state = state;
  owner.renderer = { extensions: { get: () => null } };
  owner.scene = new THREE.Scene();
  state.render.warmupOpeningEffectSubset = () => ({ plasma: true, plumes: 1, ribbon: true });
  state.render.touchSubjectExactTarget = touchSubjectExactTarget;
  return owner;
}

function warmState() {
  const state = {
    mode: 'loading',
    playerId: 'player',
    entities: { get: () => ({ id: 'player' }) },
    world: {},
    contextRestoreSeq: 0,
    render: { gpu: { software: true, tier: 'software' }, admissionRunGeneration: 1 },
  };
  return state;
}

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
  const blinkAgain = createPhaseBlinkWarmSubject();
  assert.equal(blinkAgain.children[0].material, blink.children[0].material);
  assert.equal(blinkAgain.children[1].material, blink.children[1].material);
  blink.userData.disposeOpeningWarm();
  blinkAgain.userData.disposeOpeningWarm();
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

test('a timed-out exemplar releases the sweep but remains attached until its touch settles (#434 findings B, D)', async () => {
  const timers = installFakeTimers();
  const unfinishedTouch = deferred();
  const touches = [];
  let deferredDrawSawVisible = false;
  const state = warmState();
  const owner = makeWarmOwner(state, (subject) => {
    touches.push(subject.name);
    if (touches.length !== 1) return Promise.resolve();
    return unfinishedTouch.promise.then(() => {
      const priorVisible = subject.visible;
      subject.visible = true;
      deferredDrawSawVisible = subject.visible;
      subject.visible = priorVisible;
    });
  });
  state.render.restLiveFlightEffectsAfterCook = () => {};
  state.render.releaseOpeningEffectSubset = () => {};
  try {
    owner._touchOpeningEffectFamilyUnderShell();
    assert.equal(timers.runNext(0), true, 'the initial loading-shell sweep starts');
    await flushMicrotasks();
    assert.deepEqual(touches, ['SF_OpeningStandInWarm']);

    assert.equal(timers.runNext(1000), true, 'the per-touch deadline fires');
    await flushMicrotasks();
    assert.deepEqual(touches, ['SF_OpeningStandInWarm', 'SF_PhaseBlinkOpeningWarm'],
      'a pending draw no longer keeps the sweep waiting after its timeout');
    const standIn = owner.scene.children.find((child) => child.name === 'SF_OpeningStandInWarm');
    assert.ok(standIn, 'the timed-out subject stays mounted while its draw is still pending');
    assert.equal(standIn.visible, false, 'the pending exemplar is hidden from ordinary scene draws');
    assert.ok(state.render.openingEffectWarm.timedOut.includes('exemplar:standIn'));

    unfinishedTouch.resolve();
    await flushMicrotasks();
    assert.equal(deferredDrawSawVisible, true, 'the exact-target port can reveal the hidden exemplar for its draw');
    assert.equal(standIn.parent, null, 'the subject is detached when the draw finally settles');
  } finally {
    unfinishedTouch.resolve();
    await flushMicrotasks();
    timers.restore();
  }
});

test('touches the exact-target port declines are not counted as touched', async () => {
  const timers = installFakeTimers();
  const touches = [];
  const state = warmState();
  const owner = makeWarmOwner(state, (subject) => {
    touches.push(subject.name);
    // The port's own decline shape: it resolves, but touched nothing.
    if (subject.name === 'SF_OpeningStandInWarm') return Promise.resolve({ skipped: true, reason: 'touch unavailable' });
    return Promise.resolve({ touched: 1 });
  });
  state.render.restLiveFlightEffectsAfterCook = () => {};
  state.render.releaseOpeningEffectSubset = () => {};
  try {
    owner._touchOpeningEffectFamilyUnderShell();
    assert.equal(timers.runNext(0), true);
    await flushMicrotasks();
    await flushMicrotasks();
    assert.deepEqual(touches.slice(0, 2), ['SF_OpeningStandInWarm', 'SF_PhaseBlinkOpeningWarm']);
    const receipt = state.render.openingEffectWarm;
    assert.ok(!receipt.touched.includes('exemplar:standIn'), 'a declined touch is not a touch');
    assert.ok(receipt.touched.includes('exemplar:phaseBlink'));
    assert.deepEqual(receipt.portSkipped, ['exemplar:standIn (touch unavailable)']);
    const { openingEffectWarmLine } = await import('../scripts/player-truth/verdict.mjs');
    const line = openingEffectWarmLine({ present: true, khr: false, software: true, ...receipt, reason: 'shell-released' });
    assert.match(line, new RegExp(`· ${receipt.touched.length} touched, 1 declined by the exact-target port, `));
  } finally {
    timers.restore();
  }
});

test('a superseded warm cannot publish, rest effects, or clear a newer invocation', async () => {
  const timers = installFakeTimers();
  const unfinishedTouch = deferred();
  const touches = [];
  const firstState = warmState();
  const owner = makeWarmOwner(firstState, (subject) => {
    touches.push(subject.name);
    return touches.length === 1 ? unfinishedTouch.promise : Promise.resolve();
  });
  let firstRestCount = 0;
  let firstReleaseCount = 0;
  firstState.render.restLiveFlightEffectsAfterCook = () => { firstRestCount += 1; };
  firstState.render.releaseOpeningEffectSubset = () => { firstReleaseCount += 1; };
  try {
    owner._touchOpeningEffectFamilyUnderShell();
    assert.equal(timers.runNext(0), true);
    await flushMicrotasks();
    assert.deepEqual(touches, ['SF_OpeningStandInWarm']);
    const pendingExemplar = owner.scene.children.find((child) => child.name === 'SF_OpeningStandInWarm');
    assert.ok(pendingExemplar);

    const secondState = warmState();
    const secondTouches = [];
    let secondRestCount = 0;
    let secondReleaseCount = 0;
    secondState.render.touchSubjectExactTarget = (subject) => {
      secondTouches.push(subject.name);
      return Promise.resolve();
    };
    secondState.render.warmupOpeningEffectSubset = () => ({ plasma: true, plumes: 1, ribbon: true });
    secondState.render.restLiveFlightEffectsAfterCook = () => { secondRestCount += 1; };
    secondState.render.releaseOpeningEffectSubset = () => { secondReleaseCount += 1; };
    owner.state = secondState;
    owner._touchOpeningEffectFamilyUnderShell();
    assert.equal(pendingExemplar.visible, false,
      'starting a replacement state hides the old exemplar while its touch remains pending');
    assert.equal(timers.runNext(0), true, 'the replacement state starts its own warm');
    await flushMicrotasks();
    assert.deepEqual(secondTouches, ['SF_OpeningStandInWarm', 'SF_PhaseBlinkOpeningWarm']);
    const currentReceipt = secondState.render.openingEffectWarm;
    assert.ok(currentReceipt);
    assert.equal(secondRestCount, 1);
    assert.equal(secondReleaseCount, 1);
    assert.equal(owner._openingEffectWarmActive, true);

    unfinishedTouch.resolve();
    await flushMicrotasks();
    assert.equal(secondState.render.openingEffectWarm, currentReceipt,
      'the old completion does not replace the new receipt');
    assert.equal(owner._openingEffectWarmActive, true,
      'the old completion cannot clear the new invocation active flag');
    assert.equal(firstState.render.openingEffectWarm, undefined,
      'the old completion cannot publish a receipt after its state is superseded');
    assert.equal(firstRestCount, 0, 'the old completion does not rest effects after supersession');
    assert.equal(firstReleaseCount, 0, 'the old completion does not release the replacement subset');
  } finally {
    unfinishedTouch.resolve();
    await flushMicrotasks();
    timers.restore();
  }
});

test('a timed-out warm that crosses the shell release never rests live flight effects', async () => {
  const timers = installFakeTimers();
  const unfinishedTouch = deferred();
  const touches = [];
  const state = warmState();
  const owner = makeWarmOwner(state, (subject) => {
    touches.push(subject.name);
    return unfinishedTouch.promise;
  });
  let restCount = 0;
  let releaseCount = 0;
  state.render.restLiveFlightEffectsAfterCook = () => { restCount += 1; };
  state.render.releaseOpeningEffectSubset = () => { releaseCount += 1; };
  try {
    owner._touchOpeningEffectFamilyUnderShell();
    assert.equal(timers.runNext(0), true);
    await flushMicrotasks();
    assert.deepEqual(touches, ['SF_OpeningStandInWarm']);

    state.mode = 'flight';
    assert.equal(timers.runNext(1000), true);
    await flushMicrotasks();
    assert.equal(state.render.openingEffectWarm.reason, 'shell-released');
    assert.equal(owner._openingEffectWarmActive, false);
    const exemplar = owner.scene.children.find((child) => child.name === 'SF_OpeningStandInWarm');
    assert.ok(exemplar, 'the pending exact-target draw retains its subject until settlement');
    assert.equal(exemplar.visible, false, 'the pending exemplar is hidden from normal flight');
    assert.equal(restCount, 0);
    assert.equal(releaseCount, 1, 'the warm-only ribbon root is detached without resetting flight effects');

    unfinishedTouch.resolve();
    await flushMicrotasks();
    assert.equal(owner._openingEffectWarmActive, false);
    assert.equal(restCount, 0, 'late draw completion leaves the flight effects alone');
    assert.equal(exemplar.parent, null, 'the pending exemplar is detached after its draw settles');
  } finally {
    unfinishedTouch.resolve();
    await flushMicrotasks();
    timers.restore();
  }
});

test('an owned sweep error rests loading effects and releases the warm subset', async () => {
  const timers = installFakeTimers();
  const state = warmState();
  const owner = makeWarmOwner(state, () => Promise.resolve());
  let restCount = 0;
  let releaseCount = 0;
  state.render.restLiveFlightEffectsAfterCook = () => { restCount += 1; };
  state.render.releaseOpeningEffectSubset = () => { releaseCount += 1; };
  const brokenNode = { name: 'fixture-error-node' };
  Object.defineProperty(brokenNode, 'children', {
    get() { throw new Error('fixture traversal failure'); },
  });
  owner.scene.children.push(brokenNode);
  try {
    owner._touchOpeningEffectFamilyUnderShell();
    assert.equal(timers.runNext(0), true);
    await flushMicrotasks();
    assert.equal(state.render.openingEffectWarm.reason, 'error');
    assert.equal(restCount, 1, 'an owned loading error restores the live effect state');
    assert.equal(releaseCount, 1, 'an owned loading error removes the warm-only subset');
    assert.equal(owner._openingEffectWarmActive, false);
  } finally {
    timers.restore();
  }
});

test('player-truth records whether the opening effect warm ran or was skipped on this GPU (#434 bar 2.5)', async () => {
  const { openingEffectWarmLine } = await import('../scripts/player-truth/verdict.mjs');
  assert.equal(openingEffectWarmLine(null), null);
  assert.match(openingEffectWarmLine({ present: true, reason: 'parallel-compile-cook', khr: true }), /^skipped · reason parallel-compile-cook · KHR_parallel_shader_compile yes$/);
  assert.match(openingEffectWarmLine({ present: true, reason: 'shell-released', khr: false, software: true, touched: ['a', 'b'], timedOut: [], skipped: [], failed: 0, sweeps: 14 }),
    /^ran · reason shell-released · KHR_parallel_shader_compile no · software GPU · 2 touched, 0 timed out, 0 skipped, 0 failed, 14 sweeps$/);
  assert.match(openingEffectWarmLine({ present: false, khr: true }), /^not run \(no receipt\)/);
  const run = await readFile(new URL('../scripts/player-truth/run.mjs', import.meta.url), 'utf8');
  assert.match(run, /trace\.meta\.openingEffectWarm = await page\.evaluate/);
});
