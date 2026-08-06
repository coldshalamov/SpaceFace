import assert from 'node:assert/strict';
import { test } from 'node:test';

import { WEAPONS } from '../src/data/weapons.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

let impulseKernelPromise;
function impulseKernel() {
  impulseKernelPromise ||= import('../src/combat/impulseKernel.js').catch(() => null);
  return impulseKernelPromise;
}

let collisionConsequencesPromise;
function collisionConsequencesModule() {
  collisionConsequencesPromise ||= import('../src/systems/collisionConsequences.js').catch(() => null);
  return collisionConsequencesPromise;
}

let membraneAuditPromise;
function membraneAuditModule() {
  membraneAuditPromise ||= import('../scripts/lib/physicsMembraneAudit.mjs').catch(() => null);
  return membraneAuditPromise;
}

test('every canonical weapon declares a finite provenance-bearing impulse identity', () => {
  assert.equal(Object.hasOwn(COMBAT_FLAGS, 'weaponImpulseConsequences'), true,
    'PQ-009 application must have one mutable Tier-B combat flag');
  assert.ok(WEAPONS.length > 0, 'weapon catalog must not be empty');
  for (const weapon of WEAPONS) {
    assert.ok(Number.isFinite(weapon.impulsePerHit) && weapon.impulsePerHit > 0,
      `${weapon.id} must declare a positive impulsePerHit`);
    assert.ok(Number.isFinite(weapon.tumbleTorque) && weapon.tumbleTorque >= 0,
      `${weapon.id} must declare a finite tumbleTorque`);
    assert.match(String(weapon.impulseProvenance || ''), /^[a-z0-9_]+$/,
      `${weapon.id} must declare a stable impulseProvenance tag`);
  }
});

test('weapon impulse identities preserve the starter exemption and distinct combat families', () => {
  const byId = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
  const starter = byId.get('wpn_pulse_laser_s');
  assert.ok(starter.impulsePerHit > 0 && starter.impulsePerHit <= 1,
    'starter pulse must plink with near-zero, not absent, impulse');

  const representatives = [
    'wpn_pulse_laser_s',
    'wpn_autocannon_s',
    'wpn_beam_laser_m',
    'wpn_railgun_m',
    'wpn_missile_rack_m',
    'wpn_emp_disruptor_m',
  ].map((id) => byId.get(id));
  assert.equal(representatives.every(Boolean), true, 'representative weapon families must exist');
  assert.equal(new Set(representatives.map((weapon) => weapon.impulseProvenance)).size, representatives.length,
    'representative families need distinct provenance, not one generic impulse tag');
  assert.ok(byId.get('wpn_railgun_m').impulsePerHit > byId.get('wpn_autocannon_s').impulsePerHit,
    'railgun must exchange more momentum per hit than the small autocannon');
  assert.ok(byId.get('wpn_missile_rack_m').impulsePerHit > byId.get('wpn_pulse_laser_m').impulsePerHit,
    'explosive ordnance must not share the pulse-laser shove');
});

test('weapon impulse kernel scales continuous hits and retains authored provenance', async () => {
  const kernel = await impulseKernel();
  assert.equal(typeof kernel?.resolveWeaponImpulseForHit, 'function',
    'PQ-009 must provide resolveWeaponImpulseForHit');
  const beam = WEAPONS.find((weapon) => weapon.id === 'wpn_beam_laser_m');
  const full = kernel.resolveWeaponImpulseForHit(beam, beam.dmg);
  const tick = kernel.resolveWeaponImpulseForHit(beam, beam.dmg / 60);
  assert.equal(full.magnitude, beam.impulsePerHit);
  assert.equal(full.tumbleTorque, beam.tumbleTorque);
  assert.equal(full.provenance, beam.impulseProvenance);
  assert.ok(Math.abs(tick.magnitude - beam.impulsePerHit / 60) < 1e-12,
    'continuous beam impulse scales by the actual per-tick damage fraction');
  assert.ok(Math.abs(tick.tumbleTorque - beam.tumbleTorque / 60) < 1e-12);
});

test('collision consequence kernel turns exchanged momentum into bounded mass-aware receipts', async () => {
  const kernel = await impulseKernel();
  assert.equal(typeof kernel?.resolveCollisionConsequence, 'function',
    'PQ-009 must provide resolveCollisionConsequence');
  const provenance = {
    actorId: 1,
    weaponId: 'wpn_railgun_m',
    tag: 'railgun_penetrator',
    appliedTick: 118,
  };
  const common = {
    other: { id: 90, type: 'station', mass: 1_000_000, radius: 90 },
    exchangedMomentum: 1_200,
    tick: 120,
    provenance,
    pos: { x: 25, z: -4 },
    normal: { x: -1, z: 0 },
  };
  const light = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 2, type: 'ship', mass: 20, radius: 6 },
  });
  const heavy = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 3, type: 'ship', mass: 120, radius: 16 },
  });

  assert.equal(light.surface, 'structure');
  assert.equal(light.provenance.tag, 'railgun_penetrator');
  assert.equal(light.provenance.actorId, 1);
  assert.ok(light.deltaV > heavy.deltaV, 'the same momentum staggers a light hull more');
  assert.ok(light.staggerTicks > heavy.staggerTicks);
  assert.ok(light.impactDamage > 0, 'an energetic structure hit has a damage consequence');
  assert.ok(light.impactDamage <= kernel.COLLISION_CONSEQUENCE_LIMITS.maxDamage);
  assert.ok(light.debrisCount > 0 && light.debrisCount <= kernel.COLLISION_CONSEQUENCE_LIMITS.maxDebris);
  assert.ok(['stagger', 'tumble'].includes(light.control));
  assert.equal(kernel.resolveCollisionConsequence({ ...common, exchangedMomentum: 0,
    target: { id: 2, type: 'ship', mass: 20, radius: 6 } }), null,
  'zero momentum produces no fake consequence');
});

test('impulse provenance is transient, tick-bounded, and never stored on the entity graph', async () => {
  const kernel = await impulseKernel();
  assert.equal(typeof kernel?.recordImpulseProvenance, 'function');
  assert.equal(typeof kernel?.readRecentImpulseProvenance, 'function');
  const entity = { id: 7, data: {} };
  const recorded = kernel.recordImpulseProvenance(entity, {
    actorId: 1,
    weaponId: 'wpn_autocannon_s',
    tag: 'small_autocannon_slug',
    appliedTick: 40,
    magnitude: 28,
  });
  assert.equal(kernel.readRecentImpulseProvenance(entity, 42)?.tag, recorded.tag);
  assert.equal(kernel.readRecentImpulseProvenance(entity, 400), null, 'stale attribution expires');
  assert.deepEqual(entity, { id: 7, data: {} }, 'transient provenance never pollutes saves/entities');
});

test('weapon damage packets carry full-hit and continuous-tick impulse identity', async (t) => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });
  const weaponSystem = await import('../src/systems/weapons.js');
  assert.equal(typeof weaponSystem.buildWeaponDamagePacket, 'function',
    'weapons runtime must expose the packet builder used by projectiles and beams');
  const railgun = WEAPONS.find((weapon) => weapon.id === 'wpn_railgun_m');
  const railPacket = weaponSystem.buildWeaponDamagePacket({ defId: railgun.id }, railgun, railgun.dmg, railgun.damageType);
  assert.equal(railPacket.impulse.magnitude, railgun.impulsePerHit);
  assert.equal(railPacket.tumbleTorque, railgun.tumbleTorque);
  assert.equal(railPacket.source.weaponId, railgun.id);
  assert.equal(railPacket.source.impulseProvenance, railgun.impulseProvenance);

  const beam = WEAPONS.find((weapon) => weapon.id === 'wpn_beam_laser_m');
  const beamTick = weaponSystem.buildWeaponDamagePacket({ defId: beam.id }, beam, beam.dmg / 60, beam.damageType);
  assert.ok(Math.abs(beamTick.impulse.magnitude - beam.impulsePerHit / 60) < 1e-12);
  assert.ok(Math.abs(beamTick.tumbleTorque - beam.tumbleTorque / 60) < 1e-12);
});

test('combat routes weapon linear and tumble impulse through the authority with provenance', async (t) => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });
  const [{ buildWeaponDamagePacket }, kernelModule] = await Promise.all([
    import('../src/systems/weapons.js'),
    impulseKernel(),
  ]);
  assert.equal(typeof buildWeaponDamagePacket, 'function');
  const attacker = combatShip(1, 0, 0);
  const target = combatShip(2, 1, 40);
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    entities: new Map([[attacker.id, attacker], [target.id, target]]),
    entityList: [attacker, target],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 47 },
  };
  const applied = [];
  const torqued = [];
  const helpers = {
    combatPhysics: {
      applyImpulse(input) { applied.push(structuredClone(input)); return true; },
      applyTorqueImpulse(input) { torqued.push(structuredClone(input)); return true; },
    },
  };
  const kernel = createCombatKernel({ state, bus: createBus(), helpers, registry: { get: () => null } });
  const railgun = WEAPONS.find((weapon) => weapon.id === 'wpn_railgun_m');
  const packet = buildWeaponDamagePacket({ defId: railgun.id }, railgun, railgun.dmg, railgun.damageType);
  packet.hit = {
    pos: { x: target.pos.x, z: target.pos.z + target.radius * 0.75 },
    approach: { x: 1, z: 0 },
    normal: { x: -1, z: 0 },
  };
  const result = kernel.routeDamage({
    attackerId: attacker.id,
    targetId: target.id,
    packet,
    origin: { kind: 'weapon', id: railgun.id, weaponId: railgun.id },
  });

  assert.equal(result.ok, true);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].entityId, target.id);
  assert.equal(applied[0].reason, 'weapon_hit');
  assert.equal(applied[0].tick, state.tick);
  assert.equal(applied[0].provenance.tag, railgun.impulseProvenance);
  assert.equal(applied[0].provenance.actorId, attacker.id);
  assert.ok(Math.abs(applied[0].impulse.x - railgun.impulsePerHit) < 1e-12);
  assert.ok(Math.abs(applied[0].impulse.z) < 1e-12);
  assert.equal(torqued.length, 1, 'off-center authored hit routes angular impulse separately');
  assert.equal(torqued[0].entityId, target.id);
  assert.equal(torqued[0].reason, 'weapon_hit_tumble');
  assert.ok(Math.abs(torqued[0].impulse.y) > 0);
  assert.equal(kernelModule.readRecentImpulseProvenance(target, state.tick)?.tag, railgun.impulseProvenance);
});

test('SG-02 combat port exposes angular impulse without leaking the dynamic owner', async () => {
  const { createSg02CombatPhysicsPort } = await import('../src/core/sg02DynamicBodyOwner.js');
  const calls = [];
  const owner = {
    applyImpulse(input) { calls.push(['linear', input]); return true; },
    applyTorqueImpulse(input) { calls.push(['angular', input]); return true; },
    createAttachment() { return true; },
    setAttachmentReel() { return true; },
    cutAttachment() { return true; },
    getAttachmentTelemetry() { return null; },
  };
  const port = createSg02CombatPhysicsPort(owner);
  assert.equal(typeof port.applyTorqueImpulse, 'function');
  assert.equal(port.applyTorqueImpulse({ entityId: 2, impulse: { y: 8 } }), true);
  assert.equal(calls[0][0], 'angular');
});

test('SG-02 reports deterministic bounded contact momentum for default-route consequences', async () => {
  const { createSg02DynamicBodyOwner } = await import('../src/core/sg02DynamicBodyOwner.js');
  const owner = await createSg02DynamicBodyOwner({
    fixedDt: 1 / 60,
    publishTelemetry: false,
    captureContactImpacts: true,
  });
  try {
    const ship = physicsEntity(1, 'ship', -16, 120, 5, 20);
    const station = physicsEntity(2, 'station', 0, 0, 10, 1_000_000);
    owner.syncFromEntities([ship, station]);
    assert.equal(owner.applyTorqueImpulse({ entityId: ship.id, impulse: { y: 20 } }), true);
    assert.equal(typeof owner.drainContactImpacts, 'function',
      'dynamic owner must expose contact receipts to the physics/event membrane');
    owner.step(1 / 60);
    assert.ok(Math.abs(ship.angVel) > 0, 'the SG-02 owner physically applies the angular impulse');
    owner.step(1 / 60);
    const contacts = owner.drainContactImpacts();
    assert.equal(contacts.length, 1, 'one body pair produces one merged contact receipt');
    assert.deepEqual(new Set([contacts[0].aId, contacts[0].bId]), new Set([ship.id, station.id]));
    assert.ok(contacts[0].impulse > 0 && contacts[0].impulse <= ship.mass * 40 + 1e-9,
      'reported contact momentum respects SG-02 structural-give bounds');
    assert.ok(Number.isFinite(contacts[0].pos.x) && Number.isFinite(contacts[0].pos.z));
    assert.ok(Math.abs(Math.hypot(contacts[0].normal.x, contacts[0].normal.z) - 1) < 1e-9);
    assert.deepEqual(owner.drainContactImpacts(), [], 'contact drain is atomic');
  } finally {
    owner.dispose();
  }
});

test('default physics adapter forwards angular impulse and publishes consequence-ready SG-02 impacts', async () => {
  const { physics } = await import('../src/core/physics.js');
  const bus = createBus();
  const helpers = {};
  const ship = physicsEntity(11, 'ship', -8, 0, 5, 20);
  const rock = physicsEntity(12, 'asteroid', 0, 0, 10, 1_000_000);
  const state = {
    tick: 77,
    playerId: 99,
    entities: new Map([[ship.id, ship], [rock.id, rock]]),
    entityList: [ship, rock],
  };
  const torqueCalls = [];
  const impacts = [];
  bus.on('physics:impact', (payload) => impacts.push(payload));
  physics.init({ state, bus, helpers });
  physics._sg02 = {
    applyTorqueImpulse(input) { torqueCalls.push(input); return true; },
    drainContactImpacts() {
      return [{
        schemaVersion: 1,
        tick: 2,
        aId: ship.id,
        bId: rock.id,
        impulse: 640,
        pos: { x: -2, z: 1 },
        normal: { x: -1, z: 0 },
      }];
    },
    dispose() {},
  };
  try {
    assert.equal(typeof helpers.combatPhysics.applyTorqueImpulse, 'function',
      'the live deferred port must expose the SG-02 angular operation');
    assert.equal(helpers.combatPhysics.applyTorqueImpulse({ entityId: ship.id, impulse: { y: 12 } }), true);
    assert.equal(torqueCalls.length, 1);
    assert.equal(typeof physics._emitSg02ContactImpacts, 'function',
      'the default physics system must bridge owner contact receipts onto the event bus');
    physics._emitSg02ContactImpacts(state);
    assert.equal(impacts.length, 1);
    assert.equal(impacts[0].aId, ship.id);
    assert.equal(impacts[0].bId, rock.id);
    assert.equal(impacts[0].consequenceKernelVersion, 1);
    assert.equal(impacts[0].backend, 'rapier-dynamic');
    assert.equal(impacts[0].tick, state.tick,
      'game-state tick, not the owner-local lifetime tick, anchors provenance and control expiry');
    assert.deepEqual(impacts[0].normal, { x: -1, z: 0 });
    assert.ok(impacts[0].dp > 0);
  } finally {
    physics._disableSg02DynamicAuthority();
    bus.clear();
  }
});

test('collision consequence runtime captures weapon setup into one terrain tumble receipt', async (t) => {
  const previousFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previousFlag; });
  const [module, impulse] = await Promise.all([collisionConsequencesModule(), impulseKernel()]);
  assert.ok(module?.collisionConsequences,
    'PQ-009 must provide the collisionConsequences runtime system');
  const system = module.collisionConsequences;
  const bus = createBus();
  const attacker = combatShip(1, 0, -80);
  const target = combatShip(2, 1, 0);
  const terrain = physicsEntity(3, 'asteroid', 12, 0, 18, 1_000_000);
  target.mass = 20;
  target.radius = 6;
  target.data.intent = { fire: true, moveX: 1, moveZ: -1 };
  const state = {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: attacker.id,
    entities: new Map([[attacker.id, attacker], [target.id, target], [terrain.id, terrain]]),
    entityList: [attacker, target, terrain],
    combat: { beams: [], threatTables: new Map() },
  };
  const routed = [];
  const scheduled = [];
  const receipts = [];
  const debris = [];
  const kernel = {
    routeDamage(input) { routed.push(input); return { ok: true, totalApplied: input.packet.channels.kinetic }; },
    statuses: {
      schedule(...args) { scheduled.push(args); return { ok: true }; },
    },
    catalog: createCombatCatalog(),
  };
  const registry = { get(name) { return name === 'combat' ? { kernel } : null; } };
  bus.on('combat:collisionConsequence', (payload) => receipts.push(payload));
  bus.on('combat:collisionDebris', (payload) => debris.push(payload));
  system.init({ state, bus, registry, helpers: {} });
  try {
    impulse.recordImpulseProvenance(target, {
      actorId: attacker.id,
      weaponId: 'wpn_railgun_m',
      tag: 'railgun_penetrator',
      appliedTick: 118,
      magnitude: 120,
    });
    const impact = {
      aId: target.id,
      bId: terrain.id,
      dp: 800,
      impulse: 800,
      tick: state.tick,
      pos: { x: 6, z: 0 },
      normal: { x: -1, z: 0 },
      consequenceKernelVersion: 1,
      backend: 'rapier-dynamic',
    };
    bus.emit('physics:impact', impact);
    bus.emit('physics:impact', impact);

    assert.equal(receipts.length, 1, 'one contact episode yields one consequence receipt');
    assert.equal(receipts[0].targetId, target.id);
    assert.equal(receipts[0].surface, 'terrain');
    assert.equal(receipts[0].control, 'tumble');
    assert.equal(receipts[0].provenance.actorId, attacker.id);
    assert.equal(receipts[0].provenance.tag, 'railgun_penetrator');
    assert.equal(routed.length, 1, 'terrain consequence damage routes once through combat');
    assert.equal(routed[0].attackerId, attacker.id);
    assert.equal(routed[0].targetId, target.id);
    assert.equal(routed[0].packet.source.kind, 'collision_terrain');
    assert.ok(routed[0].packet.channels.kinetic > 0);
    assert.equal(scheduled.length, 1, 'tumble blocks combat actions through the status owner');
    assert.equal(scheduled[0][2].id, 'status_tumbling');
    assert.equal(scheduled[0][2].data.kind, 'collision_tumble',
      'collision status must not masquerade as a Massline-owned physical tumble');
    assert.equal(debris.length, 1, 'terrain damage publishes its deterministic debris receipt');
    assert.equal(debris[0].count, receipts[0].debrisCount);

    state.tick++;
    system.update(1 / 60, state);
    const command = consumePhysicsCommand(target);
    assert.equal(command.control.mode, 'collision_tumble');
    assert.deepEqual(command.control.force, { x: 0, y: 0, z: 0 });
    assert.equal(command.torqueImpulses.length, 1,
      'tumble enters through the angular physics-command membrane');
    assert.equal(target.data.intent.fire, false);
    assert.equal(target.data.intent.moveX, 0);
    assert.equal(target.data.intent.moveZ, 0);

    const playerImpact = { ...impact, aId: attacker.id, bId: terrain.id, tick: state.tick };
    bus.emit('physics:impact', playerImpact);
    assert.equal(routed.length, 1, 'physical impacts preserve the existing no-player-hull-damage invariant');

    bus.emit('game:newGame');
    state.tick = 0;
    bus.emit('physics:impact', { ...impact, tick: state.tick });
    assert.equal(routed.length, 2,
      'new-game tick reset must clear pair cooldowns instead of suppressing future collisions');
  } finally {
    system.destroy();
    bus.clear();
  }
});

test('collision consequences are live on the default route at the last control-writer slot', async () => {
  const { createRegistry } = await import('../src/core/registry.js');
  const registry = createRegistry({
    state: {
      settings: { gameplay: { aiBackend: 'sg06-tactical', flightBackend: 'v3', physicsBackend: 'rapier-dynamic' } },
    },
  });
  const systems = registry.systems.map((system) => system.name);
  const updates = registry.updateOrder.map((system) => system.name);
  assert.ok(systems.includes('collisionConsequences'),
    'the consequence owner must initialize on the shipped route');
  const consequenceIndex = updates.indexOf('collisionConsequences');
  assert.ok(consequenceIndex > updates.indexOf('aiPorts'),
    'collision loss-of-control must overwrite the AI command for this tick');
  assert.ok(consequenceIndex < updates.indexOf('weapons'),
    'collision loss-of-control must clear fire before weapons consume intent');
});

test('PQ-009 impact events do not also take the legacy Massline tumble-damage path', async () => {
  const [{ masslineImpactDamage }, { MASSLINE2_FLAGS }] = await Promise.all([
    import('../src/systems/masslineImpactDamage.js'),
    import('../src/data/featureFlags.js'),
  ]);
  const previous = {
    enabled: MASSLINE2_FLAGS.enabled,
    tumble: MASSLINE2_FLAGS.tumble,
    impactDamage: MASSLINE2_FLAGS.impactDamage,
  };
  Object.assign(MASSLINE2_FLAGS, { enabled: true, tumble: true, impactDamage: true });
  const bus = createBus();
  const target = combatShip(21, 1, 0);
  const state = {
    tick: 5,
    playerId: 1,
    entities: new Map([[target.id, target]]),
    combat: {
      entities: {
        [String(target.id)]: {
          statuses: {
            status_tumbling: { id: 'status_tumbling', data: { kind: 'massline_tumble' } },
          },
          pendingStatuses: [],
        },
      },
    },
  };
  const routed = [];
  const system = Object.create(masslineImpactDamage);
  system.init({
    state,
    bus,
    registry: { get: () => ({ kernel: { routeDamage(input) { routed.push(input); return { ok: true }; } } }) },
  });
  try {
    bus.emit('physics:impact', {
      aId: target.id,
      bId: 99,
      dp: 5000,
      pos: { x: 0, z: 0 },
      consequenceKernelVersion: 1,
    });
    assert.equal(routed.length, 0,
      'the universal consequence owner supersedes legacy tumble contact damage for marked impacts');
  } finally {
    system.destroy();
    Object.assign(MASSLINE2_FLAGS, previous);
    bus.clear();
  }
});

test('new-path membrane audit fails closed on an injected direct velocity write', async () => {
  const module = await membraneAuditModule();
  assert.equal(typeof module?.auditPhysicsMembraneSources, 'function',
    'PQ-009 must provide the reusable source membrane audit');
  const clean = module.auditPhysicsMembraneSources([{
    path: 'clean.js',
    source: 'combatPhysics.applyImpulse({ entityId: target.id, impulse });',
  }]);
  assert.deepEqual(clean, []);

  const directAxisWrite = module.auditPhysicsMembraneSources([{
    path: 'injected-axis.js',
    source: 'function cheat(target) { target.vel.x += 1; }',
  }]);
  assert.equal(directAxisWrite.length, 1,
    'an injected target.vel.x write must make the contract red');
  assert.equal(directAxisWrite[0].code, 'direct-velocity-write');

  const directVectorWrite = module.auditPhysicsMembraneSources([{
    path: 'injected-vector.js',
    source: 'entity.velocity = { x: 4, z: 0 };',
  }]);
  assert.equal(directVectorWrite.length, 1,
    'replacing the velocity vector must also fail closed');
});

function combatShip(id, team, x) {
  return {
    id, type: 'ship', alive: true, team, factionId: `faction_test_${team}`,
    pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 10, mass: 20,
    hull: 500, hullMax: 500,
    armorHp: 0, armorMax: 0, armorFlat: 0,
    shield: 0, shieldMax: 0,
    cap: 100, capMax: 100, capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: { derived: { damageReductionMult: 1 }, combatProfileId: 'combat_profile_standard_ship' },
  };
}

function physicsEntity(id, type, x, vx, radius, mass) {
  return {
    id, type, alive: true, collides: true,
    pos: { x, z: 0 }, vel: { x: vx, z: 0 },
    rot: 0, angVel: 0, radius, mass, flags: {}, data: {},
  };
}
