// AL-LG-10 — the resale quote names the hull's deeds: renown adds a capped premium, scars a
// capped discount, and the number never passes the buy price. Row 401 · seed 4242.
//
// The catalog bar: twin hulls quote differently, WITH REASONS; never above the buy price. The
// bars below pin the pure quote (deedResaleQuote) and the one live sale path (sellShip).
//
//   node --test test/al-lg-10-deed-resale-4242.test.mjs
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { SHIPS } from '../src/data/ships.js';
import {
  buildSlotList,
  deedResaleQuote,
  ships as shipsProto,
  RESALE_BASE_FRACTION,
  RESALE_RENOWN_PREMIUM_CAP,
  RESALE_SCAR_DISCOUNT_CAP,
} from '../src/systems/ships.js';

const SEED = 4242;
const KESTREL = 'ship_kestrel';
const SHIP_BY_ID = new Map(SHIPS.map((def) => [def.id, def]));
const KESTREL_DEF = SHIP_BY_ID.get(KESTREL);
const KESTREL_SLOTS = buildSlotList(KESTREL_DEF);
const BASE = KESTREL_DEF.buyback != null ? KESTREL_DEF.buyback : KESTREL_DEF.price;

function hullRecord(livingHull = null) {
  const owned = {
    defId: KESTREL,
    fittings: new Array(KESTREL_SLOTS.length).fill(null),
    fittedInstances: {},
  };
  if (livingHull) owned.livingHull = livingHull;
  return owned;
}

function renownRecord(acts) {
  return {
    schema: 'spaceface.livingHull.v1',
    renown: acts.map((act, i) => ({ id: `${act}:${i}`, act, atT: i + 1, tick: i + 1 })),
    updatedAtT: 1,
  };
}

function scarRecord(scars) {
  return {
    schema: 'spaceface.livingHull.v1',
    scars: scars.map((scar, i) => ({
      id: `scar:${i}`,
      cause: 'weapon',
      band: 'graze',
      tick: i + 1,
      atT: i + 1,
      ...scar,
    })),
    updatedAtT: 1,
  };
}

test('a clean hull still quotes the plain half, with no deeds to name', () => {
  const quote = deedResaleQuote(hullRecord(), KESTREL_DEF);
  assert.equal(quote.amount, Math.floor(BASE * RESALE_BASE_FRACTION));
  assert.equal(quote.premium, 0);
  assert.equal(quote.discount, 0);
  assert.deepEqual(quote.reasons, []);
});

test('twin hulls quote differently: renown lifts the quote and names the acts', () => {
  const clean = deedResaleQuote(hullRecord(), KESTREL_DEF);
  const storied = deedResaleQuote(
    hullRecord(renownRecord(['kill', 'kill', 'ram', 'rescue'])),
    KESTREL_DEF,
  );
  assert.ok(storied.amount > clean.amount, 'renown must raise the resale quote');
  assert.equal(storied.premium, 4 * 0.02);
  // The quote names the deeds in player words — the acts themselves, in kill-ram-rescue order.
  assert.deepEqual(storied.reasons, ['2 kills, a ram and a rescue on the record']);
});

test('scars cut the quote: open marks cost more than patched ones, and the buyer reads them', () => {
  const open = deedResaleQuote(
    hullRecord(scarRecord([{ band: 'hard' }, { band: 'graze' }])),
    KESTREL_DEF,
  );
  const patched = deedResaleQuote(
    hullRecord(scarRecord([{ band: 'hard', patchedAtT: 9 }, { band: 'graze', patchedAtT: 9 }])),
    KESTREL_DEF,
  );
  assert.ok(open.amount < patched.amount, 'open scars must cost more than patched ones');
  assert.equal(open.discount, 0.02 + 0.01);
  assert.equal(patched.discount, 2 * 0.005);
  assert.deepEqual(open.reasons, ['2 open scars the buyer reads']);
  assert.deepEqual(patched.reasons, ['2 patched scars the buyer reads']);
});

test('renown premium and scar discount are both capped — no uncapped values', () => {
  // The record itself caps at 8 acts / 24 scars; the quote must cap below even that ceiling.
  const deeds = deedResaleQuote(
    hullRecord(renownRecord(['kill', 'kill', 'kill', 'kill', 'kill', 'kill', 'kill', 'kill'])),
    KESTREL_DEF,
  );
  assert.equal(deeds.premium, RESALE_RENOWN_PREMIUM_CAP);
  const scarred = deedResaleQuote(
    hullRecord(scarRecord(Array.from({ length: 24 }, () => ({ band: 'crushing' })))),
    KESTREL_DEF,
  );
  assert.equal(scarred.discount, RESALE_SCAR_DISCOUNT_CAP);
});

test('the quote never passes the buy price', () => {
  // Best case for the seller: max premium, zero scars — still bounded under the list price.
  const best = deedResaleQuote(
    hullRecord(renownRecord(['kill', 'kill', 'kill', 'kill', 'kill', 'kill', 'kill', 'kill'])),
    KESTREL_DEF,
  );
  assert.ok(best.amount <= BASE, `${best.amount} must not exceed buy price ${BASE}`);
  assert.ok(best.fraction < 1);
  // Every SHIPS row answers the same bound — the quote is never above the buy price.
  for (const def of SHIPS) {
    const q = deedResaleQuote(
      hullRecord(renownRecord(['rescue', 'rescue', 'rescue', 'rescue', 'rescue', 'rescue'])),
      def,
    );
    const defBase = def.buyback != null ? def.buyback : def.price;
    assert.ok(q.amount <= defBase, `${def.id} quote ${q.amount} exceeds ${defBase}`);
  }
});

function world() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.playerId = 1;
  state.player.credits = 0;
  state.player.moduleInventory = [];
  state.player.loadoutPresets = [];
  // Three berths: the active hull stays unsellable; the twins behind it are the comparison —
  // berth 1 carries two kills on the record, berth 2 is the clean showroom copy.
  state.player.ownedShips = [hullRecord(), hullRecord(renownRecord(['kill', 'kill'])), hullRecord()];
  state.player.activeShipIndex = 0;
  const bus = createBus();
  const events = { sold: [], toasts: [], grants: [] };
  bus.on('ship:sold', (p) => events.sold.push(p));
  bus.on('toast', (p) => events.toasts.push(p));
  bus.on('economy:grantCredits', (p) => events.grants.push(p));
  const ships = Object.create(shipsProto);
  ships.init({ state, bus, helpers: {} });
  return { state, bus, ships, events };
}

test('sellShip pays the deed quote: the storied twin sells for more and the sale names why', () => {
  const w = world();
  const plain = deedResaleQuote(hullRecord(), KESTREL_DEF);
  // Sell berth 1 — the twin carrying two kills on the record. Its refund differs from the clean
  // twin's plain half, and ship:sold carries the quote that names the deeds.
  assert.equal(w.ships.sellShip(1), true);
  const sale = w.events.sold[0];
  assert.ok(sale.refund > plain.amount, 'the storied twin must resell above the plain half');
  assert.equal(sale.refund, Math.floor(BASE * (RESALE_BASE_FRACTION + 2 * 0.02)));
  assert.deepEqual(sale.quote.reasons, ['2 kills on the record']);
  assert.ok(
    w.events.toasts.some((t) => /2 kills on the record/.test(t.text)),
    'the sale toast names the deeds that moved the price',
  );
  assert.equal(w.events.grants[0].amount, sale.refund);
  // The clean twin still sells for exactly the plain half — same hull, different record.
  // (Berth 1 is already gone, so the clean hull now sits at index 1.)
  assert.equal(w.ships.sellShip(1), true);
  assert.equal(w.events.sold[1].refund, plain.amount);
  assert.equal(w.events.sold[1].quote.reasons.length, 0);
});
