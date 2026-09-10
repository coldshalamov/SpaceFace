import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createTetherWebs, WEB_LIMITS, WEB_WEAPON_ID } from '../src/combat/tetherWebs.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { crucibleSetupFor } from '../src/ui/crucibleLaunch.js';
import { COMBAT_LAB_STARTER_PACKAGES } from '../src/data/combatLabSetups.js';
import { outfitBudgetForFittings } from '../src/systems/ships.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';

test('arcade starters resolve through the real setup and fitting budgets', () => {
  for (const starter of COMBAT_LAB_STARTER_PACKAGES) {
    const setup = crucibleSetupFor({ starterId: starter.id, seed: 4242 });
    assert.equal(setup.ok, true, `${starter.id}: ${JSON.stringify(setup.issues)}`);
    const fittings = [];
    for (const item of starter.loadout) fittings[item.slotIndex] = item.defId;
    assert.equal(outfitBudgetForFittings(starter.hullId, fittings).fits, true, starter.id);
  }
});

function entity(id, x, z, team = 2) {
  return { id, type: 'ship', alive: true, team, pos: { x, z }, vel: { x: 0, z: 0 },
    physicsBody: { schemaVersion: 1, radius: 8, mass: 16, inertiaY: 128, dynamic: true, ccd: true, revision: 0 },
    rot: 0, radius: 8, mass: 16, data: {} };
}

test('escape traps drop behind motion, consume cargo, arm before triggering, and expire', () => {
  const player = entity(1, 0, 0, 1);
  player.vel.z = 100; // Moving sideways to nose and aiming elsewhere.
  const foe = entity(2, 0, -30);
  const state = { simTime: 0, tick: 0, playerId: 1, entities: new Map([[1, player], [2, foe]]),
    entityList: [player, foe], input: { aimWorld: { x: 100, z: 0 }, actions: { chargeThrow: true } },
    ui: { screenStack: [] }, player: { activeShipIndex: 0,
      ownedShips: [{ fittings: ['mod_repulsion_trap_s'] }],
      cargo: { items: { cmdty_impulse_charge: 2 }, usedVolume: 4, usedMass: 4, capVolume: 40, capMass: 60 } } };
  const system = Object.create(impulseCharges);
  system.state = state; system.bus = createBus();
  system.helpers = { spawnEntity(spec) {
    const e = { ...spec, id: 3, alive: true }; state.entities.set(3, e); state.entityList.push(e); return e;
  } };
  const detonations = [];
  system._detonateOne = (e, d, owner, s, trigger) => { detonations.push(trigger); e.alive = false; };
  system._handleThrow(player, { throwCdT: 0 }, state);
  const trap = state.entities.get(3);
  assert.ok(trap.pos.z < 0 && Math.abs(trap.pos.x) < 1e-6);
  assert.deepEqual({ x: trap.vel.x, z: trap.vel.z }, { x: 0, z: 0 });
  assert.equal(state.player.cargo.items.cmdty_impulse_charge, 1);
  system._tickCharges(1 / 60, state);
  assert.equal(detonations.length, 0, 'an enemy already in range cannot trigger an unarmed trap');
  state.simTime = 0.6;
  system._tickCharges(1 / 60, state);
  assert.deepEqual(detonations, ['proximity']);
  trap.alive = true; state.simTime = 23;
  system._tickCharges(1 / 60, state);
  assert.equal(trap.alive, false);
  assert.equal(detonations.length, 1, 'expiration does not create a surprise blast');
});

test('Snarl creates real enemy-to-enemy attachment joints and releases them on expiration', () => {
  const player = entity(1, -50, 0, 1);
  const targets = [entity(2, 0, 0), entity(3, 45, 0), entity(4, 85, 0), entity(5, 110, 0)];
  const state = { tick: 1, simTime: 0, playerId: 1, entityList: [player, ...targets] };
  state.entities = new Map(state.entityList.map(e => [e.id, e]));
  ensureCombatState(state);
  const bus = createBus();
  const joints = [], cuts = [];
  const physics = { createAttachment(spec) { joints.push(spec); return { id: joints.length }; },
    cutAttachment(spec) { cuts.push(spec); return true; }, setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return { tension: 0, impulse: 0, yank: 0 }; } };
  const service = createAttachmentService({ state, bus, catalog: createCombatCatalog(), helpers: { combatPhysics: physics } });
  const web = createTetherWebs({ state, bus, registry: { get: () => ({ kernel: { attachments: service } }) } });
  bus.emit('projectile:hit', { weaponId: WEB_WEAPON_ID, targetId: 2, ownerId: 1 });
  assert.equal(joints.length, 0, 'physics collision callbacks only enqueue the attachment request');
  web.update();
  const active = Object.values(state.combat.attachments.byId).filter(a => a.state === 'active');
  assert.equal(active.length, 3);
  assert.ok(active.every(a => a.ownerId !== 1 && a.targetId !== 1 && a.controllerId === 1));
  assert.ok(active.every(a => a.restLength > 0));
  bus.emit('projectile:hit', { weaponId: WEB_WEAPON_ID, targetId: 2, ownerId: 1 });
  web.update();
  assert.equal(joints.length, 3, 'repeat impacts cannot duplicate an existing web pair');
  state.simTime = WEB_LIMITS.lifetimeS + 0.1; web.update();
  assert.equal(cuts.length, 3);
  web.destroy();
});

test('Snarl physically restrains opposing hull momentum through Rapier', async () => {
  const player = entity(1, -300, 0, 1);
  const a = entity(2, -25, 0), b = entity(3, 25, 0);
  a.vel.x = -100; b.vel.x = 100;
  const state = { tick: 1, simTime: 0, playerId: 1, entityList: [player, a, b] };
  state.entities = new Map(state.entityList.map(e => [e.id, e]));
  ensureCombatState(state);
  const physics = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic', fixedDt: 1 / 60 });
  const bus = createBus();
  const service = createAttachmentService({ state, bus, catalog: createCombatCatalog(),
    helpers: { combatPhysics: createSg02CombatPhysicsPort(physics) } });
  const web = createTetherWebs({ state, bus, registry: { get: () => ({ kernel: { attachments: service } }) } });
  try {
    physics.syncFromEntities(state.entityList);
    bus.emit('projectile:hit', { weaponId: WEB_WEAPON_ID, targetId: a.id, ownerId: player.id });
    web.update();
    assert.equal(Object.keys(state.combat.attachments.byId).length, 1);
    for (let i = 0; i < 60; i++) physics.step(1 / 60);
    const separation = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    assert.ok(separation < 110, `a real web arrests the 200 WU/s separation: ${separation}`);
    assert.ok(Math.abs(a.vel.x + b.vel.x) < 1, 'equal opposite hull momenta cancel without invented thrust');
  } finally { web.destroy(); physics.dispose(); }
});

test('a radial blast flings real bodies and primed destruction cooks off once with original credit', async () => {
  const player = entity(1, -300, 0, 1);
  const a = entity(2, -22, 0), b = entity(3, 22, 0);
  a.maxSpeed = b.maxSpeed = 100;
  const state = { tick: 1, simTime: 0, mode: 'flight', playerId: 1, entityList: [player, a, b] };
  state.entities = new Map(state.entityList.map(e => [e.id, e]));
  const physics = await createSg02DynamicBodyOwner({ mode: 'rapier-dynamic', fixedDt: 1 / 60 });
  const bus = createBus(); const system = Object.create(impulseCharges);
  system.init({ state, bus, helpers: { combatPhysics: createSg02CombatPhysicsPort(physics) } });
  const damage = []; system._routeDamage = request => damage.push(request);
  try {
    physics.syncFromEntities(state.entityList);
    physics.step(1 / 60); // Publish new collider mass before applying a combat impulse.
    const blast = system._blastVictims(state, { pos: { x: 0, z: 0 }, ownerId: 1, radius: 105,
      impulse: 2400, damage: 16, sourceId: 9, link: 1 });
    assert.deepEqual(blast.hits, [2, 3]);
    assert.ok(physics.records.get(a.id).body.linvel().x < -40,
      JSON.stringify({ beforeStep: physics.records.get(a.id).body.linvel(), spec: physics.records.get(a.id).spec }));
    physics.step(1 / 60);
    assert.ok(a.vel.x < -40 && b.vel.x > 40, `both hulls fly outward through physics: ${a.vel.x}, ${b.vel.x}`);
    assert.equal(system._primed.get(a)?.byId, 1, 'blast carrier does not steal player attribution');
    a.alive = false;
    bus.emit('entity:killed', { id: a.id, killerId: 1 });
    bus.emit('entity:killed', { id: a.id, killerId: 1 });
    const pops = [];
    bus.on('chain:detonated', p => pops.push(p));
    system._tickChain(state);
    assert.equal(pops.length, 1, 'one hull death produces one bounded secondary blast');
    assert.ok(damage.every(d => d.attackerId === 1));
    system._tickChain(state);
    assert.equal(pops.length, 1);
  } finally { system.destroy(); physics.dispose(); }
});
