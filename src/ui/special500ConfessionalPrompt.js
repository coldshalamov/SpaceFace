// src/ui/special500ConfessionalPrompt.js — adapter from the special-500 confessional leg's
// sim events (src/systems/special500Confessional.js) to the flight decision deck
// (src/ui/promptDeck.js), following the special500Invoice prompt precedent exactly. The
// simulation owns the tithe, the ledger read and the flags; this module reads the public
// `special500:confessional` offer and `special500:confessionalReceipt` resolution, renders
// their meaning on the deck, and emits the canonical `ui:confessionalChoose` choice. It never
// pauses flight, writes credits, or invents guilt.
//
// The deck renders only in open flight, so an offer that arrives docked waits here and is
// re-offered on the next undock/mode change — the acolyte keeps the booth ledger open either
// way, which is what a booth that does not chase means.
import { getPromptDeck } from './promptDeck.js';

const DECK_ID = 'special500Confessional';
const RECEIPT_TTL_S = 4;

export function confessionalHeadline(payload) {
  const amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
  return `${String((payload && payload.title) || 'THE BOOTH').toUpperCase()} · ${amount} CR`;
}

export function confessionalChoiceLabel(payload, choiceId) {
  const amount = Math.max(0, Math.floor(Number(payload && payload.amount) || 0));
  return choiceId === 'file' ? `FILE THE RECORD — ${amount} CR` : 'CLOSE THE LEDGER';
}

export function confessionalReceiptText(payload) {
  const outcome = String((payload && payload.outcome) || 'resolved');
  if (outcome === 'filed') return 'FILED · the cabinet keeps it now · it will be read back once, at the end';
  if (outcome === 'short') return 'UNFILED · the account came back short · the booth ledger stays open';
  if (outcome === 'unpaid') return 'UNFILED · payment was not accepted · the booth ledger stays open';
  if (outcome === 'declined') return 'CLOSED · the cabinet does not chase';
  if (outcome === 'expired') return 'CLOSED · the final record has already been read';
  return `BOOTH · ${outcome.replace(/_/g, ' ')}`;
}

export function createSpecial500ConfessionalPrompt(ctx = {}) {
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return { destroy() {} };

  let live = null;
  let waiting = false;
  let generation = 0;
  const unsubs = [];

  function clear() {
    live = null;
    waiting = false;
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(DECK_ID);
  }

  function tryOffer() {
    if (!live) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    const offered = live;
    return !!deck.offerDecision({
      id: DECK_ID,
      kind: 'info',
      sender: 'DISPOSAL OF GUILT, PROFESSIONAL',
      statusFlag: waiting ? 'FILING…' : 'TITHE',
      headline: confessionalHeadline(live),
      detail: `${String(live.memo || '').trim()}`,
      choices: [
        { id: 'file', label: confessionalChoiceLabel(live, 'file'), disabled: waiting },
        { id: 'decline', label: confessionalChoiceLabel(live, 'decline'), cancel: true, disabled: waiting },
      ],
      onChoose: (choiceId, source) => {
        if (live !== offered || waiting) return false;
        if (choiceId !== 'file' && choiceId !== 'decline') return false;
        waiting = true;
        tryOffer();
        // emit() is not an acknowledgement on the worker lane. Only the matching
        // authoritative receipt below may settle or reopen this exact card.
        bus.emit('ui:confessionalChoose', {
          offerId: offered.offerId, generation: offered.generation, choice: choiceId, source,
        });
        return true;
      },
    });
  }

  unsubs.push(bus.on('special500:confessional', (payload) => {
    if (!payload || !Number.isSafeInteger(payload.generation) || payload.generation < generation) return;
    generation = payload.generation;
    if (payload.reset) { clear(); return; }
    if (!payload.title || typeof payload.offerId !== 'string') return;
    const same = live && live.offerId === payload.offerId && live.generation === payload.generation;
    if (!same) waiting = false;
    live = { ...payload };
    tryOffer();
  }));

  unsubs.push(bus.on('special500:confessionalReceipt', (payload) => {
    if (!live || !payload || payload.offerId !== live.offerId || payload.generation !== live.generation) return;
    const outcome = payload && payload.outcome;
    waiting = false;
    if (outcome === 'ignored') {
      clear();
      bus.emit('ui:confessionalReady', {});
      return;
    }
    if (outcome === 'short' || outcome === 'unpaid') tryOffer();
    else clear();
    bus.emit('toast', {
      text: confessionalReceiptText(payload || {}),
      kind: outcome === 'declined' ? 'warn' : 'info',
      ttl: RECEIPT_TTL_S,
    });
  }));

  // The deck can only render in open flight; an offer that arrived docked (or while a screen
  // fenced the deck) re-offers as soon as the hull is out and flying again.
  for (const event of ['dock:undocked', 'mode:changed']) {
    unsubs.push(bus.on(event, () => {
      if (ctx.state && ['loading', 'menu'].includes(ctx.state.mode)) clear();
      else { tryOffer(); bus.emit('ui:confessionalReady', {}); }
    }));
  }
  for (const event of ['game:load', 'save:loaded', 'game:started']) {
    unsubs.push(bus.on(event, () => { clear(); bus.emit('ui:confessionalReady', {}); }));
  }
  bus.emit('ui:confessionalReady', {});

  return {
    destroy() {
      clear();
      for (const off of unsubs.splice(0)) {
        try { off(); } catch (_) { /* cleanup must not throw */ }
      }
    },
  };
}

export default createSpecial500ConfessionalPrompt;
