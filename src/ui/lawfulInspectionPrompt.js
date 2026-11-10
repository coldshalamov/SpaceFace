// src/ui/lawfulInspectionPrompt.js — adapter from lawSecurity's inspection case events to the
// flight decision deck (src/ui/promptDeck.js).
//
// offered → a warn-kind decision with one verb (COMPLY — HOLD FOR SCAN); scanning → the same
// decision switches to a status frame; resolved → the frame resolves and a receipt line goes to
// the reserved receipt lane (HUD_FLIGHT_ATTENTION: results are facts, not cards).
//
// The deck owns placement, digits, gamepad, announcements and the input fence; with no live deck
// (node probes) the adapter is inert.

import { getPromptDeck } from './promptDeck.js';

const RESULT_TTL_S = 6;

export function createLawfulInspectionPrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();

  const CASE_ID = 'lawfulInspection';
  let caseId = null;

  const offered = (payload) => {
    if (!isCase(payload)) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    caseId = payload.id;
    return deck.offerDecision({
      id: CASE_ID,
      kind: 'warn',
      sender: 'CONCORD TRAFFIC CONTROL',
      headline: 'LAWFUL CARGO INSPECTION',
      detail: offerDetail(payload.deadlineAt),
      deadlineAt: finiteOrNull(payload.deadlineAt),
      choices: [{
        id: 'comply',
        label: 'COMPLY — HOLD FOR SCAN',
        title: 'Comply. Hold for cargo scan.',
      }],
      onChoose: (choiceId, source) => {
        if (caseId == null) return;
        deck.updateDecision(CASE_ID, {
          statusFlag: 'TRANSMITTING COMPLIANCE…',
          choices: [{ id: 'comply', label: 'COMPLY — HOLD FOR SCAN', disabled: true }],
        });
        bus.emit('lawfulInspection:choose', { caseId, choice: choiceId, source });
      },
    });
  };

  const scanning = (payload) => {
    if (!isCase(payload)) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    caseId = payload.id;
    return deck.updateDecision(CASE_ID, {
      statusFlag: 'SCAN AUTHORIZED — HOLD POSITION',
      headline: 'CARGO SCAN IN PROGRESS',
      detail: 'Hold position while Concord reads the manifest.',
      deadlineAt: finiteOrNull(payload.deadlineAt),
      // The owner scan is synchronous once compliance is transmitted; never advertise an escape
      // action after the player has already chosen to submit.
      choices: [],
    });
  };

  const resolved = (payload) => {
    if (!payload || typeof payload.outcome !== 'string') return false;
    const deck = getPromptDeck();
    caseId = null;
    if (!deck) return false;
    deck.resolveDecision(CASE_ID);
    return !!bus.emit('toast', {
      text: `INSPECTION RESULT — ${resultText(payload.outcome)}`,
      kind: receiptKind(payload.outcome),
      ttl: RESULT_TTL_S,
    });
  };

  bus.on('lawfulInspection:offered', offered);
  bus.on('lawfulInspection:scanning', scanning);
  bus.on('lawfulInspection:resolved', resolved);
  // sector:exit / game:new / game:load are deck-owned transitions now.

  return {
    el: null,
    offered, scanning, resolved,
    hide: () => !!(getPromptDeck() && getPromptDeck().resolveDecision(CASE_ID)),
    choose: () => false,
    tick: () => {},
    destroy: () => {
      for (const [event, handler] of [['lawfulInspection:offered', offered], ['lawfulInspection:scanning', scanning], ['lawfulInspection:resolved', resolved]]) {
        try { bus.off && bus.off(event, handler); } catch (_) {}
      }
    },
  };
}

function isCase(payload) {
  return !!(payload && typeof payload.id === 'string' && payload.id
    && typeof payload.patrolWorldRecordId === 'string' && payload.patrolWorldRecordId);
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function offerDetail(deadlineAt) {
  if (!Number.isFinite(deadlineAt)) return 'Patrol requests a manifest scan. Flight remains active.';
  return 'Comply, or break range to escape.';
}

function resultText(outcome) {
  switch (outcome) {
    case 'cleared': return 'HOLD CLEAR — Concord releases your ship.';
    case 'contraband_discovered': return 'CONTRABAND SEIZED — cargo and penalty recorded.';
    case 'escaped': return 'INSPECTION ESCAPED — Concord records the refusal.';
    case 'collateral_assault': return 'INSPECTION ABORTED — firing on patrol is a lawful assault.';
    case 'collateral_patrol_destroyed': return 'PATROL DESTROYED — Concord records the attack.';
    case 'cloak_evaded': return 'PATROL LOST THE TRACE — inspection aborted.';
    default: return 'INSPECTION INTERRUPTED — no scan result recorded.';
  }
}

function receiptKind(outcome) {
  if (outcome === 'cleared') return 'success';
  if (String(outcome).startsWith('collateral') || outcome === 'contraband_discovered') return 'danger';
  return 'info';
}

function inertPrompt() {
  return {
    el: null, offered: () => false, scanning: () => false, resolved: () => false,
    hide: () => false, choose: () => false, tick: () => {}, destroy: () => {},
  };
}

export default createLawfulInspectionPrompt;
