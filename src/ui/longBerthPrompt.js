// Row 445 — thin prompt-deck adapter for the Long Berth. The longBerth system emits presence-gated
// `longBerth:*Offer` visibility payloads; this module normalizes them into deck decisions and emits
// the player's verb back on the bus. It owns no DOM, keys, or placement.
import { getPromptDeck } from './promptDeck.js';

const CLAIM_ID = 'longBerth:claim';
const RESTORE_ID = 'longBerth:restore';

export function createLongBerthPrompt(ctx = {}) {
  const bus = ctx.bus;
  const deckOf = () => (ctx.deck != null ? ctx.deck : getPromptDeck());
  // A 'pass' holds until the offer drops once — the 1s presence scan must not resurrect a card
  // the player just waved off.
  let claimDismissed = false;
  let restoreDismissedFor = 0;

  const onClaimOffer = (p) => {
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return;
    if (!p || p.visible !== true) {
      claimDismissed = false;
      if (typeof deck.resolveDecision === 'function') deck.resolveDecision(CLAIM_ID);
      return;
    }
    if (claimDismissed) return;
    if (deck.hasDecision && deck.hasDecision(CLAIM_ID)) return;
    deck.offerDecision({
      id: CLAIM_ID,
      kind: 'info',
      sender: 'LONG BERTH',
      headline: 'DEAD TUG, YOUR LINE ON HER — CLAIM AS HOME?',
      deadlineAt: null,
      choices: [
        { id: 'claim', label: 'Claim her as your berth' },
        { id: 'pass', label: 'Leave her turning' },
      ],
      onChoose: (choiceId) => {
        if (typeof deck.resolveDecision === 'function') deck.resolveDecision(CLAIM_ID);
        if (choiceId === 'claim') bus.emit('longBerth:claim', {});
        else claimDismissed = true;
      },
    });
  };

  const onRestoreOffer = (p) => {
    const deck = deckOf();
    if (!deck || typeof deck.offerDecision !== 'function') return;
    if (!p || p.visible !== true || !p.stage) {
      restoreDismissedFor = 0;
      if (typeof deck.resolveDecision === 'function') deck.resolveDecision(RESTORE_ID);
      return;
    }
    if (restoreDismissedFor === p.stage) return;
    const spec = {
      id: RESTORE_ID,
      kind: 'info',
      sender: 'LONG BERTH',
      headline: `RESTORE ${p.stage}/3 — ${String(p.label || '').toUpperCase()}${p.costText ? ` (${p.costText})` : ''}`,
      deadlineAt: null,
      choices: [
        { id: 'restore', label: String(p.verb || 'Do the work') },
        { id: 'later', label: 'Not yet' },
      ],
      onChoose: (choiceId) => {
        if (typeof deck.resolveDecision === 'function') deck.resolveDecision(RESTORE_ID);
        if (choiceId === 'restore') bus.emit('longBerth:restore', {});
        else restoreDismissedFor = p.stage;
      },
    };
    if (deck.hasDecision && deck.hasDecision(RESTORE_ID)) {
      if (typeof deck.updateDecision === 'function') deck.updateDecision(RESTORE_ID, spec);
      return;
    }
    deck.offerDecision(spec);
  };

  const subs = [
    bus.on('longBerth:claimOffer', onClaimOffer),
    bus.on('longBerth:restoreOffer', onRestoreOffer),
  ];
  for (const name of ['dock:docked', 'sector:exit', 'save:restoring', 'game:new']) {
    subs.push(bus.on(name, () => {
      const deck = deckOf();
      if (deck && typeof deck.resolveDecision === 'function') {
        deck.resolveDecision(CLAIM_ID);
        deck.resolveDecision(RESTORE_ID);
      }
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
        deck.resolveDecision(CLAIM_ID);
        deck.resolveDecision(RESTORE_ID);
      }
    },
  };
}

export default createLongBerthPrompt;
