import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { weapons } from '../src/systems/weapons.js';
import { combat } from '../src/systems/combat.js';
import { mining as miningBase } from '../src/systems/mining.js';
import { mulberry32 } from '../src/core/rng.js';
import { SIM_DT } from '../src/core/sim.js';
import {
  OPTIC_MATERIALS,
  OPTIC_RAY_COUNT,
  opticMaterialOf,
  opticSpendLedger,
  recordOpticSpend,
} from '../src/combat/opticField.js';
import { BEAMS } from '../src/data/mining.js';

// build_map §24 "Beams and missiles" — the optic lattice answers three responses; until this
// row only energy bolts carried it. Now a continuous weapon beam is a "shot" whose family is
// the mount-hold (one burst = one shot, never a per-tick splinter storm), and a missile joins
// absorb/split without ever reflecting (a mirror bounces light, not mass). The MINING beam in
// src/systems/mining.js stays ore-only — it never reaches the optic grammar at all.
//
// Everything here runs the production seams: weapons pushes the real state.combat.beams ray,
// combat's _applyBeamDamage arbitrates first-body-on-the-ray, the optic owner settles the
// contact, and physics' projectile sweep carries the missile into the rock.

const SEED = 9021;

function bootWorld(seed = SEED) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: { get() { return null; } } };
  core.init(ctx);
  const contacts = [];
  bus.on('optic:contact', (p) => contacts.push(p));
  // Live init order: weapons subscribes before combat (registry order), so suppression and
  // optic settles land before damage routing — same as production.
  const weaponsHost = Object.create(weapons);
  weaponsHost.init(ctx);
  const combatHost = Object.create(combat);
  combatHost.init(ctx);
  const physicsHost = Object.create(physics);
  physicsHost.init({ state, bus, helpers });
  return { state, bus, helpers, contacts, weaponsHost, combatHost, physicsHost };
}

function opticRock(env, x, z, material, radius) {
  const r = radius != null ? radius : (OPTIC_MATERIALS[material] ? OPTIC_MATERIALS[material].radius : 13);
  return env.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x, z },
    radius: r,
    collides: true,
    data: { opticMaterial: material, typeId: (OPTIC_MATERIALS[material] || {}).typeId },
  });
}

function beamShip(env, x = 0, z = 0) {
  // beam_laser_m is the authored continuous energy mount; instance heatPerSec:0 keeps the
  // hold open for the whole test window without touching the grammar under test.
  const ship = env.helpers.spawnEntity({
    type: 'ship', pos: { x, z }, radius: 6, mass: 12,
    hull: 400, hullMax: 400, cap: 4000, capMax: 4000, capRegen: 500,
    collides: true, team: 0, rot: 0,
    data: { weapons: [{ defId: 'wpn_beam_laser_m', slotIndex: 0, heatPerSec: 0 }] },
  });
  env.state.playerId = ship.id;
  ship.isPlayer = true;
  return ship;
}

function splinters(env) {
  return env.state.entityList.filter(
    (e) => e.type === 'projectile' && e.data && Number.isInteger(e.data.opticGeneration) && e.data.opticGeneration > 0,
  );
}

function missile(env, x, z, vx) {
  return env.helpers.spawnEntity({
    type: 'projectile',
    pos: { x, z },
    vel: { x: vx, z: 0 },
    rot: Math.atan2(0, vx),
    radius: 0.7,
    collides: true,
    ownerId: env.state.playerId,
    team: 0,
    data: {
      damage: 70,
      damageType: 'explosive',
      kind: 'missile',
      weaponId: 'wpn_missile_rack_m',
      targetId: null,
      turnRate: 2.2,
      projSpeed: 300,
      projAccel: 200,
      armed: true,
      splashRadius: 40,
      splashDmg: 35,
      spawnPos: { x, z },
      maxDistance: 2000,
    },
  });
}

// One 60 Hz step of the real beam pipeline: weapons pushes the ray, combat sweeps it.
function beamTick(env, firing = true) {
  env.state.input.fire = firing;
  env.state.input.aimAngle = 0;
  env.weaponsHost.update(SIM_DT, env.state);
  env.combatHost.update(SIM_DT, env.state);
  env.state.simTime += SIM_DT;
  env.state.tick += 1;
}

test('an energy beam held on a diamond throws exactly one ring — not one per tick', () => {
  const env = bootWorld();
  beamShip(env);
  const diamond = opticRock(env, 200, 0, 'diamond', 13);

  beamTick(env, true);
  const prisms = env.contacts.filter((c) => c.kind === 'prism');
  assert.equal(prisms.length, 1, 'the first contact tick throws the ring');
  assert.equal(prisms[0].targetId, diamond.id);
  assert.equal(prisms[0].rays, OPTIC_RAY_COUNT);
  assert.equal(prisms[0].via, 'beam');
  assert.equal(splinters(env).length, OPTIC_RAY_COUNT, 'eight splinter children spawned');
  for (const child of splinters(env)) {
    assert.equal(child.data.opticGeneration, 1);
    assert.equal(child.data.damageType, 'energy');
    assert.equal(child.ownerId, env.state.playerId, 'the ring belongs to the shooter');
  }
  assert.equal(diamond.data.opticMaterial, 'spent', 'the discharged cell goes dark');

  // The beam terminated at the crystal skin, not at full range.
  const ray = env.state.combat.beams[0];
  const entry = diamond.pos.x - (diamond.radius + 2.2);
  assert.ok(Math.abs(ray.to.x - entry) < 1e-6, `beam ends at the surface (to.x=${ray.to.x}, entry=${entry})`);

  // Holding the trigger: every later tick is an absorb into the dark cell — one ring total.
  for (let i = 0; i < 29; i++) beamTick(env, true);
  assert.equal(env.contacts.filter((c) => c.kind === 'prism').length, 1, 'still exactly one ring after 30 held ticks');
  assert.equal(splinters(env).length, OPTIC_RAY_COUNT, 'no per-tick splinter storm');
  const absorbs = env.contacts.filter((c) => c.kind === 'absorb');
  assert.equal(absorbs.length, 29, 'each held tick after the burn is an absorb');
  assert.ok(absorbs.every((c) => c.reason === 'spent' && c.via === 'beam'));

  // Release and re-fire: a new burst family, but the cell is still dark — still an absorb.
  beamTick(env, false);
  beamTick(env, false);
  for (let i = 0; i < 5; i++) beamTick(env, true);
  assert.equal(env.contacts.filter((c) => c.kind === 'prism').length, 1, 'a fresh burst does not re-split a spent cell');
});

test('an energy beam on a spent diamond only ever absorbs', () => {
  const env = bootWorld();
  beamShip(env);
  const diamond = opticRock(env, 200, 0, 'diamond', 13);
  // Burn the cell through the real spend path before the beam ever touches it.
  const spend = recordOpticSpend(diamond, env.state.simTime, opticSpendLedger(env.state));
  assert.ok(spend, 'the diamond spends dark');
  assert.equal(opticMaterialOf(diamond).id, 'spent');

  for (let i = 0; i < 20; i++) beamTick(env, true);
  assert.equal(env.contacts.length, 20, 'every tick is a contact');
  assert.ok(env.contacts.every((c) => c.kind === 'absorb' && c.reason === 'spent'));
  assert.equal(splinters(env).length, 0, 'a dark cell never splits');
});

test('an energy beam on stone and metal eats the ray without splitting', () => {
  const env = bootWorld();
  beamShip(env);
  const stone = opticRock(env, 180, 0, 'stone', 34);
  const metal = opticRock(env, 300, 0, 'metal', 16);

  beamTick(env, true);
  assert.equal(env.contacts.length, 1);
  assert.equal(env.contacts[0].kind, 'absorb');
  assert.equal(env.contacts[0].reason, 'stone');
  assert.equal(env.contacts[0].targetId, stone.id);
  assert.equal(splinters(env).length, 0);
  assert.ok(env.state.combat.beams[0].to.x < 180, 'the beam ends at the stone, never reaching the metal');

  // Swing onto the mirror: slide the shooter clear of the stone so the ray lands on metal —
  // a beam cannot reflect, so the mirror eats it like stone.
  env.state.entities.get(env.state.playerId).pos.x = 240;
  for (let i = 0; i < 3; i++) beamTick(env, true);
  const metalContacts = env.contacts.filter((c) => c.targetId === metal.id);
  assert.ok(metalContacts.length > 0, 'the beam reaches the mirror once the stone is out of the lane');
  assert.ok(metalContacts.every((c) => c.kind === 'absorb' && c.reason === 'metal'),
    'a mirror has no bolt body to send back — the beam dies on the skin');
  assert.equal(splinters(env).length, 0);
});

test('a missile on stone dies without splitting', () => {
  const env = bootWorld();
  beamShip(env);
  const stone = opticRock(env, 300, 0, 'stone', 34);
  const m = missile(env, 200, 0, 400);
  // A 60 Hz sweep segment that crosses the rock, mirroring the live physics path.
  m.prevPos.x = 210;
  m.prevPos.z = 0;
  m.pos.x = 390;
  m.pos.z = 0;
  env.physicsHost.sweepProjectiles(SIM_DT, env.state);

  assert.equal(m.alive, false, 'the missile died on the rock');
  assert.equal(env.contacts.length, 1);
  assert.equal(env.contacts[0].kind, 'absorb');
  assert.equal(env.contacts[0].reason, 'stone');
  assert.equal(env.contacts[0].targetId, stone.id);
  assert.equal(splinters(env).length, 0, 'no splinters left the stone');
  assert.equal(stone.data.opticMaterial, 'stone', 'the stone is unmoved');
});

test('a missile on a diamond throws the ring', () => {
  const env = bootWorld();
  beamShip(env);
  const diamond = opticRock(env, 300, 0, 'diamond', 13);
  const m = missile(env, 200, 0, 400);
  m.prevPos.x = 240;
  m.prevPos.z = 0;
  m.pos.x = 360;
  m.pos.z = 0;
  env.physicsHost.sweepProjectiles(SIM_DT, env.state);

  assert.equal(m.alive, false, 'the missile is consumed by the contact');
  const prisms = env.contacts.filter((c) => c.kind === 'prism');
  assert.equal(prisms.length, 1, 'the missile lit the diamond once');
  assert.equal(prisms[0].rays, OPTIC_RAY_COUNT);
  assert.equal(prisms[0].targetId, diamond.id);
  const ring = splinters(env);
  assert.equal(ring.length, OPTIC_RAY_COUNT, 'the ring is the same eight-way splinter fan a bolt throws');
  for (const child of ring) {
    assert.equal(child.data.kind, 'bullet', 'splinters are light, not ordnance');
    assert.equal(child.data.damageType, 'energy');
    assert.equal(child.data.splashRadius, undefined, 'the missile splash does not ride the splinters');
    assert.equal(child.ownerId, env.state.playerId);
  }
  assert.equal(diamond.data.opticMaterial, 'spent', 'the cell burned');
});

test('a missile on metal detonates on the skin — no reflect', () => {
  const env = bootWorld();
  beamShip(env);
  const metal = opticRock(env, 300, 0, 'metal', 16);
  const m = missile(env, 200, 0, 400);
  m.prevPos.x = 250;
  m.prevPos.z = 0;
  m.pos.x = 350;
  m.pos.z = 0;
  env.physicsHost.sweepProjectiles(SIM_DT, env.state);

  assert.equal(m.alive, false);
  assert.equal(env.contacts.length, 1);
  assert.equal(env.contacts[0].kind, 'absorb', 'ordnance never takes the mirror path');
  assert.equal(env.contacts[0].reason, 'metal');
  assert.equal(splinters(env).length, 0);
});

// ── Mining stays ore-only ──────────────────────────────────────────────────

const MK1 = BEAMS.find((b) => b.id === 'beam_mk1');

function bootMining(entities) {
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 6,
    flags: { docked: false },
    data: { miningBeam: { tierId: 'beam_mk1', directToCargo: false } },
  };
  const state = {
    mode: 'flight',
    playerId: player.id,
    simTime: 0,
    tick: 0,
    meta: { seed: SEED },
    rng: mulberry32(SEED),
    player: { cargo: { items: {}, capVolume: 500, capMass: 1000, usedVolume: 0, usedMass: 0 } },
    input: { aimAngle: 0, fireGroup: 0, actions: {} },
    entities: new Map([[player.id, player], ...entities.map((e) => [e.id, e])]),
    entityList: [player, ...entities],
    world: { currentSectorId: 'sector_test' },
  };
  const bus = createBus();
  const events = { start: [], denied: [], yield: [], optic: [], projectileHits: [] };
  bus.on('mining:start', (p) => events.start.push(p));
  bus.on('beam:denied', (p) => events.denied.push(p));
  bus.on('mining:yield', (p) => events.yield.push(p));
  bus.on('optic:contact', (p) => events.optic.push(p));
  bus.on('projectile:hit', (p) => events.projectileHits.push(p));
  let nextId = 900;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, ...spec, data: spec.data || {} };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const mining = { ...miningBase };
  mining.init({ state, bus, helpers, registry: { get: () => null } });
  return { state, bus, mining, player, events };
}

function mineDiamond() {
  return {
    id: 4,
    type: 'asteroid',
    alive: true,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 13,
    mass: 400,
    collides: true,
    data: { opticMaterial: 'diamond', typeId: 'ast_crystalline', tint: OPTIC_MATERIALS.diamond.tint },
  };
}

function mineRock() {
  return {
    id: 4,
    type: 'asteroid',
    alive: true,
    pos: { x: 60, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 400,
    hull: 140,
    hullMax: 140,
    data: { typeId: 'ast_common_rock', oreHP: 140, oreHPMax: 140, commodityId: 'cmdty_silicate' },
  };
}

function holdTicks(env, n) {
  for (let i = 0; i < n; i++) {
    env.state.input.fireGroup = 2;
    env.mining.update(SIM_DT, env.state);
    env.state.simTime += SIM_DT;
    env.state.tick += 1;
  }
}

test('the mining beam never reaches the optic grammar — a diamond is not ore', () => {
  const diamond = mineDiamond();
  const env = bootMining([diamond]);
  try {
    holdTicks(env, 90);

    assert.equal(env.events.optic.length, 0, 'no optic contact was ever settled');
    assert.equal(env.events.projectileHits.length, 0, 'the mining beam is not a projectile');
    assert.equal(env.events.start.filter((s) => s.targetId === diamond.id).length, 0,
      'the beam never locks the lattice rock');
    assert.equal(diamond.data.opticMaterial, 'diamond', 'the cell never spent');
    assert.equal(diamond.data.opticSpentAt, undefined);
    assert.equal(env.state.entityList.filter((e) => e.type === 'projectile').length, 0, 'no splinters');
    // Belt-and-suspenders: the extraction writer itself refuses optic rock.
    assert.equal(env.mining.applyMining(diamond.id, MK1.dps, SIM_DT), 0, 'applyMining stays ore-only');
  } finally {
    env.bus.clear();
  }
});

test('ore rocks are unchanged — the same beam still extracts', () => {
  const rock = mineRock();
  const env = bootMining([rock]);
  try {
    env.state.input.fireGroup = 2;
    let guard = 0;
    while (env.events.yield.length === 0 && guard++ < 180) holdTicks(env, 1);

    assert.ok(env.events.yield.length > 0, 'ore still arrives from an ordinary rock');
    assert.equal(env.events.start.length, 1);
    assert.equal(env.events.start[0].verb, 'extract');
    assert.equal(env.events.optic.length, 0, 'ore extraction never touches the optic owner');
  } finally {
    env.bus.clear();
  }
});
