// stuckTowPrompt.js — the wedge's answer. world._updateStuckWatch fires `world:stuckTowOffer`
// once per wedge episode with the priced lawful berth on the payload; this thin adapter puts
// that offer on the ONE flight decision surface (promptDeck). The accept verb emits
// `world:stuckTowAccept` — the engine re-validates the wedge itself, so this adapter never
// decides anything, only voices it.
//
// The offer dismisses when the wedge clears (the hull moved or the pilot let off the thrust),
// on dock, on sector transition, and on save/new-game boundaries. Registry SYSTEMS-only entry
// (no update; event-driven), same posture as moralTrapPrompt/customsPrompt.

import { getPromptDeck } from './promptDeck.js';

const DECK_ID = 'stuck-tow';

export const stuckTowPrompt = {
  name: 'stuckTowPrompt',

  init(ctx) {
    this._bus = ctx && ctx.bus;
    this._onOffer = (p) => this._offer(p);
    this._onClear = () => this._dismiss();
    if (this._bus && this._bus.on) {
      this._bus.on('world:stuckTowOffer', this._onOffer);
      for (const evt of ['world:stuckCleared', 'dock:docked', 'sector:enter',
        'save:loaded', 'game:new', 'player:death']) {
        this._bus.on(evt, this._onClear);
      }
    }
  },

  _offer(p) {
    if (!p) return;
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (!deck) return;
    const cost = Number(p.quotedCr) > 0 ? `${Math.round(p.quotedCr)} cr` : null;
    const where = p.stationName || 'the nearest lawful berth';
    deck.offerDecision({
      id: DECK_ID,
      kind: 'warn',
      sender: 'TRAFFIC CONTROL',
      statusFlag: 'WEDGED',
      headline: 'HULL IS FAST',
      detail: `Your ship has been wedged for ${Math.round(Number(p.stuckS) || 0)}s. `
        + `A tow to ${where} runs ${cost || 'a berth fee'} — the shortfall goes on the note if you can't cover it.`,
      choices: [
        { id: 'accept', label: cost ? `Take the tow (${cost})` : 'Take the tow' },
        { id: 'decline', label: 'Keep working it free' },
      ],
      onChoose: (optionId) => {
        this._dismiss();
        if (optionId === 'accept' && this._bus && this._bus.emit) {
          this._bus.emit('world:stuckTowAccept', {});
        }
      },
      onExpire: () => {},
    });
  },

  _dismiss() {
    const deck = typeof getPromptDeck === 'function' ? getPromptDeck() : null;
    if (deck && typeof deck.resolveDecision === 'function') deck.resolveDecision(DECK_ID);
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onOffer) this._bus.off('world:stuckTowOffer', this._onOffer);
      if (this._onClear) {
        for (const evt of ['world:stuckCleared', 'dock:docked', 'sector:enter',
          'save:loaded', 'game:new', 'player:death']) {
          this._bus.off(evt, this._onClear);
        }
      }
    }
    this._onOffer = null;
    this._onClear = null;
    this._dismiss();
    this._bus = null;
  },
};

export default stuckTowPrompt;
