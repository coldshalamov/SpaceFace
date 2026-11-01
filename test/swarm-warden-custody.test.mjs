import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { CombatDoctrineRuntime, CombatDoctrineId } from '../src/ai/combatDoctrine.js';
import { ObjectiveKind } from '../src/ai/contracts.js';
import { applySpecialistCounterplay, wardScreenTarget } from '../src/ai/specialistCounterplay.js';

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

  const active = h.step(30);
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
  h.step(30);
  const newcomer = h.sim.spawn(ship(0, 10, 1,
    { runCohort: 'survival', runWave: 9, lootTableId: 'wasp_swarmer' }));
  const held = h.step(32);
  assert.ok(held.frame.contacts.some(c => c.id === newcomer.id));
  assert.equal(held.frame.self.swarmWardTargetId, h.ward.id);
  assert.equal(held.custody, h.ward.id);
  assert.equal(h.guard.data.swarmSpecialist.targetId, h.ward.id);
  assert.deepEqual(held.doctrine.flightPoint, { x: 60, z: 0 });

  h.state.run.ruleset = 'adventure';
  const adventure = h.step(34);
  assert.equal(adventure.frame.self.swarmSpecialistKind, null);
  assert.equal(adventure.frame.self.swarmWardTargetId, null);
  assert.equal(adventure.custody, newcomer.id,
    'Adventure retains its independent nearest-friendly custody rule');
});
