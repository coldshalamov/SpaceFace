import assert from 'node:assert/strict';
import test from 'node:test';
import { audio, getReplayAudioSource } from '../src/audio/audioSystem.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cachedBarkBuffer, barkPlaybackRate } from '../src/audio/barkPcmCache.js';
import { resolveBarkVoice } from '../src/audio/barkVoice.js';
import { applyOutputMix, stationIdentNotes } from '../src/audio/outputMix.js';
import { createThreatEar } from '../src/audio/threatEar.js';
import { environmentIr, renderEnvironmentIr } from '../src/audio/environmentMix.js';

const param = () => ({ value: 0, setTargetAtTime(v) { this.value = v; } });
function context() {
  const sources = [];
  const node = extra => ({ connect() {}, disconnect() { this.disconnected = true; }, ...extra });
  return {
    currentTime: 1, state: 'running', sources,
    createBuffer: (channels, length, rate) => {
      const pcm = new Float32Array(length);
      return { duration: length / rate, sampleRate: rate, getChannelData: () => pcm };
    },
    createOscillator: () => { const o = node({ frequency: param(), start() {}, stop() { this.stopped = true; } }); sources.push(o); return o; },
    createGain: () => node({ gain: param() }),
    createBiquadFilter: () => node({ frequency: param() }),
    createPanner: () => node({ positionX: param(), positionY: param(), positionZ: param() }),
  };
}
function host() {
  const state = createGameState(4242), bus = createBus(), played = [];
  state.entities = new Map(); state.entityList = []; state.playerId = 7;
  const h = Object.create(audio);
  h.play = (recipeId, opts) => { played.push({ recipeId, opts }); return {}; };
  h.init({ state, bus, helpers: {} });
  h.rt.ctx = context();
  h._isCriticalSquelchActive = () => false;
  h._applyFactionSting = () => {};
  h._emitPresentationCaption = () => {};
  return { h, state, bus, played };
}

test('two faction lines use their own cached utterance PCM and deterministic playback pitch walk', () => {
  const { h, bus, played } = host();
  const lines = ['Hold the manifest. We will count every crate.', 'Your cargo is clear. Move along.'];
  const buffers = [];
  for (const line of lines) {
    bus.emit('barkDirector:voice', { factionId: 'faction_scn', situation: 'scan', line });
    const body = played.findLast(p => p.recipeId === 'sfx_bark_radio');
    assert.ok(body.opts.barkPcmBuffer);
    buffers.push(body.opts.barkPcmBuffer.getChannelData(0));
  }
  assert.notDeepEqual(buffers[0], buffers[1]);
  const a = resolveBarkVoice({ factionId: 'faction_scn', situation: 'scan', line: lines[0] });
  const b = resolveBarkVoice({ factionId: 'faction_scn', situation: 'scan', line: lines[1] });
  assert.notEqual(barkPlaybackRate(a), barkPlaybackRate(b));
  const cache = h.rt._barkPcmCache;
  const original = cachedBarkBuffer(h.rt.ctx, cache, a);
  assert.equal(cachedBarkBuffer(h.rt.ctx, cache, a), original);
  for (let i = 0; i < 12; i++) cachedBarkBuffer(h.rt.ctx, cache, resolveBarkVoice({ factionId: 'faction_scn', line: `Manifest ${i}.` }));
  assert.equal(cache.size, 8);
});

test('five blind rear bearings route within 45 degrees in listener space; HRTF cap six and rear filtering', () => {
  const ctx = context(), ear = createThreatEar(ctx, { connect() {} });
  const player = { id: 7, team: 'player', rot: 0.37, pos: { x: 80, z: -20 } };
  const angles = [110, 145, 180, 215, 250];
  const entityList = angles.map((angle, i) => {
    const rad = angle / 180 * Math.PI + player.rot;
    return { id: i + 20, alive: true, type: 'ship', team: 'enemy', pos: { x: player.pos.x + Math.cos(rad) * 500, z: player.pos.z + Math.sin(rad) * 500 }, data: { combat: { targetId: 7 } } };
  });
  const state = { entityList };
  ear.update(state, player);
  let localized = 0;
  for (let i = 0; i < angles.length; i++) {
    const voice = ear.voices.get(i + 20);
    const angle = (Math.atan2(voice.pan.positionX.value, -voice.pan.positionZ.value) * 180 / Math.PI + 360) % 360;
    const delta = Math.abs(((angle - angles[i] + 540) % 360) - 180);
    if (delta <= 45) localized++;
    assert.equal(voice.pan.panningModel, 'HRTF');
    assert.equal(voice.filter.frequency.value, 1500);
  }
  assert.equal(localized, 5, 'routing geometry only; this does not claim five human localization trials');
  for (let i = 0; i < 10; i++) entityList.push({ ...entityList[0], id: 100 + i });
  ear.update(state, player);
  assert.equal(ear.voices.size, 6);
  const voiceCount = ctx.sources.length;
  ear.update(state, player);
  assert.equal(ctx.sources.length, voiceCount, 'same six hostiles reuse graphs');
  ear.update(state, null, false);
  assert.equal(ear.voices.size, 0);
  assert.ok(ctx.sources.every(o => o.stopped && o.disconnected));
});

test('WANTED tier changes reach the score immediately and the escalation cue stays within one bar', () => {
  const { h, bus, played } = host();
  const lifts = [];
  for (const level of [1, 2, 3, 4, 5]) {
    bus.emit('heat:changed', { level, previousLevel: level - 1, wanted: true, wantedCrossed: level === 1 });
    lifts.push(h._stuntScoreLift());
    assert.equal(h.rt._musicDirty, true);
    const cue = played.at(-1);
    assert.equal(cue.recipeId, 'sfx_wanted_alert');
    assert.ok(cue.opts.startTime == null || cue.opts.startTime <= h.rt.ctx.currentTime + 60 / 122 * 4);
  }
  assert.ok(lifts.every((v, i) => !i || v > lifts[i - 1]));
  bus.emit('heat:changed', { level: 0, wanted: false, wantedCrossed: true });
  assert.equal(h._stuntScoreLift(), 0);
});

test('two distinct interior room presets, station ident signatures, and keyed wave-clear cadence exist on production path', () => {
  assert.notEqual(environmentIr('hangar').decayS, environmentIr('station').decayS);
  assert.notDeepEqual(renderEnvironmentIr('hangar', 8000).pcm, renderEnvironmentIr('station', 8000).pcm);
  assert.notDeepEqual(stationIdentNotes('station_helios'), stationIdentNotes('station_ceres'));
  const { h, played } = host();
  h._onCue({ id: 'swarm.clearResolve' });
  assert.deepEqual(played.map(p => p.recipeId), ['sfx_promotion_chord', 'sfx_stunt_link']);
  assert.ok(played[1].opts.startTime > played[0].opts.startTime);
});

test('mono is a real downmix and night mode compresses the existing output; both restore shipped values', () => {
  const rt = { masterGain: {}, limiter: Object.fromEntries(['threshold', 'knee', 'ratio', 'attack', 'release'].map(k => [k, param()])) };
  applyOutputMix(rt, { mono: true, nightMode: true });
  assert.equal(rt.masterGain.channelCount, 1);
  assert.equal(rt.masterGain.channelCountMode, 'explicit');
  assert.equal(rt.masterGain.channelInterpretation, 'speakers');
  assert.equal(rt.limiter.threshold.value, -28);
  assert.equal(rt.limiter.ratio.value, 6);
  applyOutputMix(rt, {});
  assert.equal(rt.masterGain.channelCount, 2);
  assert.equal(rt.limiter.threshold.value, -6);
  const defaults = createGameState(4242).settings.audio;
  assert.equal(defaults.mono, false); assert.equal(defaults.nightMode, false);
  assert.equal(getReplayAudioSource(), null, 'reading a recording tap never starts a context');
});
