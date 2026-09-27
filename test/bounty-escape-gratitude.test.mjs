// Harrying the hunter pays when the quarry escapes (INF-U15, WF-09): tracked
// player damage on the hunter accrues as an assist, and a quarry that reaches
// refuge wires escape gratitude — while the hunter's guild notes the cost.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { QUARRY_TUNING as QT } from '../src/data/bountyHunters.js';
import {
  bountyHunt,
  makeBountyHunterSpec,
  makeBountyQuarrySpec,
} from '../src/systems/bountyHunt.js';

function place(state, spec, id) {
  const entity = {
    id, alive: true, ...spec,
    pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
    vel: { x: 0, y: 0, z: 0, ...(spec.vel || {}) },
    rot: 0,
  };
  if (!entity.data) entity.data = spec.data;
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

function boot() {
  const state = createGameState(47);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 8;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, mass: 12, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const said = [];
  const helpers = { voice: { say: (line) => said.push(line) } };
  const system = Object.create(bountyHunt);
  system.init({ state, bus, helpers });
  const grants = [];
  const reps = [];
  const assisted = [];
  const toasts = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  bus.on('bountyHunt:escapeAssisted', (p) => assisted.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, system, helpers, said, grants, reps, assisted, toasts };
}

function chaseAtRefuge(ctx, contractId = 'c-escape') {
  const station = place(ctx.state, {
    type: 'station', team: 2, radius: 60,
    pos: { x: 1200, z: 0 },
    data: { stationId: 'station_refuge', stationName: 'Refuge Dock' },
  }, 30);
  const quarry = place(ctx.state, makeBountyQuarrySpec({ contractId, pos: { x: 1200, z: 0 } }), 20);
  const hunter = place(ctx.state, makeBountyHunterSpec({
    contractId, contractTargetId: quarry.id, pos: { x: 1500, z: 0 },
  }), 21);
  return { station, quarry, hunter };
}

function teardown(ctx) {
  ctx.system.destroy?.();
  ctx.bus.clear();
}

test('harrying the hunter buys the escape: gratitude in, guild cost out', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = chaseAtRefuge(ctx);
    ctx.bus.emit('combat:damage', { targetId: hunter.id, attackerId: 1, applied: 25, amount: 25 });
    ctx.bus.emit('combat:damage', { targetId: hunter.id, attackerId: 1, applied: 20, amount: 20 });
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(quarry.data.bountyHunt.escaped, true, 'the quarry reached refuge');
    assert.equal(ctx.assisted.length, 1);
    assert.equal(ctx.assisted[0].assist, 45);
    assert.equal(ctx.assisted[0].paid, QT.escapeGratitudeCr);
    assert.equal(ctx.grants.length, 1);
    assert.equal(ctx.grants[0].amount, 180);
    assert.equal(ctx.grants[0].reason, 'bounty_escape_gratitude');
    const plus = ctx.reps.find((r) => r.factionId === quarry.factionId);
    const minus = ctx.reps.find((r) => r.factionId === hunter.factionId);
    assert.equal(plus && plus.delta, 3, 'the quarry’s people remember the help');
    assert.equal(minus && minus.delta, -3, 'the guild remembers the cost');
    assert.ok(ctx.toasts.some((t) => /bought their escape/.test(t.text)));
    assert.ok(ctx.said.some((l) => l.kind === 'bounty_hunter_spurned'), 'the hunter says so out loud');
  } finally {
    teardown(ctx);
  }
});

test('an unharried escape pays nothing; a scratch under the bar pays nothing', () => {
  const clean = boot();
  try {
    chaseAtRefuge(clean, 'c-clean');
    clean.system.update(1 / 60, clean.state);
    assert.equal(clean.grants.length, 0, 'nobody helped, nobody pays');
    assert.equal(clean.assisted.length, 0);
  } finally {
    teardown(clean);
  }
  const scratch = boot();
  try {
    const { hunter } = chaseAtRefuge(scratch, 'c-scratch');
    scratch.bus.emit('combat:damage', { targetId: hunter.id, attackerId: 1, applied: 10, amount: 10 });
    scratch.system.update(1 / 60, scratch.state);
    assert.equal(scratch.grants.length, 0, '10 damage is not an assist');
  } finally {
    teardown(scratch);
  }
});

test('shooting the quarry too voids the escape gratitude', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = chaseAtRefuge(ctx, 'c-void');
    ctx.bus.emit('combat:damage', { targetId: hunter.id, attackerId: 1, applied: 60, amount: 60 });
    ctx.bus.emit('combat:damage', { targetId: quarry.id, attackerId: 1, applied: 5, amount: 5 });
    assert.equal(quarry.data.bountyHunt.gratitudeVoid, true);
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(quarry.data.bountyHunt.escaped, true);
    assert.equal(ctx.grants.length, 0, 'friendly fire voids the wire');
    assert.equal(ctx.assisted.length, 0);
  } finally {
    teardown(ctx);
  }
});

test('a surrendered quarry that escapes pays the escape rate, not the kill bounty', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = chaseAtRefuge(ctx, 'c-surrender');
    quarry.pos.x = 3000; quarry.pos.z = 0; // away from refuge: surrender first
    quarry.hull = 10; // under the surrender fraction
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(quarry.data.bountyHunt.surrendered, true, 'engines cut, bounty posted');
    ctx.bus.emit('combat:damage', { targetId: hunter.id, attackerId: 1, applied: 60, amount: 60 });
    quarry.pos.x = 1200; quarry.pos.z = 0; // limps under the station guns
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(quarry.data.bountyHunt.escaped, true);
    assert.equal(ctx.grants.length, 1);
    assert.equal(ctx.grants[0].amount, QT.escapeGratitudeCr, 'the posted 650 was for a kill');
  } finally {
    teardown(ctx);
  }
});
