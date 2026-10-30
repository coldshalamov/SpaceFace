import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  adaptiveFrameBudgetMs,
  adaptiveResolutionEligibleForState,
  adaptiveResolutionEnabledForSettings,
  applyQualityPreset,
  createAdaptiveResolution,
  qualityModeForVideo,
} from '../src/render/adaptiveQuality.js';

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
