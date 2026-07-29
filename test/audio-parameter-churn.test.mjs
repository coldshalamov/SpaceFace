// PERF-C08 — audio AudioParam churn.
//
// `_applySettings` used to rewrite all seven settings-derived bus gains on every rendered frame,
// and the brake / tether beds re-armed their setTargetAtTime curves every frame even while silent
// and at rest. These tests pin the gates that stop that work, and — critically — prove by source
// mutation that removing a gate makes the steady-state assertions fail. A gate test that passes
// with the gate removed is worthless.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { audio } from '../src/audio/audioSystem.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = path.join(HERE, '..', 'src', 'audio');
const AUDIO_SRC = path.join(AUDIO_DIR, 'audioSystem.js');

// Mirrors audioSystem.js's own perceptual curve so expected values are derived, not copied.
function linearGain(v) { const c = v < 0 ? 0 : v > 1 ? 1 : v; return c * c; }

function createCountingContext() {
  const calls = {
    setValueAtTime: 0,
    linearRampToValueAtTime: 0,
    exponentialRampToValueAtTime: 0,
    setTargetAtTime: 0,
    cancelScheduledValues: 0,
  };
  return {
    state: 'running',
    currentTime: 0,
    calls,
    // Every automation event the packet cares about; cancelScheduledValues is tracked separately
    // because it is bookkeeping rather than a value write.
    automation() {
      return calls.setValueAtTime + calls.linearRampToValueAtTime
        + calls.exponentialRampToValueAtTime + calls.setTargetAtTime;
    },
    reset() { for (const key in calls) calls[key] = 0; },
  };
}

function createParam(ctx, initial = 0.0001) {
  const param = {
    value: initial,
    // The value the graph was last told to end up on — i.e. the audible landing point.
    scheduled: initial,
    cancelScheduledValues() { ctx.calls.cancelScheduledValues++; },
    setValueAtTime(v) { ctx.calls.setValueAtTime++; param.value = v; param.scheduled = v; },
    linearRampToValueAtTime(v) { ctx.calls.linearRampToValueAtTime++; param.scheduled = v; },
    exponentialRampToValueAtTime(v) { ctx.calls.exponentialRampToValueAtTime++; param.scheduled = v; },
    setTargetAtTime(v) { ctx.calls.setTargetAtTime++; param.scheduled = v; },
  };
  return param;
}

const BUS_KEYS = ['masterGain', 'engineBus', 'ambientBus', 'combatBus', 'uiBus', 'commsBus', 'musicBus'];

function createSettingsHost(audioModule, settings) {
  const ctx = createCountingContext();
  const rt = {
    ctx,
    sidechainDuck: 1,
    _paused: false,
    _bulletTimeMusicMult: 1,
    _busGainCache: null,
    _bedTargetCache: null,
  };
  for (const key of BUS_KEYS) rt[key] = { gain: createParam(ctx), connect() {}, disconnect() {} };
  const host = Object.create(audioModule);
  host.rt = rt;
  host.state = { settings: { audio: settings } };
  return { host, rt, ctx };
}

function expectedBusTargets(a, { sidechain = 1, bulletMusicMult = 1, paused = false } = {}) {
  const muted = !!a.muted;
  const sfx = linearGain(a.sfx);
  const musicBase = linearGain(a.music) * 0.05012 * sidechain;
  return {
    masterGain: muted ? 0.0001 : linearGain(a.master) * 0.501187,
    engineBus: sfx * linearGain(a.engine) * 0.12589,
    ambientBus: sfx * linearGain(a.ambient) * 0.06309 * sidechain,
    combatBus: sfx * linearGain(a.combat) * 0.25119,
    uiBus: sfx * linearGain(a.ui) * 0.1,
    commsBus: sfx * linearGain(a.comms) * 0.15849,
    musicBus: (muted || paused) ? 0.0001 : musicBase * bulletMusicMult,
  };
}

function assertBusTargets(rt, expected, label) {
  for (const key of BUS_KEYS) {
    assert.equal(rt[key].gain.scheduled, Math.max(0.0001, expected[key]),
      `${label}: ${key} landed on the wrong final gain`);
  }
}

function runFrames(host, ctx, frames, dt = 1 / 60) {
  for (let i = 0; i < frames; i++) {
    ctx.currentTime += dt;
    host._applySettings();
  }
}

const SETTINGS = () => ({ master: 0.55, sfx: 0.7, engine: 0.7, ambient: 0.7, combat: 0.7, ui: 0.7, comms: 0.7, music: 0.32, muted: false });

// ---------------------------------------------------------------------------------------------
// Settings-derived bus gains
// ---------------------------------------------------------------------------------------------

test('settings bus gains apply once at boot, then stop re-arming in steady state', () => {
  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(audio, settings);

  // First application is unconditional: master snaps (1 write), the other six ramp (2 writes each).
  host._applySettings();
  assert.equal(ctx.automation(), 13, 'boot must initialise every settings-owned bus param');
  assert.equal(ctx.calls.cancelScheduledValues, 7);
  assertBusTargets(rt, expectedBusTargets(settings), 'boot');

  // Inside the 50 ms glide window the pre-existing per-frame re-anchoring is preserved verbatim,
  // but it is bounded — it must not run forever.
  ctx.reset();
  let windowFrames = 0;
  while (ctx.currentTime < 0.05) { runFrames(host, ctx, 1); windowFrames++; }
  assert.ok(windowFrames <= 4, `glide window should close within a few frames, took ${windowFrames}`);
  assert.ok(ctx.automation() <= 4 * 12, `glide-window churn must stay bounded, saw ${ctx.automation()}`);

  // Settled: unchanged settings, unchanged sidechain, unchanged pause/bullet-time => zero work.
  ctx.reset();
  runFrames(host, ctx, 600);
  assert.equal(ctx.automation(), 0, 'settled steady state must perform zero automation');
  assert.equal(ctx.calls.cancelScheduledValues, 0, 'settled steady state must not touch the params at all');
  assertBusTargets(rt, expectedBusTargets(settings), 'after 600 idle frames');
});

test('changing a volume re-applies once and lands on the exact new target', () => {
  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(audio, settings);
  host._applySettings();
  runFrames(host, ctx, 600);

  ctx.reset();
  settings.music = 0.8;
  ctx.currentTime += 1 / 60;
  host._applySettings();
  assert.equal(ctx.calls.linearRampToValueAtTime, 1, 'exactly one bus re-application for one changed slider');
  assert.equal(ctx.calls.setValueAtTime, 1);
  assert.equal(ctx.calls.cancelScheduledValues, 1, 'untouched buses must not even be cancelled');

  runFrames(host, ctx, 600);
  assertBusTargets(rt, expectedBusTargets(settings), 'after music slider change');

  ctx.reset();
  runFrames(host, ctx, 600);
  assert.equal(ctx.automation(), 0, 'the new value must settle back into zero-work steady state');
});

test('mute and unmute re-apply every bus even though five targets never change', () => {
  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(audio, settings);
  host._applySettings();
  runFrames(host, ctx, 600);
  const unmuted = expectedBusTargets(settings);

  // Muting only zeroes master + music; engine/ambient/combat/ui/comms keep the same numeric target
  // and merely change from a 50 ms glide to a snap. A target-only gate would wrongly skip them.
  ctx.reset();
  settings.muted = true;
  ctx.currentTime += 1 / 60;
  host._applySettings();
  assert.equal(ctx.calls.setValueAtTime, 7, 'mute must snap all seven buses');
  assert.equal(ctx.calls.linearRampToValueAtTime, 0, 'mute must not leave a ramp blip');
  assertBusTargets(rt, expectedBusTargets(settings), 'muted');
  assert.equal(rt.masterGain.gain.scheduled, 0.0001);

  ctx.reset();
  runFrames(host, ctx, 600);
  assert.equal(ctx.automation(), 0, 'muted steady state must also be silent work-wise');

  ctx.reset();
  settings.muted = false;
  ctx.currentTime += 1 / 60;
  host._applySettings();
  assert.equal(ctx.automation(), 13, 'unmute must re-arm every bus');
  runFrames(host, ctx, 600);
  assertBusTargets(rt, unmuted, 'unmuted again');
});

test('pause and bullet-time inputs are part of the gate signature', () => {
  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(audio, settings);
  host._applySettings();
  runFrames(host, ctx, 600);

  ctx.reset();
  rt._paused = true;
  ctx.currentTime += 1 / 60;
  host._applySettings();
  assert.equal(rt.musicBus.gain.scheduled, 0.0001, 'pause must silence the music bus');
  assert.equal(ctx.calls.setValueAtTime, 1, 'pause only changes the music bus');

  ctx.reset();
  rt._paused = false;
  ctx.currentTime += 1 / 60;
  host._applySettings();
  runFrames(host, ctx, 600);
  assertBusTargets(rt, expectedBusTargets(settings), 'resumed');

  ctx.reset();
  rt._bulletTimeMusicMult = 0.6;
  ctx.currentTime += 1 / 60;
  host._applySettings();
  runFrames(host, ctx, 600);
  assertBusTargets(rt, expectedBusTargets(settings, { bulletMusicMult: 0.6 }), 'bullet time');
});

test('a decaying combat sidechain keeps only the two buses it scales awake', () => {
  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(audio, settings);
  host._applySettings();
  runFrames(host, ctx, 600);

  // Sidechain recovery after combat multiplies ambient + music every frame; the other five buses
  // are untouched by it and must stay asleep. Nothing here may be rounded or quantised — the
  // sidechain factor is part of the audible gain, not a gate hint.
  ctx.reset();
  let duck = 0.501187;
  for (let i = 0; i < 120; i++) {
    duck = 1 + (duck - 1) * Math.exp(-(1 / 60) / 0.9);
    rt.sidechainDuck = duck;
    ctx.currentTime += 1 / 60;
    host._applySettings();
  }
  // Two buses re-anchored per frame, each costing setValueAtTime + linearRamp + one cancel.
  assert.equal(ctx.calls.setValueAtTime, 2 * 120, 'exactly ambient + music re-anchor each frame');
  assert.equal(ctx.calls.linearRampToValueAtTime, 2 * 120);
  assert.equal(ctx.calls.cancelScheduledValues, 2 * 120,
    'the five buses the sidechain does not scale must stay untouched');
  assertBusTargets(rt, expectedBusTargets(settings, { sidechain: duck }), 'mid sidechain recovery');

  // Once the factor settles on exactly 1.0 the buses go back to sleep.
  rt.sidechainDuck = 1;
  runFrames(host, ctx, 300);
  ctx.reset();
  runFrames(host, ctx, 300);
  assert.equal(ctx.automation(), 0, 'a settled sidechain returns the mix to zero-work steady state');
  assertBusTargets(rt, expectedBusTargets(settings), 'sidechain fully recovered');
});

test('a foreign write to the music bus invalidates its cache so settings re-assert', () => {
  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(audio, settings);
  rt._duckUntil = 0;
  host._applySettings();
  runFrames(host, ctx, 600);

  ctx.reset();
  host._duckMusic(0.8); // ducking writes musicBus.gain behind _applySettings' back
  const duckWrites = ctx.automation();
  assert.ok(duckWrites > 0, 'duck must still write the music bus');

  ctx.reset();
  ctx.currentTime += 1 / 60;
  host._applySettings();
  assert.ok(ctx.automation() > 0, 'the settings owner must re-assert the music bus after a foreign write');
  runFrames(host, ctx, 600);
  assertBusTargets(rt, expectedBusTargets(settings), 'after duck + settings re-assert');
});

// ---------------------------------------------------------------------------------------------
// Continuous beds: brake hiss + tether hum
// ---------------------------------------------------------------------------------------------

function createBedHost(audioModule) {
  const ctx = createCountingContext();
  const gainNode = () => ({ gain: createParam(ctx), connect() {}, disconnect() {} });
  const rt = {
    ctx,
    _paused: false,
    _bulletTimePitch: 1,
    _bedTargetCache: null,
    brakeGain: gainNode(),
    brakeNoise: { playbackRate: createParam(ctx, 1) },
    tetherOsc: { frequency: createParam(ctx, 90) },
    tetherHum: gainNode(),
    tetherOverloadOsc: { frequency: createParam(ctx, 97) },
    tetherOverloadGain: gainNode(),
  };
  const player = { vel: { x: 0, z: 0 }, pos: { x: 0, y: 0, z: 0 } };
  const host = Object.create(audioModule);
  host.rt = rt;
  host.state = {
    playerId: 1,
    entities: new Map([[1, player]]),
    input: { actions: { brake: false } },
    player: { tether: null },
  };
  return { host, rt, ctx, player };
}

test('brake hiss sleeps while silent and wakes on the very frame the player brakes', () => {
  const { host, rt, ctx, player } = createBedHost(audio);

  host._updateBrakeHiss(1 / 60);
  assert.equal(ctx.calls.setTargetAtTime, 2, 'first pass must initialise rate + gain');
  assert.equal(rt.brakeGain.gain.scheduled, 0.0001);

  // Coast at a steady 300 u/s for a while: audibly silent, parameters at rest.
  player.vel.x = 300;
  ctx.reset();
  for (let i = 0; i < 600; i++) { ctx.currentTime += 1 / 60; host._updateBrakeHiss(1 / 60); }
  assert.equal(ctx.automation(), 0, 'a silent brake bed at rest must schedule nothing');
  assert.equal(rt._prevSpeed, 300, 'speed history must still be tracked while asleep');

  // Brake with no deceleration yet: the onset level must come from the *live* speed history.
  // A gate that skipped `_prevSpeed` would compute a bogus decel here and blast the floor value.
  ctx.reset();
  host.state.input.actions.brake = true;
  ctx.currentTime += 1 / 60;
  host._updateBrakeHiss(1 / 60);
  assert.equal(ctx.calls.setTargetAtTime, 1, 'the wake write happens on the same frame, not later');
  assert.equal(rt.brakeGain.gain.scheduled, 0.04, 'onset level must be the floor, not a stale-decel burst');

  // Real deceleration raises the level immediately.
  ctx.reset();
  player.vel.x = 200;
  ctx.currentTime += 1 / 60;
  host._updateBrakeHiss(1 / 60);
  assert.equal(rt.brakeGain.gain.scheduled, 0.25, 'hard decel must reach the ceiling with no delay');

  // Bullet time changes the noise playback rate target: also a wake, not a skip.
  ctx.reset();
  rt._bulletTimePitch = 0.85;
  ctx.currentTime += 1 / 60;
  host._updateBrakeHiss(1 / 60);
  assert.equal(rt.brakeNoise.playbackRate.scheduled, 0.85);
});

test('a hard silence behind the brake bed re-asserts on the next frame instead of skipping', () => {
  const { host, rt, ctx, player } = createBedHost(audio);
  // Braking at a steady speed holds the hiss on its floor value indefinitely — an unchanging,
  // audible target, which is exactly the case a naive cache would strand after a hard silence.
  player.vel.x = 300;
  host.state.input.actions.brake = true;
  host._updateBrakeHiss(1 / 60);
  ctx.currentTime += 1 / 60;
  host._updateBrakeHiss(1 / 60);
  assert.equal(rt.brakeGain.gain.scheduled, 0.04);
  ctx.reset();
  ctx.currentTime += 1 / 60;
  host._updateBrakeHiss(1 / 60);
  assert.equal(ctx.automation(), 0, 'a held brake target is at rest and must be skipped');

  // Pause hard-silences the bed behind the updater's back while the computed target is unchanged.
  host._silenceContinuousSources();
  assert.equal(rt.brakeGain.gain.scheduled, 0.0001);

  ctx.currentTime += 1 / 60;
  host._updateBrakeHiss(1 / 60);
  assert.equal(rt.brakeGain.gain.scheduled, 0.04,
    'resume must restore the hiss even though the computed target never changed');
});

test('tether hum sleeps while slack and wakes on the frame the line loads', () => {
  const { host, rt, ctx } = createBedHost(audio);

  host._updateTetherHum();
  assert.equal(ctx.calls.setTargetAtTime, 4, 'first pass must initialise both strands');
  assert.equal(rt.tetherHum.gain.scheduled, 0.0001);

  ctx.reset();
  for (let i = 0; i < 600; i++) { ctx.currentTime += 1 / 60; host._updateTetherHum(); }
  assert.equal(ctx.automation(), 0, 'a slack tether must schedule nothing');

  ctx.reset();
  host.state.player.tether = { active: true, strain: 0.5 };
  ctx.currentTime += 1 / 60;
  host._updateTetherHum();
  const expectedFreq = 90 + 0.5 * 220;
  const expectedGain = 0.006 + Math.pow(0.5, 1.25) * 0.13;
  assert.equal(rt.tetherOsc.frequency.scheduled, expectedFreq, 'pitch must track strain on the wake frame');
  assert.equal(rt.tetherHum.gain.scheduled, expectedGain, 'level must be the authored curve, unaltered');
  assert.equal(rt.tetherHum.gainValue, expectedGain, 'the gainValue mirror stays in step');

  // Overload strand only opens above 0.72 strain.
  ctx.reset();
  host.state.player.tether = { active: true, strain: 1.0 };
  ctx.currentTime += 1 / 60;
  host._updateTetherHum();
  assert.ok(rt.tetherOverloadGain.gain.scheduled > 0.0001, 'overload strand must open with no delay');

  ctx.reset();
  for (let i = 0; i < 60; i++) { ctx.currentTime += 1 / 60; host._updateTetherHum(); }
  assert.equal(ctx.automation(), 0, 'a held, unchanging strain is also at rest');
});

// ---------------------------------------------------------------------------------------------
// Mutation: prove the gates are load-bearing
// ---------------------------------------------------------------------------------------------

const SETTINGS_GATE = ['if (unchanged && t >= prev.settleAt) return;', 'if (false) return;'];
const BRAKE_GATE = [
  'if (cache.brakeGainNode !== rt.brakeGain || cache.brakeGain !== targetGain) {',
  'if (true) {',
];
const TETHER_GATE = [
  'if (cache.tetherHumNode !== rt.tetherHum || cache.tetherGain !== targetGain) {',
  'if (true) {',
];

let mutantSeq = 0;
async function importMutant(mutations) {
  let src = readFileSync(AUDIO_SRC, 'utf8');
  for (const [from, to] of mutations) {
    assert.ok(src.includes(from),
      `mutation anchor is stale, the mutation test would be vacuous: ${from}`);
    src = src.split(from).join(to);
  }
  // The mutant lives outside src/audio/, so rewrite its relative specifiers to absolute URLs.
  const base = pathToFileURL(AUDIO_DIR + path.sep).href;
  src = src.replace(/from\s+'(\.[^']*)'/g, (_m, spec) => `from '${new URL(spec, base).href}'`);
  const dest = path.join(mkdtempSync(path.join(tmpdir(), 'sf-audio-mutant-')), `m${++mutantSeq}.mjs`);
  writeFileSync(dest, src, 'utf8');
  return (await import(pathToFileURL(dest).href)).audio;
}

test('mutation: removing the settings gate restores per-frame churn and still lands identically', async () => {
  const mutant = await importMutant([SETTINGS_GATE]);

  const settings = SETTINGS();
  const { host, rt, ctx } = createSettingsHost(mutant, settings);
  host._applySettings();
  ctx.reset();
  runFrames(host, ctx, 600);
  assert.ok(ctx.automation() > 0,
    'MUTATION CHECK FAILED: the ungated build performed no steady-state automation, so the ' +
    'steady-state test above would pass either way and proves nothing');
  assert.equal(ctx.automation(), 600 * 13,
    'ungated build re-arms all seven buses (master snap + six ramps) every single frame');

  // Same script through the gated build must land on the same final gains.
  const gatedSettings = SETTINGS();
  const gated = createSettingsHost(audio, gatedSettings);
  gated.host._applySettings();
  runFrames(gated.host, gated.ctx, 300);
  gatedSettings.master = 0.9; gatedSettings.sfx = 0.4;
  runFrames(gated.host, gated.ctx, 300);

  settings.master = 0.9; settings.sfx = 0.4;
  runFrames(host, ctx, 300);

  for (const key of BUS_KEYS) {
    assert.equal(gated.rt[key].gain.scheduled, rt[key].gain.scheduled,
      `${key} must land on the identical final gain with and without the gate`);
  }
});

test('mutation: removing the bed gates restores per-frame churn on silent beds', async () => {
  const mutant = await importMutant([BRAKE_GATE, TETHER_GATE]);

  const brake = createBedHost(mutant);
  brake.host._updateBrakeHiss(1 / 60);
  brake.ctx.reset();
  for (let i = 0; i < 120; i++) { brake.ctx.currentTime += 1 / 60; brake.host._updateBrakeHiss(1 / 60); }
  assert.equal(brake.ctx.calls.setTargetAtTime, 120,
    'MUTATION CHECK FAILED: the ungated brake bed must write once per frame');

  const tether = createBedHost(mutant);
  tether.host._updateTetherHum();
  tether.ctx.reset();
  for (let i = 0; i < 120; i++) { tether.ctx.currentTime += 1 / 60; tether.host._updateTetherHum(); }
  assert.equal(tether.ctx.calls.setTargetAtTime, 120,
    'MUTATION CHECK FAILED: the ungated tether hum must write once per frame');
});
