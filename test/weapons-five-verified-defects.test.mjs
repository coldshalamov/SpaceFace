import test from 'node:test';
import assert from 'node:assert/strict';

import { compileAttackSpec } from '../src/combat/attackSpec.js';
import { createLineage, resetLineageIds } from '../src/combat/attackLineage.js';
import { handlePayloadSectorTransition, spawnPayloadEntity } from '../src/combat/industrialBeam.js';
import { createSurfaceContactReceipt } from '../src/core/surfaceContact.js';
import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { weapons } from '../src/systems/weapons.js';

function compile(modifiers) {
  const result = compileAttackSpec({ weaponId: 'wpn_pulse_laser_s', modifiers });
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  return result.spec;
}

function channelSum(packet) {
  const channels = packet && packet.channels ? packet.channels : {};
  let total = 0;
  for (const value of Object.values(channels)) total += Number(value) || 0;
  return total;
}

function paidHitsOf(rows) {
  return rows.filter((row) => (Number(row.damage) || 0) > 0 || channelSum(row.packet) > 0);
}

function makeHarness(overrides = {}) {
  const bus = createBus();
  const entities = new Map();
  const entityList = [];
  let seq = 1;
  const spawned = [];
  const hops = [];
  const paidHits = [];
  const state = {
    mode: 'flight',
    tick: 10,
    nextEntityId: 100,
    playerId: 'player',
    player: { tether: { targetId: null } },
    meta: { seed: 1 },
    entities,
    entityList,
    combat: { beams: [], entities: {} },
    ...(overrides.state || {}),
  };
  if (!state.entities) state.entities = entities;
  if (!state.entityList) state.entityList = entityList;
  const helpers = {
    hash32,
    mulberry32,
    getEntity: (id) => state.entities.get(id) || null,
    spawnEntity: (spec) => {
      const id = spec.id || `spawn-${seq++}`;
      const entity = { alive: true, ...spec, id };
      if (!entity.pos) entity.pos = { x: 0, z: 0 };
      if (!entity.vel) entity.vel = { x: 0, z: 0 };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
    routeCombatDamage: (req) => {
      hops.push(req);
      return { ok: true };
    },
    ...(overrides.helpers || {}),
  };
  const system = Object.create(weapons);
  system.init({ state, bus, helpers });
  bus.on('projectile:hit', (payload) => {
    paidHits.push({
      targetId: payload && payload.targetId,
      damage: payload && payload.damage,
      packet: payload && (payload.damagePacket || payload.packet),
    });
  });
  return { bus, state, helpers, system, spawned, hops, paidHits };
}

function registerBolt(harness, spec, runtime, extras = {}) {
  const damage = extras.damage == null ? 8 : extras.damage;
  const projectile = {
    id: extras.id || 'bolt-1',
    type: 'projectile',
    alive: true,
    ownerId: extras.ownerId || 'player',
    team: extras.team == null ? 0 : extras.team,
    pos: extras.pos || { x: 0, z: 0 },
    vel: extras.vel || { x: 12, z: 0 },
    rot: extras.rot || 0,
    radius: 0.7,
    mass: 0.1,
    ttl: 2,
    data: {
      damage,
      damagePacket: extras.damagePacket || { channels: { energy: damage } },
      weaponId: 'wpn_pulse_laser_s',
      maxDistance: extras.maxDistance || 600,
    },
  };
  harness.state.entities.set(projectile.id, projectile);
  harness.state.entityList.push(projectile);
  harness.system._attackLive.set(projectile.id, { spec, runtime });
  return projectile;
}

function putShip(harness, spec) {
  const ship = {
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    ...spec,
  };
  harness.state.entities.set(ship.id, ship);
  harness.state.entityList.push(ship);
  return ship;
}

test('defect 1: pierce re-hit protection stops a second paid hit on the same target', () => {
  resetLineageIds(1);
  const spec = compile([['mod_piercing_core', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const harness = makeHarness();
  const target = putShip(harness, { id: 'raider-a', pos: { x: 4, z: 0 } });
  registerBolt(harness, spec, runtime, { pos: { x: 4, z: 0 } });
  const hit = {
    targetId: target.id,
    ownerId: 'player',
    damage: 8,
    damagePacket: { channels: { energy: 8 } },
    pos: { x: 4, z: 0 },
  };
  harness.bus.emit('projectile:hit', { ...hit, damagePacket: { channels: { energy: 8 } } });
  harness.bus.emit('projectile:hit', { ...hit, damagePacket: { channels: { energy: 8 } } });
  assert.equal(paidHitsOf(harness.paidHits).length, 1, JSON.stringify(harness.paidHits));
});

test('defect 2: Forked Core split has a production caller that spawns two weaker children', () => {
  resetLineageIds(1);
  const spec = compile([['mod_forked_core', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const harness = makeHarness();
  const target = putShip(harness, { id: 'raider-a', pos: { x: 2, z: 0 } });
  registerBolt(harness, spec, runtime, { vel: { x: 12, z: 0 }, pos: { x: 2, z: 0 } });
  harness.bus.emit('projectile:hit', {
    targetId: target.id,
    ownerId: 'player',
    damage: 8,
    damagePacket: { channels: { energy: 8 } },
    pos: { x: 2, z: 0 },
  });
  const children = harness.spawned.filter((row) => row.type === 'projectile');
  assert.equal(children.length, 2, `spawned ${children.length}`);
  assert.equal(runtime.remaining.splits, 0);
  for (const child of children) {
    assert.equal(child.data.damage, 8 * 0.55);
    assert.equal(child.data.damagePacket.channels.energy, 8 * 0.55);
    assert.ok(harness.system._attackLive.has(child.id));
  }
  assert.notEqual(children[0].vel.z, children[1].vel.z, 'children must fan so they do not stack');
  assert.ok(runtime.budget.consumed >= 4, JSON.stringify(runtime.budget));
});

test('defect 3: Smart Bank steering receives live hostiles from the weapons hit bridge', () => {
  resetLineageIds(1);
  const spec = compile([['mod_bank_shot', 1], ['mod_smart_bank', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const harness = makeHarness();
  const plate = {
    id: 'plate-a',
    type: 'station',
    alive: true,
    surfaceMaterial: 'reflective',
    pos: { x: 12, z: 0 },
  };
  harness.state.entities.set(plate.id, plate);
  harness.state.entityList.push(plate);
  putShip(harness, { id: 'raider-near', pos: { x: -8, z: 1 }, team: 1, score: 0 });
  const projectile = registerBolt(harness, spec, runtime, {
    pos: { x: 10, z: 0 },
    vel: { x: 12, z: 0 },
  });
  const receipt = createSurfaceContactReceipt({
    point: { x: 10, z: 0 },
    normal: { x: -1, z: 0 },
    material: 'reflective',
    velocity: { x: 12, z: 0 },
    tick: 10,
    projectileId: projectile.id,
    surfaceId: plate.id,
  });
  harness.bus.emit('projectile:hit', {
    targetId: plate.id,
    ownerId: 'player',
    damage: 8,
    pos: { x: 10, z: 0 },
    receipt,
  });
  assert.ok(projectile.vel.z !== 0, `expected steered z, got ${JSON.stringify(projectile.vel)}`);
});

test('defect 4: Tether Capacitor scale is applied to the event payload and hop packet', () => {
  resetLineageIds(1);
  const spec = compile([['mod_tether_capacitor', 1], ['mod_relay_arc', 1]]);
  const runtime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const hops = [];
  const harness = makeHarness({
    helpers: {
      routeCombatDamage: (req) => {
        hops.push(req);
        return { ok: true };
      },
    },
  });
  const first = putShip(harness, { id: 'raider-a', pos: { x: 0, z: 0 }, team: 1 });
  const anchor = putShip(harness, { id: 'raider-b', pos: { x: 20, z: 0 }, team: 1, score: 4 });
  harness.state.player.tether.targetId = anchor.id;
  const projectile = registerBolt(harness, spec, runtime, { pos: { x: 0, z: 0 } });
  const event = {
    targetId: first.id,
    ownerId: 'player',
    damage: 8,
    damagePacket: { channels: { energy: 8 } },
    pos: { x: 0, z: 0 },
  };
  harness.bus.emit('projectile:hit', event);
  assert.equal(event.damage, 8, 'first contact is not the tether anchor, so it stays unscaled');
  assert.ok(hops.length >= 1, 'relay arc must hop');
  const hopToAnchor = hops.find((row) => row.targetId === anchor.id);
  assert.ok(hopToAnchor, JSON.stringify(hops));
  assert.equal(channelSum(hopToAnchor.packet), 12);
  assert.equal(projectile.data.damagePacket.channels.energy, 8, 'projectile packet must stay unscaled');

  resetLineageIds(1);
  const directRuntime = createLineage({ spec, createdTick: 10, sourceEntityId: 'player' });
  const direct = makeHarness();
  const tethered = putShip(direct, { id: 'anchor-ship', pos: { x: 3, z: 0 }, team: 1 });
  direct.state.player.tether.targetId = tethered.id;
  registerBolt(direct, spec, directRuntime, { pos: { x: 3, z: 0 } });
  const directEvent = {
    targetId: tethered.id,
    ownerId: 'player',
    damage: 8,
    damagePacket: { channels: { energy: 8 } },
    pos: { x: 3, z: 0 },
  };
  direct.bus.emit('projectile:hit', directEvent);
  assert.equal(directEvent.damage, 12);
  assert.equal(directEvent.damagePacket.channels.energy, 12);
});

test('defect 5: payload sector cleanup removes entityList rows and is wired to sector:enter', () => {
  const state = {
    nextEntityId: 40,
    entities: new Map(),
    entityList: [],
    player: { tether: { targetId: null } },
  };
  const payload = spawnPayloadEntity(state, { pos: { x: 1, z: 2 } });
  assert.equal(state.entities.has(payload.id), true);
  assert.equal(state.entityList.includes(payload), true);
  handlePayloadSectorTransition(state);
  assert.equal(state.entities.has(payload.id), false);
  assert.equal(state.entityList.some((row) => row && row.id === payload.id), false);

  const harness = makeHarness({ state: { nextEntityId: 80 } });
  const live = spawnPayloadEntity(harness.state, { pos: { x: 4, z: 5 } });
  assert.equal(harness.state.entityList.some((row) => row && row.id === live.id), true);
  harness.bus.emit('sector:enter', { sectorId: 'sector-b' });
  assert.equal(harness.state.entities.has(live.id), false);
  assert.equal(harness.state.entityList.some((row) => row && row.id === live.id), false);
});
