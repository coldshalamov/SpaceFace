// tradeReceipt.js — SF-241 consumer half ("a partial fill says so", board row 286).
//
// TRADE CLEARED used to render `economy:tradeCompleted`'s settled quantity as though it were the
// confirmed one — a sale confirmed at 10 that the hold could only settle 6 of read "SOLD 6u" and
// never said what was asked. The market screen now stamps the confirmed terms into
// `state.ui.marketTradeExpectation` before it emits ui:buy/ui:sell (UI-owned scratch, the same
// tree as dockedStationId); this presenter projects those terms through
// tradeTruth.projectTradeOutcome against economy's own ledger receipt — the canonical record of
// what actually moved — and names the deviation in the receipt's own words.
//
// VIEW-ONLY over the read: it never touches the event payload and never changes settlement. The
// single write it performs is popping the UI-owned expectation slot — an expectation is consumed
// exactly once, so it can never attach to a later unrelated settle of the same lot.

import { COMMODITIES } from '../../data/commodities.js';
import { projectTradeOutcome } from '../sim/tradeTruth.js';

export const TRADE_EXPECTATION_KEY = 'marketTradeExpectation';

// The ui:buy/ui:sell emit → execute → tradeCompleted chain is synchronous on the bus, so a live
// expectation is always consumed inside the same tick. The window exists for the failed-execute
// case (no settle, no event): an expectation older than this is debris, not context.
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
 * Pop the confirmed terms the market screen stamped, when they can still describe this settle.
 * Returns null when nothing was confirmed or the stamp is too old to be this trade's context.
 */
export function takeTradeExpectation(state, p) {
  const ui = state && state.ui;
  const expectation = ui && ui[TRADE_EXPECTATION_KEY];
  if (ui) ui[TRADE_EXPECTATION_KEY] = null;
  if (!expectation || typeof expectation !== 'object') return null;
  if (expectation.commodityId !== (p && p.commodityId)) return null;
  const side = expectation.side === 'sell' ? 'sell' : 'buy';
  if (p && p.side != null && side !== p.side) return null;
  if (expectation.stationId != null && String(expectation.stationId) !== String(p && p.stationId)) return null;
  const ageS = (Number(state && state.simTime) || 0) - (Number(expectation.atSimTime) || 0);
  if (!(ageS >= 0 && ageS <= EXPECTATION_TTL_S)) return null;
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
  const expectation = takeTradeExpectation(state, p);
  if (expectation) {
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
          detail: `${name} · ${sign}${fmtCr(p.total)} cr` + sealedResidueClause(outcome, name),
        };
      }
      if (outcome.totalAgrees === false) {
        return {
          title: 'TRADE CLEARED',
          line: `${verb} ${fmtCr(outcome.executedQty)}u ${name}`,
          detail: `${sign}${fmtCr(p.total)} cr — the ledger reads ${fmtCr(outcome.receipt.total)} cr, not the stated ${fmtCr(expectation.total)}` + sealedResidueClause(outcome, name),
        };
      }
      return {
        title: 'TRADE CLEARED',
        line: `${verb} ${fmtCr(outcome.executedQty)}u ${name}`,
        detail: `${sign}${fmtCr(p.total)} cr · settled as confirmed` + sealedResidueClause(outcome, name),
      };
    }
  }
  return {
    title: 'TRADE CLEARED',
    line: `${verb} ${fmtCr(p.qty)}u ${name}`,
    detail: `${sign}${fmtCr(p.total)} cr`,
  };
}
