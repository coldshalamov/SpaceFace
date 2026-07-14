#!/usr/bin/env node
import assert from 'node:assert/strict';

import {
  actorById,
  assertBeatEntered,
  assertIncludesAll,
  beatById,
  entityByActorId,
  readScenarioContract,
  runInspect,
} from './lib/check-47a-common.mjs';

const contract = readScenarioContract();
const beat = beatById(contract, 'scavenger_arrival');
assertIncludesAll(beat.requiredActors, ['player_kestrel', 'evidence_spindle_47a', 'scavenger_interceptor', 'scavenger_harasser', 'scavenger_thief'],
  'scavenger_arrival actors');
assertIncludesAll(beat.requiredMechanics, ['combat.weapon_fire', 'ai.screen_tug_steal', 'counter_tether.cut', 'counter_tether.dash'],
  'scavenger_arrival mechanics');
assertIncludesAll(beat.proofMetricIds, ['first_hostile_shot', 'enemy_counter_tether_count'],
  'scavenger_arrival proof metrics');

const harasserActor = actorById(contract, 'scavenger_harasser');
assert.equal(harasserActor.factionId, 'faction_reavers', 'harasser should be authored as Reaver faction');
assertIncludesAll(harasserActor.capabilities, ['ai.standoff_focus', 'weapon.fire', 'counter_tether.cut'],
  'harasser capabilities');
const thiefActor = actorById(contract, 'scavenger_thief');
assert.equal(thiefActor.factionId, 'faction_reavers', 'thief should be authored as Reaver faction');
assertIncludesAll(thiefActor.capabilities, ['ai.screen_tug_steal', 'massline.attach', 'counter_tether.dash'],
  'thief capabilities');
const interceptorActor = actorById(contract, 'scavenger_interceptor');
assert.equal(interceptorActor.factionId, 'faction_reavers', 'interceptor should be authored as Reaver faction');
assertIncludesAll(interceptorActor.capabilities, ['ai.interceptor_flyby', 'weapon.fire', 'counterplay.vector_break'],
  'interceptor capabilities');

const result = runInspect({ tick: 5200 });
assertBeatEntered(result, 'scavenger_arrival');
assert.equal(result.scenarioContract.activeBeatId, 'scavenger_arrival',
  'tick 5200 should be inside the scavenger arrival beat');
assert(result.metrics.firstHostileShotTick >= 75 * 60,
  'first hostile shot should not happen before the authored scavenger arrival beat');
assert(result.metrics.firstHostileShotTick <= 90 * 60,
  'first hostile shot should satisfy the <=90s proof metric');
assert(result.metrics.hostileCombatFire > 0, 'runtime should record hostile combat fire');
assert(result.metrics.projectileHits > 0, 'runtime should record projectile hits');
assert(result.metrics.combatDamage > 0, 'runtime should route hostile damage through combat');

const harasser = entityByActorId(result, 'scavenger_harasser');
assert.equal(harasser.team, 1, 'harasser should activate as a hostile team ship at scavenger beat');
assert.equal(harasser.factionId, 'faction_reavers', 'harasser should activate with Reaver faction');
assert.equal(harasser.data.ai.passive, false, 'harasser should no longer be passive after activation');
assert.equal(harasser.data.ai.doctrine, 'scavenger', 'harasser should use scavenger doctrine');
assert.equal(harasser.data.ai.preferredRole, 'support', 'harasser should keep standoff support role');
assert.equal(harasser.data.combat.targetId, result.snapshot.playerId, 'harasser should target the player');

const interceptor = entityByActorId(result, 'scavenger_interceptor');
assert.equal(interceptor.team, 1, 'interceptor should activate as a hostile team ship at scavenger beat');
assert.equal(interceptor.factionId, 'faction_reavers', 'interceptor should activate with Reaver faction');
assert.equal(interceptor.data.ai.passive, false, 'interceptor should no longer be passive after activation');
assert.equal(interceptor.data.ai.preferredRole, 'interceptor', 'interceptor should keep its flyby role');
assert.equal(interceptor.data.ai.combatDoctrineId, 'interceptor_flyby', 'interceptor should use the flyby doctrine');
assert.equal(interceptor.data.combat.targetId, result.snapshot.playerId, 'interceptor should target the player');

const thief = entityByActorId(result, 'scavenger_thief');
assert.equal(thief.team, 1, 'thief should activate as hostile team ship at scavenger beat');
assert.equal(thief.factionId, 'faction_reavers', 'thief should activate with Reaver faction');
assert.equal(thief.data.ai.passive, false, 'thief should no longer be passive after activation');
assert.equal(thief.data.ai.preferredRole, 'tug', 'thief should keep tug role');
assertIncludesAll(thief.data.ai.capabilities, ['tether', 'tug', 'steal', 'counter_tether_overload'],
  'runtime thief capabilities');

console.log(`47-A scavenger threat OK (first hostile shot tick ${result.metrics.firstHostileShotTick}, hits ${result.metrics.projectileHits})`);
