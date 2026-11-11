// inf-gate-throat-voice (WF-13): a jump gate sounds like a gate, not a berth.
// Gates spawn as station bodies with data.isGate (wormholes too), so the station approach bed used
// to pick them up and hum a docking station's bed at them. The gate now sings its own throat:
// nearest live gate inside hearing, panned on its bearing, swelling with distance, detuned across
// the picture's 400 wu spin-up radius (up for a jump gate, down for a wormhole), one caption per
// visit, silent docked/paused/off flight, bowing under a live fight.
import test from 'node:test';
import assert from 'node:assert/strict';

import { audio, AUDIO_RECIPE_BY_ID } from '../src/audio/audioSystem.js';
import { playRecipe } from '../src/audio/synth.js';
import {
  GATE_THROAT_HEARING_WU,
  GATE_THROAT_PEAK,
  GATE_THROAT_RECIPES,
  GATE_THROAT_SPINUP_WU,
  GATE_THROAT_THREAT_DUCK,
  admitGateThroatCaption,
  gateThroatKind,
  gateThroatRate,
  gateThroatSpin,
  planGateThroat,
} from '../src/audio/gateThroatVoice.js';
import { captionForGameplayRecipe } from '../src/ui/captions.js';

function gate(id, x, opts = {}) {
  return {
    id, type: 'station', alive: opts.alive !== false, pos: { x, z: opts.z || 0 },
    data: { isGate: true, isWormhole: !!opts.wormhole, factionId: opts.factionId || 'faction_scn' },
  };
}

function param() {
  const calls = [];
  return { calls, setTargetAtTime(v) { calls.push(v); } };
}

function host({ gates = [], stations = [], docked = false, paused = false, mode = 'flight', threat = 0 } = {}) {
  const started = [];
  const ended = [];
  const captions = [];
  const h = Object.create(audio);
  h.rt = {
    ctx: { currentTime: 10 },
    loops: {},
    voices: [],
    _docked: docked,
    _paused: paused,
    _lifecycleSuspended: false,
    threat,
  };
  h.state = {
    mode,
    playerId: 'player',
    entities: new Map([['player', { id: 'player', alive: true, pos: { x: 0, z: 0 }, rot: 0 }]]),
    entityIndex: { gates, stations },
    world: {},
    settings: { accessibility: { captions: true } },
  };
  h.bus = { emit(name, payload) { if (name === 'presentation:caption') captions.push(payload); }, on() {} };
  h._startLoopVoice = (recipeId, position, gain, opts = {}) => {
    const voice = {
      recipeId, position, startGain: gain, busName: opts.busName, rate: opts.rate || 1, follow: opts.follow === true,
      gain: { gain: param() }, _panner: { pan: param() }, sources: [{ detune: param() }],
    };
    started.push(voice);
    return voice;
  };
  h._endLoopVoice = (v) => ended.push(v);
  h._reserveVoiceSlot = () => true;
  return { h, started, ended, captions };
}

test('planner: gates and wormholes are throats; berths, dead and unplaced bodies are not', () => {
  assert.equal(gateThroatKind(gate(1, 100)), 'gate');
  assert.equal(gateThroatKind(gate(2, 100, { wormhole: true })), 'wormhole');
  assert.equal(gateThroatKind({ id: 3, type: 'station', pos: { x: 0, z: 0 }, data: { stationId: 'st' } }), null);
  assert.equal(gateThroatKind(gate(4, 100, { alive: false })), null);
  assert.equal(gateThroatKind({ id: 5, data: { isGate: true } }), null);
  assert.equal(gateThroatKind({ id: 6, pos: { x: NaN, z: 0 }, data: { isGate: true } }), null);
});

test('planner: nearest gate inside hearing speaks, swelling as the player closes', () => {
  const out = {};
  assert.equal(planGateThroat([gate(1, GATE_THROAT_HEARING_WU + 10)], { x: 0, z: 0 }, 0, out), null,
    'past hearing nothing speaks');
  const plan = planGateThroat([gate(1, 500), gate(2, 220, { wormhole: true })], { x: 0, z: 0 }, 0, out);
  assert.equal(plan, out, 'the caller scratch object is filled, not a fresh allocation');
  assert.equal(plan.gateId, 2);
  assert.equal(plan.kind, 'wormhole');
  assert.equal(plan.recipeId, GATE_THROAT_RECIPES.wormhole);
  let prev = -1;
  for (const d of [520, 440, 360, 240, 120, 40]) {
    const p = planGateThroat([gate(1, d)], { x: 0, z: 0 }, 0, {});
    assert.ok(p.gain > prev && p.gain <= GATE_THROAT_PEAK, `gain rises as the player closes (${d} wu): ${p.gain}`);
    prev = p.gain;
  }
});

test('planner: the pitch spins up on the picture radius — a gate climbs, a wormhole sags', () => {
  assert.equal(gateThroatSpin(GATE_THROAT_SPINUP_WU + 1), 0, 'outside the spin-up radius the ring idles');
  assert.ok(gateThroatSpin(100) > gateThroatSpin(300), 'closer spins harder');
  const outside = planGateThroat([gate(1, 480)], { x: 0, z: 0 }, 0, {});
  assert.equal(outside.spinCents, 0);
  const g = planGateThroat([gate(1, 80)], { x: 0, z: 0 }, 0, {});
  const w = planGateThroat([gate(2, 80, { wormhole: true })], { x: 0, z: 0 }, 0, {});
  assert.ok(g.spinCents > 100 && g.spinCents <= 200, `gate climbs toward a whole tone: ${g.spinCents}`);
  assert.ok(w.spinCents < -50 && w.spinCents >= -150, `wormhole sags: ${w.spinCents}`);
});

test('planner: per-gate pitch is stable and house-leaned; a live fight halves the throat', () => {
  const a = gate(11, 100);
  assert.equal(gateThroatRate(a), gateThroatRate(gate(11, 300)), 'same gate id, same note');
  const rates = new Set([11, 12, 13, 14, 15].map((id) => gateThroatRate(gate(id, 100))));
  assert.ok(rates.size >= 4, 'neighbouring gates do not all sing one note');
  for (const id of [11, 12, 13]) {
    const r = gateThroatRate(gate(id, 100, { factionId: 'faction_reach' }));
    assert.ok(r >= 0.94 * 0.96 - 1e-9 && r <= 0.94 * 1.04 + 1e-9, `reach lean holds inside jitter: ${r}`);
  }
  const calm = planGateThroat([gate(1, 200)], { x: 0, z: 0 }, 0, {});
  const fight = planGateThroat([gate(1, 200)], { x: 0, z: 0 }, 0.6, {});
  assert.ok(Math.abs(fight.gain - calm.gain * GATE_THROAT_THREAT_DUCK) < 1e-12);
});

test('caption admission: once per gate visit window, a new gate speaks again', () => {
  const mem = {};
  assert.equal(admitGateThroatCaption(mem, 1, 10), true);
  assert.equal(admitGateThroatCaption(mem, 1, 60), false, 'same gate inside the window stays quiet');
  assert.equal(admitGateThroatCaption(mem, 2, 61), true, 'a different gate names itself');
  assert.equal(admitGateThroatCaption(mem, 2, 61 + 121), true, 'the window lapses');
  assert.equal(admitGateThroatCaption(null, 1, 10), false);
});

test('repair: the station approach bed no longer hums a docking bed at a gate', () => {
  const { h, started } = host({ stations: [gate(1, 120), gate(2, 90, { wormhole: true })] });
  h._updateApproachHum(5);
  assert.equal(started.length, 0, 'a gate or wormhole is no berth');
  const berth = { id: 'st', type: 'station', alive: true, pos: { x: 120, z: 0 }, data: { stationId: 'station_helios' } };
  const mixed = host({ stations: [gate(1, 60), berth] });
  mixed.h._updateApproachHum(5);
  assert.equal(mixed.started.length, 1, 'the real berth still hums past a nearer gate');
  assert.equal(mixed.started[0].recipeId, 'sfx_station_hum');
});

test('live owner: the nearest gate sings its own throat, panned, captioned once', () => {
  const { h, started, captions } = host({ gates: [gate(7, 150, { z: 0 })] });
  h._updateGateThroat();
  assert.equal(started.length, 1);
  const v = started[0];
  assert.equal(v.recipeId, 'sfx_gate_throat');
  assert.equal(v.busName, 'ambient');
  assert.equal(v.follow, true, 'the loop owns a panner for the bearing');
  assert.equal(v.position, null, 'distance is the planner\'s, not the generic tracked falloff');
  const g = v.gain.gain.calls.at(-1);
  assert.ok(g > 0 && g <= GATE_THROAT_PEAK, `gain lands in the authored band: ${g}`);
  assert.ok(v._panner.pan.calls.at(-1) > 0, 'a gate to the right pans right');
  assert.ok(v.sources[0].detune.calls.at(-1) > 0, 'inside the spin-up radius the ring climbs');
  assert.equal(captions.length, 1, 'the first approach names the place');
  assert.match(String(captions[0].text), /A jump gate hums/);
  h._updateGateThroat();
  assert.equal(started.length, 1, 'the running loop is reused');
  assert.equal(captions.length, 1, 'no caption flood while it keeps singing');
});

test('live owner: a wormhole moans and sags; a new gate re-voices; docked/paused/off flight is silent', () => {
  const w = host({ gates: [gate(9, -120, { wormhole: true })] });
  w.h._updateGateThroat();
  assert.equal(w.started[0].recipeId, 'sfx_wormhole_throat');
  assert.ok(w.started[0].sources[0].detune.calls.at(-1) < 0, 'the wormhole throat sags as you close');
  assert.ok(w.started[0]._panner.pan.calls.at(-1) < 0, 'a throat to the left pans left');
  assert.match(String(w.captions[0].text), /wormhole throat moans/);

  w.h.state.entityIndex.gates = [gate(10, 100)];
  w.h._updateGateThroat();
  assert.equal(w.ended.length, 1, 'switching gates releases the old throat first');
  w.h._updateGateThroat();
  assert.equal(w.started.at(-1).recipeId, 'sfx_gate_throat');

  for (const opts of [{ docked: true }, { paused: true }, { mode: 'station' }]) {
    const s = host({ gates: [gate(1, 100)], ...opts });
    s.h._updateGateThroat();
    assert.equal(s.started.length, 0, `silent when ${JSON.stringify(opts)}`);
  }
  const leave = host({ gates: [gate(1, 100)] });
  leave.h._updateGateThroat();
  leave.h.state.entityIndex.gates[0].pos.x = 2000;
  leave.h._updateGateThroat();
  assert.equal(leave.ended.length, 1, 'flying out of hearing releases the loop');
  assert.equal(leave.h.rt.loops.gateThroat, undefined);
});

test('palette: both throats are authored, distinct from the berth bed, and captioned', () => {
  const berth = AUDIO_RECIPE_BY_ID.sfx_station_hum;
  for (const id of Object.values(GATE_THROAT_RECIPES)) {
    const r = AUDIO_RECIPE_BY_ID[id];
    assert.ok(r, `${id} is defined`);
    assert.equal(r.type, 'continuous_oscillator', 'oscillator sources carry the detune spin-up');
    assert.notEqual(r.baseFreq, berth.baseFreq);
    const cap = captionForGameplayRecipe(id, r, null);
    assert.equal(cap.authored, true, `${id} carries an authored caption`);
  }
  assert.notEqual(AUDIO_RECIPE_BY_ID.sfx_gate_throat.wave, AUDIO_RECIPE_BY_ID.sfx_wormhole_throat.wave);
});

test('render: the real synth voice exposes oscillator detune, so the spin-up reaches the sound', () => {
  const p = (v = 0) => ({ value: v, last: null, setValueAtTime(x) { this.value = x; }, linearRampToValueAtTime(x) { this.value = x; },
    exponentialRampToValueAtTime(x) { this.value = x; }, setTargetAtTime(x) { this.last = x; }, cancelScheduledValues() {} });
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 0, state: 'running', sampleRate: 44100,
    createGain: () => Object.assign(node(), { gain: p(1) }),
    createOscillator: () => Object.assign(node(), { frequency: p(440), detune: p(0), type: 'sine', start() {}, stop() {} }),
    createBiquadFilter: () => Object.assign(node(), { frequency: p(1000), Q: p(1), type: 'lowpass' }),
    createWaveShaper: () => Object.assign(node(), { curve: null }),
    createBuffer: (c, n) => ({ length: n, getChannelData: () => new Float32Array(n) }),
    createBufferSource: () => Object.assign(node(), { playbackRate: p(1), detune: p(0), start() {}, stop() {} }),
  };
  for (const id of Object.values(GATE_THROAT_RECIPES)) {
    const voice = playRecipe(ctx, AUDIO_RECIPE_BY_ID[id], node(), { peakGain: 0.03 }, {});
    const oscs = voice.sources.filter((s) => s.detune && s.frequency);
    assert.ok(oscs.length >= 1, `${id} renders oscillator sources`);
    assert.equal(voice.stopAt, Infinity, `${id} is a sustained loop`);
    audio._detuneGateThroat(voice, 120, 0);
    assert.ok(oscs.every((s) => s.detune.last === 120), `${id} glides its detune to the spin-up`);
  }
});
