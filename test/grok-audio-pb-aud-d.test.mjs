// Row 146 — SF-226 release/break, SF-228 slam, SF-229 bomb phases,
// SF-234 encounter arc, SF-236 origin shift, SF-237 voice budget.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  audio,
  COLLISION_CUE_COOLDOWN_TICKS,
  originShiftReset,
  rankVoiceForBudget,
  resolveCollisionCue,
  resolveEncounterArc,
  voiceBudgetDisposable,
  voiceInheritsOwner,
  ENCOUNTER_ARC_HOLD_S,
} from '../src/audio/audioSystem.js';
import { resolveMasslineInstrument } from '../src/audio/masslineInstrument.js';
import { resolveBombPhaseVoice } from '../src/audio/bombAudio.js';
import { weightDuckEnvelope, weightDuckGainForTarget } from '../src/audio/environmentMix.js';

test('SF-226 a clean release and a break are different voices; a messy let-go stays the snap', () => {
  const release = resolveMasslineInstrument({ event: 'release', classification: 'clean' });
  const broken = resolveMasslineInstrument({ event: 'break' });
  const messy = resolveMasslineInstrument({ event: 'release', classification: 'messy' });
  assert.equal(release.play, true);
  assert.equal(broken.play, true);
  assert.notEqual(release.recipeId, broken.recipeId);
  assert.notEqual(release.rate, broken.rate);
  assert.equal(messy.play, false, 'the snap owner keeps the messy release');
  assert.equal(release.recipeId, 'sfx_massline_release');
  assert.equal(broken.recipeId, 'sfx.tetherSnap');
});

test('SF-228 a kiss and a slam do not share a recipe, and weight ducks music not a critical voice', () => {
  const kiss = resolveCollisionCue({
    massA: 16, typeA: 'ship', massB: 16, typeB: 'ship', dp: 40, closingSpeed: 6,
  });
  const slam = resolveCollisionCue({
    massA: 400, typeA: 'ship', massB: 400, typeB: 'station', dp: 20000, closingSpeed: 150,
  });
  assert.equal(kiss.tier, 'kiss');
  assert.notEqual(slam.tier, 'kiss');
  assert.notEqual(kiss.recipeId, slam.recipeId);
  assert.ok(slam.rate < kiss.rate, 'the heavier, harder contact sits lower');
  const env = weightDuckEnvelope({ mass: 400, dp: 20000 }, 0);
  assert.ok(weightDuckGainForTarget('music', env, 20) < 1);
  assert.ok(weightDuckGainForTarget('ambient', env, 20) < 1);
  assert.equal(weightDuckGainForTarget('critical', env, 20), 1);
  assert.equal(weightDuckGainForTarget('comms', env, 20), 1);

  const host = Object.create(audio);
  host.state = { tick: 0 };
  assert.equal(host._admitCollisionCue({ aId: 'a', bId: 'b', dp: 80, tick: 10 }), true);
  assert.equal(
    host._admitCollisionCue({ aId: 'a', bId: 'b', dp: 80, tick: 10 + COLLISION_CUE_COOLDOWN_TICKS - 1 }),
    false,
    'the same pair does not re-voice inside the cooldown',
  );
});

test('SF-229 release, arm, and detonate are distinct, and a destroyed bomb does not detonate', () => {
  const fragRelease = resolveBombPhaseVoice('bomb_frag', 'release');
  const anchorRelease = resolveBombPhaseVoice('bomb_anchor', 'release');
  const fragArm = resolveBombPhaseVoice('bomb_frag', 'arm');
  const empDet = resolveBombPhaseVoice('bomb_emp', 'detonate');
  const fragDet = resolveBombPhaseVoice('bomb_frag', 'detonate');
  const dead = resolveBombPhaseVoice('bomb_frag', 'destroyed');
  assert.equal(fragRelease.play, true);
  assert.notEqual(fragRelease.rate, anchorRelease.rate, 'families do not share the bay pitch');
  assert.notEqual(fragArm.recipeId, fragRelease.recipeId);
  assert.ok(fragArm.gain < fragDet.gain);
  assert.notEqual(fragDet.recipeId, empDet.recipeId);
  assert.equal(dead.play, false);
  assert.equal(dead.recipeId, null);
});

test('SF-234 neutrals are not a fight, a flicker does not restart, recovery is not combat', () => {
  const neutrals = resolveEncounterArc({
    neutrals: true,
    context: { nearbyHostiles: 2 },
    nowS: 0,
  });
  assert.equal(neutrals.phase, 'travel');
  assert.equal(neutrals.inCombat, false);

  const telegraph = resolveEncounterArc({
    context: { nearbyHostiles: 2 },
    previousPhase: 'travel',
    nowS: 0,
  });
  assert.equal(telegraph.phase, 'travel', 'the phrase holds');
  assert.equal(telegraph.pendingPhase, 'tense');
  assert.equal(telegraph.restart, false);
  assert.equal(telegraph.inCombat, false);

  const still = resolveEncounterArc({
    context: {},
    previousPhase: telegraph.phase,
    pendingPhase: telegraph.pendingPhase,
    pendingSince: 0,
    nowS: 0.4,
  });
  assert.equal(still.phase, 'travel');
  assert.equal(still.restart, false);

  const landed = resolveEncounterArc({
    context: { nearbyHostiles: 2 },
    previousPhase: 'travel',
    pendingPhase: 'tense',
    pendingSince: 0,
    nowS: ENCOUNTER_ARC_HOLD_S,
  });
  assert.equal(landed.phase, 'tense');
  assert.equal(landed.restart, false);

  const fight = resolveEncounterArc({ context: { committedHostiles: 1, recentDamage: true } });
  assert.equal(fight.inCombat, true);
  assert.equal(fight.phase, 'combat');

  const breath = resolveEncounterArc({ context: {}, recovery: true, previousPhase: 'combat', nowS: 3, pendingPhase: 'travel', pendingSince: 0 });
  assert.equal(breath.inCombat, false);
  assert.equal(breath.recovery, true);
});

test('SF-236 an origin shift clears spatial memory and a reused id does not keep the old loop', () => {
  assert.equal(originShiftReset(undefined, 1), false);
  assert.equal(originShiftReset(1, 1), false);
  assert.equal(originShiftReset(1, 2), true);
  const previous = { id: 7 };
  const reused = { id: 7 };
  assert.equal(voiceInheritsOwner({ _trackEntity: previous }, previous), true);
  assert.equal(voiceInheritsOwner({ _trackEntity: previous }, reused), false);

  const voice = { trackId: 7, _trackEntity: previous, _audioGainTarget: 0.4, _audioPanTarget: 0.2 };
  const ended = [];
  const host = Object.create(audio);
  host._playerPos = () => ({ x: 0, z: 0 });
  host._endLoopVoice = (v) => { ended.push(v); };
  host.rt = { loops: { tow: voice }, _audioOriginSeq: 1 };
  host.state = {
    world: { frameOriginSeq: 2 },
    entities: new Map([[7, reused]]),
  };
  host._updateLoopPositions(0);
  assert.equal(voice._audioGainTarget, undefined);
  assert.equal(voice._audioPanTarget, undefined);
  assert.equal(ended.length, 1);
  assert.equal(host.rt.loops.tow, undefined);
  assert.equal(host.rt._audioOriginSeq, 2);
});

test('SF-237 a distant redundant loop yields before a refusal', () => {
  const distant = { loop: true, dist: 1400, startedAt: 0 };
  const refusal = { refusalSource: 'weapons:denied', startedAt: 0 };
  const playerVerb = { primary: true, startedAt: 9 };
  assert.ok(rankVoiceForBudget(distant) < rankVoiceForBudget({ startedAt: 1 }));
  assert.ok(rankVoiceForBudget(refusal) > rankVoiceForBudget(distant));
  assert.equal(voiceBudgetDisposable(distant), true);
  assert.equal(voiceBudgetDisposable(refusal), false);
  assert.equal(voiceBudgetDisposable(playerVerb), false);

  const dropped = [];
  const host = Object.create(audio);
  host._dropVoiceAt = (idx) => {
    dropped.push(host.rt.voices[idx]);
    host.rt.voices.splice(idx, 1);
  };
  const voices = [distant, refusal];
  while (voices.length < 12) voices.push({ startedAt: voices.length, dist: 10 });
  host.rt = { ctx: { currentTime: 5 }, voices };
  assert.equal(host._reserveVoiceSlot(true), true);
  assert.equal(dropped[0], distant);
  assert.ok(host.rt.voices.includes(refusal));
});
