// test/pq-158-05-mix.test.mjs — PQ-158.05 leaf gate.
//
// DONE WHEN: hangar vs void audibly different; ducking table test.
// Seed 15805. Convolver params per environment class, weight-first ducking, visual-event cues.
// Tests import shipped functions from src/audio/environmentMix.js.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';
import { dbToGain } from '../src/audio/cuePriorityBus.js';
import {
  ENVIRONMENT_MIX_SEED,
  ENVIRONMENT_CLASSES,
  ENVIRONMENT_IR,
  WEIGHT_DUCK_TARGETS,
  VISUAL_EVENT_CUES,
  VISUAL_EVENT_BUS,
  LIVE_VFX_ALIASES,
  resolveEnvironmentClass,
  environmentIr,
  hangarVersusVoidDifference,
  renderEnvironmentIr,
  weightDuckDb,
  weightDuckEnvelope,
  weightDuckGainForTarget,
  weightDuckTable,
  isWeightDuckTarget,
  visualEventAudioAllowed,
  resolveVisualEventCue,
  visualEventCueIsWired,
  createEnvironmentMixRuntime,
} from '../src/audio/environmentMix.js';

const MEASURE_SEED = 15805;

function fakeAudioContext() {
  const node = () => ({
    gain: {
      value: 1,
      setValueAtTime(v) { this.value = v; },
      setTargetAtTime(v) { this.value = v; },
    },
    delayTime: { value: 0 },
    connect() {},
    disconnect() {},
    normalize: true,
    buffer: null,
  });
  return {
    sampleRate: 16000,
    currentTime: 0,
    createGain: node,
    createConvolver: node,
    createDelay: () => node(),
    createBuffer(channels, length, sampleRate) {
      const data = new Float32Array(length);
      return {
        numberOfChannels: channels,
        length,
        sampleRate,
        getChannelData() { return data; },
      };
    },
  };
}

test(`seed ${MEASURE_SEED}: hangar vs void are audibly different rooms`, () => {
  assert.equal(ENVIRONMENT_MIX_SEED, MEASURE_SEED);
  assert.deepEqual([...ENVIRONMENT_CLASSES], ['void', 'hangar', 'station']);
  const diff = hangarVersusVoidDifference();
  const voidIr = environmentIr('void');
  const hangarIr = environmentIr('hangar');
  const stationIr = environmentIr('station');
  assert.equal(voidIr.mix < 0.1, true, 'void is dry');
  assert.equal(hangarIr.mix > 0.3, true, 'hangar is a wet room');
  assert.ok(hangarIr.decayS > voidIr.decayS * 4, 'hangar hangs; void dies immediately');
  assert.ok(hangarIr.brightness > voidIr.brightness, 'hangar is brighter metal');
  assert.ok(stationIr.decayS > hangarIr.decayS, 'station is the bigger volume');
  assert.equal(diff.seed, MEASURE_SEED);
  assert.ok(diff.wetDb >= 12, `hangar vs void wet mix must differ by >= 12 dB, got ${diff.wetDb}`);
  assert.equal(resolveEnvironmentClass({}), 'void');
  assert.equal(resolveEnvironmentClass({ docked: true }), 'station');
  assert.equal(resolveEnvironmentClass({ hangar: true }), 'hangar');
  assert.equal(resolveEnvironmentClass({ screen: 'shipworks' }), 'hangar');
  assert.equal(resolveEnvironmentClass({ docked: true, screen: 'shipworks' }), 'hangar');
  console.log(`[pq-158.05 rooms] seed=${MEASURE_SEED} void mix=${voidIr.mix} decay=${voidIr.decayS}s | hangar mix=${hangarIr.mix} decay=${hangarIr.decayS}s | station mix=${stationIr.mix} decay=${stationIr.decayS}s | hangar/void wet ${diff.wetDb} dB`);
});

test('IR render: hangar energy lasts; void is a short tick — same seed, stable bytes', () => {
  const voidIr = renderEnvironmentIr('void', 16000);
  const hangarIr = renderEnvironmentIr('hangar', 16000);
  const again = renderEnvironmentIr('hangar', 16000);
  assert.equal(voidIr.classId, 'void');
  assert.equal(hangarIr.pcm.length, again.pcm.length);
  assert.deepEqual([...hangarIr.pcm.subarray(0, 32)], [...again.pcm.subarray(0, 32)]);
  const rms = (pcm, a, b) => {
    let s = 0;
    const lo = Math.max(0, a);
    const hi = Math.min(pcm.length, b);
    for (let i = lo; i < hi; i++) s += pcm[i] * pcm[i];
    return Math.sqrt(s / Math.max(1, hi - lo));
  };
  const voidTail = rms(voidIr.pcm, voidIr.pcm.length * 0.6, voidIr.pcm.length);
  const hangarTail = rms(hangarIr.pcm, hangarIr.pcm.length * 0.35, hangarIr.pcm.length * 0.7);
  assert.ok(hangarTail > voidTail, `hangar tail ${hangarTail} must outlive void tail ${voidTail}`);
  assert.equal(ENVIRONMENT_IR.void.id, 'void');
});

test('weight-first ducking table: scout-on-rock light vs freighter-on-station heavy', () => {
  const table = weightDuckTable();
  assert.equal(table.seed, MEASURE_SEED);
  const scout = { mass: 16, dp: 40, importance: 0.2 };
  const freighter = { mass: 200, dp: 24000, importance: 0.9 };
  const scoutDb = weightDuckDb(scout);
  const freightDb = weightDuckDb(freighter);
  const scoutEnv = weightDuckEnvelope(scout, 0);
  const freightEnv = weightDuckEnvelope(freighter, 0);
  console.log(`[pq-158.05 duck] seed=${MEASURE_SEED} scout ${table.scoutOnRockDb} dB (gain ${scoutEnv.duckGain}) | freighter ${table.freighterOnStationDb} dB (gain ${freightEnv.duckGain})`);
  assert.equal(table.scoutOnRockDb, -6);
  assert.equal(table.freighterOnStationDb, -18);
  assert.ok(freightDb < scoutDb - 6, `heavy must duck at least 6 dB more than light (${freightDb} vs ${scoutDb})`);
  assert.ok(freightDb <= -12, 'a freighter broadside must take music down by >= 12 dB');
  assert.equal(scoutEnv.seed, MEASURE_SEED);
  assert.deepEqual([...WEIGHT_DUCK_TARGETS], ['music', 'ambient']);
  assert.equal(isWeightDuckTarget('music'), true);
  assert.equal(isWeightDuckTarget('ambient'), true);
  assert.equal(isWeightDuckTarget({ role: 'critical', critical: true }), false);
  assert.equal(isWeightDuckTarget('comms'), false);
  assert.equal(weightDuckGainForTarget('music', freightEnv, 10), freightEnv.duckGain);
  assert.equal(weightDuckGainForTarget('ambient', freightEnv, 10), freightEnv.duckGain);
  assert.equal(weightDuckGainForTarget('ui', freightEnv, 10), 1);
  assert.equal(weightDuckGainForTarget('music', freightEnv, freightEnv.endMs + 1), 1);
  const expectedGain = Math.round(dbToGain(freightDb) * 10000) / 10000;
  assert.equal(freightEnv.duckGain, expectedGain);
});

test('visual events have audio cues and captions (accessibility)', () => {
  const ids = Object.keys(VISUAL_EVENT_CUES);
  assert.ok(ids.length >= 8);
  for (const id of ids) {
    const cue = resolveVisualEventCue(id);
    assert.ok(cue.recipeId, id);
    assert.ok(cue.caption && cue.caption.length > 2, `${id} caption`);
    assert.equal(visualEventCueIsWired(id, AUDIO_RECIPE_BY_ID), true, `${id} recipe ${cue.recipeId} missing`);
  }
  assert.equal(resolveVisualEventCue('explosion').recipeId, VISUAL_EVENT_CUES['vfx.explosion'].recipeId);
  assert.equal(resolveVisualEventCue('missing-event'), null);
  assert.equal(visualEventAudioAllowed({ accessibility: { audioCues: true } }), true);
  assert.equal(visualEventAudioAllowed({ accessibility: { audioCues: false } }), false);
  assert.equal(visualEventAudioAllowed(false), false);
});

test(`seed ${MEASURE_SEED}: live presentation:vfxCue ids resolve; graph listens on the live bus`, () => {
  assert.equal(VISUAL_EVENT_BUS, 'presentation:vfxCue');
  const live = [
    ['combat.damage.shield', 'vfx.shieldHit'],
    ['combat.damage.hull', 'vfx.hullHit'],
    ['combat.damage.armor', 'vfx.hullHit'],
    ['combat.damage.kill', 'vfx.kill'],
    ['combat.damage.charge', 'vfx.explosion'],
    ['combat.weakPoint', 'vfx.explosion'],
    ['vfx.muzzle.kinetic_s', 'vfx.muzzle'],
    ['vfx.impact.kinetic_s', 'vfx.hullHit'],
  ];
  for (const [liveId, family] of live) {
    const cue = resolveVisualEventCue(liveId);
    assert.ok(cue, `${liveId} must map`);
    assert.equal(cue.eventId, family, `${liveId} → ${family}`);
    assert.equal(visualEventCueIsWired(liveId, AUDIO_RECIPE_BY_ID), true, `${liveId} recipe missing`);
  }
  assert.ok(Object.keys(LIVE_VFX_ALIASES).length >= 6);
  const srcPath = fileURLToPath(new URL('../src/audio/audioSystem.js', import.meta.url));
  const src = readFileSync(srcPath, 'utf8');
  assert.ok(src.includes('VISUAL_EVENT_BUS'), 'audio system must subscribe via VISUAL_EVENT_BUS');
  assert.ok(!src.includes("bus.on('presentation:vfx'"), 'dead presentation:vfx listener would miss the player route');
  console.log(`[pq-158.05 live-vfx] seed=${MEASURE_SEED} bus=${VISUAL_EVENT_BUS} aliases=${Object.keys(LIVE_VFX_ALIASES).length}`);
});

test('one convolver per environment class: hangar wet send, void almost dry', () => {
  const dest = { connect() {}, disconnect() {} };
  const mix = createEnvironmentMixRuntime(fakeAudioContext(), dest, { classId: 'void' });
  assert.equal(mix.classId, 'void');
  assert.equal(mix.mixFor('void'), ENVIRONMENT_IR.void.mix);
  assert.equal(mix.mixFor('hangar'), ENVIRONMENT_IR.hangar.mix);
  assert.ok(mix.mixFor('hangar') / mix.mixFor('void') >= 6, 'hangar wet send is several times the void');
  assert.equal(mix.setClass('hangar', true), 'hangar');
  assert.equal(mix.classId, 'hangar');
  assert.ok(mix.classes.void && mix.classes.hangar && mix.classes.station);
  mix.destroy();
});
