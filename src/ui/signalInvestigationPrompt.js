// src/ui/signalInvestigationPrompt.js — adapter from the scanner's signal events to the flight
// decision deck (src/ui/promptDeck.js) and the reserved receipt lane.
//
// scanResults → an info decision with the track/investigate verb (self-expiring via ttlAt);
// tracked / investigating → thin receipt lines; investigated → a receipt, or — when a quiet
// contact was remembered — a one-verb decision that opens the Codex discovery.
//
// Before the deck this module pinned its own corner card AND hid itself whenever three other
// cards fired (recovery:started, pirateParley:demand, law:distressRaised). The deck's ladder made
// that cross-card hiding obsolete: coexisting surfaces stack instead of erasing each other.
import { TETHYS_BLACK_MARKET_DISCOVERY } from '../data/frontierRumors.js';
import { clearCodexDiscoveryRequest, requestCodexDiscovery } from './screens/codex.js';
import { getPromptDeck } from './promptDeck.js';

const RECEIPT_TTL_S = 4;
const RESULT_TTL_S = 10;

const DECK_ID_RESULT = 'signal:results';
const DECK_ID_CODEX = 'signal:codex';

function safeRecord(payload) {
  const row = payload && payload.primary;
  if (!row || !row.classification) return null;
  return {
    id: String(row.id || row.signalId || ''),
    classification: String(row.classification),
    confidence: Number(row.confidence) || 0,
    trackable: row.trackable !== false,
    manualInvestigation: !!row.manualInvestigation,
    detail: String(row.detail || 'Scanner return logged.'),
    meta: signalMetaText(row),
  };
}

export function signalStrengthWord(value) {
  const n = Math.max(0, Math.min(1, Number(value) || 0));
  if (n >= 0.66) return 'STRONG';
  if (n >= 0.33) return 'MEDIUM';
  return 'FAINT';
}

// The scanner's public row carries strength/distance/scanCount, or a triangulation fix while the
// source is still a bearing. The prompt-deck rewrite (641f153ba) read rangeText/bearingText, which
// no producer sets, so every scan return said RETURN LOGGED and the bearing fix count was lost.
export function signalMetaText(record) {
  if (!record) return 'FAINT · RANGE —';
  if (record.triangulation) {
    const bearing = Math.round(Number(record.triangulation.bearingDeg) || 0)
      .toString().padStart(3, '0');
    const sampleCount = Math.max(0, Math.round(Number(record.triangulation.sampleCount) || 0));
    const requiredPings = Math.max(1, Math.round(Number(record.triangulation.requiredPings) || 3));
    return `BEARING ${bearing}° · FIX ${sampleCount}/${requiredPings}`;
  }
  const distance = Math.max(0, Math.round(Number(record.distance) || 0)).toLocaleString('en-US');
  const pass = Math.max(1, Math.round(Number(record.scanCount) || 1));
  return `${signalStrengthWord(record.strength)} · ${distance} WU · PASS ${pass}`;
}

// The Tethys completion hands its exact persisted Codex plate identity ({ sectorId, poiId }, the
// shape requestCodexDiscovery/consumeCodexDiscoveryRequest match on) - and only once the quiet
// contact is really made. The prompt-deck rewrite (641f153ba) returned the constant's absent
// codexTarget/id fields instead, so the VIEW CODEX decision could never be offered.
export function tethysCodexTargetForCompletion(state, payload) {
  const discovery = TETHYS_BLACK_MARKET_DISCOVERY;
  if (!payload || payload.sectorId !== discovery.sectorId || payload.sourceId !== discovery.poiId) return null;
  const record = state?.world?.frontierRumors?.byId?.[discovery.rumorId];
  if (!record || record.phase !== 'contacted' || record.contactId !== discovery.contactId) return null;
  return { sectorId: discovery.sectorId, poiId: discovery.poiId };
}

export function createSignalInvestigationPrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();

  function deckFor() { return getPromptDeck(); }

  const showResults = (payload) => {
    const deck = deckFor();
    const record = safeRecord(payload);
    if (!deck || !record) return false;
    return deck.offerDecision({
      id: DECK_ID_RESULT,
      kind: 'info',
      sender: 'SCAN RETURN',
      statusFlag: `CONFIDENCE ${Math.round(record.confidence * 100)}%`,
      headline: record.classification.toUpperCase(),
      detail: [record.meta, record.detail].filter(Boolean).join(' — '),
      ttlAt: Number(state.simTime || 0) + RESULT_TTL_S,
      choices: record.trackable ? [{
        id: 'track',
        label: record.manualInvestigation ? 'INVESTIGATE MANUALLY' : 'TRACK / INVESTIGATE',
        title: record.manualInvestigation
          ? 'Fly this return manually · no course set'
          : 'Track the return and investigate.',
      }] : [],
      onExpire: () => {},
      onChoose: (choiceId, source) => {
        if (choiceId !== 'track') return false;
        deck.updateDecision(DECK_ID_RESULT, { choices: [] });
        return bus.emit(record.manualInvestigation ? 'signal:investigate' : 'signal:track',
          { signalId: record.id, source });
      },
    });
  };

  const showTracked = (payload) => {
    const deck = deckFor();
    if (deck) deck.resolveDecision(DECK_ID_RESULT);
    if (!payload || !payload.classification) return false;
    return !!bus.emit('toast', {
      text: `NAV FIX ARMED — ${String(payload.classification).toUpperCase()} — course plotted. Follow the primary objective marker to investigate.`,
      kind: 'info',
      ttl: RECEIPT_TTL_S,
    });
  };

  const showInvestigating = (payload) => {
    const deck = deckFor();
    if (deck) deck.resolveDecision(DECK_ID_RESULT);
    if (!payload || !payload.classification) return false;
    return !!bus.emit('toast', {
      text: `MANUAL INVESTIGATION ARMED — ${String(payload.classification).toUpperCase()} — fly to the return yourself; no course was set.`,
      kind: 'info',
      ttl: RECEIPT_TTL_S,
    });
  };

  const showInvestigated = (payload) => {
    const deck = deckFor();
    if (!payload) return false;
    const codexTarget = tethysCodexTargetForCompletion(state, payload);
    if (codexTarget && deck) {
      requestCodexDiscovery(codexTarget);
      return deck.offerDecision({
        id: DECK_ID_CODEX,
        kind: 'info',
        sender: 'QUIET CONTACT REMEMBERED',
        statusFlag: 'SAVED',
        headline: 'TETHYS BLACK MARKET',
        detail: 'Discovery receipt saved. Return to Tethys Bar for the risky Capsule Run lead.',
        ttlAt: Number(state.simTime || 0) + RESULT_TTL_S,
        choices: [{ id: 'codex', label: 'VIEW CODEX', title: 'Open the saved discovery in the Codex (K).' }],
        onExpire: () => { try { clearCodexDiscoveryRequest(); } catch (_) {} },
        onChoose: () => openCodex('deck'),
      });
    }
    if (deck) {
      // A stale codex decision must not outlive its signal.
      deck.resolveDecision(DECK_ID_CODEX);
    }
    return !!bus.emit('toast', {
      text: `INVESTIGATION COMPLETE — ${String(payload.classification || 'signal').toUpperCase()} — discovery logged. No duplicate reward.`,
      kind: 'info',
      ttl: RECEIPT_TTL_S,
    });
  };

  function track(source = 'click') {
    const deck = deckFor();
    if (!deck || !deck.hasDecision(DECK_ID_RESULT)) return false;
    // The decision's own onChoose normalizes the intent; routing through the deck keeps one verb.
    return deck.choose(DECK_ID_RESULT, 'track', source);
  }

  function openCodex(source = 'click') {
    const deck = deckFor();
    if (deck) deck.resolveDecision(DECK_ID_CODEX);
    bus.emit('ui:pushScreen', { id: 'codex', source: `signal-investigation:${source}` });
    return true;
  }

  bus.on('signal:scanResults', showResults);
  bus.on('signal:tracked', showTracked);
  bus.on('signal:investigating', showInvestigating);
  bus.on('signal:investigated', showInvestigated);
  // The old hide-on-recovery:started / pirateParley:demand / law:distressRaised subscriptions are
  // retired: the deck stacks coexisting surfaces instead of erasing them.

  return {
    el: null,
    tick: () => {},
    hide: () => {
      const deck = deckFor();
      if (!deck) return false;
      return deck.resolveDecision(DECK_ID_RESULT) | deck.resolveDecision(DECK_ID_CODEX);
    },
    destroy: () => {
      for (const [event, handler] of [
        ['signal:scanResults', showResults], ['signal:tracked', showTracked],
        ['signal:investigating', showInvestigating], ['signal:investigated', showInvestigated],
      ]) {
        try { bus.off && bus.off(event, handler); } catch (_) {}
      }
    },
    showResults, showTracked, showInvestigated, track, openCodex,
  };
}

function inertPrompt() {
  return {
    el: null, tick: () => {}, hide: () => false, destroy: () => {},
    showResults: () => false, showTracked: () => false, showInvestigated: () => false,
    track: () => false, openCodex: () => false,
  };
}

export default createSignalInvestigationPrompt;
