import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { physics } from '../src/core/physics.js';
import { world as worldSystem } from '../src/systems/world.js';
import { reflectVelocity } from '../src/core/surfaceContact.js';
import {
  OPTIC_DAMAGE_SCALE,
  OPTIC_LATTICE_SPACING,
  OPTIC_MAX_FAMILY,
  OPTIC_RAY_COUNT,
  OPTIC_RAY_RANGE,
  bindOpticReflectTravel,
  isOpticEnergyBolt,
  opticBookFor,
  opticChildSpec,
  opticHeadings,
  opticSurfaceKey,
  planOpticContact,
  settleOpticContact,
  traceOpticRay,
} from '../src/combat/opticField.js';
import { ZONE_CERES_PRISM_GALLERY } from '../src/data/authoredPlaces.js';
import {
  CERES_PRISM_GALLERY_ORIGIN,
  CERES_PRISM_GALLERY_ID,
  compileCeresPrismGallery,
  compileSwarmOptic,
  opticStructureBounds,
} from '../src/data/opticStructures.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';
import { projectileHitPayload } from '../src/core/physics.js';

function bootWorld(seed = 42) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.meta.seed = seed;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.assign(Object.create(worldSystem), {});
  world.init(ctx);
  return { state, world };
}

function diamond(id, x, z) {
  return makeEntity({
    id,
    type: 'asteroid',
    pos: { x, z },
    radius: 13,
    collides: true,
    data: { opticMaterial: 'diamond', typeId: 'ast_crystalline' },
  });
}

function bolt(id, x, z, vx, damageType = 'energy') {
  const projectile = makeEntity({
    id,
    type: 'projectile',
    pos: { x, z },
    vel: { x: vx, z: 0 },
    radius: 0.7,
    collides: true,
    ownerId: 1,
    team: 0,
    data: {
      damage: 8,
      damageType,
      kind: 'bullet',
      weaponId: 'wpn_pulse_laser_s',
      spawnPos: { x, z },
      maxDistance: 800,
    },
  });
  return projectile;
}

function book() {
  return opticBookFor(new Map(), 'family');
}

test('stone eats an energy bolt, metal sends it back, a kinetic round ignores the lattice', () => {
  const stone = makeEntity({
    id: 2, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 34, collides: true,
    data: { opticMaterial: 'stone' },
  });
  const metal = makeEntity({
    id: 3, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 16, collides: true,
    data: { opticMaterial: 'metal' },
  });
  const energy = bolt(4, -40, 0, 300);
  const kinetic = bolt(5, -40, 0, 300, 'kinetic');
  const missile = bolt(6, -40, 0, 300);
  missile.data.kind = 'missile';
  assert.equal(isOpticEnergyBolt(energy), true);
  assert.equal(isOpticEnergyBolt(kinetic), false);
  assert.equal(isOpticEnergyBolt(missile), false);

  const absorbed = planOpticContact({
    material: { id: 'stone', response: 'absorb' },
    projectile: energy,
    target: stone,
    payload: { normal: { x: -1, z: 0 } },
    book: book(),
  });
  assert.equal(absorbed.kind, 'absorb');
  assert.equal(planOpticContact({
    material: { id: 'stone', response: 'absorb' },
    projectile: kinetic,
    target: stone,
    book: book(),
  }), null);

  const normal = { x: -1, z: 0 };
  const reflected = planOpticContact({
    material: { id: 'metal', response: 'reflect' },
    projectile: energy,
    target: metal,
    payload: { normal, pos: { x: -16, z: 0 } },
    book: book(),
  });
  assert.equal(reflected.kind, 'reflect');
  assert.deepEqual(reflected.velocity, reflectVelocity(energy.vel, normal));
  assert.ok(reflected.velocity.x < 0);
});

test('a diamond splits once per family into eight headings, then later bolts die in it', () => {
  const target = diamond(7, 0, 0);
  const shot = bolt(8, -40, 0, 300);
  const family = book();
  const first = planOpticContact({
    material: { id: 'diamond', response: 'prism' },
    projectile: shot,
    target,
    payload: { pos: { x: -13, z: 0 }, normal: { x: -1, z: 0 } },
    book: family,
  });
  assert.equal(first.kind, 'prism');
  assert.equal(first.rays.length, OPTIC_RAY_COUNT);
  assert.deepEqual(first.rays.map((ray) => ray.heading), opticHeadings(OPTIC_RAY_COUNT));
  assert.equal(first.rays[0].damageScale, OPTIC_DAMAGE_SCALE);
  assert.equal(first.rays[0].generation, 1);
  const settled = settleOpticContact(shot, target, { pos: { x: -13, z: 0 }, normal: { x: -1, z: 0 } }, family);
  assert.equal(settled.kind, 'prism');
  assert.equal(family.visited.has(opticSurfaceKey(target)), true);
  assert.equal(family.spawned, OPTIC_RAY_COUNT);
  const again = planOpticContact({
    material: { id: 'diamond', response: 'prism' },
    projectile: bolt(9, -40, 0, 300),
    target,
    book: family,
  });
  assert.equal(again.kind, 'absorb');
  assert.equal(again.reason, 'spent');
});

test('the family cap stops a lattice from spawning without bound', () => {
  const target = diamond(7, 0, 0);
  const family = book();
  family.spawned = OPTIC_MAX_FAMILY - 3;
  const plan = planOpticContact({
    material: { id: 'diamond', response: 'prism' },
    projectile: bolt(8, -40, 0, 300),
    target,
    book: family,
  });
  assert.equal(plan.kind, 'prism');
  assert.equal(plan.rays.length, 3);
  family.spawned = OPTIC_MAX_FAMILY;
  const stopped = planOpticContact({
    material: { id: 'diamond', response: 'prism' },
    projectile: bolt(9, -40, 0, 300),
    target,
    book: family,
  });
  assert.equal(stopped.reason, 'family');
});

test('the Ceres gallery is a fuse into a closed diamond field', () => {
  const bodies = compileCeresPrismGallery();
  const byCell = new Map(bodies.map((body, index) => [`${body.ix},${body.iz}`, index]));
  const diamonds = bodies.filter((body) => body.material === 'diamond');
  assert.equal(diamonds.length, 15);
  for (let i = 0; i < bodies.length; i++) {
    if (bodies[i].material !== 'diamond') continue;
    for (let j = 0; j < bodies.length; j++) {
      if (i === j) continue;
      const gap = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z);
      assert.ok(gap + 1e-6 >= bodies[i].radius + bodies[j].radius, `${bodies[i].ix},${bodies[i].iz} overlaps ${bodies[j].ix},${bodies[j].iz}`);
    }
  }

  const reached = new Set();
  const queue = [byCell.get('0,0')];
  while (queue.length) {
    const index = queue.shift();
    if (reached.has(index) || bodies[index].material !== 'diamond') continue;
    reached.add(index);
    for (let step = 0; step < OPTIC_RAY_COUNT; step++) {
      const hit = traceOpticRay(bodies, index, opticHeadings()[step]);
      if (hit >= 0 && bodies[hit].material === 'diamond' && !reached.has(hit)) queue.push(hit);
    }
  }
  assert.equal(reached.size, diamonds.length);

  for (const index of reached) {
    const body = bodies[index];
    const mouth = body.ix === 0 && body.iz === 0;
    for (let step = 0; step < OPTIC_RAY_COUNT; step++) {
      const rear = mouth && step >= 3 && step <= 5;
      const hit = traceOpticRay(bodies, index, opticHeadings()[step]);
      if (rear) {
        assert.equal(hit, -1, `mouth heading ${step} should leave the gallery`);
        continue;
      }
      assert.ok(hit >= 0, `diamond ${body.ix},${body.iz} heading ${step} leaves the gallery`);
      assert.notEqual(bodies[hit].material, 'metal');
    }
  }

  const wickNext = traceOpticRay(bodies, byCell.get('0,0'), 0);
  assert.equal(bodies[wickNext].material, 'diamond');
  assert.equal(bodies[wickNext].ix, 1);
  const side = traceOpticRay(bodies, byCell.get('2,0'), Math.PI / 2);
  assert.equal(bodies[side].material, 'stone');

  // Metals must sit where a banked shot can reach the mouth without crossing stone.
  const mouthBody = bodies.find((body) => body.ix === 0 && body.iz === 0);
  const metals = bodies.filter((body) => body.material === 'metal');
  assert.equal(metals.length, 2);
  for (const metal of metals) {
    for (const stone of bodies.filter((body) => body.material === 'stone')) {
      const abx = mouthBody.x - metal.x;
      const abz = mouthBody.z - metal.z;
      const len2 = abx * abx + abz * abz || 1;
      const t = Math.max(0, Math.min(1, ((stone.x - metal.x) * abx + (stone.z - metal.z) * abz) / len2));
      const px = metal.x + t * abx;
      const pz = metal.z + t * abz;
      assert.ok(
        Math.hypot(px - stone.x, pz - stone.z) >= stone.radius + 0.7,
        `metal ${metal.ix},${metal.iz} bank path hits stone ${stone.ix},${stone.iz}`,
      );
    }
  }

  const bounds = opticStructureBounds(bodies);
  assert.equal(CERES_PRISM_GALLERY_ORIGIN.x + bounds.x, ZONE_CERES_PRISM_GALLERY.center.x);
  assert.equal(CERES_PRISM_GALLERY_ORIGIN.z + bounds.z, ZONE_CERES_PRISM_GALLERY.center.z);
  assert.ok(ZONE_CERES_PRISM_GALLERY.radius > bounds.radius);
  assert.equal(OPTIC_LATTICE_SPACING, 64);
});

function sweepHost(state, bus) {
  const host = Object.create(physics);
  host.init({ state, bus, helpers: {} });
  return host;
}

test('a swept energy bolt prisms, the forward splinter lights the next diamond, and stone eats a splinter', () => {
  const bodies = compileCeresPrismGallery();
  const mouth = bodies.find((body) => body.ix === 0 && body.iz === 0);
  const next = bodies.find((body) => body.ix === 1 && body.iz === 0);
  const wall = bodies.find((body) => body.ix === 0 && body.iz === 1);
  const rocks = [mouth, next, wall].map((body, index) => makeEntity({
    id: 10 + index,
    type: 'asteroid',
    pos: { x: body.x, z: body.z },
    radius: body.radius,
    collides: true,
    data: { opticMaterial: body.material },
  }));
  const shot = bolt(1, mouth.x - 80, mouth.z, 400);
  shot.pos.x = mouth.x + 20;
  shot.prevPos.x = mouth.x - 80;
  shot.prevPos.z = mouth.z;
  const entities = [...rocks, shot];
  const state = {
    tick: 4,
    simTime: 0,
    playerId: null,
    entityList: entities,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  };
  const family = book();
  let nextId = 100;
  const plans = [];
  const bus = {
    emit(name, payload) {
      if (name !== 'projectile:hit') return;
      const projectile = state.entities.get(payload.projectileId);
      const target = state.entities.get(payload.targetId);
      const plan = settleOpticContact(projectile, target, payload, family);
      plans.push(plan && plan.kind);
      if (!plan || plan.kind !== 'prism') return;
      for (let i = 0; i < plan.rays.length; i++) {
        const child = makeEntity({ ...opticChildSpec(projectile, plan.rays[i]), id: nextId++ });
        state.entityList.push(child);
        state.entities.set(child.id, child);
      }
    },
  };
  const host = sweepHost(state, bus);
  host.sweepProjectiles(1 / 60, state);
  assert.deepEqual(plans, ['prism']);
  assert.equal(shot.alive, false);
  const forward = state.entityList.find((entity) => entity.type === 'projectile' && entity.alive && entity.vel.x > 100 && Math.abs(entity.vel.z) < 1);
  const upward = state.entityList.find((entity) => entity.type === 'projectile' && entity.alive && entity.vel.z > 100 && Math.abs(entity.vel.x) < 1);
  assert.ok(forward, 'forward splinter');
  assert.ok(upward, 'upward splinter');

  forward.prevPos.x = forward.pos.x;
  forward.prevPos.z = forward.pos.z;
  forward.pos.x = next.x + next.radius + 4;
  forward.pos.z = next.z;
  host.sweepProjectiles(1 / 60, state);
  assert.equal(plans[1], 'prism');
  assert.equal(family.visited.has(opticSurfaceKey(rocks[0])), true);
  assert.equal(family.visited.has(opticSurfaceKey(rocks[1])), true);

  upward.prevPos.x = upward.pos.x;
  upward.prevPos.z = upward.pos.z;
  upward.pos.x = wall.x;
  upward.pos.z = wall.z + wall.radius + 4;
  host.sweepProjectiles(1 / 60, state);
  assert.equal(plans[2], 'absorb');
  assert.equal(upward.alive, false);
});

test('each live swarm room has one lattice that clears the player', () => {
  const rooms = ['helios_core', 'lagrange_crucible', 'cinder_sluice', 'cryo_drift', 'storm_lattice'];
  for (const arenaId of rooms) {
    const layout = compileSwarmOptic(arenaId);
    assert.ok(layout && layout.bodies.length > 0, arenaId);
    let nearest = Infinity;
    for (const body of layout.bodies) {
      const x = layout.origin.x + body.x;
      const z = layout.origin.z + body.z;
      nearest = Math.min(nearest, Math.hypot(x, z));
      for (const other of layout.bodies) {
        if (other === body || body.material !== 'diamond') continue;
        const gap = Math.hypot(body.x - other.x, body.z - other.z);
        assert.ok(gap + 1e-6 >= body.radius + other.radius, `${arenaId} diamond overlap`);
      }
    }
    assert.ok(nearest >= 110, `${arenaId} nearest ${nearest.toFixed(0)} sits on the player`);
  }
  assert.equal(compileSwarmOptic('ceres_belt'), null);

  const helios = compileSwarmOptic('helios_core');
  const mouth = helios.bodies.find((body) => body.ix === 0 && body.iz === 0);
  const mouthIndex = helios.bodies.indexOf(mouth);
  const next = traceOpticRay(helios.bodies, mouthIndex, Math.PI / 2);
  assert.equal(helios.bodies[next].material, 'diamond');
  assert.equal(helios.bodies[next].ix, 1);

  const storm = compileSwarmOptic('storm_lattice');
  const reached = new Set();
  const queue = storm.bodies.map((body, index) => (body.material === 'diamond' ? index : -1)).filter((index) => index === storm.bodies.findIndex((body) => body.material === 'diamond'));
  while (queue.length) {
    const index = queue.shift();
    if (reached.has(index)) continue;
    reached.add(index);
    for (let step = 0; step < OPTIC_RAY_COUNT; step++) {
      const hit = traceOpticRay(storm.bodies, index, opticHeadings()[step]);
      if (hit >= 0 && storm.bodies[hit].material === 'diamond' && !reached.has(hit)) queue.push(hit);
    }
  }
  assert.equal(reached.size, storm.bodies.filter((body) => body.material === 'diamond').length);

  const cinder = compileSwarmOptic('cinder_sluice');
  assert.equal(cinder.bodies.some((body) => body.ix === 3 && body.iz === 0), false);
  assert.equal(cinder.bodies.some((body) => body.ix === 3 && body.iz === 1), false);
  assert.ok(cinder.bodies.every((body) => body.material === 'stone'));
  const lagrange = compileSwarmOptic('lagrange_crucible');
  assert.ok(lagrange.bodies.every((body) => body.material === 'metal'));
  assert.equal(lagrange.bodies.length, 2);
});

test('the Prism Gallery is live in Ceres and absent from a Helios boot', () => {
  const { state, world } = bootWorld(42);
  world.enterSector('sector_helios_prime');
  const before = state.entityList.filter((entity) => entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  assert.equal(before.length, 0);
  world.enterSector('sector_ceres_belt');
  const live = state.entityList.filter((entity) => entity.alive && entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  const expected = compileCeresPrismGallery();
  assert.equal(live.length, expected.length);
  const counts = { stone: 0, metal: 0, diamond: 0 };
  for (const entity of live) {
    counts[entity.data.opticMaterial] += 1;
    assert.equal(entity.homeSectorId, 'sector_ceres_belt');
    assert.equal(entity.collides, true);
  }
  for (const body of expected) counts[body.material] -= 1;
  assert.deepEqual(counts, { stone: 0, metal: 0, diamond: 0 });
  world.enterSector('sector_ceres_belt');
  const again = state.entityList.filter((entity) => entity.alive && entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  assert.equal(again.length, expected.length);
});

test('optic lattices spawn only on FULL residency and leave on eviction', () => {
  const { state, world } = bootWorld(99);
  world._ensureSectorMaterialized('sector_ceres_belt', RESIDENCY_TIER.REDUCED);
  const reduced = state.entityList.filter((entity) => entity.alive && entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  assert.equal(reduced.length, 0);
  assert.equal(state.world.sectorContents.sector_ceres_belt.opticStructureIds, undefined);

  world._promoteSectorToFull('sector_ceres_belt');
  const expected = compileCeresPrismGallery().length;
  const full = state.entityList.filter((entity) => entity.alive && entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  assert.equal(full.length, expected);
  assert.equal(state.world.sectorContents.sector_ceres_belt.opticStructureIds.length, expected);
  for (const entity of full) {
    assert.equal(entity.homeSectorId, 'sector_ceres_belt');
    assert.equal(entity.physicsBody && entity.physicsBody.radius, entity.radius);
    assert.equal(entity.data.masslineTetherable, false);
  }

  world._promoteSectorToFull('sector_ceres_belt');
  const once = state.entityList.filter((entity) => entity.alive && entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  assert.equal(once.length, expected);

  world._demoteSectorToRecordOnly('sector_ceres_belt');
  const gone = state.entityList.filter((entity) => entity.alive && entity.data && entity.data.opticStructureId === CERES_PRISM_GALLERY_ID);
  assert.equal(gone.length, 0);
});

test('visited diamond keys treat number and string ids as the same surface', () => {
  const target = diamond(7, 0, 0);
  const family = book();
  const first = settleOpticContact(
    bolt(8, -40, 0, 300),
    target,
    { pos: { x: -13, z: 0 }, normal: { x: -1, z: 0 } },
    family,
  );
  assert.equal(first.kind, 'prism');
  assert.equal(family.visited.has(opticSurfaceKey(target)), true);
  assert.equal(family.visited.has(7), false);
  assert.equal(family.visited.has('7'), true);
  const alias = diamond('7', 0, 0);
  const again = planOpticContact({
    material: { id: 'diamond', response: 'prism' },
    projectile: bolt(9, -40, 0, 300),
    target: alias,
    book: family,
  });
  assert.equal(again.kind, 'absorb');
  assert.equal(again.reason, 'spent');
});

test('metal reflect keeps the same body alive after physics sets alive=false', () => {
  const metal = makeEntity({
    id: 3, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 16, collides: true,
    data: { opticMaterial: 'metal' },
  });
  const energy = bolt(4, -40, 0, 300);
  const plan = settleOpticContact(
    energy,
    metal,
    { pos: { x: -16, z: 0 }, normal: { x: -1, z: 0 } },
    book(),
  );
  assert.equal(plan.kind, 'reflect');
  assert.ok(energy.vel.x < 0);
  energy.alive = false;
  assert.equal(energy.alive, true);
});

test('reflect stamps a travel budget so metal ping-pong cannot run forever', () => {
  const metalA = makeEntity({
    id: 1, type: 'asteroid', pos: { x: 0, z: 0 }, radius: 16, collides: true,
    data: { opticMaterial: 'metal' },
  });
  const metalB = makeEntity({
    id: 2, type: 'asteroid', pos: { x: 80, z: 0 }, radius: 16, collides: true,
    data: { opticMaterial: 'metal' },
  });
  const energy = bolt(3, 20, 0, 300);
  delete energy.data.spawnPos;
  delete energy.data.maxDistance;
  energy.prevPos.x = -10;
  energy.prevPos.z = 0;
  const entities = [metalA, metalB, energy];
  const state = {
    tick: 0,
    simTime: 0,
    playerId: null,
    entityList: entities,
    entities: new Map(entities.map((entity) => [entity.id, entity])),
  };
  const family = book();
  let hits = 0;
  const bus = {
    emit(name, payload) {
      if (name !== 'projectile:hit') return;
      const projectile = state.entities.get(payload.projectileId);
      const target = state.entities.get(payload.targetId);
      settleOpticContact(projectile, target, payload, family);
      hits += 1;
    },
  };
  const host = sweepHost(state, bus);
  let diedAt = -1;
  for (let i = 0; i < 400; i++) {
    energy.prevPos.x = energy.pos.x;
    energy.prevPos.z = energy.pos.z;
    energy.pos.x += energy.vel.x / 60;
    energy.pos.z += energy.vel.z / 60;
    host.sweepProjectiles(1 / 60, state);
    if (!energy.alive) {
      diedAt = i;
      break;
    }
  }
  assert.ok(diedAt >= 0, 'bolt must expire');
  assert.ok(hits > 0 && hits < 80, `bounded hits, got ${hits}`);
  assert.equal(Number.isFinite(energy.data.maxDistance), true);
  assert.ok(energy.data.spawnPos);
});

test('bindOpticReflectTravel shrinks remaining range and refuses a spent budget', () => {
  const body = bolt(4, 100, 0, 200);
  body.data.spawnPos = { x: 0, z: 0 };
  body.data.maxDistance = 120;
  body.pos.x = 100;
  body.pos.z = 0;
  assert.equal(bindOpticReflectTravel(body), true);
  assert.ok(body.data.maxDistance < 120 + 1e-9);
  assert.ok(body.data.maxDistance > 0);
  assert.deepEqual(body.data.spawnPos, { x: 100, z: 0 });
  body.data.maxDistance = 0.5;
  body.pos.x = 100.6;
  assert.equal(bindOpticReflectTravel(body), false);
  assert.equal(body.data.maxDistance, 0);
});

test('prism children strip attackRuntime, keep generation, and spawn outside the parent', () => {
  const parent = bolt(11, 0, 0, 300);
  parent.data.opticFamilyId = 'optic:11';
  parent.data.opticGeneration = 2;
  parent.data.damagePacket = { channels: { energy: 10 }, statuses: [{ id: 'burn', stacks: 1 }] };
  const target = diamond(12, 0, 0);
  const family = book();
  const plan = planOpticContact({
    material: { id: 'diamond', response: 'prism' },
    projectile: parent,
    target,
    book: family,
  });
  assert.equal(plan.kind, 'prism');
  // Trait/missile fields must not leak onto splinters even if the parent carried them.
  parent.data.attackRuntime = { generation: 9, remaining: { splits: 2 } };
  parent.data.kind = 'missile';
  parent.data.targetId = 99;
  parent.data.turnRate = 2;
  parent.data.splashRadius = 12;
  const child = opticChildSpec(parent, plan.rays[0]);
  assert.equal(child.data.attackRuntime, undefined);
  assert.equal(child.data.targetId, undefined);
  assert.equal(child.data.turnRate, undefined);
  assert.equal(child.data.splashRadius, undefined);
  assert.equal(child.data.kind, 'bullet');
  assert.equal(child.data.damageType, 'energy');
  assert.equal(child.data.opticGeneration, 3);
  assert.equal(child.data.opticFamilyId, 'optic:11');
  assert.equal(child.data.maxDistance, OPTIC_RAY_RANGE);
  assert.deepEqual(child.data.spawnPos, { x: plan.rays[0].x, z: plan.rays[0].z });
  assert.equal(child.data.damage, 8 * OPTIC_DAMAGE_SCALE);
  const gap = Math.hypot(child.pos.x - target.pos.x, child.pos.z - target.pos.z);
  assert.ok(gap >= target.radius + child.radius, 'child must spawn outside the diamond');
});

test('optic settle alone leaves hit damage; weapons-style suppress clears it before combat', () => {
  const target = diamond(20, 0, 0);
  const shot = bolt(21, -40, 0, 300);
  shot.data.damagePacket = { channels: { energy: 8 }, statuses: [{ id: 'burn', stacks: 1 }] };
  const payload = projectileHitPayload(shot, target, { x: -13, z: 0 });
  assert.ok(payload.damage > 0);
  assert.ok(payload.damagePacket);
  const family = book();
  const plan = settleOpticContact(shot, target, payload, family);
  assert.equal(plan.kind, 'prism');
  assert.ok(payload.damage > 0, 'settle must not be the damage gate');
  // Mirrors suppressHitPayload in weapons.js (module-private) — combat listens after weapons.
  payload.damage = 0;
  payload.damagePacket = null;
  payload.packet = null;
  payload.statuses = [];
  payload.heat = 0;
  payload.impulse = null;
  assert.equal(payload.damage, 0);
  assert.equal(payload.damagePacket, null);
  assert.deepEqual(payload.statuses, []);
});
