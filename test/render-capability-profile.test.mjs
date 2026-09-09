import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyRenderCapabilityProfile,
  shouldEagerlyWarmPipelines,
} from '../src/render/renderCapabilityProfile.js';

test('software WebGL keeps authored quality but disables eager pipeline compilation', () => {
  const profile = classifyRenderCapabilityProfile({
    renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))',
    vendor: 'Google Inc.',
    maxTextureSize: 8192,
    maxSamples: 4,
  });

  assert.equal(profile.acceleration, 'software');
  assert.equal(profile.visualTier, 'full');
  assert.equal(profile.pipelineWarmup, 'lazy');
  assert.equal(shouldEagerlyWarmPipelines(profile), false);
});

test('hardware WebGL retains exact render-target pipeline warm-up', () => {
  const profile = classifyRenderCapabilityProfile({
    renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11)',
    vendor: 'Google Inc. (NVIDIA)',
    maxTextureSize: 16384,
    maxSamples: 8,
  });

  assert.equal(profile.acceleration, 'hardware');
  assert.equal(profile.visualTier, 'full');
  assert.equal(profile.pipelineWarmup, 'eager');
  assert.equal(shouldEagerlyWarmPipelines(profile), true);
});

test('unknown renderers default to conservative lazy warm-up without reducing visuals', () => {
  const profile = classifyRenderCapabilityProfile({});

  assert.equal(profile.acceleration, 'unknown');
  assert.equal(profile.visualTier, 'full');
  assert.equal(profile.pipelineWarmup, 'lazy');
  assert.equal(shouldEagerlyWarmPipelines(profile), false);
});
