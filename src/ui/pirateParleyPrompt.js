// src/ui/pirateParleyPrompt.js — adapter from the pirateParley sim events to the flight decision
// deck (src/ui/promptDeck.js), plus the pure text/surfacing helpers its contract tests pin.
//
// The simulation owns eligibility, timing, payment, hostility and escape. This module reads the
// public pirateParley events, renders their meaning on the deck, and emits canonical choices. It
// never pauses flight, writes cargo/credits, or creates a second combat state machine.
//
// Before the deck this module owned its own corner card, style tag, digit keys and a gamepad poll
// that fired simultaneously with every other card's poll (one A press complied AND tracked).
import { COMMODITIES } from '../data/commodities.js';
import { FACTION_META } from '../data/factions.js';
import { getPromptDeck } from './promptDeck.js';

const COMMODITY_LABELS = new Map(COMMODITIES.map((c) => [c.id, String(c.name || c.id).replace(/^Refined /i, '')]));
const FACTION_LABELS = new Map(FACTION_META.map((f) => [f.id, String(f.name || f.id)]));
const RECEIPT_TTL_S = 4;
const ESCALATION_OUTCOMES = new Set(['refused', 'timeout', 'player_attack']);

function positiveCargo(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items || {};
  return Object.values(items).some((qty) => Number(qty) > 0);
}

export function shouldSurfaceParley(payload, state) {
  if (!payload || !payload.squadId || !payload.deadlineAt || !payload.demand) return false;
  if (!state || state.mode !== 'flight' || state.ui && state.ui.docked) return false;
  if (state.world && state.world.currentSectorId === 'sector_helios_prime') return false;
  if (!positiveCargo(state)) return false;
  const amount = Number(payload.demand.amount != null ? payload.demand.amount : payload.demand.qty);
  return Number.isFinite(amount) && amount > 0 && Number(payload.deadlineAt) > Number(state.simTime || 0);
}

function numberText(value) {
  return Math.max(0, Math.floor(Number(value) || 0)).toLocaleString('en-US');
}

function commodityLabel(id) {
  return COMMODITY_LABELS.get(id) || String(id || 'cargo').replace(/^cmdty_/i, '').replace(/_/g, ' ');
}

export function parleyDemandText(demand) {
  if (!demand) return 'NO VALID DEMAND';
  if (demand.kind === 'credits') return `TRANSFER ${numberText(demand.amount)} CREDITS`;
  const qty = numberText(demand.qty != null ? demand.qty : demand.amount);
  return `JETTISON ${qty} ${commodityLabel(demand.commodityId).toUpperCase()}`;
}

function entityById(state, id) {
  if (!id || !state) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return null;
}

function entityCallsign(entity) {
  const data = entity && entity.data || {};
  const value = data.callsign || data.displayName || data.name || data.def && data.def.name || entity && entity.name;
  return String(value || '').trim();
}

export function parleyHailerText(payload, state) {
  const entity = entityById(state, payload && payload.hailerId);
  const callsign = entityCallsign(entity);
  const factionId = payload && payload.factionId || entity && (entity.factionId || entity.data && entity.data.factionId);
  const faction = FACTION_LABELS.get(factionId) || 'Unregistered raiders';
  return callsign ? `${callsign} · ${faction}` : faction;
}

function paymentText(payload) {
  const payment = payload && payload.payment;
  if (!payment) return '';
  if (payment.kind === 'credits') return `${numberText(payment.amount)} credits transferred`;
  return `${numberText(payment.amount)} ${commodityLabel(payment.commodityId)} jettisoned`;
}

export function parleyReceiptText(payload) {
  const outcome = String(payload && payload.outcome || 'resolved');
  if (outcome === 'complied') return `PAID · ${paymentText(payload) || 'toll settled'} · raiders disengaging`;
  if (outcome === 'unprofitable') return 'NO PAYMENT · hold had no collectible toll · raiders disengaging';
  if (outcome === 'evaded') return 'EVADED · clear of intercept radius · raiders disengaging';
  if (outcome === 'player_attack') return 'ESCALATED · you fired during parley · raiders weapons free';
  if (outcome === 'refused') return 'ESCALATED · you refused the toll · raiders weapons free';
  if (outcome === 'timeout') return 'ESCALATED · response window expired · raiders weapons free';
  return `PARLEY CLOSED · ${outcome.replace(/_/g, ' ')}`;
}

export function parleyRemainingSeconds(deadlineAt, simTime) {
  return Math.max(0, Number(deadlineAt || 0) - Number(simTime || 0));
}

const DECK_ID = 'pirateParley';

export function createPirateParleyPrompt(ctx = {}) {
  const state = ctx.state || {};
  const bus = ctx.bus;
  if (!bus || typeof bus.on !== 'function') return inertPrompt();

  let running = false;

  const showDemand = (payload) => {
    if (!shouldSurfaceParley(payload, state)) return false;
    const deck = getPromptDeck();
    if (!deck) return false;
    running = false;
    return deck.offerDecision({
      id: DECK_ID,
      kind: 'danger',
      sender: parleyHailerText(payload, state).toUpperCase(),
      statusFlag: 'TOLL HAIL',
      headline: parleyDemandText(payload.demand),
      detail: 'Cargo toll. Profit motive; weapons held during response.',
      deadlineAt: Number(payload.deadlineAt),
      choices: [
        { id: 'comply', label: 'COMPLY' },
        { id: 'refuse', label: 'REFUSE', danger: true, cancel: true },
        { id: 'run', label: 'RUN 1.2 KM' },
      ],
      onChoose: (choiceId, source) => {
        const live = getPromptDeck();
        if (!live) return false;
        if (choiceId === 'run') {
          running = true;
          live.updateDecision(DECK_ID, {
            statusFlag: 'CLEAR 1.2 KM',
            detail: 'Run selected. Clear every raider by 1.2 km before time expires.',
            choices: [
              { id: 'comply', label: 'COMPLY' },
              { id: 'refuse', label: 'REFUSE', danger: true, cancel: true },
              { id: 'run', label: 'RUNNING', disabled: true, reason: 'Run selected — clear the intercept radius.' },
            ],
          });
        }
        return bus.emit('pirateParley:choose', { squadId: payload.squadId, choice: choiceId, source });
      },
    });
  };

  const showReceipt = (payload) => {
    if (!payload || !payload.squadId) return false;
    running = false;
    const deck = getPromptDeck();
    if (deck) deck.resolveDecision(DECK_ID);
    if (!wasLive(payload.squadId)) return false;
    return !!bus.emit('toast', {
      text: parleyReceiptText(payload),
      kind: ESCALATION_OUTCOMES.has(String(payload.outcome || '')) ? 'danger' : 'info',
      ttl: RECEIPT_TTL_S,
    });
  };

  // The receipt only reads when the parley was actually on the deck — a resolution for a demand
  // that never surfaced (Helios, empty hold) stays silent, matching shouldSurfaceParley.
  let liveSquadId = null;
  const surface = (payload) => {
    const shown = showDemand(payload);
    if (shown) liveSquadId = payload.squadId;
    return shown;
  };
  function wasLive(squadId) { return liveSquadId != null && String(liveSquadId) === String(squadId); }

  bus.on('pirateParley:demand', surface);
  bus.on('pirateParley:resolved', showReceipt);
  // game:new / game:load / sector transitions are deck-owned now.

  return {
    el: null,
    tick: () => {},
    hide: () => !!(getPromptDeck() && getPromptDeck().resolveDecision(DECK_ID)),
    destroy: () => {
      try { bus.off && bus.off('pirateParley:demand', surface); } catch (_) {}
      try { bus.off && bus.off('pirateParley:resolved', showReceipt); } catch (_) {}
    },
    showDemand, showReceipt,
    choose: () => false,
  };
}

function inertPrompt() {
  return {
    el: null, tick: () => {}, hide: () => false, destroy: () => {},
    showDemand: () => false, showReceipt: () => false, choose: () => false,
  };
}

export default createPirateParleyPrompt;
