// Deterministic contact-hail classification and copy.
//
// This module is deliberately read-only. Scanner owns request validation and transient lifetime;
// pirateParley remains the sole authority for toll choices/payment/escalation.
import { COMMODITIES } from './commodities.js';
import { MODULES } from './modules.js';
import { SHIPS } from './ships.js';
import {
  isPassengerLinerItinerary,
  isPriorityCourierItinerary,
  PASSENGER_LINER_SERVICE,
} from './laneContacts.js';
import { richSeamOpportunityForEntity } from '../systems/fieldDepletion.js';
import { buildSlotList, fits } from '../systems/ships.js';

export const CONTACT_HAIL_RANGE = 5200;
export const CONTACT_HAIL_REQUEST_TTL_S = 8;
export const CONTACT_HAIL_RECEIPT_TTL_S = 4;
export const CONTACT_HAIL_ACTION_HEAVE_TO = 'heave_to';
export const CONTACT_HAIL_ACTION_HELP = 'help';
export const CONTACT_HAIL_ACTION_ESCORT = 'escort';
export const CONTACT_HAIL_ACTION_RECOVER = 'recover';
export const CONTACT_HAIL_ACTION_STEAL = 'steal';
export const CONTACT_HAIL_ACTION_ABANDON = 'abandon';
export const CONTACT_HAIL_ACTION_ASSIST = 'assist';
const CERES_ACTIVITY_SECTOR_ID = 'sector_ceres_belt';
const CERES_TENDER_SLOT_ID = 'ceres_refinery_tender';
const CERES_SEAM_MINER_SLOT_ID = 'ceres_seam_miner';
const CERES_RICH_SEAM_OBJECT_SLOT_ID = 'ceres_seam_ore_clast';
const CERES_TENDER_SERVICE_INCIDENT_SCHEMA = 'spaceface.ceresTenderServiceIncident.v1';
const CERES_TENDER_SERVICE_ACTIVE_STATES = new Set(['impair', 'approach', 'holding', 'repair']);
const CERES_REFINERY_HAULER_SLOT_ID = 'ceres_refinery_hauler';
const CERES_MINER_HAULER_HANDOFF_SCHEMA = 'spaceface.ceresMinerHaulerHandoff.v1';
const CERES_DISABLED_HAULER_INCIDENT_SCHEMA = 'spaceface.ceresDisabledHaulerRecovery.v1';
const CERES_DISABLED_HAULER_ACTIVE_STATES = new Set([
  'impair', 'distress', 'player_recovery', 'responder_approach', 'responder_repair',
]);

const TRADER_ROLES = new Set(['hauler', 'courier', 'miner', 'smuggler', 'express', 'trader']);
// Working traffic that can answer with living-chain / job phase without being a freighter or patrol.
const WORK_ROLES = new Set(['miner', 'salvor', 'tender', 'surveyor', 'ore_carrier', 'rescue']);
const HEAVE_TO_ROLES = new Set([
  'hauler',
  'courier',
  'miner',
  'smuggler',
  'express',
  'trader',
  'surveyor',
  'salvor',
  'tender',
  'ore_carrier',
  'patrol',
  'escort',
]);
const COMMODITY_BY_ID = new Map(COMMODITIES.map((row) => [row.id, row]));
const COMMODITY_LABEL = new Map(COMMODITIES.map((row) => [row.id, row.name]));
const MODULE_BY_ID = new Map(MODULES.map((row) => [row.id, row]));
const SHIP_BY_ID = new Map(SHIPS.map((row) => [row.id, row]));

// Player-language labels for Ceres causal-chain phases and cues (traffic stamps only).
const CAUSAL_PHASE_LABEL = Object.freeze({
  cutting: 'CUTTING SEAM',
  strike: 'RICH STRIKE',
  greed: 'LOADING HOLD',
  haul_out: 'HAULING OUT',
  call: 'CALLING HAULER',
  answer: 'HAULER ANSWERING',
  transfer: 'ORE TRANSFER',
  split: 'SPLITTING ROUTE',
  shadow: 'SHADOWING CONTACT',
  lock: 'SCAN LOCK',
  read: 'READING MANIFEST',
  release: 'RELEASING CONTACT',
  failure: 'SYSTEM FAILURE',
  distress: 'DISTRESS',
  response: 'SERVICE RESPONSE',
  work: 'SERVICE WORK',
  resolve: 'RECOVERY BURN',
  callout: 'SERVICE CALLOUT',
  hard_stand: 'HARD STAND',
  first_light: 'FIRST LIGHT',
  survey_cut: 'SURVEYING WRECK',
  sever: 'SEVERING HULL',
  wrangle: 'WRANGLING MASS',
  stack: 'STACKING SALVAGE',
});
const CAUSAL_CUE_LABEL = Object.freeze({
  blind_cone: 'BLIND CONE',
  home_under_rock: 'HOME UNDER ROCK',
  heavy_burn: 'HEAVY BURN',
  clean_burn: 'CLEAN BURN',
  mouth_open: 'MOUTH OPEN',
  on_the_pin: 'ON THE PIN',
  breaking_the_pattern: 'BREAKING PATTERN',
  spine_wake: 'SPINE WAKE',
  hull_open: 'HULL OPEN',
  picking_the_bones: 'PICKING BONES',
  spilling_the_count: 'SPILLING COUNT',
});

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
  // Living work channel only when a live causal/job stamp is present — otherwise miners stay on
  // the freighter path so ROUTE/MANIFEST (~CR) still reach ore hulls (U4).
  const hasLivingStamp = !!(data.ceresCausalEventId || data.ceresCausalPhase || data.ceresCausalCue
    || data.ceresDisabledHauler
    || data.ceresHandoffStatus || data.jobPhase || (data.jobId && WORK_ROLES.has(role)));
  if (hasLivingStamp && entity && entity.team === 2
    && role !== 'pirate' && role !== 'patrol' && role !== 'escort'
    && (WORK_ROLES.has(role) || TRADER_ROLES.has(role) || ai.passive === true || ai.passive == null)) {
    return { kind: 'worker', parley: null };
  }
  const neutralTrader = entity && entity.team === 2 && ai.passive === true
    && (TRADER_ROLES.has(role) || ai.archetype === 'fleeing_trader')
    && role !== 'pirate' && role !== 'patrol' && role !== 'escort';
  if (neutralTrader) return { kind: 'trader', parley: null };
  return { kind: null, parley: null };
}

function contactHeaveToAvailable(state, entity, kind) {
  const data = entity && entity.data || {};
  const role = String(data.trafficRole || data.role || entity && entity.role || '').toLowerCase();
  if (!HEAVE_TO_ROLES.has(role)) return false;
  if (kind === 'patrol') return true;
  if (data.jobId) return true;
  const rec = traderRecord(state, entity && entity.id);
  return !!rec && rec.heaveTo !== false;
}

function richSeamHelpAvailable(state, entity, kind) {
  if (!state || kind !== 'worker' || !entity) return false;
  const data = entity.data || {};
  const role = String(data.trafficRole || data.role || '').toLowerCase();
  if (role !== 'ore_carrier' || data.activityActorSlotId !== CERES_SEAM_MINER_SLOT_ID
    || data.sectorId !== CERES_ACTIVITY_SECTOR_ID || data.homeSectorId !== CERES_ACTIVITY_SECTOR_ID
    || (state.world && state.world.currentSectorId) !== CERES_ACTIVITY_SECTOR_ID
    || typeof data.worldRecordId !== 'string' || !data.worldRecordId
    || data.jobId !== `job:${data.worldRecordId}`) return false;
  const entities = state.entities && typeof state.entities.values === 'function'
    ? state.entities.values()
    : Array.isArray(state.entityList) ? state.entityList : [];
  for (const candidate of entities) {
    const opportunity = candidate && candidate.type === 'asteroid'
      ? richSeamOpportunityForEntity(state, candidate)
      : null;
    const candidateData = candidate && candidate.data || {};
    if (candidateData.activityObjectSlotId !== CERES_RICH_SEAM_OBJECT_SLOT_ID
      || candidateData.sectorId !== CERES_ACTIVITY_SECTOR_ID
      || candidateData.homeSectorId !== CERES_ACTIVITY_SECTOR_ID
      || opportunity && opportunity.sectorId !== CERES_ACTIVITY_SECTOR_ID) continue;
    if (opportunity && opportunity.state === 'open' && !opportunity.reservationId) return true;
  }
  return false;
}

function canonicalDisabledHaulerManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)
    || typeof manifest.manifestId !== 'string' || !manifest.manifestId
    || typeof manifest.freighterKey !== 'string' || !manifest.freighterKey
    || manifest.role !== 'hauler'
    || typeof manifest.lotId !== 'string' || !manifest.lotId
    || !Number.isSafeInteger(manifest.totalQty) || manifest.totalQty <= 0
    || !Array.isArray(manifest.lines) || manifest.lines.length === 0) return null;
  const lines = [];
  let totalQty = 0;
  for (const line of manifest.lines) {
    if (!line || typeof line.commodityId !== 'string' || !/^[a-z][a-z0-9_.-]*$/.test(line.commodityId)
      || !Number.isSafeInteger(line.qty) || line.qty <= 0) return null;
    totalQty += line.qty;
    if (!Number.isSafeInteger(totalQty)) return null;
    lines.push({ commodityId: line.commodityId, qty: line.qty });
  }
  if (totalQty !== manifest.totalQty) return null;
  const source = manifest.lotSource;
  const custody = manifest.custody;
  if (!source || typeof source !== 'object' || Array.isArray(source)
    || typeof source.rootLotId !== 'string' || !source.rootLotId
    || typeof source.handoffId !== 'string' || !source.handoffId
    || !Number.isSafeInteger(source.transferSeq) || source.transferSeq <= 0
    || !custody || typeof custody !== 'object' || Array.isArray(custody)
    || custody.holderKind !== 'traffic'
    || typeof custody.holderId !== 'string' || !custody.holderId
    || custody.acquiredBy !== 'traffic:ceresMinerHaulerHandoff'
    || typeof custody.handoffId !== 'string' || !custody.handoffId
    || !Number.isSafeInteger(custody.transferSeq) || custody.transferSeq <= 0
    || typeof custody.rootLotId !== 'string' || !custody.rootLotId) return null;
  return {
    manifestId: manifest.manifestId,
    freighterKey: manifest.freighterKey,
    role: manifest.role,
    totalQty: manifest.totalQty,
    lines,
    lotId: manifest.lotId,
    lotSource: {
      rootLotId: source.rootLotId,
      handoffId: source.handoffId,
      transferSeq: source.transferSeq,
    },
    custody: {
      holderKind: custody.holderKind,
      holderId: custody.holderId,
      acquiredBy: custody.acquiredBy,
      handoffId: custody.handoffId,
      transferSeq: custody.transferSeq,
      rootLotId: custody.rootLotId,
    },
  };
}

function sameDisabledHaulerManifest(left, right) {
  const a = canonicalDisabledHaulerManifest(left);
  const b = canonicalDisabledHaulerManifest(right);
  return !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
}

/** One fail-closed identity check shared by traffic actions and every recovery readout. */
export function ceresDisabledHaulerManifestTruth(state, entity, incident = null, recordManifest = null) {
  const active = incident || state && state.traffic && state.traffic.ceresDisabledHaulerIncident;
  const data = entity && entity.data || {};
  const manifest = data.cargoManifest;
  const handoff = state && state.traffic && state.traffic.ceresMinerHaulerHandoff;
  if (!active || active.schema !== CERES_DISABLED_HAULER_INCIDENT_SCHEMA
    || !entity || entity.alive === false || entity.type !== 'ship'
    || data.activityActorSlotId !== CERES_REFINERY_HAULER_SLOT_ID
    || data.worldRecordId !== active.haulerWorldRecordId
    || data.jobId !== `job:${active.haulerWorldRecordId}`
    || !handoff || handoff.schema !== CERES_MINER_HAULER_HANDOFF_SCHEMA
    || handoff.state !== 'in_transit'
    || handoff.handoffId !== active.handoffId
    || handoff.haulerWorldRecordId !== active.haulerWorldRecordId
    || handoff.rootLotId !== active.rootLotId
    || manifest && manifest.manifestId !== active.manifestId
    || !sameDisabledHaulerManifest(active.manifest, manifest)
    || recordManifest != null && !sameDisabledHaulerManifest(recordManifest, manifest)) return null;
  const canonical = canonicalDisabledHaulerManifest(manifest);
  const outstandingQty = handoff.transferredQty - handoff.deliveredQty;
  if (!canonical || canonical.manifestId !== active.manifestId
    || canonical.freighterKey !== active.haulerWorldRecordId
    || canonical.totalQty !== outstandingQty
    || canonical.lotSource.rootLotId !== active.rootLotId
    || canonical.lotSource.handoffId !== active.handoffId
    || canonical.lotSource.transferSeq !== handoff.transferSeq
    || canonical.custody.holderId !== active.haulerWorldRecordId
    || canonical.custody.handoffId !== active.handoffId
    || canonical.custody.transferSeq !== handoff.transferSeq
    || canonical.custody.rootLotId !== active.rootLotId) return null;
  return { incident: active, handoff, manifest, canonical };
}

export function ceresDisabledHaulerTruth(state, entity) {
  const incident = state && state.traffic && state.traffic.ceresDisabledHaulerIncident;
  const data = entity && entity.data || {};
  const annotation = data.ceresDisabledHauler;
  if (!incident || incident.schema !== CERES_DISABLED_HAULER_INCIDENT_SCHEMA
    || !CERES_DISABLED_HAULER_ACTIVE_STATES.has(incident.state)
    || !state.world || state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID
    || !entity || entity.alive === false || entity.type !== 'ship' || entity.team !== 2
    || data.activityActorSlotId !== CERES_REFINERY_HAULER_SLOT_ID
    || data.worldRecordId !== incident.haulerWorldRecordId
    || data.jobId !== `job:${incident.haulerWorldRecordId}`
    || !annotation || annotation.incidentId !== incident.incidentId
    || annotation.manifestId !== incident.manifestId
    || !ceresDisabledHaulerManifestTruth(state, entity, incident)
    || !combatDriveDisabled(state, entity)) return null;
  return Object.freeze({
    incidentId: incident.incidentId,
    state: incident.state,
    choice: incident.choice || null,
    manifestId: incident.manifestId,
    responseAtSimT: incident.responseAtSimT,
  });
}

function callsign(entity) {
  const data = entity && entity.data || {};
  return String(data.callsign || data.trafficLabel || data.scanLabel || data.name || 'UNIDENTIFIED VESSEL')
    .replace(/\s+/g, ' ').trim().toUpperCase();
}

function priorityCourierItinerary(state, entity) {
  const itinerary = entity && entity.data && entity.data.itinerary;
  if (!isPriorityCourierItinerary(itinerary)) return null;
  if ((state && state.world && state.world.currentSectorId) !== itinerary.sectorId) return null;
  return itinerary;
}

function priorityCourierState(state, entity, itinerary = priorityCourierItinerary(state, entity)) {
  if (!itinerary) return null;
  const stamped = String(entity && entity.data && entity.data.priorityCourierState || '').toUpperCase();
  if (stamped === 'BERTH' || stamped === 'ON_TIME' || stamped === 'LATE' || stamped === 'INTERRUPTED') {
    return stamped;
  }
  const escort = itinerary.escort && typeof itinerary.escort === 'object' ? itinerary.escort : null;
  const creditS = escort && Number.isFinite(escort.creditS) ? Math.max(0, escort.creditS) : 0;
  const now = Number(state && state.simTime) || 0;
  if (now > itinerary.dueAt + creditS) return 'LATE';
  return now < itinerary.departureAt ? 'BERTH' : 'ON_TIME';
}

function priorityCourierEscortAvailable(state, entity, itinerary = priorityCourierItinerary(state, entity)) {
  if (!itinerary) return false;
  const escort = itinerary.escort && typeof itinerary.escort === 'object' ? itinerary.escort : {};
  if (escort.usedLegSeq === itinerary.legSeq || escort.active === true) return false;
  const status = priorityCourierState(state, entity, itinerary);
  return status === 'LATE' || status === 'INTERRUPTED';
}

// Traffic remains the authority that starts and completes assistance. This mirrors its compact
// identity checks so Hail never advertises a stale rematerialized hull as the civic liner.
function passengerLinerItinerary(state, entity) {
  const data = entity && entity.data || {};
  const itinerary = data.itinerary;
  if (!isPassengerLinerItinerary(itinerary)
    || data.trafficRole !== 'express'
    || data.passengerLinerService !== PASSENGER_LINER_SERVICE.id
    || typeof data.worldRecordId !== 'string' || !data.worldRecordId
    || itinerary.worldRecordId !== data.worldRecordId
    || state && state.world && state.world.currentSectorId !== PASSENGER_LINER_SERVICE.sectorId) return null;
  const record = state ? traderRecord(state, entity.id) : null;
  if (state && (!record || record.role !== 'express' || record.passengerLinerService !== PASSENGER_LINER_SERVICE.id)) {
    return null;
  }
  const custody = itinerary.custody || {};
  const root = `${data.worldRecordId}:${itinerary.legSeq}`;
  if (custody.passengerId !== `passenger:${root}` || custody.ticketId !== `ticket:${root}`
    || custody.receiptId !== `passenger-liner-receipt:${root}`
    || custody.originStationId !== itinerary.originStationId
    || custody.destinationStationId !== itinerary.destinationStationId) return null;
  const atOrigin = itinerary.state === 'BOARDING' || itinerary.state === 'DELAYED';
  const aboard = itinerary.state === 'EN_ROUTE' || itinerary.state === 'DIVERTING';
  if ((atOrigin && custody.state !== 'AT_ORIGIN') || (aboard && custody.state !== 'ONBOARD')) return null;
  return atOrigin || aboard ? itinerary : null;
}

function passengerLinerAssistAvailable(state, entity, itinerary = passengerLinerItinerary(state, entity)) {
  if (!itinerary || itinerary.state !== 'BOARDING' || itinerary.custody.state !== 'AT_ORIGIN') return false;
  const assist = itinerary.assist && typeof itinerary.assist === 'object' ? itinerary.assist : {};
  return assist.active !== true && assist.usedLegSeq !== itinerary.legSeq;
}

function passengerLinerStatusText(state, entity, itinerary = passengerLinerItinerary(state, entity)) {
  if (!itinerary) return null;
  const stateLabel = String(itinerary.state || 'SERVICE').replace(/_/g, ' ');
  return `STATUS · HELIOS CIVIC LINER · ${stateLabel}`;
}

function playerHasFittedCargoScanner(state) {
  const player = state && state.player;
  if (!player || !Array.isArray(player.ownedShips)) return false;
  const activeShipIndex = Number.isInteger(player.activeShipIndex) ? player.activeShipIndex : 0;
  const owned = player.ownedShips[activeShipIndex];
  const shipDef = owned && SHIP_BY_ID.get(owned.defId);
  if (!shipDef || !Array.isArray(owned.fittings)) return false;
  const slots = buildSlotList(shipDef);
  return slots.some((slot, index) => {
    const moduleDef = MODULE_BY_ID.get(owned.fittings[index]);
    return moduleDef && moduleDef.mods && moduleDef.mods.revealCargo === true && fits(slot, moduleDef);
  });
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
    heaveToAvailable: contactHeaveToAvailable(state, target, classification.kind),
    richSeamHelpAvailable: richSeamHelpAvailable(state, target, classification.kind),
    priorityCourierItinerary: priorityCourierItinerary(state, target),
    priorityCourierEscortAvailable: priorityCourierEscortAvailable(state, target),
    passengerLinerItinerary: passengerLinerItinerary(state, target),
    passengerLinerAssistAvailable: passengerLinerAssistAvailable(state, target),
    manifestAvailable: classification.kind === 'trader'
      && playerHasFittedCargoScanner(state)
      && !!traderManifestForTarget(state, target),
    disabledHauler: ceresDisabledHaulerTruth(state, target),
  };
}

export function createContactHailOffer(state, availability, requestId, expiresAt) {
  if (!availability || !availability.enabled || availability.kind === 'toll') return null;
  const name = callsign(availability.entity);
  if (availability.kind === 'patrol') {
    const actions = [{ id: 'status', label: 'STATUS' }, { id: 'identify', label: 'IDENTIFY' }];
    if (availability.heaveToAvailable) actions.push({ id: CONTACT_HAIL_ACTION_HEAVE_TO, label: 'HEAVE TO' });
    return {
      requestId, targetId: availability.targetId, kind: 'patrol', expiresAt,
      lines: [`${name} · LAWFUL PATROL`, 'CHANNEL OPEN.'],
      actions,
    };
  }
  if (availability.kind === 'worker') {
    if (availability.disabledHauler) {
      return {
        requestId, targetId: availability.targetId, kind: 'worker', expiresAt,
        lines: [`${name} · DISABLED ORE HAULER`, 'DISTRESS · DRIVE DEAD · MANIFEST ABOARD.'],
        actions: [
          { id: CONTACT_HAIL_ACTION_RECOVER, label: 'RECOVER' },
          { id: CONTACT_HAIL_ACTION_STEAL, label: 'STEAL' },
          { id: CONTACT_HAIL_ACTION_ABANDON, label: 'ABANDON' },
        ],
      };
    }
    const salvorSource = salvorSourceTruth(state, availability.entity);
    const actions = [{ id: 'status', label: 'STATUS' }];
    // A source-backed cutter uses the existing, read-only manifest response rather than a new
    // action type. The compact scanner presenter still receives at most three choices.
    actions.push(salvorSource ? { id: 'manifest', label: 'MANIFEST' } : { id: 'identify', label: 'IDENTIFY' });
    if (availability.richSeamHelpAvailable) actions.push({ id: CONTACT_HAIL_ACTION_HELP, label: 'HELP' });
    if (availability.heaveToAvailable && actions.length < 3) {
      actions.push({ id: CONTACT_HAIL_ACTION_HEAVE_TO, label: 'HEAVE TO' });
    }
    return {
      requestId, targetId: availability.targetId, kind: 'worker', expiresAt,
      lines: [`${name} · WORKING TRAFFIC`, 'CHANNEL OPEN.'],
      actions,
    };
  }
  const priorityItinerary = availability.priorityCourierItinerary;
  const passengerItinerary = availability.passengerLinerItinerary;
  if (passengerItinerary) {
    const actions = [{ id: 'status', label: 'STATUS' }, { id: 'route', label: 'ROUTE' }];
    if (availability.passengerLinerAssistAvailable) {
      actions.push({ id: CONTACT_HAIL_ACTION_ASSIST, label: 'ASSIST BOARDING' });
    }
    return {
      requestId, targetId: availability.targetId, kind: 'trader', expiresAt,
      lines: [`${name} · HELIOS CIVIC LINER`, 'PASSENGER SERVICE · CHANNEL OPEN.'],
      actions,
    };
  }
  if (priorityItinerary) {
    // Scanner/UI deliberately ships three compact choices. A fitted cargo scanner may add manifest
    // inspection in the normal state; the time-sensitive recovery action takes that third slot.
    const actions = [{ id: 'status', label: 'STATUS' }, { id: 'route', label: 'ROUTE' }];
    if (availability.priorityCourierEscortAvailable) {
      actions.push({ id: CONTACT_HAIL_ACTION_ESCORT, label: 'ESCORT' });
    } else if (availability.manifestAvailable) {
      actions.push({ id: 'manifest', label: 'MANIFEST' });
    }
    return {
      requestId, targetId: availability.targetId, kind: 'trader', expiresAt,
      lines: [`${name} · PRIORITY COURIER`, 'CHANNEL OPEN.'],
      actions,
    };
  }
  const actions = [{ id: 'route', label: 'ROUTE' }];
  if (availability.manifestAvailable) actions.push({ id: 'manifest', label: 'MANIFEST' });
  if (availability.heaveToAvailable) actions.push({ id: CONTACT_HAIL_ACTION_HEAVE_TO, label: 'HEAVE TO' });
  return {
    requestId, targetId: availability.targetId, kind: 'trader', expiresAt,
    lines: [`${name} · CIVILIAN FREIGHT`, 'CHANNEL OPEN.'],
    actions,
  };
}

function traderRecord(state, targetId) {
  return (state && state.traffic && state.traffic.freighters || [])
    .find((row) => row && row.id === targetId) || null;
}

function validDeclaredManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.lines) || !manifest.lines.length) {
    return null;
  }
  let totalQty = 0;
  for (const row of manifest.lines) {
    const commodityId = row && (row.commodityId || row.id);
    if (typeof commodityId !== 'string' || !commodityId
      || typeof row.qty !== 'number' || !Number.isSafeInteger(row.qty) || row.qty <= 0) return null;
    totalQty += row.qty;
    if (!Number.isSafeInteger(totalQty)) return null;
  }
  if (Object.hasOwn(manifest, 'totalQty')
    && (typeof manifest.totalQty !== 'number'
      || !Number.isSafeInteger(manifest.totalQty)
      || manifest.totalQty !== totalQty)) return null;
  return manifest;
}

function traderManifestForTarget(state, target) {
  const entityManifest = validDeclaredManifest(target && target.data && target.data.cargoManifest);
  if (entityManifest) return entityManifest;
  return validDeclaredManifest(traderRecord(state, target && target.id)?.manifest);
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

/**
 * Estimate declared cargo value from commodity basePrice (equilibrium catalog).
 * Pure read — does not touch economy credits or station markets.
 * Returns { totalCredits, totalQty, lineCount } or null when empty.
 */
export function estimateManifestBaseValue(manifest) {
  const lines = manifest && Array.isArray(manifest.lines) ? manifest.lines : [];
  let totalCredits = 0;
  let totalQty = 0;
  let lineCount = 0;
  for (const row of lines) {
    if (!row) continue;
    const qty = Math.floor(Number(row.qty) || 0);
    if (qty <= 0) continue;
    const id = row.commodityId || row.id;
    const def = COMMODITY_BY_ID.get(id);
    const unit = def && Number.isFinite(def.basePrice) ? def.basePrice : 0;
    totalCredits += unit * qty;
    totalQty += qty;
    lineCount += 1;
  }
  if (lineCount === 0) return null;
  return Object.freeze({
    totalCredits: Math.round(totalCredits),
    totalQty,
    lineCount,
  });
}

function manifestText(state, target, manifestOverride = undefined) {
  const record = traderRecord(state, target.id);
  const manifest = manifestOverride === undefined
    ? target.data && target.data.cargoManifest || record && record.manifest
    : manifestOverride;
  const lines = (manifest && Array.isArray(manifest.lines) ? manifest.lines : [])
    .filter((row) => row && Math.floor(Number(row.qty) || 0) > 0);
  if (!lines.length) return 'MANIFEST · NO DECLARED CARGO';
  // Rank by catalog value so the two named lines match the ~CR story.
  const ranked = lines.map((row) => {
    const qty = Math.floor(Number(row.qty) || 0);
    const id = row.commodityId || row.id;
    const def = COMMODITY_BY_ID.get(id);
    const unit = def && Number.isFinite(def.basePrice) ? def.basePrice : 0;
    return { qty, id, value: unit * qty };
  }).sort((a, b) => b.value - a.value || String(a.id).localeCompare(String(b.id)));
  const shown = ranked.slice(0, 2);
  const cargo = shown.map((row) => `${row.qty} ${commodityLabel(row.id)}`);
  const more = ranked.length - shown.length;
  const moreBit = more > 0 ? ` · +${more} MORE` : '';
  const value = estimateManifestBaseValue(manifest);
  const valueBit = value && value.totalCredits > 0
    ? ` · ~${value.totalCredits.toLocaleString('en-US')} CR`
    : '';
  return `MANIFEST · ${cargo.join(' · ')}${moreBit}${valueBit}`;
}

function liveEntityForWorldRecord(state, worldRecordId) {
  if (!state || typeof worldRecordId !== 'string' || !worldRecordId) return null;
  const entities = state.entities && typeof state.entities.values === 'function'
    ? state.entities.values()
    : state.entityList || [];
  let found = null;
  for (const entity of entities) {
    if (!entity || entity.alive === false || !entity.data || entity.data.worldRecordId !== worldRecordId) continue;
    // Ambiguous live identity is not service truth. Traffic's controller fails closed on this same
    // condition, so readout must not choose one candidate merely because it was encountered first.
    if (found && found !== entity) return null;
    found = entity;
  }
  return found;
}

function combatDriveDisabled(state, entity) {
  const runtime = state && state.combat && state.combat.entities
    && state.combat.entities[String(entity && entity.id)];
  const drive = runtime && runtime.subsystems && runtime.subsystems.subsystem_drive;
  return !!(drive && (drive.destroyed === true || drive.effectiveDisabled === true));
}

// The tender call is real only when the compact traffic incident agrees with the combat-owned drive
// state on the one live miner. Causal stamps are presentation candidates, never proof; this keeps a
// stale stamp after Continue from claiming an inbound tender that no longer exists.
function ceresTenderServiceTruth(state, target) {
  const incident = state && state.traffic && state.traffic.ceresTenderServiceIncident;
  const data = target && target.data || {};
  if (!incident || incident.schema !== CERES_TENDER_SERVICE_INCIDENT_SCHEMA
    || !state.world || state.world.currentSectorId !== CERES_ACTIVITY_SECTOR_ID
    || !CERES_TENDER_SERVICE_ACTIVE_STATES.has(incident.state)
    || typeof incident.minerWorldRecordId !== 'string' || !incident.minerWorldRecordId
    || typeof incident.tenderWorldRecordId !== 'string' || !incident.tenderWorldRecordId
    || incident.minerWorldRecordId === incident.tenderWorldRecordId) return null;
  const isMiner = data.activityActorSlotId === CERES_SEAM_MINER_SLOT_ID
    && data.worldRecordId === incident.minerWorldRecordId
    && data.jobId === `job:${incident.minerWorldRecordId}`
    && data.ceresActivityCast === true
    && data.ceresActivityJobOwned === true;
  const isTender = data.activityActorSlotId === CERES_TENDER_SLOT_ID
    && data.worldRecordId === incident.tenderWorldRecordId
    && data.jobId === `job:${incident.tenderWorldRecordId}`
    && data.durable === true
    && !!(data.factionPresence && data.factionPresence.yardTender === true);
  if (!isMiner && !isTender) return null;
  const miner = isMiner ? target : liveEntityForWorldRecord(state, incident.minerWorldRecordId);
  if (!miner || miner.alive === false || !combatDriveDisabled(state, miner)) return null;
  return {
    role: isMiner ? 'miner' : 'tender',
    holding: incident.state === 'holding' || incident.state === 'repair',
  };
}

function tenderServiceWorkStatus(truth, depth) {
  if (!truth) return null;
  if (depth === 'lock') return truth.holding ? 'WORK · SERVICE HOLD' : 'WORK · TENDER INBOUND';
  if (truth.role === 'miner') {
    return truth.holding
      ? 'WORK · SERVICE HOLD · DRIVE REPAIR IN PROGRESS'
      : 'WORK · DRIVE DISABLED · TENDER INBOUND';
  }
  return truth.holding
    ? 'WORK · SERVICE HOLD · DRIVE REPAIR IN PROGRESS'
    : 'WORK · TENDER INBOUND · MINER DRIVE DISABLED';
}

function tenderServiceHailStatus(truth) {
  if (!truth) return null;
  if (truth.role === 'miner') {
    return truth.holding
      ? 'STATUS · SERVICE HOLD · DRIVE REPAIR IN PROGRESS'
      : 'STATUS · DRIVE DISABLED · TENDER INBOUND';
  }
  return truth.holding
    ? 'STATUS · SERVICE HOLD · DRIVE REPAIR IN PROGRESS'
    : 'STATUS · TENDER INBOUND · MINER DRIVE DISABLED';
}

/**
 * Human-readable living-work status from Ceres causal stamps / job phase.
 * Pure; safe for hail and target panel.
 * @param {object} entity
 * @param {{ depth?: 'lock'|'full', state?: object }} [opts] lock = phase-only (always-on panel); full = phase+cue
 */
export function livingWorkStatusText(entity, opts = {}) {
  if (!entity) return null;
  const data = entity.data || {};
  const passengerStatus = passengerLinerStatusText(opts.state || null, entity);
  if (passengerStatus) return passengerStatus.replace(/^STATUS · /, 'SERVICE · ');
  const salvorSource = salvorSourceTruth(opts.state || null, entity);
  if (salvorSource && salvorSource.state === 'aboard') return 'WORK · SALVAGE ABOARD · FORGE';
  if (salvorSource && salvorSource.state === 'disputed') return 'WORK · SALVAGE DISPUTED';
  if (salvorSource && salvorSource.state === 'cutting') return 'WORK · CUTTING';
  const serviceStatus = tenderServiceWorkStatus(
    ceresTenderServiceTruth(opts.state || null, entity),
    opts.depth || 'full',
  );
  if (serviceStatus) return serviceStatus;
  const disabledHauler = ceresDisabledHaulerTruth(opts.state || null, entity);
  if (disabledHauler) {
    return opts.depth === 'lock'
      ? 'DISTRESS · DRIVE DISABLED'
      : disabledHauler.choice === CONTACT_HAIL_ACTION_RECOVER
        ? 'DISTRESS · PLAYER RECOVERY CLAIMED'
        : disabledHauler.state === 'responder_approach' || disabledHauler.state === 'responder_repair'
          ? 'DISTRESS · TENDER RESPONDING'
          : 'DISTRESS · RECOVER · STEAL · ABANDON';
  }
  // targetIntelReadout's existing call has no game state. A bare timer stamp must not claim a
  // service outcome there; Hail passes state and can present the combat-backed result above.
  if (data.ceresCausalEventId === 'ev_tender_services_miner') return null;
  const handoffStatus = typeof data.ceresHandoffStatus === 'string' && data.ceresHandoffStatus.trim();
  if (handoffStatus) return `WORK · ${handoffStatus}`;
  // Prefer explicit causal stamps; do not treat generic data.phase as work (false WORK risk).
  const phase = data.ceresCausalPhase || data.jobPhase || null;
  const cue = data.ceresCausalCue || null;
  const eventId = data.ceresCausalEventId || null;
  if (!phase && !cue && !eventId) return null;
  const phaseLabel = phase
    ? (CAUSAL_PHASE_LABEL[phase] || String(phase).replace(/_/g, ' ').toUpperCase())
    : null;
  const depth = opts.depth || 'full';
  if (depth === 'lock') {
    if (phaseLabel) return `WORK · ${phaseLabel}`;
    return eventId ? 'WORK · ACTIVE' : null;
  }
  const cueLabel = cue
    ? (CAUSAL_CUE_LABEL[cue] || String(cue).replace(/_/g, ' ').toUpperCase())
    : null;
  if (phaseLabel && cueLabel) return `WORK · ${phaseLabel} · ${cueLabel}`;
  if (phaseLabel) return `WORK · ${phaseLabel}`;
  if (cueLabel) return `WORK · ${cueLabel}`;
  return 'WORK · ACTIVE';
}

// Short tactical means for hail STATUS (opt-in goes deeper than free panel phase-only).
const CAUSAL_MEANS = Object.freeze({
  blind_cone: 'SENSORS HALF-BLIND · DO NOT ENTER CUT ARC',
  home_under_rock: 'HAULING UNDER COVER · HOLD OFF BURN',
  heavy_burn: 'HARD ACCEL · WIDE WAKE',
  clean_burn: 'CLEAN TRANSIT BURN',
  mouth_open: 'HOLD OPEN · TRANSFER WINDOW',
  on_the_pin: 'LAW LOCK · FLY CLEAN',
  breaking_the_pattern: 'DRIVE FAILING · SOFT TARGET',
  spine_wake: 'TENDER INBOUND',
  hull_open: 'HULL OPEN · SERVICE IN PROGRESS',
  picking_the_bones: 'SALVAGE CUT HOT · STAND OFF',
  spilling_the_count: 'STACKING LOOT · HOLD FAT',
});

function workerStatusText(target, state = null) {
  const data = target && target.data || {};
  const salvorSource = salvorSourceTruth(state, target);
  if (salvorSource && salvorSource.state === 'aboard') return 'STATUS · SALVAGE ABOARD · FORGE INBOUND';
  if (salvorSource && salvorSource.state === 'disputed') return 'STATUS · SALVAGE DISPUTED · WRECK STRIPPED';
  if (salvorSource && salvorSource.state === 'cutting') return 'STATUS · CUTTING · DEAD FREIGHTER DRIFT';
  const serviceStatus = tenderServiceHailStatus(ceresTenderServiceTruth(state, target));
  if (serviceStatus) return serviceStatus;
  const disabledHauler = ceresDisabledHaulerTruth(state, target);
  if (disabledHauler) {
    if (disabledHauler.choice === CONTACT_HAIL_ACTION_RECOVER) return 'STATUS · PLAYER RECOVERY CLAIMED · MASSLINE READY';
    if (disabledHauler.state === 'responder_approach') return 'STATUS · DRIVE DISABLED · TENDER INBOUND';
    if (disabledHauler.state === 'responder_repair') return 'STATUS · SERVICE HOLD · DRIVE REPAIR IN PROGRESS';
    return 'STATUS · DRIVE DISABLED · MANIFEST ABOARD';
  }
  if (data.ceresCausalEventId === 'ev_tender_services_miner') {
    const role = String(data.trafficRole || data.role || 'WORKER').replace(/_/g, ' ').toUpperCase();
    return `STATUS · ${role} ON TASK`;
  }
  const handoffStatus = typeof data.ceresHandoffStatus === 'string' && data.ceresHandoffStatus.trim();
  if (handoffStatus) return `STATUS · ${handoffStatus}`;
  if (state && richSeamHelpAvailable(state, target, 'worker')) {
    const entities = state.entities && typeof state.entities.values === 'function'
      ? state.entities.values() : [];
    const richOpportunity = [...entities]
      .map((entity) => {
        const data = entity && entity.data || {};
        if (!entity || entity.type !== 'asteroid' || data.activityObjectSlotId !== CERES_RICH_SEAM_OBJECT_SLOT_ID
          || data.sectorId !== CERES_ACTIVITY_SECTOR_ID || data.homeSectorId !== CERES_ACTIVITY_SECTOR_ID) return null;
        return richSeamOpportunityForEntity(state, entity);
      })
      .find((opportunity) => opportunity && opportunity.sectorId === CERES_ACTIVITY_SECTOR_ID
        && opportunity.state === 'open' && !opportunity.reservationId);
    return `STATUS · RICH SEAM · +${richOpportunity ? richOpportunity.bonusU : 8}u · HOT CUT · HOLD OFF`;
  }
  const phase = data.ceresCausalPhase || data.jobPhase || null;
  const cue = data.ceresCausalCue || null;
  const phaseLabel = phase
    ? (CAUSAL_PHASE_LABEL[phase] || String(phase).replace(/_/g, ' ').toUpperCase())
    : null;
  const means = cue ? CAUSAL_MEANS[cue] : null;
  if (phaseLabel && means) return `STATUS · ${phaseLabel} · ${means}`;
  if (means) return `STATUS · ${means}`;
  if (phaseLabel) return `STATUS · ${phaseLabel}`;
  const role = String(data.trafficRole || data.role || 'WORKER').replace(/_/g, ' ').toUpperCase();
  return `STATUS · ${role} ON TASK`;
}

// This intentionally reads only traffic stamps plus the salvage-owned ledger.  A generic salvor
// never receives the Vesta callout merely because it happens to have jobPhase='work'.
function salvorSourceTruth(state, target) {
  const data = target && target.data || {};
  const role = String(data.trafficRole || data.role || '').toLowerCase();
  if (role !== 'salvor') return null;
  const manifest = data.cargoManifest && typeof data.cargoManifest === 'object' ? data.cargoManifest : null;
  const manifestSource = manifest && typeof manifest.salvageSource === 'string' ? manifest.salvageSource : null;
  const sourceKey = manifestSource || (typeof data.salvageSource === 'string' ? data.salvageSource : null);
  if (!sourceKey) return null;
  const totalQty = manifest && Number.isSafeInteger(manifest.totalQty) ? manifest.totalQty : 0;
  if (manifestSource && totalQty > 0) return { state: 'aboard', sourceKey };
  const sources = state && state.salvage && state.salvage.sources;
  const record = sources && typeof sources === 'object' && !Array.isArray(sources) ? sources[sourceKey] : null;
  const worldRecordId = typeof data.worldRecordId === 'string' ? data.worldRecordId : null;
  if (record && record.disputedBy && (!worldRecordId || String(record.disputedBy) !== worldRecordId)) {
    return { state: 'disputed', sourceKey };
  }
  const cuttingStamp = data.jobPhase === 'work' && typeof data.salvageSource === 'string';
  if (!cuttingStamp) return null;
  // targetPanel calls this without state; its live job/source stamps are still direct evidence of
  // a cutter at work. Hail has state and additionally requires a live matching ledger claim.
  if (!state) return { state: 'cutting', sourceKey };
  const remaining = record && Object.values(record.remainingPool || {})
    .reduce((sum, qty) => sum + Math.max(0, Math.floor(Number(qty) || 0)), 0);
  if (record && record.extracted !== true && remaining > 0 && record.claimId === worldRecordId) {
    return { state: 'cutting', sourceKey };
  }
  return null;
}

function workerIdentifyText(target) {
  const data = target && target.data || {};
  const role = String(data.trafficRole || data.role || 'WORKER').replace(/_/g, ' ').toUpperCase();
  const eventId = data.ceresCausalEventId
    ? String(data.ceresCausalEventId).replace(/^ev_/, '').replace(/_/g, ' ').toUpperCase()
    : null;
  const eventBit = eventId ? ` · CHAIN ${eventId}` : '';
  return `${callsign(target)} · ${role}${eventBit}`;
}

function routeText(state, target) {
  const record = traderRecord(state, target.id);
  const passengerItinerary = passengerLinerItinerary(state, target);
  if (passengerItinerary) {
    if (passengerItinerary.state === 'DIVERTING') {
      const returnStationId = typeof passengerItinerary.diversion?.returnStationId === 'string'
        && passengerItinerary.diversion.returnStationId.trim()
        ? passengerItinerary.diversion.returnStationId
        : (record && record.targetId) || passengerItinerary.originStationId;
      return `ROUTE · RETURNING TO ${stationLabel(state, returnStationId)}`;
    }
    const destinationId = passengerItinerary.destinationStationId || record && record.targetId;
    return `ROUTE · ${stationLabel(state, destinationId)}`;
  }
  const itinerary = target.data && target.data.itinerary;
  const destinationId = itinerary && itinerary.destinationStationId || record && record.targetId;
  return `ROUTE · ${stationLabel(state, destinationId)}`;
}

function priorityCourierStatusText(state, target) {
  const itinerary = priorityCourierItinerary(state, target);
  if (!itinerary) return null;
  const status = priorityCourierState(state, target, itinerary);
  const escort = itinerary.escort && typeof itinerary.escort === 'object' ? itinerary.escort : {};
  if (status === 'INTERRUPTED') return 'STATUS · PRIORITY COURIER INTERRUPTED · ESCORT REQUEST OPEN';
  if (status === 'LATE') return 'STATUS · PRIORITY COURIER LATE · ESCORT REQUEST OPEN';
  if (status === 'BERTH') return 'STATUS · PRIORITY COURIER BERTHED · SCHEDULED DEPARTURE';
  if (escort.usedLegSeq === itinerary.legSeq) return 'STATUS · PRIORITY SPRINT · ESCORT CREDIT CONFIRMED';
  return 'STATUS · PRIORITY SPRINT · ON SCHEDULE';
}

export function createContactHailResponse(state, offer, choice, authority = {}) {
  if (!offer || (offer.kind !== 'patrol' && offer.kind !== 'trader' && offer.kind !== 'worker')) {
    return null;
  }
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
  } else if (offer.kind === 'worker' && id === 'status') {
    line = workerStatusText(target, state);
  } else if (offer.kind === 'worker' && id === 'identify') {
    line = workerIdentifyText(target);
  } else if (offer.kind === 'worker' && id === CONTACT_HAIL_ACTION_HELP) {
    const available = richSeamHelpAvailable(state, target, 'worker');
    const entities = state.entities && typeof state.entities.values === 'function'
      ? state.entities.values() : [];
    const opportunity = available
      ? [...entities].map((entity) => {
        const data = entity && entity.data || {};
        if (!entity || entity.type !== 'asteroid' || data.activityObjectSlotId !== CERES_RICH_SEAM_OBJECT_SLOT_ID
          || data.sectorId !== CERES_ACTIVITY_SECTOR_ID || data.homeSectorId !== CERES_ACTIVITY_SECTOR_ID) return null;
        return richSeamOpportunityForEntity(state, entity);
      })
        .find((candidate) => candidate && candidate.sectorId === CERES_ACTIVITY_SECTOR_ID
          && candidate.state === 'open' && !candidate.reservationId)
      : null;
    line = opportunity ? `HELP · RICH SEAM +${opportunity.bonusU}u · MINER TAKING THE HOT CUT` : 'HELP · NO OPEN SEAM';
  } else if (offer.kind === 'worker'
    && [CONTACT_HAIL_ACTION_RECOVER, CONTACT_HAIL_ACTION_STEAL, CONTACT_HAIL_ACTION_ABANDON].includes(id)) {
    const disabled = ceresDisabledHaulerTruth(state, target);
    if (!disabled) line = `${id.toUpperCase()} · RECOVERY WINDOW CLOSED.`;
    else if (id === CONTACT_HAIL_ACTION_RECOVER) line = 'RECOVER · MASSLINE THE HULL TO LAWFUL COVER.';
    else if (id === CONTACT_HAIL_ACTION_STEAL) line = 'STEAL · MANIFEST JETTISON REQUESTED.';
    else line = 'ABANDON · DISTRESS RELAY CLOSED.';
  } else if (offer.kind === 'trader' && id === 'status') {
    line = passengerLinerStatusText(state, target) || priorityCourierStatusText(state, target);
  } else if (offer.kind === 'trader' && id === CONTACT_HAIL_ACTION_ASSIST) {
    line = passengerLinerAssistAvailable(state, target)
      ? 'ASSIST BOARDING · FORM UP AND HOLD THE CIVIC LINER.'
      : 'ASSIST BOARDING · WINDOW CLOSED.';
  } else if (offer.kind === 'trader' && id === CONTACT_HAIL_ACTION_ESCORT) {
    line = priorityCourierEscortAvailable(state, target)
      ? 'ESCORT · FORM UP AND HOLD THE PRIORITY BURN.'
      : 'ESCORT · NO RECOVERY WINDOW OPEN.';
  } else if (offer.kind === 'trader' && id === 'route') {
    line = routeText(state, target);
  } else if (offer.kind === 'trader' && id === 'manifest') {
    const offered = Array.isArray(offer.actions) && offer.actions.some((action) => action && action.id === 'manifest');
    const manifest = traderManifestForTarget(state, target);
    if (offered && playerHasFittedCargoScanner(state) && manifest) {
      line = manifestText(state, target, manifest);
    }
  } else if (offer.kind === 'worker' && id === 'manifest') {
    line = manifestText(state, target);
  } else if (id === CONTACT_HAIL_ACTION_HEAVE_TO) {
    const result = authority.heaveTo || {};
    if (result.granted === true) line = 'HEAVE TO · COMPLYING.';
    else if (result.reason === 'ignored') line = 'HEAVE TO · NO COMPLIANCE.';
    else if (result.reason === 'cooldown') line = 'HEAVE TO · CHANNEL COOLING.';
    else if (result.reason === 'another_target_active') line = 'HEAVE TO · HOLD ALREADY ACTIVE.';
    else line = 'HEAVE TO · UNABLE.';
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
