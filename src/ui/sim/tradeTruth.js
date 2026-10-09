// tradeTruth.js — SF-241 sim half ("a trade confirmation that cannot lie about quantity").
//
// After a confirm, what the screen SAID (quantity, price, total) and what ACTUALLY moved must
// resolve to the same transaction. The durable truth is economy's own trade ledger:
// `recordTradeLedger` (src/systems/economy.js) stamps every settled trade with a receiptId, a
// monotonic tradeSequence, the EXECUTED quantity and the rounded totals — and `afterTrade`
// publishes the same identity on `economy:tradeCompleted`. This module is the read-only
// projection of those receipts plus the residue the move left behind (the hold and the purse),
// so a confirmation screen can derive "what actually moved" at query time instead of trusting
// what it displayed before the market or the purse changed underneath it.
//
// A partial execution is not a lie the screen is allowed to paper over: the receipt carries the
// executed quantity, and projectTradeOutcome() reports it against the confirmed quantity as a
// partialFill deviation rather than hiding it.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5): no mutation, no events, no Three.js, no Math.random.
// Single-writer law: economy owns the ledger and credits, cargo owns the hold. This file owns
// none of them and writes nothing. Never throws on malformed state — a missing ledger reads as
// "no trade settled", never as a fabricated receipt.

import { sellableCargoQuantity } from '../../systems/cargo.js';

function cleanInt(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function ledger(state) {
  const entries = state && state.player && state.player.tradeLedger;
  return Array.isArray(entries) ? entries : [];
}

/** Defensive frozen copy of one ledger entry — the screen may hold it past the next sim tick. */
function copyReceipt(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return Object.freeze({
    receiptId: entry.receiptId != null ? String(entry.receiptId) : null,
    tradeSequence: cleanInt(entry.tradeSequence),
    stationId: entry.stationId != null ? String(entry.stationId) : null,
    commodityId: typeof entry.commodityId === 'string' ? entry.commodityId : null,
    side: entry.side === 'sell' ? 'sell' : 'buy',
    qty: cleanInt(entry.qty),
    unit: cleanInt(entry.unit),
    buyUnit: cleanInt(entry.buyUnit),
    marginPerUnit: Math.round(Number(entry.marginPerUnit) || 0),
    profit: Math.round(Number(entry.profit) || 0),
    seenAt: Math.max(0, Math.round(Number(entry.seenAt) || 0)),
    total: Math.round(Number(entry.total) || 0),
  });
}

function matchesFilter(receipt, filter) {
  if (filter.commodityId != null && receipt.commodityId !== filter.commodityId) return false;
  if (filter.side != null && receipt.side !== filter.side) return false;
  if (filter.stationId != null && receipt.stationId !== filter.stationId) return false;
  if (filter.afterSequence != null && !(receipt.tradeSequence > cleanInt(filter.afterSequence))) return false;
  if (filter.afterSimTime != null && !(receipt.seenAt >= Math.max(0, Math.round(Number(filter.afterSimTime) || 0)))) return false;
  return true;
}

/**
 * latestTradeReceipt(state, filter?) -> frozen receipt copy | null
 *
 * The newest settled trade matching the filter. `filter` accepts { commodityId, side, stationId,
 * afterSequence, afterSimTime } (all optional). The ledger is economy-owned and newest-first;
 * this is a plain honest read of it, never a parallel history.
 */
export function latestTradeReceipt(state, filter = {}) {
  const entries = ledger(state);
  for (const entry of entries) {
    const receipt = copyReceipt(entry);
    if (receipt && matchesFilter(receipt, filter)) return receipt;
  }
  return null;
}

/**
 * findTradeReceipt(state, ref) -> frozen receipt copy | null
 * `ref` is { receiptId } or { tradeSequence } — the identity `economy:tradeCompleted` published,
 * so a screen can re-read the exact settlement it announced instead of "the latest one".
 */
export function findTradeReceipt(state, ref) {
  if (!ref || typeof ref !== 'object') return null;
  const entries = ledger(state);
  if (ref.receiptId != null) {
    const id = String(ref.receiptId);
    for (const entry of entries) {
      if (entry && entry.receiptId === id) return copyReceipt(entry);
    }
    return null;
  }
  const sequence = cleanInt(ref.tradeSequence);
  if (!(sequence > 0)) return null;
  for (const entry of entries) {
    if (entry && cleanInt(entry.tradeSequence) === sequence) return copyReceipt(entry);
  }
  return null;
}

/**
 * tradeResidue(state, commodityId) -> { holdQty, holdSellableQty, credits }
 * The residue the trade left behind, read from the canonical owners at the query moment: the
 * hold (cargo-owned; full stack and what its seal reader leaves sellable) and the purse
 * (economy-owned). Missing state reads as empty, never as another location's stock.
 */
export function tradeResidue(state, commodityId) {
  const player = (state && state.player) || {};
  const items = (player.cargo && player.cargo.items) || {};
  const holdQty = typeof commodityId === 'string' ? cleanInt(items[commodityId]) : 0;
  const holdSellableQty = typeof commodityId === 'string'
    ? Math.min(holdQty, Math.max(0, Math.floor(Number(sellableCargoQuantity(state, commodityId)) || 0)))
    : 0;
  const credits = Math.max(0, Math.floor(Number(player.credits) || 0));
  return { holdQty, holdSellableQty, credits };
}

// Ledger totals are rounded to whole credits at record time; a floating-point expectation from
// unit × qty may differ by that rounding and still be the same transaction.
const TOTAL_AGREE_TOLERANCE_CR = 1;

/**
 * projectTradeOutcome(state, expected) -> projection
 *
 * The post-confirm truth for one confirmed trade. `expected` is what the confirmation showed:
 *   { commodityId, side, qty, total?, unit?, stationId?, afterSequence?, afterSimTime? }
 * The projection matches the newest settled receipt for that commodity/side (bounded by
 * afterSequence/afterSimTime when the caller pins the confirm) and reports:
 *   found          — a settled receipt exists for the confirmation
 *   receipt        — the frozen economy receipt (what actually moved)
 *   executedQty    — the quantity the economy actually moved
 *   partialFill    — the market executed strictly less than the confirmed quantity
 *   quantityAgrees — executed === confirmed
 *   totalAgrees    — |receipt.total − expected.total| ≤ 1 cr (null when no total was confirmed)
 *   agrees         — found && quantityAgrees && totalAgrees !== false
 *   deviations     — the per-field truth when it differs ({ expected, actual } rows)
 *   residue        — tradeResidue(state, commodityId) at the query moment
 */
export function projectTradeOutcome(state, expected) {
  const wanted = expected && typeof expected === 'object' ? expected : {};
  const commodityId = typeof wanted.commodityId === 'string' ? wanted.commodityId : null;
  const side = wanted.side === 'sell' ? 'sell' : 'buy';
  const confirmedQty = cleanInt(wanted.qty);
  const receipt = commodityId
    ? latestTradeReceipt(state, {
      commodityId,
      side,
      stationId: wanted.stationId != null ? String(wanted.stationId) : undefined,
      afterSequence: wanted.afterSequence != null ? wanted.afterSequence : undefined,
      afterSimTime: wanted.afterSimTime != null ? wanted.afterSimTime : undefined,
    })
    : null;
  const executedQty = receipt ? receipt.qty : 0;
  const partialFill = receipt ? executedQty < confirmedQty : false;
  const quantityAgrees = !!receipt && executedQty === confirmedQty;
  let totalAgrees = null;
  if (receipt && wanted.total != null) {
    const confirmedTotal = Math.round(Number(wanted.total) || 0);
    totalAgrees = Math.abs(receipt.total - confirmedTotal) <= TOTAL_AGREE_TOLERANCE_CR;
  }
  const deviations = [];
  if (!receipt) {
    deviations.push({ field: 'settlement', expected: 'a settled trade', actual: 'none' });
  } else {
    if (!quantityAgrees) deviations.push({ field: 'qty', expected: confirmedQty, actual: executedQty });
    if (totalAgrees === false) {
      deviations.push({ field: 'total', expected: Math.round(Number(wanted.total) || 0), actual: receipt.total });
    }
  }
  return Object.freeze({
    found: !!receipt,
    receipt,
    requestedQty: confirmedQty,
    executedQty,
    partialFill,
    quantityAgrees,
    totalAgrees,
    agrees: !!receipt && quantityAgrees && totalAgrees !== false,
    deviations: Object.freeze(deviations.map(Object.freeze)),
    residue: Object.freeze(tradeResidue(state, commodityId)),
  });
}
