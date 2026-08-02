import assert from 'node:assert/strict';
import test from 'node:test';

import { SquadCommander } from '../src/ai/squad.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { normalizeActivity } from '../src/ai/doctrine.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { applyAIFiringIntent } from '../src/systems/aiFireIntent.js';

test('actual SG06 sensor and roster ports allocate two light targets without a five-ship dogpile', () => {
  const h = squadHarness();
  const roster = h.helpers.aiRoster.liveListSquads(60);
  assert.equal(roster.length, 1);
  const memberIds = roster[0].members.map((member) => member.id);
  const frames = h.helpers.aiSensors.liveFramesFor(memberIds, 60);

  const first = command(roster[0], frames, 47);
  const assignments = assignmentSummary(first);
  assert.deepEqual(assignments.targetCounts, [[h.targetA.id, 2], [h.targetB.id, 2]],
    'light/medium targets accept at most two committed attackers each');
  assert.equal(assignments.screenCount, 1, 'overflow attacker screens instead of dogpiling');

  h.state.entityList.reverse();
  h.state.spatialHash.rebuild(h.state.entityList);
  const reorderedRoster = h.helpers.aiRoster.liveListSquads(60);
  const reorderedFrames = h.helpers.aiSensors.liveFramesFor(memberIds.slice().reverse(), 60);
  assert.deepEqual(assignmentSummary(command(reorderedRoster[0], reorderedFrames, 47)), assignments,
    'entity insertion and sensor request order cannot change target allocation');

  for (let seed = 1; seed <= 100; seed++) {
    assert.deepEqual(assignmentSummary(command(roster[0], frames, seed)), assignments,
      `seed ${seed} does not chatter deterministic fire assignments`);
  }
});

test('squad command aggregation leaves member-only hazard perception untouched', () => {
  const commander = new SquadCommander({ seed: 47, config: { minTacticTicks: 0 } });
  commander.registerSquad({
    id: 'hazard_boundary_wing',
    doctrine: 'scavenger',
    faction: 'fixture',
    members: [{
      id: 700,
      preferredRole: 'leader',
      capabilities: ['drive', 'sensor', 'weapon'],
    }],
  });

  let commandPayloadReads = 0;
  const memberHazard = {};
  Object.defineProperties(memberHazard, {
    id: { value: 9900, enumerable: true },
    kind: { value: 'hazard', enumerable: true },
    confidence: {
      enumerable: true,
      get() {
        commandPayloadReads++;
        return 1;
      },
    },
  });
  const perception = {
    tick: 60,
    self: {
      id: 700,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      hullFraction: 1,
      disabled: false,
      tethered: false,
      capabilities: ['drive', 'sensor', 'weapon'],
      factionBehavior: null,
    },
    contacts: [memberHazard],
    events: [],
  };

  const result = commander.update('hazard_boundary_wing', 60, new Map([[700, perception]]));

  assert.equal(result.tactic, 'hold_formation',
    'member-only obstacles must not alter the squad command picture');
  assert.equal(commandPayloadReads, 0,
    'squad aggregation must not materialize payload fields from member-only hazards');
  assert.equal(perception.contacts[0], memberHazard,
    'the member perception remains intact for ManeuverPlanner obstacle avoidance');
});

test('production firing adapter holds fire for an ally in the predicted lane and recovers cleanly', () => {
  const state = createGameState(91);
  state.tick = 90;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  const shooter = ship(10, 1, 0, 0, combatAI());
  const target = ship(20, 0, 320, 0, null);
  const ally = ship(11, 1, 150, 0, combatAI());
  state.playerId = target.id;
  installEntities(state, [shooter, target, ally]);
  const decision = firingDecision(shooter.id, target.id);

  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, false, 'ally centered between muzzle and lead point blocks fire');
  assert.equal(shooter.data.intent.fireBlockReason, 'ally_in_lane');
  assert.equal(shooter.data.intent.fireBlockerId, ally.id);
  assert.equal(shooter.data.combat.targetId, target.id, 'holding fire keeps the tactical target');

  ally.pos.z = 80;
  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, true, 'off-axis ally restores fire on the next decision');
  assert.equal(shooter.data.intent.fireBlockerId, null);

  ally.pos.x = 390;
  ally.pos.z = 0;
  applyAIFiringIntent(decision, state);
  assert.equal(shooter.data.intent.fire, true, 'ally behind the target does not block the shot');
});

test('production firing scans the ready ship-like index instead of the full dense world', () => {
  const state = createGameState(191);
  state.tick = 190;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  const shooter = ship(10, 1, 0, 0, combatAI());
  const target = ship(20, 0, 320, 0, null);
  const ally = ship(11, 1, 150, 0, combatAI());
  state.playerId = target.id;
  installEntities(state, [
    shooter,
    target,
    ally,
    ...Array.from({ length: 400 }, (_, index) => ({
      id: 1_000 + index,
      type: 'asteroid',
      alive: true,
      pos: { x: index, z: index },
    })),
  ]);
  state.entityIndex = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    shipLike: [shooter, target, ally],
    stations: [],
  };
  state.entityList = new Proxy(state.entityList, {
    get(array, property, receiver) {
      if (property === 'filter' || property === Symbol.iterator) {
        throw new Error('full dense entity list must not be scanned by firing authority');
      }
      return Reflect.get(array, property, receiver);
    },
  });

  applyAIFiringIntent(firingDecision(shooter.id, target.id), state);
  assert.equal(shooter.data.intent.fire, false);
  assert.equal(shooter.data.intent.fireBlockerId, ally.id,
    'the indexed view must preserve the exact allied blocker result');
});

function squadHarness() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.tick = 60;
  state.world.currentSectorId = 'sector_ceres_belt';
  state.world.sectors.sector_ceres_belt = { id: 'sector_ceres_belt', tier: 2, security: 0.35 };
  const bus = createBus();
  const helpers = {};
  const ports = Object.create(aiPorts);
  ports.init({ state, bus, helpers, registry: { get() { return null; } } });

  const attackers = [];
  for (let index = 0; index < 5; index++) {
    attackers.push(ship(100 + index, 1, index * -18, (index - 2) * 42, combatAI({
      squadId: 'allocation_wing',
      preferredRole: index === 0 ? 'leader' : 'striker',
    })));
  }
  const targetA = ship(200, 0, 520, -90, null);
  const targetB = ship(201, 0, 540, 120, null);
  state.playerId = targetA.id;
  installEntities(state, [...attackers, targetA, targetB]);
  state.spatialHash.rebuild(state.entityList);
  return { state, helpers, attackers, targetA, targetB };
}

function command(roster, frames, seed) {
  const commander = new SquadCommander({ seed, config: { minTacticTicks: 0 } });
  commander.registerSquad(roster);
  return commander.update(roster.id, 60, frames, null);
}

function assignmentSummary(result) {
  const counts = new Map();
  let screenCount = 0;
  const directives = [...result.directives.values()].sort((a, b) => a.memberId - b.memberId);
  const rows = directives.map((directive) => {
    const objective = directive.objective;
    if (objective.kind === ObjectiveKind.SCREEN) screenCount++;
    else if (objective.targetId != null) counts.set(objective.targetId, (counts.get(objective.targetId) || 0) + 1);
    return [directive.memberId, objective.kind, objective.targetId];
  });
  return {
    rows,
    targetCounts: [...counts.entries()].sort((a, b) => a[0] - b[0]),
    screenCount,
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

function combatAI(overrides = {}) {
  return {
    squadId: 'fire_wing',
    doctrine: 'scavenger',
    preferredRole: 'striker',
    passive: false,
    motive: 'assigned_interdiction',
    engagementTrigger: 'authorized_hostile_spawn',
    zoneId: 'zone_ceres_ambush',
    approachTelegraph: 'engine_flare',
    noFireResponseWindowS: 1,
    combatDoctrineId: 'interceptor_flyby',
    roe: 'weapons_free',
    forcePlayerTarget: true,
    activity: normalizeActivity({
      kind: 'attack_run',
      reason: 'test_attack_run',
      anchor: { x: 0, z: 0 },
      leashRadius: 2600,
      startedTick: 0,
    }),
    ...overrides,
  };
}

function ship(id, team, x, z, ai) {
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
    cap: 100,
    capMax: 100,
    data: {
      ...(ai ? { ai } : {}),
      intent: { fire: false },
      combat: {},
      weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 420 }],
    },
  };
}

function installEntities(state, entities) {
  state.entities = new Map(entities.map((entity) => [entity.id, entity]));
  state.entityList = entities.slice();
}
