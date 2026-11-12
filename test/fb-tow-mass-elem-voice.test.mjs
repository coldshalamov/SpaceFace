// FB-079 follow-up — the towed body's mass must lift the rope voice on the LIVE backend.
// FB-079 fed towMass into resolveTetherTone, but the shipping route hears the Elementary
// rope voice: _updateTetherHum early-returns while rt._elemNode is mounted, so the mass
// channel never reached a speaker. The same tether.targetId → entities.get().mass lookup
// now feeds readTetherLoad through one shared law (resolveTetherLineLoad), and the lifted
// load drives the rope's pitch and gain exactly as the resolver authors them.
import assert from 'node:assert/strict';
import test from 'node:test';

import { audio } from '../src/audio/audioSystem.js';
import {
  collectElementaryConsts,
  readTetherLoad,
  ropePitchHz,
  stepElementaryVoices,
} from '../src/audio/elementaryVoices.js';
import {
  MASSLINE_HUM_BASE_HZ,
  TETHER_TONE_SILENCE,
  resolveTetherTone,
} from '../src/audio/masslineInstrument.js';

const STEP = 1 / 60;
const LINE = { active: true, phase: 'loaded', load: 0.3, strain: 0.2, targetId: 'cargo-9' };

function driveRope(input, seconds) {
  let voice = { engineGain: 0, ropeGain: 0 };
  let left = seconds;
  while (left > 1e-9) {
    const dt = Math.min(STEP, left);
    voice = stepElementaryVoices(voice, { paused: false, flight: true, ...input, dt });
    left -= dt;
  }
  return voice;
}

// The live backend: _pushElementaryVoices with a mounted elem node, the route the game
// actually renders. _elemNode being set also keeps _startElementaryVoices from loading.
function elemHost(tether, entities) {
  const renders = [];
  const host = Object.create(audio);
  host.rt = {
    ctx: { currentTime: 1, state: 'running' },
    _paused: false,
    _elemNode: { disconnect() {} },
    _elemCore: { render(left, right) { renders.push({ left, right }); } },
    _elemVoice: { engineGain: 0, ropeGain: 0 },
    sidechainDuck: 1,
    _priorityDuckEngine: 1,
  };
  host.state = {
    mode: 'flight',
    playerId: 'p',
    entities: entities || new Map([['p', { id: 'p', flags: {} }]]),
    input: { moveZ: 0, moveX: 0 },
    player: { tether },
    settings: { video: {} },
  };
  return { host, renders };
}

test('readTetherLoad lifts a taut line by the tow mass — one law with the tone resolver', () => {
  const bare = readTetherLoad(LINE);
  const heavy = readTetherLoad(LINE, 400);
  assert.equal(bare.playing, true);
  assert.equal(heavy.playing, true);
  assert.ok(heavy.load > bare.load, 'a heavy tow raises the read load');
  // The elem pitch for the lifted load is the hz resolveTetherTone publishes — no drift.
  const tone = resolveTetherTone({ tether: LINE, towMass: 400, duck: 1 });
  assert.equal(ropePitchHz(heavy.load), tone.hz);
  // The lift is a floor, not an add: a mass below the line's own load changes nothing.
  assert.equal(readTetherLoad(LINE, 50).load, bare.load);
  // A published mass field on the mirror lifts the same way (resolver fallback parity).
  assert.equal(
    readTetherLoad({ ...LINE, towMass: 400 }).load,
    heavy.load,
    'a tether-carried towMass reads identically to the injected one',
  );
  // Missing, non-finite, or non-positive mass is exactly the bare-line read.
  for (const absent of [undefined, Number.NaN, 0, -40]) {
    const still = readTetherLoad(LINE, absent);
    assert.equal(still.load, bare.load, `mass ${absent} must not change the read`);
    assert.equal(still.playing, bare.playing);
  }
});

test('a heavy tow never speaks through a slack line on the elem path', () => {
  const slack = { active: false, phase: 'slack', load: 0, strain: 0, targetId: 'cargo-9' };
  const read = readTetherLoad(slack, 400);
  assert.equal(read.playing, false);
  assert.equal(read.load, 0);
  const voice = driveRope({ playing: read.playing, load: read.load }, 0.5);
  assert.ok(voice.ropeGain < TETHER_TONE_SILENCE * 10, 'a slack heavy tow stays at the silence floor');
  assert.equal(voice.ropeHz, MASSLINE_HUM_BASE_HZ);
});

test('the mounted elem rope voice hears the towed mass through tether.targetId', () => {
  const entities = new Map([['p', { id: 'p', flags: {} }]]);
  // No resolvable body under targetId: the rope reads the bare line, unchanged.
  const bareRun = elemHost({ ...LINE }, entities);
  bareRun.host._pushElementaryVoices(0.25);
  const bare = bareRun.host.rt._elemVoice;
  assert.equal(bare.ropeHz, ropePitchHz(LINE.load), 'missing mass is the bare-line voice');

  // A 400-mass haul on the hook: the same taut line creaks harder on the live backend.
  entities.set('cargo-9', { id: 'cargo-9', mass: 400 });
  const heavyRun = elemHost({ ...LINE }, entities);
  heavyRun.host._pushElementaryVoices(0.25);
  const heavy = heavyRun.host.rt._elemVoice;
  assert.ok(heavy.ropeHz > bare.ropeHz,
    `the mounted rope voice must creak harder under a heavy tow (${heavy.ropeHz} !> ${bare.ropeHz})`);
  assert.ok(heavy.ropeGain > bare.ropeGain, 'the lift is louder, not only higher');
  // And it is the authored lift, not an approximation of it.
  const expected = resolveTetherTone({ tether: LINE, towMass: 400, motionReduce: false, duck: 1 });
  assert.equal(heavy.ropeHz, expected.hz, 'the live backend resolves the same hz as the legacy one');
  // The rendered graph carries the lifted pitch to the actual Elementary node.
  const ropeConsts = collectElementaryConsts(heavyRun.renders.at(-1).right);
  const ropeHz = ropeConsts.find((row) => row.key === 'ropeHz');
  assert.equal(ropeHz.value, expected.hz, 'the lifted pitch reaches the rendered graph');
});

test('a slack line with a heavy body on the hook stays silent on the live backend', () => {
  const slack = { active: false, phase: 'slack', load: 0, strain: 0, targetId: 'cargo-9' };
  const entities = new Map([
    ['p', { id: 'p', flags: {} }],
    ['cargo-9', { id: 'cargo-9', mass: 400 }],
  ]);
  const { host } = elemHost(slack, entities);
  host._pushElementaryVoices(0.25);
  const voice = host.rt._elemVoice;
  assert.ok(voice.ropeGain <= TETHER_TONE_SILENCE * 10,
    `a slack line never creaks, however heavy the hook (ropeGain ${voice.ropeGain})`);
  assert.equal(voice.ropeHz, MASSLINE_HUM_BASE_HZ);
});
