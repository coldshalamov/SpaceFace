// Standing guard over a surrendered mark warns the hunter off (INF-U17, WF-02):
// a held hover inside the pocket breaks the contract without firing a shot,
// mercy pays in relationship rather than cash, and a guard held in a limping
// hull gets the contract turned on the player instead.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { QUARRY_TUNING as QT } from '../src/data/bountyHunters.js';
import {
  bountyHunt,
  bountyHunterOutcomeForContract,
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
  const warned = [];
  const turned = [];
  const toasts = [];
  bus.on('economy:grantCredits', (p) => grants.push(p));
  bus.on('faction:repDelta', (p) => reps.push(p));
  bus.on('bountyHunt:hunterWarnedOff', (p) => warned.push(p));
  bus.on('bountyHunt:hunterTurned', (p) => turned.push(p));
  bus.on('toast', (p) => toasts.push(p));
  return { state, bus, system, helpers, said, grants, reps, warned, turned, toasts, player };
}

// Open space, no refuge station: the quarry surrenders on the first tick.
function surrenderChase(ctx, contractId = 'c-guard') {
  const quarry = place(ctx.state, makeBountyQuarrySpec({ contractId, pos: { x: 3000, z: 0 } }), 20);
  quarry.hull = 10; // under the surrender fraction
  const hunter = place(ctx.state, makeBountyHunterSpec({
    contractId, contractTargetId: quarry.id, pos: { x: 3800, z: 0 },
  }), 21);
  ctx.system.update(1 / 60, ctx.state);
  assert.equal(quarry.data.bountyHunt.surrendered, true, 'engines cut, bounty posted');
  return { quarry, hunter };
}

function parkOver(ctx, quarry, dist = 100) {
  ctx.player.pos.x = quarry.pos.x + dist;
  ctx.player.pos.z = quarry.pos.z;
  ctx.player.vel.x = quarry.vel.x || 0;
  ctx.player.vel.z = quarry.vel.z || 0;
}

function teardown(ctx) {
  ctx.system.destroy?.();
  ctx.bus.clear();
}

test('a held guard warns the hunter off: mercy pays rep, never cash', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = surrenderChase(ctx);
    parkOver(ctx, quarry);
    ctx.system.update(1 / 60, ctx.state);
    assert.ok(ctx.toasts.some((t) => /Standing guard/.test(t.text)), 'the stance announces');
    assert.equal(ctx.warned.length, 0, 'the hold is not instant');
    ctx.state.simTime += QT.guardHoldS + 0.1;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(ctx.warned.length, 1, 'the hunter breaks off');
    assert.equal(hunter.data.contractTargetId, null);
    assert.equal(hunter.data.bountyHunt.pursuing, false);
    assert.equal(hunter.data.intent.mode, 'bounty_warned_off', 'the hunter clears the area');
    assert.equal(quarry.data.bountyHunt.done, true, 'the mark limps clear');
    assert.equal(bountyHunterOutcomeForContract(ctx.state, 'c-guard').outcome, 'hunter_warned_off');
    assert.equal(ctx.grants.length, 0, 'mercy pays in relationship, not cash');
    const rep = ctx.reps.find((r) => r.factionId === quarry.factionId);
    assert.equal(rep && rep.delta, QT.guardGratitudeRep);
    assert.equal(rep && rep.reason, 'bounty_guard_mercy');
    assert.ok(ctx.said.some((l) => l.kind === 'bounty_quarry_thanks'), 'the mark says thanks');
    assert.ok(ctx.said.some((l) => l.kind === 'bounty_hunter_warned'), 'the hunter answers out loud');
  } finally {
    teardown(ctx);
  }
});

test('a flyby is not a guard: speed or distance resets the hold', () => {
  const fast = boot();
  try {
    const { quarry } = surrenderChase(fast, 'c-fast');
    parkOver(fast, quarry);
    fast.player.vel.x = 400; // screaming past, not holding
    fast.system.update(1 / 60, fast.state);
    fast.state.simTime += QT.guardHoldS + 0.1;
    fast.system.update(1 / 60, fast.state);
    assert.equal(fast.warned.length, 0, 'relative speed breaks the stance');
    assert.equal(quarry.data.bountyHunt.guardSince, null);
  } finally {
    teardown(fast);
  }
  const far = boot();
  try {
    const { quarry } = surrenderChase(far, 'c-far');
    parkOver(far, quarry, QT.guardRadius + 50);
    far.system.update(1 / 60, far.state);
    far.state.simTime += QT.guardHoldS + 0.1;
    far.system.update(1 / 60, far.state);
    assert.equal(far.warned.length, 0, 'outside the pocket nothing accrues');
  } finally {
    teardown(far);
  }
  const reset = boot();
  try {
    const { quarry } = surrenderChase(reset, 'c-reset');
    parkOver(reset, quarry);
    reset.system.update(1 / 60, reset.state);
    assert.ok(quarry.data.bountyHunt.guardSince != null, 'the hold starts');
    parkOver(reset, quarry, QT.guardRadius + 50); // drift out mid-hold
    reset.system.update(1 / 60, reset.state);
    assert.equal(quarry.data.bountyHunt.guardSince, null, 'leaving resets the hold');
    assert.equal(reset.warned.length, 0);
  } finally {
    teardown(reset);
  }
});

test('a healthy mark gets no guard stance: surrender is the precondition', () => {
  const ctx = boot();
  try {
    const quarry = place(ctx.state, makeBountyQuarrySpec({ contractId: 'c-proud', pos: { x: 3000, z: 0 } }), 20);
    place(ctx.state, makeBountyHunterSpec({
      contractId: 'c-proud', contractTargetId: quarry.id, pos: { x: 3800, z: 0 },
    }), 21);
    parkOver(ctx, quarry);
    ctx.state.simTime += QT.guardHoldS + 0.1;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(quarry.data.bountyHunt.surrendered || false, false);
    assert.ok(quarry.data.bountyHunt.guardSince == null, 'no surrender, no guard');
    assert.equal(ctx.warned.length, 0);
  } finally {
    teardown(ctx);
  }
});

test('a guard held in a limping hull turns the contract on the player', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = surrenderChase(ctx, 'c-bluff');
    ctx.player.hull = Math.floor(ctx.player.hullMax * (QT.weakHullFrac - 0.1));
    parkOver(ctx, quarry);
    ctx.system.update(1 / 60, ctx.state);
    ctx.state.simTime += QT.guardHoldS + 0.1;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(ctx.turned.length, 1, 'the hunter calls the bluff');
    assert.equal(ctx.warned.length, 0);
    assert.equal(hunter.data.contractTargetId, ctx.player.id);
    assert.equal(bountyHunterOutcomeForContract(ctx.state, 'c-bluff').outcome, 'hunter_turned');
    assert.ok(ctx.toasts.some((t) => /changed targets/.test(t.text)));
    assert.ok(ctx.said.some((l) => l.kind === 'bounty_hunter_turned'));
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(hunter.data.ai.forcePlayerTarget, true, 'the live branch flips hostile');
  } finally {
    teardown(ctx);
  }
});

test('shooting the mark too still warns the hunter off, but earns no thanks', () => {
  const ctx = boot();
  try {
    const { quarry, hunter } = surrenderChase(ctx, 'c-void');
    ctx.bus.emit('combat:damage', { targetId: quarry.id, attackerId: 1, applied: 5, amount: 5 });
    assert.equal(quarry.data.bountyHunt.gratitudeVoid, true);
    parkOver(ctx, quarry);
    ctx.system.update(1 / 60, ctx.state);
    ctx.state.simTime += QT.guardHoldS + 0.1;
    ctx.system.update(1 / 60, ctx.state);
    assert.equal(ctx.warned.length, 1, 'mercy still works');
    assert.equal(hunter.data.contractTargetId, null);
    assert.equal(ctx.reps.length, 0, 'but the mark owes nothing');
    assert.ok(ctx.toasts.some((t) => /no thanks for the one who shot them/.test(t.text)));
  } finally {
    teardown(ctx);
  }
});
