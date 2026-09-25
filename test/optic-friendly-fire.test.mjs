import test from 'node:test';
import assert from 'node:assert/strict';

import { makeEntity } from '../src/core/entity.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import {
  OPTIC_LATTICE_SPACING,
  opticBookFor,
  opticChildSpec,
  opticFamilyIdOf,
  opticGenerationOf,
  settleOpticContact,
} from '../src/combat/opticField.js';
import {
  compileCeresPrismGallery,
  compileOpticCells,
  murderFieldCells,
} from '../src/data/opticStructures.js';

// "Your own grenade" (build_map §24): a prism the player lights can hit the player.
// The friendly-fire opening is SPLINTERS ONLY — the parent bolt stays owner-immune,
// and stone/metal responses are unchanged. These fixtures run the real sweep +
// combat damage route on a fixed seed, mirroring how weapons.js settles optic
// contacts before combat sees the hit.

function sweepHost(state, bus) {
  const host = Object.create(physics);
  host.init({ state, bus, helpers: {} });
  return host;
}

function bolt(id, x, z, vx, vz = 0, ownerId = 1) {
  return makeEntity({
    id,
    type: 'projectile',
    pos: { x, z },
    vel: { x: vx, z: vz },
    radius: 0.7,
    collides: true,
    ownerId,
    team: 0,
    data: {
      damage: 8,
      damageType: 'energy',
      kind: 'bullet',
      weaponId: 'wpn_pulse_laser_s',
      spawnPos: { x, z },
      maxDistance: 2000,
    },
  });
}

function opticRock(entity, body) {
  return makeEntity({
    id: entity,
    type: 'asteroid',
    pos: { x: body.x, z: body.z },
    radius: body.radius,
    collides: true,
    data: { opticMaterial: body.material },
  });
}

// Mirrors suppressHitPayload in weapons.js — the optic owner consumes the contact so
// combat never pays bolt damage on an absorb/prism/reflect.
function suppressHitPayload(payload) {
  payload.damage = 0;
  payload.damagePacket = null;
  payload.packet = null;
  payload.statuses = [];
  payload.heat = 0;
  payload.impulse = null;
}

/**
 * Wire the optic contact seam the way weapons.js does: on projectile:hit, settle the
 * contact against the family book; prism hits spawn splinter children. Registered
 * BEFORE combat.init so suppression lands first, exactly like the live bus order
 * (weapons subscribes before combat). Returns the recorded plans and every raw hit.
 */
function wireOpticGrammar(state, bus) {
  const families = new Map();
  const contacts = [];
  const hits = [];
  let nextId = 1000;
  bus.on('projectile:hit', (payload) => {
    hits.push(payload);
    const projectile = state.entities.get(payload.projectileId);
    const target = state.entities.get(payload.targetId);
    if (!projectile || projectile.type !== 'projectile' || !target) return;
    const book = opticBookFor(families, opticFamilyIdOf(projectile));
    const plan = settleOpticContact(projectile, target, payload, book);
    if (!plan) return;
    contacts.push({ plan, projectileId: payload.projectileId, targetId: payload.targetId });
    suppressHitPayload(payload);
    if (plan.kind !== 'prism') return;
    for (const ray of plan.rays) {
      const child = makeEntity({ ...opticChildSpec(projectile, ray), id: nextId++ });
      state.entityList.push(child);
      state.entities.set(child.id, child);
    }
  });
  return { families, contacts, hits };
}

function makeState(seed) {
  return {
    tick: 0,
    simTime: 0,
    meta: { seed },
    playerId: 1,
    entityList: [],
    entities: new Map(),
  };
}

function addEntity(state, entity) {
  state.entityList.push(entity);
  state.entities.set(entity.id, entity);
  return entity;
}

function addPlayer(state, x, z) {
  return addEntity(state, makeEntity({
    id: 1,
    type: 'ship',
    pos: { x, z },
    radius: 4,
    mass: 12,
    hull: 100,
    hullMax: 100,
    collides: true,
  }));
}

// Advance every live projectile one 60 Hz step (prevPos -> pos + vel*dt), then let the
// swept-hit authority resolve the segment. Mirrors the stepping loops in
// optic-field.test.mjs; positions are integrated by flight elsewhere in the real sim.
function runTicks(host, state, ticks) {
  for (let i = 0; i < ticks; i++) {
    for (const e of state.entityList) {
      if (e.type !== 'projectile' || e.alive === false) continue;
      e.prevPos.x = e.pos.x;
      e.prevPos.z = e.pos.z;
      e.pos.x += (Number(e.vel && e.vel.x) || 0) / 60;
      e.pos.z += (Number(e.vel && e.vel.z) || 0) / 60;
    }
    state.tick += 1;
    state.simTime = state.tick / 60;
    host.sweepProjectiles(1 / 60, state);
  }
}

test('a shot into an enclosing diamond field sends its own splinters back through the shooter', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);

  // The enclosure: a 3x3 diamond block on the 64 lattice with the player's own cell
  // left hollow — the same murderFieldCells recipe the authored fields use.
  const cells = new Map();
  murderFieldCells(cells, -1, -1, 3, 3);
  cells.delete('0,0');
  const bodies = compileOpticCells([...cells.values()]);
  bodies.forEach((body, i) => addEntity(state, opticRock(10 + i, body)));
  const player = addPlayer(state, 0, 0);

  const shot = addEntity(state, bolt(2, 20, 0, 300));
  runTicks(host, state, 60);

  // The bolt prismed on the east diamond and died; the ring it lit came back.
  assert.equal(shot.alive, false);
  const prism = grammar.contacts.find((c) => c.plan.kind === 'prism');
  assert.ok(prism, 'the bolt must prism on the surrounding diamond');
  assert.equal(prism.projectileId, shot.id);

  const selfHits = grammar.hits.filter((h) => h.targetId === player.id);
  assert.ok(selfHits.length > 0, 'a splinter must reach the shooter');
  for (const hit of selfHits) {
    const projectile = state.entities.get(hit.projectileId);
    assert.ok(
      projectile && opticGenerationOf(projectile) > 0,
      'only a splinter (generation >= 1) may hit the shooter — never the parent bolt',
    );
    assert.equal(projectile.ownerId, player.id, 'the splinter is the shooter\'s own');
  }
  assert.ok(player.hull < player.hullMax, `own ring cut the shooter's hull (hull ${player.hull})`);
  assert.ok(player.hull > 0, 'one splinter grazes, it does not delete the player');
});

test('a shot down the Ceres fuse does not hurt the shooter — the stone wall holds the ring', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);

  const bodies = compileCeresPrismGallery();
  const mouth = bodies.find((body) => body.ix === 0 && body.iz === 0);
  const next = bodies.find((body) => body.ix === 1 && body.iz === 0);
  const rocks = bodies.map((body, i) => addEntity(state, opticRock(10 + i, body)));
  const mouthEntity = rocks[bodies.indexOf(mouth)];

  // The shooter stands in the open mouth lane, a half-cell off the axis. The bolt
  // still travels straight down the fuse into the mouth — but the door the rear fan
  // escapes through (the mouth's 135/180/225-degree headings) misses this hull,
  // while every heading the stone walls hold dies inside the lattice.
  const laneZ = mouth.z + OPTIC_LATTICE_SPACING * 0.1875; // +12: inside the mouth, off the rear fan
  const player = addPlayer(state, mouth.x - 90, laneZ);
  const shot = addEntity(state, bolt(2, mouth.x - 90, laneZ, 300));
  runTicks(host, state, 300);

  // The fuse burned: the mouth prismed and the chain walked forward down the wick.
  const prismContacts = grammar.contacts.filter((c) => c.plan.kind === 'prism');
  assert.ok(prismContacts.length >= 2, `the fuse must chain (got ${prismContacts.length} prisms)`);
  assert.equal(prismContacts[0].targetId, mouthEntity.id, 'the shot enters through the gallery mouth');
  const family = grammar.families.get(opticFamilyIdOf(shot));
  const visitedCells = bodies.filter((body, i) => family.visited.has(String(rocks[i].id)));
  assert.ok(
    visitedCells.some((body) => body.ix === next.ix && body.iz === next.iz),
    'the forward splinter must light the next fuse diamond',
  );

  // The ring was held: at least one splinter died in the lane's stone wall, and no
  // splinter — including the three that leave through the open mouth — found the shooter.
  const stoneAbsorbs = grammar.contacts.filter((c) => c.plan.kind === 'absorb' && c.plan.reason === 'stone');
  assert.ok(stoneAbsorbs.length > 0, 'stone must eat at least one contained splinter');
  const selfHits = grammar.hits.filter((h) => h.targetId === player.id);
  assert.equal(selfHits.length, 0, 'no splinter reaches a shooter off the open rear headings');
  assert.equal(player.hull, player.hullMax, 'the fuse shot leaves the shooter untouched');
});

test('the parent bolt is still owner-immune — only splinters carry the grenade rule', () => {
  const state = makeState(4242);
  const bus = createBus();
  const grammar = wireOpticGrammar(state, bus);
  combat.init({ state, bus, helpers: {}, registry: { get() { return null; } } });
  const host = sweepHost(state, bus);

  const player = addPlayer(state, 0, 0);
  // A generation-0 energy bolt fired across the owner's hull, clear of any lattice.
  const shot = addEntity(state, bolt(2, -40, 0, 300));
  runTicks(host, state, 20);

  assert.equal(shot.alive, true, 'the owner-immune bolt keeps flying');
  assert.ok(shot.pos.x > player.pos.x, 'the bolt crossed the owner without contact');
  assert.equal(grammar.hits.filter((h) => h.targetId === player.id).length, 0);
  assert.equal(player.hull, player.hullMax);
});
