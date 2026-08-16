import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind, ObjectiveKind, wrapAngle } from '../src/ai/contracts.js';
import { CombatDoctrineRuntime } from '../src/ai/combatDoctrine.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';
import { physics } from '../src/core/physics.js';
import { createSimulation } from '../src/core/sim.js';
import { readPhysicsTelemetry, writePhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { MEDIUM_FAMILY_ENEMY_IDS } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { actions } from '../src/systems/actions.js';
import { barkDirector } from '../src/systems/barkDirector.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { buildWeaponDamagePacket, weapons } from '../src/systems/weapons.js';

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

test('prepared external frames coast while ordinary HOLD keeps its braking contract', () => {
  const perception = {
    self: {
      id: 77, pos: { x: 0, z: 0 }, vel: { x: 30, z: 0 }, rot: 0,
      energyFraction: 1, heatFraction: 0,
    },
    contacts: [],
  };
  const formation = {
    slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true,
  };
  const holdIntent = {
    kind: ManeuverKind.HOLD,
    targetId: null,
    formationSlot: formation.slot,
    formationVelocity: formation.velocity,
    formationBound: formation.bound,
    breakFormation: formation.breakFormation,
  };
  const ordinary = new ManeuverPlanner().plan({
    tick: 1, entityId: 77, perception,
    behavior: { maneuver: { ...holdIntent, reason: 'ordinary_hold' } },
    directive: { formation },
  });
  const prepared = new ManeuverPlanner().plan({
    tick: 1, entityId: 77, perception,
    behavior: {
      maneuver: {
        ...holdIntent,
        preserveExternalFrame: true, reason: 'prepared_medium_counter',
      },
    },
    directive: { formation },
  });

  assert.equal(ordinary.brake, true, 'ordinary HOLD still arrests drift');
  assert.equal(ordinary.preserveExternalFrame, false, 'the new contract defaults closed');
  assert.equal(prepared.brake, false, 'a prepared counter does not command braking');
  assert.equal(prepared.preserveExternalFrame, true);
  assert.deepEqual(prepared.forceLocal, { forward: 0, right: 0 });
  assert.equal(prepared.torqueYaw, 0);
});

test('each owned intended-kill setup beats an equal-budget naive route through live owners', async (t) => {
  withImpulseConsequences(t);

  const marauderIntended = await runTerrainCounterRoute({
    enemyId: 'marauder_brawler', prepared: true, setupWeaponId: 'wpn_rcs_disruptor_m', seed: 13131,
  });
  const marauderNaive = await runTerrainCounterRoute({
    enemyId: 'marauder_brawler', prepared: false, setupWeaponId: 'wpn_rcs_disruptor_m', seed: 13131,
  });
  assertTerrainSetupWins('Marauder RCS → wall', marauderIntended, marauderNaive, 'rcs_disrupted');

  const lancerIntended = await runLancerCounterRoute({ intended: true, seed: 13132 });
  const lancerNaive = await runLancerCounterRoute({ intended: false, seed: 13132 });
  assert.equal(lancerIntended.weaponId, lancerNaive.weaponId);
  assert.equal(lancerIntended.playerHits, lancerNaive.playerHits,
    'both Lancer routes spend the same real flak hit budget');
  assert.ok(lancerIntended.playerHits > 0);
  assert.equal(lancerIntended.triggerReleased, false);
  assert.equal(lancerNaive.triggerReleased, false,
    'both routes hold the trigger continuously; only movement strategy changes shot opportunities');
  assert.equal(lancerIntended.initialDistance, lancerNaive.initialDistance);
  assert.ok(Math.abs(lancerIntended.initialSpeed - lancerNaive.initialSpeed) < 1e-6);
  assert.equal(lancerIntended.counterReason, 'closed_under_turn_rate');
  assertMeaningfullyFaster('Lancer close-under-turn-rate', lancerIntended.killTick, lancerNaive.killTick);

  const interceptorIntended = await runTerrainCounterRoute({
    enemyId: 'hostile_interceptor', prepared: true, setupWeaponId: 'wpn_momentum_sink_s', seed: 13133,
  });
  const interceptorNaive = await runTerrainCounterRoute({
    enemyId: 'hostile_interceptor', prepared: false, setupWeaponId: 'wpn_momentum_sink_s', seed: 13133,
  });
  assertTerrainSetupWins(
    'Interceptor Momentum Sink → rock', interceptorIntended, interceptorNaive, 'momentum_sunk',
  );
  assert.ok(interceptorIntended.maxPreparedSpeed > 40,
    `status/physics authority must move the coasting target, got ${interceptorIntended.maxPreparedSpeed}`);
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
  actor.data.ai = {
    ...actor.data.ai,
    activity: { kind: 'flee', reason: 'corsair_tow_escape' },
    roe: 'hold_fire',
  };
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

test('only an authored medium retreat bypasses ordinary HOLD_FIRE ineligibility', () => {
  const target = playerEntity(1);
  const generic = tacticalFrame({
    id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, hull: 20, hullMax: 100, maxSpeed: 120,
    data: {
      lootTableId: 'generic_hold_fire_actor', mediumSetup: null, visibleRetreat: null,
      ai: {
        activity: { kind: 'flee', reason: 'generic_escape' }, roe: 'hold_fire',
        combatDoctrineId: 'interceptor_flyby',
      },
    },
  }, target, 0);
  const runtime = new CombatDoctrineRuntime({ seed: 1313 });
  assert.equal(runtime.update({
    tick: 0, entityId: 2, doctrineId: 'interceptor_flyby', perception: generic,
    directive: directive(2, target.id),
  }), null, 'a non-medium HOLD_FIRE actor does not become combat-eligible');
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

async function runTerrainCounterRoute({ enemyId, prepared, setupWeaponId, seed }) {
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const sim = createSimulation({
    seed,
    systems: [physics, combat, actions, collisionConsequences, aiPorts, tactical, flightV3, weapons],
    updateOrder: [tactical, actions, flightV3, aiPorts, collisionConsequences, weapons, physics, combat],
  });
  const physicsSystem = sim.registry.get('physics');
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.settings.gameplay.difficulty = 'standard';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const interceptor = enemyId === 'hostile_interceptor';
    const player = sim.spawn(physicalPlayer({
      pos: interceptor ? { x: -400, z: -500 } : { x: -500, z: 0 },
      vel: interceptor ? { x: 140, z: 0 } : { x: 0, z: 0 },
      rot: 0,
      weaponId: 'wpn_pulse_laser_m',
    }));
    state.playerId = player.id;
    state.player.targetId = null;
    const enemy = sim.spawn(makeEnemySpawnSpec(enemyId, 6, { x: 0, z: 0 }));
    enemy.data.encounter = true;
    enemy.shield = 0;
    enemy.armorHp = 0;
    enemy.hull = 80;
    enemy.rot = interceptor ? -Math.PI / 2 : Math.PI;
    enemy.vel.x = interceptor ? 0 : 45;
    enemy.vel.z = 0;
    const rock = sim.spawn({
      type: 'asteroid', alive: true, collides: true,
      pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 }, radius: 34, mass: 1e6,
      hull: 10_000, hullMax: 10_000, data: {},
    });
    state.input.moveZ = interceptor ? 1 : 0;
    state.input.moveX = 0;
    state.input.turnIntent = 0;
    state.input.fire = false;
    state.input.autoAim = { targetId: enemy.id };
    assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true,
      'the medium counter route requires prepared Rapier authority');

    let terrainImpactTick = null;
    let killTick = null;
    let counterReason = null;
    let sawZeroCommand = false;
    let sawPreparedExternalFrame = false;
    let maxPreparedSpeed = 0;
    let playerFiresBeforeTerrain = 0;
    let lastDoctrineEvidence = null;
    bus.on('physics:impact', (payload) => {
      if (terrainImpactTick != null) return;
      const ids = [payload && payload.aId, payload && payload.bId];
      if (ids.includes(enemy.id) && ids.includes(rock.id)) terrainImpactTick = state.tick;
    });
    bus.on('entity:killed', (payload) => {
      if (payload && payload.id === enemy.id && killTick == null) killTick = state.tick;
    });
    bus.on('combat:fire', (payload) => {
      if (payload && payload.ownerId === player.id && terrainImpactTick == null) playerFiresBeforeTerrain++;
    });

    const setupTick = prepared ? 0 : 180;
    let setupActions = 0;
    if (prepared) {
      const setup = routeWeaponHit(sim, player, enemy, setupWeaponId);
      assert.equal(setup.ok, true);
      setupActions++;
    }
    sim.step(DT);
    const commonImpulse = routeWeaponHit(sim, player, enemy, 'wpn_autocannon_m');
    assert.equal(commonImpulse.ok, true);
    assert.equal(commonImpulse.impulseApplied, true, 'the shared terrain opportunity is a real impulse');
    setupActions++;

    const cleanupTick = 180;
    for (let guard = 0; guard < 1_500 && enemy.alive !== false; guard++) {
      if (!prepared && state.tick === setupTick) {
        const lateSetup = routeWeaponHit(sim, player, enemy, setupWeaponId);
        assert.equal(lateSetup.ok, true);
        setupActions++;
      }
      if (state.tick >= cleanupTick) {
        aimAndChase(state, player, enemy);
        state.input.fire = true;
      }
      sim.step(DT);
      const inspection = sim.helpers.inspectAI({ entityId: enemy.id });
      const doctrine = inspection && inspection.result && inspection.result.combatDoctrine;
      const maneuverRuntime = inspection && inspection.result && inspection.result.maneuver;
      const maneuverRequest = maneuverRuntime && maneuverRuntime.lastRequest;
      const liveDecision = inspection && inspection.result && inspection.result.lastResult &&
        inspection.result.lastResult.decisions.find((entry) => entry.entityId === enemy.id);
      lastDoctrineEvidence = doctrine || (liveDecision && liveDecision.combatDoctrine) || lastDoctrineEvidence;
      if (doctrine && doctrine.mediumCounter) {
        counterReason = counterReason || doctrine.mediumCounter.reason;
      }
      if (maneuverRequest && maneuverRequest.preserveExternalFrame === true) {
        const local = maneuverRequest.forceLocal || {};
        sawZeroCommand ||= maneuverRequest.brake === false &&
          Math.hypot(local.forward || 0, local.right || 0, maneuverRequest.torqueYaw || 0) < 1e-9;
        sawPreparedExternalFrame = true;
        maxPreparedSpeed = Math.max(maxPreparedSpeed, Math.hypot(enemy.vel.x, enemy.vel.z));
      }
      const telemetry = readPhysicsTelemetry(enemy);
      const speed = Math.hypot(enemy.vel.x, enemy.vel.z);
      if (telemetry && (telemetry.mode === 'prepared_external_frame' || telemetry.mode === 'rcs_disrupted')) {
        const force = telemetry.force || {};
        const torque = telemetry.torque || {};
        sawZeroCommand ||= Math.hypot(force.x || 0, force.z || 0, torque.y || 0) < 1e-9;
        if (telemetry.mode === 'prepared_external_frame') sawPreparedExternalFrame = true;
        maxPreparedSpeed = Math.max(maxPreparedSpeed, speed);
      }
    }
    if (killTick == null && enemy.alive === false) killTick = state.tick;
    return {
      setupWeaponId,
      commonWeaponId: 'wpn_autocannon_m',
      cleanupWeaponId: 'wpn_pulse_laser_m',
      cleanupTick,
      setupTick,
      setupActions,
      counterReason,
      terrainImpactTick,
      killTick,
      sawZeroCommand,
      sawPreparedExternalFrame,
      maxPreparedSpeed,
      playerFiresBeforeTerrain,
      lastDoctrineEvidence,
    };
  } finally {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  }
}

async function runLancerCounterRoute({ intended, seed }) {
  const tactical = createTacticalAISystem({ config: { trace: { enabled: false } } });
  const sim = createSimulation({
    seed,
    systems: [physics, combat, actions, collisionConsequences, aiPorts, tactical, flightV3, weapons],
    updateOrder: [tactical, actions, flightV3, aiPorts, collisionConsequences, weapons, physics, combat],
  });
  const physicsSystem = sim.registry.get('physics');
  try {
    const { state, bus } = sim;
    state.mode = 'flight';
    state.settings.gameplay.difficulty = 'standard';
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const diagonal = 500 / Math.sqrt(2);
    const speed = 120 * Math.sqrt(2);
    const player = sim.spawn(physicalPlayer({
      pos: intended ? { x: diagonal, z: diagonal } : { x: 500, z: 0 },
      vel: intended ? { x: -120, z: -120 } : { x: 0, z: speed },
      rot: intended ? -3 * Math.PI / 4 : Math.PI / 2,
      weaponId: 'wpn_flak_turret_s',
    }));
    state.playerId = player.id;
    state.player.targetId = null;
    const enemy = sim.spawn(makeEnemySpawnSpec('lancer_sniper', 6, { x: 0, z: 0 }));
    enemy.data.encounter = true;
    enemy.shield = 0;
    enemy.armorHp = 0;
    enemy.hull = 30;
    enemy.rot = 0;
    enemy.vel.x = 0;
    enemy.vel.z = 0;
    state.input.fire = true;
    state.input.moveZ = 1;
    state.input.moveX = 0;
    state.input.turnIntent = 0;
    state.input.autoAim = { targetId: enemy.id };
    assert.equal(await physicsSystem.prepareBackend(state, { reset: true }), true,
      'the Lancer route requires prepared Rapier authority');

    const initialDistance = Math.hypot(player.pos.x - enemy.pos.x, player.pos.z - enemy.pos.z);
    const initialSpeed = Math.hypot(player.vel.x, player.vel.z);
    let killTick = null;
    let counterReason = null;
    let playerHits = 0;
    let triggerReleased = false;
    bus.on('projectile:hit', (payload) => {
      if (payload && payload.ownerId === player.id && payload.targetId === enemy.id) playerHits++;
    });
    bus.on('entity:killed', (payload) => {
      if (payload && payload.id === enemy.id && killTick == null) killTick = state.tick;
    });

    for (let guard = 0; guard < 1_600 && enemy.alive !== false; guard++) {
      if (intended || state.tick >= 240) aimAndChase(state, player, enemy);
      else {
        state.input.moveZ = 1;
        state.input.turnIntent = 0;
        state.input.aimAngle = Math.atan2(enemy.pos.z - player.pos.z, enemy.pos.x - player.pos.x);
      }
      state.input.fire = true;
      triggerReleased ||= state.input.fire !== true;
      sim.step(DT);
      const inspection = sim.helpers.inspectAI({ entityId: enemy.id });
      const doctrine = inspection && inspection.result && inspection.result.combatDoctrine;
      if (doctrine && doctrine.mediumCounter) {
        counterReason = counterReason || doctrine.mediumCounter.reason;
      }
    }
    if (killTick == null && enemy.alive === false) killTick = state.tick;
    return {
      weaponId: 'wpn_flak_turret_s', initialDistance, initialSpeed,
      playerHits, killTick, counterReason, triggerReleased,
    };
  } finally {
    physicsSystem._disableSg02DynamicAuthority?.();
    sim.dispose();
  }
}

function physicalPlayer({ pos, vel, rot, weaponId }) {
  const base = playerEntity();
  return {
    ...base,
    pos: { ...pos }, vel: { ...vel }, rot,
    hull: 1_000, hullMax: 1_000, cap: 1_000, capMax: 1_000, capRegen: 100,
    physicsBody: {
      schemaVersion: 1, radius: base.radius, mass: base.mass,
      inertiaY: base.mass * base.radius * base.radius * 0.5,
      dynamic: true, ccd: true, material: 'ship', revision: 0,
    },
    data: {
      ...base.data,
      driveId: 'drive_reaction_s',
      intent: {}, combat: {},
      weapons: [{ defId: weaponId, projSpeed: weaponDef(weaponId).projSpeed }],
    },
  };
}

function routeWeaponHit(sim, attacker, target, weaponId) {
  const def = weaponDef(weaponId);
  const dx = target.pos.x - attacker.pos.x;
  const dz = target.pos.z - attacker.pos.z;
  const length = Math.hypot(dx, dz) || 1;
  const approach = { x: dx / length, z: dz / length };
  const packet = buildWeaponDamagePacket({ defId: weaponId }, def, def.dmg, def.damageType, target.pos);
  packet.hit = {
    pos: { x: target.pos.x, z: target.pos.z },
    approach,
    normal: { x: -approach.x, z: -approach.z },
  };
  return sim.registry.get('combat').ensureKernel().routeDamage({
    attackerId: attacker.id,
    targetId: target.id,
    packet,
    origin: { kind: 'weapon', id: weaponId, weaponId },
  });
}

function weaponDef(weaponId) {
  const def = WEAPONS.find((entry) => entry.id === weaponId);
  assert.ok(def, `missing weapon definition ${weaponId}`);
  return def;
}

function aimAndChase(state, player, enemy) {
  const aim = Math.atan2(enemy.pos.z - player.pos.z, enemy.pos.x - player.pos.x);
  state.input.aimAngle = aim;
  state.input.autoAim = { targetId: enemy.id };
  state.input.turnIntent = Math.max(-1, Math.min(1, wrapAngle(aim - player.rot) / 0.62));
  state.input.moveZ = 1;
  state.input.moveX = 0;
}

function assertTerrainSetupWins(label, intended, naive, counterReason) {
  assert.equal(intended.setupWeaponId, naive.setupWeaponId, `${label} uses the same setup tool`);
  assert.equal(intended.commonWeaponId, naive.commonWeaponId, `${label} uses the same impulse opportunity`);
  assert.equal(intended.cleanupWeaponId, naive.cleanupWeaponId, `${label} uses the same cleanup weapon`);
  assert.equal(intended.cleanupTick, naive.cleanupTick, `${label} begins identical cleanup at the same tick`);
  assert.equal(intended.setupActions, naive.setupActions, `${label} spends the same two authored setup actions`);
  assert.equal(intended.counterReason, counterReason,
    `${label} doctrine evidence: ${JSON.stringify(intended.lastDoctrineEvidence)}`);
  assert.notEqual(intended.terrainImpactTick, null, `${label} must physically reach terrain`);
  assert.equal(intended.killTick, intended.terrainImpactTick, `${label} terrain contact is the intended completion`);
  assert.ok(naive.terrainImpactTick == null || naive.terrainImpactTick > intended.killTick,
    `${label} naive correction must survive the shared terrain opportunity`);
  assert.equal(intended.playerFiresBeforeTerrain, 0,
    `${label} completes before the common cleanup trigger, not through a hidden DPS cadence`);
  assert.equal(intended.sawZeroCommand, true, `${label} counter commands neither thrust nor braking`);
  assertMeaningfullyFaster(label, intended.killTick, naive.killTick);
}

function assertMeaningfullyFaster(label, intendedTicks, naiveTicks) {
  assert.notEqual(intendedTicks, null, `${label} must finish the physical actor`);
  assert.notEqual(naiveTicks, null, `${label} naive control must eventually finish through the same live route`);
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
