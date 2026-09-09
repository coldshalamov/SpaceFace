// CRU-015 — Survival credits are physical: dropped on a kill, collected by the player,
// swept at cleanup, and never routed into the campaign wallet.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CREDIT_CHIP_KIND, isCreditChipPickup } from '../src/data/killRewards.js';
import { runOwnsReward } from '../src/combat/rewardEligibility.js';
import { mining } from '../src/systems/mining.js';
import { runSession } from '../src/systems/runSession.js';
import {
  RUN_WALLET,
  chipValueForPlan,
  survivalRewards,
} from '../src/systems/survivalRewards.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const ARENA = 'helios_core';
const SEED = 7;

function boot(seed = SEED) {
  const state = createGameState(seed);
  state.player.credits = 1000;
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;

  const ctx = { state, bus, helpers: {} };
  runSession.init(ctx);
  survivalRewards.init(ctx);
  return { state, bus, emitted, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function beginActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
}

function planFor(wave) {
  return planWave({ seed: SEED, arenaId: ARENA, wave, act: 0, difficulty: 1, mutators: [], buildSummary: null });
}

function killCohortBody(harness, wave = 1) {
  const id = harness.state.nextEntityId++;
  const entity = {
    id, alive: true, type: 'ship', team: 1, pos: { x: 30, z: 10 }, vel: { x: 1, z: 2 },
    data: { level: 1, runWave: wave, runCohort: 'survival' },
  };
  harness.state.entities.set(id, entity);
  harness.state.entityList.push(entity);
  entity.alive = false;
  harness.bus.emit('entity:killed', { id, killerId: 1, type: 'ship', pos: { x: 30, z: 10 } });
  return entity;
}

/** Stand in for mining's spawn: turn a loot:drop chip item into a live pickup entity. */
function materializeChips(harness, drop) {
  const spawnedIds = [];
  for (const item of drop.payload.items || []) {
    if (!isCreditChipPickup(item)) continue;
    const id = harness.state.nextEntityId++;
    const entity = {
      id, alive: true, type: 'pickup', pos: { x: drop.payload.pos.x, z: drop.payload.pos.z },
      data: {
        kind: CREDIT_CHIP_KIND,
        amount: item.credits,
        credits: item.credits,
        grantReason: item.grantReason,
        wallet: item.wallet || null,
      },
    };
    harness.state.entities.set(id, entity);
    harness.state.entityList.push(entity);
    harness.bus.emit('entity:spawned', { id, type: 'pickup', entity });
    spawnedIds.push(id);
  }
  return spawnedIds;
}

test('a survival body reserves its reward: campaign paths see runOwnsReward', () => {
  assert.equal(runOwnsReward({ data: { runCohort: 'survival' } }), true);
  assert.equal(runOwnsReward({ data: {} }), false);
  assert.equal(runOwnsReward(null), false);
});

test('the chip is one body\'s share of the authored wave purse', () => {
  const wave1 = planFor(1);   // 12 credits over 6 bodies
  assert.equal(chipValueForPlan(wave1), 2);
  const wave10 = planFor(10); // 48 credits over 7 bodies
  assert.equal(chipValueForPlan(wave10), Math.max(1, Math.round(48 / 7)));
  assert.equal(chipValueForPlan(null), 0);
});

test('a cohort kill drops a physical chip stamped for the run wallet, and pays nothing at death', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  killCohortBody(harness);

  const drops = named(harness.emitted, 'loot:drop');
  assert.equal(drops.length, 1);
  const items = drops[0].payload.items;
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, CREDIT_CHIP_KIND);
  assert.equal(items[0].wallet, RUN_WALLET);
  assert.equal(items[0].credits, 2);
  // No top-level credits field: that is the grant-at-death shape, and Survival settles on scoop.
  assert.equal(drops[0].payload.credits, undefined);
  assert.equal(harness.state.run.credits, 0, 'credits are not paid until the chip is collected');
  assert.equal(harness.state.player.credits, 1000);
});

test('collecting the chip pays the run wallet, never campaign credits', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  killCohortBody(harness);
  const drop = named(harness.emitted, 'loot:drop')[0];
  const [chipId] = materializeChips(harness, drop);

  // The scoop receipt is what pays — survivalRewards is the sole payer of run chips.
  harness.bus.emit('pickup:collected', {
    pickupId: chipId, collectorId: 1, kind: CREDIT_CHIP_KIND, amount: 2, credits: 2, wallet: 'run',
  });
  harness.bus.emit('entity:destroyed', { id: chipId });

  assert.equal(harness.state.run.credits, 2, 'a scooped chip is paid exactly once');
  assert.equal(harness.state.player.credits, 1000);
  assert.ok(!harness.emitted.some((e) => e.event === 'economy:grantCredits'));
});

test('a chip the ship physically flies into pays — the payload has no wallet field', () => {
  // THE live defect: two publishers emit pickup:collected and only mining's carries `wallet`.
  // physics' contact-collect (physics.js emitPickupCollected) carries pickupId/collectorId/kind/
  // amount/pos and nothing else. A route capture showed six kills worth twelve credits paying
  // eight, because the two chips the hull actually touched paid nothing. Settlement is keyed on
  // this owner's own ledger now, so the payload shape cannot change the outcome.
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  killCohortBody(harness);
  killCohortBody(harness);
  const ids = named(harness.emitted, 'loot:drop').flatMap((drop) => materializeChips(harness, drop));

  // Exactly the physics payload — no `wallet`, no `credits`.
  harness.bus.emit('pickup:collected', {
    pickupId: ids[0], collectorId: 1, kind: CREDIT_CHIP_KIND, amount: 2, pos: { x: 0, z: 0 },
  });
  assert.equal(harness.state.run.credits, 2, 'the contact collect paid');

  // And the magnet-scoop shape, which does carry a wallet, pays the same.
  harness.bus.emit('pickup:collected', {
    pickupId: ids[1], collectorId: 1, kind: CREDIT_CHIP_KIND, amount: 2, credits: 2, wallet: 'run',
  });
  assert.equal(harness.state.run.credits, 4, 'both collection routes pay identically');

  // Their bodies are then destroyed; neither pays again.
  for (const id of ids) harness.bus.emit('entity:destroyed', { id });
  assert.equal(harness.state.run.credits, 4, 'and neither pays twice');
  assert.equal(harness.state.player.credits, 1000);
});

test('uncollected chips are cleared off the board at cleanup and settle into the run wallet', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  for (let i = 0; i < 4; i++) killCohortBody(harness);
  const ids = named(harness.emitted, 'loot:drop').flatMap((drop) => materializeChips(harness, drop));

  harness.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 1 });
  assert.equal(harness.state.run.credits, 0, 'chips are still on the board during cleanup');

  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 'draft_open', tick: 2 });
  for (const entity of harness.state.entities.values()) {
    if (entity.type === 'pickup') assert.equal(entity.alive, false, 'the board is cleared');
  }
  // coreSystem publishes the destroy receipt for the bodies the sweep marked; that is what pays.
  for (const id of ids) harness.bus.emit('entity:destroyed', { id });
  assert.equal(harness.state.run.credits, 8, 'four chips at 2 each were settled');
});

test('a chip destroyed mid-cleanup is still paid — the defect a live route capture found', () => {
  // The first version credited uncollected chips only at the cleanup boundary. A real run showed
  // two of six chips already gone by then, so six kills paid for four.
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  for (let i = 0; i < 6; i++) killCohortBody(harness);
  const ids = named(harness.emitted, 'loot:drop').flatMap((drop) => materializeChips(harness, drop));
  assert.equal(ids.length, 6);

  harness.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 1 });
  // Two chips despawn during the cleanup window, before any sweep runs.
  for (const id of ids.slice(0, 2)) {
    const entity = harness.state.entities.get(id);
    entity.alive = false;
    harness.bus.emit('entity:destroyed', { id });
  }
  assert.equal(harness.state.run.credits, 4, 'the two lost chips paid on their way out');

  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 'draft_open', tick: 2 });
  for (const id of ids.slice(2)) harness.bus.emit('entity:destroyed', { id });
  assert.equal(harness.state.run.credits, 12, 'six kills paid for six chips');
});

test('the sweep never double-pays a chip the player already collected', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  killCohortBody(harness);
  killCohortBody(harness);
  const ids = named(harness.emitted, 'loot:drop').flatMap((drop) => materializeChips(harness, drop));

  // Player scoops the first chip. Both publishers of pickup:collected are exercised: mining's
  // carries a wallet field, physics' contact-collect does NOT — and the ledger must drop the chip
  // either way, or a chip the player flew into is paid twice.
  const collected = harness.state.entities.get(ids[0]);
  harness.bus.emit('pickup:collected', {
    pickupId: ids[0], collectorId: 1, kind: CREDIT_CHIP_KIND, amount: 2,
    pos: { x: collected.pos.x, z: collected.pos.z },   // physics shape: no `wallet`
  });
  collected.alive = false;
  harness.bus.emit('entity:destroyed', { id: ids[0] });

  harness.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 1 });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 'draft_open', tick: 2 });

  assert.equal(harness.state.run.credits, 4, 'one scooped + one swept, each paid exactly once');
});

test('ending a run sweeps what is still on the board so a death does not lose the earnings', () => {
  const harness = boot();
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  for (let i = 0; i < 3; i++) killCohortBody(harness);
  for (const drop of named(harness.emitted, 'loot:drop')) materializeChips(harness, drop);

  harness.bus.emit('run:endRequested', { outcome: 'defeat', reason: 'player_death', tick: 9 });
  assert.equal(harness.state.run.phase, 'ended');
  // At the end of a run the sim may never tick again, so outstanding chips settle directly.
  assert.equal(harness.state.run.credits, 6);
});

test('the REAL mining pickup path spawns the chip and routes it to the run wallet', () => {
  // Not a stand-in: this drives mining's own loot:drop handler and its own credit-chip collector.
  const harness = boot();
  const spawned = [];
  harness.ctx.helpers.spawnEntity = (spec) => {
    const id = harness.state.nextEntityId++;
    const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
    harness.state.entities.set(id, entity);
    harness.state.entityList.push(entity);
    spawned.push(entity);
    harness.bus.emit('entity:spawned', { id, type: entity.type, entity });
    return entity;
  };
  mining.init({ state: harness.state, bus: harness.bus, helpers: harness.ctx.helpers, registry: null });
  beginActive(harness);
  harness.bus.emit('run:wavePlanned', { wave: 1, plan: planFor(1) });
  killCohortBody(harness);

  // mining also drops a salvage wreck on a ship death; the chip is the pickup among them.
  const chips = spawned.filter((e) => e.type === 'pickup');
  assert.equal(chips.length, 1, 'mining materialized exactly one chip body');
  const chip = chips[0];
  assert.equal(chip.data.kind, CREDIT_CHIP_KIND);
  assert.equal(chip.data.wallet, RUN_WALLET, 'the wallet stamp survived mining\'s spawn path');
  assert.equal(chip.data.credits, 2);

  harness.bus.emit('pickup:collected', {
    pickupId: chip.id, collectorId: harness.state.playerId, kind: CREDIT_CHIP_KIND,
    amount: chip.data.credits, credits: chip.data.credits, wallet: chip.data.wallet,
    pos: { x: chip.pos.x, z: chip.pos.z },
  });

  assert.equal(harness.state.run.credits, 2, 'the run wallet was paid by mining, through runSession');
  assert.equal(harness.state.player.credits, 1000);
  assert.ok(!harness.emitted.some((e) => e.event === 'economy:grantCredits'),
    'campaign economy was never asked for a grant');
  mining.bus = null;
});

test('a chip with no wallet stamp is left alone by the run sweep', () => {
  const harness = boot();
  beginActive(harness);
  const id = harness.state.nextEntityId++;
  const entity = {
    id, alive: true, type: 'pickup', pos: { x: 5, z: 5 },
    data: { kind: CREDIT_CHIP_KIND, amount: 40, credits: 40 },
  };
  harness.state.entities.set(id, entity);
  harness.bus.emit('entity:spawned', { id, type: 'pickup', entity });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 1 });
  harness.bus.emit('run:transitionRequested', { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 'draft_open', tick: 2 });
  assert.equal(harness.state.run.credits, 0);
  assert.equal(entity.alive, true, 'a campaign chip is not swept by the run');
});
