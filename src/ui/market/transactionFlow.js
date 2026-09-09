/** A small presentation state machine. Economy/cargo remain the only transaction writers.
 * Subscribe before dispatch: the bus resolves a trade synchronously in the normal game.
 * Never convert elapsed time, a click, or a changed quote into a successful receipt.
 */
import { matchingTradeReceipt, tradeReceiptPresentation, tradeFailurePresentation } from './transactionPresentation.js';

export function createTradeFlow({ bus, onChange = () => {}, timeoutMs = 2500,
  schedule = setTimeout, cancel = clearTimeout } = {}) {
  let pending = null;
  let view = null;
  let timer = null;
  let disposed = false;
  const seen = new Set();
  const unsubscribers = [];
  const clearTimer = () => { if (timer != null) cancel(timer); timer = null; };
  const publish = (next) => { view = next; if (!disposed) onChange(next); };
  const settle = (next) => { clearTimer(); pending = null; publish(next); };

  const completed = (receipt) => {
    if (!pending || !matchingTradeReceipt(pending, receipt)) return;
    if (receipt.receiptId && seen.has(receipt.receiptId)) return;
    if (Number.isFinite(receipt.tradeSequence) && receipt.tradeSequence <= pending.afterSequence) return;
    const next = tradeReceiptPresentation(receipt, pending.commodityName);
    if (!next || !Number.isInteger(Number(receipt.qty)) || Number(receipt.qty) > pending.qty) return;
    if (receipt.receiptId) {
      seen.add(receipt.receiptId);
      if (seen.size > 32) seen.delete(seen.values().next().value);
    }
    settle(next);
  };
  const failed = (receipt) => {
    if (!pending || !receipt) return;
    const lostDock = receipt.reason === 'not_docked' && receipt.stationId == null
      && receipt.commodityId === pending.commodityId && receipt.side === pending.side;
    if (lostDock || matchingTradeReceipt(pending, receipt)) settle(tradeFailurePresentation(receipt.reason));
  };
  if (bus && typeof bus.on === 'function') {
    unsubscribers.push(bus.on('economy:tradeCompleted', completed), bus.on('economy:tradeFailed', failed));
  }
  return {
    get pending() { return pending; },
    get view() { return view; },
    begin(request) {
      if (disposed || pending) return false;
      if (!bus || typeof bus.emit !== 'function' || !request?.stationId || !request.commodityId
        || !['buy', 'sell'].includes(request.side) || !Number.isSafeInteger(request.qty) || request.qty < 1) {
        publish(tradeFailurePresentation('invalid'));
        return false;
      }
      pending = { ...request, afterSequence: Number(request.afterSequence) || 0 };
      publish({ kind: 'pending', title: 'Transferring cargo', text: 'Awaiting the station receipt.' });
      timer = schedule(() => {
        if (!pending || disposed) return;
        settle({ kind: 'unconfirmed', title: 'Receipt not received',
          text: 'Check your hold and credits before trading again. No retry was sent.' });
      }, Math.max(1, timeoutMs));
      return true;
    },
    clear() { if (!pending) publish(null); },
    dispose() {
      disposed = true;
      clearTimer();
      pending = null;
      for (const off of unsubscribers) if (typeof off === 'function') off();
      seen.clear();
    },
  };
}
