// Deterministic contact-hail classification and copy.
//
// This module is deliberately read-only. Scanner owns request validation and transient lifetime;
// pirateParley remains the sole authority for toll choices/payment/escalation.
import { COMMODITIES } from './commodities.js';

export const CONTACT_HAIL_RANGE = 5200;
export const CONTACT_HAIL_REQUEST_TTL_S = 8;
export const CONTACT_HAIL_RECEIPT_TTL_S = 4;

const TRADER_ROLES = new Set(['hauler', 'courier', 'miner', 'smuggler', 'express', 'trader']);
const COMMODITY_LABEL = new Map(COMMODITIES.map((row) => [row.id, row.name]));

function entityById(state, id) {
  if (id == null || !state) return null;
  if (state.entities && typeof state.entities.get === 'function') return state.entities.get(id) || null;
  return (state.entityList || []).find((row) => row && row.id === id) || null;
}

function playerEntity(state) {
  return entityById(state, state && state.playerId);
}

function distanceBetween(a, b) {
  if (!a || !a.pos || !b || !b.pos) return Infinity;
  return Math.hypot((Number(a.pos.x) || 0) - (Number(b.pos.x) || 0),
    (Number(a.pos.z) || 0) - (Number(b.pos.z) || 0));
}

function unresolvedContact(entity) {
  const data = entity && entity.data || {};
  return !!(data.isGhost || data.ghost || data.unresolved || data.kind === 'unknown');
}

function activeTollRecord(state, targetId) {
  const squads = state && state.pirateParley && state.pirateParley.squads || {};
  const now = Number(state && state.simTime) || 0;
  let selected = null;
  let selectedId = '';
  for (const squadId in squads) {
    const rec = squads[squadId];
    if (!rec || rec.resolved || rec.phase !== 'demand' || !rec.demand) continue;
    if (!(Number(rec.deadlineAt) > now)) continue;
    const members = Array.isArray(rec.memberIds) ? rec.memberIds : [];
    if (rec.hailerId !== targetId && !members.includes(targetId)) continue;
    if (!selected || String(squadId) < selectedId) {
      selected = rec;
      selectedId = String(squadId);
    }
  }
  return selected;
}

function contactKind(state, entity) {
  const data = entity && entity.data || {};
  const ai = data.ai || {};
  const role = String(data.trafficRole || data.role || entity && entity.role || '').toLowerCase();
  const parley = activeTollRecord(state, entity && entity.id);
  if (parley) return { kind: 'toll', parley };
  const lawfulPatrol = ai.lawful === true
    && (ai.spawnContext === 'patrol' || role === 'patrol' || role === 'escort');
  if (lawfulPatrol) return { kind: 'patrol', parley: null };
  const neutralTrader = entity && entity.team === 2 && ai.passive === true
    && (TRADER_ROLES.has(role) || ai.archetype === 'fleeing_trader')
    && role !== 'pirate' && role !== 'patrol' && role !== 'escort';
  if (neutralTrader) return { kind: 'trader', parley: null };
  return { kind: null, parley: null };
}

function callsign(entity) {
  const data = entity && entity.data || {};
  return String(data.callsign || data.trafficLabel || data.scanLabel || data.name || 'UNIDENTIFIED VESSEL')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

export function contactHailAvailability(state) {
  const targetId = state && state.player && state.player.targetId;
  const target = entityById(state, targetId);
  const player = playerEntity(state);
  const unavailable = (reason) => ({ enabled: false, reason, targetId: targetId ?? null, kind: null, label: 'HAIL' });
  if (!state || state.mode !== 'flight' || state.ui && state.ui.docked) return unavailable('not_in_flight');
  if (!target) return unavailable('unresolved_target');
  if (target.alive === false) return unavailable('dead_target');
  if (target.type !== 'ship' && target.type !== 'drone') return unavailable('unsupported_target');
  if (unresolvedContact(target)) return unavailable('unresolved_target');
  if (!player || player.alive === false) return unavailable('no_player');
  const distance = distanceBetween(player, target);
  if (distance > CONTACT_HAIL_RANGE) return unavailable('out_of_reveal_range');
  const classification = contactKind(state, target);
  if (!classification.kind) return unavailable('unsupported_contact');
  return {
    enabled: true,
    reason: null,
    targetId: target.id,
    kind: classification.kind,
    label: `HAIL ${callsign(target)}`,
    distance,
    entity: target,
    parley: classification.parley,
  };
}

export function createContactHailOffer(state, availability, requestId, expiresAt) {
  if (!availability || !availability.enabled || availability.kind === 'toll') return null;
  const name = callsign(availability.entity);
  if (availability.kind === 'patrol') {
    return {
      requestId, targetId: availability.targetId, kind: 'patrol', expiresAt,
      lines: [`${name} · LAWFUL PATROL`, 'CHANNEL OPEN.'],
      actions: [{ id: 'status', label: 'STATUS' }, { id: 'identify', label: 'IDENTIFY' }],
    };
  }
  return {
    requestId, targetId: availability.targetId, kind: 'trader', expiresAt,
    lines: [`${name} · CIVILIAN FREIGHT`, 'CHANNEL OPEN.'],
    actions: [{ id: 'route', label: 'ROUTE' }, { id: 'manifest', label: 'MANIFEST' }],
  };
}

function traderRecord(state, targetId) {
  return (state && state.traffic && state.traffic.freighters || [])
    .find((row) => row && row.id === targetId) || null;
}

function stationLabel(state, id) {
  const station = entityById(state, id);
  const data = station && station.data || {};
  return String(data.name || data.stationName || data.stationId || id || 'LOCAL TRADE LANE')
    .replace(/_/g, ' ').trim().toUpperCase();
}

function commodityLabel(id) {
  return String(COMMODITY_LABEL.get(id) || id || 'CARGO')
    .replace(/^cmdty_/i, '').replace(/_/g, ' ').trim().toUpperCase();
}

function manifestText(state, target) {
  const record = traderRecord(state, target.id);
  const manifest = target.data && target.data.cargoManifest || record && record.manifest;
  const lines = manifest && Array.isArray(manifest.lines) ? manifest.lines : [];
  const cargo = lines.filter((row) => row && Number(row.qty) > 0).slice(0, 2)
    .map((row) => `${Math.floor(Number(row.qty))} ${commodityLabel(row.commodityId || row.id)}`);
  return cargo.length ? `MANIFEST · ${cargo.join(' · ')}` : 'MANIFEST · NO DECLARED CARGO';
}

function routeText(state, target) {
  const record = traderRecord(state, target.id);
  const itinerary = target.data && target.data.itinerary;
  const destinationId = itinerary && itinerary.destinationStationId || record && record.targetId;
  return `ROUTE · ${stationLabel(state, destinationId)}`;
}

export function createContactHailResponse(state, offer, choice, authority = {}) {
  if (!offer || (offer.kind !== 'patrol' && offer.kind !== 'trader')) return null;
  const target = entityById(state, offer.targetId);
  if (!target) return null;
  const id = String(choice || '').toLowerCase();
  let line = null;
  if (offer.kind === 'patrol' && id === 'status') {
    line = authority.weaponsAuthorized === true
      ? 'STATUS · WEAPONS AUTHORIZED. HEAVE TO.'
      : 'STATUS · HOLD FIRE. FLY CLEAN.';
  } else if (offer.kind === 'patrol' && id === 'identify') {
    line = `${callsign(target)} · LAWFUL PATROL · ACTIVE BEAT`;
  } else if (offer.kind === 'trader' && id === 'route') {
    line = routeText(state, target);
  } else if (offer.kind === 'trader' && id === 'manifest') {
    line = manifestText(state, target);
  }
  if (!line) return null;
  return {
    requestId: offer.requestId,
    targetId: offer.targetId,
    kind: offer.kind,
    choice: id,
    expiresAt: (Number(state.simTime) || 0) + CONTACT_HAIL_RECEIPT_TTL_S,
    lines: [line],
  };
}

export function pirateParleyDemandForHandoff(record) {
  if (!record || record.resolved || record.phase !== 'demand' || !record.demand) return null;
  return {
    squadId: record.squadId,
    hailerId: record.hailerId || null,
    memberIds: Array.isArray(record.memberIds) ? record.memberIds.slice() : [],
    doctrineId: record.doctrineId,
    factionId: record.factionId,
    phase: record.phase,
    startedAt: record.startedAt,
    demandAt: record.demandAt,
    deadlineAt: record.deadlineAt,
    demand: { ...record.demand },
    tithe: record.tithe ? { ...record.tithe } : null,
    choice: record.choice || null,
    escapeRadius: 1200,
  };
}
