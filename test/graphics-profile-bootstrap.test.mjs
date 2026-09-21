import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import {
  AUDIO_DEFAULT_MUTE_VERSION,
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

// PQ-210.04 / PQ-158.06: action audio ships on by default. v1 of the migration policy force-muted
// every older profile once (the procedural stack was opt-in); v2 reverses that default — older
// profiles cannot distinguish a deliberate mute from the policy default, so they all receive one
// unmute. A mute made under the current policy keeps the stamped version and is never touched.
test('pre-v2 profiles are unmuted once before registry while post-policy choices survive', () => {
  const legacyStorage = storageWith(JSON.stringify({
    version: 1,
    settings: { audio: { master: 0.9, muted: true } },
  }));
  const migrated = createGameState(4);
  assert.equal(bootstrapProfileSettingsBeforeRegistry(migrated, legacyStorage), true);
  assert.equal(migrated.settings.audio.muted, false,
    'a v1 muted profile cannot tell policy-mute from player-mute, so the audible default wins once');
  assert.equal(migrated.settings.audio.defaultMuteVersion, AUDIO_DEFAULT_MUTE_VERSION);
  assert.equal(legacyStorage.writes(), 0, 'boot migration must not rewrite a profile behind the player');

  const optedInStorage = storageWith(JSON.stringify({
    version: 1,
    settings: {
      audio: {
        master: 0.9,
        muted: true,
        defaultMuteVersion: AUDIO_DEFAULT_MUTE_VERSION,
      },
    },
  }));
  const optedIn = createGameState(5);
  assert.equal(bootstrapProfileSettingsBeforeRegistry(optedIn, optedInStorage), true);
  assert.equal(optedIn.settings.audio.muted, true,
    'an explicit mute made under the current policy must remain a player choice');

  const futureStorage = storageWith(JSON.stringify({
    version: 1,
    settings: {
      audio: { muted: true, defaultMuteVersion: AUDIO_DEFAULT_MUTE_VERSION + 1 },
    },
  }));
  const future = createGameState(6);
  assert.equal(bootstrapProfileSettingsBeforeRegistry(future, futureStorage), true);
  assert.equal(future.settings.audio.muted, true,
    'a stamp from a newer policy version is left alone — its semantics belong to that version');
  assert.equal(future.settings.audio.defaultMuteVersion, AUDIO_DEFAULT_MUTE_VERSION + 1);
});

// OWNER, 2026-09-20: "the vfx for the attacks is limp and a lot of times doesn't even move, it'll be
// like a blue swirl and literally be a frozen frame moving and not spinning or anything." The
// owner's Windows has "Animation effects" off, Chromium reports that as prefers-reduced-motion, and
// the old silent 'system' default turned off hit-stop, trauma, event lights and field motion.
test('a profile that never chose its motion setting boots with full combat effects', async () => {
  const { GAME_MOTION_DEFAULT_VERSION, migrateGameMotionDefault } = await import('../src/core/graphicsProfileBootstrap.js');
  const ownerProfile = JSON.stringify({
    settings: {
      accessibility: { motionPreference: 'system' },
      video: { motionReduce: true },
    },
  });
  const state = createGameState(11);
  assert.equal(bootstrapProfileSettingsBeforeRegistry(state, storageWith(ownerProfile)), true);
  assert.equal(state.settings.accessibility.motionPreference, 'full',
    'the silent OS-following default is migrated once to full effects');
  assert.equal(state.settings.video.motionReduce, false,
    'the mirrored OS flag does not survive as if the player had asked for it');
  assert.equal(state.settings.accessibility.motionDefaultVersion, GAME_MOTION_DEFAULT_VERSION);

  const reduce = migrateGameMotionDefault({ accessibility: { motionPreference: 'reduce' }, video: { motionReduce: true } });
  assert.equal(reduce.accessibility.motionPreference, 'reduce', 'an explicit Reduce is always kept');
  assert.equal(reduce.video.motionReduce, true);

  const ancient = migrateGameMotionDefault({ video: { motionReduce: true } });
  assert.equal(ancient.accessibility.motionPreference, 'reduce',
    'before motionPreference existed, the boolean was the explicit choice');

  const chosenSystem = migrateGameMotionDefault({
    accessibility: { motionPreference: 'system', motionDefaultVersion: GAME_MOTION_DEFAULT_VERSION },
    video: { motionReduce: true },
  });
  assert.equal(chosenSystem.accessibility.motionPreference, 'system',
    'a player who picks System after the migration keeps it');

  assert.equal(createGameState(12).settings.accessibility.motionPreference, 'full',
    'a fresh profile starts with full effects and carries the version');
  assert.equal(createGameState(12).settings.accessibility.motionDefaultVersion, GAME_MOTION_DEFAULT_VERSION);
});
