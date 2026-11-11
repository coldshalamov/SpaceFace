// src/ui/special500InvoicePrompt.js — adapter from the special-500 invoice leg's sim events
// (src/systems/special500Invoice.js) to the flight decision deck (src/ui/promptDeck.js), plus
// the receipt text helpers its focused test pins. The simulation owns the invoice, the deadline
// (one world day, simTime only), payment and the late-fee assessment; this module reads the
// public `special500:invoice` offer and `special500:invoiceReceipt` resolution, renders their
// meaning on the deck, and emits the canonical `ui:standbyFeeChoose` choice. It never pauses
// flight, writes credits, or re-prices the bill.
//
// The deck renders only in open flight, so an offer that arrives docked waits here and is
// re-offered on the next undock/mode change — the bill's deadline keeps running in the sim
// either way, which is exactly what a one-day payment window means.
import { getPromptDeck } from './promptDeck.js';

const DECK_ID = 'special500Invoice';
const RECEIPT_TTL_S = 4;

export function invoiceHeadline(payload) {
  const amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
  return `${String((payload && payload.title) || 'INVOICE').toUpperCase()} · ${amount} CR`;
}

export function invoiceChoiceLabel(payload, choiceId) {
  const amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
  return choiceId === 'pay' ? `PAY ${amount} CR` : 'REFUSE';
}

export function invoiceReceiptText(payload) {
  const amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
  const outcome = String((payload && payload.outcome) || 'resolved');
  if (outcome === 'paid') return `PAID · ${Number(amount).toLocaleString('en-US')} cr transferred · the file closes clean`;
  if (outcome === 'short') return 'PAYMENT REFUSED · the account came back short · the bill stays open';
  if (outcome === 'refused') return `ASSESSMENT · LATE FEE ON STANDBY FEE · ${Number(amount).toLocaleString('en-US')} cr charged · consistency noted`;
  return `ACCOUNT CLOSED · ${outcome.replace(/_/g, ' ')}`;
}

export function createSpecial500InvoicePrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return { destroy() {} };

  // The live offer this adapter is holding for the deck: one bill at a time (the leg issues
  // one invoice per game), re-offered whenever the deck becomes able to show it.
  let live = null;
  const unsubs = [];

  function tryOffer() {
    if (!live) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    return !!deck.offerDecision({
      id: DECK_ID,
      kind: 'info',
      sender: 'CONCORD TOWAGE',
      statusFlag: 'INVOICE',
      headline: invoiceHeadline(live),
      detail: `${String(live.memo || '').trim()} Response window: one world day.`,
      deadlineAt: Number(live.dueAt),
      choices: [
        { id: 'pay', label: invoiceChoiceLabel(live, 'pay') },
        { id: 'refuse', label: invoiceChoiceLabel(live, 'refuse'), danger: true, cancel: true },
      ],
      onChoose: (choiceId, source) => {
        if (!live) return false;
        if (choiceId !== 'pay' && choiceId !== 'refuse') return false;
        return !!bus.emit('ui:standbyFeeChoose', { billId: live.billId, choice: choiceId, source });
      },
    });
  }

  unsubs.push(bus.on('special500:invoice', (payload) => {
    if (!payload || !payload.billId) return;
    live = { ...payload };
    tryOffer();
  }));

  unsubs.push(bus.on('special500:invoiceReceipt', (payload) => {
    if (live && payload && payload.billId && payload.billId !== live.billId) return;
    const outcome = payload && payload.outcome;
    if (outcome === 'short') {
      // A short account is not a resolution: the card stays for another try.
      return;
    }
    live = null;
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(DECK_ID);
    bus.emit('toast', {
      text: invoiceReceiptText(payload || {}),
      kind: outcome === 'refused' ? 'warn' : 'info',
      ttl: RECEIPT_TTL_S,
    });
  }));

  // The deck can only render in open flight; an offer that arrived docked (or while a screen
  // fenced the deck) re-offers as soon as the hull is out and flying again.
  for (const event of ['dock:undocked', 'mode:changed']) {
    unsubs.push(bus.on(event, () => { tryOffer(); }));
  }

  return {
    destroy() {
      live = null;
      for (const off of unsubs.splice(0)) {
        try { off(); } catch (_) { /* cleanup must not throw */ }
      }
    },
  };
}

export default createSpecial500InvoicePrompt;
