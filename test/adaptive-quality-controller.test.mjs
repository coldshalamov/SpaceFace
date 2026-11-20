import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  adaptiveFloorForCombinedScale,
  adaptiveFrameBudgetMs,
  adaptiveResolutionEligibleForState,
  adaptiveResolutionEnabledForSettings,
  applyQualityPreset,
  createAdaptiveResolution,
  qualityModeForVideo,
} from '../src/render/adaptiveQuality.js';
import { render } from '../src/render/renderer.js';

function feed(controller, frameDt, frames, sample = {}) {
  for (let i = 0; i < frames; i++) controller.update(frameDt, sample);
}

test('Auto uses render resolution only; named quality presets become explicit Manual overrides', () => {
  const state = createGameState(41);
  const video = state.settings.video;
  const before = { bloom: video.bloom, trails: video.engineTrails };

  assert.equal(video.qualityMode, 'auto');
  assert.equal(qualityModeForVideo(video), 'auto');
  assert.equal(adaptiveResolutionEnabledForSettings({ tier: 'discrete' }, video), true);
  assert.equal(adaptiveResolutionEnabledForSettings({ tier: 'integrated' }, { ...video, qualityMode: 'manual' }), false);
  assert.equal(adaptiveResolutionEnabledForSettings({ tier: 'integrated' }, {
    ...video, qualityMode: 'manual', dynamicResolution: true,
  }), true, 'Manual can explicitly turn adaptive resolution back on');

  const applied = applyQualityPreset(state.settings, 'high');
  assert.equal(video.qualityMode, 'manual');
  assert.ok(applied.changed.includes('qualityMode'));
  assert.deepEqual({ bloom: video.bloom, trails: video.engineTrails }, before,
    'named preset keeps authored bloom and engine trails enabled');
  assert.equal(video.particleQuality, 'high', 'manual preset selects its authored particle-quality tier');

  assert.equal(qualityModeForVideo({ ...video, qualityMode: undefined, qualityPreset: 'high' }), 'manual',
    'legacy saves with a named non-default profile retain their manual choice');
  assert.equal(qualityModeForVideo({ ...createGameState(42).settings.video, qualityMode: undefined }), 'auto',
    'an untouched legacy Balanced profile opts into Auto without rewriting its saved values');
  assert.equal(qualityModeForVideo({ qualityPreset: 'medium', renderScale: 1, bloom: true }), 'auto',
    'a partial older profile with no changed keys still opts into Auto');
  assert.equal(qualityModeForVideo({ qualityPreset: 'medium', renderScale: 0.85, bloom: true }), 'manual',
    'a customized older profile remains Manual');
});

test('frame budget follows the live presentation cap and refresh', () => {
  assert.equal(adaptiveFrameBudgetMs({ frameCap: 30, displayHz: 144 }, { vsync: true }), 1000 / 30);
  assert.equal(adaptiveFrameBudgetMs({ frameCap: 0, displayHz: 120 }, { vsync: true }), 1000 / 120);
  assert.equal(adaptiveFrameBudgetMs({ frameCap: 0, displayHz: 120 }, { vsync: false }), 1000 / 60);
});

test('Auto waits for the opened flight picture and released veil before learning', () => {
  const state = createGameState(43);
  state.mode = 'flight';
  state.render.openingFirstPictureReady = false;
  state.render.flightVeilHoldsSim = true;
  state.render.firstPlayableFrameAt = 1;
  state.timeScale = 0;
  const controller = createAdaptiveResolution({ floor: 0.5 });

  assert.equal(adaptiveResolutionEligibleForState(state, 'visible'), false,
    'a first-playable stamp alone cannot admit samples while opening readiness, veil, and sim hold remain');
  feed(controller, 0.026, 180, {
    eligible: adaptiveResolutionEligibleForState(state, 'visible'), targetMs: 1000 / 60,
  });
  assert.equal(controller.getScale(), 1, 'opening frames do not lower the render scale');

  state.render.openingFirstPictureReady = true;
  state.render.flightVeilHoldsSim = false;
  state.timeScale = 1;
  assert.equal(adaptiveResolutionEligibleForState(state, 'visible'), true,
    'the normal controller becomes eligible after the opening handoff');
  state.render.liveSectorGpuAdmission = true;
  assert.equal(adaptiveResolutionEligibleForState(state, 'visible'), false,
    'active sector GPU admission does not contaminate the steady-flight sample');
  state.render.liveSectorGpuAdmission = false;
  feed(controller, 0.026, 130, {
    eligible: adaptiveResolutionEligibleForState(state, 'visible'), targetMs: 1000 / 60,
  });
  assert.equal(controller.getScale(), 0.9, 'settled visible flight still adapts');

  assert.equal(adaptiveResolutionEligibleForState(state, 'hidden'), false,
    'hidden documents do not teach the controller');
  state.paused = true;
  assert.equal(adaptiveResolutionEligibleForState(state, 'visible'), false,
    'paused flight does not teach the controller');
});

test('adaptive resolution uses sustained degradation, preserves capped frame budgets, and ignores excluded frames', () => {
  const scales = [];
  const controller = createAdaptiveResolution({ floor: 0.5, apply: (scale) => scales.push(scale) });

  feed(controller, 1 / 30, 180, { eligible: true, targetMs: 1000 / 30 });
  assert.equal(controller.getScale(), 1, 'intentional 30 fps cap does not trigger downscaling');

  feed(controller, 0.028, 180, { eligible: false, targetMs: 1000 / 60 });
  controller.update(0.5, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 1, 'pause/loading and long stalls do not teach the controller');

  feed(controller, 0.026, 130, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 0.9, 'sustained slow presented frames move down one band');
  assert.deepEqual(scales, [0.9]);
  feed(controller, 0.016, 160, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 0.9, 'the useful band is retained after the measured improvement');
});

test('a resolution band is retained only when it improves frame time; recovery is gradual', () => {
  const controller = createAdaptiveResolution({ floor: 0.5 });
  feed(controller, 0.026, 130, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 0.9);
  feed(controller, 0.026, 160, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 1, 'CPU-bound frame cost restores the original resolution band');

  // A fresh controller models a GPU-bound case: the lower band materially improves frame time.
  const gpuBound = createAdaptiveResolution({ floor: 0.5 });
  feed(gpuBound, 0.026, 130, { eligible: true, targetMs: 1000 / 60 });
  feed(gpuBound, 0.016, 160, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(gpuBound.getScale(), 0.9, 'a beneficial lower band is kept');
});

test('isolated stalls are ignored but sustained 130 ms frames adapt and revert without benefit', () => {
  const controller = createAdaptiveResolution({ floor: 0.5 });
  controller.update(0.13, { eligible: true, targetMs: 1000 / 60 });
  feed(controller, 1 / 60, 90, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 1, 'one isolated long frame does not lower quality');

  feed(controller, 0.13, 22, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 0.9, 'a sustained slow window is still measured');
  feed(controller, 0.13, 28, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 1, 'a non-beneficial band is restored after the trial');
});

test('a borderline sustained miss parks at a shallow band instead of grinding to the floor', () => {
  // The far-zoom regression: the wider submit box used to walk every band on the same mild
  // miss, so a ~20-40% overage presented the readability floor. Deeper bands now demand a
  // progressively worse sustained miss — this ~1.4x load sheds one band and settles.
  const controller = createAdaptiveResolution({ floor: 0.5 });
  feed(controller, 0.0233, 90, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 0.9, 'a real but mild miss still sheds the first band');
  feed(controller, 0.0222, 500, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(controller.getScale(), 0.9, 'the deeper gate refuses a ~1.33x sustained miss');

  const borderline = createAdaptiveResolution({ floor: 0.5 });
  feed(borderline, 0.0208, 600, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(borderline.getScale(), 1, 'a ~1.25x miss never reaches even the first band');
});

test('raster relief raises the adaptive floor — the demo posture stays native content', () => {
  assert.equal(adaptiveFloorForCombinedScale(0.6, 1), 1,
    'no relief still holds the demo combined floor at native content');
  assert.equal(adaptiveFloorForCombinedScale(0.6, 0.8), 1,
    'hitch relief 0.8 lifts the discrete floor to the native scale');
  assert.equal(adaptiveFloorForCombinedScale(0.5, 0.72), 1,
    'integrated + hitch relief lifts the integrated floor to native');

  const controller = createAdaptiveResolution({ floor: 0.5 });
  controller.syncScale(0.5);
  controller.setFloor(0.8);
  assert.equal(controller.getScale(), 0.8, 'a raised floor lifts the live scale at once');
  controller.setFloor(0.5);
  assert.equal(controller.getScale(), 0.8, 'a lowered floor leaves the recovered scale alone');
});

test('Manual adaptive resolution keeps its tier floor without changing the saved render scale', () => {
  const state = createGameState(46);
  const video = state.settings.video;
  const gpu = state.render.gpu = { tier: 'integrated' };
  const renderer = Object.assign(Object.create(render), { state });
  const controller = createAdaptiveResolution({ floor: 0.5 });
  const syncPolicy = () => {
    controller.setEnabled(adaptiveResolutionEnabledForSettings(gpu, video));
    controller.setFloor(renderer._adaptiveFloorForRelief());
  };
  const slowFlight = { eligible: true, targetMs: 1000 / 60 };

  applyQualityPreset(state.settings, 'integrated');
  const savedScale = video.renderScale;
  assert.equal(renderer._adaptiveFloorForRelief(), 0.5);
  syncPolicy();
  feed(controller, 0.026, 130, slowFlight);
  assert.equal(controller.getScale(), 0.9, 'the explicit Manual toggle can start a resolution trial');
  feed(controller, 0.026, 160, slowFlight);
  assert.equal(controller.getScale(), 1, 'a trial without a frame time gain still rolls back');

  video.dynamicResolution = false;
  syncPolicy();
  feed(controller, 0.026, 130, slowFlight);
  assert.equal(controller.getScale(), 1, 'explicit Manual off keeps the configured scale fixed');
  assert.equal(video.renderScale, savedScale);

  video.qualityMode = 'auto';
  syncPolicy();
  feed(controller, 0.026, 130, slowFlight);
  assert.equal(renderer._adaptiveFloorForRelief(), 1);
  assert.equal(controller.getScale(), 1, 'Auto preserves the native-content floor');
});

test('sustained Auto relief applies the same post style as the player switch', () => {
  const state = createGameState(44);
  Object.assign(state.settings.video, { bloomLevels: 2, postFx: true });
  state.render.gpu = { tier: 'integrated' };
  const renderer = Object.assign(Object.create(render), {
    state,
    _sectorPost: { grade: 0.4, vignette: 0.2, toe: 0.005, grain: 0.03 },
    _hitchRelief: { level: 0 },
    bloom: { setOptions: (options) => { bloom = options; } },
    _renderGraph: { setOptions: (options) => { graph = options; } },
  });
  let bloom, graph;
  const style = ({ grade, vignette, toe, grain }) => [grade, vignette, toe, grain];
  renderer._syncPostOptions();
  const base = bloom;
  assert.deepEqual(style(base), [0.4, 0.2, 0.005, 0.03]);
  state.settings.video.postFx = false;
  renderer._syncPostOptions();
  const manualOffStyle = style(bloom);
  assert.deepEqual(manualOffStyle, [0, 0, 0, 0]);
  state.settings.video.postFx = true;
  renderer._setHitchReliefLevel(state.render, 1, true);
  assert.deepEqual(style(bloom), style(base));
  assert.equal(bloom.bloomLevels, 1);
  renderer._setHitchReliefLevel(state.render, 2, true);
  assert.deepEqual(style(bloom), manualOffStyle);
  assert.deepEqual(style(graph), manualOffStyle);
  assert.equal(bloom.exposure, base.exposure);
  assert.equal(bloom.acesToneMapping, base.acesToneMapping);
  assert.equal(bloom.bloomStrength, base.bloomStrength);
  assert.equal(state.settings.video.postFx, true);
  assert.equal(state.render.hitchReliefScale, 1);
  state.settings.video.qualityMode = 'manual';
  renderer._syncPostOptions();
  assert.deepEqual(bloom, base, 'switching to Manual restores the authored controls immediately');
  state.settings.video.qualityMode = 'auto';
  renderer._setHitchReliefLevel(state.render, 0, null);
  assert.deepEqual(bloom, base);
});

test('hitch relief only counts intervals between eligible presentations on the same surface', () => {
  const state = createGameState(45);
  state.render.gpu = { tier: 'integrated' };
  state.render.frameCap = 30;
  state.render.lastPresentDtMs = 100;
  const renderer = Object.assign(Object.create(render), { state });
  const frame = { sequence: 0, lifecycleGeneration: 1 };
  const present = () => { frame.sequence++; renderer._notePicturePresent(frame); };
  state.mode = 'loading';
  for (let i = 0; i < 12; i++) present();
  state.mode = 'flight';
  state.render.openingFirstPictureReady = true;
  state.render.firstPlayableFrameAt = 1;
  state.timeScale = 1;
  present();
  assert.equal(renderer._hitchRelief.level, 0, 'loading history cannot downshift first playable');
  for (let i = 0; i < 9; i++) present();
  assert.equal(renderer._hitchRelief.level, 0, 'only nine fully visible flight intervals elapsed');
  present();
  assert.equal(renderer._hitchRelief.level, 1, 'ten slow eligible presents retain the existing first rung');

  // A frozen pause bypasses prepareFrame and the quality controller entirely.
  frame.sequence++;
  present();
  assert.equal(renderer._hitchRelief.level, 0, 'resuming after a skipped surface drops prior pressure');
  for (let i = 0; i < 9; i++) present();
  assert.equal(renderer._hitchRelief.level, 0);
});

test('isolated 330 ms stalls are ignored but sustained 330 ms frames adapt and revert without benefit', () => {
  const isolated = createAdaptiveResolution({ floor: 0.5 });
  isolated.update(0.33, { eligible: true, targetMs: 1000 / 60 });
  feed(isolated, 1 / 60, 90, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(isolated.getScale(), 1, 'one long foreground stall does not lower quality');

  const sustained = createAdaptiveResolution({ floor: 0.5 });
  feed(sustained, 0.33, 12, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(sustained.getScale(), 0.9, 'consecutive 3 fps frames are clamped and learned as sustained load');
  feed(sustained, 0.33, 35, { eligible: true, targetMs: 1000 / 60 });
  assert.equal(sustained.getScale(), 1, 'a non-beneficial lower band is restored after its trial');
});

test('a CPU-bound frame never trials a lower resolution band; a GPU-bound one still does', () => {
  // Main thread busy for the whole 26 ms interval: resolution cannot help, so no pop.
  const cpuBound = createAdaptiveResolution({ floor: 0.5 });
  feed(cpuBound, 0.026, 400, { eligible: true, targetMs: 1000 / 60, cpuMs: 25 });
  assert.equal(cpuBound.getScale(), 1, 'a busy main thread keeps native resolution');
  assert.equal(cpuBound.getBound().bound, 'cpu');

  // Main thread idle for most of the interval: the wait is the GPU, so the band is trialled.
  const gpuBound = createAdaptiveResolution({ floor: 0.5 });
  feed(gpuBound, 0.026, 130, { eligible: true, targetMs: 1000 / 60, cpuMs: 9 });
  assert.equal(gpuBound.getScale(), 0.9);
  assert.equal(gpuBound.getBound().bound, 'gpu');

  // A GPU timer sample overrides the CPU-share guess.
  const timed = createAdaptiveResolution({ floor: 0.5 });
  feed(timed, 0.026, 130, { eligible: true, targetMs: 1000 / 60, cpuMs: 24, gpuMs: 25 });
  assert.equal(timed.getScale(), 0.9, 'GPU time as the longer pole admits the trial');
});

test('fruitless trials back off so an unhelpful band stops reappearing', () => {
  const scales = [];
  const controller = createAdaptiveResolution({ floor: 0.5, apply: (s) => scales.push(s) });
  // No CPU sample (old callers): every trial fails to improve the 26 ms frame.
  feed(controller, 0.026, 60 * 120, { eligible: true, targetMs: 1000 / 60 });
  const trials = scales.filter((s) => s < 1).length;
  // Without backoff a 15 s cooldown + 2.5 s trial would retry ~7 times in 120 s.
  assert.ok(trials <= 4, `trials in 120 s: ${trials}`);
  assert.equal(controller.getScale(), 1);
});
