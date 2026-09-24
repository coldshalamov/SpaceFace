// E8 — iGPU 60 is a designed picture, not the Performance preset with the lights off.
// Bloom, engine trails, and energy materials stay. The named substitutes are the
// cheaper passes. This fixture does not claim a 60 fps reading on quiet hardware.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  QUALITY_PRESETS,
  applyQualityPreset,
  qualityTierForPreset,
} from '../src/render/adaptiveQuality.js';

test('iGPU 60 keeps the authored picture and names what it substitutes', () => {
  const preset = QUALITY_PRESETS.find((row) => row.id === 'igpu60');
  assert.ok(preset, 'the preset is on the settings list');
  assert.equal(preset.label, 'iGPU 60');
  assert.deepEqual(preset.stays, ['bloom', 'engine trails', 'energy materials']);
  assert.ok(preset.substitutes.includes('render scale 0.75'));
  assert.ok(preset.substitutes.includes('frame cap 60'));
  assert.equal(preset.substitutes.includes('bloom off'), false);

  const tier = qualityTierForPreset('igpu60');
  assert.equal(tier.bloom, true);
  assert.equal(tier.engineTrails, true);
  assert.equal(tier.energyMaterials, true);
  assert.equal(tier.renderScale, 0.75);
  assert.equal(tier.particleQuality, 'medium');
  assert.equal(tier.shadows, false);
  assert.equal(tier.renderGraph, false);

  const state = createGameState(16500);
  const applied = applyQualityPreset(state.settings, 'igpu60');
  assert.equal(state.settings.video.bloom, true);
  assert.equal(state.settings.video.engineTrails, true);
  assert.equal(state.settings.video.energyMaterials, true);
  assert.equal(state.settings.video.renderScale, 0.75);
  assert.equal(state.settings.video.frameCap, 60);
  assert.equal(state.settings.video.qualityPreset, 'igpu60');
  assert.equal(state.player.credits, createGameState(16500).player.credits);
  assert.ok(applied.changed.includes('frameCap'));
});
