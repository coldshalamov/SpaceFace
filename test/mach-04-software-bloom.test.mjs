// MACH-04 — the one automatic visual reduction is pinned to the software tier.
// Bloom is disabled only when gpu.software === true, the runtime emergency
// profile never writes settings.video, the player-facing toast names the cause,
// and an integrated-tier profile keeps bloom (its preset remains opt-in).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  SOFTWARE_RENDERER_TOAST,
  dynResFloorForTier,
  shouldSuggestIntegratedPreset,
  softwareRendererEmergencyProfile,
} from '../src/render/adaptiveQuality.js';

const SEED = 4242;

// Apply the emergency profile exactly the way renderer.js's gpu.software branch does.
function applyEmergencyTo(state, bloom) {
  const profile = softwareRendererEmergencyProfile(state.render.gpu);
  if (!profile) return null;
  state.render.softwareRenderer = true;
  if (bloom && typeof bloom.setOptions === 'function') bloom.setOptions({ bloom: false });
  state.render.dynResScale = profile.dynFloor;
  return profile;
}

test('software GPU drops bloom, starts at its floor, and names the cause — without persisting', () => {
  const state = createGameState(SEED);
  const videoBefore = JSON.parse(JSON.stringify(state.settings.video));
  state.render.gpu = { renderer: 'Google SwiftShader', vendor: 'Google Inc.', software: true, tier: 'software' };

  const calls = [];
  const bloom = { setOptions: (opts) => calls.push(opts) };
  const profile = applyEmergencyTo(state, bloom);

  assert.ok(profile, 'software context gets an emergency profile');
  assert.equal(profile.bloomOff, true);
  assert.deepEqual(calls, [{ bloom: false }], 'bloom composite is disabled');
  assert.equal(state.render.softwareRenderer, true);
  assert.equal(state.render.dynResScale, 0.34, 'software emergency starts at its established adaptive floor');
  assert.match(profile.toast.text, /hardware acceleration appears OFF/i, 'the toast names the cause');
  assert.equal(profile.toast.kind, 'warn');
  assert.equal(profile.toastDelayMs > 0, true, 'toast is scheduled after boot');

  // Never persisted: the player-visible reduction is runtime-only, so a hardware
  // context after relaunch fully recovers.
  assert.deepEqual(state.settings.video, videoBefore, 'settings.video is untouched by the software profile');
});

test('bloom is cut only when gpu.software === true — integrated and discrete keep it', () => {
  const tiers = [
    { renderer: 'Intel UHD Graphics 630', vendor: 'Intel', software: false, tier: 'integrated' },
    { renderer: 'NVIDIA GeForce RTX 4070', vendor: 'NVIDIA', software: false, tier: 'discrete' },
    { renderer: '', vendor: '', software: false, tier: 'unknown' },
    null,
    { renderer: 'ANGLE (llvmpipe)', vendor: 'Mesa', software: false, tier: 'software' }, // flag is the gate, not the tier string
  ];
  for (const gpu of tiers) {
    assert.equal(softwareRendererEmergencyProfile(gpu), null, `no emergency profile for ${JSON.stringify(gpu)}`);
  }
  // An integrated-tier profile keeps bloom: it only earns a suggestion, never an auto-cut.
  assert.equal(shouldSuggestIntegratedPreset({ tier: 'integrated' }, { qualityPreset: 'medium' }), true);
  assert.equal(shouldSuggestIntegratedPreset({ tier: 'integrated' }, { qualityPreset: 'integrated' }), false);
  assert.equal(shouldSuggestIntegratedPreset({ tier: 'software', software: true }, {}), false,
    'a software context gets the emergency profile, not the integrated suggestion');
});

test('the toast contract stays frozen and tier floors stay ordered', () => {
  assert.equal(Object.isFrozen(SOFTWARE_RENDERER_TOAST), true);
  assert.match(SOFTWARE_RENDERER_TOAST.text, /hardware acceleration/i);
  assert.ok(dynResFloorForTier('software') < dynResFloorForTier('integrated'), 'software drops further than integrated');
  assert.ok(dynResFloorForTier('integrated') < dynResFloorForTier('discrete'), 'integrated drops further than discrete');
  assert.equal(dynResFloorForTier('unknown'), dynResFloorForTier('discrete'), 'unknown tiers ride the default floor');
});
