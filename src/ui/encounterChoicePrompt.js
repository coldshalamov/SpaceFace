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

  // A choiceless observe window (E1/H6 'wait'): a bare status card so the player sees the
  // encounter is still live while both sides fight. It retires on encounter:resolved, and
  // its ttlAt is the same deadline the sim already enforces — no second clock.
  const waitStarted = (payload) => {
    if (!payload || !payload.encounterId) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    return deck.offerDecision({
      id: 'encounter:' + payload.encounterId,
      kind: 'info',
      sender: 'ENCOUNTER',
      headline: 'OBSERVING',
      detail: payload.reason === 'observe_battle'
        ? 'Both sides are fighting. Hold position.'
        : 'Waiting on the outcome.',
      deadlineAt: Number.isFinite(payload.deadlineAt) ? Number(payload.deadlineAt) : null,
      ttlAt: Number.isFinite(payload.deadlineAt) ? Number(payload.deadlineAt) : null,
      choices: [],
      onChoose: () => {},
    });
  };

  // ── FB-132: a claim raid alarm is a decision, not only a headline ──────────────────────────
  // claims.js owns the warning, the waypoint, the patrol ledger and the settlement; this
  // adapter normalizes `claim:defenseWarning` into ONE deck decision — go (the waypoint the
  // alarm already set stays up), ignore (`claim:defenseIgnore`, the LAW-09 settle), delegate
  // (`claim:defenseDelegate`, engine-validated against a supported depot's patrol rotation) —
  // and retires the card when the defense leaves its warning window for any reason.
  const warnedDefenseIds = new Set();

  const defenseWarning = (payload) => {
    const claimId = payload && (payload.claimId || payload.bodyId);
    const defenseId = payload && payload.defenseId;
    if (!claimId || !defenseId) return false;
    if (warnedDefenseIds.has(defenseId)) return false; // one prompt per warning
    const deck = getPromptDeck();
    if (!deck) return false;
    const id = 'claim-defense:' + defenseId;
    const count = Number.isFinite(Number(payload.attackerCount)) ? Number(payload.attackerCount) : null;
    warnedDefenseIds.add(defenseId);
    return deck.offerDecision({
      id,
      kind: 'danger',
      sender: 'CLAIM DEFENSE',
      headline: `${payload.attackerName || 'Raiders'} — ${count != null ? count + ' ships' : 'ships'} inbound`,
      detail: payload.motive || null,
      deadlineAt: Number.isFinite(payload.deadlineAt) ? Number(payload.deadlineAt) : null,
      ttlAt: Number.isFinite(payload.deadlineAt) ? Number(payload.deadlineAt) : null,
      choices: [
        { id: 'go', label: 'Go — fly the defense' },
        { id: 'ignore', label: 'Ignore — write off the stores' },
        { id: 'delegate', label: 'Delegate — spend a depot patrol' },
      ],
      onChoose: (choiceId) => {
        deck.resolveDecision(id);
        warnedDefenseIds.delete(defenseId);
        const event = choiceId === 'go' ? 'claim:defenseGo'
          : choiceId === 'ignore' ? 'claim:defenseIgnore'
          : choiceId === 'delegate' ? 'claim:defenseDelegate'
          : null;
        if (event) bus.emit(event, { claimId, defenseId });
      },
    });
  };

  const defenseSettled = (payload) => {
    const defenseId = payload && payload.defenseId;
    if (!defenseId) return false;
    warnedDefenseIds.delete(defenseId);
    const deck = getPromptDeck();
    return !!(deck && deck.resolveDecision('claim-defense:' + defenseId));
  };

  bus.on('encounter:choiceOffered', offered);
  bus.on('encounter:resolved', resolved);
  bus.on('encounter:waitStarted', waitStarted);
  bus.on('claim:defenseWarning', defenseWarning);
  // Engaged (the player arrived) or settled (ignored/timeout/victory) — either way the warning
  // window is over and the card retires.
  bus.on('claim:defenseStarted', defenseSettled);
  bus.on('claim:defenseResolved', defenseSettled);
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
      warnedDefenseIds.clear();
      try { bus.off && bus.off('encounter:choiceOffered', offered); } catch (_) {}
      try { bus.off && bus.off('encounter:resolved', resolved); } catch (_) {}
      try { bus.off && bus.off('encounter:waitStarted', waitStarted); } catch (_) {}
      try { bus.off && bus.off('claim:defenseWarning', defenseWarning); } catch (_) {}
      try { bus.off && bus.off('claim:defenseStarted', defenseSettled); } catch (_) {}
      try { bus.off && bus.off('claim:defenseResolved', defenseSettled); } catch (_) {}
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
