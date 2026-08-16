import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPES } from '../src/data/audioRecipes.js';
import { audio, FIELD_AUDIO_SIGNATURES, musicTransitionSchedule } from '../src/audio/audioSystem.js';
import {
  AUDIO_PRIORITY_LADDER,
  createCuePriorityBus,
} from '../src/audio/cuePriorityBus.js';
import { playRecipe } from '../src/audio/synth.js';

function eventBus() {
  const listeners = new Map();
  return {
    on(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn);
      listeners.set(name, rows);
      return () => {};
    },
    emit(name, payload) {
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

function baseState() {
  return {
    playerId: 1,
    player: { tether: {} },
    entities: new Map([
      [1, { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }],
      [7, { id: 7, alive: true, pos: { x: 80, z: -30 }, vel: { x: 0, z: 0 } }],
      [9, { id: 9, alive: true, pos: { x: -120, z: 20 }, vel: { x: -4, z: 0 } }],
    ]),
    entityList: [],
    settings: {
      audio: { master: 0.55, sfx: 0.7, music: 0.32, muted: false },
      video: { motionReduce: false },
    },
    ui: { docked: false },
    world: {},
    input: { actions: {} },
  };
}

function param(value = 0) {
  const calls = [];
  return {
    value, calls,
    cancelScheduledValues(at) { calls.push(['cancel', at]); },
    setValueAtTime(next, at) { this.value = next; calls.push(['set', next, at]); },
    linearRampToValueAtTime(next, at) { this.value = next; calls.push(['linear', next, at]); },
    exponentialRampToValueAtTime(next, at) { this.value = next; calls.push(['exponential', next, at]); },
    setTargetAtTime(next, at, constant) { this.value = next; calls.push(['target', next, at, constant]); },
  };
}

test('Plan 40 registers three distinct continuous field voices and authored-source fallbacks', () => {
  const byId = new Map(RECIPES.map((recipe) => [recipe.id, recipe]));
  const ids = Object.values(FIELD_AUDIO_SIGNATURES).map((signature) => signature.recipeId);
  assert.equal(new Set(ids).size, 3);
  assert.deepEqual(ids.map((id) => byId.get(id)?.type), [
    'continuous_oscillator', 'continuous_noise', 'continuous_noise',
  ]);
  assert.deepEqual(ids.map((id) => byId.get(id)?.authoredSourceId), [
    'field.well.presence', 'field.repulsor.presence', 'field.cone.presence',
  ]);
  assert.equal(byId.get('sfx_burn_up_roar').type, 'continuous_noise');
  assert.equal(byId.get('sfx_heavy_cookoff_main').type, 'layered');
});

test('production field, plunge, and heavy phase events own bounded audio lifecycles', () => {
  const bus = eventBus();
  const harness = Object.create(audio);
  harness.init({ state: baseState(), bus, helpers: {} });
  const started = [];
  const ended = [];
  const played = [];
  const priority = [];
  harness._startLoopVoice = (recipeId, position, gain) => {
    const voice = {
      recipeId, position, gain, loop: true, role: 'ambient', busName: 'ambient',
      gain: { gain: param(gain) }, sources: [], _baseGain: gain,
    };
    started.push(voice);
    return voice;
  };
  harness._endLoopVoice = (voice) => { voice.ended = true; ended.push(voice); };
  harness.play = (recipeId, options) => { played.push({ recipeId, options }); return {}; };
  harness._applyPriorityCue = (cue) => { priority.push(cue); return {}; };

  bus.emit('fields:deployed', {
    fieldId: 'well_1', kind: 'well', sourceId: 7, center: { x: 80, z: -30 },
  });
  assert.equal(harness.rt._wantEnvironmentLoops.field_well_1.recipeId, 'sfx_field_well_presence');
  harness._restoreEnvironmentLoop('field_well_1');
  assert.equal(started.at(-1).trackId, 7);
  bus.emit('fields:ended', { fieldId: 'well_1', kind: 'well' });
  assert.equal(ended.length, 1);
  assert.equal(harness.rt._wantEnvironmentLoops.field_well_1, undefined);

  bus.emit('fields:coneToggled', { active: true, fieldId: 'cone_1' });
  harness._restoreEnvironmentLoop('field_cone_1');
  assert.equal(started.at(-1).recipeId, 'sfx_field_cone_presence');
  assert.equal(started.at(-1).trackId, 1);
  bus.emit('fields:cleared', { reason: 'sector_change' });
  assert.equal(Object.keys(harness.rt._wantEnvironmentLoops).length, 0);

  bus.emit('planet:plungeStage', { id: 9, stage: 'breakup' });
  harness._restoreEnvironmentLoop('burn_9');
  assert.equal(started.at(-1).recipeId, 'sfx_burn_up_roar');
  assert.equal(started.at(-1).trackId, 9);
  bus.emit('planet:plungeStage', { id: 9, stage: 'descent' });
  assert.ok(harness.rt.loops.burn_9._baseGain > 0.2, 'descent raises the existing roar');
  bus.emit('planet:plungeStage', { id: 9, stage: 'aftermath' });
  assert.equal(harness.rt._wantEnvironmentLoops.burn_9, undefined);

  for (let index = 0; index < 4; index++) {
    bus.emit('combat:heavyCookOffPhase', {
      phase: 'secondary', secondaryIndex: index, position: { x: index, z: 0 }, actorId: 1,
    });
  }
  bus.emit('combat:heavyCookOffPhase', {
    phase: 'main', position: { x: 4, z: 0 }, actorId: 1,
  });
  assert.deepEqual(played.map((entry) => entry.recipeId), [
    'sfx_heavy_cookoff_thump', 'sfx_heavy_cookoff_thump',
    'sfx_heavy_cookoff_thump', 'sfx_heavy_cookoff_thump',
    'sfx_heavy_cookoff_main',
  ]);
  assert.equal(priority.at(-1).priorityLane, 'deaths');
});

test('adaptive music waits for the outgoing musical bar except urgent combat entry', () => {
  assert.deepEqual(musicTransitionSchedule(1.2, 'tense'), { atS: 3, crossfadeS: 2.5 });
  assert.deepEqual(musicTransitionSchedule(1.2, 'combat'), { atS: 1.2, crossfadeS: 0.72 });

  const gains = { A: { gain: param(0.4) }, B: { gain: param(0.5) }, C: { gain: param(0) }, D: { gain: param(0) } };
  const harness = Object.create(audio);
  harness.rt = { ctx: { currentTime: 1.2 }, stemGains: gains, musicState: 'calm' };
  harness._setMusicState('tense', false);
  assert.deepEqual(harness.rt._musicTransition, { state: 'tense', startAt: 3, endAt: 5.5 });
  assert.ok(gains.B.gain.calls.some((call) => call[0] === 'set' && call[2] === 3));
  assert.ok(gains.B.gain.calls.some((call) => call[0] === 'linear' && call[2] === 5.5));

  harness.rt.ctx.currentTime = 7.25;
  harness._setMusicState('combat', false);
  assert.deepEqual(harness.rt._musicTransition, { state: 'combat', startAt: 7.25, endAt: 7.97 });
});

test('priority arbiter follows the seven-rung mix ladder', () => {
  assert.deepEqual(AUDIO_PRIORITY_LADDER, [
    'playerCriticalPhysics', 'weapons', 'pickupStream', 'deaths',
    'worldEvents', 'comms', 'ambienceMusic',
  ]);
  const bus = createCuePriorityBus();
  const death = bus.applyCue({ id: 'cookoff', importance: 0.9, priorityLane: 'deaths' }, 100);
  assert.equal(bus.gainFor({ role: 'weaponLoop', loop: true }, 101), 1,
    'a death cannot suppress higher-priority weapons');
  assert.equal(bus.gainFor({ role: 'ambient', loop: true }, 101), death.duckGain,
    'a death suppresses lower-priority ambience');
  const critical = bus.applyCue({ id: 'hull', importance: 1, priorityLane: 'playerCriticalPhysics' }, 200);
  assert.equal(bus.gainFor({ role: 'weaponLoop', loop: true }, 201), critical.duckGain);
  assert.equal(bus.gainFor({ role: 'critical', critical: true }, 201), 1);
});

test('decoded authored recordings replace synth graphs and failed loads retain the fallback', async () => {
  const buffer = { duration: 2.5, sampleRate: 48000 };
  const sources = [];
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 1,
    createGain() { return { ...node(), gain: param(1) }; },
    createBufferSource() {
      const source = { ...node(), buffer: null, loop: false, playbackRate: param(1), start() {}, stop() {} };
      sources.push(source);
      return source;
    },
  };
  const recipe = RECIPES.find((entry) => entry.id === 'sfx_field_well_presence');
  const voice = playRecipe(ctx, recipe, node(), { authoredBuffer: buffer, peakGain: 0.2 }, {});
  assert.equal(sources.length, 1);
  assert.equal(sources[0].buffer, buffer);
  assert.equal(sources[0].loop, true);
  assert.equal(voice.loop, true);

  const harness = Object.create(audio);
  harness.rt = {
    _authoredBuffers: new Map(),
    ctx: { decodeAudioData: async () => buffer },
  };
  assert.equal(await harness.loadAuthoredSource('field.well.presence', '/audio/well.ogg', async () => ({
    ok: true, arrayBuffer: async () => new ArrayBuffer(8),
  })), true);
  assert.equal(harness.rt._authoredBuffers.get('field.well.presence'), buffer);
  assert.equal(await harness.loadAuthoredSource('field.repulsor.presence', '/missing.ogg', async () => ({ ok: false })), false);
  assert.equal(harness.rt._authoredBuffers.has('field.repulsor.presence'), false);
});
