// src/ui/encounterChoicePrompt.js — adapter from the sim's authored encounter events to the
// flight decision deck (src/ui/promptDeck.js).
//
// The sim owns timing and outcome; this adapter only normalizes `encounter:choiceOffered` into a
// deck decision and emits exactly one `encounter:choose` back through the deck's onChoose verb.
// Placement, z-band, digits, gamepad, announcements, sector/run lifecycle and the input fence are
// the deck's — before the deck this file hand-rolled its own right-edge card, injected style tag
// and private digit router that raced every other card's.
//
// Headless safety: promptDeck.js is importable without a DOM, and with no live deck instance
// (node tests, probes) the adapter's verbs simply no-op.

import { getPromptDeck } from './promptDeck.js';

export function createEncounterChoicePrompt(ctx = {}) {
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();

  const offered = (payload) => {
    if (!payload || !payload.encounterId || !Array.isArray(payload.options)) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    const id = 'encounter:' + payload.encounterId;
    const choices = payload.options
      .map((option) => ({
        id: String(option && option.id || ''),
        label: String(option && (option.label != null ? option.label : option.id) || ''),
        disabled: !!(option && option.available === false),
      }))
      .filter((option) => option.id);
    return deck.offerDecision({
      id,
      kind: 'info',
      sender: 'ENCOUNTER DECISION',
      headline: String(payload.title || payload.kind || 'ENCOUNTER DECISION'),
      deadlineAt: Number.isFinite(payload.deadlineAt) ? Number(payload.deadlineAt) : null,
      choices,
      onChoose: (choiceId, source) => {
        // The decision is over as soon as it is submitted — the frame comes down now, not when a
        // later simulation phase resolves, so no dead-looking panel lingers over flight.
        deck.resolveDecision(id);
        bus.emit('encounter:choose', { encounterId: payload.encounterId, choiceId, source });
      },
    });
  };

  const resolved = (payload) => {
    if (!payload || !payload.encounterId) return false;
    const deck = getPromptDeck();
    return !!(deck && deck.resolveDecision('encounter:' + payload.encounterId));
  };

  bus.on('encounter:choiceOffered', offered);
  bus.on('encounter:resolved', resolved);
  // Sector/run transitions are the deck's own subscriptions now; the old per-card
  // hide-on-sector:exit / game:new / game:load sets are retired with the cards.

  return {
    el: null,
    buttons: [],
    show: offered,
    hide: () => false,
    choose: () => false,
    tick: () => {},
    destroy: () => {
      try { bus.off && bus.off('encounter:choiceOffered', offered); } catch (_) {}
      try { bus.off && bus.off('encounter:resolved', resolved); } catch (_) {}
    },
  };
}

function inertPrompt() {
  return {
    el: null, buttons: [], show: () => false, hide: () => {}, choose: () => false,
    tick: () => {}, destroy: () => {},
  };
}

export default createEncounterChoicePrompt;
