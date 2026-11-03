// tradeReceipt.js — SF-241 consumer half ("a partial fill says so", board row 286).
//
// TRADE CLEARED used to render `economy:tradeCompleted`'s settled quantity as though it were the
// confirmed one — a sale confirmed at 10 that the hold could only settle 6 of read "SOLD 6u" and
// never said what was asked. The market screen now stamps the confirmed terms and intent ID into
// `state.ui.marketTradeExpectation` before it dispatches through the current sim lane (UI-owned
// scratch, the same tree as dockedStationId); this presenter projects those terms through
// tradeTruth.projectTradeOutcome against economy's own ledger receipt — the canonical record of
// what actually moved — and names the deviation in the receipt's own words.
//
// VIEW-ONLY over the read: it never touches the event payload and never changes settlement. The
// single write it performs is popping the matching UI-owned expectation slot — an expectation is
// consumed exactly once, so it can never attach to a later unrelated settle of the same lot.

import { COMMODITIES } from '../../data/commodities.js';
import { projectTradeOutcome } from '../sim/tradeTruth.js';

export const TRADE_EXPECTATION_KEY = 'marketTradeExpectation';

// Legacy receipts without an intent ID still need a short terms-only window. ID-correlated Market
// receipts keep their confirmed terms until the matching terminal result, even across worker delay.
const EXPECTATION_TTL_S = 10;

const CMDTY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));

function sealedResidueClause(outcome, name) {
  const residue = outcome && outcome.residue;
  const held = residue ? residue.holdQty : 0;
  const yours = residue ? residue.holdSellableQty : 0;
  if (!(held > yours)) return '';
  return ` · ${yours} of ${held} ${name} yours to sell`;
}

function titleCaseWords(v) {
  return String(v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtCr(n) {
  return Math.round(Number(n) || 0).toLocaleString('en-US');
}

/**
 * Pop the confirmed terms the market screen stamped when they describe this settle.
 * Returns null when nothing was confirmed, correlation differs, or a legacy stamp expired.
 */
function tradeIntentMatches(expectation, p) {
  const expectedId = expectation && expectation.intentId;
  const receivedId = p && p.intentId;
  // If either side is correlated, both IDs must be present and equal. Legacy
  // pre-ID receipts keep the old terms-based behavior.
  if (expectedId != null || receivedId != null) {
    return typeof expectedId === 'string' && expectedId.length > 0 && expectedId === receivedId;
  }
  return true;
}

/** Clear only the expectation acknowledged by a matching terminal refusal. */
export function clearTradeExpectation(state, p = {}) {
  const ui = state && state.ui;
  const expectation = ui && ui[TRADE_EXPECTATION_KEY];
  if (!expectation || typeof expectation !== 'object' || !tradeIntentMatches(expectation, p)) return null;
  ui[TRADE_EXPECTATION_KEY] = null;
  return expectation;
}

function rememberTradeIntent(set, intentId) {
  if (!(set instanceof Set) || typeof intentId !== 'string' || !intentId) return;
  set.add(intentId);
  while (set.size > 128) set.delete(set.values().next().value);
}

function isMarketTradeIntentId(intentId) {
  return typeof intentId === 'string' && intentId.startsWith('market:');
}

/** Station receipt owner: retired and already-presented intent IDs never paint twice. */
export function consumeStationTradeReceipt(state, payload, {
  retiredIntentIds = new Set(), shownIntentIds = new Set(),
} = {}) {
  const intentId = payload && typeof payload.intentId === 'string' ? payload.intentId : null;
  // Market intent IDs are unique across the UI's lifetime and need receipt de-duplication
  // across reset/recovery. Other producers may use deterministic IDs that legitimately repeat
  // in a new world, so their presentation lifecycle remains event-based.
  if (isMarketTradeIntentId(intentId)) {
    if (retiredIntentIds.has(intentId) || shownIntentIds.has(intentId)) return null;
    rememberTradeIntent(shownIntentIds, intentId);
  }
  return tradeClearedReceipt(state, payload || {});
}

export function takeTradeExpectation(state, p) {
  const ui = state && state.ui;
  const expectation = ui && ui[TRADE_EXPECTATION_KEY];
  if (!expectation || typeof expectation !== 'object') return null;
  const correlated = expectation.intentId != null || (p && p.intentId != null);
  // Preserve the legacy terms-only single-use slot: the next settle consumes it even if the
  // lot/side/station differs. ID-correlated Market terms stay put until their matching result.
  if (!correlated) ui[TRADE_EXPECTATION_KEY] = null;
  if (!tradeIntentMatches(expectation, p)) return null;
  if (expectation.commodityId !== (p && p.commodityId)) return null;
  const side = expectation.side === 'sell' ? 'sell' : 'buy';
  if (p && p.side != null && side !== p.side) return null;
  if (expectation.stationId != null && String(expectation.stationId) !== String(p && p.stationId)) return null;
  const ageS = (Number(state && state.simTime) || 0) - (Number(expectation.atSimTime) || 0);
  // A matching ID is authoritative correlation for this exact intent, so its confirmed
  // terms remain useful until the terminal result arrives. Keep the TTL only for legacy
  // receipts without IDs, where terms alone cannot distinguish an old transaction.
  const correlatedById = typeof expectation.intentId === 'string' && expectation.intentId === p.intentId;
  if (!correlatedById && !(ageS >= 0 && ageS <= EXPECTATION_TTL_S)) {
    return null;
  }
  // Do not pop a newer or unrelated pending confirmation on a stale completion.
  if (correlatedById) ui[TRADE_EXPECTATION_KEY] = null;
  return expectation;
}

/**
 * tradeClearedReceipt(state, p) -> { title, line, detail }
 *
 * The TRADE CLEARED receipt for one `economy:tradeCompleted` payload `p`. With a live confirmed
 * terms stamp the read goes through projectTradeOutcome — a partial fill names what was asked
 * ("SOLD 6 OF THE 10 CONFIRMED"), a settlement matching the stated terms reports agreement
 * ("settled as confirmed"). Without a stamp (a trade that never went through the screen) the
 * receipt renders exactly what the event settled, as before.
 */
export function tradeClearedReceipt(state, p = {}) {
  const name = CMDTY_NAME.get(p.commodityId) || titleCaseWords(p.commodityId || 'cargo');
  const verb = p.side === 'sell' ? 'SOLD' : 'BOUGHT';
  const sign = p.side === 'sell' ? '+' : '−';
  const premium = p.side === 'sell' && p.shortagePremium === true
    ? ' · shortage premium included' : '';
  const expectation = takeTradeExpectation(state, p);
  if (expectation) {
    if (p.presentationOnly === 'market-rpc-recovery') {
      const executedQty = Math.max(0, Math.floor(Number(p.qty) || 0));
      const requestedQty = Math.max(0, Math.floor(Number(expectation.qty) || 0));
      const settledTotal = Math.round(Number(p.total) || 0);
      const expectedTotal = Math.round(Number(expectation.total) || 0);
      if (executedQty < requestedQty) {
        return {
          title: 'TRADE CLEARED',
          line: `${verb} ${fmtCr(executedQty)} OF THE ${fmtCr(requestedQty)} CONFIRMED`,
          detail: `${name} · ${sign}${fmtCr(settledTotal)} cr` + premium + ' · recovered from the station result',
        };
      }
      if (Math.abs(settledTotal - expectedTotal) > 1) {
        return {
          title: 'TRADE CLEARED',
          line: `${verb} ${fmtCr(executedQty)}u ${name}`,
          detail: `${sign}${fmtCr(settledTotal)} cr — the station result differs from the stated ${fmtCr(expectedTotal)} cr` + premium,
        };
      }
      return {
        title: 'TRADE CLEARED',
        line: `${verb} ${fmtCr(executedQty)}u ${name}`,
        detail: `${sign}${fmtCr(settledTotal)} cr · settled as confirmed` + premium,
      };
    }
    const outcome = projectTradeOutcome(state, {
      commodityId: expectation.commodityId,
      side: expectation.side,
      qty: expectation.qty,
      total: expectation.total,
      stationId: expectation.stationId != null ? expectation.stationId : p.stationId,
      afterSequence: expectation.afterSequence,
      afterSimTime: expectation.afterSimTime,
    });
    // The projection must name the SAME settlement the event announced — a newer receipt for the
    // same lot is a different trade's truth, not this one's.
    if (outcome.receipt && p.receiptId != null
      && String(outcome.receipt.receiptId) === String(p.receiptId)) {
      if (outcome.partialFill) {
        return {
          title: 'TRADE CLEARED',
          line: `${verb} ${fmtCr(outcome.executedQty)} OF THE ${fmtCr(outcome.requestedQty)} CONFIRMED`,
          detail: `${name} · ${sign}${fmtCr(p.total)} cr` + premium + sealedResidueClause(outcome, name),
        };
      }
      if (outcome.totalAgrees === false) {
        return {
          title: 'TRADE CLEARED',
          line: `${verb} ${fmtCr(outcome.executedQty)}u ${name}`,
          detail: `${sign}${fmtCr(p.total)} cr — the ledger reads ${fmtCr(outcome.receipt.total)} cr, not the stated ${fmtCr(expectation.total)}` + premium + sealedResidueClause(outcome, name),
        };
      }
      return {
        title: 'TRADE CLEARED',
        line: `${verb} ${fmtCr(outcome.executedQty)}u ${name}`,
        detail: `${sign}${fmtCr(p.total)} cr · settled as confirmed` + premium + sealedResidueClause(outcome, name),
      };
    }
  }
  return {
    title: 'TRADE CLEARED',
    line: `${verb} ${fmtCr(p.qty)}u ${name}`,
    detail: `${sign}${fmtCr(p.total)} cr` + premium,
  };
}
