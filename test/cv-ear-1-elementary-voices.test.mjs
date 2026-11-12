import test from 'node:test';
import assert from 'node:assert/strict';

import { audio } from '../src/audio/audioSystem.js';
import {
  ELEMENTARY_VOICE_KEYS,
  ENGINE_SILENCE_CEILING,
  ENGINE_TIER_HZ,
  ENGINE_VOICE_THRESHOLD,
  buildElementaryVoiceGraph,
  collectElementaryConsts,
  engineTierHz,
  legacyContinuousGain,
  readPublishedThrottle,
  readTetherLoad,
  ropePitchHz,
  stepElementaryVoices,
} from '../src/audio/elementaryVoices.js';
import {
  MASSLINE_HUM_BASE_HZ,
  MASSLINE_HUM_STRAIN_HZ,
  TETHER_TONE_ATTACK_S,
  TETHER_TONE_SILENCE,
} from '../src/audio/masslineInstrument.js';
import { THROTTLE_WINDOWS } from '../src/presentation/throttleAnswer.js';

// CV-EAR-1 / AQ-VOICE. Drives the shipped stepper, graph, and audio frame.
// Windows and pitches come from the published constants, not a second copy of the envelope.

const STEP = 1 / 60;

function drive(state, input, seconds) {
  let cursor = state;
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(STEP, left);
    cursor = stepElementaryVoices(cursor, { paused: false, flight: true, ...input, dt });
    left -= dt;
  }
  return cursor;
}

function fresh() {
  return { engineGain: 0, ropeGain: 0 };
}

function keyedConsts(graph) {
  return [
    ...collectElementaryConsts(graph.left),
    ...collectElementaryConsts(graph.right),
  ].filter((row) => ELEMENTARY_VOICE_KEYS.includes(row.key));
}

test('CV-EAR-1 three tether loads publish three rising pitches', () => {
  const low = ropePitchHz(0);
  const mid = ropePitchHz(0.5);
  const high = ropePitchHz(1);
  assert.equal(low, MASSLINE_HUM_BASE_HZ);
  assert.ok(mid > low && high > mid, 'loads 0, 0.5, 1 rise');
  assert.ok(Math.abs((high - low) - MASSLINE_HUM_STRAIN_HZ) < 0.02);

  const ducked = stepElementaryVoices(fresh(), {
    playing: true, load: 1, sidechainDuck: 0.25, priorityDuck: 0.5,
    motionReduce: true, throttle: 0, dt: STEP, flight: true, paused: false,
  });
  assert.equal(ducked.ropeHz, high, 'duck, motion, and throttle do not retune the rope');
});

test('CV-EAR-1 reduced motion quiets a live rope and never silences it', () => {
  const seconds = TETHER_TONE_ATTACK_S * 30;
  const open = drive(fresh(), { playing: true, load: 0, motionReduce: false }, seconds);
  const quiet = drive(fresh(), { playing: true, load: 0, motionReduce: true }, seconds);
  assert.ok(quiet.ropeGain > TETHER_TONE_SILENCE);
  assert.ok(quiet.ropeGain < open.ropeGain);
  assert.equal(quiet.ropeHz, open.ropeHz);
  assert.equal(quiet.ropeHz, ropePitchHz(0));
});

test('CV-EAR-1 full throttle is the engine voice inside the grown window', () => {
  assert.ok(ENGINE_VOICE_THRESHOLD >= THROTTLE_WINDOWS.loudGain * 0.5);
  assert.ok(ENGINE_VOICE_THRESHOLD < THROTTLE_WINDOWS.loudGain);
  const heard = drive(fresh(), { throttle: 1, tier: 'thrust', playing: true, load: 1 }, THROTTLE_WINDOWS.grownS);
  assert.ok(heard.engineGain >= ENGINE_VOICE_THRESHOLD);
  assert.equal(heard.engineHz, ENGINE_TIER_HZ.thrust);
  assert.equal(heard.engineHz, engineTierHz('thrust'));
  assert.equal(heard.ropeHz, ropePitchHz(1));
});

test('CV-EAR-1 zero throttle is silent inside the dark window and the first step is still a voice', () => {
  assert.ok(ENGINE_SILENCE_CEILING > 0);
  assert.ok(ENGINE_SILENCE_CEILING <= THROTTLE_WINDOWS.loudGain * 0.05);
  assert.ok(ENGINE_SILENCE_CEILING < ENGINE_VOICE_THRESHOLD);
  let voice = drive(fresh(), { throttle: 1, tier: 'thrust' }, THROTTLE_WINDOWS.cueRiseTau * 40);
  assert.ok(voice.engineGain > THROTTLE_WINDOWS.loudGain * 0.9);
  const held = voice.engineGain;
  voice = stepElementaryVoices(voice, {
    throttle: 0, tier: 'thrust', dt: STEP, flight: true, paused: false,
  });
  assert.ok(voice.engineGain > ENGINE_SILENCE_CEILING);
  assert.ok(voice.engineGain < held);
  voice = drive(voice, { throttle: 0, tier: 'thrust' }, THROTTLE_WINDOWS.darkS);
  assert.ok(voice.engineGain <= ENGINE_SILENCE_CEILING);
});

test('CV-EAR-1 half stick is between silence and full, and cruise stays a voice at zero stick', () => {
  const seconds = THROTTLE_WINDOWS.cueRiseTau * 40;
  const full = drive(fresh(), { throttle: 1, tier: 'thrust' }, seconds);
  const half = drive(fresh(), { throttle: 0.5, tier: 'thrust' }, seconds);
  assert.ok(half.engineGain > full.engineGain * 0.25);
  assert.ok(half.engineGain < full.engineGain * 0.75);
  const cruise = drive(fresh(), { throttle: 0, tier: 'cruise' }, seconds);
  assert.ok(cruise.engineGain >= ENGINE_VOICE_THRESHOLD);
  assert.equal(cruise.engineHz, ENGINE_TIER_HZ.cruise);
  const idle = drive(full, { throttle: 0, tier: 'idle' }, THROTTLE_WINDOWS.darkS);
  assert.ok(idle.engineGain <= ENGINE_SILENCE_CEILING);
  assert.equal(idle.engineHz, ENGINE_TIER_HZ.idle);
});

test('CV-EAR-1 weapons duck both voices and leave both pitches alone', () => {
  const seconds = Math.max(THROTTLE_WINDOWS.cueRiseTau, TETHER_TONE_ATTACK_S) * 40;
  const body = { throttle: 1, tier: 'thrust', playing: true, load: 0.5 };
  const open = drive(fresh(), { ...body, sidechainDuck: 1, priorityDuck: 1 }, seconds);
  const ducked = drive(fresh(), { ...body, sidechainDuck: 0.4, priorityDuck: 0.7 }, seconds);
  const swapped = drive(fresh(), { ...body, sidechainDuck: 0.7, priorityDuck: 0.4 }, seconds);
  assert.equal(ducked.duck, swapped.duck, 'the quieter weapon duck wins');
  assert.ok(ducked.duck < open.duck);
  assert.ok(ducked.heardEngine < open.heardEngine);
  assert.ok(ducked.heardRope < open.heardRope);
  assert.equal(ducked.engineHz, open.engineHz);
  assert.equal(ducked.ropeHz, open.ropeHz);
  assert.ok(Math.abs(ducked.engineGain - open.engineGain) <= open.engineGain * 0.001);
});

test('CV-EAR-1 pause and the menu hold the envelope', () => {
  const grown = drive(fresh(), { throttle: 1, tier: 'thrust' }, THROTTLE_WINDOWS.grownS);
  const paused = stepElementaryVoices(grown, {
    throttle: 1, tier: 'thrust', dt: THROTTLE_WINDOWS.grownS, paused: true, flight: true,
  });
  assert.equal(paused.engineGain, grown.engineGain);
  const menu = stepElementaryVoices(grown, {
    throttle: 1, tier: 'thrust', dt: THROTTLE_WINDOWS.grownS, paused: false, flight: false,
  });
  assert.equal(menu.engineGain, grown.engineGain);
});

test('CV-EAR-1 published throttle follows the plume sources', () => {
  const physics = 0.2;
  const stick = 0.45;
  const strafe = 0.33;
  assert.equal(readPublishedThrottle({ frame: { throttle: physics }, moveZ: 0, moveX: 0 }), physics);
  const heldStick = readPublishedThrottle({ frame: { throttle: 0 }, moveZ: stick, moveX: 0 });
  assert.ok(heldStick >= stick);
  const heldStrafe = readPublishedThrottle({ frame: { throttle: 0 }, moveZ: 0, moveX: -strafe });
  assert.ok(heldStrafe >= strafe);
  assert.equal(readPublishedThrottle({ frame: { commandedThrottle: stick }, moveZ: 0, moveX: 0 }), stick);
  assert.equal(readPublishedThrottle({ frame: { throttle: 0 }, moveZ: -1, moveX: 0 }), 0);
  assert.ok(readPublishedThrottle({ frame: { throttle: 8 }, moveZ: 4, moveX: 3 }) <= 1);
  assert.equal(readPublishedThrottle({ frame: {}, moveZ: Number.NaN, moveX: Number.NaN }), 0);
  const slack = readTetherLoad({ phase: 'slack', active: false, load: 1 });
  const loaded = readTetherLoad({ phase: 'loaded', load: 0.5 });
  assert.equal(slack.playing, false);
  assert.equal(slack.load, 0);
  assert.equal(loaded.playing, true);
  assert.ok(loaded.load > slack.load);
  assert.equal(readTetherLoad(null).playing, false);
});

test('CV-EAR-1 the elementary graph keeps one key set and the legacy beds go quiet only while it is mounted', () => {
  const voice = stepElementaryVoices(fresh(), {
    throttle: 1, tier: 'boost', playing: true, load: 1, sidechainDuck: 0.5, priorityDuck: 1,
    dt: THROTTLE_WINDOWS.grownS, flight: true, paused: false,
  });
  const first = buildElementaryVoiceGraph(voice);
  const second = buildElementaryVoiceGraph(voice);
  const a = keyedConsts(first).map((row) => row.key).sort();
  const b = keyedConsts(second).map((row) => row.key).sort();
  assert.deepEqual(a, [...ELEMENTARY_VOICE_KEYS].sort());
  assert.deepEqual(a, b);
  const byKey = Object.fromEntries(keyedConsts(first).map((row) => [row.key, row.value]));
  assert.equal(byKey.engHz, voice.engineHz);
  assert.equal(byKey.engGain, voice.engineGain);
  assert.equal(byKey.engDuck, voice.duck);
  assert.equal(byKey.ropeHz, voice.ropeHz);
  assert.equal(byKey.ropeGain, voice.ropeGain);
  assert.equal(byKey.ropeDuck, voice.duck);
  assert.equal(byKey.engHz, ENGINE_TIER_HZ.boost);
  assert.equal(legacyContinuousGain(true), 0);
  assert.equal(legacyContinuousGain(false), null);
});

function gainParam() {
  const param = {
    writes: [],
    setTargetAtTime(value) { this.writes.push(value); },
  };
  return { gain: param };
}

test('CV-EAR-1 the flight frame pushes both voices, ducks them, and does not restart an unchanged graph', () => {
  const prevState = audio.state;
  const prevRt = audio.rt;
  const prevLoad = audio._loadElementaryRenderer;
  const renders = [];
  const loads = [];
  try {
    audio._loadElementaryRenderer = () => {
      loads.push('load');
      return new Promise(() => {});
    };
    const player = {
      id: 3,
      flags: {},
      _flightFrame: { throttle: 1 },
    };
    const entities = new Map([[player.id, player]]);
    audio.state = {
      mode: 'menu',
      playerId: player.id,
      entities,
      input: { moveZ: 0, moveX: 0 },
      player: { tether: { active: true, phase: 'loaded', load: 1 } },
      settings: { video: {} },
    };
    audio.rt = {
      ctx: { currentTime: 1 },
      _paused: false,
      sidechainDuck: 1,
      _priorityDuckEngine: 1,
      engineHumGain: gainParam(),
      engineSubGain: gainParam(),
      engineNoiseGain: gainParam(),
      tetherHum: gainParam(),
      tetherOverloadGain: gainParam(),
      _tetherSpoolGain: gainParam(),
    };
    audio._pushElementaryVoices(THROTTLE_WINDOWS.grownS);
    assert.equal(loads.length, 0, 'the menu must not mount a second clock');

    audio.state.mode = 'flight';
    audio._pushElementaryVoices(THROTTLE_WINDOWS.grownS);
    assert.equal(loads.length, 1, 'flight mounts the voice once');
    audio._pushElementaryVoices(THROTTLE_WINDOWS.grownS);
    assert.equal(loads.length, 1, 'a mount already in flight is not started again');

    audio.rt._elemStarting = false;
    audio.rt._elemNode = { disconnect() {} };
    audio.rt._elemCore = {
      render(left, right) { renders.push({ left, right }); },
    };
    audio.rt._elemVoice = fresh();
    audio.state.input.moveZ = 1;
    audio.rt.sidechainDuck = 0.5;
    audio._pushElementaryVoices(THROTTLE_WINDOWS.grownS);
    assert.equal(renders.length, 1);
    const voice = audio.rt._elemVoice;
    assert.ok(voice.engineGain >= ENGINE_VOICE_THRESHOLD);
    assert.ok(voice.heardEngine < voice.engineGain, 'weapons duck the engine on the way out');
    assert.equal(voice.ropeHz, ropePitchHz(1));
    assert.equal(voice.engineHz, ENGINE_TIER_HZ.thrust);
    const pushed = keyedConsts(renders[0]);
    const engGain = pushed.find((row) => row.key === 'engGain');
    const ropeHz = pushed.find((row) => row.key === 'ropeHz');
    const engDuck = pushed.find((row) => row.key === 'engDuck');
    const ropeDuck = pushed.find((row) => row.key === 'ropeDuck');
    assert.equal(engGain.value, voice.engineGain);
    assert.equal(ropeHz.value, voice.ropeHz);
    assert.equal(engDuck.value, voice.duck);
    assert.equal(ropeDuck.value, voice.duck);
    assert.ok(engDuck.value < 1);
    for (const node of [
      audio.rt.engineHumGain, audio.rt.engineSubGain, audio.rt.engineNoiseGain,
      audio.rt.tetherHum, audio.rt.tetherOverloadGain, audio.rt._tetherSpoolGain,
    ]) {
      assert.equal(node.gain._sfParamLast, 0);
      assert.ok(node.gain.writes.includes(0));
    }

    audio._pushElementaryVoices(0);
    assert.equal(renders.length, 1, 'an unchanged voice does not restart the sample');

    const remembered = voice.engineGain;
    audio.rt._paused = true;
    audio._pushElementaryVoices(THROTTLE_WINDOWS.grownS);
    assert.equal(audio.rt._elemVoice.engineGain, remembered, 'pause does not spend the envelope');
    assert.equal(renders.length, 2);
    const silent = keyedConsts(renders[1]);
    assert.equal(silent.find((row) => row.key === 'engGain').value, 0);
    assert.equal(silent.find((row) => row.key === 'ropeGain').value, 0);
    assert.equal(audio.rt._elemVoice.engineGain, remembered);
  } finally {
    audio.state = prevState;
    audio.rt = prevRt;
    audio._loadElementaryRenderer = prevLoad;
  }
});
