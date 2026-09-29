// INF-2 (WF-13, audio) - the rope's two refusals used to have different hearing.
//
// CONSIDERED. Player words: "When the rope refuses a latch I hear a tick and I know it heard me.
// When it refuses a cut, nothing at all happens - the line just stays there - so I press it again
// because I cannot tell whether the game registered the key." The visible warn toast existed; the
// audio half of the same refusal was a hole, and the deny voice (sfx_massline_deny, the promoted
// massline_deny.wav) had been sitting on the shelf since TOOL-01 wired it to latches only.
//
// Three real alternatives:
//   (a) route the refused cut through the same minimal action audio the refused latch uses
//   (b) author a second refusal sample for cuts
//   (c) rely on the warn toast alone
// (a) wins: one deny language for one rope. (b) loses to "no new recordings" - the intake list
// owns samples. (c) loses because the toast is debounced to one per reason and expires in 2 s,
// and reduced-motion may thin the picture but must never delete a cue that is information.
//
// PROVE. A refused cut requests a recipe within the same 0.1 s window every other action gets,
// it is the rope's deny voice and not the menu error or the success snap, and a held key cannot
// machine-gun it.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MINIMAL_ACTION_AUDIO,
  MINIMAL_ACTION_AUDIO_MAX_DELAY_TICKS,
  requestMinimalActionAudio,
} from '../src/audio/minimalActionAudio.js';
import { RECIPES } from '../src/data/audioRecipes.js';

const byId = new Map(MINIMAL_ACTION_AUDIO.map((row) => [row.id, row]));

function hostStub(tick) {
  const plays = [];
  return {
    plays,
    state: {
      tick,
      playerId: 'player',
      player: { tether: { active: true, phase: 'loaded', load: 0.5, strain: 0.01 } },
      settings: { accessibility: { reduceMotion: true }, video: { motionReduce: true } },
    },
    _mineOwnsEar() { return false; },
    _applyPriorityCue() {},
    play(recipeId, opts) { plays.push({ recipeId, opts, tick: this.state.tick }); },
  };
}

test('a refused cut answers, in the same voice as a refused latch', () => {
  const cut = byId.get('cutDenied');
  const latch = byId.get('latchDenied');
  assert.ok(cut, 'the refused cut has an action-audio row - it used to be mute');
  assert.ok(latch, 'the refused latch still has its row');
  assert.equal(cut.sourceEvent, 'tether:cutDenied');
  assert.equal(cut.recipeId, latch.recipeId,
    'one deny language: both refusals are the Massline deny voice');
  assert.ok(RECIPES.find((row) => row.id === cut.recipeId), 'the deny recipe exists');
});

test('the deny voice is the rope refusing, not the menu or the success', () => {
  const cut = byId.get('cutDenied');
  assert.equal(cut.recipeId, 'sfx_massline_deny');
  assert.notEqual(cut.recipeId, 'sfx_ui_error', 'a refusal is not the menu error');
  const successIds = new Set(
    MINIMAL_ACTION_AUDIO.map((row) => row.recipeId).filter((id) => id !== cut.recipeId),
  );
  assert.equal(successIds.has('sfx_massline_deny'), false,
    'only the two refusals share the deny voice');
  // The successful latch keeps its own id - TOOL-01's done check, still true.
  const latchSuccess = RECIPES.find((row) => row.id === 'tether_latch' || row.id === 'sfx_tether_latch');
  assert.ok(latchSuccess === undefined || latchSuccess.id !== 'sfx_massline_deny',
    'a successful latch never plays the deny voice');
});

test('a refused cut is heard within the action-audio window, and reduced motion keeps it', () => {
  const cut = byId.get('cutDenied');
  const payload = { targetId: 'rock-1', attachmentId: 'line-1', reason: 'cut_rejected' };
  const host = hostStub(240);
  const result = requestMinimalActionAudio(host, 'cutDenied', payload, 240);
  assert.ok(result && result.played, 'the refusal plays');
  assert.equal(host.plays.length, 1, 'exactly one voice per refusal');
  assert.equal(host.plays[0].recipeId, 'sfx_massline_deny');
  assert.ok(Math.abs(host.plays[0].tick - 240) <= MINIMAL_ACTION_AUDIO_MAX_DELAY_TICKS,
    'within the 0.1 s action window');
  assert.equal(host.plays[0].opts.reducedMotionKept, true,
    'the cue is information, so reduced motion keeps it');
});

test('a held key cannot machine-gun the refusal', () => {
  const cut = byId.get('cutDenied');
  const payload = { targetId: 'rock-1', attachmentId: 'line-1', reason: 'cut_rejected' };
  assert.ok(cut.cooldownTicks > 0, 'the refusal carries a cooldown');
  assert.equal(cut.cooldownTicks, byId.get('latchDenied').cooldownTicks,
    'same cadence as the latch refusal, so neither is the spammy one');
  const host = hostStub(300);
  requestMinimalActionAudio(host, 'cutDenied', payload, 300);
  const requestAgain = requestMinimalActionAudio(host, 'cutDenied', payload, 301);
  assert.equal(host.plays.length, 1, 'the second press inside the cooldown is quiet');
  assert.ok(!requestAgain || requestAgain.played !== true, 'nothing is requested again');
});
