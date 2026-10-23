// Row 446 — thin prompt-deck adapter for crew recruiting. The crew system emits presence-gated
// `crew:recruitOffer` visibility payloads; this module normalizes them into a deck decision and
// emits the player's verb back on the bus. It owns no DOM, keys, or placement.
import { getPromptDeck } from './promptDeck.js';

const RECRUIT_ID = 'crew:recruit';

export function createCrewPrompt(ctx = {}) {
  const bus = ctx.bus;
  const deckOf = () => (ctx.deck != null ? ctx.deck : getPromptDeck());
  let dismissedFor = null; // candidateId the player waved off this approach — no re-pop per scan

  const onRecruitOffer = (p) => {
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return;
    if (!p || p.visible !== true || !p.candidateId) {
      dismissedFor = null;
      if (typeof deck.resolveDecision === 'function') deck.resolveDecision(RECRUIT_ID);
      return;
    }
    if (dismissedFor === p.candidateId) return;
    const spec = {
      id: RECRUIT_ID,
      kind: 'info',
      sender: 'CREW HAIL',
      headline: `${String(p.name || '').toUpperCase()} — ${String(p.roleLabel || '').toUpperCase()} · ${p.perkLine || ''}`,
      detail: p.line || '',
      deadlineAt: null,
      choices: [
        { id: 'hire', label: 'Sign them aboard' },
        { id: 'pass', label: 'Not now' },
      ],
      onChoose: (choiceId) => {
        if (typeof deck.resolveDecision === 'function') deck.resolveDecision(RECRUIT_ID);
        if (choiceId === 'hire') bus.emit('crew:hire', { candidateId: p.candidateId });
        else {
          dismissedFor = p.candidateId;
          bus.emit('crew:decline', { candidateId: p.candidateId });
        }
      },
    };
    if (deck.hasDecision && deck.hasDecision(RECRUIT_ID)) {
      if (typeof deck.updateDecision === 'function') deck.updateDecision(RECRUIT_ID, spec);
      return;
    }
    deck.offerDecision(spec);
  };

  const subs = [bus.on('crew:recruitOffer', onRecruitOffer)];
  for (const name of ['dock:docked', 'sector:exit', 'save:restoring', 'game:new']) {
    subs.push(bus.on(name, () => {
      dismissedFor = null;
      const deck = deckOf();
      if (deck && typeof deck.resolveDecision === 'function') deck.resolveDecision(RECRUIT_ID);
    }));
  }

  return {
    destroy() {
      for (const sub of subs) {
        try {
          if (typeof sub === 'function') sub();
          else if (sub && typeof sub.off === 'function') sub.off();
        } catch (_) { /* teardown-safe */ }
      }
      const deck = deckOf();
      if (deck && typeof deck.resolveDecision === 'function') deck.resolveDecision(RECRUIT_ID);
    },
  };
}

export default createCrewPrompt;
