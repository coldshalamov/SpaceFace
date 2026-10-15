// Flight-deck adapter for the aftermath verbs. The sim already published the choices and did
// not pause. This card only displays two or more of them. It has no countdown, and choosing
// emits combat:aftermathChoose back to the recorder. With no deck mounted, show() returns
// false and the sim choice still applies.

import { getPromptDeck } from './promptDeck.js';

const DECISION_ID = 'aftermath:field';

export function createAftermathChoicePrompt(ctx = {}) {
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();

  const deckOf = () => (ctx.deck != null ? ctx.deck : getPromptDeck());

  const show = (payload) => {
    const choices = payload && Array.isArray(payload.choices) ? payload.choices : [];
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return false;
    if (choices.length < 2) {
      if (typeof deck.resolveDecision === 'function') deck.resolveDecision(DECISION_ID);
      return false;
    }
    return deck.offerDecision({
      id: DECISION_ID,
      kind: 'info',
      sender: 'AFTERMATH',
      headline: 'FIELD STILL LIVE',
      deadlineAt: null,
      choices: choices.map((choice) => ({
        id: String(choice && choice.id || ''),
        label: String(choice && choice.label || choice.id || ''),
      })).filter((choice) => choice.id),
      onChoose: (choiceId) => {
        if (typeof deck.resolveDecision === 'function') deck.resolveDecision(DECISION_ID);
        bus.emit('combat:aftermathChoose', { choiceId, source: 'deck' });
      },
    });
  };

  bus.on('combat:aftermathChoices', show);
  return {
    show,
    destroy() {
      try { if (typeof bus.off === 'function') bus.off('combat:aftermathChoices', show); } catch (_) { /* already gone */ }
    },
  };
}

function inertPrompt() {
  return { show: () => false, destroy() {} };
}

export default createAftermathChoicePrompt;
