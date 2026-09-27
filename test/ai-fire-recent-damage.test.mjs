// The combat trace is a bounded append+splice history: once it fills, events.length stays at
// capacity while the content shifts. A recent-damage memo keyed on array length therefore sees
// a full trace as "unchanged" forever — a cached `false` can never notice a new hit and a cached
// `true` outlives the evicted event that proved it. The memo must key on the append watermark
// (nextSeq) and treat trace.dropped as the retention floor for its proof.

import assert from 'node:assert/strict';
import test from 'node:test';

import { ObjectiveKind } from '../src/ai/contracts.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { appendCombatTrace, ensureCombatTrace } from '../src/combat/trace.js';
import { createGameState } from '../src/core/gameState.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';

const SEED = 4242;
const CAPACITY = 8;

function ship(id, team, x, z, ai, weapons = [{ defId: 'wpn_pulse_laser_s', projSpeed: 320 }]) {
  return {
    id,
    type: 'ship',
    alive: true,
    team,
    factionId: team === 1 ? 'faction_reach' : 'faction_free',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 32,
    maxSpeed: 140,
    turnRate: 2.4,
    hull: 100,
    hullMax: 100,
    collides: true,
    data: {
      ...(ai ? { ai } : {}),
      intent: { fire: false },
      combat: {},
      weapons,
    },
  };
}

// Defensive ROE makes the doctrine gate read the memo verbatim: it may only fire at a hull
// that damaged it inside the window. Everything else in the recipe is a plain authorized
// interdiction shot, so intent.fire is the memo's answer.
function defensiveAI() {
  return {
    squadId: 'memo_wing',
    doctrine: 'scavenger',
    preferredRole: 'striker',
    passive: false,
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby',
    roe: 'defensive',
    forcePlayerTarget: true,
    activity: normalizeActivity({
      kind: 'attack_run',
      reason: 'test_attack_run',
      anchor: { x: 0, z: 0 },
      leashRadius: 2600,
      startedTick: 0,
    }),
  };
}

function firingDecision(entityId, targetId) {
  return {
    entityId,
    directive: {
      objective: {
        kind: ObjectiveKind.FOCUS,
        targetId,
        reason: 'combat_doctrine:interceptor_flyby:strike',
      },
    },
    action: { actionId: 'action_burst' },
    combatDoctrine: { fireWindow: true },
  };
}

function scenario() {
  const state = createGameState(SEED);
  state.tick = 5000;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  const shooter = ship(10, 1, 0, 0, defensiveAI());
  const target = ship(20, 0, 400, 0, null);
  state.playerId = target.id;
  state.entities = new Map([shooter, target].map((entity) => [entity.id, entity]));
  state.entityList = [shooter, target];
  ensureCombatTrace(state.combat || (state.combat = {}), CAPACITY);
  return { state, shooter, target, decision: firingDecision(shooter.id, target.id) };
}

// Fill the trace to capacity with damage receipts for an unrelated pair, so every later append
// splices one off the front and events.length is already pinned before the first query.
function fillTrace(state) {
  for (let i = 0; i < CAPACITY; i += 1) {
    appendCombatTrace(state.combat, state.tick, 'damage.routed', { targetId: 999, attackerId: 777 });
  }
  assert.equal(state.combat.trace.events.length, CAPACITY);
  assert.equal(state.combat.trace.nextSeq, CAPACITY + 1);
}

test('a full trace still notices a fresh hit: cached false cannot outlive a new append', () => {
  const { state, shooter, target, decision } = scenario();
  fillTrace(state);

  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, false,
    'defensive ROE with no damage from the target holds fire');

  // One append: the history stayed at capacity, so only the append watermark moved.
  appendCombatTrace(state.combat, state.tick, 'damage.routed', {
    targetId: shooter.id,
    attackerId: target.id,
  });
  assert.equal(state.combat.trace.events.length, CAPACITY);
  assert.equal(state.combat.trace.dropped, 1);

  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, true,
    'the fresh damage.routed receipt authorizes the defensive shot');

  // And the memo-hit path returns the same answer while nothing new was appended.
  shooter.data.intent.fire = false;
  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, true,
    'a repeated query inside the window still reads the retained proof');
});

test('a full trace still forgets an evicted hit: cached true cannot outlive its proof', () => {
  const { state, shooter, target, decision } = scenario();
  fillTrace(state);

  appendCombatTrace(state.combat, state.tick, 'damage.routed', {
    targetId: shooter.id,
    attackerId: target.id,
  });
  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, true,
    'the fresh damage receipt authorizes the defensive shot');

  // Append a full capacity of unrelated receipts: the proving event is spliced off the front
  // while events.length never changes. A fresh backward walk can no longer find it.
  for (let i = 0; i < CAPACITY; i += 1) {
    appendCombatTrace(state.combat, state.tick, 'physics.impulse', {
      targetId: 999, attackerId: 777, reason: 'shove',
    });
  }
  assert.equal(state.combat.trace.events.length, CAPACITY);
  assert.equal(state.combat.trace.dropped, CAPACITY + 1);
  assert.equal(state.combat.trace.events[0].seq, CAPACITY + 2);

  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, false,
    'with the proving receipt evicted the defensive authorization is gone');
});
