// FB-085 — photo mode's filter flag does something: a final grade pass with three authored
// looks (src/render/post/spaceRenderGraph.js PHOTO_FILTER_LOOKS, staged by camera.js's per-frame
// syncPhotoFilterStage, selected from the pause photo overlay).
//
// Pins: filters OFF — the default — adds zero passes and zero targets (the graph is bit-identical
// to before the stage existed); each authored look changes the composite deterministically for a
// fixed frame (the GLSL's lift/gamma/gain/saturation math re-applied to a fixed pixel set); the
// selection half (cycle order, overlay picks, FOV) and the camera→graph handoff cannot disagree.
import assert from 'node:assert/strict';
import test from 'node:test';

import * as THREE from 'three';

import {
  PHOTO_FILTER_LOOKS,
  resolvePhotoFilterLook,
  SpaceRenderGraph,
} from '../src/render/post/spaceRenderGraph.js';
import {
  PHOTO_FILTER_LOOK_DEFAULT,
  PHOTO_FILTER_LOOK_ORDER,
  createPhotoModeState,
  cyclePhotoFilterLook,
  syncPhotoFilterStage,
} from '../src/render/camera.js';
import {
  cyclePhotoLook,
  setPhotoLook,
  syncPhotoFov,
} from '../src/ui/screens/pause.js';

function stubRenderer() {
  return { isWebGLRenderer: true, capabilities: { isWebGL2: false } };
}

function buildGraph() {
  return new SpaceRenderGraph(stubRenderer(), { enabled: true, ao: false, bloom: false });
}

// The grade fragment's math (PHOTO_GRADE_FRAG) over one pixel, exactly as authored:
// gain · + lift, clamp at zero, pow(1/gamma), luma-weighted saturation pull.
function gradePixel(look, r, g, b) {
  const c = [
    Math.max(0, r * look.gain[0] + look.lift[0]),
    Math.max(0, g * look.gain[1] + look.lift[1]),
    Math.max(0, b * look.gain[2] + look.lift[2]),
  ].map((v) => Math.pow(v, 1 / Math.max(look.gamma, 0.01)));
  const luma = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return c.map((v) => v + (v - luma) * (look.saturation - 1));
}

function compositeHash(look) {
  // A fixed frame: a dark hull, a mid plume, a bright star, a saturated engine edge.
  const pixels = [
    [0.08, 0.09, 0.11], [0.45, 0.30, 0.12], [1.4, 1.3, 1.1], [0.7, 0.2, 0.9],
    [0.02, 0.03, 0.04], [0.9, 0.85, 0.8],
  ];
  let h = 0x811c9dc5;
  for (const [r, g, b] of pixels) {
    for (const v of gradePixel(look, r, g, b)) {
      h ^= Math.round(v * 1e6) & 0xffffffff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h;
}

test('the graph ships three authored looks and camera.js names the first one the default', () => {
  assert.equal(PHOTO_FILTER_LOOKS.length, 3);
  assert.deepEqual(PHOTO_FILTER_LOOKS.map((l) => l.id), PHOTO_FILTER_LOOK_ORDER);
  assert.equal(PHOTO_FILTER_LOOK_DEFAULT, PHOTO_FILTER_LOOKS[0].id);
  // The looks are authored, not three names for one grade: every parameter set differs.
  const sigs = new Set(PHOTO_FILTER_LOOKS.map((l) => JSON.stringify([l.lift, l.gamma, l.gain, l.saturation])));
  assert.equal(sigs.size, 3);
  for (const look of PHOTO_FILTER_LOOKS) {
    assert.equal(Object.isFrozen(look), true, 'authored looks are frozen');
    assert.ok(look.gamma > 0);
  }
});

test('an unknown look id resolves to the first authored look, and the cycle order is closed', () => {
  assert.equal(resolvePhotoFilterLook('warm').id, 'warm');
  assert.equal(resolvePhotoFilterLook('no-such-look').id, PHOTO_FILTER_LOOKS[0].id);
  assert.equal(resolvePhotoFilterLook(null).id, PHOTO_FILTER_LOOKS[0].id);
  // chrome → warm → mono → chrome: the overlay cycles the authored order and comes home.
  assert.deepEqual(
    [PHOTO_FILTER_LOOK_DEFAULT, 'warm', 'mono', PHOTO_FILTER_LOOK_DEFAULT],
    [PHOTO_FILTER_LOOK_DEFAULT, cyclePhotoFilterLook(PHOTO_FILTER_LOOK_DEFAULT), cyclePhotoFilterLook('warm'), cyclePhotoFilterLook('mono')],
  );
  // An unknown id cycles home to the first authored look (same as the default's next step).
  assert.equal(cyclePhotoFilterLook('mystery'), PHOTO_FILTER_LOOKS[0].id);
});

test('filters off — the default — adds zero passes, zero targets and names no look', () => {
  const graph = buildGraph();
  assert.equal(graph._photoFiltersActive(), false);
  assert.equal(graph.gradeTarget, null, 'no intermediate exists while the stage is off');
  const diag = graph.diagnostics();
  assert.equal(diag.passFamilies.photoGrade, 0, 'filters off adds zero passes');
  assert.equal(diag.photoFilterLook, null);
  graph.dispose();
});

test('the grade stage turns on with one pass and the authored uniforms, and off with none', () => {
  const graph = buildGraph();
  graph.setPhotoFilters({ enabled: true, look: 'warm' });
  assert.equal(graph._photoFiltersActive(), true);
  assert.equal(graph.diagnostics().passFamilies.photoGrade, 1);
  assert.equal(graph.diagnostics().photoFilterLook, 'warm');
  const warm = resolvePhotoFilterLook('warm');
  assert.deepEqual([...graph.gradeMaterial.uniforms.uFilterLift.value.toArray()], warm.lift);
  assert.equal(graph.gradeMaterial.uniforms.uFilterGamma.value, warm.gamma);
  assert.deepEqual([...graph.gradeMaterial.uniforms.uFilterGain.value.toArray()], warm.gain);
  assert.equal(graph.gradeMaterial.uniforms.uFilterSaturation.value, warm.saturation);

  // Cycling the look re-authors the uniforms without a new pass.
  graph.setPhotoFilters({ enabled: true, look: 'mono' });
  assert.equal(graph.diagnostics().photoFilterLook, 'mono');
  assert.equal(graph.gradeMaterial.uniforms.uFilterSaturation.value, 0);

  // Off — the state after every photo session — takes the pass and any intermediate away.
  graph.setPhotoFilters({ enabled: false, look: null });
  assert.equal(graph._photoFiltersActive(), false);
  assert.equal(graph.diagnostics().passFamilies.photoGrade, 0);
  assert.equal(graph.gradeTarget, null);
  graph.dispose();
});

test('each authored look changes the composite hash deterministically for a fixed frame', () => {
  const hashes = PHOTO_FILTER_LOOKS.map((look) => compositeHash(look));
  assert.equal(new Set(hashes).size, 3, 'three looks, three different grades');
  // Determinism: the same look on the same frame hashes the same again.
  for (let i = 0; i < PHOTO_FILTER_LOOKS.length; i++) {
    assert.equal(compositeHash(PHOTO_FILTER_LOOKS[i]), hashes[i]);
  }
  // The authored parameters are what the GLSL consumes — mono's zero saturation truly greys.
  const mono = resolvePhotoFilterLook('mono');
  const [r, g, b] = gradePixel(mono, 0.7, 0.2, 0.9);
  assert.ok(Math.abs(r - g) < 1e-9 && Math.abs(g - b) < 1e-9, 'mono is mono');
});

test('the camera hands the photo-mode filter truth to the graph every frame it is asked', () => {
  const calls = [];
  const graph = { setPhotoFilters: (next) => calls.push(next) };
  const photoMode = (overrides = {}) => {
    const state = { render: { renderGraph: graph }, camera: { focus: { x: 0, z: 0 }, zoom: 144 } };
    state.render.photoMode = createPhotoModeState(state, overrides);
    return state;
  };

  // Filters off (default): the sync is an idempotent off — the stage never comes up.
  syncPhotoFilterStage(photoMode());
  assert.deepEqual(calls.at(-1), { enabled: false, look: PHOTO_FILTER_LOOK_DEFAULT });

  // On with a picked look: the pair travels verbatim.
  syncPhotoFilterStage(photoMode({ filters: true, filterLook: 'warm' }));
  assert.deepEqual(calls.at(-1), { enabled: true, look: 'warm' });

  // No graph, an older graph, or a probe harness: reads only, never throws.
  syncPhotoFilterStage({ render: {} });
  syncPhotoFilterStage(null);
  syncPhotoFilterStage({ render: { renderGraph: {} } });
  assert.equal(calls.length, 2);
});

test('the photo overlay picks and cycles looks, and photo FOV rides the one video.fov setting', () => {
  const emitted = [];
  const state = { render: {}, settings: { video: { fov: 50 } } };
  state.render.photoMode = createPhotoModeState(state);
  const ctx = { state, bus: { emit: (id, payload) => emitted.push([id, payload]) } };

  // Nothing to pick when photo mode is not live.
  state.render.photoMode.active = false;
  assert.equal(setPhotoLook(ctx, 'warm'), null);
  assert.equal(cyclePhotoLook(ctx), null);

  state.render.photoMode.active = true;
  assert.equal(setPhotoLook(ctx, 'warm'), 'warm');
  assert.equal(state.render.photoMode.filters, true, 'picking a look turns the filter flag on');
  assert.equal(cyclePhotoLook(ctx), 'mono');
  assert.equal(state.render.photoMode.filterLook, 'mono');
  assert.equal(cyclePhotoLook(ctx), PHOTO_FILTER_LOOK_DEFAULT);

  // Photo FOV clamps to the settings slider's band and announces itself.
  assert.equal(syncPhotoFov(ctx, 200), 90);
  assert.equal(state.settings.video.fov, 90);
  assert.equal(syncPhotoFov(ctx, 10), 35);
  assert.equal(syncPhotoFov(ctx, 'not-a-number'), null);
  assert.ok(emitted.every(([id]) => id === 'settings:changed'));
  assert.ok(emitted.length >= 2);
});
