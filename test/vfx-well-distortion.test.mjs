/**
 * PQ-139.05 — wells bend space through the real DistortionField / SpaceRenderGraph pass.
 *
 * Capture path (required before queue `done`): enable Settings → Video →
 * "Render graph (GTAO + bloom)" so `settings.video.renderGraph === true`. The bloom/native
 * route never samples `tDistortion`. Capture at 1280px, shipping camera, default quality,
 * HUD hidden; the standard 190 WU / strength-240 well should read ~8–16 px peak displacement
 * without whole-screen wobble. Debris curvature remains field physics, not this pass.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { fields } from '../src/systems/fields.js';
import { FIELD_DEFS, FIELD_KINDS, FIELD_MAX_ACTIVE } from '../src/data/fields.js';
import { SpaceRenderGraph } from '../src/render/post/spaceRenderGraph.js';
import { activeWeaponRenderGraph } from '../src/render/vfx.js';
import {
  DISTORTION_ENCODED_OFFSET_SCALE,
  WELL_DISTORTION_CAPACITY,
  WELL_DISTORTION_CAPTURE_WIDTH_PX,
  WELL_DISTORTION_GPU_STRENGTH_MAX,
  WELL_DISTORTION_REF_GPU_STRENGTH,
  WeaponVfxPresenter,
  wellDistortionGpuStrength,
  wellDistortionPeakPx1280,
} from '../src/render/weapons/presenter.js';

const STANDARD_RADIUS = FIELD_DEFS.well.radius;
const STANDARD_STRENGTH = FIELD_DEFS.well.strength;
const RADII = [95, 190, 285];
const STRENGTHS = [120, 240, 360];

function bootFields() {
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    playerId: 1,
    entities: new Map(),
    entityList: [],
    input: { actions: {} },
    fields: null,
  };
  const bus = { on() { return () => {}; }, emit() {} };
  const sys = Object.create(fields);
  sys.init({ state, bus, helpers: {} });
  return { state, sys };
}

function publishFields(sys, state, specs) {
  sys._kernel.clear();
  for (const spec of specs) sys._kernel.register(spec);
  sys._publish(state, state.fields, 0, 0, 0);
  return state.fields.active;
}

function wellSpec(id, extra = {}) {
  return {
    id,
    kind: FIELD_KINDS.WELL,
    center: { x: extra.x || 0, z: extra.z || 0 },
    radius: extra.radius != null ? extra.radius : STANDARD_RADIUS,
    strength: extra.strength != null ? extra.strength : STANDARD_STRENGTH,
    falloff: 1.6,
    durationS: 9,
    createdAt: 0,
    tag: extra.tag || null,
  };
}

function presenterState(active = [], settings = {}) {
  return {
    playerId: 'pilot',
    entityList: [],
    entities: new Map(),
    fields: { active },
    settings: {
      video: { bloom: false, motionReduce: false, renderGraph: true, ...settings.video },
      accessibility: { flashReduce: false, ...settings.accessibility },
    },
    render: { meshes: new Map(), renderGraph: { attached: true } },
  };
}

function targetName(target) {
  return target && target.texture ? target.texture.name : null;
}

function makeGraphRenderer(options = {}) {
  const clearColor = new THREE.Color(0x060912);
  let clearAlpha = 1;
  let currentTarget = null;
  const renderLog = [];
  const clearLog = [];
  const setClearColorLog = [];
  const contentsByTarget = new Map();
  const renderer = {
    isWebGLRenderer: true,
    capabilities: { isWebGL2: false },
    autoClear: true,
    autoClearColor: true,
    autoClearDepth: true,
    autoClearStencil: true,
    getRenderTarget: () => currentTarget,
    setRenderTarget(target) { currentTarget = target; },
    getClearColor(target) { return target.copy(clearColor); },
    getClearAlpha() { return clearAlpha; },
    setClearColor(color, alpha) {
      clearColor.set(color);
      clearAlpha = alpha;
      setClearColorLog.push({
        color: clearColor.getHex(),
        alpha: clearAlpha,
        autoClear: renderer.autoClear,
        target: targetName(currentTarget),
      });
    },
    clear() {
      const name = targetName(currentTarget);
      clearLog.push({
        target: name,
        color: clearColor.getHex(),
        alpha: clearAlpha,
        autoClear: renderer.autoClear,
      });
      contentsByTarget.set(name, []);
    },
    render(scene) {
      // WebGLRenderer.render() auto-clears the current target when autoClear is true.
      if (renderer.autoClear) {
        renderer.clear(renderer.autoClearColor, renderer.autoClearDepth, renderer.autoClearStencil);
      }
      const name = targetName(currentTarget);
      if (typeof options.onRender === 'function') options.onRender(scene, renderer, name);
      const remaining = contentsByTarget.get(name) || [];
      remaining.push(scene && scene.name);
      contentsByTarget.set(name, remaining);
      renderLog.push({
        scene: scene && scene.name,
        target: name,
        autoClear: renderer.autoClear,
      });
    },
  };
  return {
    renderer,
    renderLog,
    clearLog,
    setClearColorLog,
    contentsByTarget,
    distortionContents: () => contentsByTarget.get('SpaceRenderGraph:Distortion') || [],
  };
}

function distortionTargetRenders(renderLog) {
  return renderLog.filter((entry) => entry.target === 'SpaceRenderGraph:Distortion');
}

test('fields publish raw well distortion radius/strength and zero for non-wells', () => {
  const { state, sys } = bootFields();
  const well = publishFields(sys, state, [wellSpec('w1')])[0];
  assert.equal(well.kind, 'well');
  assert.equal(well.distortionRadius, STANDARD_RADIUS);
  assert.equal(well.distortionStrength, STANDARD_STRENGTH);

  const mixed = publishFields(sys, state, [
    wellSpec('w1'),
    {
      id: 'r1', kind: FIELD_KINDS.REPULSOR, center: { x: 40, z: 0 },
      radius: 170, strength: 300, falloff: 1.3, durationS: 7, createdAt: 0,
    },
    {
      id: 'c1', kind: FIELD_KINDS.CONE, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 },
      radius: 260, strength: 260, falloff: 1.2, durationS: Infinity, createdAt: 0,
    },
  ]);
  const byKind = Object.fromEntries(mixed.map((rec) => [rec.kind, rec]));
  assert.equal(byKind.well.distortionRadius, STANDARD_RADIUS);
  assert.equal(byKind.well.distortionStrength, STANDARD_STRENGTH);
  assert.equal(byKind.repulsor.distortionRadius, 0);
  assert.equal(byKind.repulsor.distortionStrength, 0);
  assert.equal(byKind.cone.distortionRadius, 0);
  assert.equal(byKind.cone.distortionStrength, 0);

  const reused = byKind.well;
  sys._publish(state, state.fields, 0, 0, 0);
  assert.equal(state.fields.active.find((rec) => rec.kind === 'well'), reused,
    'presentation records stay reused in place');
});

test('no well: zero live well records and the distortion pass stays asleep', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  presenter.update(1 / 60, { state: presenterState([]), interpolationAlpha: 1 });
  assert.equal(presenter.wellDistortion.live, 0);
  assert.equal(presenter.wellDistortion.capacity, WELL_DISTORTION_CAPACITY);
  assert.equal(WELL_DISTORTION_CAPACITY, FIELD_MAX_ACTIVE);
  assert.equal(presenter.distortionProducers.length, 2);
  assert.equal(presenter.distortionProducers[0], presenter.distortion);
  assert.equal(presenter.distortionProducers[1], presenter.wellDistortion);

  const { renderer } = makeGraphRenderer();
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph.setSize(64, 64);
  presenter.attachGraph(graph);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 0);
  assert.equal(graph.diagnostics().distortionProducers, 0);
  presenter.dispose();
  graph.dispose();
});

test('standard well: bounded localized refraction, monotone in radius and strength', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  assert.match(presenter.wellDistortion.material.fragmentShader, /if \(r > 1\.0\) discard/);
  assert.match(presenter.wellDistortion.material.fragmentShader, /envelope \* 0\.035/);
  assert.equal(DISTORTION_ENCODED_OFFSET_SCALE, 0.035);

  const peakStandard = wellDistortionPeakPx1280(STANDARD_RADIUS, STANDARD_STRENGTH);
  assert.equal(wellDistortionGpuStrength(STANDARD_RADIUS, STANDARD_STRENGTH), WELL_DISTORTION_REF_GPU_STRENGTH);
  assert.ok(peakStandard >= 8 && peakStandard <= 16,
    `standard well peak ${peakStandard.toFixed(2)} px at ${WELL_DISTORTION_CAPTURE_WIDTH_PX} must sit in 8–16`);

  const radiusRows = RADII.map((radius) => {
    const gpu = wellDistortionGpuStrength(radius, STANDARD_STRENGTH);
    const px = wellDistortionPeakPx1280(radius, STANDARD_STRENGTH);
    return { radius, strength: STANDARD_STRENGTH, gpu, px };
  });
  const strengthRows = STRENGTHS.map((strength) => {
    const gpu = wellDistortionGpuStrength(STANDARD_RADIUS, strength);
    const px = wellDistortionPeakPx1280(STANDARD_RADIUS, strength);
    return { radius: STANDARD_RADIUS, strength, gpu, px };
  });
  for (let i = 1; i < radiusRows.length; i++) {
    assert.ok(radiusRows[i].gpu > radiusRows[i - 1].gpu, 'gpu strength monotone in radius');
    assert.ok(radiusRows[i].px > radiusRows[i - 1].px, '1280px peak monotone in radius');
  }
  for (let i = 1; i < strengthRows.length; i++) {
    assert.ok(strengthRows[i].gpu > strengthRows[i - 1].gpu, 'gpu strength monotone in field strength');
    assert.ok(strengthRows[i].px > strengthRows[i - 1].px, '1280px peak monotone in field strength');
  }
  assert.equal(
    wellDistortionGpuStrength(STANDARD_RADIUS * 8, STANDARD_STRENGTH * 8),
    WELL_DISTORTION_GPU_STRENGTH_MAX,
  );

  presenter.update(1 / 60, {
    state: presenterState([{
      id: 'w-std',
      kind: 'well',
      center: { x: 12, z: -8 },
      distortionRadius: STANDARD_RADIUS,
      distortionStrength: STANDARD_STRENGTH,
    }]),
    interpolationAlpha: 1,
  });
  assert.equal(presenter.wellDistortion.live, 1);
  assert.equal(presenter.wellDistortion.radius.getX(0), STANDARD_RADIUS);
  assert.equal(presenter.wellDistortion.strength.getX(0), WELL_DISTORTION_REF_GPU_STRENGTH);
  assert.equal(presenter.wellDistortion.pos.getX(0), 12);
  assert.equal(presenter.wellDistortion.pos.getZ(0), -8);

  const table = [
    'WELL DISTORTION CALIBRATION (1280px UV peak; DistortionField envelope * 0.035)',
    ...radiusRows.map((row) => `radius ${row.radius} WU @ strength ${row.strength}: gpu=${row.gpu.toFixed(4)} peak=${row.px.toFixed(2)} px`),
    ...strengthRows.map((row) => `strength ${row.strength} @ radius ${row.radius} WU: gpu=${row.gpu.toFixed(4)} peak=${row.px.toFixed(2)} px`),
    `standard ${STANDARD_RADIUS}/${STANDARD_STRENGTH}: ${peakStandard.toFixed(2)} px (target 8–16)`,
    `bounded max gpu strength ${WELL_DISTORTION_GPU_STRENGTH_MAX} → ${(WELL_DISTORTION_GPU_STRENGTH_MAX * DISTORTION_ENCODED_OFFSET_SCALE * WELL_DISTORTION_CAPTURE_WIDTH_PX).toFixed(2)} px`,
    'FLAG PATH: visible only when settings.video.renderGraph === true (SpaceRenderGraph). Bloom/native never samples tDistortion.',
  ].join('\n');
  console.log(table);
  presenter.dispose();
});

function armWellAndHaze(presenter) {
  presenter.state = presenterState([
    { id: 'w-a', kind: 'well', center: { x: -40, z: 0 }, distortionRadius: STANDARD_RADIUS, distortionStrength: STANDARD_STRENGTH },
    { id: 'w-b', kind: 'well', center: { x: 80, z: 10 }, distortionRadius: 95, distortionStrength: 120 },
  ]);
  presenter.distortion.spawn({ x: 0, y: 0.4, z: 0, radius: 4, strength: 1, life: 1 });
  presenter.update(0, { state: presenter.state, interpolationAlpha: 1 });
}

function distortionClears(clearLog) {
  return clearLog.filter((entry) => entry.target === 'SpaceRenderGraph:Distortion');
}

test('two wells plus live weapon haze accumulate in one graph pass', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  armWellAndHaze(presenter);
  assert.equal(presenter.wellDistortion.live, 2);
  assert.ok(presenter.distortion.live >= 1);
  assert.equal(presenter.wellDistortion.hasLive, true);
  assert.equal(presenter.distortion.hasLive, true);

  const { renderer, renderLog, clearLog, setClearColorLog, distortionContents } = makeGraphRenderer();
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph.setSize(64, 64);
  presenter.attachGraph(graph);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 1, 'one distortion family, not one pass per producer');
  assert.equal(graph.diagnostics().distortionProducers, 2);
  assert.equal(distortionClears(clearLog).length, 1, 'the distortion target clears once');
  const producerDraws = distortionTargetRenders(renderLog);
  assert.deepEqual(producerDraws.map((entry) => entry.scene), [
    'SF_WeaponDistortionScene',
    'SF_WellDistortionScene',
  ]);
  assert.ok(producerDraws.every((entry) => entry.autoClear === false),
    'producer draws must not auto-clear or they erase earlier producers');
  assert.deepEqual(distortionContents(), [
    'SF_WeaponDistortionScene',
    'SF_WellDistortionScene',
  ], 'later producers must accumulate, not replace, earlier ones');
  const restoredClear = setClearColorLog.filter((entry) => entry.color === 0x060912);
  assert.ok(restoredClear.length >= 1, 'distortion pass restores the renderer clear color');
  assert.ok(restoredClear.every((entry) => entry.autoClear === true),
    'autoClear is restored before the distortion pass restores clear color');
  assert.equal(renderer.autoClear, true, 'graph.render restores the outer autoClear contract');
  presenter.dispose();
  graph.dispose();
});

test('distortion restores autoClear if a later producer render throws', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  armWellAndHaze(presenter);
  const { renderer, setClearColorLog } = makeGraphRenderer({
    onRender(scene, _renderer, target) {
      if (target === 'SpaceRenderGraph:Distortion' && scene && scene.name === 'SF_WellDistortionScene') {
        throw new Error('producer render failed');
      }
    },
  });
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph.setSize(64, 64);
  presenter.attachGraph(graph);
  assert.throws(
    () => graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 }),
    { message: 'producer render failed' },
  );
  const restoredClear = setClearColorLog.filter((entry) => entry.color === 0x060912);
  assert.ok(restoredClear.length >= 1, 'throwing producer still restores clear color');
  assert.ok(restoredClear.every((entry) => entry.autoClear === true),
    'autoClear is restored on the throwing distortion path');
  assert.equal(renderer.autoClear, true, 'graph.render still restores autoClear after a producer throw');
  presenter.dispose();
  graph.dispose();
});

test('collapse clears the well producer and returns the pass to sleep', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const live = presenterState([{
    id: 'w-live', kind: 'well', center: { x: 0, z: 0 },
    distortionRadius: STANDARD_RADIUS, distortionStrength: STANDARD_STRENGTH,
  }]);
  presenter.update(0, { state: live, interpolationAlpha: 1 });
  assert.equal(presenter.wellDistortion.live, 1);

  const { renderer } = makeGraphRenderer();
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph.setSize(64, 64);
  presenter.attachGraph(graph);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 1);

  presenter.update(0, { state: presenterState([]), interpolationAlpha: 1 });
  assert.equal(presenter.wellDistortion.live, 0);
  assert.equal(presenter.wellDistortion.hasLive, false);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 0);
  assert.equal(graph.diagnostics().distortionProducers, 0);
  presenter.dispose();
  graph.dispose();
});

test('reduced motion produces no well distortion; reduced flash still admits wells', () => {
  const rec = [{
    id: 'w-a11y', kind: 'well', center: { x: 0, z: 0 },
    distortionRadius: STANDARD_RADIUS, distortionStrength: STANDARD_STRENGTH,
  }];
  const reducedMotion = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  reducedMotion.update(0, {
    state: presenterState(rec, { video: { motionReduce: true } }),
    interpolationAlpha: 1,
  });
  assert.equal(reducedMotion.wellDistortion.live, 0);
  reducedMotion.dispose();

  const reducedFlash = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  reducedFlash.update(0, {
    state: presenterState(rec, { accessibility: { flashReduce: true } }),
    interpolationAlpha: 1,
  });
  assert.equal(reducedFlash.wellDistortion.live, 1, 'flash reduce does not drop well refraction');
  reducedFlash.dispose();
});

test('well producers stay preallocated and the render-graph flag path is explicit', () => {
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  const producers = presenter.distortionProducers;
  const slots = presenter.wellDistortion.slots;
  const recs = [{
    id: 'w-pool', kind: 'well', center: { x: 3, z: 4 },
    distortionRadius: STANDARD_RADIUS, distortionStrength: STANDARD_STRENGTH,
  }];
  const state = presenterState(recs);
  presenter.update(0, { state, interpolationAlpha: 1 });
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  recs[0].center.x = 9;
  presenter.update(1 / 60, { state, interpolationAlpha: 1 });
  assert.equal(presenter.distortionProducers, producers);
  assert.equal(presenter.wellDistortion.slots, slots);
  assert.equal(presenter.wellDistortion.live, 1);
  assert.equal(presenter.wellDistortion.pos.getX(0), 9);

  const graphStub = { id: 'live-graph' };
  assert.equal(
    activeWeaponRenderGraph({ settings: { video: { renderGraph: true } }, render: { renderGraph: graphStub } }),
    graphStub,
  );
  assert.equal(
    activeWeaponRenderGraph({ settings: { video: { renderGraph: false } }, render: { renderGraph: graphStub } }),
    null,
    'bloom/native (video.renderGraph false) must not claim well refraction is on screen',
  );
  console.log(
    'FLAG/CAPTURE PATH: well refraction is SpaceRenderGraph-only. Enable settings.video.renderGraph '
    + '(Settings: Render graph (GTAO + bloom)), 1280px shipping-camera capture, HUD hidden. '
    + 'activeWeaponRenderGraph() returns null when the flag is false, so the presenter detaches '
    + 'and the distortion pass never samples. Queue done still needs that capture.',
  );
  presenter.dispose();
});

test('one-field attachDistortionField API still wakes a single producer', () => {
  const { renderer } = makeGraphRenderer();
  const graph = new SpaceRenderGraph(renderer, { ao: false, bloom: false });
  graph.setSize(64, 64);
  const presenter = new WeaponVfxPresenter({ scene: new THREE.Scene() });
  graph.attachDistortionField(presenter.distortion);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 0);
  presenter.distortion.spawn({ x: 0, y: 0, z: 0, radius: 4, strength: 1, life: 1 });
  presenter.distortion.update(0);
  graph.render(new THREE.Scene(), new THREE.PerspectiveCamera(), { time: 0 });
  assert.equal(graph.diagnostics().passFamilies.distortion, 1);
  assert.equal(graph.diagnostics().distortionProducers, 1);
  presenter.dispose();
  graph.dispose();
});
