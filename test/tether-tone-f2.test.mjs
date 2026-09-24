import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MASSLINE_RECIPES,
  resolveMasslineInstrument,
  resolveTetherTone,
  TETHER_TONE_RELEASE_S,
  TETHER_TONE_SILENCE,
} from '../src/audio/masslineInstrument.js';
import { audio } from '../src/audio/audioSystem.js';

// F2 — "the rope sings": a continuous tone while a line is taut; pitch and loudness follow
// the published tether.load. Slack is quiet and low, a hard swing climbs, release silences
// within a tick, and the snap cue still fires. One voice; ducks under weapons.

const VISION = 'a rising tone is how you learn a swing without staring at a number';

test('the tether tone follows load — pitch and loudness climb through three loads', () => {
  const loads = [0.35, 0.55, 0.9]; // capture / loaded / overload phase floors
  const tones = loads.map((load) => resolveTetherTone({
    tether: { active: true, phase: 'loaded', load, strain: 0 },
  }));
  for (const t of tones) {
    assert.equal(t.playing, true, `${VISION}: a taut line plays`);
    assert.ok(t.gain > TETHER_TONE_SILENCE, `${VISION}: a taut line is audible`);
  }
  assert.ok(tones[1].hz > tones[0].hz && tones[2].hz > tones[1].hz,
    `${VISION}: pitch is strictly increasing across loads (${tones.map((t) => t.hz)})`);
  assert.ok(tones[1].gain > tones[0].gain && tones[2].gain > tones[1].gain,
    `${VISION}: loudness follows load (${tones.map((t) => t.gain)})`);
});

test('a taut capture phase sings even before strain climbs; slack is quiet and low', () => {
  const capture = resolveTetherTone({
    tether: { active: true, phase: 'capture', load: 0.35, strain: 0 },
  });
  assert.equal(capture.playing, true, `${VISION}: capture is a taut phase — it must sing`);

  const slack = resolveTetherTone({
    tether: { active: true, phase: 'slack', load: 0.02, strain: 0 },
  });
  assert.equal(slack.playing, true, `${VISION}: an attached slack line still whispers`);
  assert.ok(slack.hz < capture.hz && slack.gain < capture.gain,
    `${VISION}: slack is quiet and low`);
});

test('silence returns within a tick of release, and the snap cue still fires', () => {
  const released = resolveTetherTone({
    tether: { active: false, phase: 'released', load: 0, strain: 0 },
  });
  assert.equal(released.playing, false, `${VISION}: a released line stops playing`);
  assert.equal(released.gain, TETHER_TONE_SILENCE, `${VISION}: release resolves to silence`);
  assert.ok(released.rampS <= TETHER_TONE_RELEASE_S + 1e-9,
    `${VISION}: the silence ramp is one tick or faster (${released.rampS}s)`);

  const snap = resolveMasslineInstrument({ event: 'break', tension: 1, strain: 1 });
  assert.equal(snap.recipeId, MASSLINE_RECIPES.break,
    `${VISION}: the cut is the snap that already exists (${snap.recipeId})`);
});

test('the tone ducks under weapons and quiets — never silences — under reduced motion', () => {
  const base = { tether: { active: true, phase: 'loaded', load: 0.7, strain: 0.7 } };
  const open = resolveTetherTone({ ...base, duck: 1 });
  const ducked = resolveTetherTone({ ...base, duck: 0.5 });
  assert.ok(ducked.gain < open.gain && ducked.gain > TETHER_TONE_SILENCE,
    `${VISION}: it ducks under weapons, it does not mute`);

  const reduced = resolveTetherTone({ ...base, motionReduce: true });
  assert.ok(reduced.playing && reduced.gain > TETHER_TONE_SILENCE && reduced.gain < open.gain,
    `${VISION}: reduced motion quiets the tone — it is information, not ornament`);
});

test('_updateTetherHum drives the resolver onto the live voice', () => {
  // Wiring proof: the hum writes the resolver's gain and frequency, and a release writes the
  // silence floor on the one-tick ramp — not the old three-tick decay.
  const freqWrites = [];
  const gainWrites = [];
  const host = Object.create(audio);
  host.state = {
    player: { tether: { active: true, phase: 'loaded', load: 0.6, strain: 0.4 } },
    settings: { video: { motionReduce: false } },
  };
  host.rt = {
    _paused: false,
    ctx: { currentTime: 0 },
    sidechainDuck: 1,
    tetherOsc: { frequency: { setTargetAtTime: (f, _n, tc) => freqWrites.push({ f, tc }) } },
    tetherHum: { gain: { setTargetAtTime: (g, _n, tc) => gainWrites.push({ g, tc }) }, gainValue: 0 },
    tetherOverloadOsc: { frequency: { setTargetAtTime() {} } },
    tetherOverloadGain: { gain: { setTargetAtTime() {} }, gainValue: 0 },
    _tetherSpoolOsc: { frequency: { setTargetAtTime() {} } },
    _tetherSpoolGain: { gain: { setTargetAtTime() {} }, gainValue: 0 },
    _tetherWasTaut: true,
  };
  host._playAccessibilityCue = () => {};

  host._updateTetherHum();
  const tone = resolveTetherTone({ tether: host.state.player.tether, motionReduce: false, duck: 1 });
  assert.equal(gainWrites.at(-1).g, tone.gain,
    `${VISION}: the live voice carries the resolver's loudness`);
  assert.equal(freqWrites.at(-1).f, tone.hz,
    `${VISION}: the live voice carries the resolver's pitch`);

  host.state.player.tether = { active: false, phase: 'released', load: 0, strain: 0 };
  host._updateTetherHum();
  const release = gainWrites.at(-1);
  assert.equal(release.g, TETHER_TONE_SILENCE, `${VISION}: release writes silence`);
  assert.ok(release.tc <= TETHER_TONE_RELEASE_S + 1e-9,
    `${VISION}: silence returns within a tick of release (ramp ${release.tc}s)`);
});
