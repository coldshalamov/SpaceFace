import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { applyFeatureConfigToMaps, PRODUCTION_FEATURES, restoreFeatureMaps, snapshotFeatureMaps } from '../src/data/featureFlags.js';
import { combat } from '../src/systems/combat.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRewards } from '../src/systems/survivalRewards.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { earnLine } from '../src/ui/survivalHud.js';

test('a fresh lethal whip names Massline whip on the real run award line', () => {
  const previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  const state = createGameState(4242), bus = createBus();
  const combatSystem = Object.create(combat);
  const session = Object.create(runSession), rewards = Object.create(survivalRewards);
  state.playerId = 1;
  state.tick = 60;
  state.simTime = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, data: {},
  };
  const victim = {
    id: 2, type: 'ship', alive: true, team: 1, radius: 10, rot: 0,
    pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, hull: 20, hullMax: 20,
    shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, flags: {},
    data: { level: 1, runCohort: 'survival', rewardEligible: true, threatClass: 'fodder' },
  };
  state.entities.set(player.id, player);
  state.entities.set(victim.id, victim);
  state.entityList.push(player, victim);
  session.init({ state, bus });
  rewards.init({ state, bus });
  combatSystem.init({ state, bus, helpers: {} });
  const awards = [], kills = [];
  bus.on('run:awarded', award => awards.push(award));
  bus.on('entity:killed', kill => kills.push(kill));
  try {
    bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
    for (const nextPhase of ['arena_intro', 'wave_intro', 'active']) {
      bus.emit('run:transitionRequested', { expectedPhase: state.run.phase, nextPhase });
    }
    noteSwarmPilotAction(state);
    assert.equal(state.run.phase, 'active');
    assert.equal(readRecentImpulseProvenance(victim, state.tick), null, 'fresh victim has no impulse attribution');
    const impact = {
      victimId: victim.id, targetId: 3, rating: 'crushing', momentum: 72000,
      pos: { x: 30, z: 0 }, approach: { x: 1, z: 0 }, normal: { x: -1, z: 0 },
    };

    // This production subscription invokes onWhipImpact -> kernel -> combat.kill -> rewards.
    bus.emit('tether:whipImpact', impact);
    assert.equal(victim.alive, false, 'the real damage kernel kills the victim');
    assert.equal(kills.length, 1);
    assert.equal(awards.length, 1, 'one death earns one award');
    assert.equal(awards[0].score, 100);
    assert.equal(awards[0].xp, 3);
    const line = earnLine(awards[0]);
    assert.match(line, /Massline whip/, 'lethal whip must name its cause on the earn line');
    assert.doesNotMatch(line, /massline_whip|A weapon|undefined/);
    assert.equal(kills[0].cause, 'massline_whip', 'kill receipt preserves the lethal physical cause');
    assert.equal(awards[0].causePhrase, 'Massline whip');
    assert.equal(readRecentImpulseProvenance(victim, state.tick), null, 'wording does not depend on an impulse record');

    bus.emit('tether:whipImpact', impact);
    assert.equal(kills.length, 1);
    assert.equal(awards.length, 1, 'a repeated impact on the corpse cannot pay twice');
  } finally {
    combatSystem.kernel?.dispose();
    rewards.destroy();
    session.destroy();
    restoreFeatureMaps(previousFlags);
  }
});
