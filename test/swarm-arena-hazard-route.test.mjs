// S9 route-level proof — "the arena is friend AND foe".
//
// The data-level fixture (swarm-arena-hazards.test.mjs) proves each arena's machinery exists,
// telegraphs ≥ 1 s ahead, and that the crumple law kills a thrown fodder hull. This file drives
// the same law through the live owners:
//
//   1. survivalArena._tickPlayerSlams — the Swarm-only exception to the pilot's global
//      terrain-crumple exemption. A static room solid (roomDynamic === false) met at ≥ 30 WU/s
//      closing reads the collision law and routes a kinetic packet through the combat kernel.
//   2. survivalArena._crushBody — the crusher's bite applies to the pilot in a Swarm run;
//      Adventure keeps the authored exemption.
//   3. swarmBrood.stepPools — a standing acid pool burns Brood bodies AND non-player ships on
//      the same reading the pilot takes.
//
// Harness mirrors crucible-arena.test.mjs: the real system object, a fake fields registry, and
// the real combat kernel the system resolves. Kernel routeDamage is read-only, so receipts are
// observed where they land: entity.hull drops and `combat:damage` bus payloads.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRunState } from '../src/core/runState.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';

const DT = 1 / 60;
const SEED = 11;

function makeFakeFields() {
  const live = new Map();
  return {
    name: 'fields',
    live,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id, tag: 'environmental', durationS: Infinity };
      live.set(id, record);
      return record;
    },
    registerExternal(spec) { return this.registerEnvironmental(spec); },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (record && patch) Object.assign(record, patch);
      return record || null;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function boot({ ruleset = 'swarm' } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const helpers = {
    spawnEntity(spec) {
      const entity = {
        ...spec, id: state.nextEntityId++, alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
      };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 400,
    hull: 400, hullMax: 400, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, shipLike: [player], asteroids: [] };
  state.run = Object.assign(
    createRunState({ kind: 'survival', ruleset, seed: SEED }),
    { wave: 2, phase: 'active' },
  );
  state.mode = 'flight';

  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  survivalArena.init(ctx);

  return { state, bus, emitted, helpers, player };
}

function damageEventsOn(h, targetId) {
  return h.emitted.filter((e) => e.event === 'combat:damage'
    && (e.payload.targetId === targetId || e.payload.id === targetId
      || (targetId === h.player.id && e.payload.isPlayer)));
}

function staticSolid(id, x, z, radius = 10) {
  return {
    id, alive: true, type: 'environmental',
    pos: { x, z }, vel: { x: 0, z: 0 }, radius, mass: 100000,
    data: { roomDynamic: false, roomKind: 'plate', roomSolidId: id, propRole: 'terrain' },
  };
}

test('S9: a Swarm pilot meeting a static room solid at crumple speed takes the law\'s reading', () => {
  const h = boot({ ruleset: 'swarm' });
  const solid = staticSolid('plate_1', 100, 0);
  survivalArena._roomSolids = new Map([[solid.id, solid]]);

  // Player at (82, 0): dist 18 < reach (10 + 8 + 2 = 20); vel 50 WU/s toward the solid.
  h.player.pos.x = 82;
  h.player.vel.x = 50;
  survivalArena._tickPlayerSlams(h.state);

  assert.ok(h.player.hull < h.player.hullMax, 'the pilot\'s hull reads the slam');
  const hits = damageEventsOn(h, h.player.id);
  assert.equal(hits.length, 1, 'one kinetic damage receipt on the pilot');
  assert.equal(hits[0].payload.origin && hits[0].payload.origin.kind, 'arena_slam');
  const crushed = h.emitted.filter((e) => e.event === 'combat:crushed');
  assert.equal(crushed.length, 1, 'the crush receipt emits for presentation');
  assert.equal(crushed[0].payload.entityId, h.player.id);
});

test('S9: the slam gate spares a tangential skim under the crumple threshold', () => {
  const h = boot({ ruleset: 'swarm' });
  const solid = staticSolid('plate_1', 100, 0);
  survivalArena._roomSolids = new Map([[solid.id, solid]]);

  h.player.pos.x = 82;
  h.player.vel.x = 20; // radial closing 20 < 30 — a drift, not a slam
  h.player.vel.z = 60; // fast tangentially, still not a slam
  survivalArena._tickPlayerSlams(h.state);
  assert.equal(h.player.hull, h.player.hullMax, 'no reading under the law\'s threshold');
  assert.equal(damageEventsOn(h, h.player.id).length, 0);
});

test('S9: Adventure keeps the pilot\'s authored terrain exemption', () => {
  const h = boot({ ruleset: 'adventure' });
  const solid = staticSolid('plate_1', 100, 0);
  survivalArena._roomSolids = new Map([[solid.id, solid]]);

  h.player.pos.x = 82;
  h.player.vel.x = 50;
  survivalArena._tickPlayerSlams(h.state);
  assert.equal(h.player.hull, h.player.hullMax, 'Adventure pilots never take the slam reading');
});

test('S9: the crusher bites a Swarm pilot drifting into the surge, and still spares Adventure', () => {
  const h = boot({ ruleset: 'swarm' });
  const toy = { id: 'crusher_mouth', anvil: { x: 0, z: 0 } };
  h.player.pos.x = 10;
  h.player.pos.z = 0;
  survivalArena._crushBody(h.player, toy, { speed: 60, vel: { x: 1, z: 0 } }, h.state);
  assert.ok(h.player.hull < h.player.hullMax, 'the surge reads on the pilot in Swarm');
  const hits = damageEventsOn(h, h.player.id);
  assert.equal(hits[0].payload.origin && hits[0].payload.origin.kind, 'crusher_jaws');

  const adv = boot({ ruleset: 'adventure' });
  const advToy = { id: 'crusher_mouth', anvil: { x: 0, z: 0 } };
  adv.player.pos.x = 10;
  survivalArena._crushBody(adv.player, advToy, { speed: 60, vel: { x: 1, z: 0 } }, adv.state);
  assert.equal(adv.player.hull, adv.player.hullMax, 'Adventure keeps the pilot exemption');

  // The foe side is unchanged: a thrown enemy hull still reads the law in either ruleset.
  const wasp = adv.helpers.spawnEntity({
    type: 'ship', pos: { x: 10, z: 0 }, vel: { x: 0, z: 0 },
    radius: 4, mass: 16, hull: 20, hullMax: 20, data: {},
  });
  survivalArena._crushBody(wasp, advToy, { speed: 60, vel: { x: 1, z: 0 } }, adv.state);
  assert.equal(wasp.hull, 0, 'a fodder hull in the surge crumples outright');
});

test('S9: the Hive pool burns Brood bodies and ships standing in it — friend and foe', () => {
  const h = boot({ ruleset: 'swarm' });
  const damage = [];
  const engine = createBroodEngine({
    bus: h.bus,
    getState: () => h.state,
    fieldList: () => null,
    routeDamage: (request) => { damage.push(request); return { ok: true }; },
  });

  const escort = h.helpers.spawnEntity({
    type: 'ship', pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 },
    radius: 5, mass: 30, hull: 100, hullMax: 100, data: {},
  });
  h.state.entityIndex.shipLike.push(escort); // the index owner maintains this on the real route

  // Wave prep clears the room's pool buffers, so the pool lands after it — the same order
  // the Hive's splash leaves standing acid during a live wave.
  engine.prepareWave(h.state.run, 5);
  engine.spawnWave(h.state);
  engine.hivePool(40, 0, 10);
  for (let i = 0; i < 30; i++) { h.state.simTime += DT; h.state.tick += 1; engine.step(h.state); }
  const b = engine._bodies;
  let slot = -1;
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) { slot = i; break; }
  assert.ok(slot >= 0, 'a Brood body exists to burn');
  const hpBefore = b.hp[slot];

  // Pin the body on the pool while the engine steps — its own AI would otherwise walk it out.
  for (let i = 0; i < 60; i++) {
    b.px[slot] = 40; b.pz[slot] = 0;
    h.state.simTime += DT; h.state.tick += 1; engine.step(h.state);
  }

  // The pool either burned the body down or is still burning it — never spares it.
  const burned = !b.alive[slot] || b.hp[slot] < hpBefore;
  assert.ok(burned, 'a Brood body standing in its own acid burns');

  const shipHits = damage.filter((d) => d.targetId === escort.id);
  assert.ok(shipHits.length >= 1, 'a ship standing in the pool is routed damage');
  assert.equal(shipHits[0].origin.id, 'brood_acid_pool');
});
