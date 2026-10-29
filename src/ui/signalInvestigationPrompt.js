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
// The capability verdict lives on its own decision: a scan result card is replaced wholesale
// by the next `signal:scanResults` batch (Spectrum publishes its own row after the scanner),
// and a replaceable row is where a door read goes to die. The verdict is durable knowledge —
// the fit did or did not open a named door — so only a later batch that carries verdict parts
// may refresh it; every other publisher leaves it standing until it expires.
const DECK_ID_CAPABILITY = 'signal:capability';

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
    tracks: Array.isArray(row.spectrum?.tracks) ? row.spectrum.tracks.slice(0, 7).map(track => ({
      key: String(track.key || ''), motionClass: String(track.motionClass || 'UNKNOWN'),
      chartLabel: String(track.chartLabel || ''),
    })).filter(track => track.key) : [],
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
  return `${signalStrengthWord(record.strength)} · ${distance} u · PASS ${pass}`;
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

// One verdict per physical door across the whole batch: the body's own row and the text-only
// copies lifted onto the lesson rows share a doorKey, so dedupe by it and prefer the lifted
// copy — it names the door in its sentence, the body's own row does not.
function capabilityVerdicts(payload) {
  const rows = payload && Array.isArray(payload.signals) ? payload.signals : [];
  const byDoor = new Map();
  for (const row of rows) {
    const part = row && row.discovery && row.discovery.parts && row.discovery.parts['SF-174'];
    if (!part || typeof part.sentence !== 'string' || !part.sentence) continue;
    const key = String(part.doorKey || part.sentence);
    const prev = byDoor.get(key);
    if (!prev || (part.lifted === true && prev.lifted !== true)) byDoor.set(key, part);
  }
  return [...byDoor.values()];
}

export function createSignalInvestigationPrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();

  function deckFor() { return getPromptDeck(); }

  // Live union of door verdicts for the current pulse: the dedicated
  // scan:capabilityVerdicts event is authoritative (it sees every door in reach, uncapped);
  // the capped signal batch may only ADD verdicts, never shrink the set — otherwise a
  // six-row cap carrying a subset would erase doors the pulse already proved.
  const capabilityDoors = new Map();
  const mergeDoors = (parts) => {
    const now = Number(state.simTime || 0);
    // Entries outlive their card's own TTL only on the union path — a stale door can
    // never resurrect inside a later scan's verdict set.
    for (const [key, entry] of capabilityDoors) {
      if (now - (entry._at || 0) > RESULT_TTL_S) capabilityDoors.delete(key);
    }
    for (const part of parts) {
      const key = String(part.doorKey || part.sentence);
      const prev = capabilityDoors.get(key);
      if (!prev || (part.lifted === true && prev.lifted !== true)) {
        capabilityDoors.set(key, { ...part, _at: now });
      }
    }
    return [...capabilityDoors.values()];
  };

  const offerCapability = (deck, doors) => deck.offerDecision({
    id: DECK_ID_CAPABILITY,
    kind: 'info',
    sender: 'FIT CHECK',
    statusFlag: doors.length === 1
      ? String(doors[0].verdict || '').toUpperCase()
      : `${doors.length} DOORS`,
    headline: doors.length === 1 ? 'CAPABILITY DOOR' : 'CAPABILITY DOORS',
    detail: doors.map((part) => part.cardSentence || part.sentence).join(' ').slice(0, 480),
    ttlAt: Number(state.simTime || 0) + RESULT_TTL_S,
    choices: [],
    onExpire: () => {},
  });

  // The dedicated verdict event is computed on the pulse itself (scanReveal), never from
  // the capped signal list — a crowded scan that drops every lesson row still paints the
  // door. An empty batch clears the card: the door left the reveal reach.
  const showCapabilityVerdicts = (payload) => {
    const deck = deckFor();
    if (!deck) return false;
    capabilityDoors.clear();
    const doors = Array.isArray(payload && payload.verdicts) ? payload.verdicts : [];
    const now = Number(state.simTime || 0);
    for (const part of doors) {
      capabilityDoors.set(String(part.doorKey || part.sentence), { ...part, _at: now });
    }
    if (!doors.length) {
      deck.resolveDecision(DECK_ID_CAPABILITY);
      return false;
    }
    return offerCapability(deck, doors);
  };

  const showResults = (payload) => {
    const deck = deckFor();
    if (!deck) return false;
    const doors = capabilityVerdicts(payload);
    if (doors.length) {
      offerCapability(deck, mergeDoors(doors));
    }
    const record = safeRecord(payload);
    if (!record) return false;
    return deck.offerDecision({
      id: DECK_ID_RESULT,
      kind: 'info',
      sender: 'SCAN RETURN',
      statusFlag: `CONFIDENCE ${Math.round(record.confidence * 100)}%`,
      headline: record.classification.toUpperCase(),
      detail: [record.meta, record.detail].filter(Boolean).join(' — '),
      ttlAt: Number(state.simTime || 0) + RESULT_TTL_S,
      choices: [...record.tracks.map(track => ({ id: `focus:${track.key}`,
        label: `${track.key} · ${track.motionClass}${track.chartLabel ? ` · ${track.chartLabel}` : ''}`,
        title: 'Compare this return with your next pulse.',
      })), ...(record.trackable ? [{
        id: 'track',
        label: record.manualInvestigation ? 'INVESTIGATE MANUALLY' : 'TRACK / INVESTIGATE',
        title: record.manualInvestigation
          ? 'Fly this return manually · no course set'
          : 'Track the return and investigate.',
      }] : [])],
      onExpire: () => {},
      onChoose: (choiceId, source) => {
        const focus = record.tracks.find(track => choiceId === `focus:${track.key}`);
        if (focus) return bus.emit('spectrum:focus', { key: focus.key, source });
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
      text: `Course plotted to the ${String(payload.classification).toLowerCase()}. Follow the objective marker.`,
      kind: 'info',
      ttl: RECEIPT_TTL_S,
    });
  };

  const showInvestigating = (payload) => {
    const deck = deckFor();
    if (deck) deck.resolveDecision(DECK_ID_RESULT);
    if (!payload || !payload.classification) return false;
    return !!bus.emit('toast', {
      text: `Investigating the ${String(payload.classification).toLowerCase()}. No course set — fly to the return yourself.`,
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
      text: `${String(payload.classification || 'signal').toLowerCase().replace(/^./, (c) => c.toUpperCase())} investigated — discovery logged. No duplicate reward.`,
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
  bus.on('scan:capabilityVerdicts', showCapabilityVerdicts);
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
      return deck.resolveDecision(DECK_ID_RESULT) | deck.resolveDecision(DECK_ID_CODEX)
        | deck.resolveDecision(DECK_ID_CAPABILITY);
    },
    destroy: () => {
      // Teardown owns its open decisions too — a torn-down adapter must not leave its
      // capability card on the deck.
      const deck = deckFor();
      if (deck) {
        deck.resolveDecision(DECK_ID_RESULT);
        deck.resolveDecision(DECK_ID_CODEX);
        deck.resolveDecision(DECK_ID_CAPABILITY);
      }
      for (const [event, handler] of [
        ['signal:scanResults', showResults], ['scan:capabilityVerdicts', showCapabilityVerdicts],
        ['signal:tracked', showTracked],
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
