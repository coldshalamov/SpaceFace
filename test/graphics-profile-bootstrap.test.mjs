import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  PROFILE_SETTINGS_KEY,
  bootstrapProfileSettingsBeforeRegistry,
  mergeProfileSettings,
  readProfileSettings,
} from '../src/core/graphicsProfileBootstrap.js';

function storageWith(raw) {
  let writes = 0;
  return {
    getItem(key) { return key === PROFILE_SETTINGS_KEY ? raw : null; },
    setItem() { writes++; },
    writes() { return writes; },
  };
}

test('pre-registry bootstrap applies current graphics profile without rewriting raw bytes', () => {
  const raw = JSON.stringify({
    version: 1,
    updatedAt: 'frozen',
    settings: { video: { renderScale: 0.85, pixelRatioCap: 2, shadows: false, particleQuality: 'medium' } },
  });
  const storage = storageWith(raw);
  const state = createGameState(1);

  assert.equal(bootstrapProfileSettingsBeforeRegistry(state, storage), true);
  assert.equal(state.settings.video.renderScale, 0.85);
  assert.equal(state.settings.video.shadows, false);
  assert.equal(state.settings.video.particleQuality, 'medium');
  assert.equal(storage.getItem(PROFILE_SETTINGS_KEY), raw);
  assert.equal(storage.writes(), 0);
});

test('max profile reaches full runtime values with no quality cap, then current restores', () => {
  const state = createGameState(2);
  const max = mergeProfileSettings(state.settings, {
    video: { renderScale: 2, pixelRatioCap: 4, shadows: true, particleQuality: 'high' },
  });
  assert.deepEqual(
    {
      renderScale: max.video.renderScale,
      pixelRatioCap: max.video.pixelRatioCap,
      shadows: max.video.shadows,
      particleQuality: max.video.particleQuality,
    },
    { renderScale: 2, pixelRatioCap: 4, shadows: true, particleQuality: 'high' },
  );

  const current = mergeProfileSettings(max, {
    video: { renderScale: 0.85, pixelRatioCap: 2, shadows: false, particleQuality: 'medium' },
  });
  assert.equal(current.video.renderScale, 0.85);
  assert.equal(current.video.particleQuality, 'medium');
});

test('bootstrap rejects malformed profiles and preserves locked runtime backends', () => {
  assert.equal(readProfileSettings(storageWith('{broken')), null);

  const state = createGameState(3);
  const raw = JSON.stringify({
    settings: {
      gameplay: { physicsBackend: 'custom', aiBackend: 'legacy', flightBackend: 'legacy' },
      video: { particleQuality: 'high' },
    },
  });
  assert.equal(bootstrapProfileSettingsBeforeRegistry(state, storageWith(raw)), true);
  assert.equal(state.settings.gameplay.physicsBackend, 'rapier-dynamic');
  assert.equal(state.settings.gameplay.aiBackend, 'sg06-tactical');
  assert.equal(state.settings.gameplay.flightBackend, 'v3');
  assert.equal(state.settings.video.particleQuality, 'high');
});
