import { getPromptDeck } from '../../ui/promptDeck.js';

export const TENDER_PROMPT_ID = 'salvage-tender:decision';

/** Existing promptDeck owns keyboard, touch, controller focus and accessibility. This adapter
 * produces no key listener, modal, stylesheet or parallel interaction surface. */
export const salvageTenderPrompt = {
  name: 'salvageTenderPrompt',
  init(ctx) {
    this.ctx = ctx; this.bus = ctx.bus; this._subs = []; this._last = null;
    const on = (name, fn) => this._subs.push(this.bus.on(name, fn));
    on('salvageTender:offer', offer => this.offer(offer));
    for (const name of ['salvageTender:close', 'save:restoring', 'sector:exit', 'dock:docked']) on(name, () => this.close());
  },
  offer(offer) {
    if (!offer || !Array.isArray(offer.choices)) return false;
    this._last = offer;
    const deck = getPromptDeck();
    if (!deck) return false;
    // Offer identity is stable; every response carries its observed simulation revision.
    const spec = {
      id: TENDER_PROMPT_ID, kind: 'info', sender: 'MORROWLIGHT · PERSONAL SALVAGE TENDER',
      headline: offer.headline, detail: offer.detail, statusFlag: offer.status,
      choices: offer.choices.map(c => ({ id: c.id, label: c.label, title: c.title,
        disabled: c.disabled === true, cancel: ['leave', 'refuse', 'back'].includes(c.id) })),
      onChoose: id => {
        const selected = offer.choices.find(c => c.id === id);
        if (!selected || selected.disabled) return false;
        deck.resolveDecision(TENDER_PROMPT_ID);
        const payload = { action: selected.options?.action || selected.id, revision: offer.revision,
          options: { ...(selected.options || {}) }, result: null };
        this.bus.emit('salvageTender:action', payload);
        // Runtime revalidates range, body identity, costs and ownership at the moment of use.
        // A stale card refreshes the same deck instead of turning into an invisible dead end.
        if (!payload.result?.ok) this.bus.emit('salvageTender:inspect', {});
        return payload.result?.ok === true;
      },
    };
    return deck.hasDecision?.(TENDER_PROMPT_ID) && deck.updateDecision
      ? deck.updateDecision(TENDER_PROMPT_ID, spec) : deck.offerDecision(spec);
  },
  close() { this._last = null; getPromptDeck()?.resolveDecision(TENDER_PROMPT_ID); },
  newGame() { this.close(); },
  destroy() { this.close(); for (const off of this._subs || []) if (typeof off === 'function') off(); this._subs = []; },
};
