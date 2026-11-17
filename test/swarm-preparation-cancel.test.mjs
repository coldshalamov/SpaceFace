import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { canCancelSwarmPreparation, PREPARATION_CANCEL_REASON } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';

function fixture({ ruleset = 'swarm', startWave = 1 } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [runSession, survivalResults], updateOrder: [] });
  const owner = sim.registry.get('runSession');
  const results = sim.registry.get('survivalResults');
  const actor = sim.spawn({ type: 'ship', alive: true, isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {} });
  sim.state.playerId = actor.id;
  const notices = [], endings = [], forbidden = [];
  sim.bus.on('run:preparationCancelResolved', value => notices.push(value));
  sim.bus.on('run:ended', value => endings.push(value));
  for (const event of ['run:resultsReady', 'player:death', 'run:waveCleared']) {
    sim.bus.on(event, value => forbidden.push([event, value]));
  }
  owner.begin({ kind: 'survival', ruleset, seed: 4242, startWave });
  owner.transition({ expectedPhase: 'loadout', nextPhase: 'draft' });
  return { sim, state: sim.state, owner, results, actor, notices, endings, forbidden };
}

for (const startWave of [1, 11]) test(`opening preparation at round ${startWave} cancels without a result or invented death`, () => {
  const h = fixture({ startWave });
  try {
    h.owner.award({ credits: 2400, reason: 'test_starting_allowance' });
    h.state.player.credits = 729;
    const token = h.state.run.retireToken;
    assert.equal(canCancelSwarmPreparation(h.state.run), true);
    assert.equal(h.state.run.wave, startWave - 1);
    assert.equal(h.owner.retire({ token, intent: 'cancel_preparation' }), true);
    assert.equal(h.state.run.phase, 'ended');
    assert.equal(h.state.run.result.reason, PREPARATION_CANCEL_REASON);
    assert.equal(h.state.player.credits, 729, 'the owner never refunds or charges the campaign wallet');
    assert.equal(h.actor.alive, true);
    assert.equal(h.results.lastResult(), null);
    assert.deepEqual(h.forbidden, []);
    assert.equal(h.endings.length, 1, 'ordinary run cleanup still happens exactly once');
    assert.deepEqual(h.notices, [{ token, ok: true, reason: PREPARATION_CANCEL_REASON }]);
    h.sim.bus.emit('run:ended', { outcome: 'aborted', reason: 'late_duplicate' });
    assert.equal(h.results.lastResult(), null, 'a redundant receipt cannot publish the discarded run');
    assert.deepEqual(h.forbidden, []);
    assert.equal(h.owner.retire({ token, intent: 'cancel_preparation' }), false);
    assert.equal(h.notices.at(-1).ok, false, 'a repeated request receives a refusal, not another return');
  } finally { h.sim.dispose(); }
});

test('preparation cancellation refuses another mode, a planned round and a later armory', () => {
  for (const scenario of ['gauntlet', 'planned', 'active', 'later-draft']) {
    const h = fixture({ ruleset: scenario === 'gauntlet' ? 'scored' : 'swarm' });
    try {
      if (scenario === 'planned') h.state.run.wavePlanId = 'already-planned';
      if (scenario === 'active' || scenario === 'later-draft') {
        h.owner.transition({ expectedPhase: 'draft', nextPhase: 'wave_intro' });
        h.state.run.wave = 1;
        h.state.run.wavePlanId = 'round-one';
        h.owner.transition({ expectedPhase: 'wave_intro', nextPhase: 'active' });
        if (scenario === 'later-draft') h.owner.transition({ expectedPhase: 'active', nextPhase: 'draft' });
      }
      const before = structuredClone(h.state.run);
      assert.equal(canCancelSwarmPreparation(h.state.run), false, scenario);
      assert.equal(h.owner.retire({ token: h.state.run.retireToken, intent: 'cancel_preparation' }), false, scenario);
      h.owner.end({ outcome: 'aborted', reason: PREPARATION_CANCEL_REASON });
      assert.deepEqual(h.state.run, before, 'the internal ending seam also protects played runs');
      assert.equal(h.notices.length, 1);
      assert.equal(h.notices[0].ok, false);
      assert.deepEqual(h.endings, []);
      assert.deepEqual(h.forbidden, []);
    } finally { h.sim.dispose(); }
  }
});

test('cancellation tokens cannot end a successor, including a same-seed retry', () => {
  const h = fixture();
  try {
    const token = h.state.run.retireToken;
    assert.equal(h.owner.retire({ token: token + 1, intent: 'cancel_preparation' }), false);
    assert.equal(h.state.run.phase, 'draft');
    assert.equal(h.owner.retire({ token, intent: 'cancel_preparation' }), true);
    h.sim.bus.emit('game:exitToMenu', { source: 'swarm_preparation_cancelled' });
    assert.equal(h.state.run.phase, 'inactive');
    h.owner.begin({ kind: 'survival', ruleset: 'swarm', seed: 4242 });
    h.owner.transition({ expectedPhase: 'loadout', nextPhase: 'draft' });
    const successor = h.state.run.retireToken;
    assert.notEqual(successor, token);
    assert.equal(h.owner.retire({ token, intent: 'cancel_preparation' }), false);
    assert.equal(h.state.run.retireToken, successor);
    assert.equal(h.state.run.phase, 'draft');
    assert.deepEqual(h.forbidden, []);
  } finally { h.sim.dispose(); }
});
