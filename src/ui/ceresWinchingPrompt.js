// The existing Prompt Deck owns keyboard, pointer, touch and gamepad routing.
// This adapter reads a bounded authoritative offer and sends a revalidated intent.
import { getPromptDeck } from './promptDeck.js';
const ID = 'ceres-winching';
export function createCeresWinchingPrompt({ state, bus }) {
  let current = null, signature = null;
  const close = () => { current = null; signature = null; getPromptDeck()?.resolveDecision(ID); };
  const off = ['save:restoring', 'sector:exit', 'dock:docked', 'game:new', 'game:newGame'].map(name => bus.on(name, close));
  return {
    frame() {
      const offer = state.mode === 'flight' && !state.ui?.docked ? state.ceresWinchingOffer : null;
      if (!offer) { if (current) close(); return; }
      if (signature === offer.id) return;
      current = offer; signature = offer.id;
      const deck = getPromptDeck();
      if (!deck) { signature = null; return; }
      const spec = { id: ID, kind: 'contact', sender: 'OLD HOB · WINCHES', headline: offer.headline,
        detail: offer.detail, choices: offer.choices.map(c => ({ ...c, cancel: c.id === 'close' })),
        onChoose(id) {
          if (current !== offer || state.ceresWinchingOffer?.id !== offer.id || state.mode !== 'flight' || state.ui?.docked
            || !offer.choices.some(c => c.id === id && !c.disabled)) return false;
          // A repeated press cannot issue another command while the worker is answering.
          current = null;
          deck.resolveDecision(ID);
          bus.emit('ceresWinching:action', { offerId: offer.id, action: id, playerLife: offer.playerLife });
          return true;
        } };
      if (deck.hasDecision?.(ID)) deck.updateDecision(ID, spec);
      else deck.offerDecision(spec);
    },
    close,
    destroy() { off.forEach(fn => fn?.()); close(); },
  };
}
