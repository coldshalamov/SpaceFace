// BP-02.1/C3 Scan-Reveals-Loadout, extended to wreck investigation.
//
// Additive listener over scanner's scan:pulse seam. Ships resolve loadouts (untouched
// behavior); wrecks now resolve in three tiers — a far pulse sees a silhouette, a near
// pulse names the ledger loss behind it, a close pulse reads the manifest. Stories only
// ever attach when the wreck's provenance lossId matches a real lossLedger entry;
// generic debris reads class-only at every tier and never borrows a story.
//
// Writes only entity.data.scanRevealed plus a small durable investigated-loss memory
// (state.scanReveal) so a surveyed field stays surveyed. UI reads; AI/combat never do.
import {
  SCAN_REVEAL_CLASS_RADIUS,
  buildShipScanReveal, buildWreckScanReveal, debrisCacheFor, sameScanReveal,
  spawnDebrisCachePods,
} from '../data/scanReveal.js';
import { indexedShipLikeScan, indexedTypeScan } from '../world/livingWorldViews.js';
import { COMMODITIES } from '../data/commodities.js';
import { SECTORS } from '../data/sectors.js';
import { SECTOR_ANCHORS } from '../data/sectorAnchors.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { WORLD_ONE_OFFS } from '../data/worldOneOffs.js';
import { CERES_ACTIVITY_POCKETS } from '../data/sectorActivityPockets.js';
import {
  CERES_WRECK_CATHEDRAL_CHASE_READ_CORRIDOR,
  CERES_WRECK_CATHEDRAL_COURSE_POS,
  CERES_WRECK_CATHEDRAL_GLOBAL_POS,
  worldSiteManifestById,
} from '../data/worldSiteManifests.js';
import {
  CINDER_SLUICE_FIELD,
  CINDER_SLUICE_GLOBAL_POS,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
  cinderSluicePhase,
  pointInsideCinderSluice,
} from '../data/environmentalMachinery.js';
import {
  TETHYS_CUSTOMS_WEIR,
  pointInsideCustomsWeir,
} from '../world/customsWeir.js';
import { towClassMassFor } from './shipCapabilities.js';
import { RECORD_KIND, stableRecordId } from '../world/worldRecords.js';

const INVESTIGATED_CAP = 64;
// INF-U14: the survey pays. Deep investigations used to end in a toast — the
// scan:wreckInvestigated event had no listeners at all. Now the first deep read
// of a loss-linked wreck files a cartography claim through the canonical credit
// writer, cold cases pay a premium, and surveyed-field milestones post chart
// bonuses. Generic debris (no ledger loss behind it) still pays nothing.
const CARTOGRAPHY_BOUNTY_CR = 150;
const CARTOGRAPHY_COLD_MULT = 2;
const CARTOGRAPHY_MILESTONE_CR = Object.freeze({ 3: 200, 6: 450, 10: 800 });

export const scanReveal = {
  name: 'scanReveal',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this._onScanPulse = (payload) => this._scan(payload || {});
    if (this.bus && typeof this.bus.on === 'function') this.bus.on('scan:pulse', this._onScanPulse);
  },

  _scan(payload) {
    const state = this.state;
    const origin = payload && payload.pos;
    if (!state || !origin) return;
    const playerId = state.playerId;
    const list = indexedShipLikeScan(state);
    for (const entity of list) {
      if (!entity || entity.id === playerId) continue;
      const data = entity.data || (entity.data = {});
      const reveal = buildShipScanReveal(entity, state, {
        origin,
        now: state.simTime || 0,
        previous: data.scanRevealed || null,
      });
      if (!reveal) continue;
      if (entity.alive !== false) {
        const shipDiscovery = composeContactDiscovery(state, entity, state.simTime || 0);
        if (shipDiscovery) reveal.discovery = shipDiscovery;
      }
      if (sameScanReveal(data.scanRevealed, reveal)) {
        data.scanRevealed = { ...reveal, revealedAt: data.scanRevealed.revealedAt };
        continue;
      }
      data.scanRevealed = reveal;
      if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('scan:shipRevealed', reveal);
    }
    this._scanWrecks(state, origin);
  },

  _scanWrecks(state, origin) {
    const now = state.simTime || 0;
    const lossCache = new Map();
    const wrecks = [];
    for (const entity of indexedTypeScan(state, 'wrecks')) {
      if (entity && entity.type === 'wreck' && entity.alive !== false && entity.pos) wrecks.push(entity);
    }
    for (const entity of wrecks) {
      const data = entity.data || (entity.data = {});
      const lossId = data.provenance && data.provenance.lossId;
      const loss = lossId ? findLossById(state, lossId, lossCache) : null;
      const known = lossId ? isInvestigated(state, lossId) : false;
      const reveal = buildWreckScanReveal(entity, state, {
        origin,
        now,
        previous: data.scanRevealed || null,
        loss,
        known,
      });
      if (!reveal) continue;
      const wreckDiscovery = composeWreckDiscovery(state, entity, wrecks, reveal, loss, now);
      if (wreckDiscovery) reveal.discovery = wreckDiscovery;
      if (sameScanReveal(data.scanRevealed, reveal)) {
        data.scanRevealed = { ...reveal, revealedAt: data.scanRevealed.revealedAt };
        continue;
      }
      data.scanRevealed = reveal;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit('scan:wreckRevealed', reveal);
        if (reveal.quality === 'deep' && reveal.lossId && !known) {
          recordInvestigated(state, reveal, loss, now);
          const paid = this._fileCartographyClaim(state, reveal, loss, now);
          this.bus.emit('scan:wreckInvestigated', {
            entityId: entity.id,
            lossId: reveal.lossId,
            story: reveal.story,
            salvageHint: reveal.salvageHint,
            cold: reveal.cold,
            paid,
            at: now,
          });
          this._surveyMilestone(state, loss, now);
        } else if (reveal.quality === 'deep' && !reveal.lossId && data.debrisCache == null) {
          // INF-U18 v1: generic debris never borrows a story — but a deep read
          // can expose a sealed survivor cache. Once per hull either way.
          this._resolveDebrisCache(state, entity, now, 'scan');
        }
      }
    }
  },

  // INF-U14 v1: the first deep read of a loss-linked wreck files a cartography
  // claim. Cold cases (stripped pools, nothing left to loot) pay double — the
  // chart is the only value left in them. Recorded BEFORE paying so a re-scan
  // can never double-claim; economy stays the sole credit writer.
  _fileCartographyClaim(state, reveal, loss, now) {
    const cold = reveal.cold === true;
    const paid = CARTOGRAPHY_BOUNTY_CR * (cold ? CARTOGRAPHY_COLD_MULT : 1);
    const sectorId = (loss && loss.sectorId)
      || (state.world && state.world.currentSectorId) || null;
    this.bus.emit('economy:grantCredits', {
      amount: paid, reason: 'survey_cartography',
      lossId: reveal.lossId, sectorId, cold, at: now,
    });
    this.bus.emit('toast', {
      text: cold
        ? `Cold case closed — cartography office pays ${paid} cr for the chart.`
        : `Survey logged — cartography office pays ${paid} cr.`,
      kind: 'good', ttl: 4,
    });
    return paid;
  },

  // A surveyed field stays surveyed: toast the count when a sector's investigated
  // losses cross 3 / 6 / 10. Milestones persist in the same memory, one toast each.
  // INF-U14 v2: each milestone also posts a chart bonus through the same writer.
  _surveyMilestone(state, loss, now) {
    const memory = ensureMemory(state);
    const sectorId = (loss && loss.sectorId) || 'unknown';
    let count = 0;
    for (const id of Object.keys(memory.investigated || {})) {
      if (memory.investigated[id] && memory.investigated[id].sectorId === sectorId) count += 1;
    }
    const tier = count >= 10 ? 10 : count >= 6 ? 6 : count >= 3 ? 3 : 0;
    if (!tier) return;
    const key = `${sectorId}:${tier}`;
    if (memory.milestones[key]) return;
    memory.milestones[key] = { at: now, count };
    const sec = state.world && state.world.sectors && state.world.sectors[sectorId];
    const name = (sec && sec.name) || 'this debris field';
    if (this.bus && typeof this.bus.emit === 'function') {
      const bonus = CARTOGRAPHY_MILESTONE_CR[tier] || 0;
      if (bonus > 0) {
        this.bus.emit('economy:grantCredits', {
          amount: bonus, reason: 'survey_chart_bonus',
          sectorId, tier, count, at: now,
        });
      }
      this.bus.emit('toast', {
        text: bonus > 0
          ? `Debris field surveyed: ${count} wrecks identified in ${name} — chart bonus ${bonus} cr.`
          : `Debris field surveyed: ${count} wrecks identified in ${name}.`,
        kind: 'good', ttl: 4,
      });
    }
  },

  // INF-U18 v1+v3: roll the sealed cache once, expose it as physical pods,
  // and stamp the hull so neither the scan nor the beam path pays twice.
  _resolveDebrisCache(state, entity, now, via) {
    const data = entity.data || (entity.data = {});
    if (data.debrisCache != null) return null;
    const seed = (state.meta && state.meta.seed) || 1;
    const cache = debrisCacheFor(entity, seed);
    if (!cache) {
      data.debrisCache = 'empty';
      return null;
    }
    data.debrisCache = 'claimed';
    const specs = spawnDebrisCachePods(this.bus, entity, cache, now);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('toast', {
        text: via === 'beam'
          ? 'The beam cracked a sealed cache in the debris!'
          : `Sealed cache in the debris — ${specs.length} pods exposed!`,
        kind: 'good', ttl: 4,
      });
      this.bus.emit('scan:debrisCache', {
        entityId: entity.id,
        wreckId: entity.id,
        via,
        kind: cache.kind,
        cold: cache.cold,
        lots: cache.lots.map((lot) => ({ ...lot })),
        at: now,
      });
    }
    return cache;
  },

  destroy() {
    if (this.bus && this._onScanPulse && typeof this.bus.off === 'function') {
      this.bus.off('scan:pulse', this._onScanPulse);
    }
    this._onScanPulse = null;
  },
};

// Ledger lookup by lossId: current sector first, then every recorded sector. The wreck
// doesn't carry its sector, so the sweep is the honest match; insertion order is stable.
function findLossById(state, lossId, cache) {
  if (cache.has(lossId)) return cache.get(lossId);
  const ledger = state && state.lossLedger;
  const bySector = (ledger && ledger.bySector) || {};
  const current = state && state.world && state.world.currentSectorId;
  const ordered = current && bySector[current] ? [current] : [];
  for (const sectorId of Object.keys(bySector)) {
    if (sectorId !== current) ordered.push(sectorId);
  }
  let found = null;
  for (const sectorId of ordered) {
    const arr = bySector[sectorId];
    if (!Array.isArray(arr)) continue;
    found = arr.find((entry) => entry && entry.lossId === lossId) || null;
    if (found) break;
  }
  cache.set(lossId, found);
  return found;
}

function ensureMemory(state) {
  if (!state.scanReveal || typeof state.scanReveal !== 'object') {
    state.scanReveal = { investigated: {}, milestones: {} };
  }
  const memory = state.scanReveal;
  if (!memory.investigated || typeof memory.investigated !== 'object') memory.investigated = {};
  if (!memory.milestones || typeof memory.milestones !== 'object') memory.milestones = {};
  return memory;
}

function isInvestigated(state, lossId) {
  const memory = state && state.scanReveal;
  return !!(memory && memory.investigated && memory.investigated[lossId]);
}

function recordInvestigated(state, reveal, loss, now) {
  const memory = ensureMemory(state);
  memory.investigated[reveal.lossId] = {
    at: now,
    sectorId: (loss && loss.sectorId) || (state.world && state.world.currentSectorId) || null,
    entityId: reveal.entityId,
  };
  const ids = Object.keys(memory.investigated);
  if (ids.length > INVESTIGATED_CAP) {
    ids.sort((a, b) => (memory.investigated[a].at || 0) - (memory.investigated[b].at || 0));
    for (let i = 0; i < ids.length - INVESTIGATED_CAP; i++) delete memory.investigated[ids[i]];
  }
}

const DISCOVERY_SUBJECT_CAP = 24;
const DISCOVERY_HISTORY_CAP = 4;
const DISCOVERY_MOVE_WU = 48;
const QUOTE_STALE_S = 600;
const METAL_ANSWER_SPEED = 8;
const ANOMALY_RULE_RANGE = 420;
const ANOMALY_LANE_WU = 180;
const MACHINE_TEST_RANGE = 140;
const IMPROVISED_HITCH_RANGE = 60;
const TUG_NEED_MASS = 180;
const ACTION_ORDER = Object.freeze([
  'SF-176', 'SF-169', 'SF-166', 'SF-168', 'SF-175', 'SF-174', 'SF-173',
  'SF-170', 'SF-177', 'SF-179', 'SF-171', 'SF-178', 'SF-180', 'SF-172',
]);

function xz(pos) {
  if (!pos || !Number.isFinite(Number(pos.x)) || !Number.isFinite(Number(pos.z))) return null;
  return { x: Number(pos.x), z: Number(pos.z) };
}

function distXZ(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function speedOf(entity) {
  const vel = entity && entity.vel;
  if (!vel) return 0;
  return Math.hypot(Number(vel.x) || 0, Number(vel.z) || 0);
}

function discoveryMemoryBook(state) {
  if (!state.signalInvestigation || typeof state.signalInvestigation !== 'object') {
    state.signalInvestigation = {
      schemaVersion: 2, records: {}, completed: {}, receipts: [], triangulations: {},
      trackedId: null, discoveryMemory: { subjects: {} },
    };
  }
  const own = state.signalInvestigation;
  if (!own.discoveryMemory || typeof own.discoveryMemory !== 'object' || Array.isArray(own.discoveryMemory)
    || !own.discoveryMemory.subjects || typeof own.discoveryMemory.subjects !== 'object') {
    own.discoveryMemory = { subjects: {} };
  }
  return own.discoveryMemory;
}

function trimDiscoveryBook(book, keepId) {
  const ids = Object.keys(book.subjects || {});
  if (ids.length <= DISCOVERY_SUBJECT_CAP) return;
  ids.sort((a, b) => (book.subjects[a].confirmedAt || 0) - (book.subjects[b].confirmedAt || 0) || a.localeCompare(b));
  for (const id of ids) {
    if (Object.keys(book.subjects).length <= DISCOVERY_SUBJECT_CAP) break;
    if (id === keepId) continue;
    delete book.subjects[id];
  }
}

export function normalizeDiscoveryMemory(book) {
  const source = book && book.subjects && typeof book.subjects === 'object' ? book.subjects : {};
  const ranked = Object.keys(source).sort((a, b) => (source[b] && source[b].confirmedAt || 0)
    - (source[a] && source[a].confirmedAt || 0) || a.localeCompare(b));
  const subjects = {};
  for (const id of ranked.slice(0, DISCOVERY_SUBJECT_CAP)) {
    const row = source[id];
    if (!row || typeof row !== 'object') continue;
    const pos = xz(row.pos);
    if (!pos) continue;
    subjects[id] = {
      subjectId: id,
      claim: row.claim || null,
      pos,
      owner: row.owner || null,
      damage: row.damage || null,
      services: Array.isArray(row.services) ? row.services.slice(0, 4) : [],
      entityId: row.entityId ?? null,
      confirmedAt: Number(row.confirmedAt) || 0,
      servicesGranted: row.servicesGranted === true,
      history: (Array.isArray(row.history) ? row.history : []).slice(-DISCOVERY_HISTORY_CAP).map((entry) => ({
        status: entry && entry.status === 'stale' ? 'stale' : 'stale',
        pos: xz(entry && entry.pos) || { x: 0, z: 0 },
        owner: entry && entry.owner || null,
        damage: entry && entry.damage || null,
        at: Number(entry && entry.at) || 0,
      })),
    };
  }
  return { subjects };
}

export function reviseDiscoveryMemory(book, observation) {
  const memory = book && book.subjects ? book : { subjects: {} };
  if (!memory.subjects) memory.subjects = {};
  const subjectId = observation && observation.subjectId ? String(observation.subjectId) : '';
  if (!subjectId) {
    return { status: 'ignored', servicesGranted: false, navPos: null, lastSeen: null, current: null, sameSite: false };
  }
  const prev = memory.subjects[subjectId] || null;
  const confirmed = observation.confirmed === true;
  if (!confirmed) {
    return {
      status: 'unconfirmed',
      servicesGranted: false,
      navPos: prev && prev.pos ? { x: prev.pos.x, z: prev.pos.z } : null,
      lastSeen: prev ? { owner: prev.owner || null, damage: prev.damage || null, pos: prev.pos ? { ...prev.pos } : null } : null,
      current: null,
      sameSite: !!prev,
    };
  }
  const pos = xz(observation.pos) || (prev && prev.pos ? { ...prev.pos } : null);
  if (!pos) {
    return { status: 'ignored', servicesGranted: false, navPos: null, lastSeen: null, current: null, sameSite: false };
  }
  const owner = observation.owner ?? null;
  const damage = observation.damage ?? null;
  const services = Array.isArray(observation.services) ? observation.services.slice(0, 4) : [];
  const moved = !!(prev && prev.pos && distXZ(prev.pos, pos) > DISCOVERY_MOVE_WU);
  const ownerChanged = !!(prev && (prev.owner || null) !== owner);
  const damageChanged = !!(prev && (prev.damage || null) !== damage);
  const changed = moved || ownerChanged || damageChanged;
  const history = prev && Array.isArray(prev.history) ? prev.history.slice() : [];
  if (changed) {
    history.push({
      status: 'stale',
      pos: { x: prev.pos.x, z: prev.pos.z },
      owner: prev.owner || null,
      damage: prev.damage || null,
      at: Number(observation.at) || 0,
    });
    if (history.length > DISCOVERY_HISTORY_CAP) history.splice(0, history.length - DISCOVERY_HISTORY_CAP);
  }
  const row = {
    subjectId,
    claim: observation.claim || (prev && prev.claim) || null,
    pos,
    owner,
    damage,
    services,
    entityId: observation.entityId ?? (prev && prev.entityId) ?? null,
    confirmedAt: Number(observation.at) || 0,
    servicesGranted: !changed && services.length > 0,
    history,
  };
  memory.subjects[subjectId] = row;
  trimDiscoveryBook(memory, subjectId);
  return {
    status: changed ? 'stale' : 'current',
    servicesGranted: row.servicesGranted,
    navPos: { x: pos.x, z: pos.z },
    lastSeen: changed ? history[history.length - 1] : null,
    current: { owner, damage, pos: { x: pos.x, z: pos.z }, services: services.slice() },
    sameSite: true,
  };
}

function fileMemory(state, observation, now) {
  return reviseDiscoveryMemory(discoveryMemoryBook(state), { ...observation, at: now, confirmed: true });
}

function bundle(parts) {
  const list = parts.filter(Boolean);
  if (!list.length) return null;
  const map = {};
  for (const part of list) map[part.sf] = part;
  let action = null;
  for (const sf of ACTION_ORDER) {
    const part = map[sf];
    if (!part || part.trackable === false || !part.pos) continue;
    if (!Number.isFinite(part.pos.x) || !Number.isFinite(part.pos.z)) continue;
    action = part;
    break;
  }
  return {
    lesson: true,
    sentence: list.map((part) => part.sentence).filter(Boolean).join(' ').slice(0, 480),
    actionPos: action ? { x: action.pos.x, z: action.pos.z } : null,
    trackable: !!action,
    parts: map,
  };
}

function salvageLots(entity) {
  const pool = entity && entity.data && entity.data.salvagePool;
  if (!pool || typeof pool !== 'object') return [];
  const lots = [];
  for (const [id, qty] of Object.entries(pool)) {
    const amount = Math.floor(Number(qty) || 0);
    if (amount > 0) lots.push({ id, qty: amount });
  }
  lots.sort((a, b) => b.qty - a.qty || a.id.localeCompare(b.id));
  return lots;
}

function trailKey(entity) {
  const data = entity && entity.data || {};
  if (data.trailId) return `trail:${data.trailId}`;
  const lossId = data.provenance && data.provenance.lossId;
  if (lossId) return `loss:${lossId}`;
  return null;
}

function bearingDegrees(from, to) {
  const deg = Math.atan2(to.z - from.z, to.x - from.x) * (180 / Math.PI);
  return Math.round((deg + 360) % 360);
}

export function wreckTrailLesson(focus, wrecks, quality) {
  const key = trailKey(focus);
  if (!key || !focus || !focus.pos) return null;
  const group = (wrecks || []).filter((wreck) => wreck && wreck.pos && trailKey(wreck) === key);
  if (group.length < 2) return null;
  const ordered = group.slice().sort((a, b) => a.pos.x - b.pos.x || a.pos.z - b.pos.z
    || String(a.id).localeCompare(String(b.id)));
  const withSalvage = ordered.filter((wreck) => salvageLots(wreck).length > 0);
  const feature = withSalvage[0] || ordered[ordered.length - 1];
  const debris = ordered[0];
  const backward = focus.id === feature.id;
  const aim = backward ? debris : feature;
  const bearing = bearingDegrees(focus.pos, aim.pos);
  const named = !!(focus.data && focus.data.provenance && focus.data.provenance.lossId);
  const signature = focus.data && (focus.data.wreckClass || focus.data.wreckClassLabel) || 'debris';
  let sentence = `Debris bearing ${bearing}°.`;
  if (quality === 'identified' || quality === 'deep') {
    sentence += named
      ? ` Signature ${signature}, this hull only.`
      : ` Signature is ${signature} only.`;
  }
  if (quality === 'deep') {
    sentence += backward
      ? ' You are on the feature. The bearing runs back along the debris.'
      : ' The feature wreck is the end of the trail.';
  }
  return {
    sf: 'SF-166',
    sentence,
    pos: { x: aim.pos.x, z: aim.pos.z },
    trackable: true,
    paid: 0,
    bearingDeg: bearing,
    backward,
    signatureNamed: named,
    quality: quality || null,
    featureId: feature.id,
    debrisId: debris.id,
  };
}

function stationRows() {
  const rows = [];
  for (const sector of SECTORS) {
    for (const station of sector.stations || []) {
      if (!station || !station.pos) continue;
      rows.push({
        stationId: station.id,
        name: station.name || station.id,
        sectorId: sector.id,
        type: station.type,
        pos: sectorLocalToGlobalForSector(station.pos, sector.id),
      });
    }
  }
  return rows;
}

function buyersFor(commodityId) {
  const commodity = COMMODITIES.find((row) => row.id === commodityId);
  if (!commodity) return [];
  const types = new Set(commodity.consumedBy || []);
  return stationRows()
    .filter((station) => types.has(station.type))
    .map((station) => ({ ...station, commodityId, commodityName: commodity.name || commodityId }));
}

function chooseBuyer(state, commodityId) {
  const all = buyersFor(commodityId);
  if (!all.length) return null;
  const sectorId = state.world && state.world.currentSectorId;
  const local = all.filter((row) => row.sectorId === sectorId);
  if (local.length) return local[0];
  return all.find((row) => row.stationId === 'station_ceres') || all[0];
}

function surveyTradeLesson(state, entity, reveal, now) {
  if (!reveal || reveal.quality !== 'deep') return null;
  const lot = salvageLots(entity)[0];
  if (!lot) return null;
  const buyer = chooseBuyer(state, lot.id);
  if (!buyer) return null;
  const memory = state.player && state.player.marketMemory;
  const quote = memory && memory[buyer.stationId] && memory[buyer.stationId][lot.id];
  const seenAt = quote && Number(quote.seenAt);
  const staleQuote = !!(quote && Number.isFinite(seenAt) && (now - seenAt) > QUOTE_STALE_S);
  const stockGone = !!(quote && Number(quote.stock) === 0);
  const available = lot.qty > 0 && !stockGone;
  let sentence = `Surveyed ${buyer.commodityName}. ${buyer.name} buys it. The quote is memory, not profit.`;
  if (stockGone) sentence += ' The hold is empty. Scanning will not put stock back.';
  else if (staleQuote) sentence += ' The remembered quote is old. It is still a decision, not a guarantee.';
  else if (!quote) sentence += ' No remembered quote. The route is the decision.';
  return {
    sf: 'SF-168',
    sentence,
    pos: available ? { x: buyer.pos.x, z: buyer.pos.z } : null,
    trackable: available,
    paid: 0,
    available,
    guaranteesProfit: false,
    staleQuote,
    stockGone,
    commodityId: lot.id,
    stationId: buyer.stationId,
    stationName: buyer.name,
    qty: lot.qty,
  };
}

function stationById(stationId) {
  return stationRows().find((station) => station.stationId === stationId) || null;
}

function absenceLesson(entity, reveal) {
  const expected = entity && entity.data && entity.data.expectedPresence;
  const hinted = !!(reveal && reveal.cold && reveal.cargoHint);
  if (salvageLots(entity).length > 0) return null;
  if (expected && expected.present === true) return null;
  if (!expected && !hinted) return null;
  const cause = expected && expected.removalCause;
  const deliveredTo = expected && expected.deliveredTo;
  let sentence = 'The berth is empty. Nothing here says where it went. The cause is unknown.';
  let causeKnown = false;
  let forced = false;
  let next = null;
  let pos = null;
  if (cause === 'delivery' && deliveredTo) {
    causeKnown = true;
    next = typeof deliveredTo === 'string' ? deliveredTo : null;
    const station = typeof deliveredTo === 'string' ? stationById(deliveredTo) : null;
    const point = station ? station.pos : xz(deliveredTo);
    if (point) pos = { x: point.x, z: point.z };
    const name = station ? station.name : (next || 'the receiver');
    sentence = `The berth is empty. A delivery stamp names ${name}. That receiver is the next step.`;
  } else if (cause === 'theft' || cause === 'forced' || (expected && expected.forced === true)) {
    forced = true;
    sentence = 'The berth is empty. The latch was forced. The cause is unknown. No culprit is named.';
  }
  return {
    sf: 'SF-178',
    sentence,
    pos,
    trackable: !!pos,
    paid: 0,
    absence: true,
    causeKnown,
    forced,
    next,
    culprit: null,
  };
}

function playerDerived(state) {
  const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
  if (!player) return null;
  return player.derived || (player.data && player.data.derived) || null;
}

function improvisedHitch(state, entity, need) {
  const list = state && state.entityList || [];
  for (const body of list) {
    if (!body || body === entity || body.id === entity.id || body.id === state.playerId) continue;
    if (body.alive === false || !body.pos) continue;
    if (distXZ(entity.pos, body.pos) > IMPROVISED_HITCH_RANGE) continue;
    const mass = Number(body.mass) || Number(body.data && body.data.mass) || 0;
    if (mass >= need) return body;
  }
  return null;
}

function capabilityLesson(state, entity) {
  const data = entity && entity.data || {};
  const tug = data.oneOffId === 'oneoff_abandoned_tug';
  const needSpec = data.revisitNeed || (tug ? { massT: TUG_NEED_MASS } : null);
  const need = Number(needSpec && needSpec.massT) || 0;
  if (!(need > 0)) return null;
  const tow = towClassMassFor(playerDerived(state));
  const hitch = improvisedHitch(state, entity, need);
  const ready = tow + 1e-9 >= need || !!hitch;
  let sentence;
  if (hitch) {
    sentence = `The tug needs ${need} t. A hull already on the hitch will take it. The line rating is not required.`;
  } else if (tow + 1e-9 >= need) {
    sentence = `The tug needs ${need} t. Your tow class will take the hitch.`;
  } else {
    sentence = `The tug needs ${need} t. The hitch is visible, but this tow class will not take it.`;
  }
  return {
    sf: 'SF-174',
    sentence,
    pos: xz(entity.pos),
    trackable: true,
    paid: 0,
    needMass: need,
    towClass: tow,
    ready,
    improvised: !!hitch,
    interactionLocked: false,
    rewardReset: false,
  };
}

function oneOffLocal(id) {
  const spec = WORLD_ONE_OFFS.find((row) => row.id === id);
  if (!spec || !spec.anchor) return null;
  const anchors = SECTOR_ANCHORS[spec.sectorId];
  const stations = anchors && anchors.stations || [];
  const station = stations.find((row) => row.id === spec.anchor.id);
  if (!station || !station.pos) return null;
  return {
    spec,
    sectorId: spec.sectorId,
    local: {
      x: station.pos.x + (spec.offsetLocal ? spec.offsetLocal.x : 0),
      z: station.pos.z + (spec.offsetLocal ? spec.offsetLocal.z : 0),
    },
  };
}

function oneOffGlobal(id) {
  const local = oneOffLocal(id);
  if (!local) return null;
  return {
    ...local,
    pos: sectorLocalToGlobalForSector(local.local, local.sectorId),
  };
}

function tugRests() {
  const placed = oneOffGlobal('oneoff_abandoned_tug');
  if (!placed) return null;
  return { local: placed.local, global: placed.pos, spec: placed.spec };
}

function placementOf(pos, rests) {
  const point = xz(pos);
  if (!point || !rests) return null;
  const localSpace = distXZ(point, rests.local) < distXZ(point, rests.global);
  const rest = localSpace ? rests.local : rests.global;
  const delta = distXZ(point, rest);
  return {
    moved: delta > DISCOVERY_MOVE_WU,
    delta,
    space: localSpace ? 'local' : 'global',
    nav: {
      x: rests.global.x + (point.x - rest.x),
      z: rests.global.z + (point.z - rest.z),
    },
  };
}

function tugRecord(state) {
  const seed = (state && state.meta && state.meta.seed) || 1;
  const id = stableRecordId(seed, 'sector_ceres_belt', RECORD_KIND.WRECK, 'worldOneOff:oneoff_abandoned_tug');
  const bag = state && state.world && state.world.records && state.world.records.byId;
  return { id, row: bag && bag[id] || null };
}

function liveTugs(state) {
  const found = [];
  for (const entity of state && state.entityList || []) {
    if (!entity || entity.alive === false) continue;
    if (entity.data && entity.data.oneOffId === 'oneoff_abandoned_tug') found.push(entity);
  }
  return found;
}

function yardTugPart(state, pos, liveCount, now, entityId) {
  const rests = tugRests();
  const placed = placementOf(pos, rests);
  if (!placed) return null;
  const record = tugRecord(state);
  const memory = fileMemory(state, {
    subjectId: 'worldOneOff:oneoff_abandoned_tug',
    claim: 'yard tug',
    pos: placed.nav,
    owner: 'yard',
    damage: placed.moved ? 'moved' : 'rest',
    services: [],
    entityId: entityId ?? null,
  }, now);
  const where = placed.moved ? 'rests off the yard spot' : 'rests on the yard spot';
  const extra = liveCount > 1 ? ' A second tug is in the yard.' : ' No second tug.';
  return {
    sf: 'SF-173',
    sentence: `The same yard tug ${where}. Nothing is paid.${extra}`,
    pos: placed.nav,
    trackable: true,
    paid: 0,
    moved: placed.moved,
    liveCount,
    recordId: record.id,
    persisted: !!(record.row && record.row.pos) || liveCount > 0,
    inventedSecond: false,
    navPos: memory.navPos,
    memoryStatus: memory.status,
    servicesGranted: false,
  };
}

function yardTugLesson(state, entity, now) {
  if (!entity || !entity.data || entity.data.oneOffId !== 'oneoff_abandoned_tug') return null;
  return yardTugPart(state, entity.pos, liveTugs(state).length, now, entity.id);
}

function watchLesson(state, entity, now) {
  const watch = entity && entity.data && entity.data.discoveryWatch;
  if (!watch || !watch.subjectId || !entity.pos) return null;
  const memory = fileMemory(state, {
    subjectId: String(watch.subjectId),
    claim: `${watch.owner || 'unmarked'} / ${watch.damage || 'intact'}`,
    pos: entity.pos,
    owner: watch.owner ?? null,
    damage: watch.damage ?? null,
    services: Array.isArray(watch.services) ? watch.services : [],
    entityId: entity.id,
  }, now);
  const last = memory.lastSeen;
  const currentOwner = memory.current && memory.current.owner || 'unmarked';
  const sentence = memory.status === 'stale' && last
    ? `Last seen ${last.owner || 'unmarked'} at the earlier fix. Confirmed now ${currentOwner}. The old service is not offered.`
    : `Confirmed ${currentOwner}, ${watch.damage || 'intact'}.`;
  return {
    sf: 'SF-180',
    sentence,
    pos: memory.navPos,
    trackable: !!memory.navPos,
    paid: 0,
    memoryStatus: memory.status,
    servicesGranted: memory.status === 'stale' ? false : memory.servicesGranted,
    navPos: memory.navPos,
    lastSeen: last,
    current: memory.current,
    sameSite: memory.sameSite,
    subjectId: String(watch.subjectId),
  };
}

function workerDest(entity) {
  const data = entity && entity.data || {};
  return xz(data.destPos) || xz(data.jobDest) || xz(data.routeEnd)
    || xz(data.destination) || xz(data.ai && data.ai.dest);
}

function workerRole(entity) {
  const data = entity && entity.data || {};
  const role = String(data.trafficRole || data.jobRole || data.role || (data.ai && data.ai.role) || '');
  return /haul|survey|miner|courier|freighter/i.test(role) ? role : null;
}

function refineryGlobal() {
  return stationById('station_ceres');
}

function workerLesson(state, entity, now) {
  const role = workerRole(entity);
  if (!role || !entity) return null;
  const sectorId = (entity.data && (entity.data.sectorId || entity.data.homeSectorId))
    || (state.world && state.world.currentSectorId);
  let dest = workerDest(entity);
  let destLabel = dest ? 'a berth' : null;
  if (!dest && sectorId === 'sector_ceres_belt') {
    const refinery = refineryGlobal();
    if (refinery) {
      dest = refinery.pos;
      destLabel = refinery.name;
    }
  }
  if (!dest) return null;
  const interrupted = !!(entity.data && (entity.data.jobInterrupted || entity.data.interrupted
    || (entity.data.ai && entity.data.ai.interrupted)));
  const memory = fileMemory(state, {
    subjectId: `worker:${entity.id}`,
    claim: role,
    pos: dest,
    owner: role,
    damage: interrupted ? 'interrupted' : 'working',
    services: [],
    entityId: entity.id,
  }, now);
  let sentence = `${role} working toward ${destLabel}.`;
  sentence += interrupted
    ? ' The run was interrupted. The berth remains.'
    : ' If you lose them, the berth remains.';
  sentence += ' Their cargo is not yours.';
  return {
    sf: 'SF-175',
    sentence,
    pos: { x: dest.x, z: dest.z },
    trackable: true,
    paid: 0,
    waiting: false,
    cargoGrant: null,
    interrupted,
    destLabel,
    subjectId: `worker:${entity.id}`,
    navPos: memory.navPos,
  };
}

function composeContactDiscovery(state, entity, now) {
  return bundle([workerLesson(state, entity, now)]);
}

function composeWreckDiscovery(state, entity, wrecks, reveal, _loss, now) {
  return bundle([
    wreckTrailLesson(entity, wrecks, reveal && reveal.quality),
    surveyTradeLesson(state, entity, reveal, now),
    absenceLesson(entity, reveal),
    capabilityLesson(state, entity),
    yardTugLesson(state, entity, now),
    watchLesson(state, entity, now),
  ]);
}

function weirPoint(weir, along, across) {
  const fx = Math.cos(weir.heading);
  const fz = Math.sin(weir.heading);
  return {
    x: weir.origin.x + fx * along - fz * across,
    z: weir.origin.z + fz * along + fx * across,
  };
}

function customsLesson() {
  const weir = TETHYS_CUSTOMS_WEIR;
  const risky = weirPoint(weir, weir.range * 0.4, 0);
  let safe = weirPoint(weir, weir.range * 0.5, 0);
  for (let across = 40; across < 400 && pointInsideCustomsWeir(weir, safe); across += 20) {
    safe = weirPoint(weir, weir.range * 0.5, across);
  }
  const lawful = weirPoint(weir, -400, 0);
  const riskyInside = pointInsideCustomsWeir(weir, risky);
  const safeOutside = !pointInsideCustomsWeir(weir, safe);
  const lawfulOutside = !pointInsideCustomsWeir(weir, lawful);
  return {
    sf: 'SF-169',
    sentence: 'The customs cone is the legal gate. The long lane waits outside. The short crossing goes through the cone.',
    pos: safe,
    trackable: true,
    paid: 0,
    risky,
    lawful,
    riskyInside,
    safeOutside,
    lawfulOutside,
    wall: false,
  };
}

function pocketGlobals() {
  const out = [];
  for (const pocket of CERES_ACTIVITY_POCKETS) {
    const local = pocket.activityAnchor && pocket.activityAnchor.localPos;
    if (!local) continue;
    out.push({
      id: pocket.id,
      label: pocket.label,
      pos: sectorLocalToGlobalForSector(local, pocket.sectorId || 'sector_ceres_belt'),
    });
  }
  return out;
}

function pocketLesson(origin) {
  const pockets = pocketGlobals();
  const busy = pockets.find((pocket) => pocket.id === 'ceres_refinery_pocket');
  const quiet = pockets.find((pocket) => pocket.id === 'ceres_cathedral_grave');
  if (!busy || !quiet) return null;
  const pick = distXZ(origin, busy.pos) <= distXZ(origin, quiet.pos) ? quiet : busy;
  return {
    sf: 'SF-177',
    sentence: 'Ceres is two approaches. The refinery yard is busy. The cathedral grave is quiet. Services stay at the refinery.',
    pos: pick.pos,
    trackable: true,
    paid: 0,
    pickId: pick.id,
    busy: { id: busy.id, label: busy.label, pos: busy.pos },
    quiet: { id: quiet.id, label: quiet.label, pos: quiet.pos },
    serviceStationId: 'station_ceres',
  };
}

function sluiceLesson(simTime) {
  const phase = cinderSluicePhase(null, simTime || 0);
  const staging = CINDER_SLUICE_TRAFFIC_STAGING_POS;
  const field = CINDER_SLUICE_FIELD;
  const interior = {
    x: field.center.x + field.dir.x * field.radius * 0.35,
    z: field.center.z + field.dir.z * field.radius * 0.35,
  };
  const stagingInside = pointInsideCinderSluice(staging);
  const interiorInside = pointInsideCinderSluice(interior);
  return {
    sf: 'SF-176',
    sentence: `Staging outside the sluice cone is safe in surge and calm. The cone is the risk while the field is up (${phase.phase}). A scan is not required to stay outside.`,
    pos: { x: staging.x, z: staging.z },
    trackable: true,
    paid: 0,
    phase: phase.phase,
    fieldActive: phase.fieldActive === true,
    safeAtSafePos: !stagingInside,
    interior,
    interiorInsideCone: interiorInside,
    interiorExposed: interiorInside && phase.fieldActive === true,
    scanRequired: false,
    center: { x: CINDER_SLUICE_GLOBAL_POS.x, z: CINDER_SLUICE_GLOBAL_POS.z },
  };
}

function cathedralManifest() {
  return worldSiteManifestById('world_site_wreck_cathedral');
}

function landmarkLesson() {
  const manifest = cathedralManifest();
  const center = CERES_WRECK_CATHEDRAL_GLOBAL_POS;
  const course = CERES_WRECK_CATHEDRAL_COURSE_POS;
  const visual = manifest && manifest.visualRoot || {};
  const scale = Number(visual.initialScale);
  let clearance = Infinity;
  for (const proxy of manifest && manifest.collisionProxies || []) {
    const radius = Number(proxy.radius) || 0;
    const offset = proxy.offset || {};
    const hit = distXZ(course, {
      x: center.x + (Number(offset.x) || 0),
      z: center.z + (Number(offset.z) || 0),
    }) - radius;
    if (hit < clearance) clearance = hit;
  }
  const approach = distXZ(course, center);
  const hold = CERES_WRECK_CATHEDRAL_CHASE_READ_CORRIDOR.hold;
  return {
    sf: 'SF-179',
    sentence: `Cathedral approach ${Math.round(approach)} WU out at scale ${scale}. The course stays outside the solid hull.`,
    pos: { x: course.x, z: course.z },
    trackable: true,
    paid: 0,
    initialScale: scale,
    scaleMultiplier: 1,
    scaleChanged: false,
    approachWu: approach,
    clearanceWu: clearance,
    courseOutsideHull: clearance > 0,
    visualRadius: Number(visual.visualRadius) || 0,
    hold: hold ? { x: hold.x, z: hold.z } : null,
  };
}

function componentById(manifest, id) {
  return (manifest && manifest.components || []).find((row) => row.id === id) || null;
}

function isMetalBody(entity) {
  if (!entity) return false;
  if (entity.type === 'asteroid' || entity.type === 'rock') return false;
  const material = entity.data && entity.data.material;
  if (material === 'rock' || material === 'stone' || material === 'ice') return false;
  return entity.type === 'ship' || entity.type === 'drone' || entity.type === 'wreck';
}

function nearestTestBody(state, focus) {
  let best = null;
  let bestD = MACHINE_TEST_RANGE;
  for (const entity of state && state.entityList || []) {
    if (!entity || !entity.pos || entity.alive === false || entity.id === state.playerId) continue;
    const distance = distXZ(focus, entity.pos);
    if (distance < bestD) {
      best = entity;
      bestD = distance;
    }
  }
  return best;
}

function deadMachineLesson(state) {
  const manifest = cathedralManifest();
  const spine = componentById(manifest, 'marker_service_spine');
  const clock = componentById(manifest, 'emergency_relay_clock');
  const box = componentById(manifest, 'cathedral_black_box_or_device');
  const hull = componentById(manifest, 'cathedral_hull');
  if (!spine || !clock || !box) return null;
  const focus = CERES_WRECK_CATHEDRAL_GLOBAL_POS;
  const body = nearestTestBody(state, focus);
  let test = 'open';
  if (body && isMetalBody(body)) test = 'answers';
  else if (body) test = 'no-answer';
  const clues = [
    { id: spine.id, role: 'receiver', status: spine.initialStatus, label: spine.label },
    { id: clock.id, role: 'worn', status: clock.initialStatus, label: clock.label },
    { id: box.id, role: 'output', status: box.initialStatus, label: box.label },
  ];
  const answer = test === 'answers'
    ? 'Metal answers the test.'
    : test === 'no-answer'
      ? 'Rock does not answer the test.'
      : 'No test body is in range. The test stays open.';
  return {
    sf: 'SF-170',
    sentence: `Intake ${spine.label} is ${spine.initialStatus}. The ${clock.label} is ${clock.initialStatus}. The ${box.label} is ${box.initialStatus}. ${answer} The machine stays failed.`,
    pos: { x: focus.x, z: focus.z },
    trackable: true,
    paid: 0,
    clues,
    cluesRemain: true,
    test,
    machineStatus: hull ? hull.initialStatus : 'failed',
    restored: false,
  };
}

function shrineLesson() {
  const placed = oneOffGlobal('oneoff_strut_shrine');
  if (!placed) return null;
  return {
    sf: 'SF-172',
    sentence: 'Truss and ribbons off the refinery lane. Not a contract. No payout.',
    pos: { x: placed.pos.x, z: placed.pos.z },
    trackable: false,
    paid: 0,
    mission: null,
    spin: placed.spec.spin,
    radius: placed.spec.radius,
    placeId: placed.spec.placeId,
  };
}

function workerStillHere(state, origin, entityId, nearby) {
  if (entityId == null) return false;
  const entity = state.entities && state.entities.get && state.entities.get(entityId);
  if (entity) {
    if (entity.alive === false || !entity.pos) return false;
    return distXZ(origin, entity.pos) <= SCAN_REVEAL_CLASS_RADIUS;
  }
  for (const row of nearby || []) {
    if (!row || row.id !== entityId || row.alive === false || !row.pos) continue;
    return distXZ(origin, row.pos) <= SCAN_REVEAL_CLASS_RADIUS;
  }
  return false;
}

function workerFallback(state, origin, nearby) {
  const book = state.signalInvestigation && state.signalInvestigation.discoveryMemory;
  const subjects = book && book.subjects || {};
  for (const subject of Object.values(subjects)) {
    if (!subject || !String(subject.subjectId || '').startsWith('worker:')) continue;
    if (workerStillHere(state, origin, subject.entityId, nearby)) continue;
    const pos = xz(subject.pos);
    if (!pos) continue;
    const part = {
      sf: 'SF-175',
      sentence: 'The hauler is gone. The berth remains. Their cargo is not yours.',
      pos,
      trackable: true,
      paid: 0,
      waiting: false,
      cargoGrant: null,
      fallback: true,
      subjectId: subject.subjectId,
    };
    return {
      id: 'signal:discovery:SF-175',
      kind: 'archive',
      sourceId: 'SF-175',
      entityId: null,
      pos,
      range: 1400,
      repeatableScannerSignal: true,
      discovery: bundle([part]),
    };
  }
  return null;
}

function revealedBeyondPulse(state, origin) {
  const out = [];
  const consider = (entity, kind) => {
    if (!entity || !entity.pos || entity.alive === false) return;
    const discovery = entity.data && entity.data.scanRevealed && entity.data.scanRevealed.discovery;
    if (!discovery || !discovery.sentence) return;
    if (distXZ(origin, entity.pos) > SCAN_REVEAL_CLASS_RADIUS) return;
    out.push({
      id: `signal:entity:${entity.id}`,
      kind,
      sourceId: entity.id,
      entityId: entity.id,
      pos: { x: entity.pos.x, z: entity.pos.z },
      range: SCAN_REVEAL_CLASS_RADIUS,
      repeatableScannerSignal: true,
      discovery,
      ...(discovery.trackable === false ? { trackable: false } : {}),
    });
  };
  for (const entity of indexedTypeScan(state, 'wrecks')) consider(entity, 'salvage');
  for (const entity of indexedShipLikeScan(state)) {
    if (entity && entity.id !== state.playerId) consider(entity, 'ship');
  }
  return out;
}

function placeRow(id, range, part) {
  if (!part || !part.pos) return null;
  const discovery = bundle([part]);
  if (!discovery) return null;
  return {
    id,
    kind: 'archive',
    sourceId: part.sf,
    entityId: null,
    pos: { x: part.pos.x, z: part.pos.z },
    range,
    repeatableScannerSignal: true,
    discovery,
    ...(discovery.trackable === false ? { trackable: false } : {}),
  };
}

export function discoveryPlaceCandidates(state, origin, simTime = 0, nearby = []) {
  const point = xz(origin);
  if (!state || !point) return [];
  const rows = [];
  const push = (row) => { if (row) rows.push(row); };
  push(placeRow('signal:discovery:SF-169', 1600, customsLesson()));
  push(placeRow('signal:discovery:SF-177', 3600, pocketLesson(point)));
  push(placeRow('signal:discovery:SF-176', 1600, sluiceLesson(simTime)));
  push(placeRow('signal:discovery:SF-179', 1600, landmarkLesson()));
  push(placeRow('signal:discovery:SF-170', 1600, deadMachineLesson(state)));
  push(placeRow('signal:discovery:SF-172', 1800, shrineLesson()));
  const lives = liveTugs(state);
  const tugNear = lives.some((entity) => distXZ(point, entity.pos) <= SCAN_REVEAL_CLASS_RADIUS);
  if (!tugNear) {
    const record = tugRecord(state);
    const recorded = record.row && xz(record.row.pos);
    if (recorded && distXZ(point, recorded) <= 1600) {
      const part = yardTugPart(state, recorded, 0, simTime, null);
      push(placeRow('signal:discovery:SF-173', 1600, part));
    }
  }
  push(workerFallback(state, point, nearby));
  for (const row of revealedBeyondPulse(state, point)) rows.push(row);
  return rows;
}

function isMetalMover(entity, player, anomalyId) {
  if (!entity || !entity.pos || entity.alive === false) return false;
  if (player && entity.id === player.id) return false;
  if (anomalyId != null && (entity.id === anomalyId)) return false;
  return isMetalBody(entity);
}

export function anomalyRuleLesson(player, bodies, focus, skipId = null) {
  const origin = xz(focus) || xz(player && player.pos);
  if (!origin) return null;
  let mover = null;
  let rock = null;
  for (const body of bodies || []) {
    if (!isMetalMover(body, player, skipId) && body && body.pos) {
      const material = body.type === 'asteroid' || body.type === 'rock'
        || (body.data && (body.data.material === 'rock' || body.data.material === 'stone'));
      if (material && distXZ(origin, body.pos) <= ANOMALY_RULE_RANGE && (!rock || body.id < rock.id)) rock = body;
    }
    if (!isMetalMover(body, player, skipId)) continue;
    if (distXZ(origin, body.pos) > ANOMALY_RULE_RANGE) continue;
    if (speedOf(body) <= METAL_ANSWER_SPEED) continue;
    if (!mover || speedOf(body) > speedOf(mover) || (speedOf(body) === speedOf(mover) && String(body.id) < String(mover.id))) {
      mover = body;
    }
  }
  if (mover) {
    const speed = speedOf(mover);
    const lane = {
      x: mover.pos.x + (mover.vel.x / speed) * ANOMALY_LANE_WU,
      z: mover.pos.z + (mover.vel.z / speed) * ANOMALY_LANE_WU,
    };
    return {
      sf: 'SF-171',
      control: 'moving-metal',
      sentence: 'Moving metal answers. A still hull does not, and rock does not. The cleared lane is 180 WU along that motion.',
      pos: lane,
      trackable: false,
      paid: 0,
      recoverable: true,
      lethal: false,
      usefulPos: lane,
    };
  }
  const playerDist = player && player.pos ? distXZ(origin, player.pos) : Infinity;
  if (player && playerDist <= ANOMALY_RULE_RANGE && speedOf(player) <= METAL_ANSWER_SPEED) {
    return {
      sf: 'SF-171',
      control: 'stationary-proximity',
      sentence: 'A still hull in range does not answer. Proximity is not the rule.',
      pos: null,
      trackable: false,
      paid: 0,
      recoverable: false,
      lethal: false,
      usefulPos: null,
    };
  }
  if (rock && player && player.pos && distXZ(player.pos, rock.pos) > ANOMALY_RULE_RANGE) {
    return {
      sf: 'SF-171',
      control: 'other-material',
      sentence: 'Rock does not answer. The rule is moving metal, and you are outside it.',
      pos: null,
      trackable: false,
      paid: 0,
      recoverable: false,
      lethal: false,
      usefulPos: null,
    };
  }
  return null;
}

export default scanReveal;
