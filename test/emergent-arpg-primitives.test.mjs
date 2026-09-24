// Combat lab for the emergent ARPG primitives.
// Fixed seeds 4242 and 8008. Forces land through the Rapier dynamic owner.
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { compileEmergentAttack, dipoleImpulse, reflectVelocity, slugMomentum, springImpulse, viscousImpulse } from '../src/combat/emergentPrimitives.js';
import { createBus } from '../src/core/eventBus.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { EMERGENT_LIMITS, EMERGENT_POOL, EMERGENT_WEAPON_DEFS, emergentWeaponByKind } from '../src/data/emergentPrimitives.js';
import { WEAPONS } from '../src/data/weapons.js';
import { createEmergentPrimitivePools } from '../src/render/forceLanguage/emergentPrimitivePools.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import {
  emergentPrimitives,
  ensureEmergent,
  launchEmergent,
  noteEmergentEnergyHit,
  setEmergentRay,
} from '../src/systems/emergentPrimitives.js';
import { weapons } from '../src/systems/weapons.js';

const DT = 1 / 60;

function spd(entity) {
  return Math.hypot(entity.vel?.x || 0, entity.vel?.z || 0);
}

function round(value) {
  return Math.round((value || 0) * 10000) / 10000;
}

function digest(state) {
  const rows = state.entityList.map((entity) => [
    entity.id,
    entity.type,
    round(entity.pos?.x),
    round(entity.pos?.z),
    round(entity.vel?.x),
    round(entity.vel?.z),
    round(entity.angVel),
    round(entity.heat),
    round(entity.hull),
    round(entity.fuelVolatile),
    round(entity.shield),
  ]);
  rows.sort((a, b) => a[0] - b[0]);
  return JSON.stringify(rows);
}

function world(seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.input.actions = {};
  emergentPrimitives.init({ state, bus: createBus(), helpers: {}, registry: null });
  return state;
}

function spawn(state, spec) {
  const entity = makeEntity({
    alive: true,
    hull: 100,
    hullMax: 100,
    radius: 4,
    mass: 24,
    heat: 0,
    shield: 0,
    angVel: 0,
    rot: 0,
    collides: true,
    flags: {},
    data: {},
    ...spec,
    id: allocateEntityId(state),
  });
  entity.physicsBody = {
    dynamic: true,
    mass: entity.mass,
    radius: entity.radius,
    inertiaY: Math.max(1, entity.mass * entity.radius * entity.radius * 0.45),
  };
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

function clear(state) {
  state.entityList.length = 0;
  state.entities.clear();
  state.emergent = null;
  state.tick = 0;
  state.simTime = 0;
  state.input.actions = {};
}

async function step(state, owner, n, before) {
  for (let i = 0; i < n; i++) {
    if (before) before();
    state.tick += 1;
    state.simTime = state.tick / 60;
    emergentPrimitives.update(DT, state);
    owner.syncFromEntities(state.entityList);
    owner.step(DT);
  }
}

test('every primitive compiles to a frozen AttackSpec whose recursion cap is 4', () => {
  assert.equal(EMERGENT_WEAPON_DEFS.length, 11);
  const digests = [];
  for (const def of EMERGENT_WEAPON_DEFS) {
    assert.equal(WEAPONS.some((weapon) => weapon.id === def.id), true, def.id);
    assert.equal(def.heatPerShot, 0, def.id);
    assert.equal(def.energyCost, 0, def.id);
    assert.equal(def.starterSafe, true, def.id);
    assert.ok(def.impulsePerHit > 0, def.id);
    const first = compileEmergentAttack(def);
    const second = compileEmergentAttack(def.id);
    assert.equal(first.ok, true, JSON.stringify(first.issues));
    assert.equal(Object.isFrozen(first.spec), true, def.id);
    assert.equal(first.spec.digest, second.spec.digest, def.id);
    assert.ok(first.spec.constraints.generationMax <= EMERGENT_LIMITS.generationMax, def.id);
    digests.push(first.spec.digest);
  }
  assert.equal(new Set(digests).size, 11);
  const primer = compileEmergentAttack('wpn_conductive_primer').spec;
  const sympathy = compileEmergentAttack('tool_quantum_sympathy').spec;
  const sticky = compileEmergentAttack('wpn_sticky_detonator').spec;
  const prism = compileEmergentAttack('tool_hardlight_prism').spec;
  assert.equal(primer.propagation.chain.count, 4);
  assert.equal(primer.constraints.generationMax, 4);
  assert.equal(sympathy.constraints.generationMax, 4);
  assert.equal(sticky.propagation.split.count, 7);
  assert.equal(prism.trajectory.bounces, 4);
  const pulse = WEAPONS.find((weapon) => weapon.id === 'wpn_pulse_laser_s');
  assert.equal(pulse.heatPerShot, 8);
  assert.equal(pulse.rof, 5.5);
  assert.equal(pulse.energyCost, 2);
  const bombs = PRODUCTION_UPDATE_ORDER.indexOf('bombs');
  const emergent = PRODUCTION_UPDATE_ORDER.indexOf('emergentPrimitives');
  const charges = PRODUCTION_UPDATE_ORDER.indexOf('impulseCharges');
  const physics = PRODUCTION_UPDATE_ORDER.indexOf('physics');
  assert.ok(bombs < emergent && emergent < charges && charges < physics);
});

test('force laws keep their signs: spring, dipole, drag, slug, reflection', () => {
  const spring = springImpulse(0, 0, 10, 0, 4, 10, 0.1);
  assert.ok(spring.jax > 0 && spring.jbx < 0);
  assert.ok(Math.abs(spring.jax + spring.jbx) < 1e-9);
  const repel = dipoleImpulse(0, 0, 8, 0, 1, 1, 1000, 0.1, 1);
  const attract = dipoleImpulse(0, 0, 8, 0, 1, -1, 1000, 0.1, 1);
  assert.ok(repel.jax < 0 && attract.jax > 0);
  assert.equal(attract.attract, true);
  const drag = viscousImpulse(10, 0, 1, 0, 5, 2, 0.5, 0.1);
  assert.ok(drag.jx < 0 && drag.power > 0);
  const slug = slugMomentum(9, 340, 0);
  assert.equal(slug.jx, 3060);
  assert.equal(slug.jz, 0);
  const bounce = reflectVelocity(1, 0, Math.SQRT1_2, -Math.SQRT1_2, 1.35);
  assert.ok(Math.abs(bounce.x) < 1e-6, bounce.x);
  assert.ok(bounce.z > 1.3, bounce.z);
});

test('presentation pools are instanced, bounded, and empty when the sim snapshot is empty', () => {
  const pools = createEmergentPrimitivePools();
  const state = {
    emergent: {
      hot: true,
      presentationCount: 4,
      presentation: [
        { kind: 'arc', x: 0, z: 0, x2: 8, z2: 0, scale: 1, yaw: 0 },
        { kind: 'ring', x: 2, z: 2, x2: 2, z2: 2, scale: 6, yaw: 0 },
        { kind: 'gel', x: -4, z: 1, x2: -4, z2: 1, scale: 10, yaw: 0 },
        { kind: 'prism', x: 3, z: -2, x2: 3, z2: -2, scale: 2, yaw: 0.4 },
      ],
    },
  };
  const counts = pools.update(state);
  assert.equal(pools.arcs.isInstancedMesh, true);
  assert.equal(pools.rings.isInstancedMesh, true);
  assert.equal(pools.gels.isInstancedMesh, true);
  assert.equal(pools.prisms.isInstancedMesh, true);
  assert.deepEqual(counts, { arcs: 1, rings: 1, gels: 1, prisms: 1 });
  assert.ok(pools.arcs.count <= 64 && pools.rings.count <= 24);
  state.emergent.presentationCount = 0;
  const cleared = pools.update(state);
  assert.deepEqual(cleared, { arcs: 0, rings: 0, gels: 0, prisms: 0 });
  pools.dispose();
  pools.dispose();
});

test('fitting a primitive does not heat-lock or drain the baseline pulse', () => {
  const state = world(4242);
  const player = spawn(state, {
    type: 'ship',
    isPlayer: true,
    pos: { x: 0, z: 0 },
    radius: 3,
    mass: 16,
    cap: 80,
    capMax: 80,
    data: {
      weapons: [
        { defId: 'wpn_pulse_laser_s', _heat: 0, _cooldown: 0 },
        { defId: 'wpn_mass_driver', _heat: 0, _cooldown: 0, slotIndex: 1 },
      ],
    },
  });
  state.playerId = player.id;
  const host = Object.create(weapons);
  host.bus = createBus();
  host.helpers = {
    spawnEntity() {
      return { id: 900, alive: true, type: 'projectile', pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 }, radius: 0.4 };
    },
    getEntity(id) { return state.entities.get(id); },
  };
  host._byId = new Map(WEAPONS.map((weapon) => [weapon.id, weapon]));
  host._rng = () => 0.25;
  host._serviceShip(player, true, true, DT, state, 0, null, null);
  const pulse = player.data.weapons[0];
  const driver = player.data.weapons[1];
  assert.equal(driver._heat || 0, 0);
  assert.equal(player.data.weaponVentUntil || 0, 0);
  assert.ok(player.cap >= 78);
  assert.ok((pulse._heat || 0) > 0);
  assert.equal(ensureEmergent(state).projectileLive, 1);
});

test('lab: all 11 primitives, three synergies, both seeds, no drift and no pool growth', async () => {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  try {
    for (const seed of [4242, 8008]) {
      const state = world(seed);
      await exercise(state, owner, seed);
    }
    const left = digest(await scenario(4242));
    const leftAgain = digest(await scenario(4242));
    const right = digest(await scenario(8008));
    assert.equal(left, leftAgain);
    assert.notEqual(left, right);
  } finally {
    owner.dispose();
  }
});

async function scenario(seed) {
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  try {
    const state = world(seed);
    const shooter = spawn(state, { type: 'ship', pos: { x: -30, z: 0 }, radius: 3, mass: 400, rot: 0 });
    const host = spawn(state, { type: 'wreck', pos: { x: 20, z: 4 }, radius: 5, mass: 40, hull: 20 });
    const bystander = spawn(state, { type: 'asteroid', pos: { x: 20, z: 22 }, radius: 4, mass: 30, material: 'rock' });
    state.playerId = shooter.id;
    launchEmergent(state, shooter, emergentWeaponByKind('sticky'), 0);
    await step(state, owner, 20);
    state.input.actions.chargeDetonate = true;
    await step(state, owner, 30);
    assert.ok(spd(host) + spd(bystander) > 0.5);
    return state;
  } finally {
    owner.dispose();
  }
}

async function exercise(state, owner, seed) {
  const kinds = ['ship', 'asteroid', 'wreck'];
  for (const type of kinds) {
    clear(state);
    const shooter = spawn(state, { type: 'ship', pos: { x: -24, z: 0 }, radius: 3, mass: 500, rot: 0 });
    const target = spawn(state, {
      type,
      pos: { x: 28, z: 0 },
      radius: 5,
      mass: 36,
      alive: true,
      hull: type === 'wreck' ? 30 : 100,
      material: type === 'asteroid' ? 'rock' : undefined,
      fuelVolatile: type === 'asteroid' ? 0 : undefined,
    });
    state.playerId = shooter.id;
    const before = target.hull;
    launchEmergent(state, shooter, emergentWeaponByKind('mass'), 0);
    await step(state, owner, 18);
    assert.ok(spd(target) > 8, `${seed} mass ${type} speed ${spd(target)}`);
    assert.equal(target.hull, before, `${seed} mass ${type} keeps its hull`);
  }

  clear(state);
  const shooter = spawn(state, { type: 'ship', pos: { x: -20, z: 0 }, radius: 3, mass: 400, rot: 0 });
  const loose = [
    spawn(state, { type: 'cargo_pod', pos: { x: 24, z: -12 }, radius: 2, mass: 8 }),
    spawn(state, { type: 'mine', pos: { x: 24, z: 0 }, radius: 2, mass: 6 }),
    spawn(state, { type: 'structure', pos: { x: 24, z: 12 }, radius: 6, mass: 80 }),
  ];
  state.playerId = shooter.id;
  for (const target of loose) {
    shooter.pos.z = target.pos.z;
    shooter.vel.x = 0;
    shooter.vel.z = 0;
    launchEmergent(state, shooter, emergentWeaponByKind('mass'), 0);
    await step(state, owner, 16);
    assert.ok(spd(target) > 4, `${seed} mass ${target.type}`);
  }

  clear(state);
  const primer = spawn(state, { type: 'ship', pos: { x: -90, z: 0 }, radius: 3, mass: 40, rot: 0 });
  const chain = [];
  for (let i = 0; i < 6; i++) {
    chain.push(spawn(state, { type: 'ship', pos: { x: i * 16, z: 0 }, radius: 3, mass: 20, heat: 0 }));
  }
  state.playerId = primer.id;
  launchEmergent(state, primer, emergentWeaponByKind('primer'), 0);
  await step(state, owner, 30);
  assert.equal(coated(state, chain[0].id), true, `${seed} primer coats the first hull`);
  noteEmergentEnergyHit(state, chain[0], 12, primer.id, emergentPrimitives);
  assert.ok(chain[4].heat > 0, `${seed} arc reaches depth 4`);
  assert.equal(chain[5].heat || 0, 0, `${seed} arc stops at depth 4`);
  assert.ok(state.emergent.audio.some((row) => row && row.id === 'sfx_emergent_crackle'));

  clear(state);
  const anchor = spawn(state, { type: 'ship', pos: { x: 0, z: -30 }, radius: 2, mass: 80, rot: 0 });
  const left = spawn(state, { type: 'ship', pos: { x: -24, z: 10 }, radius: 4, mass: 20 });
  const right = spawn(state, { type: 'asteroid', pos: { x: 24, z: 10 }, radius: 5, mass: 90, material: 'rock', fuelVolatile: 0 });
  state.playerId = anchor.id;
  launchEmergent(state, anchor, emergentWeaponByKind('grav'), Math.atan2(left.pos.z - anchor.pos.z, left.pos.x - anchor.pos.x));
  await step(state, owner, 20);
  launchEmergent(state, anchor, emergentWeaponByKind('grav'), Math.atan2(right.pos.z - anchor.pos.z, right.pos.x - anchor.pos.x));
  await step(state, owner, 24);
  const span = Math.hypot(right.pos.x - left.pos.x, right.pos.z - left.pos.z);
  await step(state, owner, 50);
  const spanAfter = Math.hypot(right.pos.x - left.pos.x, right.pos.z - left.pos.z);
  assert.ok(spanAfter < span - 2, `${seed} grav span ${span} -> ${spanAfter}`);
  assert.ok(spd(left) > 1 && spd(right) > 0.4, `${seed} grav mass-scaled motion`);

  clear(state);
  const cooker = spawn(state, { type: 'ship', pos: { x: -30, z: 0 }, radius: 3, mass: 40, rot: 0 });
  const rock = spawn(state, { type: 'asteroid', pos: { x: 16, z: 0 }, radius: 5, mass: 50, material: 'rock', fuelVolatile: 0, heat: 0 });
  state.playerId = cooker.id;
  const thermal = emergentWeaponByKind('thermal');
  await step(state, owner, 50, () => setEmergentRay(state, cooker, thermal, 0));
  assert.equal(rock.data.fractured, true, `${seed} asteroid fractures from heat`);
  assert.equal(rock.hull, 0);

  clear(state);
  const cooker2 = spawn(state, { type: 'ship', pos: { x: -30, z: 0 }, radius: 3, mass: 40, rot: 0 });
  const hulk = spawn(state, { type: 'wreck', pos: { x: 16, z: 0 }, radius: 6, mass: 48, hull: 40, heat: 0 });
  state.playerId = cooker2.id;
  await step(state, owner, 40, () => setEmergentRay(state, cooker2, thermal, 0));
  assert.equal(hulk.data.cooked, true, `${seed} wreck fuel cooks`);
  assert.equal(hulk.fuelVolatile, 0);
  assert.ok(state.emergent.audio.some((row) => row && row.id === 'sfx_emergent_cook'));

  clear(state);
  const cooker3 = spawn(state, { type: 'ship', pos: { x: -30, z: 0 }, radius: 3, mass: 40, rot: 0 });
  const victim = spawn(state, {
    type: 'ship',
    pos: { x: 16, z: 0 },
    radius: 4,
    mass: 22,
    capMax: 120,
    heat: 0,
    turnRate: 1.1,
    data: { weapons: [{ defId: 'wpn_autocannon_s', _heat: 40, ammo: 6 }] },
  });
  state.playerId = cooker3.id;
  await step(state, owner, 70, () => setEmergentRay(state, cooker3, thermal, 0));
  assert.ok(victim.data.reactorLockoutUntil > 0, `${seed} reactor lockout is on the target`);
  assert.equal(victim.data.magazineCooked, true, `${seed} unspent magazine cooks`);
  assert.equal(victim.data.weapons[0].ammo, 0);
  assert.equal(cooker3.data.weaponVentUntil || 0, 0, `${seed} the cooker's own guns stay unlocked`);

  clear(state);
  const tagger = spawn(state, { type: 'ship', pos: { x: 18, z: -40 }, radius: 2, mass: 40, rot: 0 });
  const plus = spawn(state, { type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 22, fuelVolatile: 0.05 });
  const minus = spawn(state, { type: 'wreck', pos: { x: 36, z: 0 }, radius: 4, mass: 22, fuelVolatile: 0.05 });
  state.playerId = tagger.id;
  launchEmergent(state, tagger, emergentWeaponByKind('polarity'), Math.atan2(-tagger.pos.z, plus.pos.x - tagger.pos.x));
  await step(state, owner, 20);
  launchEmergent(state, tagger, emergentWeaponByKind('polarity'), Math.atan2(-tagger.pos.z, minus.pos.x - tagger.pos.x));
  await step(state, owner, 24);
  assert.equal(plus.magneticCharge, 1, `${seed} first tag is positive`);
  assert.equal(minus.magneticCharge, -1, `${seed} second tag is negative`);
  const open = Math.hypot(minus.pos.x - plus.pos.x, minus.pos.z - plus.pos.z);
  tagger.pos.x = 18;
  tagger.pos.z = 0;
  launchEmergent(state, tagger, emergentWeaponByKind('viscosity'), 0);
  assert.equal(state.emergent.fields.length, 1, `${seed} viscosity field is armed with the charges`);
  await step(state, owner, 40);
  const closed = Math.hypot(minus.pos.x - plus.pos.x, minus.pos.z - plus.pos.z);
  assert.ok(closed < open - 1, `${seed} opposite charges close ${open} -> ${closed}`);
  assert.ok(spd(plus) < 40 && spd(minus) < 40, `${seed} viscosity bounds the approach`);
  assert.ok((plus.heat || 0) + (minus.heat || 0) > 1, `${seed} friction ignition heats fuel`);

  clear(state);
  const mirror = spawn(state, { type: 'ship', pos: { x: 0, z: 0 }, radius: 2, mass: 30, rot: 0 });
  const side = spawn(state, { type: 'ship', pos: { x: 34, z: 18 }, radius: 12, mass: 30, heat: 0, fuelVolatile: 0 });
  const dummy = spawn(state, { type: 'asteroid', pos: { x: 88, z: 0 }, radius: 3, mass: 40, material: 'rock', fuelVolatile: 0, heat: 0 });
  state.playerId = mirror.id;
  launchEmergent(state, mirror, emergentWeaponByKind('prism'), 0);
  assert.equal(state.emergent.prisms.length, 1, `${seed} prism is in the world before the ray`);
  await step(state, owner, 50, () => setEmergentRay(state, mirror, thermal, 0));
  assert.ok(side.heat > dummy.heat + 5, `${seed} prism redirects the cooker ${side.heat} vs ${dummy.heat}`);
  assert.ok(state.emergent.audio.some((row) => row && row.id === 'sfx_emergent_prism'));

  clear(state);
  const pirate = spawn(state, { type: 'ship', pos: { x: -16, z: 0 }, radius: 2, mass: 30, rot: 0 });
  const live = spawn(state, { type: 'ship', pos: { x: 22, z: 8 }, radius: 4, mass: 20, turnRate: 1, thrust: 80, alive: true });
  const dead = spawn(state, { type: 'wreck', pos: { x: 22, z: -8 }, radius: 4, mass: 20, turnRate: 1, thrust: 80, hull: 10, fuelVolatile: 0.4 });
  state.playerId = pirate.id;
  launchEmergent(state, pirate, emergentWeaponByKind('hijack'), Math.atan2(live.pos.z, live.pos.x - pirate.pos.x));
  await step(state, owner, 18);
  launchEmergent(state, pirate, emergentWeaponByKind('hijack'), Math.atan2(dead.pos.z, dead.pos.x - pirate.pos.x));
  await step(state, owner, 24);
  assert.ok(Math.abs(live.angVel) > 2, `${seed} live spin ${live.angVel}`);
  assert.ok(Math.abs(dead.angVel) > 2, `${seed} wreck spin ${dead.angVel}`);
  assert.ok(spd(dead) > spd(live) + 2, `${seed} wreck burner ${spd(dead)} > ${spd(live)}`);

  clear(state);
  const striker = spawn(state, { type: 'ship', pos: { x: -24, z: 0 }, radius: 2, mass: 40, rot: 0 });
  const bell = spawn(state, { type: 'asteroid', pos: { x: 12, z: 0 }, radius: 6, mass: 120, material: 'rock', fuelVolatile: 0 });
  const neighbor = spawn(state, { type: 'ship', pos: { x: 28, z: 8 }, radius: 4, mass: 24, shield: 100 });
  const missile = spawn(state, {
    type: 'projectile',
    pos: { x: 18, z: 14 },
    vel: { x: 0, z: 30 },
    radius: 1,
    mass: 2,
    data: { tracking: 'homing' },
  });
  state.playerId = striker.id;
  launchEmergent(state, striker, emergentWeaponByKind('gong'), 0);
  await step(state, owner, 20);
  assert.ok(neighbor.shield < 100, `${seed} shield ${neighbor.shield}`);
  assert.ok(spd(neighbor) > 0.5, `${seed} shock moves the neighbor`);
  assert.ok(Math.abs(missile.vel.x) > 0.2, `${seed} missile deflected`);
  assert.ok(state.emergent.audio.some((row) => row && row.id === 'sfx_emergent_seismic'));

  clear(state);
  const linker = spawn(state, { type: 'ship', pos: { x: 0, z: -36 }, radius: 2, mass: 40, rot: 0 });
  const alpha = spawn(state, { type: 'ship', pos: { x: -16, z: 4 }, radius: 4, mass: 40 });
  const beta = spawn(state, { type: 'wreck', pos: { x: 16, z: 70 }, radius: 4, mass: 40, hull: 50, fuelVolatile: 0 });
  state.playerId = linker.id;
  launchEmergent(state, linker, emergentWeaponByKind('quantum'), Math.atan2(alpha.pos.z - linker.pos.z, alpha.pos.x - linker.pos.x));
  await step(state, owner, 18);
  launchEmergent(state, linker, emergentWeaponByKind('quantum'), Math.atan2(beta.pos.z - linker.pos.z, beta.pos.x - linker.pos.x));
  await step(state, owner, 28);
  assert.equal(state.emergent.links.length, 1, `${seed} sympathy link exists before the shock`);
  linker.pos.x = -40;
  linker.pos.z = 0;
  launchEmergent(state, linker, emergentWeaponByKind('mass'), 0);
  await step(state, owner, 20);
  assert.ok(spd(alpha) > 10, `${seed} sympathy source ${spd(alpha)}`);
  assert.ok(spd(beta) > 10, `${seed} sympathy partner ${spd(beta)}`);
  assert.ok(Math.abs(beta.angVel) > 0.05, `${seed} sympathy copies the spin shock ${beta.angVel}`);

  clear(state);
  const hauler = spawn(state, { type: 'ship', pos: { x: 0, z: -28 }, radius: 2, mass: 60, rot: 0 });
  const spiked = spawn(state, { type: 'ship', pos: { x: -18, z: 8 }, radius: 4, mass: 22 });
  const anchorBody = spawn(state, { type: 'asteroid', pos: { x: 70, z: 8 }, radius: 5, mass: 70, material: 'rock', fuelVolatile: 0 });
  state.playerId = hauler.id;
  launchEmergent(state, hauler, emergentWeaponByKind('grav'), Math.atan2(spiked.pos.z - hauler.pos.z, spiked.pos.x - hauler.pos.x));
  await step(state, owner, 18);
  launchEmergent(state, hauler, emergentWeaponByKind('grav'), Math.atan2(anchorBody.pos.z - hauler.pos.z, anchorBody.pos.x - hauler.pos.x));
  await step(state, owner, 30);
  assert.equal(state.emergent.springs.length, 1, `${seed} grav spring is up before the sticky blast`);
  launchEmergent(state, hauler, emergentWeaponByKind('sticky'), Math.atan2(spiked.pos.z - hauler.pos.z, spiked.pos.x - hauler.pos.x));
  await step(state, owner, 20);
  const beforePull = spd(anchorBody);
  const spikedBefore = spd(spiked);
  assert.ok(beforePull > 4, `${seed} the spring alone is already towing the far asteroid at ${beforePull}`);
  state.input.actions.chargeDetonate = true;
  await step(state, owner, 36);
  assert.ok(spd(spiked) > spikedBefore + 5, `${seed} sticky blast throws the spiked hull ${spikedBefore} -> ${spd(spiked)}`);
  assert.ok(spd(anchorBody) > 2, `${seed} the sprung asteroid is still coupled at ${spd(anchorBody)}`);
  assert.ok(state.emergent.audio.some((row) => row && row.id === 'sfx_emergent_crumple' || row && row.id === 'sfx_emergent_cook'));

  clear(state);
  const mirrorGun = spawn(state, { type: 'ship', pos: { x: 0, z: 0 }, radius: 2, mass: 400, rot: 0 });
  state.playerId = mirrorGun.id;
  launchEmergent(state, mirrorGun, emergentWeaponByKind('prism'), 0);
  launchEmergent(state, mirrorGun, emergentWeaponByKind('mass'), 0);
  await step(state, owner, 24);
  const bounced = state.emergent.projectiles.find((slot) => slot.alive && slot.kind === 'mass');
  assert.ok(bounced, `${seed} mass slug is still in the pool after the mirror`);
  assert.ok(Math.abs(bounced.vz) > Math.abs(bounced.vx), `${seed} prism redirected the slug vz=${bounced.vz} vx=${bounced.vx}`);
  assert.ok((bounced.bounces | 0) >= 1 && (bounced.bounces | 0) <= 4, `${seed} bounce budget ${bounced.bounces}`);

  clear(state);
  const spam = spawn(state, { type: 'ship', pos: { x: 0, z: 0 }, radius: 2, mass: 400, rot: 0 });
  state.playerId = spam.id;
  for (let i = 0; i < 200; i++) launchEmergent(state, spam, emergentWeaponByKind('mass'), i * 0.01);
  const worldState = ensureEmergent(state);
  assert.equal(worldState.projectiles.length, EMERGENT_POOL.projectiles);
  assert.ok(worldState.projectileLive <= EMERGENT_POOL.projectiles);
  assert.equal(worldState.presentation.length, EMERGENT_POOL.presentation);
  assert.equal(worldState.audio.length, EMERGENT_POOL.audio);
  await step(state, owner, 160);
  assert.equal(worldState.projectileLive, 0, `${seed} projectile slots return to the pool`);
  assert.equal(worldState.projectiles.length, EMERGENT_POOL.projectiles);
}

function coated(state, id) {
  const coats = state.emergent && state.emergent.coatings;
  if (!coats) return false;
  return coats.some((coat) => coat.hostId === id);
}
