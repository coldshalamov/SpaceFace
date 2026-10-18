import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { noteLethalBlow, restoreCollisionTearOffs, spawnCollisionTearOff, spawnFracturePieces } from '../src/systems/hullFracture.js';
import { mining } from '../src/systems/mining.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

function harness(seed = 231) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 10;
  state.world.currentSectorId = 'test';
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const ctx = { state, helpers, bus: createBus() };
  const aftermath = Object.assign(Object.create(aftermathWrecks), ctx);
  return { ...ctx, aftermath };
}

function source(h, type = 'wreck', data = {}) {
  return h.helpers.spawnEntity({
    type, pos: { x: 80, z: -40 }, vel: { x: 0, z: 0 },
    radius: 14, mass: 800, hull: 100, hullMax: 100, collides: true,
    physicsBody: { shape: 'capsule', dynamic: true, mass: 800, radius: 14 },
    data,
  });
}

function note(entity, count = 2) {
  return {
    victimId: entity.id, pos: entity.pos, vel: entity.vel,
    radius: entity.radius, mass: entity.mass, normal: { x: 1, z: 0 },
    closingSpeed: 50, count, tick: 600,
  };
}

function impact(h, entity, deltaV = 40) {
  h.aftermath._shedChipsFromWreck(entity, true, { normal: { x: 1, z: 0 } },
    entity.physicsBody.mass * deltaV, h.state);
}

test('a loose body gets one physical breakup in its lifetime, including after cooldown', () => {
  const h = harness();
  const wreck = source(h);
  impact(h, wreck, 20);
  assert.equal(h.state.entityList.length, 2, 'first impact creates one physical chip');
  h.state.simTime += 3;
  impact(h, wreck, 20);
  assert.equal(h.state.entityList.length, 2, 'the same body cannot mint another spray');
});

test('physical hull pieces and tear-off descendants cannot recursively shed more bodies', () => {
  for (const spawn of [spawnCollisionTearOff, spawnFracturePieces]) {
    const h = harness();
    const ship = source(h, 'ship');
    const result = spawn(h, note(ship));
    const pieces = Array.isArray(result) ? result : result.pieces;
    assert.equal(pieces.length, 2);
    assert.ok(pieces.every((piece) => Number.isFinite(piece.angVel)), 'finite physical spin');
    assert.ok(pieces.every((piece) => piece.physicsBody.mass >= 2),
      'exercise real descendants above the old recursive admission mass floor');
    const count = h.state.entityList.length;
    for (const piece of pieces) impact(h, piece);
    assert.equal(h.state.entityList.length, count, 'descendant contacts add no physics bodies');
  }
});

test('legacy saved fracture, tear-off, and ship-wreck stamps remain terminal', () => {
  for (const data of [
    { fracturePiece: 'remainder' },
    { collisionTearOff: true },
    { parentType: 'ship' },
    { impactChipCount: 1 },
  ]) {
    const h = harness();
    const fragment = source(h, 'wreck', data);
    impact(h, fragment);
    assert.equal(h.state.entityList.length, 1, JSON.stringify(data));
  }
});

test('a previously chipped ship cannot split into more hull bodies on death', () => {
  const h = harness();
  const ship = source(h, 'ship');
  assert.equal(spawnCollisionTearOff(h, note(ship)).length, 2);
  assert.equal(spawnFracturePieces(h, note(ship)), null);
});

test('a field of original loose wrecks cannot bypass the shared live-fragment budget', () => {
  const h = harness();
  const wrecks = Array.from({ length: 100 }, (_, i) => {
    const wreck = source(h);
    wreck.pos.x += i * 100;
    return wreck;
  });
  for (const wreck of wrecks) impact(h, wreck);
  const pieces = h.state.entityList.filter((entity) => entity.data?.collisionTearOff);
  assert.ok(pieces.length <= 32, `100 original wrecks produced ${pieces.length} live physics shards`);
  assert.ok(pieces.length > 0, 'hard impacts still produce physical salvage');
});

test('ship tear-offs and lethal hull splits share the loose-wreck budget atomically', () => {
  const h = harness();
  for (let i = 0; i < 15; i++) {
    const ship = source(h, 'ship');
    assert.equal(spawnFracturePieces(h, note(ship)).pieces.length, 2);
  }
  const ship = source(h, 'ship');
  assert.equal(spawnCollisionTearOff(h, note(ship, 1)).length, 1);
  const doomed = source(h, 'ship');
  const before = h.state.entityList.length;
  assert.equal(spawnFracturePieces(h, note(doomed)), null, 'one remaining slot cannot create half a lethal split');
  assert.equal(h.state.entityList.length, before);
  impact(h, source(h));
  assert.equal(h.state.entityList.filter((entity) => entity.data?.fracturePiece || entity.data?.collisionTearOff).length, 32);
  assert.equal(spawnCollisionTearOff(h, note(source(h, 'ship'))), null, 'ship plating cannot bypass loose-wreck saturation');
  doomed.alive = false;
  noteLethalBlow(doomed.id, { hullBefore: 100, hullMax: 100, rawBlow: 500,
    originKind: 'weapon', tick: h.state.tick });
  const miner = Object.assign(Object.create(mining), h, { registry: { get: () => null },
    _lootToPool: () => ({ cmdty_scrap_metal: 2 }) });
  const wreck = miner._onShipDestroyed({ id: doomed.id, type: 'ship', pos: doomed.pos });
  assert.equal(wreck.type, 'wreck', 'a saturated kill still leaves salvage through the production death owner');
  assert.equal(wreck.data.fracturePiece, undefined);
  assert.equal(wreck.data.salvagePool.cmdty_scrap_metal, 2);
});

test('transient plating expires through the normal lifetime owner and frees shared capacity', () => {
  const h = harness();
  const parent = source(h);
  const pieces = spawnCollisionTearOff(h, note(parent));
  assert.ok(pieces.every((piece) => piece.ttl === 60));
  const lifecycle = Object.assign(Object.create(core), { bus: h.bus });
  lifecycle.lifetimeSweep(61, h.state);
  for (const piece of pieces) assert.equal(h.state.entities.has(piece.id), false);
  assert.ok(h.state.entities.has(parent.id), 'durable source wreck remains salvageable');
  const next = source(h);
  assert.equal(spawnCollisionTearOff(h, note(next)).length, 2);
});

test('old saves consolidate excess plating, retain its salvage and preserve cargo and durable hulls', () => {
  const h = harness();
  const addOldChips = () => Array.from({ length: 100 }, () => source(h, 'wreck', {
    collisionTearOff: true, salvagePool: { cmdty_scrap_metal: 1 },
  }));
  const old = addOldChips();
  const durable = source(h, 'wreck', { fracturePiece: 'remainder', salvagePool: { cmdty_precious: 7 } });
  const cargo = source(h, 'wreck', { collisionTearOff: true,
    cargo: { items: { cmdty_ore: 5 } }, salvagePool: { cmdty_scrap_metal: 3 } });
  h.state.player.tether = { active: true, targetId: old[99].id };
  const consequences = Object.create(collisionConsequences);
  consequences.init({ ...h, registry: { get: () => null } });
  try {
    const livePieces = () => h.state.entityList.filter((entity) => entity.alive
      && (entity.data?.collisionTearOff || entity.data?.fracturePiece));
    const scrap = () => livePieces().reduce((sum, entity) => sum + (entity.data.salvagePool?.cmdty_scrap_metal || 0), 0);
    assert.equal(livePieces().length, 32, 'initialization repairs an already inflated save');
    assert.equal(scrap(), 103, 'retired chips transfer their salvage into a retained body');
    assert.equal(durable.alive, true);
    assert.equal(durable.ttl, Infinity, 'durable lethal salvage keeps its lifetime');
    assert.equal(cargo.alive, true);
    assert.deepEqual(cargo.data.cargo.items, { cmdty_ore: 5 });
    assert.equal(old[99].alive, true, 'the player keeps the currently tethered body');
    assert.ok(livePieces().filter((piece) => piece !== durable && piece !== cargo && piece !== old[99])
      .every((piece) => piece.ttl === 60), 'legacy transient chips acquire a finite remaining lifetime');
    addOldChips();
    h.bus.emit('save:loaded', {});
    assert.equal(livePieces().length, 32, 'Continue also repairs the newly restored population');
    assert.equal(scrap(), 203);
  } finally {
    consequences.destroy();
  }
});

test('cleanup preserves authoritative attachment endpoints before player mirrors are adopted', () => {
  const h = harness();
  const chips = Array.from({ length: 40 }, () => source(h, 'wreck', {
    collisionTearOff: true, salvagePool: { cmdty_scrap_metal: 1 },
  }));
  h.state.combat.attachments = { byId: {
    npcTow: { state: 'active', ownerId: chips[38].id, targetId: chips[39].id },
    released: { state: 'broken', ownerId: chips[32].id, targetId: chips[33].id },
  } };
  h.state.player.remoteMassline = { active: true, sourceId: chips[35].id,
    targetId: chips[36].id, caughtId: chips[37].id };
  restoreCollisionTearOffs(h.state);
  for (const i of [35, 36, 37, 38, 39]) assert.equal(chips[i].alive, true, `active endpoint ${i}`);
  assert.equal(chips[32].alive, false, 'a broken attachment does not keep decorative chips alive');
  assert.equal(chips[33].alive, false);
  assert.equal(h.state.entityList.filter((entity) => entity.alive).length, 32);
  assert.equal(h.state.entityList.filter((entity) => entity.alive)
    .reduce((sum, entity) => sum + entity.data.salvagePool.cmdty_scrap_metal, 0), 40);
});

test('attached plating survives its TTL and resumes normal expiry after release', () => {
  const h = harness();
  const parent = source(h);
  const [piece] = spawnCollisionTearOff(h, note(parent, 1));
  const cargoChip = source(h, 'wreck', { collisionTearOff: true, cargo: { cmdty_ore: 5 } });
  h.state.combat.attachments = { byId: { cargoTow: {
    state: 'active', ownerId: parent.id, targetId: cargoChip.id,
  }, tow: {
    state: 'active', ownerId: parent.id, targetId: piece.id,
  } } };
  const consequences = Object.create(collisionConsequences);
  consequences.init({ ...h, registry: { get: () => null } });
  const lifecycle = Object.assign(Object.create(core), { bus: h.bus });
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    for (let i = 0; i < 65; i++) {
      h.state.tick++;
      h.state.simTime++;
      consequences.update(1, h.state);
      lifecycle.lifetimeSweep(1, h.state);
    }
    assert.equal(h.state.entities.has(piece.id), true, 'an attached chip must not vanish during a tow');
    assert.equal(cargoChip.ttl, Infinity, 'holding cargo cannot turn its durable lifetime into transient plating');
    h.state.combat.attachments.byId.tow.state = 'broken';
    h.state.combat.attachments.byId.cargoTow.state = 'broken';
    consequences.update(1, h.state);
    lifecycle.lifetimeSweep(61, h.state);
    assert.equal(h.state.entities.has(piece.id), false, 'released transient salvage still expires');
    assert.equal(h.state.entities.has(cargoChip.id), true, 'durable cargo remains after release');
  } finally {
    consequences.destroy();
    COMBAT_FLAGS.weaponImpulseConsequences = previous;
  }
});

test('new hull pieces and tear-offs start clear of their siblings and surviving parent in Rapier', async () => {
  for (const spawn of [spawnFracturePieces, spawnCollisionTearOff]) {
    const h = harness();
    const ship = source(h, 'ship');
    const result = spawn(h, note(ship));
    const pieces = Array.isArray(result) ? result : result.pieces;
    const bodies = Array.isArray(result) ? [ship, ...pieces] : pieces;
    const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60 });
    try {
      owner.syncFromEntities(bodies);
      let contacts = 0;
      owner.world.forEachCollider((a) => {
        owner.world.forEachCollider((b) => {
          if (a.handle < b.handle && a.contactCollider(b, 0)) contacts++;
        });
      });
      assert.equal(contacts, 0, `${spawn.name}: born interpenetrating`);
    } finally {
      owner.dispose();
    }
  }
});
