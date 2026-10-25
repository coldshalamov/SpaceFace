// Helping a bounty hunter finish the quarry pays the collector's cut and the
// guild standing the chase already promises. Seed 4242. The cash amount, the
// standing amount, and the surrender path stay as they are.
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
    id,
    alive: true,
    ...spec,
    pos: { x: 0, y: 0, z: 0, ...(spec.pos || {}) },
    vel: { x: 0, y: 0, z: 0 },
    rot: 0,
  };
  state.entities.set(id, entity);
  state.entityList.push(entity);
  return entity;
}

function boot() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 40;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }, rot: 0,
    radius: 8, hull: 100, hullMax: 100, data: {},
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const grants = [];
  const reps = [];
  const toasts = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  bus.on('toast', (p) => toasts.push(p));
  const system = Object.create(bountyHunt);
  system.init({ state, bus, helpers: {} });
  return { state, bus, system, grants, reps, toasts };
}

function chase(state) {
  const quarry = place(state, makeBountyQuarrySpec({
    contractId: 'bounty:staged:4242',
    pos: { x: 900, z: 0 },
  }), 20);
  const hunter = place(state, makeBountyHunterSpec({
    contractId: 'bounty:staged:4242',
    contractTargetId: quarry.id,
    pos: { x: 520, z: 0 },
  }), 21);
  return { quarry, hunter };
}

test('helping the hunter kill the quarry pays the cut and the guild standing', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = chase(ctx.state);
    assert.equal(hunter.factionId, 'faction_quiet');
    quarry.alive = false;
    ctx.bus.emit('entity:killed', { id: quarry.id, killerId: ctx.state.playerId });
    assert.equal(ctx.grants.length, 1);
    assert.equal(ctx.grants[0].amount, QT.hunterCutCr);
    assert.equal(ctx.grants[0].amount, 200);
    assert.equal(ctx.grants[0].reason, 'bounty_collectors_cut');
    assert.equal(ctx.reps.length, 1);
    assert.equal(ctx.reps[0].factionId, 'faction_quiet');
    assert.equal(ctx.reps[0].delta, QT.cutRep);
    assert.equal(ctx.reps[0].delta, 4);
    assert.equal(ctx.reps[0].reason, 'bounty_helped_hunter');
    assert.equal(
      ctx.toasts.some((t) => t.text === 'The guild pays a 200 cr collector\'s cut for the assist.'),
      true,
    );
    assert.equal(hunter.data.contractTargetId, null);
  } finally {
    ctx.system.destroy?.();
    ctx.bus.clear();
  }
});

test('a surrendered execution still costs the guild and pays no collector cut', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = chase(ctx.state);
    quarry.data.bountyHunt.surrendered = true;
    quarry.alive = false;
    ctx.bus.emit('entity:killed', { id: quarry.id, killerId: hunter.id });
    assert.equal(ctx.grants.length, 0);
    assert.equal(ctx.reps.length, 1);
    assert.equal(ctx.reps[0].factionId, 'faction_quiet');
    assert.equal(ctx.reps[0].delta, QT.executionRep);
    assert.equal(ctx.reps[0].reason, 'bounty_executed_surrendered');
    assert.equal(ctx.toasts.some((t) => t.kind === 'good'), false);
  } finally {
    ctx.system.destroy?.();
    ctx.bus.clear();
  }
});
