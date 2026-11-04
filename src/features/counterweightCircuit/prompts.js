// Counterweight Circuit — prompt-deck adapter.
//
// Registered as 'counterweightCircuitPrompt' (event-only, capability hud). It
// normalizes the runtime's bounded offer payloads into ordinary promptDeck
// decisions — the deck owns keyboard, touch, gamepad and accessibility. This
// adapter adds no key listener, modal, stylesheet or parallel surface, and it
// never decides an outcome: every choice returns an intent on
// 'counterweightCircuit:action' which the sim owner revalidates.

import { getPromptDeck } from '../../ui/promptDeck.js';

export const CIRCUIT_PROMPT_ID = 'counterweightCircuit:decision';

/** choice id → {action, eventId} intent the runtime understands. */
function intentFor(choiceId) {
  if (typeof choiceId !== 'string') return null;
  const [action, eventId] = choiceId.split(':');
  if (['preview', 'practice', 'attempt'].includes(action) && eventId) {
    return { action, eventId };
  }
  if (['menu', 'events', 'records', 'ghost', 'cancel', 'close', 'leave'].includes(action)) {
    return { action };
  }
  return null;
}

export const counterweightCircuitPrompt = {
  name: 'counterweightCircuitPrompt',
  init(ctx) {
    this.ctx = ctx; this.bus = ctx.bus; this._subs = []; this._last = null;
    const on = (name, fn) => this._subs.push(this.bus.on(name, fn));
    on('counterweightCircuit:offer', (offer) => this.offer(offer));
    for (const name of ['counterweightCircuit:close', 'save:restoring', 'sector:exit', 'dock:docked']) {
      on(name, () => this.close());
    }
  },
  offer(offer) {
    if (!offer || !Array.isArray(offer.choices)) return false;
    this._last = offer;
    const deck = getPromptDeck();
    if (!deck) return false;
    const spec = {
      id: CIRCUIT_PROMPT_ID, kind: offer.kind === 'result' ? 'info' : (offer.kind || 'contact'),
      sender: offer.sender || 'COUNTERWEIGHT · CIRCUIT REGISTRAR',
      headline: offer.headline, detail: offer.detail, statusFlag: offer.statusFlag,
      choices: offer.choices.map((c) => ({
        id: c.id, label: c.label, title: c.title,
        disabled: c.disabled === true, cancel: ['close', 'leave', 'back', 'menu'].includes(c.id),
      })),
      onChoose: (id) => {
        if (this._last !== offer) return false;
        const selected = offer.choices.find((c) => c.id === id);
        if (!selected || selected.disabled) return false;
        const intent = intentFor(id);
        if (!intent) return false;
        deck.resolveDecision(CIRCUIT_PROMPT_ID);
        this.bus.emit('counterweightCircuit:action', { ...intent, offerId: offer.id, generation: offer.generation });
        // The sim revalidates range, unlocks and occupancy at the moment of use
        // and publishes the next offer (or an honest refusal) in reply.
        return true;
      },
    };
    return deck.hasDecision?.(CIRCUIT_PROMPT_ID) && deck.updateDecision
      ? deck.updateDecision(CIRCUIT_PROMPT_ID, spec)
      : deck.offerDecision(spec);
  },
  close() { this._last = null; getPromptDeck()?.resolveDecision(CIRCUIT_PROMPT_ID); },
  newGame() { this.close(); },
  destroy() {
    this.close();
    for (const off of this._subs || []) if (typeof off === 'function') off();
    this._subs = [];
  },
};

export function createCounterweightCircuitPromptSystem() {
  return Object.create(counterweightCircuitPrompt);
}
