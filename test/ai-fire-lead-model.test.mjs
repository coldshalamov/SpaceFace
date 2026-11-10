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

// SF-050: a doctrine-committed firing corridor anchors at the telegraph and only corrects inside
// a bounded band — the window flies the line the pilot was shown, and a dodge beats it.

function corridorFixture() {
  const target = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 1500, z: 0 }, vel: { x: 0, z: 60 }, rot: 0, data: {},
  };
  const shooter = {
    id: 2, type: 'ship', alive: true, team: 1,
    pos: { x: 1200, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      intent: { fire: false }, combat: {}, weapons: [{ projSpeed: 320 }],
      ai: {
        passive: false, lawful: false, forcePlayerTarget: true, hostileTeams: [0],
        motive: 'cargo_extortion', engagementTrigger: 'explicit_refusal',
        zoneId: 'zone_ceres_ambush', approachTelegraph: 'engine_flare',
        noFireResponseWindowS: 1, combatDoctrineId: 'ranged_disengager',
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
  const CORRIDOR = { bearing: 0.18, capRad: 0.1 };
  const fire = (phase, fireWindow) => applyAIFiringIntent({
    entityId: shooter.id,
    directive: {
      objective: {
        kind: ObjectiveKind.FOCUS, targetId: target.id,
        reason: `combat_doctrine:ranged_disengager:${phase}`,
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: {
      doctrineId: 'ranged_disengager', phase, phaseStartedTick: 45, cycle: 0, fireWindow,
      aimCommit: CORRIDOR,
    },
  }, state);
  return { target, shooter, state, fire };
}

test('a committed corridor anchors at the cue and a dodge cannot re-track the window shot', () => {
  const { target, shooter, fire } = corridorFixture();
  // The cue holds the corridor line without firing — the anchor is the true lead at cue time.
  fire('charge_cue', false);
  assert.equal(shooter.data.intent.fire, false, 'the telegraph never releases the volley');
  assert.equal(shooter.data.intent.aimAngle, 0.18, 'the cue aims the committed corridor bearing');
  const anchor = shooter.data.combat.aimCommit.anchor;
  assert.ok(Number.isFinite(anchor), 'the corridor anchored a real firing lead at cue entry');
  // The dodge: a hard lateral reversal displaces the target off the corridor.
  target.vel = { x: 0, z: -120 };
  target.pos = { x: 1400, z: 300 };
  fire('fire_window', true);
  const aim = shooter.data.intent.aimAngle;
  assert.equal(shooter.data.intent.fire, true, 'the window releases the committed volley');
  const stale = Math.abs(aim - anchor);
  assert.ok(stale > 0.05 && stale <= 0.1 + 1e-9,
    `the dodged shot rides the corridor inside the bounded band, got ${stale}`);
  assert.ok(Math.abs(aim) < 0.4 && target.pos.z === 300,
    'the committed line flies where the target was forecast, not where it dodged to');
});

test('a steady target still takes the real lead inside the corridor band', () => {
  const { shooter, fire } = corridorFixture();
  fire('charge_cue', false);
  const anchor = shooter.data.combat.aimCommit.anchor;
  fire('fire_window', true);
  assert.equal(shooter.data.intent.fire, true);
  assert.ok(Math.abs(shooter.data.intent.aimAngle - anchor) < 1e-9,
    'an undodged run keeps the anchor as the firing lead');
});

test('a corridor no aim-following mount can bear holds fire instead of spraying the clamp edge', () => {
  const { shooter, fire } = corridorFixture();
  // The telegraph went up while the hull pointed away: the nose has not slewed onto the
  // corridor yet, so the fixed front guns (±gimbalArc of bore) cannot bear the line.
  shooter.rot = Math.PI;
  fire('charge_cue', false);
  fire('fire_window', true);
  assert.equal(shooter.data.intent.fire, false, 'the clamp-edge shot is never released');
  assert.equal(shooter.data.intent.fireBlockReason, 'committed_aim_off_bore');
  assert.ok(Number.isFinite(shooter.data.intent.aimAngle),
    'the held intent keeps steering toward the corridor, not the bore line');
});

test('lawful protection still wins mid-window — a committed corridor never bypasses authority', () => {
  const { target, shooter, fire } = corridorFixture();
  fire('charge_cue', false);
  fire('fire_window', true);
  assert.equal(shooter.data.intent.fire, true, 'the authorized window fires the corridor');
  // The target drops out of the hostility set between window ticks: the corridor must not
  // fire through protection just because the earlier lock was valid.
  target.team = 1;
  fire('fire_window', true);
  assert.equal(shooter.data.intent.fire, false, 'authority re-checks every tick inside the window');
});

test('dropping the corridor releases the commit and re-arms live lead tracking', () => {
  const { target, shooter, state, fire } = corridorFixture();
  fire('charge_cue', false);
  assert.ok(Number.isFinite(shooter.data.combat.aimCommit.anchor), 'the cue anchored a lead');
  // Doctrine ends the commit (post-shot dwell): the next decision carries no corridor.
  applyAIFiringIntent({
    entityId: shooter.id,
    directive: {
      objective: { kind: ObjectiveKind.FOCUS, targetId: target.id, reason: 'combat_doctrine:ranged_disengager:reset' },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: { doctrineId: 'ranged_disengager', phase: 'reset', phaseStartedTick: 94, cycle: 0, fireWindow: false },
  }, state);
  assert.equal(shooter.data.combat.aimCommit, null, 'the corridor state clears when the doctrine drops it');
});
