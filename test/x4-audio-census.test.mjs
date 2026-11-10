// test/x4-audio-census.test.mjs — X4 #4: count what a player HEARS, not what the sim emits.
//
// The campaign census counted emitters: `ship:rcsPulse` 391 (one per craft every ~0.12 s) never
// reaches the cue gate at all, and `combat:actionRejected` 154 emits is admitted at most once per
// 4 ticks. This check drives the real post-gate functions
// (`resolveCombatActionLifecycleCue` -> `combatActionLifecyclePlayerRelevant` ->
// `shouldPlayCombatActionCue` -> host.play) over the census's own lifecycle band and reports the
// audible total. It is a scripted lifecycle, not a live round: the live 10-minute listen remains
// the open X4 acceptance step.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COMBAT_ACTION_SCORED_CUES,
  requestCombatActionAudio,
  resolveCombatActionLifecycleCue,
  shouldPlayCombatActionCue,
} from '../src/audio/minimalActionAudio.js';

test('X4 #4: the post-gate play log is far smaller than the emit census', () => {
  const played = [];
  const host = {
    state: { playerId: 1, tick: 0 },
    play(cueId) { played.push(cueId); },
    _applyPriorityCue() { /* the priority bus is not what this check measures */ },
  };
  let tick = 0;
  const emit = (event, payload) => {
    host.state.tick = tick;
    requestCombatActionAudio(host, event, payload, tick);
    tick += 1;
  };

  // The census's combat-lifecycle band: 154 rejected, 136 phases, 47 completed, 45 started.
  const before = { reject: played.length };
  for (let i = 0; i < 154; i++) emit('combat:actionRejected', { actorId: 1, actionId: 'dash' });
  const rejectPlays = played.length - before.reject;

  for (let i = 0; i < 136; i++) {
    emit('combat:actionPhase', { actorId: 1, actionId: 'dash', cueId: COMBAT_ACTION_SCORED_CUES[i % COMBAT_ACTION_SCORED_CUES.length] });
  }
  const beforeCompleted = played.length;
  for (let i = 0; i < 47; i++) emit('combat:actionCompleted', { actorId: 1, actionId: 'dash' });
  const completedPlays = played.length - beforeCompleted;

  const beforeStarts = played.length;
  for (let i = 0; i < 45; i++) emit('combat:actionPhase', { actorId: 1, actionId: 'dash', cueId: 'combat.action.dash.start' });
  const startPlays = played.length - beforeStarts;

  const submitted = 154 + 136 + 47 + 45;
  // The host keeps a rolling 64-record log; it names every submitted event and marks whether it
  // was audible. It is the "post-gate play log" the census should read.
  assert.ok(host._combatActionLog.length > 0 && host._combatActionLog.length <= 64);
  assert.equal(host._combatActionLog.every((r) => typeof r.played === 'boolean'), true);
  assert.ok(played.length < submitted / 2, `audible ${played.length} vs submitted ${submitted}`);
  // The gate's own arithmetic, measured rather than assumed:
  assert.equal(rejectPlays, 39, '154 rejects at 1/tick admit one per four-tick gap');
  assert.equal(completedPlays, 0, 'completed actions resolve to quiet end cues');
  assert.equal(startPlays, 0, 'start cues are deliberately quiet');
  for (const cue of played) {
    assert.equal(shouldPlayCombatActionCue(cue), true, `${cue} played without a scored body`);
  }
  // A cue with no scored body never reaches play, whatever the emitter count says.
  assert.equal(resolveCombatActionLifecycleCue('combat:actionStarted', { actionId: 'dash' }), null);
  console.log(`[x4 census] submitted=${submitted} audible=${played.length} reject=${rejectPlays} completed=${completedPlays} started=${startPlays} distinct=${new Set(played).size}`);
});
