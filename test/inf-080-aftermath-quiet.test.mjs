// INF-080 — make the aftermath quieter without stopping the world. Combat pressure
// was already gated post-fight (tension aftermath/recovery refuses combat, the rhythm
// forbids it, cooldowns bite), but a meaningful CIVILIAN demand — a distress decision,
// a convoy hail — could land on the player's plate seconds after a kill while loot
// sat uninspected: nothing gated the civilian deck on the earned recovery. Now such
// demands defer through aftermath/recovery and through the voice owner's short
// post-combat silence, while ambient world-life keeps flowing and live rows (active
// threats, running jobs) never consult this gate at all.
import test from 'node:test';
import assert from 'node:assert/strict';

import { tensionPacingBlockReason } from '../src/ai/tensionPolicy.js';
import { TENSION_POLICY_SCHEMA } from '../src/ai/tensionPolicy.js';

const NOW = 1000;
const DIR = { lastMeaningfulAt: -1e9 };

function policy(overrides = {}) {
  return {
    schema: TENSION_POLICY_SCHEMA,
    enabled: true,
    issuedAt: NOW - 1,
    validUntil: NOW + 2,
    phase: 'aftermath',
    rhythmPhase: 'aftermath',
    motif: 'voyage',
    chapter: 0,
    act: 0,
    target: 0.10,
    requested: 0.10,
    observed: 0.10,
    allowCombat: false,
    allowMajor: false,
    combatRate: 0.15,
    civilianRate: 1,
    minGapS: 60,
    preference: 0,
    recentShapes: [],
    ...overrides,
  };
}

function stateWith(phase, quietUntil = -Infinity) {
  return {
    simTime: NOW,
    tensionDirector: { policy: policy({ phase }) },
    barkDirector: { postCombatSilenceUntil: quietUntil },
  };
}

const DISTRESS = { id: 'distress-call', deck: 'civilian', tier: 'minor' };
const COMBAT_MINOR = { id: 'ambush-snare', deck: 'combat', tier: 'minor' };
const AMBIENT_PROP = { id: 'trader-run', deck: 'civilian', tier: 'ambient' };

test('a civilian demand defers through the earned aftermath', () => {
  const reason = tensionPacingBlockReason(DIR, stateWith('aftermath'), DISTRESS, NOW);
  assert.equal(reason, 'tension_recovery', 'distress decision waits out the aftermath');
});

test('a civilian demand defers through recovery too', () => {
  const state = stateWith('recovery');
  state.tensionDirector.policy.allowCombat = false;
  const reason = tensionPacingBlockReason(DIR, state, DISTRESS, NOW);
  assert.equal(reason, 'tension_recovery', 'recovery is the deepest rest');
});

test('ambient world-life keeps flowing through the aftermath', () => {
  const reason = tensionPacingBlockReason(DIR, stateWith('aftermath'), AMBIENT_PROP, NOW);
  assert.equal(reason, null, 'props are not demands');
});

test('ordinary phases resume ordinary life', () => {
  const open = stateWith('opportunity');
  open.tensionDirector.policy.allowCombat = true;
  open.tensionDirector.policy.rhythmPhase = 'curiosity';
  assert.equal(tensionPacingBlockReason(DIR, open, DISTRESS, NOW), null, 'opportunity takes demands');
  const quiet = stateWith('quiet');
  assert.equal(tensionPacingBlockReason(DIR, quiet, DISTRESS, NOW), null, 'quiet takes demands');
});

test('the voice silence covers the immediate tail before aftermath engages', () => {
  const open = stateWith('opportunity');
  open.tensionDirector.policy.allowCombat = true;
  open.tensionDirector.policy.rhythmPhase = 'curiosity';
  open.barkDirector.postCombatSilenceUntil = NOW + 8;
  const reason = tensionPacingBlockReason(DIR, open, DISTRESS, NOW);
  assert.equal(reason, 'post_combat_silence', 'kill confirmations get the floor first');
});

test('an expired silence stops deferring', () => {
  const open = stateWith('opportunity');
  open.tensionDirector.policy.allowCombat = true;
  open.tensionDirector.policy.rhythmPhase = 'curiosity';
  open.barkDirector.postCombatSilenceUntil = NOW - 1;
  assert.equal(tensionPacingBlockReason(DIR, open, DISTRESS, NOW), null, 'expired window fails open');
});

test('missing windows and policies fail open', () => {
  const open = stateWith('opportunity');
  open.tensionDirector.policy.allowCombat = true;
  open.tensionDirector.policy.rhythmPhase = 'curiosity';
  delete open.barkDirector;
  assert.equal(tensionPacingBlockReason(DIR, open, DISTRESS, NOW), null, 'no voice state, no deferral');
  assert.equal(tensionPacingBlockReason(DIR, { simTime: NOW }, DISTRESS, NOW), null, 'no policy, no deferral');
  assert.equal(tensionPacingBlockReason(DIR, open, AMBIENT_PROP, NOW), null, 'silence never blocks props');
});

test('combat gating is unchanged', () => {
  assert.equal(
    tensionPacingBlockReason(DIR, stateWith('aftermath'), COMBAT_MINOR, NOW),
    'tension_recovery',
    'combat still refused in aftermath',
  );
});
