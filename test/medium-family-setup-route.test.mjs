import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { createSimulation } from '../src/core/sim.js';
import { writePhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { MEDIUM_FAMILY_ENEMY_IDS } from '../src/data/enemies.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';

const DT = 1 / 60;
const SETUP_TRIO = Object.freeze([
  'marauder_brawler',
  'lancer_sniper',
  'hostile_interceptor',
]);

test('the production sensor gives frozen and live AI the same authored medium handoff', (t) => {
  for (const enemyId of SETUP_TRIO) {
    const route = bootRoute(t, enemyId);
    const port = route.sim.registry.get('aiPorts');
    const live = port._sensorFrameFor(route.enemy.id, route.state.tick, { freezeResults: false });
    const frozen = port._sensorFrameFor(route.enemy.id, route.state.tick);

    assert.equal(live.self.combatRoleId, enemyId);
    assert.equal(frozen.self.combatRoleId, enemyId);
    assert.equal(frozen.self.maxSpeed, live.self.maxSpeed);
    assert.deepEqual(frozen.self.mediumSetup, live.self.mediumSetup);
    assert.deepEqual(frozen.self.visibleRetreat, live.self.visibleRetreat);
    assert.equal(live.self.mediumSetup.runtime, 'unwired',
      'entity data remains an honest handoff; CombatDoctrineRuntime owns the wired read');
  }
});

test('Marauder RCS drift, Lancer overrun, and Interceptor Momentum Sink break correction on the live route', (t) => {
  const marauder = bootRoute(t, 'marauder_brawler');
  writePhysicsTelemetry(marauder.enemy, {
    tick: marauder.state.tick,
    mode: 'rcs_disrupted',
    dynamic: true,
    mass: marauder.enemy.mass,
  });
  const marauderDecision = decide(marauder, productionFrame(marauder));
  assert.equal(marauderDecision.mediumSetup.runtime, 'combat_doctrine');
  assert.equal(marauderDecision.mediumSetup.reason, 'rcs_disrupted');
  assert.equal(marauderDecision.phase, 'setup_drift');
  assert.equal(marauderDecision.maneuverKind, ManeuverKind.HOLD);
  assert.equal(marauderDecision.maneuverTargetId, null);
  assert.equal(marauderDecision.fireWindow, false);

  const lancer = bootRoute(t, 'lancer_sniper');
  lancer.player.pos.x = 120;
  lancer.player.pos.z = 160;
  lancer.player.vel.x = -72;
  lancer.player.vel.z = -96;
  const lancerDecision = decide(lancer, productionFrame(lancer));
  assert.equal(lancerDecision.mediumSetup.reason, 'closed_under_turn_rate');
  assert.equal(lancerDecision.phase, 'setup_overrun');
  assert.equal(lancerDecision.maneuverKind, ManeuverKind.HOLD);
  assert.equal(lancerDecision.fireWindow, false);

  const interceptor = bootRoute(t, 'hostile_interceptor');
  interceptor.bus.emit('projectile:hit', {
    targetId: interceptor.enemy.id,
    ownerId: interceptor.player.id,
    damage: 1,
    damageType: 'kinetic',
    weaponId: 'wpn_momentum_sink_s',
    statuses: [{ id: 'status_momentum_sink', stacks: 1 }],
    pos: { ...interceptor.enemy.pos },
  });
  interceptor.sim.step(DT);
  const interceptorFrame = productionFrame(interceptor);
  assert.equal(interceptorFrame.self.mediumSetup.counterState.momentumSunk, true,
    'the ordinary combat status owner reaches the AI sensor; no test-only setup flag is used');
  const interceptorDecision = decide(interceptor, interceptorFrame);
  assert.equal(interceptorDecision.mediumSetup.reason, 'momentum_sunk');
  assert.equal(interceptorDecision.phase, 'setup_frame_inherited');
  assert.equal(interceptorDecision.maneuverKind, ManeuverKind.HOLD);
  assert.equal(interceptorDecision.fireWindow, false);
});

test('each owned intended-kill route beats its naive control through production damage and collision owners', (t) => {
  withImpulseConsequences(t);

  const marauderPrepared = bootRoute(t, 'marauder_brawler');
  writePhysicsTelemetry(marauderPrepared.enemy, {
    tick: marauderPrepared.state.tick, mode: 'rcs_disrupted', dynamic: true, mass: marauderPrepared.enemy.mass,
  });
  assert.equal(decide(marauderPrepared, productionFrame(marauderPrepared)).mediumSetup.reason, 'rcs_disrupted');
  const marauderIntendedTicks = terrainFinish(marauderPrepared, 30, 3_000);
  const marauderNaive = bootRoute(t, 'marauder_brawler');
  assert.equal(terrainFinish(marauderNaive, 0, 300), null, 'one unprepared shove is corrected and nonlethal');
  const marauderNaiveTicks = gunFinish(marauderNaive, 30, 90, 24);
  assertMeaningfullyFaster('Marauder RCS → wall', marauderIntendedTicks, marauderNaiveTicks);

  const lancerPrepared = bootRoute(t, 'lancer_sniper');
  lancerPrepared.player.pos.x = 120;
  lancerPrepared.player.pos.z = 160;
  lancerPrepared.player.vel.x = -72;
  lancerPrepared.player.vel.z = -96;
  assert.equal(decide(lancerPrepared, productionFrame(lancerPrepared)).mediumSetup.reason, 'closed_under_turn_rate');
  const lancerIntendedTicks = gunFinish(lancerPrepared, 0, 20, 24);
  const lancerNaive = bootRoute(t, 'lancer_sniper');
  const naiveLancerDecision = decide(lancerNaive, productionFrame(lancerNaive));
  assert.equal(naiveLancerDecision.mediumSetup.countered, false);
  const lancerNaiveTicks = gunFinish(lancerNaive, 0, 120, 24);
  assertMeaningfullyFaster('Lancer close-under-turn-rate', lancerIntendedTicks, lancerNaiveTicks);

  const interceptorPrepared = bootRoute(t, 'hostile_interceptor');
  interceptorPrepared.bus.emit('projectile:hit', {
    targetId: interceptorPrepared.enemy.id,
    ownerId: interceptorPrepared.player.id,
    damage: 1,
    damageType: 'kinetic',
    weaponId: 'wpn_momentum_sink_s',
    statuses: [{ id: 'status_momentum_sink', stacks: 1 }],
    pos: { ...interceptorPrepared.enemy.pos },
  });
  interceptorPrepared.sim.step(DT);
  assert.equal(decide(interceptorPrepared, productionFrame(interceptorPrepared)).mediumSetup.reason, 'momentum_sunk');
  const interceptorIntendedTicks = terrainFinish(interceptorPrepared, 30, 2_100);
  const interceptorNaive = bootRoute(t, 'hostile_interceptor');
  assert.equal(terrainFinish(interceptorNaive, 0, 180), null, 'an unprepared nudge does not erase a medium');
  const interceptorNaiveTicks = gunFinish(interceptorNaive, 30, 90, 24);
  assertMeaningfullyFaster('Interceptor Momentum Sink → rock', interceptorIntendedTicks, interceptorNaiveTicks);
});

test('all six authored mediums enter one common physical retreat below 30% hull', (t) => {
  for (const enemyId of MEDIUM_FAMILY_ENEMY_IDS) {
    const route = bootRoute(t, enemyId);
    route.enemy.hull = route.enemy.hullMax * 0.29;
    const frame = productionFrame(route);
    const decision = decide(route, frame);
    assert.equal(decision.phase, 'visible_retreat', enemyId);
    assert.equal(decision.maneuverKind, ManeuverKind.RETREAT, enemyId);
    assert.equal(decision.maneuverTargetId, null, enemyId);
    assert.equal(decision.fireWindow, false, enemyId);
    assert.equal(decision.telegraph, null, `${enemyId} retreat cannot masquerade as a new attack telegraph`);
    assert.equal(decision.visibleRetreat.runtime, 'combat_doctrine', enemyId);
    assert.deepEqual(
      [decision.visibleRetreat.smokeCue, decision.visibleRetreat.dumpCue, decision.visibleRetreat.bark],
      [frame.self.visibleRetreat.smokeCue, frame.self.visibleRetreat.dumpCue, frame.self.visibleRetreat.bark],
      `${enemyId} keeps its authored smoke/dump/bark semantics`,
    );
  }
});

test('SG-06 emits the existing ai:flee seam once and bark presentation consumes it', () => {
  const spec = makeEnemySpawnSpec('corsair_raider', 6, { x: 0, z: 0 });
  const actor = entityFromSpec(spec, 2);
  actor.hull = actor.hullMax * 0.29;
  const target = playerEntity(1);
  target.pos.x = 520;
  const state = {
    tick: 0, simTime: 0, mode: 'flight', playerId: target.id,
    player: { heat: 0 }, meta: { seed: 1313 },
    world: { currentSectorId: 'sector_ceres_belt' },
    settings: { gameplay: { difficulty: 'standard' } },
    entities: new Map([[target.id, target], [actor.id, actor]]),
    entityList: [target, actor], combat: { trace: { events: [] } },
  };
  const emitted = [];
  const spoken = [];
  const bus = eventBus(emitted);
  const helpers = { voice: { say(payload) { spoken.push(payload); return true; } } };
  const bark = Object.create(barkDirector);
  bark.init({ state, bus, helpers });
  const tactical = createTacticalAISystem({
    seed: 1313,
    config: { trace: { enabled: false } },
    sensors: { frameFor(_entityId, tick) { return tacticalFrame(actor, target, tick); } },
    roster: { listSquads() { return [{
      id: 'medium_retreat_fixture', doctrine: 'scavenger', faction: 'faction_reach',
      members: [{ id: actor.id, capabilities: ['drive', 'sensor', 'weapon', 'ranged'], combatDoctrineId: actor.data.ai.combatDoctrineId }],
    }]; } },
    maneuver: { request() { return true; } },
    actionPortFactory: () => noActionPort(),
  });
  tactical.init({ state, bus, helpers });

  tactical.update(DT, state);
  state.tick = 1;
  state.simTime = DT;
  tactical.update(DT, state);

  const flees = emitted.filter((entry) => entry.event === 'ai:flee');
  assert.equal(flees.length, 1, 'the retreat transition has exactly one shared event edge');
  assert.equal(emitted.some((entry) => entry.event === 'ai:telegraph'), false,
    'retreat does not reuse an attack-warning HUD event');
  assert.equal(flees[0].payload.entityId, actor.id);
  assert.equal(flees[0].payload.smokeCue, spec.data.visibleRetreat.smokeCue);
  assert.equal(flees[0].payload.dumpCue, spec.data.visibleRetreat.dumpCue);
  assert.equal(flees[0].payload.bark, spec.data.visibleRetreat.bark);
  assert.equal(spoken.length, 1, 'the existing barkDirector consumer receives the shared flee event');
  assert.equal(spoken[0].channel, 'bark');
  bark.destroy();
});

function bootRoute(t, enemyId) {
  const sim = createSimulation({
    seed: 1313,
    systems: [aiPorts, collisionConsequences, combat],
  });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.difficulty = 'standard';
  const player = sim.spawn(playerEntity());
  state.playerId = player.id;
  state.player.targetId = null;
  const enemy = sim.spawn(makeEnemySpawnSpec(enemyId, 6, { x: 0, z: 0 }));
  enemy.data.encounter = true;
  const rock = sim.spawn({
    type: 'asteroid', alive: true, collides: true,
    pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 }, radius: 34, mass: 1e6,
    hull: 10_000, hullMax: 10_000, data: {},
  });
  return { sim, state, bus, player, enemy, rock };
}

function productionFrame(route) {
  const frame = route.sim.registry.get('aiPorts')._sensorFrameFor(route.enemy.id, route.state.tick, { freezeResults: false });
  assert.ok(frame.contacts.some((contact) => contact.id === route.player.id && contact.hostile === true),
    'the production sensor exposes the real hostile player contact');
  return frame;
}

function decide(route, frame) {
  const runtime = new CombatDoctrineRuntime({ seed: route.state.meta.seed });
  return runtime.update({
    tick: route.state.tick,
    entityId: route.enemy.id,
    doctrineId: route.enemy.data.ai.combatDoctrineId,
    perception: frame,
    directive: directive(route.enemy.id, route.player.id),
  });
}

function directive(memberId, targetId) {
  return {
    tick: 0, squadId: 'medium_setup_route', memberId, role: 'striker', tactic: 'focus_fire',
    focusTargetId: targetId,
    objective: { kind: ObjectiveKind.FOCUS, targetId, reason: 'medium_setup_route' },
    formation: {
      kind: 'wedge', slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170,
      breakFormation: true, breakReason: null,
    },
  };
}

function terrainFinish(route, tick, impulse) {
  route.state.tick = tick;
  route.state.simTime = tick / 60;
  route.enemy.vel.x = 80;
  route.bus.emit('physics:impact', {
    consequenceKernelVersion: 1,
    tick,
    aId: route.enemy.id,
    bId: route.rock.id,
    causalActorId: route.player.id,
    impulse,
    pos: { x: route.rock.pos.x - route.rock.radius, z: 0 },
    normal: { x: -1, z: 0 },
  });
  return route.enemy.alive === false ? tick : null;
}

function gunFinish(route, startTick, cadenceTicks, damage) {
  for (let tick = startTick; tick <= 2_400; tick += cadenceTicks) {
    route.state.tick = tick;
    route.state.simTime = tick / 60;
    route.bus.emit('projectile:hit', {
      targetId: route.enemy.id,
      ownerId: route.player.id,
      damage,
      damageType: 'kinetic',
      weaponId: 'wpn_pulse_laser_s',
      pos: { ...route.enemy.pos },
    });
    if (route.enemy.alive === false) return tick;
  }
  throw new Error(`gun route failed to kill ${route.enemy.data.lootTableId}`);
}

function assertMeaningfullyFaster(label, intendedTicks, naiveTicks) {
  assert.notEqual(intendedTicks, null, `${label} must finish the physical actor`);
  assert.ok(intendedTicks * 2 <= naiveTicks,
    `${label} intended=${intendedTicks} ticks must be at least twice as fast as naive=${naiveTicks}`);
}

function withImpulseConsequences(t) {
  const prior = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = prior; });
}

function playerEntity(id = undefined) {
  return {
    ...(id == null ? {} : { id }),
    type: 'ship', alive: true, collides: true, team: 0, factionId: 'faction_free',
    pos: { x: 520, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
    radius: 12, mass: 24, hull: 120, hullMax: 120,
    armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    cap: 100, capMax: 100,
    data: { intent: {}, combat: {}, weapons: [{ defId: 'wpn_pulse_laser_s', projSpeed: 420 }] },
  };
}

function entityFromSpec(spec, id) {
  return {
    ...spec, id, alive: true, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, flags: {},
    data: { ...spec.data, intent: {}, combat: {}, weapons: spec.data.weapons || [] },
  };
}

function tacticalFrame(actor, target, tick) {
  return {
    tick,
    self: {
      id: actor.id, team: actor.team, pos: actor.pos, vel: actor.vel, rot: actor.rot,
      radius: actor.radius, hullFraction: actor.hull / actor.hullMax,
      energyFraction: 1, heatFraction: 0, disabled: false, tethered: false,
      capabilities: ['drive', 'sensor', 'weapon', 'ranged'], subsystemFractions: {},
      activity: actor.data.ai.activity, roe: actor.data.ai.roe,
      combatDoctrineId: actor.data.ai.combatDoctrineId,
      combatRoleId: actor.data.lootTableId, maxSpeed: actor.maxSpeed,
      mediumSetup: actor.data.mediumSetup, visibleRetreat: actor.data.visibleRetreat,
      operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty', tetherabilityBand: 'good',
    },
    contacts: [{
      id: target.id, kind: ContactKind.SHIP, team: target.team, classification: 'live_hostile',
      pos: target.pos, vel: target.vel, radius: target.radius,
      confidence: 1, threat: 0.9, hostile: true, alive: true, valid: true, visible: true,
      operationalMassBand: 'medium', mobilityBand: 'medium', cargoBand: 'empty', tetherabilityBand: 'good',
      tags: ['armed'],
    }],
    events: [],
  };
}

function noActionPort() {
  return {
    list() { return []; },
    canStart() { return { ok: false, reason: 'retreat' }; },
    start() { return null; },
    status() { return 'idle'; },
    interrupt() { return true; },
  };
}

function eventBus(log) {
  const listeners = new Map();
  return {
    on(event, fn) {
      const set = listeners.get(event) || new Set();
      set.add(fn);
      listeners.set(event, set);
    },
    off(event, fn) { listeners.get(event)?.delete(fn); },
    emit(event, payload) {
      log.push({ event, payload: structuredClone(payload) });
      for (const fn of [...(listeners.get(event) || [])]) fn(payload);
    },
  };
}
