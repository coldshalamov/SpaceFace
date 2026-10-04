// FB-079 — sustained states carry continuous voices. `sfx.cruiseEngaged` is a loop whose gain
// follows the throttle law (zero throttle is silence) and which STOPS — never fades — on
// `cruise:dropped`/`cruise:snared`. Fields hold entity-lifetime loops keyed by field id,
// ending with the field and capped like the bomb precedent. The tether tone is slack-silent
// and load-following, and the tow's own mass feeds it so a heavy tow creaks.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { RECIPES } from '../src/data/audioRecipes.js';
import { audio, resolveCruiseLoopEdge } from '../src/audio/audioSystem.js';
import {
  bindFieldAudio,
  collectFieldLoopSpecs,
  FIELD_LOOP_CAP,
  fieldLoopKey,
  syncFieldAudioLoops,
} from '../src/audio/fieldAudio.js';
import { BOMB_STATUS_LOOP_CAP } from '../src/audio/bombAudio.js';
import { resolveTetherTone, TETHER_TONE_SILENCE } from '../src/audio/masslineInstrument.js';
import { stepCueGain, CUE_GAIN } from '../src/presentation/throttleAnswer.js';

const SEED = 4242;
const recipeById = new Map(RECIPES.map((r) => [r.id, r]));

function fieldHost() {
  const started = [];
  const ended = [];
  const host = Object.create(audio);
  host.rt = { loops: {}, ctx: { currentTime: 0 } };
  host.state = {
    playerId: 'p',
    entities: new Map([['p', { pos: { x: 0, z: 0 }, alive: true }]]),
    fields: { active: [] },
  };
  host._startLoopVoice = (recipeId, position, gain, opts = {}) => {
    started.push({ recipeId, gain, ...opts });
    return { id: recipeId, gain: { value: gain }, trackId: opts.trackId };
  };
  host._endLoopVoice = (voice) => { ended.push(voice && voice.id); };
  host._setVoiceRate = (voice, rate) => { voice._rate = rate; };
  host._markLoopPositionDirty = () => {};
  return { host, started, ended };
}

test('cruise is a continuous voice that follows throttle and stops, never fades', () => {
  assert.equal(SEED, 4242);
  const recipe = recipeById.get('sfx.cruiseEngaged');
  assert.ok(recipe, 'sfx.cruiseEngaged must be authored');
  assert.equal(recipe.type, 'continuous_oscillator', 'cruise is a loop, not a stinger');
  // The edge law: engaged starts, dropped and snared stop outright.
  assert.deepEqual(resolveCruiseLoopEdge({ engaged: true }),
    { active: true, stop: false, recipeId: 'sfx.cruiseEngaged' });
  for (const ender of ['dropped', 'snared']) {
    const edge = resolveCruiseLoopEdge({ [ender]: true });
    assert.equal(edge.stop, true, `${ender} stops the loop`);
    assert.equal(edge.active, false);
    assert.equal(edge.recipeId, 'sfx.cruiseEngaged');
  }
  // Gain follows the throttle cue law: zero throttle is silence.
  assert.equal(CUE_GAIN.silent, 0, 'the law holds zero throttle at silence');
  let g = stepCueGain(0.7, 0, 1 / 60);
  assert.equal(g.target, 0, 'zero throttle targets silence');
  for (let i = 0; i < 240; i += 1) g = stepCueGain(g.gain, 0, 1 / 60);
  assert.ok(g.gain < 1e-6, `sustained zero throttle decays to silence, got ${g.gain}`);
  g = stepCueGain(0, 1, 1 / 60);
  assert.equal(g.target, CUE_GAIN.loud, 'open throttle targets the loud cue');
  assert.ok(g.gain > 0, 'gain begins following throttle immediately');
});

test('fields hold entity-lifetime loops keyed by field id, ending with the field', () => {
  const { host, started, ended } = fieldHost();
  // A well and a repulsor go up: one keyed loop each, on their own authored recipes.
  host.state.fields.active = [
    { id: 'w1', kind: 'well', strength: 1, center: { x: 0, z: 0 } },
    { id: 'r1', kind: 'repulsor', strength: 1, center: { x: 4, z: 0 } },
  ];
  syncFieldAudioLoops(host);
  assert.deepEqual(Object.keys(host.rt.loops).sort(), ['fieldLoop_r1', 'fieldLoop_w1']);
  const recipes = started.map((s) => s.recipeId).sort();
  assert.deepEqual(recipes, ['sfx_field_loop_repulsor', 'sfx_field_loop_well']);
  // The well field ends: only its loop stops — a stop, not a fade.
  host.state.fields.active = [
    { id: 'r1', kind: 'repulsor', strength: 1, center: { x: 4, z: 0 } },
  ];
  syncFieldAudioLoops(host);
  assert.deepEqual(ended, ['sfx_field_loop_well']);
  assert.deepEqual(Object.keys(host.rt.loops), ['fieldLoop_r1'],
    'the surviving field keeps its loop');
  // fields:ended drops the remaining loop by id.
  const handlers = {};
  bindFieldAudio(host, { on: (ev, fn) => { handlers[ev] = fn; } });
  assert.equal(typeof handlers['fields:ended'], 'function');
  handlers['fields:ended']({ fieldId: 'r1' });
  assert.deepEqual(ended, ['sfx_field_loop_well', 'sfx_field_loop_repulsor']);
  assert.equal(host.rt.loops[fieldLoopKey('r1')], undefined);
  // A field outside hearing or with no force left never gets a loop.
  host.state.fields.active = [
    { id: 'far', kind: 'well', strength: 1, center: { x: 99999, z: 0 } },
    { id: 'dead', kind: 'cone', strength: 0, center: { x: 0, z: 0 } },
  ];
  assert.equal(collectFieldLoopSpecs(host.state).length, 0,
    'out-of-hearing and force-less fields stay silent');
});

test('field loops honor the cap — the same bounded-lifetime law as the bomb precedent', () => {
  const { host } = fieldHost();
  assert.ok(BOMB_STATUS_LOOP_CAP >= 1, 'the bomb precedent carries a loop cap');
  assert.ok(FIELD_LOOP_CAP >= 1 && FIELD_LOOP_CAP <= BOMB_STATUS_LOOP_CAP,
    'field loops live under a bounded cap no larger than the entity-loop precedent');
  host.state.fields.active = Array.from({ length: FIELD_LOOP_CAP + 3 }, (_, i) => ({
    id: `f${i}`, kind: 'well', strength: 1, center: { x: i, z: 0 },
  }));
  const specs = collectFieldLoopSpecs(host.state);
  assert.equal(specs.length, FIELD_LOOP_CAP, 'collectors never exceed the cap');
  syncFieldAudioLoops(host);
  assert.equal(Object.keys(host.rt.loops).length, FIELD_LOOP_CAP,
    'the sync path holds the same cap');
});

test('the tether tone is slack-silent, load-following, and tow-mass-aware', () => {
  // A slack line is silent — not quiet, silent.
  const slack = resolveTetherTone({ tether: { active: false, phase: 'slack', load: 0, strain: 0 } });
  assert.equal(slack.playing, false);
  assert.equal(slack.gain, TETHER_TONE_SILENCE);
  assert.ok(slack.rampS <= 1 / 60 + 1e-9, 'release returns silence within a tick');
  // A taut line with no tow reads its own load.
  const tautLight = resolveTetherTone({
    tether: { active: true, phase: 'loaded', load: 0.3, strain: 0.2 },
  });
  assert.equal(tautLight.playing, true);
  // The tow's mass feeds the tone: the same line under a heavy tow creaks harder.
  const tautHeavy = resolveTetherTone({
    tether: { active: true, phase: 'loaded', load: 0.3, strain: 0.2 },
    towMass: 400,
  });
  assert.ok(tautHeavy.hz > tautLight.hz, 'a heavier tow raises the tone');
  assert.ok(tautHeavy.gain > tautLight.gain, 'a heavier tow is louder');
  // A heavy tow never speaks through a slack line — towMass only lifts while playing.
  const slackHeavy = resolveTetherTone({
    tether: { active: false, phase: 'slack', load: 0, strain: 0 }, towMass: 400,
  });
  assert.equal(slackHeavy.playing, false);
  assert.equal(slackHeavy.gain, TETHER_TONE_SILENCE);
});

test('the hum wiring resolves the towed body through tether.targetId', () => {
  const freqs = [];
  const host = Object.create(audio);
  host.rt = {
    ctx: { currentTime: 0 },
    tetherOsc: { frequency: { setTargetAtTime: (hz) => freqs.push(hz) } },
    tetherHum: { gain: { setTargetAtTime: () => {}, value: 0 }, gainValue: 0 },
    _priorityDuckWeapon: 1,
  };
  host._ensureTetherHum = () => {};
  host._playAccessibilityCue = () => {};
  host._holdLegacyContinuousSilent = () => {};
  const tether = { active: true, phase: 'loaded', load: 0.3, strain: 0.2, targetId: 'cargo-9' };
  host.state = {
    player: { tether },
    entities: new Map(),
    settings: { video: {} },
  };
  // No towed body resolvable: the tone reads the line's own load.
  host._updateTetherHum();
  const unloaded = freqs[freqs.length - 1];
  // A 400-mass haul on the hook: the tone lifts.
  host.state.entities.set('cargo-9', { mass: 400, pos: { x: 0, z: 0 } });
  host.rt._bedTargetCache = null; // a changed target must write through the cache
  host._updateTetherHum();
  const loaded = freqs[freqs.length - 1];
  assert.ok(loaded > unloaded,
    `a heavy tow must creak harder than the bare line (${loaded} !> ${unloaded})`);
  // The tone mirrors resolveTetherTone's own answer for the same inputs.
  const expected = resolveTetherTone({ tether, towMass: 400, motionReduce: false, duck: undefined });
  assert.equal(loaded, expected.hz, 'the hum follows the resolver exactly');
});
