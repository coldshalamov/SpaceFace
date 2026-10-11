// warrantOfferPrompt.js — the licensed hunter's offer, answered in flight.
//
// THE WORLD REMEMBERS (U-A): a hails_first hunter (Writ, wh_ines_garrow) holds fire, hails, and
// offers to take the bounty in payment (`warrant:hunterOffer`). The shipped answer is the
// `warrant:acceptPayment` intent, which warrantHunterWaves routes to the economy's own
// `economy:payBounty`; until this module nothing in flight could emit it — the offer was only
// honourable at a station.
//
// Same posture as impoundPayPrompt: a thin prompt-deck adapter with no DOM, keys, or clock of its
// own. The deck owns the Digit1-9 / gamepad answers (ACCEPT is the first choice, so Digit1) and
// the countdown, fed the deadline the waves module stored (`untilT`, sim seconds). This panel
// never charges: ACCEPT emits intent only, economy stays the one credits writer, and a short purse
// comes back as `warrant:hunterOfferRefused`, reported verbatim. DECLINE / closing the card emits
// nothing — the waves module's own offer window ends in the refusal.

import { getPromptDeck } from './promptDeck.js';
import { warrantHunterById } from '../data/warrantHunters.js';

const DECK_ID = 'warrant-offer';

function crOf(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

export const warrantOfferPrompt = {
  name: 'warrantOfferPrompt',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._hunterId = null;
    this._onOffer = (p) => this._handleOffer(p);
    this._onClosed = () => this._dismiss();
    this._onRefused = (p) => this._handleRefused(p);
    this._events = [
      ['warrant:hunterOffer', this._onOffer],
      ['warrant:hunterOfferClosed', this._onClosed],
      ['warrant:hunterOfferRefused', this._onRefused],
      ['warrant:hunterPaid', this._onClosed],
      ['dock:docked', this._onClosed],
      ['player:death', this._onClosed],
    ];
    if (this._bus && this._bus.on) {
      for (const [event, fn] of this._events) this._bus.on(event, fn);
    }
  },

  _handleOffer(p) {
    const state = this._state;
    const hunter = p && warrantHunterById(p.hunterId);
    if (!hunter) return;
    const untilT = Number(p.untilT);
    if (Number.isFinite(untilT) && state && untilT <= (Number(state.simTime) || 0)) return;
    const owed = crOf(state && state.player && state.player.bounty) || crOf(p.amountCr);
    if (owed <= 0) return;
    const credits = crOf(state && state.player && state.player.credits);
    const short = owed > credits;
    this._hunterId = hunter.id;
    if (state && state.ui) {
      state.ui.warrantOfferPrompt = { hunterId: hunter.id, owedCr: owed, untilT: Number.isFinite(untilT) ? untilT : null, t: state.simTime || 0 };
    }
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck) return;
    const line = typeof p.line === 'string' ? p.line.trim() : '';
    deck.offerDecision({
      id: DECK_ID,
      kind: 'warn',
      sender: `${hunter.callsign.toUpperCase()} — ${hunter.name.toUpperCase()}`,
      statusFlag: 'WARRANT',
      headline: 'SETTLE THE BOUNTY',
      detail: `${line ? `${line} ` : ''}The bounty stands at ${owed} cr.${short ? ` You hold ${credits} cr.` : ''}`,
      deadlineAt: Number.isFinite(untilT) ? untilT : null,
      choices: [
        { id: 'accept', label: `PAY ${owed} CR`, title: 'Pay the hunter the bounty on this channel — the warrant clears and she stands down. The economy re-checks your credits; nothing is charged twice.' },
        { id: 'decline', label: 'DECLINE', title: 'Close the channel. Nothing is sent; when the offer runs out the hunter opens fire.', cancel: true },
      ],
      onChoose: (choiceId) => this.choose(choiceId),
      onExpire: () => this._dismiss(),
    });
  },

  choose(actionId) {
    const bus = this._bus;
    const hunterId = this._hunterId;
    this._dismiss();
    if (!bus || !bus.emit) return;
    if (actionId !== 'accept') return; // 'decline' emits nothing — the prompt closing IS the choice
    const request = { hunterId, source: 'warrantOfferPrompt' };
    bus.emit('warrant:acceptPayment', request);
    if (!request.result) {
      // The offer lapsed between the card and the key: nothing was asked of the economy.
      bus.emit('toast', { text: 'The offer has lapsed — nothing was charged.', kind: 'info', ttl: 3 });
    }
  },

  _handleRefused(p) {
    this._dismiss();
    const bus = this._bus;
    const state = this._state;
    if (!bus || !bus.emit || !p) return;
    if (p.reason === 'short') {
      const owed = crOf(state && state.player && state.player.bounty);
      const credits = crOf(state && state.player && state.player.credits);
      bus.emit('toast', {
        text: `SHORT — the bounty is ${owed} cr and you hold ${credits} cr. Nothing was charged.`,
        kind: 'warn', ttl: 4,
      });
    } else {
      bus.emit('toast', { text: 'There is nothing to settle — nothing was charged.', kind: 'info', ttl: 3 });
    }
  },

  _dismiss() {
    const state = this._state;
    this._hunterId = null;
    if (state && state.ui) delete state.ui.warrantOfferPrompt;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (deck) deck.resolveDecision(DECK_ID);
  },

  destroy() {
    if (this._bus && this._bus.off && this._events) {
      for (const [event, fn] of this._events) this._bus.off(event, fn);
    }
    this._events = null;
    this._onOffer = null;
    this._onClosed = null;
    this._onRefused = null;
    this._dismiss();
  },
};

export default warrantOfferPrompt;
