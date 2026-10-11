// FB day / war / price / claim / worksite / wreck-ecology headlines.
// Pure builders plus one registrar. Economy and claims stay the writers.

import { starvedIndustryNeedFor } from '../systems/economy.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import {
  CONFLICT_REACTION_SURFACES,
  selectConflictReaction,
} from '../data/conflictReactions.js';
import {
  clearCourierLoss,
  forgetWreckMarker,
  rememberCourierLoss,
  rememberWreckMarker,
} from './wreckEcologyMarkers.js';

const DAY_S = 600;
const WAR_THRESHOLD = 75;

export function ensureWorldNews(state) {
  if (!state.worldNews) state.worldNews = {};
  const bag = state.worldNews;
  if (!bag.starved) bag.starved = {};
  if (!Array.isArray(bag.markers)) bag.markers = [];
  if (!Array.isArray(bag.dockLines)) bag.dockLines = [];
  if (!bag.sectorSnap) bag.sectorSnap = {};
  return bag;
}

export function combatOpen(state) {
  const live = state && state.encounterDirector && state.encounterDirector.live;
  if (live && typeof live === 'object' && Object.keys(live).length > 0) return true;
  return !!(state && state.combat && state.combat.active);
}

export function declaredWarHeadline(payload) {
  if (!payload || !payload.pairKey) return null;
  if (payload.tension != null && Number(payload.tension) < WAR_THRESHOLD) return null;
  const sides = Array.isArray(payload.sides) && payload.sides.length
    ? payload.sides.filter(Boolean).join(' and ')
    : 'Two houses';
  return {
    text: `${sides} are at war.`,
    kind: 'war_declared',
    sourceRef: `conflict:warDeclared:${payload.pairKey}`,
  };
}

export function flipHeadline(payload, seed) {
  if (!payload) return null;
  const reaction = selectConflictReaction({
    surface: CONFLICT_REACTION_SURFACES.HELIOS_AD,
    seed: seed || 4242,
    flip: payload,
    cycle: 0,
  });
  if (!reaction || !reaction.text) return null;
  return {
    text: reaction.text,
    kind: 'conflict_flip',
    sourceRef: `conflict:flip:${payload.pairKey}:${payload.sectorId}:${payload.newOwner}`,
  };
}

function sectorRows(state) {
  const bag = state && state.world && (state.world.sectorState || state.world.sectors);
  const list = Array.isArray(bag) ? bag : (bag && typeof bag === 'object' ? Object.values(bag) : []);
  const out = [];
  for (const row of list) {
    if (!row) continue;
    const id = row.id || row.sectorId;
    if (!id) continue;
    out.push({
      id,
      owner: row.owner || row.factionId || null,
      threat: row.threat || row.threatLevel || null,
    });
  }
  return out;
}

export function dayBoundaryCard(state, payload) {
  if (!payload || payload.digest == null) return null;
  const bag = ensureWorldNews(state);
  const digest = Number(payload.digest);
  if (bag.lastDigest === digest) return null;
  const prev = bag.sectorSnap || {};
  const nextRows = sectorRows(state);
  const deltas = [];
  for (const row of nextRows) {
    const was = prev[row.id];
    if (!was) continue;
    if (was.owner !== row.owner || was.threat !== row.threat) {
      deltas.push(`${row.id} ${was.owner || 'unheld'} → ${row.owner || 'unheld'}`);
    }
  }
  const snap = {};
  for (const row of nextRows) snap[row.id] = { owner: row.owner, threat: row.threat };
  bag.sectorSnap = snap;
  bag.lastDigest = digest;
  const top = deltas.slice(0, 3);
  if (!top.length) return null;
  const day = payload.dayCounter != null ? payload.dayCounter : Math.floor((state.simTime || 0) / DAY_S);
  const text = `Day ${day}. ${top.join('; ')}.`;
  return {
    text,
    kind: 'day_boundary',
    sourceRef: `sectorsim:day:${day}:${digest}`,
  };
}

// Display names for the shortage line. An id that does not resolve is printed as given rather than
// hidden, so a fixture or a mod commodity still reads as something.
let nameTables = null;
function displayNameFor(kind, id) {
  if (!nameTables) {
    nameTables = { commodity: new Map(COMMODITIES.map((c) => [c.id, c.name])), station: new Map() };
    for (const sec of SECTORS) for (const st of (sec.stations || [])) nameTables.station.set(st.id, st.name);
  }
  return nameTables[kind].get(id) || String(id);
}

export function noteDemandShift(state, payload) {
  if (!payload || !payload.stationId || !payload.commodityId) return null;
  const bag = ensureWorldNews(state);
  const key = `${payload.stationId}:${payload.commodityId}`;
  const from = Number(payload.from);
  const to = Number(payload.to);
  if (Number.isFinite(from) && Number.isFinite(to) && to < from) {
    delete bag.starved[key];
    return null;
  }
  const market = payload.market || null;
  const need = starvedIndustryNeedFor(payload.stationType, payload.stationTier, market);
  if (!need) return null;
  const line = `${displayNameFor('commodity', payload.commodityId)} is starved at ${displayNameFor('station', payload.stationId)}.`;
  bag.starved[key] = line;
  return {
    text: line,
    kind: 'demand_shift',
    sourceRef: `economy:demandShift:${payload.stationId}:${payload.commodityId}:${to}`,
    stationId: payload.stationId,
  };
}

export function starvedNeedLine(state, stationId, commodityId) {
  const bag = state && state.worldNews;
  if (!bag || !bag.starved || !stationId || !commodityId) return null;
  return bag.starved[`${stationId}:${commodityId}`] || null;
}

const CLAIM_LEG_KEYS_MAX = 24;

/**
 * A claim depot's supply leg landing (traffic's `claim:freightDelivered`: { bodyId, inbound,
 * quantity }). Only the inbound leg carries supplies. `inSector` says whether the pilot is in the
 * claim's sector (flight receipt) or away (dock-card line); `legKey` names the leg so a duplicate
 * or re-entrant emit never speaks twice.
 */
export function claimDeliveryNote(state, payload) {
  if (!payload || payload.inbound === false || !payload.bodyId) return null;
  const qty = Math.round(Number(payload.quantity));
  if (!(qty > 0)) return null;
  const body = ((state && state.claims && state.claims.bodies) || []).find((row) => row && row.id === payload.bodyId);
  const service = ((state && state.traffic && state.traffic.depotServices) || [])
    .find((row) => row && row.bodyId === payload.bodyId);
  const name = (body && body.name) || String(payload.bodyId);
  // Traffic commits the leg (legSeq += 1) BEFORE it emits, so the leg that just landed is legSeq - 1.
  // With no service row the key falls back to the exact sim time, so two genuine deliveries within
  // one second stay two while a re-entrant emit of the same moment stays one.
  const legKey = service && Number.isFinite(service.legSeq)
    ? `${payload.bodyId}:${service.legSeq - 1}`
    : `${payload.bodyId}:${qty}:${Number(state && state.simTime) || 0}`;
  const currentSector = state && state.world && state.world.currentSectorId;
  return {
    text: `Depot run landed at ${name}: ${qty} units of supplies.`,
    legKey,
    qty,
    bodyId: payload.bodyId,
    inSector: !!(body && body.sectorId && body.sectorId === currentSector),
  };
}

/** True the first time a (surface, leg) pair is seen; bounded so the bag never grows. */
export function claimLegFirstSeen(state, surface, legKey) {
  const bag = ensureWorldNews(state);
  if (!bag.claimLegs) bag.claimLegs = {};
  const key = `${surface}:${legKey}`;
  if (bag.claimLegs[key]) return false;
  bag.claimLegs[key] = true;
  const keys = Object.keys(bag.claimLegs);
  if (keys.length > CLAIM_LEG_KEYS_MAX) {
    for (const old of keys.slice(0, keys.length - CLAIM_LEG_KEYS_MAX)) delete bag.claimLegs[old];
  }
  return true;
}

function cite(text, kind, sourceRef, extra) {
  if (!text || !sourceRef) return null;
  return { text, kind, sourceRef, ...(extra || {}) };
}

export function registerWorldBeats(on, state) {
  const publish = (headline) => {
    if (!headline) return null;
    const bag = ensureWorldNews(state);
    bag.dockLines.push(headline.text);
    if (bag.dockLines.length > 12) bag.dockLines.shift();
    return headline;
  };

  on('sectorsim:tick', (payload) => {
    if (combatOpen(state)) {
      ensureWorldNews(state).pendingDay = payload;
      return null;
    }
    return publish(dayBoundaryCard(state, payload));
  });

  on('conflict:warDeclared', (payload) => publish(declaredWarHeadline(payload)));
  on('conflict:flip', (payload) => publish(flipHeadline(payload, state.meta && state.meta.seed)));

  on('economy:demandShift', (payload) => publish(noteDemandShift(state, payload)));

  on('claim:defenseWarning', (payload) => {
    if (!payload || !payload.bodyId) return null;
    return publish(cite(
      `${payload.attackerName || 'Raiders'} are counting down on ${payload.bodyName || payload.bodyId}.`,
      'claim_warning',
      `claim:defenseWarning:${payload.bodyId}:${payload.defenseId || 'defense'}`,
    ));
  });
  on('claim:receipt', (payload) => {
    if (!payload) return null;
    const id = payload.receiptId || payload.claimId || payload.bodyId;
    if (!id) return null;
    return publish(cite(
      payload.text || `Claim receipt filed for ${id}.`,
      'claim_receipt',
      `claim:receipt:${id}`,
    ));
  });

  // A supply run that landed while the pilot was elsewhere waits on the dock card; one that
  // landed in the pilot's own sector is a flight receipt (marketNews owns the toast bus).
  on('claim:freightDelivered', (payload) => {
    const note = claimDeliveryNote(state, payload);
    if (!note || note.inSector || !claimLegFirstSeen(state, 'dock', note.legKey)) return null;
    // Dock-card only: returning the headline would also surface it as a flight ticker line for a
    // run the pilot is not there to see.
    publish(cite(note.text, 'claim_depot_run', `claim:freightDelivered:${note.legKey}`));
    return null;
  });

  on('automation:incomeCredited', (payload) => {
    if (!payload || !(Number(payload.amount) > 0)) return null;
    return publish(cite(
      `The worksite credited ${Math.round(payload.amount)} cr.`,
      'industry_receipt',
      `automation:incomeCredited:${payload.source || 'site'}:${Math.round(payload.amount)}`,
    ));
  });

  on('site:courierLost', (payload) => {
    rememberCourierLoss(state, payload || {});
    const id = payload && (payload.courierId || payload.siteId || payload.id || 'courier');
    return publish(cite('A courier is missing.', 'courier_lost', `site:courierLost:${id}`));
  });
  on('site:courierDelivered', (payload) => {
    clearCourierLoss(state, payload || {});
    const id = payload && (payload.courierId || payload.siteId || payload.id || 'courier');
    // Name the sale when the payload can prove it: buyer, units, credits. A bare ping (fixture or
    // old caller) keeps the anonymous line rather than inventing numbers.
    const units = payload && Number(payload.units) > 0 ? Math.round(Number(payload.units)) : 0;
    const credited = payload && Number(payload.creditedCr) > 0 ? Math.round(Number(payload.creditedCr)) : 0;
    const buyer = payload && payload.stationId ? displayNameFor('station', payload.stationId) : null;
    const line = buyer && units
      ? `${units}u delivered to ${buyer}${credited ? ` — ${credited} cr banked` : ''}.`
      : 'The courier delivered.';
    return publish(cite(line, 'courier_delivered', `site:courierDelivered:${id}`));
  });
  on('site:laneSpilled', (payload) => publish(cite(
    'A lane spilled its load.',
    'lane_spilled',
    `site:laneSpilled:${payload && (payload.siteId || payload.id) || 'site'}`,
  )));
  on('site:podBuilt', (payload) => publish(cite(
    'A worksite pod is up.',
    'pod_built',
    `site:podBuilt:${payload && (payload.siteId || payload.id) || 'site'}`,
  )));

  on('wreckEcology:seeded', (payload) => {
    rememberWreckMarker(state, payload || {});
    if (!payload || payload.playerSeen !== true && payload.witnessed !== true && payload.seen !== true) return null;
    return publish(cite(
      'A wreck field is on the chart.',
      'wreck_ecology',
      `wreckEcology:seeded:${payload.fieldId || payload.wreckId}`,
    ));
  });
  on('wreckEcology:decayed', (payload) => {
    forgetWreckMarker(state, payload || {});
    return null;
  });

  on('dock:docked', () => {
    const bag = ensureWorldNews(state);
    if (bag.pendingDay && !combatOpen(state)) {
      const card = dayBoundaryCard(state, bag.pendingDay);
      bag.pendingDay = null;
      if (card) publish(card);
    }
    const lines = bag.dockLines.splice(0, bag.dockLines.length);
    bag.lastDockSim = state.simTime || 0;
    if (!lines.length) return null;
    return publish(cite(
      lines.slice(0, 3).join(' '),
      'dock_card',
      `dock:card:${Math.floor((state.simTime || 0) / DAY_S)}:${lines.length}`,
    ));
  });
}
