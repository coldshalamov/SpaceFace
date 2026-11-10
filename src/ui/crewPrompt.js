// Row 446 — thin prompt-deck adapter for crew recruiting. The crew system emits presence-gated
// `crew:recruitOffer` visibility payloads; this module normalizes them into a deck decision and
// emits the player's verb back on the bus. It owns no DOM, keys, or placement.
//
// EXP-25 — the same deck carries the dockside confrontations: `crew:decisionOffer` arrives with
// the card already authored (sender/headline/detail/choices/offerId); the adapter renders it
// verbatim and replies `crew:decide` with the offerId and the chosen choiceId. A 'defer' choice
// only puts the card away for this dock — the system keeps the offer live and re-posts it next
// time its gate holds.
import { getPromptDeck } from './promptDeck.js';

const RECRUIT_ID = 'crew:recruit';
const DECISION_ID = 'crew:decision';

export function createCrewPrompt(ctx = {}) {
  const bus = ctx.bus;
  const deckOf = () => (ctx.deck != null ? ctx.deck : getPromptDeck());
  let dismissedFor = null; // candidateId the player waved off this approach — no re-pop per scan
  let dismissedOffer = null; // offerId the player deferred — hidden until the offer drops once

  const onRecruitOffer = (p) => {
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return;
    if (!p || p.visible !== true || !p.candidateId) {
      dismissedFor = null;
      if (typeof deck.resolveDecision === 'function') deck.resolveDecision(RECRUIT_ID);
      return;
    }
    if (dismissedFor === p.candidateId) return;
    const terms = Number.isFinite(p.signOnCr) && p.signOnCr > 0
      ? ` · ${p.signOnCr} TO SIGN${Number.isFinite(p.wageCr) && p.wageCr > 0 ? ` · ${p.wageCr}/DAY` : ''}`
      : '';
    const spec = {
      id: RECRUIT_ID,
      kind: 'info',
      sender: 'CREW HAIL',
      headline: `${String(p.name || '').toUpperCase()} — ${String(p.roleLabel || '').toUpperCase()} · ${p.perkLine || ''}${terms}`,
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

  const onDecisionOffer = (p) => {
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return;
    if (!p || p.visible !== true || !p.offerId) {
      dismissedOffer = null;
      if (typeof deck.resolveDecision === 'function') deck.resolveDecision(DECISION_ID);
      return;
    }
    if (dismissedOffer === p.offerId) return;
    const spec = {
      id: DECISION_ID,
      kind: 'info',
      sender: p.sender || 'CREW',
      headline: p.headline || '',
      detail: p.detail || '',
      deadlineAt: null,
      choices: Array.isArray(p.choices) ? p.choices : [],
      onChoose: (choiceId) => {
        if (typeof deck.resolveDecision === 'function') deck.resolveDecision(DECISION_ID);
        if (choiceId === 'defer') {
          dismissedOffer = p.offerId;
          return;
        }
        bus.emit('crew:decide', { offerId: p.offerId, choiceId, owed: p.owed });
      },
    };
    if (deck.hasDecision && deck.hasDecision(DECISION_ID)) {
      if (typeof deck.updateDecision === 'function') deck.updateDecision(DECISION_ID, spec);
      return;
    }
    deck.offerDecision(spec);
  };

  const subs = [
    bus.on('crew:recruitOffer', onRecruitOffer),
    bus.on('crew:decisionOffer', onDecisionOffer),
  ];
  for (const name of ['dock:docked', 'sector:exit', 'save:restoring', 'game:new']) {
    subs.push(bus.on(name, () => {
      dismissedFor = null;
      const deck = deckOf();
      if (deck && typeof deck.resolveDecision === 'function') deck.resolveDecision(RECRUIT_ID);
    }));
  }
  // The decision card is dock-side: it must survive dock:docked (that is when it appears) and
  // only clears on the transitions that also drop the sim offer — sector exit, save, new game.
  for (const name of ['sector:exit', 'save:restoring', 'game:new']) {
    subs.push(bus.on(name, () => {
      dismissedOffer = null;
      const deck = deckOf();
      if (deck && typeof deck.resolveDecision === 'function') deck.resolveDecision(DECISION_ID);
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
      if (deck && typeof deck.resolveDecision === 'function') {
        deck.resolveDecision(RECRUIT_ID);
        deck.resolveDecision(DECISION_ID);
      }
    },
  };
}

export default createCrewPrompt;
