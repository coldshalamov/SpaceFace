// PQ-133.04 R4 — Mirrorjaw solution families (CRU-031).
//
// Family A: the prow sheds (0.25x) and the stern punishes (1.6x), and the stern's aft drive
//          subsystem transitions on a pinned tick boundary.
// Family B: the authored prow is SURFACE machinery — an eligible ricochet banks off it through
//          the physics receipt contract; every other contact is consumed as ordinary armor.
// Family C: shooting the machinery until it unmoors publishes the causal receipt through the
//          semantic arbiter (combat:subsystemDisabled -> subsystem.disabled cue).
// Identity: zero bounty and no loot stay load-bearing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createRunState } from '../src/core/runState.js';
import { createSurfaceContactReceipt } from '../src/core/surfaceContact.js';
import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage } from '../src/combat/attackLineage.js';
import { armAttackContinue, resolveLiveAttackHit } from '../src/combat/attackHit.js';
import { resolveBossSurfaceContact, bossSurfaceAuthoringOf } from '../src/combat/bossSurface.js';
import { scalarHitToDamagePacket } from '../src/combat/damage.js';
import { entityKey } from '../src/combat/runtime.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { presentationOrchestrator } from '../src/systems/presentationOrchestrator.js';
import { bindAttackCausalBus } from '../src/combat/attackHit.js';

const SEED = 13304;
const BOSS = 'mirrorjaw_foreman';
const DT = 1 / 60;

function compiled(modifiers = []) {
  const result = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers });
  assert.equal(result.ok, true);
  return result.spec;
}
const bank = compiled([['mod_bank_shot', 1]]);
const direct = compiled();

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const events = [];
  bus.on('combat:subsystemDisabled', (p) => events.push({ name: 'combat:subsystemDisabled', payload: p }));
  bus.on('combat:subsystemEnabled', (p) => events.push({ name: 'combat:subsystemEnabled', payload: p }));
  bus.on('combat:bounceContinued', (p) => events.push({ name: 'combat:bounceContinued', payload: p }));
  const helpers = {
    getEntity: (id) => state.entities.get(id),
    spawnEntity(spec) {
      const entity = makeEntity({ ...spec, id: allocateEntityId(state) });
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  state.playerId = helpers.spawnEntity({ type: 'ship', team: 0, pos: { x: 400, z: 0 },
    hull: 140, hullMax: 140, data: { defId: 'ship_kestrel' } }).id;
  state.mode = 'flight';
  state.run = createRunState({ kind: 'survival', ruleset: 'block', seed: SEED });
  Object.assign(state.run, { arenaId: 'helios_core', phase: 'active', wave: 10 });
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  combat.init(ctx);
  return { state, bus, helpers, events, ctx };
}

/** The boss as the wave materializer builds it, with its authored surface identity stamped on. */
function spawnBoss(h, { pos = { x: 0, z: 0 }, rot = 0, neutral = false } = {}) {
  const def = ENEMY_TYPES.find((e) => e.id === BOSS);
  const spec = makeEnemySpawnSpec(BOSS, 4, { ...pos });
  spec.rot = rot;
  // Surface identity is the surface materializer's stamp; the def row is its single authored
  // truth (the same way R3 room solids carry data.surfaceMaterial).
  spec.data.surfaceMaterial = def.surfaceMaterial;
  if (neutral) {
    // A geometry fixture: the layered tank is zeroed BEFORE the entity exists, so the combat
    // runtime snapshots a neutral hull and the directional multipliers land exactly.
    spec.shield = spec.shieldMax = 0;
    spec.armorHp = spec.armorMax = 0;
    spec.armorFlat = 0;
  }
  const boss = h.helpers.spawnEntity(spec);
  return { boss, def };
}

function bossRuntime(h, boss) {
  return h.state.combat.entities[entityKey(boss.id)];
}

function sternHit(h, boss, damage = 40) {
  return combat.ensureKernel().routeDamage({
    attackerId: h.state.playerId,
    targetId: boss.id,
    packet: scalarHitToDamagePacket({
      damage, damageType: 'kinetic', pos: { x: boss.pos.x - 30, z: boss.pos.z }, subsystemShare: 1,
    }),
    origin: { kind: 'test', id: 'pq-133-04-r4-stern' },
  });
}

test('Family A: frontal fire sheds at 0.25, stern fire punishes at 1.6', () => {
  const h = boot();
  const { boss } = spawnBoss(h, { neutral: true });
  const kernel = combat.ensureKernel();
  const frontal = kernel.routeDamage({
    attackerId: h.state.playerId,
    targetId: boss.id,
    packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic', pos: { x: 100, z: 0 } }),
    origin: { kind: 'test', id: 'pq-133-04-r4-frontal' },
  });
  assert.equal(frontal.ok, true);
  assert.equal(frontal.directionalArc, 'front');
  assert.equal(frontal.directionalFactor, 0.25);
  const flank = kernel.routeDamage({
    attackerId: h.state.playerId,
    targetId: boss.id,
    packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic', pos: { x: 0, z: 100 } }),
    origin: { kind: 'test', id: 'pq-133-04-r4-flank' },
  });
  assert.equal(flank.directionalArc, null);
  assert.equal(flank.directionalFactor, 1);
  // The hull layer carries the level-4 profile's own multipliers; the directional claim is the
  // RATIO of identically-built packets into the same hull, and it is pinned exactly.
  assert.ok(frontal.hullDamage > 0, 'frontal fire reaches the hull');
  assert.ok(Math.abs(frontal.hullDamage / flank.hullDamage - 0.25) < 1e-9, 'frontal lands exactly 0.25x the neutral hit');
  const stern = kernel.routeDamage({
    attackerId: h.state.playerId,
    targetId: boss.id,
    packet: scalarHitToDamagePacket({ damage: 100, damageType: 'kinetic', pos: { x: -100, z: 0 } }),
    origin: { kind: 'test', id: 'pq-133-04-r4-stern' },
  });
  assert.equal(stern.directionalArc, 'rear');
  assert.equal(stern.directionalFactor, 1.6);
  assert.ok(Math.abs(stern.hullDamage / flank.hullDamage - 1.6) < 1e-9, 'stern lands exactly 1.6x the neutral hit');
  assert.ok(Math.abs(stern.totalApplied / frontal.totalApplied - 6.4) < 1e-9, 'rear/front ratio stays exactly 1.6/0.25');
});

test('Family A: the aft drive transition is pinned tick by tick — damaged at T, unmoored at T+1', () => {
  const h = boot();
  const { boss } = spawnBoss(h);
  const kernel = combat.ensureKernel();
  // The first hit also materializes the boss's combat runtime (the table fills lazily).
  sternHit(h, boss);
  const runtime = bossRuntime(h, boss);
  assert.ok(runtime && runtime.subsystems && runtime.subsystems.subsystem_drive, 'the boss carries the standard drive volume');
  assert.equal(runtime.subsystems.subsystem_drive.destroyed, false);

  let killTick = null;
  if (runtime.subsystems.subsystem_drive.pendingTransition) killTick = h.state.tick;
  for (let i = 0; i < 20 && killTick == null; i++) {
    sternHit(h, boss);
    if (runtime.subsystems.subsystem_drive.pendingTransition) killTick = h.state.tick;
  }
  assert.ok(killTick != null, 'stern fire through the machinery reaches the drive volume');
  const pending = runtime.subsystems.subsystem_drive.pendingTransition;
  assert.equal(pending.atTick, killTick + 1, 'the transition is scheduled for the NEXT tick');
  assert.equal(pending.destroyed, true);
  // At T: nothing has fired. The bus is silent.
  assert.equal(h.events.filter((e) => e.name === 'combat:subsystemDisabled').length, 0);
  // Advance exactly one tick through the kernel's own pre-phase.
  h.state.tick += 1;
  kernel.prePhysics(DT);
  const disabled = h.events.filter((e) => e.name === 'combat:subsystemDisabled');
  assert.equal(disabled.length, 1, 'exactly one unmoor receipt, exactly one tick later');
  assert.equal(disabled[0].payload.targetId, boss.id);
  assert.equal(disabled[0].payload.subsystemId, 'subsystem_drive');
  assert.equal(runtime.subsystems.subsystem_drive.destroyed, true);
  assert.equal(runtime.capabilities.drive, false, 'the unmoored drive stops moving the hull');
});

test('Family B: an eligible shot banks off the authored prow through the receipt contract', () => {
  const h = boot();
  // The causal tap is bound by the arbiter in production (presentationOrchestrator.init); this
  // kernel-level family binds the same bus directly so the publish is observable.
  bindAttackCausalBus(h.bus);
  try {
    const { boss } = spawnBoss(h, { rot: 0 });
    assert.deepEqual(bossSurfaceAuthoringOf(boss), { arcDeg: 150, material: 'plate' },
      'a wave-materialized boss resolves its own prow truth');
    const runtime = createLineage({ spec: bank });
    const projectile = armAttackContinue({
      id: 'bolt', type: 'projectile', alive: true, radius: 0.7, ownerId: h.state.playerId,
      pos: { x: 50, z: 0 }, vel: { x: -12, z: 0 }, rot: Math.PI,
    });
    const receipt = createSurfaceContactReceipt({
      point: { x: 50, z: 0 }, normal: { x: -1, z: 0 }, velocity: { x: -12, z: 0 },
      material: 'plate', tick: 12, projectileId: 'bolt', surfaceId: boss.id,
    });
    const result = resolveLiveAttackHit({
      state: h.state, spec: bank, runtime, projectile,
      target: boss, payload: { receipt }, tick: 12,
    });
    assert.equal(result.ok, true, 'a prow contact with a bounce left continues the body');
    assert.equal(result.consume, false);
    assert.equal(runtime.budget.consumed, 1, 'exactly one lineage bounce spent');
    assert.equal(projectile.alive, true, 'the same body continues');
    const published = h.events.filter((e) => e.name === 'combat:bounceContinued');
    assert.equal(published.length, 1, 'the kernel publishes its compiled continuation');
    assert.equal(published[0].payload.projectileId, 'bolt');
    assert.equal(published[0].payload.ownerId, h.state.playerId);
    assert.equal(published[0].payload.receipt, receipt, 'the physics receipt travels with the event');
    assert.deepEqual(published[0].payload.incoming, { x: -12, z: 0 });
    assert.equal(typeof published[0].payload.outgoing.x, 'number');
  } finally {
    bindAttackCausalBus(null);
  }
});

test('Family B: the same contact through the kernel is consumed everywhere but the prow', () => {
  const h = boot();
  for (const [label, rot, point] of [
    ['stern', 0, { x: -50, z: 0 }],
    ['flank', 0, { x: 0, z: 50 }],
    ['tail', Math.PI / 2, { x: 0, z: -50 }], // behind a boss facing +Z is hull, not prow
  ]) {
    const { boss } = spawnBoss(h, { rot });
    const runtime = createLineage({ spec: bank });
    const projectile = armAttackContinue({
      id: `bolt-${label}`, type: 'projectile', alive: true, radius: 0.7, ownerId: h.state.playerId,
      pos: point, vel: { x: -point.x, z: -point.z }, rot: 0,
    });
    const receipt = createSurfaceContactReceipt({
      point, normal: { x: -Math.sign(point.x) || 0, z: -Math.sign(point.z) || 0 },
      velocity: { x: -point.x, z: -point.z },
      material: 'plate', tick: 12, projectileId: `bolt-${label}`, surfaceId: boss.id,
    });
    const result = resolveLiveAttackHit({
      state: h.state, spec: bank, runtime, projectile,
      target: boss, payload: { receipt }, tick: 12,
    });
    assert.equal(result.consume, true, `${label}: consumed as ordinary armor`);
    assert.equal(result.reason, 'boss_surface_armor', `${label}: the boss-surface gate owns the refusal`);
    assert.equal(runtime.budget.consumed, 0, `${label}: no lineage bounce spent`);
  }
  // And a direct (non-bank) runtime may not bank even on the prow: eligibility lives in the
  // lineage, the surface only answers it.
  const { boss } = spawnBoss(h, { rot: 0 });
  const runtime = createLineage({ spec: direct });
  const projectile = armAttackContinue({
    id: 'bolt-direct', type: 'projectile', alive: true, radius: 0.7, ownerId: h.state.playerId,
    pos: { x: 50, z: 0 }, vel: { x: -12, z: 0 }, rot: Math.PI,
  });
  const receipt = createSurfaceContactReceipt({
    point: { x: 50, z: 0 }, normal: { x: -1, z: 0 }, velocity: { x: -12, z: 0 },
    material: 'plate', tick: 12, projectileId: 'bolt-direct', surfaceId: boss.id,
  });
  const result = resolveLiveAttackHit({
    state: h.state, spec: direct, runtime, projectile,
    target: boss, payload: { receipt }, tick: 12,
  });
  assert.equal(result.consume, true, 'a shot with no bounce left is consumed on the prow too');
  assert.equal(runtime.budget.consumed, 0);
});

test('Family B: the arc math is deterministic and matches the armor table it shadows', () => {
  const surface = { id: 7, type: 'ship', pos: { x: 0, z: 0 }, rot: 0, data: { lootTableId: BOSS } };
  const probe = (dx, dz) => resolveBossSurfaceContact({
    surface,
    receipt: { point: { x: surface.pos.x + dx, z: surface.pos.z + dz } },
  });
  // Dead ahead and inside the half-arc (75 deg) reflect; the flank and the rear do not.
  assert.equal(probe(50, 0).response, 'reflect');
  assert.equal(probe(50 * Math.cos(Math.PI / 4), 50 * Math.sin(Math.PI / 4)).response, 'reflect');
  assert.equal(probe(0, 50).response, 'damage');
  assert.equal(probe(-50, 0).response, 'damage');
  // The same geometry, re-run, is the same verdict — no hidden state.
  assert.deepEqual(probe(50, 0), probe(50, 0));
  // Fail-closed: a broken contact point can never become a bank.
  assert.equal(resolveBossSurfaceContact({ surface, receipt: {} }).ok, false);
  assert.equal(resolveBossSurfaceContact({ surface: { id: 8 }, receipt: { point: { x: 1, z: 0 } } }).ok, false);
});

test('Family C: the unmoor publishes through the arbiter as a subsystem.disabled cue', () => {
  const h = boot();
  const cues = [];
  h.bus.on('presentation:cue', (p) => cues.push(p));
  presentationOrchestrator.init({ state: h.state, bus: h.bus });
  try {
    const { boss } = spawnBoss(h);
    let runtime = null;
    for (let i = 0; i < 20; i++) {
      sternHit(h, boss);
      runtime = runtime || bossRuntime(h, boss);
      if (runtime && runtime.subsystems.subsystem_drive.pendingTransition) break;
    }
    assert.ok(runtime, 'the stern fire materializes and reaches the drive');
    h.state.tick += 1;
    combat.ensureKernel().prePhysics(DT);
    h.bus.flush();
    assert.ok(cues.some((c) => c.id === 'subsystem.disabled' && c.targetId === boss.id),
      'the machinery failure reaches the semantic arbiter');
  } finally {
    presentationOrchestrator.dispose();
  }
});

test('identity regression: zero bounty, no loot, and the authored row is otherwise untouched', () => {
  const def = ENEMY_TYPES.find((e) => e.id === BOSS);
  assert.equal(def.bountyCr, 0, 'zero pay stays load-bearing');
  assert.equal(def.loot, null, 'no authored loot');
  assert.deepEqual(def.directionalArmor, { frontArcDeg: 150, frontMult: 0.25, rearArcDeg: 150, rearMult: 1.6 });
  assert.deepEqual(def.prowSurface, { arcDeg: 150, material: 'plate' });
  assert.equal(def.combatDoctrineId, 'brawler_commit');
  const h = boot();
  const { boss } = spawnBoss(h);
  assert.equal(boss.data.bountyCr, 0);
  assert.equal(boss.data.loot, null);
  assert.equal(boss.data.lootTableId, BOSS);
  assert.equal(boss.data.ai.combatDoctrineId, 'brawler_commit');
});
