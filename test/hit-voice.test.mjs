import assert from 'node:assert/strict';
import test from 'node:test';
import {
  admitLayerVoice,
  damageLayer,
  dopplerFactor,
  layerRecipeId,
  pickRemoteEngines,
  remoteEnginePlaybackRate,
} from '../src/audio/hitVoice.js';
import { resolveAudioCueRecipeId } from '../src/audio/audioSystem.js';
import { resolveSampleBinding } from '../src/audio/sampleLibrary.js';

test('a shield tick is not a break, and a break is not a tick', () => {
  assert.equal(damageLayer({ shieldAbsorbed: true, shieldDamage: 4 }), 'shield');
  assert.equal(damageLayer({ brokeShield: true, shieldAbsorbed: true }), null);
  assert.equal(damageLayer({ dominantLayer: 'armor', armorDamage: 2 }), 'armor');
  assert.equal(damageLayer({ hullHit: true }), 'hull');
  assert.equal(layerRecipeId('shield'), 'sfx.shieldHit');
  assert.equal(layerRecipeId('armor'), 'sfx.armorHit');
  assert.equal(layerRecipeId('hull'), 'sfx.hullHit');
});

test('the same target does not stack a second layer voice inside the gap', () => {
  const book = Object.create(null);
  assert.equal(admitLayerVoice(book, 7, 'shield', 1000), true);
  assert.equal(admitLayerVoice(book, 7, 'shield', 1020), false);
  assert.equal(admitLayerVoice(book, 8, 'shield', 1020), true);
  assert.equal(admitLayerVoice(book, 7, 'hull', 1020), true);
  assert.equal(admitLayerVoice(book, 7, 'shield', 1040), true);
});

test('doppler rises when the source is approaching and stays 1 without a velocity', () => {
  const listener = { x: 0, z: 0 };
  const source = { x: 100, z: 0 };
  const approaching = dopplerFactor(listener, { x: 0, z: 0 }, source, { x: -200, z: 0 });
  const leaving = dopplerFactor(listener, { x: 0, z: 0 }, source, { x: 200, z: 0 });
  assert.ok(approaching > 1, approaching);
  assert.ok(leaving < 1, leaving);
  assert.equal(dopplerFactor(listener, null, source, null), 1);
  assert.equal(dopplerFactor(listener, null, source, { x: NaN, z: 0 }), 1);
});

test('remote engines stay capped, nearest, and detuned by identity', () => {
  const rows = [
    { id: 1, dist: 40, throttle: 0.8, exact: true },
    { id: 2, dist: 10, throttle: 0.02, exact: true },
    { id: 3, dist: 12, throttle: 0.4, exact: false },
    { id: 4, dist: 15, throttle: 1, exact: true },
    { id: 5, dist: 80, throttle: 0.6, exact: true },
    { id: 6, dist: 20, throttle: 0.5, exact: true },
    { id: 7, dist: 30, throttle: 0.5, exact: true },
    { id: 8, dist: 25, throttle: 0.5, exact: true },
    { id: 9, dist: 18, throttle: 0.5, exact: true },
  ];
  const chosen = pickRemoteEngines(rows, 6);
  assert.equal(chosen.length, 6);
  assert.equal(chosen[0].id, 4);
  assert.ok(chosen.every((row) => row.throttle >= 0.05 && row.exact === true));
  const heavy = remoteEnginePlaybackRate(4, 200);
  const light = remoteEnginePlaybackRate(4, 10);
  assert.ok(heavy < light);
  assert.notEqual(remoteEnginePlaybackRate(4, 40), remoteEnginePlaybackRate(9, 40));
});

test('an unknown cue stays silent and the shield tick does not borrow the break sample', () => {
  assert.equal(resolveAudioCueRecipeId('not-a-real-cue'), null);
  assert.equal(resolveAudioCueRecipeId('sfx.shieldHit'), 'sfx.shieldHit');
  const shield = resolveSampleBinding('sfx.shieldHit');
  assert.equal(shield.share, 0);
  const kill = resolveSampleBinding('sfx.killConfirmed');
  assert.equal(kill.sampleId, 'kill_confirm_chime');
});
