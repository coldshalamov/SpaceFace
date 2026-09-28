// Integrated GPU quality preset (PERF backlog #86–#94 group).
// Soft-GPU / headless: proves the opt-in preset writes the bundled video knobs and that
// detectGpu(integrated) may *suggest* it without auto-applying. Default picture stays Medium.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  ADAPTIVE_QUALITY_TIERS,
  DEFAULT_QUALITY_PRESET,
  FRAME_CAP_OPTIONS,
  INTEGRATED_PRESET_SUGGESTION,
  QUALITY_PRESETS,
  applyQualityPreset,
  detectGpu,
  normalizeFrameCap,
  qualityTierForPreset,
  shouldSuggestIntegratedPreset,
} from '../src/render/adaptiveQuality.js';
import { resolveEffectiveSectorPost as resolvePost } from '../src/render/bloom.js';

const SEED = 8694;

test('default picture stays Medium — integrated is opt-in only', () => {
  const state = createGameState(SEED);
  assert.equal(DEFAULT_QUALITY_PRESET, 'medium');
  assert.equal(state.settings.video.qualityPreset, 'medium');
  assert.equal(state.settings.video.renderScale, 1);
  assert.equal(state.settings.video.bloom, true);
  assert.equal(state.settings.video.bloomStrength, 0.52);
  assert.equal(state.settings.video.postFx, true);
  assert.equal(state.settings.video.sharpen, false);
  assert.equal(state.settings.video.frameCap, 0);
  assert.equal(state.settings.video.dynamicResolution, false);
  assert.equal(state.settings.video.particleQuality, 'medium');
  assert.ok(QUALITY_PRESETS.some((p) => p.id === 'integrated'), 'Integrated GPU preset is listed');
  assert.notEqual(DEFAULT_QUALITY_PRESET, 'integrated');
});

test('integrated preset bundles the plumbed #86–#94 knobs', () => {
  const state = createGameState(SEED);
  const tier = qualityTierForPreset('integrated');
  assert.equal(tier.id, 'integrated');
  assert.equal(tier.shadows, false, '#86 shadows off');
  assert.equal(tier.bloom, true);
  assert.ok(tier.bloomStrength < 0.52, '#87 reduced bloom strength');
  assert.equal(tier.bloomLevels, 1, '#87 fewer bloom levels');
  assert.equal(tier.renderScale, 0.85, '#88 render scale 0.85');
  assert.equal(tier.sharpen, true, '#88 sharpening on');
  assert.equal(tier.dynamicResolution, true, '#89 dynres opt-in flag');
  assert.equal(tier.frameCap, 30, '#90 30 fps cap');
  assert.equal(tier.particleQuality, 'low', '#94 particle density low');
  assert.equal(tier.postFx, false, '#93 post effects off');

  const applied = applyQualityPreset(state.settings, 'integrated');
  assert.equal(applied.preset, 'integrated');
  assert.equal(state.settings.video.qualityPreset, 'integrated');
  assert.equal(state.settings.video.renderScale, 0.85);
  assert.equal(state.settings.video.shadows, false);
  assert.equal(state.settings.video.bloomStrength, 0.28);
  assert.equal(state.settings.video.bloomLevels, 1);
  assert.equal(state.settings.video.sharpen, true);
  assert.equal(state.settings.video.postFx, false);
  assert.equal(state.settings.video.frameCap, 30);
  assert.equal(state.settings.video.dynamicResolution, true);
  assert.equal(state.settings.video.particleQuality, 'low');
  assert.ok(applied.changed.includes('qualityPreset'));
  assert.ok(applied.changed.includes('renderScale'));
});

test('leaving integrated restores a stock preset picture', () => {
  const state = createGameState(SEED);
  applyQualityPreset(state.settings, 'integrated');
  applyQualityPreset(state.settings, 'medium');
  const v = state.settings.video;
  assert.equal(v.qualityPreset, 'medium');
  assert.equal(v.renderScale, 1);
  assert.equal(v.bloomStrength, 0.52);
  assert.equal(v.bloomLevels, 2);
  assert.equal(v.sharpen, false);
  assert.equal(v.postFx, true);
  assert.equal(v.frameCap, 0);
  assert.equal(v.dynamicResolution, false);
  assert.equal(v.particleQuality, 'medium');
});

test('postFx:false zeroes grade/vignette/grain; default postFx leaves them alone', () => {
  const authored = { grade: 0.45, vignette: 0.12, grain: 0.08, toe: 0.0039 };
  const on = resolvePost({ postFx: true, bloomStrength: 0.52 }, authored);
  assert.equal(on.grade, 0.45);
  assert.equal(on.vignette, 0.12);
  assert.equal(on.grain, 0.08);
  const off = resolvePost({ postFx: false, bloomStrength: 0.52 }, authored);
  assert.equal(off.grade, 0);
  assert.equal(off.vignette, 0);
  assert.equal(off.grain, 0);
  assert.equal(off.postFx, false);
  assert.equal(off.sharpen, false);
  const sharp = resolvePost({ sharpen: true, bloomLevels: 1 }, null);
  assert.equal(sharp.sharpen, true);
  assert.equal(sharp.bloomLevels, 1);
});

test('45 fps is a legal frame-cap option; normalize accepts it', () => {
  assert.ok(FRAME_CAP_OPTIONS.includes(45));
  assert.equal(normalizeFrameCap(45), 45);
  assert.equal(normalizeFrameCap(37), 0);
});

test('detectGpu integrated may suggest the preset without applying it', () => {
  const fake = {
    getContext: () => ({
      getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246, UNMASKED_VENDOR_WEBGL: 0x9245 }),
      getParameter: (p) => (p === 0x9246 ? 'Intel(R) UHD Graphics' : 'Intel'),
    }),
  };
  const gpu = detectGpu(fake);
  assert.equal(gpu.tier, 'integrated');
  const state = createGameState(SEED);
  assert.equal(state.settings.video.qualityPreset, 'medium');
  assert.equal(shouldSuggestIntegratedPreset(gpu, state.settings.video), true);
  assert.ok(INTEGRATED_PRESET_SUGGESTION.text.includes('Integrated GPU'));
  // Suggestion must not mutate settings.
  assert.equal(state.settings.video.qualityPreset, 'medium');
  assert.equal(state.settings.video.renderScale, 1);
  applyQualityPreset(state.settings, 'integrated');
  assert.equal(shouldSuggestIntegratedPreset(gpu, state.settings.video), false);
});

test('settings screen lists Integrated GPU and 45 fps', () => {
  const source = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  // The Quality preset dropdown is data-driven off QUALITY_PRESETS, so the integrated preset
  // is reachable without touching the ORRERY-owned screen. (The remote patch also swapped the
  // hardcoded frame-cap row list for FRAME_CAP_OPTIONS inside settings.js — that hunk is
  // ORRERY-owned and skipped; 45 fps stays legal via normalizeFrameCap and the preset.)
  assert.match(source, /QUALITY_PRESETS/);
  assert.match(source, /applyQualityPreset/);
  const adaptive = readFileSync(new URL('../src/render/adaptiveQuality.js', import.meta.url), 'utf8');
  assert.match(adaptive, /Integrated GPU/);
  assert.match(adaptive, /id: 'integrated'/);
  assert.ok(ADAPTIVE_QUALITY_TIERS.integrated);
  assert.ok(FRAME_CAP_OPTIONS.includes(45), '45 fps is a legal frame-cap option');
});
