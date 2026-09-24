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

import { getPromptDeck } from './promptDeck.js';

const DECK_ID = 'impound-pay';

export const impoundPayPrompt = {
  name: 'impoundPayPrompt',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._onOffer = (p) => this._handleOffer(p);
    this._onRefused = (p) => this._handleRefused(p);
    this._onClosed = () => this._dismiss();
    if (this._bus && this._bus.on) {
      this._bus.on('law:impoundPayOffer', this._onOffer);
      this._bus.on('law:impoundPayRefused', this._onRefused);
      this._bus.on('law:impoundRecovered', this._onClosed);
      this._bus.on('law:impoundReleased', this._onClosed);
      this._bus.on('sector:exit', this._onClosed);
      this._bus.on('dock:docked', this._onClosed);
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
    }
    this._onOffer = null;
    this._onRefused = null;
    this._onClosed = null;
    this._dismiss();
  },
};

export default impoundPayPrompt;
