// A latched Massline rips the jumper's take loose (INF-U16, WF-05): one unit
// per cadence shakes free as a scoopable pod, the first rip bolts the jumper,
// and the rip keeps ticking through the chase while the line holds.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { intervention } from '../src/systems/intervention.js';

function boot() {
  const state = createGameState(77);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 100;
  state.world = state.world || {};
  state.world.currentSectorId = 'sector_a';
  state.world.sectors = {
    sector_a: { id: 'sector_a', name: 'Sector A', security: 0.8 },
  };
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const id = nextId++;
      const entity = {
        id,
        alive: true,
        type: spec.type || 'ship',
        team: spec.team ?? 0,
        factionId: spec.factionId || null,
        pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
        vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
        rot: 0,
        radius: spec.radius || 6,
        mass: spec.mass || 1,
        hull: spec.hull ?? 10,
        hullMax: spec.hullMax ?? 10,
        data: spec.data || {},
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
      state.entities.delete(id);
    },
  };
  const system = Object.create(intervention);
  system.init({ state, bus, helpers });
  const ripped = [];
  const toasts = [];
  bus.on('intervention:jumperRipped', (p) => ripped.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, system, player, helpers, ripped, toasts };
}

function teardown(ctx) {
  ctx.bus.clear();
}

// A live site whose jumper already holds take, far from the player (no spook).
function ladenSite(ctx, stolen = 3) {
  ctx.bus.emit('automation:assetLost', { kind: 'trader', id: 't-rip', value: 560, sectorId: 'sector_a' });
  const rec = ctx.state.interventions[ctx.state.interventions.length - 1];
  const ent = ctx.state.entities.get(rec.jumper.entityId);
  rec.jumper.stolen = stolen;
  rec.jumper.phase = 'stripping';
  return { rec, ent };
}

function latch(ctx, targetId) {
  ctx.state.player.tether = { active: true, targetId };
}

function pickups(ctx) {
  return ctx.state.entityList.filter((e) => e && e.alive !== false && e.type === 'pickup'
    && e.data && e.data.jumperRip != null);
}

test('a latched line rips one unit per cadence as scoopable pods', () => {
  const ctx = boot();
  try {
    const { rec, ent } = ladenSite(ctx, 3);
    latch(ctx, ent.id);
    ctx.system.update(1 / 60, ctx.state); // arms the cadence, no instant pod
    assert.equal(pickups(ctx).length, 0);
    assert.equal(rec.jumper.stolen, 3);
    ctx.state.simTime += 3;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(pickups(ctx).length, 1, 'one pod shaken loose');
    assert.equal(pickups(ctx)[0].data.amount, 1);
    assert.equal(rec.jumper.stolen, 2, 'the take decrements with the pod');
    assert.equal(ctx.ripped.length, 1);
    assert.deepEqual([ctx.ripped[0].ripped, ctx.ripped[0].left], [1, 2]);
    assert.ok(ctx.toasts.some((t) => /hold the line/.test(t.text)));
    ctx.state.simTime += 3;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(pickups(ctx).length, 2);
    assert.equal(rec.jumper.stolen, 1);
  } finally {
    teardown(ctx);
  }
});

test('the first rip bolts the jumper; the rip continues through the chase', () => {
  const ctx = boot();
  try {
    const { rec, ent } = ladenSite(ctx, 3);
    latch(ctx, ent.id);
    ctx.system.update(1 / 60, ctx.state);
    ctx.state.simTime += 3;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(rec.jumper.phase, 'fled', 'it abandons the strip and runs');
    assert.ok(ctx.toasts.some((t) => /bolts with your line/.test(t.text)));
    ctx.state.simTime += 3;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(pickups(ctx).length, 2, 'still ripping off the runner');
  } finally {
    teardown(ctx);
  }
});

test('no latch, wrong target, or empty take means no rip', () => {
  const ctx = boot();
  try {
    const { rec, ent } = ladenSite(ctx, 3);
    ctx.state.simTime += 6;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(pickups(ctx).length, 0, 'unlatched line rips nothing');
    latch(ctx, 9999); // some other hull
    ctx.state.simTime += 6;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(pickups(ctx).length, 0, 'wrong target rips nothing');
    rec.jumper.stolen = 0;
    latch(ctx, ent.id);
    ctx.state.simTime += 6;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(pickups(ctx).length, 0, 'empty take rips nothing');
  } finally {
    teardown(ctx);
  }
});
