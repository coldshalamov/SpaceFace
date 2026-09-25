// §22 F2 — the rope sings: one continuous tone while the player's Massline is taut.
// The fixture drives the live hum owner (_updateTetherHum) through three loads and asserts the
// playing cue's pitch climbs strictly; release writes silence on a one-tick ramp; the snap cue
// still fires. One voice — NPC swarm tethers never join the mix, the voice is retargeted rather
// than restarted, and reduced motion quiets it without silencing it (it is information).

import test from 'node:test';
import assert from 'node:assert/strict';

import { audio } from '../src/audio/audioSystem.js';
import {
  resolveTetherTone,
  TETHER_TONE_RELEASE_S,
  TETHER_TONE_SILENCE,
} from '../src/audio/masslineInstrument.js';
import { requestMinimalActionAudio } from '../src/audio/minimalActionAudio.js';

const TICK_S = 1 / 60;

// A host standing on the real audio system with only the Web-Audio seam faked: one oscillator +
// one gain node record every retarget so the fixture hears what the single voice would play.
function makeHost(tether, { motionReduce = false, duck = 1, tick = 100 } = {}) {
  const freqWrites = [];
  const gainWrites = [];
  const plays = [];
  const host = Object.create(audio);
  host.state = {
    tick,
    player: { tether },
    settings: { video: { motionReduce } },
    entities: new Map(),
  };
  host.rt = {
    _paused: false,
    ctx: { currentTime: 0 },
    sidechainDuck: duck,
    tetherOsc: { frequency: { setTargetAtTime: (f, _n, tc) => freqWrites.push({ f, tc }) } },
    tetherHum: { gain: { setTargetAtTime: (g, _n, tc) => gainWrites.push({ g, tc }) }, gainValue: 0 },
    tetherOverloadOsc: { frequency: { setTargetAtTime() {} } },
    tetherOverloadGain: { gain: { setTargetAtTime() {} }, gainValue: 0 },
    _tetherSpoolOsc: { frequency: { setTargetAtTime() {} } },
    _tetherSpoolGain: { gain: { setTargetAtTime() {} }, gainValue: 0 },
    _tetherWasTaut: true,
  };
  host._playAccessibilityCue = () => {};
  host._applyPriorityCue = () => {};
  host._emitPresentationCaption = () => {};
  host.play = (recipeId, opts = {}) => {
    plays.push({ recipeId, ...opts });
    return { recipeId };
  };
  return { host, freqWrites, gainWrites, plays };
}

test('the playing cue climbs strictly through three driven loads on one voice', () => {
  const loads = [0.35, 0.55, 0.9]; // a hardening swing: capture floor → loaded → near max
  const { host, freqWrites, gainWrites } = makeHost(
    { active: true, phase: 'capture', load: loads[0], strain: 0 },
  );
  const voice = host.rt.tetherOsc;

  for (const load of loads) {
    host.state.player.tether = { active: true, phase: 'loaded', load, strain: load };
    host.state.tick += 1;
    host._updateTetherHum();
  }

  assert.strictEqual(host.rt.tetherOsc, voice,
    'one voice: the same oscillator is retargeted, never restarted per tick');
  assert.equal(freqWrites.length, loads.length, 'each tick retargets the live cue once');
  assert.ok(freqWrites[1].f > freqWrites[0].f && freqWrites[2].f > freqWrites[1].f,
    `pitch is strictly increasing across loads (${freqWrites.map((w) => w.f)})`);
  assert.ok(gainWrites[1].g > gainWrites[0].g && gainWrites[2].g > gainWrites[1].g,
    `loudness follows load (${gainWrites.map((w) => w.g)})`);
  for (const w of gainWrites) {
    assert.ok(w.g > TETHER_TONE_SILENCE, 'a taut line is audible, not floored');
  }
});

test('silence returns within a tick of release, and the snap cue still fires', () => {
  const { host, gainWrites, plays } = makeHost(
    { active: true, phase: 'loaded', load: 0.8, strain: 0.8 },
  );
  host._updateTetherHum();
  assert.ok(gainWrites.at(-1).g > TETHER_TONE_SILENCE, 'the swing is singing before the cut');

  host.state.player.tether = { active: false, phase: 'released', load: 0, strain: 0 };
  host.state.tick += 1;
  host._updateTetherHum();
  const silence = gainWrites.at(-1);
  assert.equal(silence.g, TETHER_TONE_SILENCE, 'release writes the silence floor');
  assert.ok(silence.tc <= TETHER_TONE_RELEASE_S + 1e-9,
    `silence returns within a tick of release (ramp ${silence.tc}s vs ${TICK_S}s tick)`);

  // The cut is the snap that already exists: a messy let-go plays sfx.tetherSnap through the
  // minimal-action row that owns release playback (the instrument defers to it — no double).
  const snap = requestMinimalActionAudio(host, 'release', { classification: 'messy' }, host.state.tick);
  assert.equal(snap.played, true, 'the release snap is requested');
  assert.equal(plays.at(-1).recipeId, 'sfx.tetherSnap', 'the snap cue still fires on release');

  // And a real cable failure — not a let-go — still snaps through the instrument.
  host._onMasslineInstrument('break', {});
  assert.equal(plays.at(-1).recipeId, 'sfx.tetherSnap', 'the break snap still fires');
});

test('one voice: a swarm of NPC tethers never stacks into the player cue', () => {
  const { host, freqWrites, gainWrites } = makeHost(
    { active: true, phase: 'loaded', load: 0.6, strain: 0.6 },
  );
  // Three NPC lines pulled harder than the player's. If any of them entered the voice the
  // writes would follow their load instead of the player's 0.6.
  host.state.entities = new Map([
    [2, { id: 2, tether: { active: true, phase: 'overload', load: 1.2, strain: 1.2 } }],
    [3, { id: 3, tether: { active: true, phase: 'loaded', load: 0.95, strain: 0.9 } }],
    [4, { id: 4, tether: { active: true, phase: 'capture', load: 0.35, strain: 0.1 } }],
  ]);
  host._updateTetherHum();

  const playerTone = resolveTetherTone({ tether: host.state.player.tether, duck: 1 });
  assert.equal(freqWrites.at(-1).f, playerTone.hz,
    'the voice follows the player line alone — NPC loads would land on a different pitch');
  assert.equal(gainWrites.at(-1).g, playerTone.gain);
  assert.equal(freqWrites.length, 1, 'still a single retarget — the mix is a note, not a chord');
});

test('the tone ducks under weapons and stays — quieter — under reduced motion', () => {
  const tether = { active: true, phase: 'overload', load: 0.9, strain: 0.9 };
  const open = makeHost(tether, { duck: 1 });
  const ducked = makeHost(tether, { duck: 0.5 });
  const reduced = makeHost(tether, { motionReduce: true });
  for (const h of [open, ducked, reduced]) h.host._updateTetherHum();

  const openGain = open.gainWrites.at(-1).g;
  assert.ok(ducked.gainWrites.at(-1).g < openGain
    && ducked.gainWrites.at(-1).g > TETHER_TONE_SILENCE,
    'the tone bows under weapons through the sidechain duck — it does not mute');

  const reducedGain = reduced.gainWrites.at(-1).g;
  assert.ok(reducedGain < openGain && reducedGain > TETHER_TONE_SILENCE,
    'reduced motion quiets the tone — silence is the bug, quieter is the rule');
  assert.equal(reduced.freqWrites.at(-1).f, open.freqWrites.at(-1).f,
    'the information — the pitch — survives reduced motion intact');
});
