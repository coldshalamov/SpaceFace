// The armory's hull patch — the counter's metered mend. Between waves a hurt pilot who cannot
// reach the weld's flat rate still has a "pay to live" row: a bounded repair priced by the
// scar it closes. Deterministic: seeded state, manual phase transitions, no wall clock.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { TECH_NODES } from '../src/data/tech.js';
import {
  SWARM_HULL_PATCH,
  SWARM_HULL_PATCH_FRACTION,
  SWARM_HULL_PATCH_MIN_PRICE,
  swarmHullPatchQuote,
} from '../src/data/swarmDraft.js';
import { economy } from '../src/systems/economy.js';
import { runSession } from '../src/systems/runSession.js';
import { ships } from '../src/systems/ships.js';
import {
  CRUCIBLE_PURCHASE_SPEND_REASON,
  SWARM_WELD_PRICE,
  survivalDraft,
} from '../src/systems/survivalDraft.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { resetCrucibleMetaForTests } from '../src/systems/survivalRecords.js';

const SEED = 90210;
const ARENA = 'helios_core';
const HULL_MAX = 200;

function boot({ hull = HULL_MAX, hullMax = HULL_MAX } = {}) {
  resetCrucibleMetaForTests();
  const state = createGameState(SEED);
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
  const registry = { get: (name) => ({ ships, economy, survivalDraft })[name] || null };
  const ctx = { state, bus, helpers: {}, registry };
  economy.init(ctx);
  ships.init(ctx);
  economy.newGame();
  ships.newGame();
  // The public Crucible launch supplies the complete arsenal to this ephemeral run.
  state.player.researchedNodes = TECH_NODES.map((node) => node.id);
  ships.buyShip({ defId: 'ship_hornet', grant: true, setActive: true });
  const player = {
    id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship',
    hull, hullMax,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  runSession.init(ctx);
  survivalRun.init(ctx);
  survivalDraft.init(ctx);
  return { state, bus, emitted, player };
}

function named(h, event) {
  return h.emitted.filter((entry) => entry.event === event);
}

function transition(h, expectedPhase, nextPhase) {
  h.bus.emit('run:transitionRequested', { expectedPhase, nextPhase, reason: 't', tick: 0 });
}

function begin(h, threats) {
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA,
    threats: threats && threats.length ? threats : undefined,
  });
  return h.state.run;
}

/** The swarm's real opening: loadout leads straight into the armory stop. */
function openingArmory(h, threats) {
  begin(h, threats);
  assert.equal(h.state.run.phase, 'loadout');
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

/** A between-rounds armory: fight, clean up, then the shelf opens on `wave`. */
function waveArmory(h, threats, wave) {
  begin(h, threats);
  transition(h, 'loadout', 'arena_intro');
  transition(h, 'arena_intro', 'wave_intro');
  transition(h, 'wave_intro', 'active');
  transition(h, 'active', 'cleanup');
  h.state.run.wave = wave;
  h.bus.emit('run:awardRequested', { credits: 4000, reason: 'round_loot' });
  transition(h, 'cleanup', 'draft');
  assert.equal(h.state.run.phase, 'draft');
}

function patchRow(h) {
  return survivalDraft.currentOffers().find((row) => row.id === SWARM_HULL_PATCH.offerId);
}

test('the quote prices the scar it closes and caps at the patch bound', () => {
  // Half a hull missing → the mend is the bound (30% of max), priced as the same share.
  assert.deepEqual(swarmHullPatchQuote(HULL_MAX * 0.5, HULL_MAX), { restored: 60, price: 30 });
  // A small ding prices a scratch, never a weld: ~10% missing, ~5 cr.
  assert.deepEqual(swarmHullPatchQuote(HULL_MAX - 20, HULL_MAX), { restored: 20, price: 10 });
  // A near-wreck never prices the row out of reach — the mend bound bounds the price too.
  assert.deepEqual(swarmHullPatchQuote(0, HULL_MAX), { restored: 60, price: 30 });
  // Sound hulls and hull-less states quote nothing — there is no sale of nothing.
  assert.deepEqual(swarmHullPatchQuote(HULL_MAX, HULL_MAX), { restored: 0, price: 0 });
  assert.deepEqual(swarmHullPatchQuote(HULL_MAX + 50, HULL_MAX), { restored: 0, price: 0 });
  assert.deepEqual(swarmHullPatchQuote(50, 0), { restored: 0, price: 0 });
  assert.deepEqual(swarmHullPatchQuote(NaN, NaN), { restored: 0, price: 0 });
  // A scratch still pays the house call.
  assert.equal(swarmHullPatchQuote(HULL_MAX - 1, HULL_MAX).price, SWARM_HULL_PATCH_MIN_PRICE);
});

test('a hurt hull sees a buyable patch row priced under the weld', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  waveArmory(h, null, 1);
  const row = patchRow(h);
  assert.ok(row, 'the patch is on the service counter');
  assert.equal(row.service, 'hull_patch');
  assert.equal(row.kind, 'service');
  assert.equal(row.available, true, 'the row is buyable while the hull is hurt');
  assert.ok(row.verb && row.name && row.blurb && row.slotLabel, 'the card reads like its siblings');
  assert.equal(row.price, swarmHullPatchQuote(h.player.hull, HULL_MAX).price);
  assert.ok(row.price > 0 && row.price < SWARM_WELD_PRICE,
    `${row.price} cr stays under the flat ${SWARM_WELD_PRICE} cr weld`);
  // The weld is still there for the pilot who can pay wholesale — a real either/or.
  const weld = survivalDraft.currentOffers().find((o) => o.service === 'weld');
  assert.ok(weld && weld.available, 'the full weld sells beside it');
});

test('buying the patch heals under the hullMax clamp and charges the wallet once', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  waveArmory(h, null, 1);
  const credits = h.state.run.credits;
  const row = patchRow(h);
  const expected = swarmHullPatchQuote(HULL_MAX * 0.5, HULL_MAX);

  assert.equal(survivalDraft.resolvePick({ offerId: row.id }), true);
  assert.equal(h.player.hull, HULL_MAX * 0.5 + expected.restored, 'the mend lands at once');
  assert.equal(h.state.run.credits, credits - row.price, 'the wallet paid the card price');
  assert.equal(named(h, 'run:spendRequested').filter(
    (e) => e.payload.reason === CRUCIBLE_PURCHASE_SPEND_REASON).length, 1, 'one charge asked');
  assert.equal(named(h, 'run:shopPurchased').length, 1);
  assert.equal(named(h, 'run:shopPurchased')[0].payload.price, row.price);
  const repairs = named(h, 'service:completed').filter((e) => e.payload.type === 'repair');
  assert.equal(repairs.length, 1, 'the yard receipt went out like the weld’s does');
  assert.equal(repairs[0].payload.restoredHull, expected.restored);
  assert.match(survivalDraft.lastNotice(), /Patched/);

  // A replayed wallet receipt cannot heal twice — the charge token is spent.
  const healed = h.player.hull;
  h.bus.emit('run:spent', { reason: CRUCIBLE_PURCHASE_SPEND_REASON, credits: row.price });
  assert.equal(h.player.hull, healed, 'a stale receipt buys nothing');

  // The clamp: a 30-point scar under the bound tops the hull to exactly max, never over.
  const h2 = boot({ hull: HULL_MAX - 30 });
  waveArmory(h2, null, 1);
  assert.equal(survivalDraft.resolvePick({ offerId: SWARM_HULL_PATCH.offerId }), true);
  assert.equal(h2.player.hull, HULL_MAX);
});

test('a sound hull gets no sale — the row is blocked and the wallet is never asked', () => {
  const h = boot({ hull: HULL_MAX });
  waveArmory(h, null, 1);
  const row = patchRow(h);
  assert.ok(row, 'the counter still shows the row, plainly dead');
  assert.equal(row.available, false);
  assert.match(row.unavailableReason, /already sound/i);

  const spends = named(h, 'run:spendRequested').length;
  const credits = h.state.run.credits;
  assert.equal(survivalDraft.resolvePick({ offerId: row.id }), false);
  assert.equal(named(h, 'run:spendRequested').length, spends, 'the wallet was never asked');
  assert.equal(h.state.run.credits, credits, 'not a credit moved');
  assert.equal(h.player.hull, HULL_MAX);
  assert.equal(named(h, 'run:shopPurchased').length, 0);
});

test('a draftless threat run never stocks the patch — it is armory stock, not a birthright', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  openingArmory(h, ['draftless']);
  assert.deepEqual(survivalDraft.currentOffers(), [], 'no armory dealt at all');
  assert.equal(named(h, 'run:draftOffered').length, 0);
  assert.equal(survivalDraft.resolvePick({ offerId: SWARM_HULL_PATCH.offerId }), false);
  assert.equal(h.player.hull, HULL_MAX * 0.5, 'no heal rode in on the wager');
});

test('the authored arc has no service counter — the Gauntlet never sees the patch', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  h.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: 'cinder_run',
  });
  transition(h, 'loadout', 'draft');
  assert.equal(h.state.run.phase, 'draft');
  assert.ok(survivalDraft.currentOffers().length > 0, 'the gauntlet draft dealt');
  assert.ok(!survivalDraft.currentOffers().some((row) => row.id === SWARM_HULL_PATCH.offerId));
  assert.ok(!survivalDraft.currentOffers().some((row) => row.kind === 'service'));
});

test('No Re-rolls strikes the bench, not the counter: the patch still sells', () => {
  const h = boot({ hull: HULL_MAX * 0.5 });
  waveArmory(h, ['no_rerolls'], 1);
  const info = survivalDraft.rerollState();
  assert.equal(info.available, false);
  assert.equal(info.reason, 'no_reroll');
  assert.equal(survivalDraft.requestReroll(), false, 'the bench is refused');

  const row = patchRow(h);
  assert.ok(row && row.available, 'the counter is not a re-roll — it stays buyable');
  assert.equal(survivalDraft.resolvePick({ offerId: row.id }), true);
  assert.equal(h.player.hull, HULL_MAX * 0.5 + swarmHullPatchQuote(HULL_MAX * 0.5, HULL_MAX).restored,
    'the mend lands under the wager');
});
