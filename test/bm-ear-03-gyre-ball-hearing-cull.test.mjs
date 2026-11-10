// BM-03 — a bowled gyre ball obeys the hearing cull. Past TABLE_HEARING_FAR_WU a source
// attenuates to silence on every mix term (bombAudio.js: the precedent SF-230 mirrors), so a
// rumble wanted out there is a floored voice burning a node graph and a cap slot — and it fights
// the engine's hearing release (0.5 s grace, then release; sync restarts it; churn). A 520 wu/s
// ball over a 9 s TTL flies ~4000 WU against ~613 WU of hearing: ~8 s of every long flight held
// floored. Reconcile must release the drifted-out rumble and re-arm it if it crosses back.
// Deterministic — seed 4242 is the ear fixture seed.
import assert from 'node:assert/strict';
import test from 'node:test';

import { TABLE_HEARING_FAR_WU } from '../src/render/tabletopPolicy.js';
import {
  collectFieldLoopSpecs,
  syncFieldAudioLoops,
} from '../src/audio/fieldAudio.js';

const SEED = 4242;
// Well inside hearing (~613 WU) vs past it — both derived from the live constant.
const NEAR = { x: 100, z: 0 };
const FAR = TABLE_HEARING_FAR_WU + 500;

function stateWithBalls(ballPos, balls = []) {
  const entities = new Map();
  entities.set('p', { id: 'p', pos: { x: 0, z: 0 }, alive: true });
  return {
    playerId: 'p',
    entities,
    fields: { active: [] },
    gyreSnare: {
      phase: 'off',
      launchedId: 7,
      ballPos: { ...ballPos },
      ballMass: 300,
      // A ball in flight publishes its velocity — the loop attenuates by speed
      // (stalled = 0.2 whisper), so the fixture must carry it like the mirror does.
      ballVx: 60, ballVz: 0,
      balls,
    },
  };
}

function fakeHost(state) {
  const started = [];
  const ended = [];
  const host = {
    state,
    rt: { loops: {}, _bulletTimePitch: 1 },
    _startLoopVoice(recipeId, position, gain, options) {
      const voice = { recipeId, position, gain, options, loop: false, _stopped: false };
      started.push(voice);
      return voice;
    },
    _endLoopVoice(voice) { voice._stopped = true; ended.push(voice); },
    _setVoiceRate(voice, rate) { voice._rate = rate; },
    _markLoopPositionDirty() {},
    started,
    ended,
  };
  return host;
}

test('a ball past hearing is not wanted; a ball in range keeps its exact voice', () => {
  assert.equal(SEED, 4242);
  // Past hearing: no rumble spec — not quiet, absent.
  const far = collectFieldLoopSpecs(stateWithBalls({ x: FAR, z: 0 }));
  assert.equal(far.length, 0, 'a past-hearing ball wants no loop spec');
  // In range: the same voice as before — key, recipe, track, envelope all intact.
  const near = collectFieldLoopSpecs(stateWithBalls(NEAR));
  assert.equal(near.length, 1, 'a ball in range still wants its rumble');
  assert.equal(near[0].key, 'fieldLoop_gyreBall');
  assert.equal(near[0].recipeId, 'sfx_field_loop_gyre_ball');
  assert.equal(near[0].trackId, 7);
  assert.ok(near[0].envelope > 0.5 && near[0].envelope <= 1);
  // Secondaries cull independently: the far one drops, the near one keeps its own key.
  const mixed = collectFieldLoopSpecs(stateWithBalls(NEAR, [
    { id: 8, x: FAR, z: 0, mass: 200 },
    { id: 9, x: 120, z: 40, mass: 200 },
  ]));
  const keys = mixed.map((s) => s.key).sort();
  assert.deepEqual(keys, ['fieldLoop_gyreBall', 'fieldLoop_gyreBall9']);
});

test('sync releases a rumble that drifts out of range, and re-arms it if it crosses back', () => {
  assert.equal(SEED, 4242);
  const state = stateWithBalls(NEAR);
  const host = fakeHost(state);
  syncFieldAudioLoops(host);
  const voice = host.rt.loops.fieldLoop_gyreBall;
  assert.ok(voice, 'the flying ball owns a rumble voice');
  // The ball drifts past hearing: the loop is released — no floored hold.
  state.gyreSnare.ballPos = { x: FAR, z: 0 };
  syncFieldAudioLoops(host);
  assert.equal(host.rt.loops.fieldLoop_gyreBall, undefined, 'drifted-out ball releases its loop');
  assert.ok(voice._stopped, 'the released voice was ended, not orphaned');
  // A ball thrown back across the table re-arms — the arc reads at range again.
  state.gyreSnare.ballPos = { ...NEAR };
  syncFieldAudioLoops(host);
  const rearmed = host.rt.loops.fieldLoop_gyreBall;
  assert.ok(rearmed, 'a ball back in range re-arms its rumble');
  assert.equal(rearmed.recipeId, 'sfx_field_loop_gyre_ball');
});
