// Deterministic contact-hail classification and copy.
//
// This module is deliberately read-only. Scanner owns request validation and transient lifetime;
// pirateParley remains the sole authority for toll choices/payment/escalation.
import { COMMODITIES } from './commodities.js';
import { richSeamOpportunityForEntity } from '../systems/fieldDepletion.js';

export const CONTACT_HAIL_RANGE = 5200;
export const CONTACT_HAIL_REQUEST_TTL_S = 8;
export const CONTACT_HAIL_RECEIPT_TTL_S = 4;
export const CONTACT_HAIL_ACTION_HEAVE_TO = 'heave_to';
export const CONTACT_HAIL_ACTION_HELP = 'help';
const CERES_ACTIVITY_SECTOR_ID = 'sector_ceres_belt';
const CERES_SEAM_MINER_SLOT_ID = 'ceres_seam_miner';
const CERES_RICH_SEAM_OBJECT_SLOT_ID = 'ceres_seam_ore_clast';

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
    heaveToAvailable: contactHeaveToAvailable(state, target, classification.kind),
    richSeamHelpAvailable: richSeamHelpAvailable(state, target, classification.kind),
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
    const actions = [{ id: 'status', label: 'STATUS' }, { id: 'identify', label: 'IDENTIFY' }];
    if (availability.richSeamHelpAvailable) actions.push({ id: CONTACT_HAIL_ACTION_HELP, label: 'HELP' });
    if (availability.heaveToAvailable) actions.push({ id: CONTACT_HAIL_ACTION_HEAVE_TO, label: 'HEAVE TO' });
    return {
      requestId, targetId: availability.targetId, kind: 'worker', expiresAt,
      lines: [`${name} · WORKING TRAFFIC`, 'CHANNEL OPEN.'],
      actions,
    };
  }
  const actions = [{ id: 'route', label: 'ROUTE' }, { id: 'manifest', label: 'MANIFEST' }];
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

function manifestText(state, target) {
  const record = traderRecord(state, target.id);
  const manifest = target.data && target.data.cargoManifest || record && record.manifest;
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

/**
 * Human-readable living-work status from Ceres causal stamps / job phase.
 * Pure; safe for hail and target panel.
 * @param {object} entity
 * @param {{ depth?: 'lock'|'full' }} [opts] lock = phase-only (always-on panel); full = phase+cue
 */
export function livingWorkStatusText(entity, opts = {}) {
  if (!entity) return null;
  const data = entity.data || {};
  if (data.ceresCausalDisabled === true) {
    return opts.depth === 'lock'
      ? 'WORK · DRIVE DISABLED'
      : 'WORK · DRIVE DISABLED · RECOVERY REQUIRED';
  }
  if (data.ceresCausalServiceHold === true) {
    return opts.depth === 'lock'
      ? 'WORK · SERVICE HOLD'
      : 'WORK · SERVICE HOLD · MINER OFFLINE';
  }
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
  if (data.ceresCausalDisabled === true) {
    return 'STATUS · DRIVE DISABLED · RECOVERY REQUIRED';
  }
  if (data.ceresCausalServiceHold === true) {
    return 'STATUS · SERVICE HOLD · MINER OFFLINE';
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
  const itinerary = target.data && target.data.itinerary;
  const destinationId = itinerary && itinerary.destinationStationId || record && record.targetId;
  return `ROUTE · ${stationLabel(state, destinationId)}`;
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
  } else if (offer.kind === 'trader' && id === 'route') {
    line = routeText(state, target);
  } else if (offer.kind === 'trader' && id === 'manifest') {
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
