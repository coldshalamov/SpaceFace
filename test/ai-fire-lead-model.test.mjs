import assert from 'node:assert/strict';
import test from 'node:test';

import { ActivityKind, RulesOfEngagement, normalizeActivity } from '../src/ai/doctrine.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { aimTrueProjectileVelocity } from '../src/combat/tetherFireControl.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';

function fireAt(targetVelocity) {
  const target = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 1500, z: 0 }, vel: { ...targetVelocity }, rot: 0, data: {},
  };
  const shooter = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 1200, z: 0 }, vel: { x: 0, z: 100 }, rot: 0,
    data: {
      intent: { fire: false }, combat: {}, weapons: [{ projSpeed: 320 }],
      ai: {
        passive: false, lawful: false, forcePlayerTarget: true, hostileTeams: [0],
        motive: 'cargo_extortion', engagementTrigger: 'explicit_refusal',
        zoneId: 'zone_ceres_ambush', approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1, combatDoctrineId: 'swarm_pack',
        activity: normalizeActivity({
          kind: ActivityKind.ATTACK_RUN, reason: 'pirate_toll:refused',
          anchor: { x: 1400, z: 0 }, leashRadius: 2200, startedTick: 100,
        }),
        roe: RulesOfEngagement.WEAPONS_FREE,
      },
    },
  };
  const state = {
    tick: 160, playerId: target.id, player: { heat: 0 },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([[target.id, target], [shooter.id, shooter]]),
    entityList: [target, shooter], combat: { trace: { events: [] } },
  };
  applyAIFiringIntent({
    entityId: shooter.id,
    directive: {
      objective: {
        kind: ObjectiveKind.FOCUS, targetId: target.id,
        reason: 'combat_doctrine:swarm_pack:strike',
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: { doctrineId: 'swarm_pack', phase: 'strike', fireWindow: true },
  }, state);
  assert.equal(shooter.data.intent.fire, true, 'the real adapter must admit this authorized burst');
  return { shooter, target, angle: shooter.data.intent.aimAngle };
}

test('a strafing NPC aims at a stationary target without compensating lateral velocity twice', () => {
  const { angle } = fireAt({ x: 0, z: 0 });
  assert.ok(Math.abs(angle) < 1e-12, `stationary target requires a horizontal world shot, got ${angle}`);
});

test('NPC lead intersects a moving target using the shipped projectile velocity', () => {
  const { shooter, target, angle } = fireAt({ x: 35, z: -55 });
  const velocity = aimTrueProjectileVelocity(angle, 320, shooter.vel);
  const dx = target.pos.x - shooter.pos.x;
  const dz = target.pos.z - shooter.pos.z;
  const closingX = velocity.x - target.vel.x;
  const closingZ = velocity.z - target.vel.z;
  const flightTime = (dx * closingX + dz * closingZ) / (closingX ** 2 + closingZ ** 2);
  const missDistance = Math.hypot(dx - closingX * flightTime, dz - closingZ * flightTime);
  assert.ok(flightTime > 0 && flightTime < 2, `intercept must lie ahead within weapon travel time: ${flightTime}`);
  assert.ok(missDistance < 0.01, `world-space projectile misses the moving target by ${missDistance} WU`);
});
