import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineId, CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import {
  SKITTER_ROCK_MOVE_THRESHOLD_WU,
  selectSkitterCover,
  skitterSpringReason,
} from '../src/ai/skitterCoverPolicy.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

function rock(id, x, z, radius = 36) {
  return { id, type: 'asteroid', alive: true, collides: true, radius, pos: { x, z } };
}

test('Skitter rock selection is order-stable, bounded, and places the hull on the far side', () => {
  const rocks = Array.from({ length: 32 }, (_, index) => rock(`rock-${String(index).padStart(2, '0')}`, 1100 + index * 12, index % 3 * 20));
  const input = {
    seed: 1214,
    entityId: 'skitter-a',
    squadId: 'nest-alpha',
    anchor: { x: 1280, z: 0 },
    playerPos: { x: 0, z: 0 },
    hullRadiusWu: 11,
  };
  const selected = selectSkitterCover({ ...input, rocks });
  const reordered = selectSkitterCover({ ...input, rocks: rocks.slice().reverse() });
  assert.deepEqual(reordered, selected, 'input enumeration order cannot change an assignment');
  assert.equal(selected.candidateCount, 24, 'the policy admits at most the authored 24 rocks');
  assert.ok(rocks.slice(0, 24).some((candidate) => candidate.id === selected.rockId));
  const outwardX = selected.coverPoint.x - selected.rockOrigin.x;
  const outwardZ = selected.coverPoint.z - selected.rockOrigin.z;
  const playerToRockX = selected.rockOrigin.x - input.playerPos.x;
  const playerToRockZ = selected.rockOrigin.z - input.playerPos.z;
  assert.ok(outwardX * playerToRockX + outwardZ * playerToRockZ > 0,
    'the berth must lie behind the rock from the player view');
});

function spawnCraft(sim, team, x, z) {
  return sim.spawn({
    type: 'ship', team, factionId: team === 0 ? 'faction_free' : 'faction_reach',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 11, mass: 24, hull: 100, hullMax: 100, cap: 100, capMax: 100,
    collides: true, data: {},
  });
}

function bootNest() {
  const bus = createBus();
  const nestEvents = [];
  const springEvents = [];
  bus.on('ai:skitterNest', (payload) => nestEvents.push(payload));
  bus.on('ai:skitterSpring', (payload) => springEvents.push(payload));
  const sim = createSimulation({ seed: 1215, bus, systems: [aiPorts] });
  const player = spawnCraft(sim, 0, 0, 0);
  sim.state.playerId = player.id;
  for (let index = 0; index < 5; index++) {
    sim.spawn({
      type: 'asteroid', team: null, pos: { x: 1200 + index * 100, z: (index - 2) * 90 },
      vel: { x: 0, z: 0 }, radius: 42, mass: 900, hull: 300, hullMax: 300,
      alive: true, collides: true, data: {},
    });
  }
  const skitter = sim.spawn(makeEnemySpawnSpec('skitter_swarmer', 4, { x: 1450, z: 0 }));
  const port = sim.registry.get('aiPorts');
  const firstRoster = port._listSquads(0, { freezeResults: false });
  const cover = skitter.data.ai.skitterCover;
  return { sim, player, skitter, port, cover, firstRoster, nestEvents, springEvents };
}

test('the live AI port nests a production Skitter passively before physics and springs on proximity', () => {
  const route = bootNest();
  assert.equal(route.firstRoster.length, 0, 'a nested Skitter is outside active combat decisions');
  assert.equal(route.skitter.data.ai.passive, true);
  assert.equal(route.cover.phase, 'nested');
  assert.ok(route.cover.assignedRockId != null, 'the runtime publishes the assigned rock id');
  assert.equal(route.cover.placedBeforePhysics, true);
  assert.deepEqual(
    { x: route.skitter.pos.x, z: route.skitter.pos.z },
    route.cover.coverPoint,
    'the fresh body starts at its assigned far-side berth',
  );
  assert.equal(route.nestEvents.length, 1);
  assert.equal(route.nestEvents[0].cueId, 'swarmer_rock_dust');
  assert.equal(route.nestEvents[0].passive, true);

  route.player.pos.x = route.cover.coverPoint.x;
  route.player.pos.z = route.cover.coverPoint.z;
  const activeRoster = route.port._listSquads(1, { freezeResults: false });
  assert.equal(activeRoster.length, 1, 'proximity admits the Skitter to the real tactical roster');
  assert.equal(route.skitter.data.ai.passive, false);
  assert.equal(route.cover.phase, 'spring');
  assert.equal(route.cover.triggerReason, 'player_close');
  assert.equal(route.springEvents.at(-1).rockId, route.cover.assignedRockId);
});

test('the default Tactical AI stack consumes the live nest and enters the Skitter spring phase', () => {
  const bus = createBus();
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const sim = createSimulation({
    seed: 1217,
    bus,
    systems: [aiPorts, tactical],
    updateOrder: [tactical, aiPorts],
  });
  sim.state.mode = 'flight';
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  sim.state.physicsRuntime = { diagnostics: { backend: 'rapier-dynamic', sg02Ready: true } };
  const player = spawnCraft(sim, 0, 0, 0);
  sim.state.playerId = player.id;
  for (let index = 0; index < 4; index++) {
    sim.spawn({
      type: 'asteroid', pos: { x: 1180 + index * 120, z: index % 2 ? 100 : -100 },
      vel: { x: 0, z: 0 }, radius: 44, mass: 900, hull: 300, hullMax: 300,
      alive: true, collides: true, data: {},
    });
  }
  const skitter = sim.spawn(makeEnemySpawnSpec('skitter_swarmer', 4, { x: 1400, z: 0 }));
  skitter.data.ai.hostileTeams = [0];
  sim.step();
  assert.equal(skitter.data.ai.passive, true);
  player.pos.x = skitter.data.ai.skitterCover.coverPoint.x;
  player.pos.z = skitter.data.ai.skitterCover.coverPoint.z;
  sim.step(); // the production stack deliberately replays decisions every other tick
  sim.step();
  const decision = tactical.stack.lastResult.decisions.find((entry) => entry.entityId === skitter.id);
  assert.ok(decision, 'the springing Skitter reaches the ordinary squad/behavior/maneuver stack');
  assert.ok(decision.combatDoctrine, 'the ordinary stack preserves the authored combat doctrine');
  assert.equal(decision.combatDoctrine.flightProfile, 'cover_ambush');
  assert.equal(decision.combatDoctrine.phase, 'spring');
  assert.equal(decision.combatDoctrine.telegraph.kind, 'rock_dust');
  assert.equal(decision.action.actionId, null, 'the default action port remains cold during the warning');
});

test('shot, moved, and broken cover all spring through the same live roster owner', () => {
  for (const trigger of ['shot', 'moved', 'broken']) {
    const route = bootNest();
    const assignedRock = route.sim.state.entities.get(route.cover.assignedRockId);
    if (trigger === 'shot') {
      route.sim.state.combat = { trace: { events: [] } };
      route.sim.state.combat.trace.events.push({
        kind: 'damage.routed', tick: 1, targetId: route.skitter.id, attackerId: route.player.id, totalApplied: 1,
      });
    } else if (trigger === 'moved') {
      assignedRock.pos.x += SKITTER_ROCK_MOVE_THRESHOLD_WU + 1;
    } else assignedRock.alive = false;
    const roster = route.port._listSquads(1, { freezeResults: false });
    assert.equal(roster.length, 1, `${trigger} must admit the Skitter to combat`);
    assert.equal(route.cover.phase, 'spring');
    assert.equal(route.cover.triggerReason, trigger === 'shot' ? 'nest_shot' : `cover_${trigger}`);
  }
});

function directive() {
  return {
    squadId: 'skitter-route', tactic: 'focus_fire', focusTargetId: 1,
    objective: { kind: ObjectiveKind.FOCUS, targetId: 1, reason: 'skitter_route' },
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true },
  };
}

function perception({ tickPhase = 'spring', sequence = 1, selfX = 0, targetX = 600 } = {}) {
  return {
    self: {
      id: 2, team: 1, pos: { x: selfX, z: 0 }, vel: { x: 100, z: 0 }, rot: 0,
      hullFraction: 1, energyFraction: 1, heatFraction: 0,
      combatRoleId: 'skitter_swarmer', operationalMassBand: 'light',
      activity: { kind: 'attack_run', reason: 'skitter_route', anchor: { x: 100, z: 0 }, leashRadius: 1800 },
      roe: 'weapons_free',
      coverAmbush: {
        phase: tickPhase,
        assignedRockId: 8,
        coverPoint: { x: 100, z: 0 },
        returnRockId: 8,
        returnPoint: { x: 100, z: 0 },
        coverAlive: true,
        returnCoverAlive: true,
        triggered: tickPhase === 'spring',
        triggerSequence: sequence,
        triggerReason: 'player_close',
      },
    },
    contacts: [{
      id: 1, kind: ContactKind.SHIP, team: 0, alive: true, valid: true, visible: true,
      confidence: 1, threat: 0.8, hostile: true, pos: { x: targetX, z: 0 }, vel: { x: 0, z: 0 },
      operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty', tetherabilityBand: 'good', tags: [],
    }],
    events: [],
  };
}

test('the Skitter doctrine springs, makes one pass, then physically targets its cover during extension', () => {
  const runtime = new CombatDoctrineRuntime({ seed: 1216 });
  let result = runtime.update({
    tick: 0, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(), directive: directive(),
  });
  assert.equal(result.flightProfile, 'cover_ambush');
  assert.equal(result.phase, 'spring');
  assert.equal(result.telegraph.kind, 'rock_dust');
  assert.equal(result.allowedActionId, null, 'the dust spring is a warning, not a fire window');

  result = runtime.update({
    tick: 24, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception(), directive: directive(),
  });
  assert.equal(result.phase, 'strike');
  assert.equal(result.allowedActionId, 'action_burst');

  result = runtime.update({
    tick: 55, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception({ selfX: 900 }), directive: directive(),
  });
  assert.equal(result.phase, 'return_to_cover');
  assert.equal(result.maneuverKind, ManeuverKind.INTERCEPT);
  assert.equal(result.maneuverTargetId, null, 'extension cannot keep steering at the player');
  assert.deepEqual(result.flightPoint, { x: 100, z: 0 });
  assert.equal(result.allowedActionId, null, 'the return leg is not another firing pass');

  result = runtime.update({
    tick: 90, entityId: 2, doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
    perception: perception({ selfX: 120 }), directive: directive(),
  });
  assert.equal(result.phase, 'cover_hold');
  assert.equal(result.maneuverKind, ManeuverKind.HOLD);
});

test('spring predicates prioritize broken/moved cover and recognize real damage receipts', () => {
  const cover = { coverPoint: { x: 100, z: 0 }, rockOrigin: { x: 80, z: 0 } };
  assert.equal(skitterSpringReason({ cover, rock: null, playerPos: { x: 100, z: 0 } }), 'cover_broken');
  assert.equal(skitterSpringReason({
    cover,
    rock: rock(1, 80 + SKITTER_ROCK_MOVE_THRESHOLD_WU + 1, 0),
    playerPos: { x: 100, z: 0 },
  }), 'cover_moved');
  assert.equal(skitterSpringReason({
    cover,
    rock: rock(1, 80, 0),
    playerPos: { x: 2000, z: 0 },
    events: [{ type: 'damage_received' }],
  }), 'nest_shot');
});
