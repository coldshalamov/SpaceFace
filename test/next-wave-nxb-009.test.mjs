// NXB-009 — atomic bomb-rack preparation.
// One preparation = re-fit + reload + optional socket extension under a single yard quote.
// The planner is pure (never mutates state), the quote is pinned to a live-state
// fingerprint, and the money boundary is the economy owner's exact economy:chargeCredits
// request: the bomb-owned replacement runs inside the payment callback, so a stale screen
// or a missing credit writer can never settle a half-applied rack.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { bombs, previewBombPreparation } from '../src/systems/bombs.js';
import { economy } from '../src/systems/economy.js';
import { BOMB_DEFS, BOMB_RACK } from '../src/data/bombs.js';

const OUTFIT_BERTH = 'station_helios'; // shipyard service → shipworksStationAccess().outfit

function rackScenario({ credits = 0, withEconomy = true } = {}) {
  const state = createGameState(4242), bus = createBus(), helpers = {};
  state.mode = 'flight'; state.simTime = 0; state.tick = 0;
  const ctx = { state, bus, helpers, registry: { get: () => null } };
  Object.create(core).init(ctx);
  const econ = withEconomy ? Object.create(economy) : null;
  if (econ) econ.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', team: 0, mass: 32, radius: 6,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 1000, hullMax: 1000,
  });
  state.playerId = player.id;
  state.player.credits = credits;
  const sys = Object.create(bombs);
  sys.init(ctx);
  const denied = [], toasts = [], charges = [], creditMoves = [];
  bus.on('bombs:denied', (p) => denied.push(p));
  bus.on('toast', (p) => toasts.push(p));
  bus.on('economy:chargeCredits', (p) => charges.push(p));
  bus.on('credits:changed', (p) => creditMoves.push(p));
  return {
    state, bus, player, sys, econ, denied, toasts, charges, creditMoves,
    dock() { state.ui.docked = true; state.ui.dockedStationId = OUTFIT_BERTH; },
    undock() { state.ui.docked = false; state.ui.dockedStationId = null; },
    cell(i) { return state.bombs.rack.cells[i]; },
    cells() { return state.bombs.rack.cells.map((c) => (c ? { id: c.id, count: c.count } : null)); },
    setRack(cells, sockets) {
      const rt = state.bombs;
      rt.rack.sockets = sockets != null ? sockets : cells.length;
      rt.rack.cells = cells;
    },
    preview(options) { return sys.previewPreparation(options); },
    commit(quote) { return sys.commitPreparation(quote); },
    uiPrepare(quote) { const req = { quote }; bus.emit('ui:prepareBombRack', req); return req.result; },
    close() { sys.destroy(); if (econ && typeof econ.destroy === 'function') econ.destroy(); bus.clear(); },
  };
}

test('two families partially fill under insufficient credits; the quote is the settlement', () => {
  const t = rackScenario({ credits: 450 });
  try {
    t.dock();
    // frag needs 3 (mag 4, loaded 1) with 1 owned in the hangar; emp needs a full 3 with none.
    t.setRack([{ id: 'bomb_frag', count: 1 }, { id: 'bomb_emp', count: 0 }]);
    t.state.bombs.stock.bomb_frag = 1;
    const before = t.cells();
    const quote = t.preview();
    const plan = quote.plan;
    assert.equal(plan.ok, true);
    assert.equal(plan.limitingReason, 'credits', 'emp magazine stays short — funds run out');
    assert.deepEqual(plan.usedOwnedUnits, { bomb_frag: 1 }, 'owned stock is consumed before purchases');
    assert.deepEqual(plan.purchasedUnits, { bomb_frag: 2 }, 'socket order: frag buys 2×140 before emp');
    assert.equal(plan.roundsLoaded, 3);
    assert.equal(plan.totalCost, BOMB_RACK.restockFeeCr + 2 * BOMB_DEFS.bomb_frag.price);
    assert.deepEqual(plan.postCells, [{ id: 'bomb_frag', count: 4 }, { id: 'bomb_emp', count: 0 }]);
    assert.equal(plan.postStock.bomb_frag || 0, 0, 'the owned frag round was spent');
    // The preview itself is pure: nothing moved yet.
    assert.deepEqual(t.cells(), before);
    assert.equal(t.state.player.credits, 450);
    // Commit settles exactly the quoted quantities and price.
    assert.equal(t.uiPrepare(quote), true);
    assert.deepEqual(t.cells(), plan.postCells);
    assert.deepEqual(t.state.bombs.stock, plan.postStock);
    assert.equal(t.state.player.credits, 450 - plan.totalCost);
    assert.equal(t.charges.length, 1);
    assert.equal(t.charges[0].amount, plan.totalCost);
    assert.equal(t.charges[0].reason, 'service:bomb_rack_prepare');
    assert.equal(t.charges[0].requireFull, true);
    assert.equal(t.charges[0].expectedCredits, 450);
  } finally { t.close(); }
});

test('default preparation tops up the fitted rack: owned first, dry ids kept, selection held', () => {
  const t = rackScenario({ credits: 230 });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 1 }, { id: 'bomb_goo', count: 0 }]);
    t.state.bombs.stock.bomb_frag = 10;
    t.state.bombs.stock.bomb_emp = 3; // unfitted ordnance is untouched by a restock plan
    t.state.bombs.selectedId = 'bomb_frag';
    const quote = t.preview();
    const plan = quote.plan;
    assert.equal(plan.ok, true);
    // frag 1→4 uses 3 owned + 0 bought; goo 0→3 uses 0 owned + 180cr of purchases until broke.
    // 230cr - 40cr fee buys exactly one 180cr goo unit.
    assert.deepEqual(plan.usedOwnedUnits, { bomb_frag: 3 });
    assert.deepEqual(plan.purchasedUnits, { bomb_goo: 1 });
    assert.equal(plan.postCells[1].id, 'bomb_goo', 'dry magazine keeps its fitted identity');
    assert.equal(t.commit(quote), true);
    assert.equal(t.cell(0).count, 4);
    assert.equal(t.cell(1).count, 1);
    assert.equal(t.state.bombs.stock.bomb_frag, 7);
    assert.equal(t.state.bombs.stock.bomb_emp, 3);
    assert.equal(t.state.bombs.selectedId, 'bomb_frag', 'selected family still loaded → kept');
  } finally { t.close(); }
});

test('planner validation: integers, known ids, unique families, socket bounds — no laundering', () => {
  const t = rackScenario({ credits: 1000 });
  try {
    assert.equal(previewBombPreparation(t.state, { socketCount: 2.5 }).ok, false);
    assert.equal(previewBombPreparation(t.state, { socketCount: 0 }).ok, false);
    assert.equal(previewBombPreparation(t.state, { socketCount: BOMB_RACK.socketsMax + 1 }).ok, false);
    assert.equal(previewBombPreparation(t.state, { payloadIds: ['not_a_bomb'] }).ok, false);
    assert.equal(previewBombPreparation(t.state, { payloadIds: ['bomb_frag', 'bomb_frag'] }).ok, false);
    assert.equal(
      previewBombPreparation(t.state, { socketCount: 2, payloadIds: ['bomb_goo', 'bomb_emp', 'bomb_frag'] }).ok,
      false, 'more desired cells than sockets is invalid',
    );
    // Fractional hangar stock floors — it never mints an extra unit.
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 0 }, null]);
    t.state.bombs.stock.bomb_frag = 2.9;
    const plan = previewBombPreparation(t.state, { purchaseMissing: false });
    assert.equal(plan.ok, true);
    assert.equal(plan.usedOwnedUnits.bomb_frag, 2, '2.9 in the hangar reads as 2');
    assert.equal(plan.postCells[0].count, 2);
    assert.equal(plan.limitingReason, 'stock', 'no purchase path → the shortfall is stock');
  } finally { t.close(); }
});

test('rejection leaves money and rack untouched: no receiver, stale credits, rack, dock, save', () => {
  // No economy listener at all — the exact request is never accepted.
  const t = rackScenario({ credits: 5000, withEconomy: false });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 0 }, { id: 'bomb_goo', count: 0 }]);
    const quote = t.preview();
    assert.equal(t.commit(quote), false, 'no economy listener → not accepted');
    assert.deepEqual(t.cells(), [{ id: 'bomb_frag', count: 0 }, { id: 'bomb_goo', count: 0 }]);
    assert.equal(t.state.player.credits, 5000);
    assert.equal(t.charges.length, 1, 'the request was emitted; nobody answered it');
    assert.equal(t.charges[0].result, false);
  } finally { t.close(); }

  const s = rackScenario({ credits: 1000 });
  try {
    s.dock();
    s.setRack([{ id: 'bomb_frag', count: 0 }, null]);
    const quote = s.preview();
    // Stale credits: a grant lands between quote and commit.
    s.bus.emit('economy:grantCredits', { amount: 500, reason: 'test' });
    assert.equal(s.commit(quote), false, 'stale credits fingerprint → reject, do not rebind');
    assert.equal(s.state.player.credits, 1500);
    assert.equal(s.cell(0).count, 0);
    // Stale rack: the magazine changed since the quote.
    const quote2 = s.preview();
    s.state.bombs.rack.cells[0] = { id: 'bomb_emp', count: 2 };
    assert.equal(s.commit(quote2), false);
    assert.equal(s.state.player.credits, 1500, 'no charge on a stale-rack rejection');
    // Stale dock: the berth under the quote is gone.
    const quote3 = s.preview();
    s.state.ui.dockedStationId = 'station_waypoint';
    assert.equal(s.commit(quote3), false);
    // Save boundary: a serialized quote can never settle later.
    const quote4 = s.preview();
    s.sys.serialize();
    assert.equal(s.commit(quote4), false, 'quotes die at the save boundary');
    assert.equal(s.creditMoves.length, 1, 'only the grant moved money this whole test');
  } finally { s.close(); }
});

test('a nested credit callback cannot buy, fit, restock or re-confirm mid-commit', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 0 }, { id: 'bomb_emp', count: 0 }]);
    const quote = t.preview();
    const reentry = { nestedExact: null };
    t.bus.on('credits:changed', () => {
      // Every direct rack verb and a second confirm are sealed while the charge settles.
      if (t.sys.buyPayload({ payloadId: 'bomb_goo', units: 1 })) reentry.bought = true;
      if (t.sys.fitPayload({ socketIndex: 0, payloadId: 'bomb_goo' })) reentry.fitted = true;
      if (t.sys.restockRack()) reentry.restocked = true;
      if (t.sys.commitPreparation(quote)) reentry.recommitted = true;
      const nested = { amount: 5, reason: 'service:nested', requireFull: true, expectedCredits: 0, result: null, commit: () => true };
      t.bus.emit('economy:chargeCredits', nested);
      reentry.nestedExact = nested.result;
    });
    assert.equal(t.commit(quote), true);
    assert.deepEqual(reentry, { nestedExact: false }, 'nothing re-entered: no verb, no nested exact charge');
    assert.equal(t.creditMoves.length, 1, 'only the quoted charge moved money');
    assert.equal(t.state.bombs.stock.bomb_goo || 0, 0, 'no units were bought inside the callback');
    assert.deepEqual(t.cells(), quote.plan.postCells);
  } finally { t.close(); }
});

test('a quote settles once; re-confirming the same quote cannot charge or load twice', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 0 }, null]);
    const quote = t.preview();
    assert.equal(t.commit(quote), true);
    assert.equal(t.cell(0).count, BOMB_DEFS.bomb_frag.magazine);
    const credits = t.state.player.credits;
    assert.equal(t.commit(quote), false, 'consumed quote is dead');
    assert.equal(t.uiPrepare(quote), false, 'the ui route honours the same consumed quote');
    assert.equal(t.state.player.credits, credits);
    assert.equal(t.charges.length, 1);
    // A fresh quote against the new state still works — nothing is poisoned.
    const again = t.preview();
    assert.equal(again.plan.changed, false, 'rack already topped up');
  } finally { t.close(); }
});

test('a smaller rack returns every displaced unit to the hangar — no fee, no deletion', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 4 }, { id: 'bomb_concussion', count: 4 }, { id: 'bomb_goo', count: 2 }], 3);
    const quote = t.preview({ socketCount: 2, payloadIds: ['bomb_frag', 'bomb_concussion'] });
    const plan = quote.plan;
    assert.equal(plan.ok, true);
    assert.equal(plan.appliedSockets, 2);
    assert.equal(plan.postStock.bomb_goo, 2, 'the trimmed socket hands its units back');
    assert.equal(plan.totalCost, 0, 'nothing loaded, no expansion → no fee');
    assert.equal(plan.changed, true);
    assert.equal(t.commit(quote), true);
    assert.equal(t.state.bombs.rack.sockets, 2);
    assert.deepEqual(t.cells(), [{ id: 'bomb_frag', count: 4 }, { id: 'bomb_concussion', count: 4 }]);
    assert.equal(t.state.bombs.stock.bomb_goo, 2);
    assert.equal(t.state.player.credits, 5000, 'zero-cost preparation writes no credits');
    assert.equal(t.creditMoves.length, 0);
  } finally { t.close(); }
});

test('socket extension is an authored yard cost inside the same atomic prepare', () => {
  const t = rackScenario({ credits: 9000 });
  try {
    t.dock();
    const quote = t.preview({ socketCount: 3, payloadIds: ['bomb_frag', 'bomb_concussion', 'bomb_goo'] });
    const plan = quote.plan;
    assert.equal(plan.ok, true);
    assert.equal(plan.expansionCost, BOMB_RACK.socketUpgradeCr);
    assert.equal(plan.appliedSockets, 3);
    assert.ok(plan.totalCost > BOMB_RACK.socketUpgradeCr, 'extension + loading land in one charge');
    assert.equal(t.commit(quote), true);
    assert.equal(t.state.bombs.rack.sockets, 3);
    assert.equal(t.cell(2).id, 'bomb_goo');
    // Broke extension: the plan clamps to the affordable sockets instead of pretending.
    const t2 = rackScenario({ credits: 100 });
    try {
      t2.dock();
      const poor = previewBombPreparation(t2.state, { socketCount: 3 });
      assert.equal(poor.ok, true);
      assert.equal(poor.appliedSockets, 2, 'cannot afford the weld → no third socket');
      assert.equal(poor.expansionCost, 0);
      assert.equal(poor.limitingReason, 'credits');
    } finally { t2.close(); }
  } finally { t.close(); }
});

test('the exact charge seam refuses fractional or misquoted amounts before any commit', () => {
  const t = rackScenario({ credits: 1000 });
  try {
    t.dock();
    let committed = 0;
    const spy = () => { committed++; return true; };
    const fractional = { amount: 1.5, reason: 'service:bomb_rack_prepare', requireFull: true, expectedCredits: 1000, result: null, commit: spy };
    t.bus.emit('economy:chargeCredits', fractional);
    assert.equal(fractional.result, false, 'fractional amount is not rounded into acceptance');
    assert.equal(committed, 0, 'the caller replacement never ran');
    assert.equal(t.state.player.credits, 1000, 'no debit');
    const stale = { amount: 10, requireFull: true, expectedCredits: 999, result: null, commit: spy };
    t.bus.emit('economy:chargeCredits', stale);
    assert.equal(stale.result, false, 'a misquoted balance rejects');
    assert.equal(committed, 0);
    const unsafe = { amount: Number.MAX_SAFE_INTEGER + 1, requireFull: true, expectedCredits: 1000, result: null, commit: spy };
    t.bus.emit('economy:chargeCredits', unsafe);
    assert.equal(unsafe.result, false);
    assert.equal(t.state.player.credits, 1000);
    // The legacy clamp path is untouched: a plain fractional charge still rounds as before.
    t.econ.chargeCredits(1.5, 'legacy');
    assert.equal(t.state.player.credits, 998);
  } finally { t.close(); }
});

test('overflow rounds are fingerprinted — a drifted beyond-socket cell rejects the quote', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    t.dock();
    // Crafted oversize rack: sockets 2 but a third cell still carries live goo units (the
    // pre-normalize save shape). The planner folds them into the hangar plan — and the
    // fingerprint must pin them too.
    t.setRack([{ id: 'bomb_frag', count: 4 }, { id: 'bomb_concussion', count: 4 }, { id: 'bomb_goo', count: 2 }], 2);
    const quote = t.preview({ purchaseMissing: false });
    assert.equal(quote.plan.ok, true);
    assert.equal(quote.plan.stock.bomb_goo, 2, 'overflow merges into the planned hangar');
    t.state.bombs.rack.cells[2].count = 3;
    assert.equal(t.commit(quote), false, 'overflow drift invalidates the quote');
    assert.equal(t.state.bombs.rack.cells[2].count, 3, 'every live unit survives the rejection');
    assert.equal(t.state.player.credits, 5000);
    // Re-quoted at the live state it settles and the overflow lands in the hangar intact.
    const again = t.preview({ purchaseMissing: false });
    assert.equal(t.commit(again), true);
    assert.equal(t.state.bombs.stock.bomb_goo, 3);
    assert.equal(t.state.bombs.rack.cells.length, 2);
  } finally { t.close(); }
});

test('a bare socketCount shrink keeps the leading fits and returns the trimmed magazine', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 4 }, { id: 'bomb_concussion', count: 4 }, { id: 'bomb_goo', count: 2 }], 3);
    const quote = t.preview({ socketCount: 2 }); // no payloadIds — the default truncates
    assert.equal(quote.plan.ok, true);
    assert.deepEqual(quote.plan.postCells.map((c) => c && c.id), ['bomb_frag', 'bomb_concussion']);
    assert.equal(quote.plan.postStock.bomb_goo, 2);
    assert.equal(t.commit(quote), true);
    assert.equal(t.state.bombs.rack.sockets, 2);
    assert.equal(t.state.bombs.stock.bomb_goo, 2);
  } finally { t.close(); }
});

test('non-finite or unsafe hangar counts never mint free units', () => {
  const t = rackScenario({ credits: 1000 });
  try {
    t.dock();
    t.setRack([{ id: 'bomb_frag', count: 0 }, { id: 'bomb_goo', count: 0 }]);
    t.state.bombs.stock.bomb_frag = Infinity;
    t.state.bombs.stock.bomb_goo = 1e30;
    t.state.bombs.stock.bomb_emp = 2.9;
    const plan = previewBombPreparation(t.state, { purchaseMissing: false });
    assert.equal(plan.ok, true);
    assert.equal(plan.usedOwnedUnits.bomb_frag || 0, 0, 'Infinity is not a magazine');
    assert.equal(plan.usedOwnedUnits.bomb_goo || 0, 0, 'beyond-safe counts are not ammunition');
    assert.equal(plan.postCells[0].count, 0);
    assert.equal(plan.postCells[1].count, 0);
    assert.equal(plan.stock.bomb_emp, 2, 'fractional stock still floors');
    assert.equal(plan.limitingReason, 'stock');
  } finally { t.close(); }
});

test('the ui seam: undocked prepare is denied; a cancelled confirm never commits', () => {
  const t = rackScenario({ credits: 5000 });
  try {
    // Preview works anywhere (read-only); commit is berth-gated like every rack verb.
    const early = { options: {}, quote: null };
    t.bus.emit('ui:previewBombRackPreparation', early);
    assert.ok(early.quote && early.quote.plan && early.quote.plan.ok === true);
    t.setRack([{ id: 'bomb_frag', count: 0 }, null]);
    const quote = t.preview();
    assert.equal(t.uiPrepare(quote), undefined, 'undocked: the gate refuses before commit');
    assert.ok(t.denied.some((d) => d.reason === 'not_docked'));
    assert.equal(t.cell(0).count, 0);
    // Cancel branch: preview happens, prepare is never emitted — nothing moves.
    t.dock();
    const cancel = { options: {}, quote: null };
    t.bus.emit('ui:previewBombRackPreparation', cancel);
    assert.ok(cancel.quote);
    assert.equal(t.charges.length, 0);
    assert.equal(t.cell(0).count, 0, 'cancellation leaves the rack untouched');
    // Malformed prepare payloads fail safe too.
    assert.equal(t.uiPrepare(null), false);
    assert.equal(t.uiPrepare({ fake: true }), false);
  } finally { t.close(); }
});
