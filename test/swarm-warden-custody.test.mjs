import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { combat } from '../src/systems/combat.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { applySpecialistCounterplay, wardScreenTarget } from '../src/ai/specialistCounterplay.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { SWARM_SPECIALIST_TUNING } from '../src/data/swarmSpecialists.js';

const WARDEN_WINDUP = SWARM_SPECIALIST_TUNING.warden.windupTicks;

function ship(x, z, team, data = {}) {
  return { type: 'ship', alive: true, team, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 21, collisionRadius: 21, mass: 40, hull: 100, hullMax: 100,
    shield: 0, shieldMax: 0, cap: 100, capMax: 100,
    data: { combatProfileId: 'combat_profile_standard_ship', ...data } };
}

function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [aiPorts] });
  t.after(() => sim.dispose());
  const state = sim.state;
  state.mode = 'flight';
  state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 9 };
  const player = sim.spawn(ship(500, 0, 0));
  state.playerId = player.id;
  const cohort = { runCohort: 'survival', runWave: 9 };
  const guard = sim.spawn(ship(0, 0, 1, { ...cohort, lootTableId: 'warden_escort',
    ai: { forcePlayerTarget: true, combatDoctrineId: CombatDoctrineId.ESCORT_SCREEN,
      roe: 'weapons_free', activity: { kind: 'screen', reason: 'survival_wave',
        anchor: { x: 0, z: 0 }, leashRadius: 2600, preferredRange: 150, startedTick: 0 } } }));
  const otherGuard = sim.spawn(ship(0, 50, 1, { ...cohort, lootTableId: 'warden_escort' }));
  const ward = sim.spawn(ship(-100, 0, 1, { ...cohort, lootTableId: 'wasp_swarmer' }));
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const directive = { objective: { kind: ObjectiveKind.SCREEN, targetId: player.id }, formation: {} };
  function step(tick) {
    state.tick = tick;
    state.simTime = tick / 60;
    state.spatialHash.rebuild(state.entityList);
    const frame = sim.helpers.aiSensors.frameFor(guard.id, tick);
    const doctrine = runtime.update({ tick, entityId: guard.id,
      doctrineId: CombatDoctrineId.ESCORT_SCREEN, perception: frame, directive });
    assert.ok(doctrine, 'the production sensor frame admits the escort doctrine');
    applySpecialistCounterplay({ state, specialist: guard, enemyId: 'warden_escort',
      doctrinePhase: doctrine.phase, doctrine, tick });
    return { frame, doctrine, custody: runtime.byEntity.get(guard.id).custodyTargetId };
  }
  return { sim, state, player, guard, otherGuard, ward, step };
}

test('production Warden sensor, custody, screen point and active link share one eligible ward', (t) => {
  const h = fixture(t);
  const first = h.step(0);
  assert.equal(first.frame.self.swarmSpecialistKind, 'warden');
  assert.ok(first.frame.contacts.some(c => c.id === h.otherGuard.id && c.hostile === false),
    'the closer friendly Warden is present in the real sensor frame');
  assert.equal(first.frame.self.swarmWardTargetId, h.ward.id,
    'the initial approach already selects the eligible non-Warden');
  assert.equal(first.custody, h.ward.id);
  assert.equal(h.guard.data.swarmSpecialist.targetId ?? null, null,
    'the candidate is not an active guard link during deployment');

  assert.ok(WARDEN_WINDUP >= 36, 'the Warden retains the authored minimum warning');
  assert.equal(h.step(WARDEN_WINDUP - 1).doctrine.phase, 'screen_deploy');
  const active = h.step(WARDEN_WINDUP);
  assert.equal(active.doctrine.phase, 'screen_hold');
  assert.equal(h.guard.data.swarmSpecialist.phase, 'active');
  assert.equal(h.guard.data.swarmSpecialist.targetId, h.ward.id);
  assert.equal(active.custody, h.guard.data.swarmSpecialist.targetId);
  assert.deepEqual(active.doctrine.flightPoint, { x: 60, z: 0 },
    'the maneuver holds the protected ward-to-player line, not the other Warden line');
  assert.equal(wardScreenTarget(h.state, h.player, h.ward, { kind: 'weapon' })?.id, h.guard.id,
    'the actual body on that line can intercept the linked ward shot');
});

test('a nearer newcomer cannot silently move an active Warden screen to another friendly', (t) => {
  const h = fixture(t);
  h.step(0);
  h.step(WARDEN_WINDUP);
  const newcomer = h.sim.spawn(ship(0, 10, 1,
    { runCohort: 'survival', runWave: 9, lootTableId: 'wasp_swarmer' }));
  const held = h.step(WARDEN_WINDUP + 2);
  assert.ok(held.frame.contacts.some(c => c.id === newcomer.id));
  assert.equal(held.frame.self.swarmWardTargetId, h.ward.id);
  assert.equal(held.custody, h.ward.id);
  assert.equal(h.guard.data.swarmSpecialist.targetId, h.ward.id);
  assert.deepEqual(held.doctrine.flightPoint, { x: 60, z: 0 });

  h.state.run.ruleset = 'adventure';
  const adventure = h.step(WARDEN_WINDUP + 4);
  assert.equal(adventure.frame.self.swarmSpecialistKind, null);
  assert.equal(adventure.frame.self.swarmWardTargetId, null);
  assert.equal(adventure.custody, newcomer.id,
    'Adventure retains its independent nearest-friendly custody rule');
});

test('a hit against a dead ward does not consume an active Warden link', (t) => {
  const h = fixture(t);
  h.step(0); h.step(WARDEN_WINDUP);
  const energy = h.guard.data.swarmSpecialist.linkEnergy;
  assert.ok(Number.isFinite(energy) && energy > 0, 'the test starts with an active finite guard link');
  h.ward.alive = false;
  assert.equal(wardScreenTarget(h.state, h.player, h.ward, { kind: 'weapon' }), null);
  assert.equal(h.guard.data.swarmSpecialist.linkEnergy, energy);
});

function openUmbrella(t) {
  const seed = 4242;
  const wave = 26;
  const arenaId = 'helios_core';
  const sim = createSimulation({ seed, systems: [spawnBudget, combat, aiPorts, survivalWave] });
  t.after(() => sim.dispose());
  const { state, bus, helpers } = sim;
  state.mode = 'flight';
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  Object.assign(state.run, { arenaId, wave, phase: 'active' });
  const player = sim.spawn(ship(0, 0, 0));
  state.playerId = player.id;
  noteSwarmPilotAction(state);
  const plan = planWave({ seed, wave, arenaId, ruleset: 'swarm' });
  bus.emit('run:wavePlanned', { wave, plan });
  bus.emit('run:waveStarted', { wave });
  const guards = state.entityList.filter(e => e.alive && e.data?.lootTableId === 'warden_escort');
  assert.equal(guards.length, 2, 'the live opening admits exactly the authored pair');
  assert.ok(state.entityList.some(e => e.alive && e.data?.lootTableId === 'lancer_sniper'),
    'the allied gunners are also present');
  const [first, second] = guards;
  const shotEvents = [];
  bus.on('combat:warded', event => shotEvents.push(event));
  const runtime = new CombatDoctrineRuntime({ seed });
  const directive = { objective: { kind: ObjectiveKind.SCREEN, targetId: player.id }, formation: {} };
  const origin = { kind: 'weapon', id: 'swarm-warden-custody-test' };
  const hit = (target, damage = 20) => helpers.routeCombatDamage({ attackerId: player.id, targetId: target.id,
    packet: scalarHitToDamagePacket({ damage, pos: target.pos }), origin });
  const from = (front, back, perpendicular = false) => {
    const dx = front.pos.x - back.pos.x;
    const dz = front.pos.z - back.pos.z;
    const scale = 400 / Math.hypot(dx, dz);
    Object.assign(player.pos, { x: front.pos.x + (perpendicular ? -dz : dx) * scale,
      z: front.pos.z + (perpendicular ? dx : dz) * scale });
  };
  function step(tick) {
    state.tick = tick;
    state.simTime = tick / 60;
    state.spatialHash.rebuild(state.entityList);
    return guards.filter(guard => guard.alive).map(guard => {
      const frame = helpers.aiSensors.frameFor(guard.id, tick);
      const doctrine = runtime.update({ tick, entityId: guard.id,
        doctrineId: CombatDoctrineId.ESCORT_SCREEN, perception: frame, directive });
      assert.ok(doctrine);
      applySpecialistCounterplay({ state, specialist: guard, enemyId: 'warden_escort',
        doctrinePhase: doctrine.phase, doctrine, tick });
      return frame;
    });
  }
  from(first, second);
  return { sim, state, player, first, second, step, hit, from, origin, shotEvents };
}

function deployUmbrella(h) {
  assert.ok(Math.hypot(h.first.pos.x - h.second.pos.x, h.first.pos.z - h.second.pos.z)
    < SWARM_SPECIALIST_TUNING.warden.linkRange);
  assert.deepEqual(h.step(0).map(frame => frame.self.swarmWardTargetId), [h.second.id, h.first.id],
    'the actual initial sensor frame gives each Warden its own partner');
  assert.equal(wardScreenTarget(h.state, h.player, h.second, h.origin), null, 'windup has no redirect');
  for (let tick = 1; tick < 150; tick++) {
    h.step(tick);
    if ([h.first, h.second].every(guard => guard.data.swarmSpecialist?.phase === 'active')) break;
  }
  assert.ok(h.state.tick >= WARDEN_WINDUP);
  assert.deepEqual([h.first, h.second].map(guard => guard.data.swarmSpecialist.targetId), [h.second.id, h.first.id]);
}

test('round 26 deploys reciprocal finite Ward links through the live shot router', (t) => {
  const h = openUmbrella(t);
  deployUmbrella(h);
  const maxEnergy = SWARM_SPECIALIST_TUNING.warden.linkMaxEnergy;
  const firstLink = h.first.data.swarmSpecialist;
  const secondLink = h.second.data.swarmSpecialist;
  h.from(h.second, h.first, true);
  assert.equal(wardScreenTarget(h.state, h.player, h.second, h.origin), null, 'a wide bearing dodges the guard');
  h.from(h.first, h.second);
  const forward = h.hit(h.second, 100);
  assert.equal(forward.warderId, h.first.id);
  assert.ok(forward.swarmGuardRedirected > 0 && forward.totalApplied > 0, 'both bodies take their own share');
  assert.equal(firstLink.linkEnergy, maxEnergy - 40);
  assert.equal(secondLink.linkEnergy, maxEnergy, 'the redirected share cannot trigger the reciprocal link');
  h.from(h.second, h.first);
  const backward = h.hit(h.first, 100);
  assert.equal(backward.warderId, h.second.id);
  assert.equal(secondLink.linkEnergy, maxEnergy - 40);
  assert.deepEqual(h.shotEvents.map(event => [event.escortId, event.targetId]),
    [[h.first.id, h.second.id], [h.second.id, h.first.id]], 'the existing shield effect sees one receipt per shot');
  h.from(h.first, h.second);
  h.hit(h.second, 100);
  assert.equal(firstLink.linkEnergy, maxEnergy - 80);
  assert.equal(h.hit(h.second, 100).warderId, h.first.id, 'the final share spends the remaining finite pool');
  assert.equal(firstLink.linkEnergy, 0);
  assert.equal(firstLink.phase, 'recovery');
  assert.equal(wardScreenTarget(h.state, h.player, h.second, h.origin), null, 'a spent link is open to counterfire');
});

test('round 26 breaks when separated, and a retired partner never guards a new occupant', (t) => {
  const h = openUmbrella(t);
  deployUmbrella(h);
  const firstLink = h.first.data.swarmSpecialist;
  const position = { x: h.second.pos.x, z: h.second.pos.z };
  const dx = position.x - h.first.pos.x;
  const dz = position.z - h.first.pos.z;
  const scale = 350 / Math.hypot(dx, dz);
  Object.assign(h.second.pos, { x: h.first.pos.x + dx * scale, z: h.first.pos.z + dz * scale });
  h.from(h.first, h.second);
  assert.equal(wardScreenTarget(h.state, h.player, h.second, h.origin), null, 'the shot line cannot extend link range');
  assert.equal(firstLink.phase, 'recovery');
  Object.assign(h.second.pos, position);
  const oldId = h.first.id;
  const oldGeneration = h.first.occupantGeneration;
  assert.equal(h.second.data.swarmSpecialist.targetGeneration, oldGeneration);
  assert.equal(h.sim.helpers.removeEntity(oldId, { immediate: true }), true);
  const replacement = h.sim.spawn(ship(h.first.pos.x, h.first.pos.z, h.first.team, {
    runCohort: 'survival', runWave: 26, lootTableId: 'warden_escort', swarmWardPair: h.first.data.swarmWardPair,
  }));
  assert.equal(replacement.id, oldId, 'exercise actual numeric id recycling');
  assert.notEqual(replacement.occupantGeneration, oldGeneration);
  h.from(h.second, replacement);
  assert.equal(wardScreenTarget(h.state, h.player, replacement, h.origin), null);
  h.step(h.state.tick + 1);
  assert.equal(h.second.data.swarmSpecialist.targetId, null, 'the surviving Warden drops its retired partner');
  assert.equal(h.second.data.swarmSpecialist.phase, 'recovery');
});

test('production Anchor timing keeps the announced active window and caps close-range recovery', (t) => {
  const h = fixture(t);
  h.player.pos.x = 100;
  const anchor = h.sim.spawn(ship(0, 0, 1, { runCohort: 'survival', runWave: 9,
    lootTableId: 'field_anchor_controller', ai: { forcePlayerTarget: true,
      combatDoctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, roe: 'weapons_free',
      activity: { kind: 'attack_run', reason: 'survival_wave', targetId: h.player.id, startedTick: 0 } } }));
  h.state.spatialHash.rebuild(h.state.entityList);
  const frame = h.sim.helpers.aiSensors.frameFor(anchor.id, 0);
  assert.equal(frame.self.swarmSpecialistKind, 'anchor');
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const directive = { objective: { kind: ObjectiveKind.ENGAGE, targetId: h.player.id }, formation: {} };
  const { windupTicks, activeTicks, recoveryMaxTicks } = SWARM_SPECIALIST_TUNING.anchor;
  const recoveryAt = windupTicks + activeTicks;
  const reformAt = recoveryAt + recoveryMaxTicks;
  const phases = new Map();
  for (let tick = 0; tick <= reformAt + 1; tick++) {
    phases.set(tick, runtime.update({ tick, entityId: anchor.id,
      doctrineId: CombatDoctrineId.FIELD_ANCHOR_CONTROLLER, perception: frame, directive }).phase);
  }
  assert.ok(windupTicks >= 36, 'the Anchor retains the authored minimum warning');
  assert.equal(phases.get(windupTicks - 1), 'field_spool');
  assert.equal(phases.get(windupTicks), 'anchor_hold');
  assert.equal(phases.get(recoveryAt - 1), 'anchor_hold', 'crossing the ring does not cancel its commitment');
  assert.equal(phases.get(recoveryAt), 'recover');
  assert.equal(phases.get(reformAt - 1), 'recover');
  assert.equal(phases.get(reformAt), 'reform');
});

test('production Jackal doctrine retains the complete release window for its finite salvo', (t) => {
  const h = fixture(t);
  h.player.pos.x = 300;
  const jackal = h.sim.spawn(ship(0, 0, 1, { runCohort: 'survival', runWave: 9,
    lootTableId: 'mine_layer_jackal', ai: { forcePlayerTarget: true,
      combatDoctrineId: CombatDoctrineId.MINE_LAYER_WAKE, roe: 'weapons_free',
      activity: { kind: 'attack_run', reason: 'survival_wave', targetId: h.player.id, startedTick: 0 } } }));
  h.state.spatialHash.rebuild(h.state.entityList);
  const frame = h.sim.helpers.aiSensors.frameFor(jackal.id, 0);
  assert.equal(frame.self.swarmSpecialistKind, 'jackal');
  const runtime = new CombatDoctrineRuntime({ seed: 4242 });
  const directive = { objective: { kind: ObjectiveKind.ENGAGE, targetId: h.player.id }, formation: {} };
  const { windupTicks, activeTicks } = SWARM_SPECIALIST_TUNING.jackal;
  const disengageAt = windupTicks + activeTicks;
  const phases = new Map();
  for (let tick = 0; tick <= disengageAt + 1; tick++) {
    phases.set(tick, runtime.update({ tick, entityId: jackal.id,
      doctrineId: CombatDoctrineId.MINE_LAYER_WAKE, perception: frame, directive }).phase);
  }
  assert.ok(windupTicks >= 36, 'the Jackal retains the authored minimum warning');
  assert.equal(phases.get(windupTicks - 1), 'wake_cue');
  assert.equal(phases.get(windupTicks), 'mine_drop');
  assert.equal(phases.get(disengageAt - 1), 'mine_drop');
  assert.equal(phases.get(disengageAt), 'disengage');
});
