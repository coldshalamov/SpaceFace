// PQ-133.04: public owner behavior, including executable shared-owner acceptance gaps.
// A shared-owner test stays red until that owner is repaired; no skipped acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createRunState, snapshotCampaignBoundary, assertCampaignBoundaryUnchanged } from '../src/core/runState.js';
import { createSurfaceContactReceipt, surfaceContactFromBodies } from '../src/core/surfaceContact.js';
import { compileAttackSpec, digestAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { tryBounce } from '../src/combat/attackPropagation.js';
import { armAttackContinue, resolveLiveAttackHit } from '../src/combat/attackHit.js';
import { resolveRicochet, steerAfterBounce } from '../src/combat/surfaceReflection.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { WEAPONS } from '../src/data/weapons.js';
import { bankShotOffPlate } from '../src/data/arenaModuleLibrary.js';
import { SURVIVAL_WAVES, SURVIVAL_BOSS_CIRCUIT, validateWaveRecipe } from '../src/data/survivalWaves.js';
import { planWave, hashSemanticWavePlan } from '../src/systems/survivalWavePlanner.js';
import { materializeWaveBatch } from '../src/systems/waveMaterialization.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { planArenaInstall } from '../src/systems/survivalArena.js';
import { combat } from '../src/systems/combat.js';

const ARENA = 'helios_core';
const BOSS = 'mirrorjaw_foreman';
const SEED = 13304;
const DT = 1 / 60;

function compiled(modifiers = []) {
  const result = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers });
  assert.equal(result.ok, true);
  return result.spec;
}
const direct = compiled();
const bank = compiled([['mod_bank_shot', 1]]);
const smart = compiled([['mod_bank_shot', 1], ['mod_smart_bank', 1]]);

function shot() {
  return { id: 'bolt', type: 'projectile', alive: true, radius: 0.7,
    pos: { x: 0, z: 0 }, vel: { x: 12, z: 0 }, rot: 0 };
}
function receipt(material = 'plate') {
  return createSurfaceContactReceipt({ point: { x: 0, z: 0 }, normal: { x: -1, z: 0 },
    velocity: { x: 12, z: 0 }, material, tick: 10, projectileId: 'bolt', surfaceId: 'plate' });
}

test('bounce refuses malformed counters and shared budgets without changing them', () => {
  const corruptions = [
    r => { r.remaining.bounces = NaN; },
    r => { r.remaining.bounces = Infinity; },
    r => { r.remaining.bounces = 0.5; },
    r => { r.remaining = null; },
    r => { r.budget.remaining = NaN; },
    r => { r.budget.remaining = Infinity; },
    r => { r.budget.remaining = 0.5; },
    r => { r.budget.remaining = r.budget.initial + 1; },
    r => { r.budget.consumed = -1; },
    r => { r.budget.consumed = 1; },
    r => { r.generation = r.budget.constraints.generationMax + 1; },
  ];
  for (const corrupt of corruptions) {
    const runtime = createLineage({ spec: bank });
    corrupt(runtime);
    const before = structuredClone(runtime);
    assert.equal(tryBounce(runtime).ok, false, String(corrupt));
    assert.deepEqual(runtime, before, 'refusal must not spend or corrupt the lineage');
  }
});

test('direct shots, absorbed shots, and unknown surfaces consume without spending a bounce', () => {
  for (const [spec, material] of [[direct, 'plate'], [bank, 'furnace'], [bank, 'absorbent'], [bank, 'unknown']]) {
    const body = shot();
    const runtime = createLineage({ spec });
    const before = structuredClone(runtime);
    const result = resolveRicochet(runtime, spec, receipt(material), body);
    assert.equal(result.consume, true);
    assert.deepEqual(body.vel, { x: 12, z: 0 });
    assert.deepEqual(runtime, before);
  }
});

test('reflection kernel rejects cloned, forged, renderer-shaped and absent receipts', () => {
  for (const contact of [null, {}, { ...receipt() }, structuredClone(receipt()),
    { source: 'renderer', normal: { x: -1, z: 0 }, material: 'reflective' }]) {
    const runtime = createLineage({ spec: bank });
    const body = shot();
    const result = resolveRicochet(runtime, bank, contact, body);
    assert.equal(result.reason, 'no_physics_receipt');
    assert.equal(runtime.budget.consumed, 0);
    assert.equal(body.vel.x, 12);
  }
});

test('eligible reflection continues one body, preserves AttackSpec and exhausts its budget', () => {
  for (const spec of [bank, smart]) {
    const runtime = createLineage({ spec });
    const body = armAttackContinue(shot());
    const identity = body;
    const before = JSON.stringify(spec);
    const result = resolveLiveAttackHit({ spec, runtime, projectile: body,
      target: { id: 'plate', type: 'station', surfaceMaterial: 'plate' },
      payload: { receipt: receipt() }, tick: 10 });
    assert.equal(result.consume, false);
    assert.equal(result.projectile, identity);
    assert.equal(body.vel.x, -12);
    body.alive = false; // the existing physics continuation handshake
    assert.equal(body.alive, true);
    assert.equal(runtime.budget.consumed, 1);
    assert.equal(runtime.remaining.bounces, 0);
    assert.equal(tryBounce(runtime).reason, 'no_remaining_bounces');
    assert.equal(JSON.stringify(spec), before);
    assert.equal(digestAttackSpec(spec), spec.digest);
  }
  const runtime = createLineage({ spec: bank });
  runtime.budget.consumed = runtime.budget.initial;
  runtime.budget.remaining = 0;
  assert.equal(tryBounce(runtime).reason, 'proc_budget');
  assert.equal(runtime.remaining.bounces, 1);
});

test('Smart Bank orders by score, distance and id, excludes visited and respects its cone', () => {
  const candidates = [
    { id: 'far', score: 2, pos: { x: -30, z: 3 } },
    { id: 'b', score: 2, pos: { x: -10, z: -2 } },
    { id: 'a', score: 2, pos: { x: -10, z: 2 } },
    { id: 'close', score: 1, pos: { x: -2, z: 0 } },
    { id: 'visited', score: 50, pos: { x: -5, z: -1 } },
    { id: 'outside', score: 100, pos: { x: 0, z: 20 } },
  ];
  const visited = new Map([['visited', 1]]);
  const velocity = { x: -12, z: 0 };
  const expected = steerAfterBounce(velocity, { x: 0, z: 0 }, smart, candidates, visited);
  assert.ok(expected.z > 0, 'id a wins the equal-score, equal-distance tie');
  assert.ok(Math.abs(Math.hypot(expected.x, expected.z) - 12) < 1e-6);
  assert.ok(Math.atan2(Math.abs(expected.z), -expected.x) <= 35 * Math.PI / 180);
  for (let i = 0; i < candidates.length; i++) {
    const shuffled = candidates.slice(i).concat(candidates.slice(0, i)).reverse();
    assert.deepEqual(steerAfterBounce(velocity, { x: 0, z: 0 }, smart, shuffled, visited), expected);
  }
});

test('ten Foundry recipes are immutable, deterministic, budgeted and finish with Mirrorjaw', () => {
  const recipes = SURVIVAL_WAVES.filter(r => r.arenaId === ARENA);
  assert.equal(recipes.length, 10);
  for (const recipe of recipes) {
    assert.ok(Object.isFrozen(recipe.packages));
    assert.equal(validateWaveRecipe(recipe).ok, true);
    const input = { seed: SEED, arenaId: ARENA, wave: recipe.wave };
    const a = planWave(input), b = planWave(structuredClone(input));
    assert.deepEqual(a, b);
    assert.equal(hashSemanticWavePlan(a), hashSemanticWavePlan(b));
    assert.ok(a.schedule.reduce((n, row) => n + row.count, 0) <= 24);
    assert.ok(a.schedule.every(row => row.atTick <= 200));
  }
  const bossPlan = planWave({ seed: SEED, arenaId: ARENA, wave: 10 });
  assert.equal(bossPlan.packages.find(p => p.role === 'elite').enemyId, BOSS);
  assert.equal(SURVIVAL_BOSS_CIRCUIT.find(r => r.arenaId === ARENA).bossEnemyId, BOSS);
  assert.equal(bossPlan.packages.filter(p => p.role === 'mass').reduce((n, p) => n + p.count, 0), 6);
});

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const events = [];
  for (const name of ['entity:killed', 'run:waveCleared', 'economy:grantCredits', 'loot:drop']) {
    bus.on(name, payload => events.push({ name, payload }));
  }
  const budget = makeBudgetApi(state);
  const helpers = { spawnBudget: budget,
    getEntity: id => state.entities.get(id),
    spawnEntity(spec) {
      const entity = makeEntity({ ...spec, id: allocateEntityId(state) });
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  state.playerId = helpers.spawnEntity({ type: 'ship', team: 0, pos: { x: 0, z: 0 },
    hull: 140, hullMax: 140, data: { defId: 'ship_kestrel' } }).id;
  state.mode = 'flight';
  state.run = createRunState({ kind: 'survival', ruleset: 'scored', seed: SEED });
  Object.assign(state.run, { arenaId: ARENA, phase: 'active', wave: 10 });
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  bus.on('entity:destroyed', p => budget.releaseEntity(p.id));
  combat.init(ctx);
  return { state, bus, budget, helpers, events, ctx };
}

test('Mirrorjaw materializes with real weapons and dies to Pulse hits through combat exactly once', (t) => {
  assert.ok(ENEMY_TYPES.some(e => e.id === BOSS), 'unknown ids silently materialize as wasps');
  const h = boot();
  const before = snapshotCampaignBoundary(h.state);
  const fitted = h.state.player.ownedShips;
  const result = materializeWaveBatch(h.ctx, { ownerId: 'survival-wave:10', enemyId: BOSS,
    level: 4, count: 1, gateGroup: 'nw', seed: SEED, wave: 10, role: 'elite' });
  assert.equal(result.admitted, 1);
  const boss = h.state.entities.get(result.spawnedIds[0]);
  assert.equal(boss.data.lootTableId, BOSS);
  assert.equal(boss.data.runCohort, 'survival');
  assert.ok(boss.data.weapons.length > 0);
  assert.equal(boss.data.ai.combatDoctrineId, 'brawler_commit');
  assert.ok(boss.turnRate < 1, 'a heavy committed hull cannot snap to face the pilot');
  const pulse = WEAPONS.find(w => w.id === 'wpn_pulse_laser_s');
  assert.ok(boss.armorFlat < pulse.dmg);
  assert.equal(boss.shieldRegenRate, 0);
  let hits = 0;
  while (boss.alive && hits < 500) {
    const applied = combat.onHit({ targetId: boss.id, ownerId: h.state.playerId,
      damage: pulse.dmg, damageType: pulse.damageType, weaponId: pulse.id, pos: boss.pos });
    assert.equal(applied.ok, true);
    hits++;
  }
  assert.equal(boss.alive, false, `${hits} legal pulse hits must kill`);
  t.diagnostic(`Mirrorjaw killed by ${hits} canonical Pulse damage hits at level 4; no aimed-route claim`);
  combat.onHit({ targetId: boss.id, ownerId: h.state.playerId, damage: pulse.dmg,
    damageType: pulse.damageType, weaponId: pulse.id, pos: boss.pos });
  assert.equal(h.events.filter(e => e.name === 'entity:killed' && e.payload.id === boss.id).length, 1);
  h.bus.emit('entity:destroyed', { id: boss.id });
  assert.equal(h.budget.current(), 0);
  assert.equal(h.budget.max(), 24);
  assert.equal(h.events.filter(e => e.name === 'economy:grantCredits' || e.name === 'loot:drop').length, 0);
  assert.equal(h.state.player.ownedShips, fitted);
  assert.doesNotThrow(() => assertCampaignBoundaryUnchanged(before, snapshotCampaignBoundary(h.state)));
});

test('ten wave schedules materialize under the unchanged cap and cleanup waits for real combat deaths', () => {
  const h = boot();
  survivalWave.init(h.ctx);
  try {
    for (let wave = 1; wave <= 10; wave++) {
      h.state.run.wave = wave;
      const plan = planWave({ seed: SEED, arenaId: ARENA, wave });
      h.bus.emit('run:wavePlanned', { wave, plan });
      h.bus.emit('run:waveStarted', { wave });
      for (let tick = 0; tick < 201; tick++) survivalWave.update(DT);
      assert.equal(h.events.filter(e => e.name === 'run:waveCleared' && e.payload.wave === wave).length, 0);
      assert.ok(h.budget.current() > 0 && h.budget.current() <= 24);
      const cohort = h.state.entityList.filter(e => e.alive && e.data?.runWave === wave);
      if (wave === 10) assert.ok(cohort.some(e => e.data.lootTableId === BOSS));
      for (const entity of cohort) {
        combat.onHit({ targetId: entity.id, ownerId: h.state.playerId, damage: 100000,
          damageType: 'kinetic', weaponId: 'wpn_pulse_laser_s', pos: entity.pos });
        assert.equal(entity.alive, false);
        h.bus.emit('entity:destroyed', { id: entity.id });
      }
      survivalWave.update(DT);
      survivalWave.update(DT);
      assert.equal(h.events.filter(e => e.name === 'run:waveCleared' && e.payload.wave === wave).length, 1);
      assert.equal(h.budget.current(), 0);
      assert.equal(h.budget.max(), 24);
      assert.equal(h.state.mode, 'flight');
    }
  } finally { survivalWave.newGame(); survivalWave.destroy(); }
});

// These are required acceptance assertions, not descriptions that would make a missing feature green.
test('shared-owner R1: live combat must reject absent and forged surface receipts', () => {
  for (const payload of [{}, { receipt: { ...receipt() } }]) {
    const body = shot();
    const runtime = createLineage({ spec: bank });
    const result = resolveLiveAttackHit({ spec: bank, runtime, projectile: body,
      target: { id: 'plate', type: 'station', surfaceMaterial: 'plate' }, payload, tick: 10 });
    assert.equal(result.consume, true);
    assert.equal(runtime.budget.consumed, 0);
  }
});

test('shared-owner R1: an issued receipt for another projectile cannot authorize this body', () => {
  const body = shot();
  body.id = 'unrelated-bolt';
  assert.equal(resolveRicochet(createLineage({ spec: bank }), bank, receipt(), body).consume, true);
});

test('shared-owner R2: moving surface contact carries contact and relative velocity', () => {
  const body = shot();
  const surface = { id: 'moving-plate', pos: { x: 0, z: 0 }, vel: { x: 2, z: 0 },
    angVel: 0, surfaceMaterial: 'plate' };
  const contact = surfaceContactFromBodies(body, surface, { point: body.pos, normal: { x: -1, z: 0 } }, 10);
  assert.deepEqual(contact.surfaceVelocity, { x: 2, z: 0 });
  assert.deepEqual(contact.relativeVelocity, { x: 10, z: 0 });
  const result = resolveRicochet(createLineage({ spec: bank }), bank, contact, body);
  assert.equal(result.velocity.x, -8, 'reflect 10 relative, then add the surface velocity 2');
});

test('shared-owner R3: arena plate helper cannot reflect an ordinary direct shot', () => {
  const plate = { id: 'room-plate', kind: 'plate', pos: { x: 10, z: 0 },
    normal: { x: -1, z: 0 }, halfWidth: 20 };
  assert.equal(bankShotOffPlate(plate, shot()).ok, false);
});

test('shared-owner R3: Foundry idle installs authored reflective geometry from wave one', () => {
  const install = planArenaInstall({ arenaId: ARENA, arenaPhase: 'idle', wave: 1, seed: SEED });
  assert.ok(install.toys?.some(toy => toy.kind === 'plate'), 'Foundry must teach banks in its first room');
});
