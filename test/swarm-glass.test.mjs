// S2 task 1: the Swarm glass policy. During a live Swarm round only fight sources are
// admitted and callouts must be short, plain and free of jargon. Outside a live run the
// policy is inert — Adventure admits everything it did before.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isSwarmGlass,
  swarmGlassAdmits,
  swarmCalloutText,
  SWARM_CALLOUT_MAX,
  SWARM_CALLOUT_WORDS,
} from '../src/ui/swarmGlass.js';
import { admitReceipt } from '../src/ui/hudAttention.js';

function swarmState(phase = 'active') {
  return { run: { kind: 'survival', phase, ruleset: 'swarm', arenaId: 'helios_core' } };
}
function adventureState() {
  return { run: { kind: 'adventure' } };
}

test('isSwarmGlass is true only for a live Swarm run', () => {
  assert.equal(isSwarmGlass(swarmState()), true);
  assert.equal(isSwarmGlass(swarmState('shop')), true);
  assert.equal(isSwarmGlass(swarmState('inactive')), false);
  assert.equal(isSwarmGlass(adventureState()), false);
  assert.equal(isSwarmGlass({}), false);
  assert.equal(isSwarmGlass(null), false);
  assert.equal(isSwarmGlass({ run: { kind: 'survival', phase: 'active', ruleset: 'gauntlet' } }), false);
});

test('fight sources are admitted in Swarm; everything else is refused', () => {
  const state = swarmState();
  for (const source of ['swarm-callout', 'boss', 'danger', 'round']) {
    assert.equal(swarmGlassAdmits(state, { source }), true, source);
  }
  const refused = [
    'bark', 'chatter', 'news', 'comms', 'faction', 'codex', 'landmark', 'contract',
    'massline-detail', 'target-card', 'physics-log', 'discovery', 'cargo-recovery',
    'stunt', 'score', 'economy', 'ambient', 'tutorial', '',
  ];
  for (const source of refused) {
    assert.equal(swarmGlassAdmits(state, { source }), false, source);
  }
  assert.equal(swarmGlassAdmits(state), false, 'no source refuses');
});

test('outside a live Swarm run every source is admitted (Adventure unchanged)', () => {
  for (const state of [adventureState(), {}, null, swarmState('inactive')]) {
    for (const source of ['bark', 'chatter', 'news', 'comms', 'faction', 'codex',
      'landmark', 'contract', 'stunt', 'swarm-callout', 'boss', 'danger', 'round', '']) {
      assert.equal(swarmGlassAdmits(state, { source }), true, source);
    }
  }
});

test('callouts pass only when short, plain and jargon-free', () => {
  assert.equal(swarmCalloutText('PILE-UP ×7'), 'PILE-UP ×7');
  assert.equal(swarmCalloutText('double kill'), 'DOUBLE KILL');
  assert.equal(swarmCalloutText('DART RUSH'), 'DART RUSH');
  assert.equal(swarmCalloutText('NEW: SNIPER'), 'NEW: SNIPER');
  assert.equal(swarmCalloutText('CROSS ITS BOW'), 'CROSS ITS BOW');
  assert.equal(swarmCalloutText('  pile   up!  '), 'PILE UP!');
});

test('callouts reject jargon, telemetry and long lines', () => {
  for (const bad of [
    'LINE RELEASED 16T — MESSY',
    'Clean snag 93',
    'IMPACT LOGGED — 504',
    'MASS 48672 · WON\'T BUDGE',
    'ARENA: SHUNTED ×9',
    'WINDOW CLOSED',
    'RIDE 85',
    'STRAIN 38%',
    'SOLID HIT 94',
    'LINE-RATED 20T',
    'Sidestep or send it back',
    'four words too many',
    'payload ready',
    '',
    null,
    undefined,
  ]) {
    assert.equal(swarmCalloutText(bad), null, JSON.stringify(bad));
  }
});

test('budget constants match the taste bar', () => {
  assert.equal(SWARM_CALLOUT_MAX, 3);
  assert.equal(SWARM_CALLOUT_WORDS, 3);
});

// S2 task 2: the same policy applied at the receipt seam — a live Swarm round drops
// chatter, news, discovery, target-card and massline-telemetry receipts wholesale, keeps
// actionable errors, resolves boss channel to 'boss', and gates stunt text on readability.
test('receipt glass drops Adventure surfaces during a live Swarm round', () => {
  const state = swarmState();
  for (const receipt of [
    { text: 'Convoy needs escort', channel: 'chatter' },
    { text: 'Market prices shift', channel: 'news' },
    { text: 'New codex entry', kind: 'codex' },
    { text: 'Landmark charted', kind: 'landmark' },
    { text: 'TARGET: Viper', kind: 'target' },
    { text: 'LINE LOAD 84%', channel: 'massline' },
    { text: 'Contract offered', kind: 'contract' },
    { text: 'Ambient patter', kind: 'ambient' },
  ]) {
    assert.equal(admitReceipt({ ...receipt, state }).admit, false, JSON.stringify(receipt));
  }
});

test('receipt glass keeps fight-relevant and actionable receipts in Swarm', () => {
  const state = swarmState();
  assert.equal(admitReceipt({ text: 'Denied', kind: 'error', state }).admit, true, 'errors stay');
  assert.equal(admitReceipt({ text: 'Boss armour cracked', channel: 'capitalBoss', state }).admit, true,
    'capitalBoss resolves to boss');
  assert.equal(admitReceipt({ text: 'ROUND 4', channel: 'round', state }).admit, true, 'round channel');
  assert.equal(admitReceipt({ text: 'Watch the flanks', channel: 'swarm-callout', state }).admit, true,
    'swarm callout channel');
  assert.equal(admitReceipt({ text: 'Kinetic ram', kind: 'stunt', channel: 'stunt', state }).admit, true,
    'plain stunt callout');
});

test('receipt glass rejects stunt jargon in Swarm but not in Adventure', () => {
  const state = swarmState();
  assert.equal(
    admitReceipt({ text: 'CLEAN SNAG 93', kind: 'stunt', channel: 'stunt', state }).admit,
    false, 'jargon stunt dropped in Swarm');
  assert.equal(
    admitReceipt({ text: 'CLEAN SNAG 93', kind: 'stunt', channel: 'stunt', state: adventureState() }).admit,
    true, 'same receipt admits in Adventure');
  assert.equal(
    admitReceipt({ text: 'Convoy needs escort', channel: 'chatter', state: adventureState() }).admit,
    false, 'chatter still dropped in Adventure by its own rule — glass adds nothing');
});
