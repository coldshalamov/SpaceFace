#!/usr/bin/env node
import assert from 'node:assert/strict';

import { ENEMY_TYPES } from '../src/data/enemies.js';
import { ActivityKind, RulesOfEngagement, activityForEncounterSpawn, canFireByDoctrine, roeForActivity } from '../src/ai/doctrine.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

const liveBase = {
  id: 'enc_fixture_001',
  phase: 'offer',
  anchor: { x: 120, z: -80 },
  zoneId: 'zone_fixture',
  shape: {},
  deadlineAt: 42,
};

assertEncounterDoctrine('pirate_toll', { role: 'leader', passive: true }, ActivityKind.HAIL_HOLD, RulesOfEngagement.HOLD_FIRE);
assertEncounterDoctrine('pirate_toll', { role: 'leader', passive: false }, ActivityKind.ATTACK_RUN, RulesOfEngagement.WEAPONS_FREE, { phase: 'conflict' });
assertEncounterDoctrine('patrol_scan', { role: 'leader' }, ActivityKind.SCAN_APPROACH, RulesOfEngagement.LAWFUL_WANTED_ONLY);
assertEncounterDoctrine('patrol_beat', { role: 'leader' }, ActivityKind.PATROL_ROUTE, RulesOfEngagement.LAWFUL_WANTED_ONLY);
assertEncounterDoctrine('convoy_departure', { role: 'hauler', passive: true }, ActivityKind.TRANSIT, RulesOfEngagement.HOLD_FIRE);
assertEncounterDoctrine('convoy_departure', { role: 'escort', passive: true }, ActivityKind.SCREEN, RulesOfEngagement.DEFENSIVE);
assertEncounterDoctrine('ambush_snare', { role: 'raider', passive: true }, ActivityKind.LOITER, RulesOfEngagement.HOLD_FIRE);
assertEncounterDoctrine('ambush_snare', { role: 'raider', passive: false }, ActivityKind.ATTACK_RUN, RulesOfEngagement.WEAPONS_FREE, { phase: 'conflict' });
assertEncounterDoctrine('named_hunter', { role: 'boss', passive: true }, ActivityKind.HAIL_HOLD, RulesOfEngagement.HOLD_FIRE);

for (const def of ENEMY_TYPES) {
  const spec = makeEnemySpawnSpec(def.id, def.levelRange ? def.levelRange[0] : 1, { x: 10, z: -10 });
  assert(spec.data && spec.data.ai, `${def.id} spawn must carry ai data`);
  assert(spec.data.ai.activity, `${def.id} spawn must carry activity`);
  assert(spec.data.ai.activity.reason.includes(def.id), `${def.id} activity must explain its archetype`);
  assert(Number.isFinite(spec.data.ai.activity.leashRadius) && spec.data.ai.activity.leashRadius > 0,
    `${def.id} activity must carry a positive leash`);
  assert(Object.values(RulesOfEngagement).includes(spec.data.ai.roe), `${def.id} spawn must carry a known ROE`);
}

assert.equal(spawnFor('patrol_lawman').data.ai.roe, RulesOfEngagement.LAWFUL_WANTED_ONLY);
assert.equal(spawnFor('mule_trader').data.ai.roe, RulesOfEngagement.DEFENSIVE);
assert.equal(spawnFor('lancer_sniper').data.ai.activity.kind, ActivityKind.REPOSITION);

const target = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
const self = { id: 2, pos: { x: 40, z: 0 } };
const attackObjective = ObjectiveKind.FOCUS;

assert.equal(canFireByDoctrine({
  activity: { kind: ActivityKind.HAIL_HOLD, anchor: { x: 0, z: 0 }, leashRadius: 500 },
  roe: RulesOfEngagement.HOLD_FIRE,
  objectiveKind: attackObjective,
  target,
  self,
}), false, 'hail/hold-fire ships must not shoot');

assert.equal(canFireByDoctrine({
  activity: { kind: ActivityKind.SCREEN, anchor: { x: 0, z: 0 }, leashRadius: 500 },
  roe: RulesOfEngagement.DEFENSIVE,
  objectiveKind: attackObjective,
  target,
  self,
  recentlyDamaged: false,
}), true, 'screening escorts may defend during a combat objective');

assert.equal(canFireByDoctrine({
  activity: { kind: ActivityKind.PATROL_ROUTE, anchor: { x: 0, z: 0 }, leashRadius: 500 },
  roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  objectiveKind: attackObjective,
  target,
  self,
  wanted: false,
}), false, 'lawful patrols must not shoot clean players');

assert.equal(canFireByDoctrine({
  activity: { kind: ActivityKind.PATROL_ROUTE, anchor: { x: 0, z: 0 }, leashRadius: 500 },
  roe: RulesOfEngagement.LAWFUL_WANTED_ONLY,
  objectiveKind: attackObjective,
  target,
  self,
  wanted: true,
}), true, 'lawful patrols may shoot wanted players');

assert.equal(canFireByDoctrine({
  activity: { kind: ActivityKind.ATTACK_RUN, anchor: { x: 0, z: 0 }, leashRadius: 20 },
  roe: RulesOfEngagement.WEAPONS_FREE,
  objectiveKind: attackObjective,
  target,
  self: { id: 2, pos: { x: 200, z: 0 } },
}), false, 'ships outside their leash must not keep firing');

process.stdout.write(JSON.stringify({
  schema: 'spaceface.ai.intentionality.v1',
  enemyArchetypes: ENEMY_TYPES.length,
  encounterShapes: 9,
  deterministic: true,
}, null, 2) + '\n');

function assertEncounterDoctrine(shapeId, ship, expectedActivity, expectedRoe, liveOverrides = {}) {
  const live = { ...liveBase, ...liveOverrides, shapeId };
  const activity = activityForEncounterSpawn(live, ship, { now: 3 });
  assert.equal(activity.kind, expectedActivity, `${shapeId}/${ship.role || 'squad'} activity`);
  assert.equal(activity.encounterId, live.id, `${shapeId} activity must preserve encounter id`);
  assert.equal(roeForActivity(activity, ship.roe), expectedRoe, `${shapeId}/${ship.role || 'squad'} ROE`);
  assert(activity.anchor && activity.anchor.x === live.anchor.x && activity.anchor.z === live.anchor.z,
    `${shapeId} activity must inherit encounter anchor`);
}

function spawnFor(id) {
  return makeEnemySpawnSpec(id, 1, { x: 0, z: 0 });
}
