// impoundPayPrompt.js — the impound clerk's counter. The pound ships three ways out of a bill:
// work the yard (proximity accrues law:impoundWorked), cut the lock (steal), or pay the clerk.
// The first two are overlaps and already live; pay is a CHOICE, and until this module nothing
// emitted law:impoundPay — the whole verb was unreachable.
//
// lawSecurity._updateWantedImpound now emits `law:impoundPayOffer` on the clerk-pad overlap edge
// (clear on the falling edge). This thin adapter turns that domain event into a prompt-deck
// decision. The PAY verb emits `law:impoundPay` — the intent lawSecurity._payWantedImpound has
// always listened for — and the engine re-validates reach and credits before charging, so a
// stale panel can never double-charge. Refusals come back on `law:impoundPayRefused` and are
// reported verbatim; this panel never computes or charges the bill itself.
//
// Registry SYSTEMS-only entry (no update; event-driven), same posture as customsPrompt.
//
// FB-039 — the same adapter in fine mode. lawSecurity emits `law:fineAssessed` with
// `offer: true` when a wanted pilot berths at a lawful station: the charge is no longer
// automatic, it is an offer with the impound clerk's three doors — pay, work the desk's
// shift, or carry the warrant out. The prompt deck is a flight surface (it voids every
// decision on dock:docked and cannot hold the floor while docked), so the assessment is
// held while the player is aboard and re-asserted the moment the hull clears the pad —
// the desk gets the last word at the airlock. Replies go back as `law:fineChoice` intents;
// the engine re-derives tier, price and credits against the live offer, so a stale card
// can never charge.

import { getPromptDeck } from './promptDeck.js';
import { SECTORS } from '../data/sectors.js';

const DECK_ID = 'impound-pay';
const FINE_DECK_ID = 'law-fine';

export const impoundPayPrompt = {
  name: 'impoundPayPrompt',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._onOffer = (p) => this._handleOffer(p);
    this._onRefused = (p) => this._handleRefused(p);
    this._onClosed = () => this._dismiss();
    this._onFine = (p) => this._handleFineAssessed(p);
    this._onFineUndock = () => this._surfaceFine();
    this._onFineRefused = (p) => this._handleFineRefused(p);
    if (this._bus && this._bus.on) {
      this._bus.on('law:impoundPayOffer', this._onOffer);
      this._bus.on('law:impoundPayRefused', this._onRefused);
      this._bus.on('law:impoundRecovered', this._onClosed);
      this._bus.on('law:impoundReleased', this._onClosed);
      this._bus.on('sector:exit', this._onClosed);
      this._bus.on('dock:docked', this._onClosed);
      this._bus.on('law:fineAssessed', this._onFine);
      this._bus.on('law:fineRefused', this._onFineRefused);
      this._bus.on('dock:undocked', this._onFineUndock);
      this._bus.on('sector:exit', () => this._dismissFine(true));
      this._bus.on('dock:docked', () => this._dismissFine(false));
    }
  },

  _handleOffer(p) {
    if (!p || p.clear) { this._dismiss(); return; }
    const state = this._state;
    const owed = Math.max(0, Math.round(Number(p.owedCr) || 0));
    const credits = Math.max(0, Math.round(Number(state && state.player && state.player.credits) || 0));
    if (state && state.ui) {
      state.ui.impoundPayPrompt = { poundId: p.poundId, billId: p.billId, owedCr: owed, t: state.simTime || 0 };
    }
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck) return;
    const short = owed > credits;
    deck.offerDecision({
      id: DECK_ID,
      kind: 'warn',
      sender: 'IMPOUND CLERK',
      statusFlag: 'IMPOUND',
      headline: 'RELEASE THE SHIP',
      detail: `The bill stands at ${owed} cr — pay it here, work the yard, or cut the lock.${short ? ` You hold ${credits} cr.` : ''}`,
      choices: [
        { id: 'pay', label: `PAY ${owed} CR`, title: 'Hand the clerk the bill amount — the hull is released where it stands. The engine re-checks reach and credits; nothing is charged twice.' },
        { id: 'leave', label: 'STEP AWAY', title: 'Close the counter. The yard shift and the lock stay open as ways out.' },
      ],
      onChoose: (choiceId) => this.choose(choiceId),
      onExpire: () => this._dismiss(),
    });
  },

  choose(actionId) {
    const bus = this._bus;
    this._dismiss();
    if (!bus || !bus.emit) return;
    if (actionId === 'pay') bus.emit('law:impoundPay', {});
    // 'leave' emits nothing — the prompt closing IS the choice, same as walking off the pad.
  },

  _handleRefused(p) {
    const bus = this._bus;
    if (!bus || !bus.emit || !p) return;
    if (p.reason === 'short') {
      bus.emit('toast', {
        text: `SHORT — the bill is ${p.owedCr != null ? p.owedCr : '—'} cr and you hold ${p.credits != null ? p.credits : '—'} cr. Work the yard, or cut the lock.`,
        kind: 'warn', ttl: 4,
      });
    } else {
      bus.emit('toast', { text: 'The clerk is out of reach — nothing was charged.', kind: 'info', ttl: 3 });
    }
  },

  _dismiss() {
    const state = this._state;
    if (state && state.ui) delete state.ui.impoundPayPrompt;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (deck) deck.resolveDecision(DECK_ID);
  },

  // ── FB-039 fine mode ─────────────────────────────────────────────────────────────────
  // law:fineAssessed arrives in three shapes: the open offer (`offer: true`), a reply echo
  // (`choice` set — paid/left/working/short), and the already-settled re-dock marker
  // (`alreadySettled`). Only the offer is a decision surface; the echoes drive toasts and
  // the card's lifecycle. The card itself is asserted immediately — the deck suppresses it
  // while docked and its own tick resurfaces it the frame `ui.docked` releases — and
  // re-asserted on dock:undocked so the answer is always reachable on the lane.

  _liveFineOffer() {
    const state = this._state;
    const offer = state && state.lawSecurity && state.lawSecurity.fineOffer;
    if (!offer || offer.status === 'paid' || offer.status === 'left') return null;
    return offer;
  },

  _handleFineAssessed(p) {
    if (!p) return;
    const bus = this._bus;
    const state = this._state;
    if (p.offer === true) {
      if (state && state.ui) {
        state.ui.lawFinePrompt = {
          stationId: p.stationId, amountCr: Math.max(0, Math.round(Number(p.amount) || 0)),
          wantedTier: p.wantedTier || null, working: p.working === true, t: state.simTime || 0,
        };
      }
      if (bus && bus.emit && !p.working) {
        bus.emit('toast', {
          text: `FINE ASSESSED — ${Math.max(0, Math.round(Number(p.amount) || 0))} cr on a ${p.wantedTier || 'wanted'} warrant. The desk takes your answer on the lane.`,
          kind: 'warn', ttl: 6,
        });
      }
      this._surfaceFine();
      return;
    }
    if (p.paid === true) {
      if (!p.alreadySettled && bus && bus.emit) {
        bus.emit('toast', {
          text: p.choice === 'work'
            ? 'SHIFT COMPLETE — the desk clears the warrant.'
            : `FINE PAID — ${Math.max(0, Math.round(Number(p.amount) || 0))} cr. The warrant is clear.`,
          kind: 'law', ttl: 5,
        });
      }
      this._dismissFine(true);
      return;
    }
    if (p.choice === 'pay' && p.shortfall != null) {
      // The engine said no: short account. The offer still stands — keep the card up.
      if (bus && bus.emit) {
        bus.emit('toast', {
          text: `SHORT — the fine is ${p.amount != null ? p.amount : '—'} cr. Work the shift or carry the warrant.`,
          kind: 'warn', ttl: 4,
        });
      }
      this._surfaceFine();
      return;
    }
    if (p.choice === 'leave' || p.choice === 'work') {
      // Answered: the receipt is written engine-side; close the card without clearing the
      // marker — a re-dock re-offers while the warrant stands.
      this._dismissFine(false);
    }
  },

  _surfaceFine() {
    const offer = this._liveFineOffer();
    if (!offer) return;
    const state = this._state;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck) return;
    const amount = Math.max(0, Math.round(Number(offer.amount) || 0));
    const credits = Math.max(0, Math.round(Number(state && state.player && state.player.credits) || 0));
    const short = amount > credits;
    const name = stationNameForDeck(offer.stationId) || 'STATION';
    deck.offerDecision({
      id: FINE_DECK_ID,
      kind: 'warn',
      sender: `${name} LAW DESK`,
      statusFlag: 'WANTED',
      headline: `FINE ${amount} CR`,
      detail: offer.status === 'working'
        ? `The shift is running against the bill — stay on the lane while it accrues, or wire the ${amount} cr and walk.`
        : `The warrant rides your transponder. Wire the ${amount} cr, work the desk's shift, or carry the warrant — the next lawful berth will ask again.${short ? ` You hold ${credits} cr.` : ''}`,
      choices: [
        { id: 'pay', label: `PAY ${amount} CR`, title: 'Wire the desk its fine — the warrant clears. The engine re-checks credits; a short account is refused, never charged.' },
        { id: 'work', label: 'WORK THE DEBT', title: 'A short lawful shift accrues against the bill — no credits needed, just the clock.' },
        { id: 'leave', label: 'CARRY THE WARRANT', title: 'Walk away. The warrant stands and the next lawful dock assesses it again.' },
      ],
      onChoose: (choiceId) => this.chooseFine(choiceId),
      onExpire: () => this._dismissFine(false),
    });
  },

  chooseFine(actionId) {
    const bus = this._bus;
    const offer = this._liveFineOffer();
    const stationId = (offer && offer.stationId) || null;
    if (actionId !== 'pay' && actionId !== 'work' && actionId !== 'leave') return;
    if (!stationId) { this._dismissFine(false); return; }
    // The answer goes to the desk as an intent; the echo decides the card — 'pay' shortfalls
    // re-assert it, 'work'/'leave'/paid close it. Never a charge from this side.
    if (actionId !== 'pay') this._dismissFine(false);
    if (bus && bus.emit) bus.emit('law:fineChoice', { choice: actionId, stationId });
  },

  _handleFineRefused(p) {
    const bus = this._bus;
    if (!bus || !bus.emit || !p) return;
    if (p.reason === 'no_open_fine') {
      bus.emit('toast', { text: 'No open fine at that berth — nothing was charged.', kind: 'info', ttl: 3 });
    }
    this._dismissFine(false);
  },

  _dismissFine(clearMarker) {
    const state = this._state;
    if (clearMarker && state && state.ui) delete state.ui.lawFinePrompt;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (deck) deck.resolveDecision(FINE_DECK_ID);
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onOffer) this._bus.off('law:impoundPayOffer', this._onOffer);
      if (this._onRefused) this._bus.off('law:impoundPayRefused', this._onRefused);
      if (this._onClosed) {
        this._bus.off('law:impoundRecovered', this._onClosed);
        this._bus.off('law:impoundReleased', this._onClosed);
        this._bus.off('sector:exit', this._onClosed);
        this._bus.off('dock:docked', this._onClosed);
      }
      if (this._onFine) this._bus.off('law:fineAssessed', this._onFine);
      if (this._onFineRefused) this._bus.off('law:fineRefused', this._onFineRefused);
      if (this._onFineUndock) this._bus.off('dock:undocked', this._onFineUndock);
    }
    this._onOffer = null;
    this._onRefused = null;
    this._onClosed = null;
    this._onFine = null;
    this._onFineUndock = null;
    this._onFineRefused = null;
    this._dismiss();
    this._dismissFine(true);
  },
};

// Station display name for the card sender — authored geography first, else a bare desk.
// Same lookup precedent as barkDirector's stationNameFor.
function stationNameForDeck(stationId) {
  if (!stationId) return null;
  for (const sector of SECTORS) {
    const station = (sector.stations || []).find((row) => row.id === stationId);
    if (station && station.name) return String(station.name).toUpperCase();
  }
  return null;
}

export default impoundPayPrompt;
