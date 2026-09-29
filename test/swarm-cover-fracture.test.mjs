// SF-067 — cover that stays useful through a round.
// Swarm debris rocks are physical cover, not invulnerable walls: a hard physics:impact wears the
// rock's hull, wear is readable through miningWear, and a worn-through monolith fractures into
// two smaller remnant rocks that stay collidable and rope-legal. Remnants do not recurse; a
// second break just clears the lane. Field rocks and non-swarm state must never take this wear.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import {
  swarmArena,
  SWARM_DEBRIS_TAG,
} from '../src/systems/swarmArena.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = 90210;
const ARENA = 'helios_core';

function boot() {
  const state = createGameState(SEED);
  const bus = createBus();
  const events = [];
  const origEmit = bus.emit.bind(bus);
  bus.emit = (name, payload) => { events.push({ name, payload }); return origEmit(name, payload); };
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalRun.init(ctx);
  swarmArena.init(ctx);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: SWARM_RULESET, seed: SEED, arenaId: ARENA });
  return { state, bus, helpers, player, events };
}

function addDebrisRock(h, { x = 100, z = 0, hull = 400, hullMax = 400, extra = {} } = {}) {
  const rock = h.helpers.spawnEntity({
    type: 'asteroid',
    pos: { x, z },
    vel: { x: 0, z: 0 },
    radius: 30,
    mass: 5000,
    hull,
    hullMax,
    collides: true,
    data: {
      typeId: 'ast_common_rock',
      oreHP: hull,
      oreHPMax: hullMax,
      yieldU: 8,
      size: 30,
      [SWARM_DEBRIS_TAG]: true,
      terrainAnchor: true,
      ...extra,
    },
  });
  return rock;
}

function impact(h, aId, bId, { dp = 300, speed = 60, tick = 100 } = {}) {
  h.bus.emit('physics:impact', {
    aId, bId, dp, preSolveClosingSpeed: speed, tick,
    nx: 1, nz: 0, x: 0, z: 0,
  });
}

test('a hard impact wears a cover rock, a brush does not', () => {
  const h = boot();
  const rock = addDebrisRock(h);
  const hullMax = rock.hull;

  // A brush below the closing-speed floor is a nudge, not damage.
  impact(h, h.player.id, rock.id, { dp: 500, speed: 10 });
  assert.equal(rock.hull, hullMax);
  assert.equal(rock.data.miningWear ?? 0, 0);

  // A real hit chips hull and exposes wear the renderer can read.
  impact(h, h.player.id, rock.id, { dp: 300, speed: 60, tick: 100 });
  assert.ok(rock.hull < hullMax, `hull ${rock.hull} should be under ${hullMax}`);
  assert.ok(rock.data.miningWear > 0, 'wear must be readable for the renderer');
  assert.ok(rock.alive !== false, 'one hit must not drop a monolith');
});

test('wear is tick-gated — grinding along the face chips, it does not dissolve', () => {
  const h = boot();
  const rock = addDebrisRock(h);
  impact(h, h.player.id, rock.id, { dp: 300, speed: 60, tick: 200 });
  const afterFirst = rock.hull;
  // Same tick and the next few ticks are one contact, not many hits.
  for (const t of [201, 202, 203, 204]) impact(h, h.player.id, rock.id, { dp: 300, speed: 60, tick: t });
  assert.equal(rock.hull, afterFirst);
  // After the gap the same contact becomes a fresh chip.
  impact(h, h.player.id, rock.id, { dp: 300, speed: 60, tick: 215 });
  assert.ok(rock.hull < afterFirst);
});

test('a worn-through monolith fractures into two rope-legal remnant rocks', () => {
  const h = boot();
  const rock = addDebrisRock(h, { hull: 60, hullMax: 400 });
  const before = h.state.entityList.length;

  impact(h, h.player.id, rock.id, { dp: 99999, speed: 80, tick: 300 });

  assert.equal(rock.alive, false);
  const remnants = h.state.entityList.filter(
    (e) => e.alive !== false && e.data && e.data[SWARM_DEBRIS_TAG] && e.data.isChunk === true,
  );
  assert.equal(remnants.length, 2, `expected 2 remnants, got ${remnants.length} (+${h.state.entityList.length - before} entities)`);
  for (const r of remnants) {
    assert.equal(r.type, 'asteroid');
    assert.equal(r.collides, true, 'a remnant is still cover');
    assert.equal(r.data.terrainAnchor, true, 'a remnant still anchors');
    assert.equal(r.data.tetherPayload, true, 'the rope can pick a remnant up');
    assert.ok(r.mass < rock.mass, 'a remnant is lighter than its parent');
    assert.ok(r.hull > 0 && r.hullMax >= r.hull);
  }
  const fractured = h.events.filter((e) => e.name === 'swarmArena:debrisFractured');
  assert.equal(fractured.length, 1);
  assert.equal(fractured[0].payload.id, rock.id);
  assert.equal(fractured[0].payload.remnantIds.length, 2);
  // The mining-style chunk cue must never claim a core for a cover break.
  const chunks = h.events.filter((e) => e.name === 'asteroid:chunked');
  assert.equal(chunks.length, 2);
  for (const c of chunks) assert.equal(c.payload.bulkCore, false);
  // Field depletion must never see it: no fieldId rides the destroyed event.
  const destroyed = h.events.filter((e) => e.name === 'asteroid:destroyed');
  assert.equal(destroyed.length, 1);
  assert.equal(destroyed[0].payload.fieldId, undefined);
});

test('a remnant that breaks again just dies — leftovers do not recurse', () => {
  const h = boot();
  const rock = addDebrisRock(h, { hull: 60, hullMax: 400 });
  impact(h, h.player.id, rock.id, { dp: 99999, speed: 80, tick: 300 });
  const remnants = h.state.entityList.filter(
    (e) => e.alive !== false && e.data && e.data.isChunk === true,
  );
  assert.equal(remnants.length, 2);
  const target = remnants[0];
  target.hull = 10;
  impact(h, h.player.id, target.id, { dp: 99999, speed: 80, tick: 400 });
  assert.equal(target.alive, false);
  const secondGen = h.state.entityList.filter(
    (e) => e.alive !== false && e.data && e.data.isChunk === true && e.id !== remnants[1].id,
  );
  assert.equal(secondGen.length, 0, 'remnants must not fracture into more remnants');
});

test('field rocks and out-of-run impacts never take cover wear', () => {
  const h = boot();
  // A plain asteroid (no swarm tag) ignores the same hit entirely.
  const field = h.helpers.spawnEntity({
    type: 'asteroid', pos: { x: 50, z: 50 }, vel: { x: 0, z: 0 },
    radius: 30, mass: 5000, hull: 400, hullMax: 400, collides: true,
    data: { typeId: 'ast_common_rock', oreHP: 400, oreHPMax: 400, fieldId: 'f1' },
  });
  impact(h, h.player.id, field.id, { dp: 99999, speed: 80, tick: 500 });
  assert.equal(field.hull, 400);
  assert.equal(field.alive, true);
  assert.ok(!h.events.some((e) => e.name === 'swarmArena:debrisFractured'));

  // And a debris rock outside a live run is just scenery.
  h.state.run.active = false;
  const rock = addDebrisRock(h, { x: -80, z: -80 });
  impact(h, h.player.id, rock.id, { dp: 99999, speed: 80, tick: 600 });
  assert.equal(rock.hull, 400);
  assert.equal(rock.alive, true);
});

test('stale and dead references in an impact payload are ignored', () => {
  const h = boot();
  const rock = addDebrisRock(h);
  const hull = rock.hull;
  // Dead rock: no wear, no fracture, no crash.
  rock.alive = false;
  impact(h, h.player.id, rock.id, { dp: 99999, speed: 80, tick: 700 });
  assert.equal(rock.hull, hull);
  // Missing ids and malformed payloads are no-ops.
  impact(h, h.player.id, 999999, { dp: 99999, speed: 80, tick: 701 });
  h.bus.emit('physics:impact', {});
  h.bus.emit('physics:impact', null);
  assert.ok(true);
});
