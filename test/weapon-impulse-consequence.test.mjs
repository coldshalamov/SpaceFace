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
  // 2026-09-03 (design/VISION.md "slam them into asteroids"): a HARD terrain/structure slam —
  // deltaV at or above tumbleDeltaV — takes the helm regardless of provenance; the rock does the
  // work. 1,200 momentum on a 20-mass hull is deltaV 60, a slam. The same momentum on a 120-mass
  // hull is deltaV 10, below the threshold: helm-neutral.
  assert.equal(light.control, 'tumble',
    'a hard structure slam tumbles a light hull');
  assert.equal(heavy.control, 'none',
    'the same momentum is a shrug for a heavy hull');
  assert.ok(light.staggerTicks > 0);
  const craftLight = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 12, type: 'ship', mass: 20, radius: 6 },
    other: { id: 1, type: 'ship', mass: 20, radius: 6 },
  });
  const craftHeavy = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 13, type: 'ship', mass: 120, radius: 16 },
    other: { id: 2, type: 'ship', mass: 20, radius: 6 },
  });
  assert.ok(craftLight.deltaV > craftHeavy.deltaV,
    'craft-on-craft stagger stays mass-aware');
  assert.ok(['stagger', 'tumble'].includes(craftLight.control),
    'a hard combat-attributed craft contact still takes the helm');
  assert.ok(craftLight.staggerTicks > craftHeavy.staggerTicks,
    'lighter hulls stagger longer from the same exchanged momentum');
  assert.ok(light.impactDamage > 0, 'an energetic structure hit has a damage consequence');
  // U11: light hulls use a mass-relative ceiling above the medium-class maxDamage so committed
  // slams can finish thin targets; medium/heavy stay at or below maxDamage.
  const limits = kernel.COLLISION_CONSEQUENCE_LIMITS;
  const massRelativeCap = (mass) => limits.maxDamage * Math.max(
    limits.maxDamageMassFloor,
    Math.min(limits.maxDamageMassBoost, limits.damageMassRef / mass),
  );
  assert.ok(light.impactDamage <= massRelativeCap(20),
    'light impact stays within the mass-relative damage ceiling');
  assert.ok(heavy.impactDamage <= limits.maxDamage,
    'heavy impact stays within the medium-class universal damage ceiling');
  assert.ok(light.debrisCount > 0 && light.debrisCount <= limits.maxDebris);
  // A scrape: 300 momentum on a 20-mass hull is deltaV 15 — above the damage threshold, below the
  // tumble threshold. It scuffs the hull and keeps the helm, tag or no tag.
  const scrape = kernel.resolveCollisionConsequence({
    ...common,
    exchangedMomentum: 300,
    provenance: undefined,
    other: { id: 91, type: 'asteroid', mass: 1_000_000, radius: 40 },
    target: { id: 7, type: 'ship', mass: 20, radius: 6 },
  });
  assert.equal(scrape.control, 'none',
    'ordinary environment scrapes must not tumble or stagger the helm');
  assert.equal(scrape.staggerTicks, 0);
  assert.ok(scrape.impactDamage > 0, 'a scrape can still damage without turning the ship');
  // A hard slam with NO provenance at all: the asteroid takes the helm by itself.
  const hardSlam = kernel.resolveCollisionConsequence({
    ...common,
    provenance: undefined,
    other: { id: 93, type: 'asteroid', mass: 1_000_000, radius: 40 },
    target: { id: 9, type: 'ship', mass: 20, radius: 6 },
  });
  assert.equal(hardSlam.control, 'tumble', 'a hard asteroid slam tumbles the ship without any weapon tag');
  assert.ok(hardSlam.staggerTicks > 0 && hardSlam.impactDamage > 0);
  // The regression the scrape rule exists for: an NPC shot moments ago carries a weapon tag, and
  // the next asteroid graze (100 momentum on an 8-mass drone: deltaV 12.5) must read as a scrape,
  // not as a combat concussion.
  const contaminatedScrape = kernel.resolveCollisionConsequence({
    ...common,
    exchangedMomentum: 100,
    other: { id: 92, type: 'asteroid', mass: 1_000_000, radius: 40 },
    target: { id: 8, type: 'drone', mass: 8, radius: 4 },
  });
  assert.equal(contaminatedScrape.control, 'none',
    'a stale weapon tag on the victim must not let an asteroid bump stagger or tumble');
  assert.ok(contaminatedScrape.impactDamage > 0,
    'the same graze keeps its terrain damage payoff');
  const ordinaryCraft = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 4, type: 'ship', mass: 20, radius: 6 },
    other: { id: 1, type: 'ship', mass: 20, radius: 6 },
  });
  const platedCraft = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 5, type: 'ship', mass: 20, radius: 6 },
    other: { id: 1, type: 'ship', mass: 20, radius: 6 },
    craftDamageMultiplier: 1.8,
  });
  assert.ok(Math.abs(ordinaryCraft.impactDamage / light.impactDamage - 0.6) < 1e-12,
    'ordinary energetic craft contact applies the 0.6 baseline exactly');
  assert.ok(platedCraft.impactDamage > ordinaryCraft.impactDamage,
    'an explicit Ram Plate multiplier makes the same craft impact stronger');
  assert.ok(platedCraft.impactDamage <= massRelativeCap(20),
    'plated craft impact remains bounded by the mass-relative damage ceiling');
  assert.ok(Math.abs(platedCraft.impactDamage / ordinaryCraft.impactDamage - 1.8) < 1e-12,
    'Ram Plate scales the craft baseline exactly once');
  const masslineOwnedCraft = kernel.resolveCollisionConsequence({
    ...common,
    target: { id: 6, type: 'ship', mass: 20, radius: 6 },
    other: { id: 1, type: 'ship', mass: 20, radius: 6 },
    suppressCraftDamage: true,
  });
  assert.equal(masslineOwnedCraft.impactDamage, 0,
    'an established Massline whip contact can retain control feedback without a baseline craft packet');
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
    let contacts = owner.drainContactImpacts();
    for (let step = 0; step < 6 && contacts.length === 0; step++) {
      owner.step(1 / 60);
      contacts = owner.drainContactImpacts();
    }
    assert.equal(contacts.length, 1, 'one body pair produces one merged contact receipt');
    assert.deepEqual(new Set([contacts[0].aId, contacts[0].bId]), new Set([ship.id, station.id]));
    assert.ok(contacts[0].impulse > 0 && contacts[0].impulse <= ship.mass * 40 + 1e-9,
      'reported contact momentum respects SG-02 structural-give bounds');
    assert.ok(Number.isFinite(contacts[0].pos.x) && Number.isFinite(contacts[0].pos.z));
    assert.ok(Math.abs(Math.hypot(contacts[0].normal.x, contacts[0].normal.z) - 1) < 1e-9);
    assert.equal(contacts[0].causalActorId, ship.id,
      'SG-02 retains the moving hull as the pre-solver direct-contact initiator');
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
        causalActorId: ship.id,
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
    assert.equal(impacts[0].causalActorId, ship.id,
      'the adapter does not discard SG-02 direct-contact attribution');
    assert.ok(impacts[0].dp > 0);
  } finally {
    physics._disableSg02DynamicAuthority();
    bus.clear();
  }
});

test('custom and SG-02 contacts agree on fair pre-contact initiators and fail closed on ties', async () => {
  const [{ physics }, { createSg02DynamicBodyOwner, directContactCausalActorId }] = await Promise.all([
    import('../src/core/physics.js'),
    import('../src/core/sg02DynamicBodyOwner.js'),
  ]);
  assert.equal(directContactCausalActorId(1, 2, 50, 0, 100, 0, 1, 0), null,
    'a faster separating lead body cannot turn a solver/CCD correction into player causality');
  assert.equal(directContactCausalActorId(1, 2, 0, 80, 0, -40, 1, 0), null,
    'pure tangential motion has no normal closure and therefore no direct-contact initiator');
  assert.equal(directContactCausalActorId(1, 2, 75, 0, 75, 0, 1, 0), null,
    'matched same-direction drift is non-closing even though A has positive world-space speed');
  const scenarios = [
    { label: 'moving A into stationary B', aVx: 120, bVx: 0, expected: 1 },
    { label: 'stationary A struck by moving B', aVx: 0, bVx: -120, expected: 2 },
    { label: 'equal head-on closing contributions', aVx: 60, bVx: -60, expected: null },
  ];

  for (const scenario of scenarios) {
    const customA = physicsEntity(1, 'ship', -8, scenario.aVx, 10, 20);
    const customB = physicsEntity(2, 'ship', 8, scenario.bVx, 10, 20);
    const customState = {
      tick: 12,
      playerId: customA.id,
      entities: new Map([[customA.id, customA], [customB.id, customB]]),
      entityList: [customA, customB],
    };
    const customBus = createBus();
    const customImpacts = [];
    customBus.on('physics:impact', (payload) => customImpacts.push(payload));
    physics.init({ state: customState, bus: customBus, helpers: {} });
    physics.resolvePair(customA, customB, 16, 16, 0, customBus, customState);
    assert.equal(customImpacts.length, 1, `${scenario.label}: custom emits one impact`);
    assert.equal(customImpacts[0].causalActorId, scenario.expected, `${scenario.label}: custom attribution`);
    physics._disableSg02DynamicAuthority();
    customBus.clear();

    const owner = await createSg02DynamicBodyOwner({
      fixedDt: 1 / 60,
      publishTelemetry: false,
      captureContactImpacts: true,
    });
    try {
      const rapierA = physicsEntity(1, 'ship', -8, scenario.aVx, 10, 20);
      const rapierB = physicsEntity(2, 'ship', 8, scenario.bVx, 10, 20);
      owner.syncFromEntities([rapierA, rapierB]);
      let contacts = [];
      for (let step = 0; step < 3 && contacts.length === 0; step++) {
        owner.step(1 / 60);
        contacts = owner.drainContactImpacts();
      }
      assert.equal(contacts.length, 1, `${scenario.label}: SG-02 emits one merged impact`);
      assert.equal(contacts[0].causalActorId, scenario.expected, `${scenario.label}: SG-02 attribution`);
      assert.equal(contacts[0].causalActorId, customImpacts[0].causalActorId,
        `${scenario.label}: custom/Rapier parity`);
    } finally {
      owner.dispose();
    }
  }
});

test('collision consequence runtime keeps weapon-attributed terrain SCRAPES helm-neutral', async (t) => {
  const previousFlags = {
    weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences,
    whipDamage: COMBAT_FLAGS.whipDamage,
  };
  Object.assign(COMBAT_FLAGS, { weaponImpulseConsequences: true, whipDamage: true });
  t.after(() => { Object.assign(COMBAT_FLAGS, previousFlags); });
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
    // 2026-09-03: a HARD terrain slam now tumbles regardless of provenance (design/VISION.md
    // "slam them into asteroids"; kernel-level coverage above). The regression this runtime test
    // guards is narrower and still true: a freshly shot hull that merely SCRAPES terrain keeps
    // its helm. 240 momentum on a 20-mass hull is deltaV 12 — damaging, below the tumble line.
    const scrape = { ...impact, dp: 240, impulse: 240 };
    bus.emit('physics:impact', scrape);
    bus.emit('physics:impact', scrape);

    assert.equal(receipts.length, 1, 'one contact episode yields one consequence receipt');
    assert.equal(receipts[0].targetId, target.id);
    assert.equal(receipts[0].surface, 'terrain');
    assert.equal(receipts[0].control, 'none',
      'a terrain scrape must not stagger or tumble a freshly shot hull');
    assert.equal(receipts[0].staggerTicks, 0);
    assert.equal(receipts[0].provenance.actorId, attacker.id);
    assert.equal(receipts[0].provenance.tag, 'railgun_penetrator');
    assert.equal(routed.length, 1, 'terrain consequence damage routes once through combat');
    assert.equal(routed[0].attackerId, attacker.id);
    assert.equal(routed[0].targetId, target.id);
    assert.equal(routed[0].packet.source.kind, 'collision_terrain');
    assert.ok(routed[0].packet.channels.kinetic > 0);
    assert.equal(scheduled.length, 0,
      'no tumbling status is scheduled for a terrain scrape');
    assert.equal(debris.length, 1, 'terrain damage publishes its deterministic debris receipt');
    assert.equal(debris[0].count, receipts[0].debrisCount);

    state.tick++;
    system.update(1 / 60, state);
    const command = consumePhysicsCommand(target);
    assert.ok(!command || command.control.mode !== 'collision_tumble',
      'the runtime writes no collision_tumble control for a terrain scrape');
    assert.equal(target.data.intent.fire, true,
      'the AI keeps its helm through an environment bump');
    assert.equal(target.data.intent.moveX, 1);
    assert.equal(target.data.intent.moveZ, -1);

    const playerImpact = { ...impact, aId: attacker.id, bId: terrain.id, tick: state.tick };
    bus.emit('physics:impact', playerImpact);
    assert.equal(routed.length, 1, 'physical impacts preserve the existing no-player-hull-damage invariant');

    attacker.data.derived.ramDamageDealtMult = 1.8;
    state.tick += 30;
    bus.emit('physics:impact', {
      ...impact,
      aId: target.id,
      bId: attacker.id,
      tick: state.tick,
      causalActorId: attacker.id,
    });
    assert.equal(routed.length, 2);
    assert.equal(routed[1].packet.source.weaponId, 'wpn_railgun_m',
      'fresh impulse provenance remains authoritative over an incidental plated contact');
    assert.equal(routed[1].packet.source.impulseProvenance, 'railgun_penetrator');
    attacker.data.derived.ramDamageDealtMult = 0;

    impulse.clearImpulseProvenance(target);
    state.tick += 30;
    bus.emit('physics:impact', {
      ...impact,
      aId: target.id,
      bId: attacker.id,
      tick: state.tick,
      playerInvolved: true,
    });
    assert.equal(routed.length, 3, 'ordinary craft contact routes one baseline damage packet');
    assert.equal(routed[2].attackerId, null);
    assert.equal(routed[2].targetId, target.id);
    assert.equal(routed[2].packet.source.kind, 'collision_craft');
    assert.equal(routed[2].packet.source.weaponId, null);
    assert.ok(routed[2].packet.channels.kinetic > 0);
    const ordinaryCraftDamage = routed[2].packet.channels.kinetic;

    state.tick += 30;
    bus.emit('physics:impact', {
      ...impact,
      aId: target.id,
      bId: attacker.id,
      tick: state.tick,
      causalActorId: attacker.id,
    });
    assert.equal(routed.length, 4,
      'an explicit contact actor routes the same ordinary baseline without inventing a weapon');
    assert.equal(routed[3].attackerId, attacker.id);
    assert.equal(routed[3].targetId, target.id);
    assert.equal(routed[3].packet.source.weaponId, null);
    assert.equal(routed[3].packet.source.impulseProvenance, 'direct_contact');

    attacker.data.derived.ramDamageDealtMult = 1.8;
    state.tick += 30;
    bus.emit('physics:impact', {
      ...impact,
      aId: target.id,
      bId: attacker.id,
      tick: state.tick,
      causalActorId: attacker.id,
    });
    assert.equal(routed.length, 5, 'a fitted Ram Plate routes one stronger player-driven craft impact');
    assert.equal(routed[4].attackerId, attacker.id);
    assert.equal(routed[4].targetId, target.id);
    assert.equal(routed[4].packet.source.kind, 'collision_craft');
    assert.equal(routed[4].packet.source.weaponId, 'mod_ram_plate');
    assert.ok(routed[4].packet.channels.kinetic > ordinaryCraftDamage);
    assert.ok(routed[4].packet.channels.kinetic <= impulse.COLLISION_CONSEQUENCE_LIMITS.maxDamage);

    state.player = {
      tether: { active: true, targetId: target.id, phase: 'loaded' },
      masslineImpacts: { tracking: true, massId: target.id, impacts: [], latest: null },
    };
    state.tick += 30;
    const beforePendingBoundary = routed.length;
    bus.emit('physics:impact', {
      ...impact,
      aId: target.id,
      bId: attacker.id,
      tick: state.tick,
    });
    assert.equal(routed.length, beforePendingBoundary,
      'a potential exact Massline contact waits until the end-of-step ownership handshake');
    assert.equal(system._pendingCraftContacts.size, 1);
    assert.equal(system._controlStates.has(target), true);

    bus.emit('game:started');
    assert.equal(system._pairTicks.size, 0, 'the canonical new-run boundary clears recycled-id cooldowns');
    assert.equal(system._pendingCraftContacts.size, 0, 'the canonical new-run boundary drops stale queued contacts');
    assert.equal(system._controlStates.has(target), false, 'the canonical new-run boundary drops stale control');
    bus.flush();
    assert.equal(routed.length, beforePendingBoundary,
      'a resolver queued by the retired run cannot damage its old entities after game:started');

    state.tick = 0;
    state.player = {
      tether: { active: false, targetId: null, phase: 'idle' },
      masslineImpacts: { tracking: false, massId: null, impacts: [], latest: null },
    };
    const replacementTarget = combatShip(target.id, target.team, target.pos.x);
    replacementTarget.mass = target.mass;
    replacementTarget.radius = target.radius;
    const replacementTerrain = physicsEntity(
      terrain.id, terrain.type, terrain.pos.x, terrain.vel.x, terrain.radius, terrain.mass,
    );
    state.entities.set(target.id, replacementTarget);
    state.entities.set(terrain.id, replacementTerrain);
    bus.emit('physics:impact', { ...impact, tick: state.tick });
    assert.equal(routed.length, 6,
      'game:started must admit the same tick/pair ids when the fresh run reuses entity ids');
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

test('only an exact solid Massline receipt suppresses its matching craft baseline', async () => {
  const [module, impulse, { masslineImpacts }, { masslineImpactDamage }, { combat }, { MASSLINE2_FLAGS }] = await Promise.all([
    collisionConsequencesModule(),
    impulseKernel(),
    import('../src/systems/masslineImpacts.js'),
    import('../src/systems/masslineImpactDamage.js'),
    import('../src/systems/combat.js'),
    import('../src/data/featureFlags.js'),
  ]);
  const previous = {
    weaponImpulseConsequences: COMBAT_FLAGS.weaponImpulseConsequences,
    whipDamage: COMBAT_FLAGS.whipDamage,
    enabled: MASSLINE2_FLAGS.enabled,
    impactDamage: MASSLINE2_FLAGS.impactDamage,
  };
  Object.assign(COMBAT_FLAGS, { weaponImpulseConsequences: true, whipDamage: true });
  Object.assign(MASSLINE2_FLAGS, { enabled: true, impactDamage: true });

  const bus = createBus();
  const player = combatShip(31, 0, -40);
  const thrown = combatShip(32, 1, 0);
  const struck = combatShip(33, 1, 12);
  const glanced = combatShip(34, 1, 300);
  thrown.mass = struck.mass = glanced.mass = 20;
  thrown.radius = struck.radius = glanced.radius = 6;
  const state = {
    tick: 50,
    simTime: 50 / 60,
    mode: 'flight',
    playerId: player.id,
    player: {
      tether: { active: false, targetId: null, phase: 'idle' },
      masslineImpacts: { tracking: false, slung: false, massId: null, impacts: [], latest: null },
    },
    entities: new Map([
      [player.id, player],
      [thrown.id, thrown],
      [struck.id, struck],
      [glanced.id, glanced],
    ]),
    entityList: [player, thrown, struck, glanced],
    combat: { beams: [], threatTables: new Map() },
  };
  const routed = [];
  const kernel = {
    routeDamage(input) { routed.push(input); return { ok: true, totalApplied: input.packet.channels.kinetic }; },
  };
  const registry = { get(name) { return name === 'combat' ? { kernel } : null; } };
  const consequences = Object.create(module.collisionConsequences);
  const impactObserver = Object.create(masslineImpacts);
  const masslineDamage = Object.create(masslineImpactDamage);
  const combatSystem = Object.create(combat);
  consequences.init({ state, bus, registry, helpers: {} });
  impactObserver.init({ state, bus, registry, helpers: {} });
  combatSystem.state = state;
  combatSystem.bus = bus;
  combatSystem.kernel = kernel;
  const offWhipCombat = bus.on('tether:whipImpact', (payload) => combatSystem.onWhipImpact(payload || {}));
  masslineDamage.init({ state, bus, registry });
  const whipReceipts = [];
  const offWhipReceipt = bus.on('tether:whipImpact', (payload) => whipReceipts.push(payload));

  try {
    impulse.recordImpulseProvenance(thrown, {
      actorId: player.id,
      weaponId: 'wpn_concussion_cannon_m',
      tag: 'concussion_blast',
      appliedTick: state.tick,
      magnitude: 400,
    });
    const contact = {
      consequenceKernelVersion: 1,
      backend: 'rapier-dynamic',
      tick: state.tick,
      aId: thrown.id,
      bId: struck.id,
      dp: 400,
      impulse: 400,
      pos: { x: 6, z: 0 },
      normal: { x: 1, z: 0 },
    };
    bus.emit('physics:impact', contact);

    assert.equal(routed.length, 2, 'ordinary energetic craft contact damages both NPC hulls');
    assert.deepEqual(new Set(routed.map((entry) => entry.targetId)), new Set([thrown.id, struck.id]));
    assert.ok(routed.every((entry) => entry.attackerId === player.id),
      'the incoming hull provenance crosses the contact and attributes both consequence directions');
    assert.ok(routed.every((entry) => entry.packet.source.kind === 'collision_craft'));

    routed.length = 0;
    state.tick += 30;
    state.simTime = state.tick / 60;
    state.player.tether = { active: true, targetId: thrown.id, phase: 'loaded' };
    thrown.pos.x = -28;
    struck.pos.x = 200;
    thrown.vel.x = 80;
    bus.emit('physics:impact', {
      ...contact,
      tick: state.tick,
      aId: thrown.id,
      bId: player.id,
    });
    impactObserver.update(1 / 60, state);
    bus.flush();
    assert.deepEqual(routed.map((entry) => [entry.targetId, entry.packet.source.kind]), [
      [thrown.id, 'collision_craft'],
    ], 'reeling the tracked mass into the player returns ordinary baseline damage to the NPC mass');
    assert.equal(whipReceipts.length, 0, 'player contact never fabricates a whip ownership receipt');

    routed.length = 0;
    state.tick += 30;
    state.simTime = state.tick / 60;
    thrown.pos.x = 0;
    struck.pos.x = 12;
    struck.vel.x = 0;
    bus.emit('physics:impact', { ...contact, tick: state.tick });
    impactObserver.update(1 / 60, state);
    bus.flush();
    assert.deepEqual(routed.map((entry) => [entry.targetId, entry.attackerId, entry.packet.source.kind]), [
      [struck.id, player.id, 'massline_whip'],
      [thrown.id, player.id, 'massline_whip_recoil'],
    ], 'the first exact solid receipt leaves only the established victim-plus-recoil packets');
    assert.equal(whipReceipts.at(-1)?.rating, 'solid');
    assert.equal(whipReceipts.at(-1)?.targetId, thrown.id);
    assert.equal(whipReceipts.at(-1)?.victimId, struck.id);

    routed.length = 0;
    state.tick += 30;
    state.simTime = state.tick / 60;
    bus.emit('physics:impact', { ...contact, tick: state.tick });
    impactObserver.update(1 / 60, state);
    bus.flush();
    assert.deepEqual(new Set(routed.map((entry) => entry.packet.source.kind)), new Set(['collision_craft']));
    assert.deepEqual(new Set(routed.map((entry) => entry.targetId)), new Set([thrown.id, struck.id]),
      'a repeat contact after the consequence cooldown returns both ordinary craft baselines');
    assert.equal(whipReceipts.length, 1,
      'Massline one-per-victim ownership does not leak from the first contact into the repeat');

    routed.length = 0;
    state.tick += 30;
    state.simTime = state.tick / 60;
    struck.pos.x = 200;
    glanced.pos.x = 12;
    thrown.vel.x = 40;
    bus.emit('physics:impact', {
      ...contact,
      tick: state.tick,
      bId: glanced.id,
    });
    impactObserver.update(1 / 60, state);
    bus.flush();
    assert.equal(whipReceipts.at(-1)?.rating, 'glance');
    assert.deepEqual(new Set(routed.map((entry) => entry.packet.source.kind)), new Set(['collision_craft']),
      'a feedback-only glance cannot suppress the ordinary craft baseline');
    assert.deepEqual(new Set(routed.map((entry) => entry.targetId)), new Set([thrown.id, glanced.id]));

    routed.length = 0;
    state.tick += 30;
    state.simTime = state.tick / 60;
    thrown.vel.x = 80;
    bus.emit('physics:impact', {
      ...contact,
      tick: state.tick,
      bId: glanced.id,
    });
    impactObserver.update(1 / 60, state);
    bus.flush();
    assert.deepEqual(new Set(routed.map((entry) => entry.packet.source.kind)), new Set(['collision_craft']));
    assert.deepEqual(new Set(routed.map((entry) => entry.targetId)), new Set([thrown.id, glanced.id]));
    assert.equal(whipReceipts.filter((entry) => entry.victimId === glanced.id).length, 1,
      'a glance marks the victim for the run, so later speed alone cannot claim Massline ownership');
  } finally {
    offWhipReceipt();
    offWhipCombat();
    masslineDamage.destroy();
    consequences.destroy();
    Object.assign(COMBAT_FLAGS, {
      weaponImpulseConsequences: previous.weaponImpulseConsequences,
      whipDamage: previous.whipDamage,
    });
    Object.assign(MASSLINE2_FLAGS, {
      enabled: previous.enabled,
      impactDamage: previous.impactDamage,
    });
    bus.clear();
  }
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
