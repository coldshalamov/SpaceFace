// Scanner pulse system (GDD 2.0 §7.4).
//
// Consumes the locked input edge `state.input.actions.scanPulse` and annotates live entities with
// plain data fields that UI/render layers can read. No RNG; all durations are simTime-based.
import { ASTEROIDS } from '../data/mining.js';
import { queryNearbyEntities } from '../core/spatialQuery.js';
import { maxFittedModuleMod } from '../core/fittedModules.js';
import { isPlayerWanted } from './heat.js';
import { combatFlag } from '../data/featureFlags.js';
import { weakPointForEntity } from '../data/weakPoints.js';
import {
  CONTACT_HAIL_RANGE,
  CONTACT_HAIL_REQUEST_TTL_S,
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
  pirateParleyDemandForHandoff,
} from '../data/contactHail.js';

export const SCANNER_CONTACT_RANGE = CONTACT_HAIL_RANGE;

const PULSE_COOLDOWN_S = 8;
const NEAR_SCAN_RADIUS = 1200;
const HIDDEN_POI_RADIUS = 2000;
const ASTEROID_HIGHLIGHT_S = 20;
const PINGED_S = 45;
const SIGNAL_RECORD_CAP = 64;
const SIGNAL_RECEIPT_CAP = 32;
const SIGNAL_INVESTIGATE_RADIUS = 150;
const CONTACT_HAIL_POLL_TICKS = 12; // 5 Hz at the fixed 60 Hz sim cadence.
const UNSAFE_PLAYER_SECURITY = 0.45;
const LANE_CONTEXT_INNER_R = 900;
const LANE_CONTEXT_OUTER_R = 2200;
const PLAYER_DANGER_CONTEXTS = new Set([
  'interdiction', 'spawn_request', 'bounty_hunter', 'mission', 'encounter', 'tutorial_pirate',
  'zone_hostile', // WORLD_OVERHAUL_2_1: pirates/raiders camping a named ambush/outlaw zone
]);

export function scannerProfileForState(state) {
  const radiusMult = Math.max(
    1,
    maxFittedModuleMod(state, 'scannerRadiusMult', 1),
    maxFittedModuleMod(state, 'scanRangeMult', 1),
  );
  const pingPersistMult = Math.max(0.05, maxFittedModuleMod(state, 'pingPersistMult', 1));
  return {
    radiusMult,
    pingPersistMult,
    nearRadius: NEAR_SCAN_RADIUS * radiusMult,
    hiddenPoiRadius: HIDDEN_POI_RADIUS * radiusMult,
    pingPersistS: PINGED_S * pingPersistMult,
  };
}

const ASTEROID_BY_ID = new Map(ASTEROIDS.map((a) => [a.id, a]));
const ORE_GLYPH_BY_TAG = Object.freeze({
  common: 'Si',
  metal: 'Fe',
  ice: 'H2O',
  gas: 'Gas',
  crystal: 'Cr',
  exotic: 'Xe',
  rare: 'Xe',
});

function pos2(pos) {
  return { x: Number(pos && pos.x) || 0, z: Number(pos && pos.z) || 0 };
}

function dist(posA, posB) {
  return Math.hypot((posA.x || 0) - (posB.x || 0), (posA.z || 0) - (posB.z || 0));
}

function oreGlyphForAsteroid(entity) {
  const typeId = entity && entity.data && entity.data.typeId;
  const def = ASTEROID_BY_ID.get(typeId);
  const table = def && def.oreTable;
  let bestOre = null;
  let bestWeight = -1;
  if (table) {
    for (const oreId in table) {
      if (table[oreId] > bestWeight) {
        bestOre = oreId;
        bestWeight = table[oreId];
      }
    }
  }
  if (bestOre) {
    if (bestOre.includes('ice')) return 'H2O';
    if (bestOre.includes('gas')) return 'Gas';
    if (bestOre.includes('crystal')) return 'Cr';
    if (bestOre.includes('exotic')) return 'Xe';
    if (bestOre.includes('ore')) return 'Fe';
  }
  const tags = def && def.oreTable ? Object.keys(def.oreTable).join(' ') : String(typeId || '');
  for (const tag in ORE_GLYPH_BY_TAG) if (tags.includes(tag)) return ORE_GLYPH_BY_TAG[tag];
  return 'Ore';
}

function isWreckLike(entity) {
  const data = entity && entity.data || {};
  return entity && (
    entity.type === 'wreck' ||
    data.poiType === 'wreck' ||
    data.kind === 'wreck' ||
    data.kind === 'derelict' ||
    data.salvage === true
  );
}

// Weak-point callout resolved on a wreck scan. Deterministic from the entity id so a re-scan (or a
// second look at the same derelict this session) names the same subsystem — no per-frame flicker.
const WEAK_POINTS = ['REACTOR CORE', 'FUEL CELLS', 'MAGAZINE', 'SHIELD NODE', 'CARGO SEAL', 'DRIVE COIL'];
function weakPointFor(entity) {
  const id = entity && entity.id != null ? String(entity.id) : '0';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0x7fffffff;
  return WEAK_POINTS[h % WEAK_POINTS.length];
}

// Turn a wreck's salvage contents into a compact manifest [{ id, qty }] the contacts strip resolves
// from the "??? UNSCANNED" ghost once a scan pulse lands. Reads salvagePool (id→units) + any loot.
function buildWreckManifest(entity) {
  const out = [];
  const pool = entity && entity.data && entity.data.salvagePool;
  if (pool && typeof pool === 'object') {
    for (const id in pool) {
      const qty = Math.round(Number(pool[id]) || 0);
      if (qty > 0) out.push({ id, qty });
    }
  }
  const loot = entity && entity.data && entity.data.loot;
  if (Array.isArray(loot)) {
    for (const item of loot) {
      if (!item) continue;
      const id = item.commodityId || item.id;
      const qty = Math.round(Number(item.amount != null ? item.amount : item.qty) || 0);
      if (id && qty > 0) out.push({ id, qty });
    }
  }
  return out;
}

function isCargoLike(entity) {
  const data = entity && entity.data || {};
  return entity && (
    entity.type === 'cargo' ||
    entity.type === 'pickup' ||
    data.kind === 'cargo' ||
    data.commodityId
  );
}

function isAnomalyLike(entity) {
  const data = entity && entity.data || {};
  return entity && (entity.type === 'anomaly' || data.poiType === 'anomaly');
}

function ensurePingBucket(state, sectorId) {
  if (!state.world.scanPings || typeof state.world.scanPings !== 'object') state.world.scanPings = {};
  const list = state.world.scanPings[sectorId];
  if (Array.isArray(list)) return list;
  state.world.scanPings[sectorId] = [];
  return state.world.scanPings[sectorId];
}

function upsertUnknownPing(state, sectorId, ping) {
  const list = ensurePingBucket(state, sectorId);
  const existing = list.find((item) => item && item.id === ping.id);
  if (existing) {
    existing.pos = pos2(ping.pos);
    existing.kind = 'unknown';
    return false;
  }
  list.push({ id: ping.id, pos: pos2(ping.pos), kind: 'unknown' });
  return true;
}

export function signalStrengthFor(distance, range) {
  const r = Math.max(1, Number(range) || 1);
  return Math.max(0, Math.min(1, 1 - Math.max(0, Number(distance) || 0) / r));
}

export function signalClassificationStage(scanCount, distance) {
  const scans = Math.max(1, Math.floor(Number(scanCount) || 1));
  const d = Math.max(0, Number(distance) || 0);
  if (scans >= 3 || d <= 300) return 3;
  if (scans >= 2 || d <= 650) return 2;
  return 1;
}

export function signalClassLabel(kind, stage = 1) {
  const s = Math.max(1, Math.min(3, stage | 0));
  if (kind === 'distress') return s >= 3 ? 'DISTRESS COMMUNICATOR' : s >= 2 ? 'DISTRESS SIGNAL' : 'MODULATED SIGNAL';
  if (kind === 'salvage') return s >= 3 ? 'DERELICT SALVAGE' : s >= 2 ? 'SALVAGE SIGNATURE' : 'METALLIC RETURN';
  if (kind === 'anomaly') return s >= 3 ? 'ANOMALOUS PHENOMENON' : s >= 2 ? 'ANOMALY SIGNATURE' : 'ENERGY RETURN';
  if (kind === 'ore') return s >= 3 ? 'ORE CONCENTRATION' : s >= 2 ? 'ORE SIGNATURE' : 'MINERAL RETURN';
  if (kind === 'ambush') return s >= 3 ? 'MULTIPLE DRIVE ECHOES' : s >= 2 ? 'UNCERTAIN TRAFFIC' : 'SHIP SIGNATURE';
  return s >= 3 ? 'VESSEL SIGNATURE' : s >= 2 ? 'SHIP SIGNATURE' : 'DRIVE RETURN';
}

function signalDetail(kind, stage) {
  if (kind === 'ambush') return stage >= 3
    ? 'Several drives, intent unresolved. Track or hold clear.'
    : 'Traffic pattern unresolved. Close range or pulse again.';
  if (stage <= 1) return 'Source unresolved. Close range or pulse again.';
  if (stage === 2) return 'Probable class. Track the return or pulse again.';
  return 'Investigation fix stable. Track to inspect at close range.';
}

function freshSignalState() {
  return { schemaVersion: 1, records: {}, completed: {}, receipts: [], trackedId: null };
}

function ensureSignalState(state) {
  if (!state.signalInvestigation || typeof state.signalInvestigation !== 'object') state.signalInvestigation = freshSignalState();
  const own = state.signalInvestigation;
  own.schemaVersion = 1;
  if (!own.records || typeof own.records !== 'object' || Array.isArray(own.records)) own.records = {};
  if (!own.completed || typeof own.completed !== 'object' || Array.isArray(own.completed)) own.completed = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  return own;
}

const SIGNAL_KIND_PRIORITY = Object.freeze({
  distress: 100,
  anomaly: 90,
  salvage: 80,
  ambush: 70,
  ship: 60,
  ore: 40,
});

function signalKindForEntity(entity) {
  if (!entity) return null;
  const data = entity.data || {};
  const label = String(data.scanLabel || data.label || data.name || '').toLowerCase();
  if (isAnomalyLike(entity)) return 'anomaly';
  if (isWreckLike(entity)) {
    if (data.isCommunicator || data.parentType === 'communicator' || label.includes('distress')) return 'distress';
    return 'salvage';
  }
  if (entity.type === 'asteroid') return 'ore';
  if (entity.type === 'ship' || entity.type === 'drone') return 'ship';
  return null;
}

function signalKindForPoi(poi) {
  const type = String(poi && (poi.type || poi.poiType || poi.kind) || '').toLowerCase();
  const label = String(poi && (poi.name || poi.label || poi.poiId) || '').toLowerCase();
  if (type.includes('anomal')) return 'anomaly';
  if (type.includes('distress') || type.includes('beacon') || label.includes('distress')) return 'distress';
  if (type.includes('wreck') || type.includes('derelict') || type.includes('cache') || type.includes('salvage')) return 'salvage';
  return null;
}

function signalKindForLivingPoi(row) {
  if (!row) return null;
  if (row.familyId === 'anomaly_research') return 'anomaly';
  if (row.familyId === 'derelict_salvage') return 'salvage';
  if (row.familyId === 'mining_field') return 'ore';
  if (row.familyId === 'pirate_contested_nest') return 'ambush';
  if (row.familyId === 'convoy_industrial_route') return 'ship';
  return null;
}

function collectSignalCandidates(state, sectorId, origin, nearby = [], profile = scannerProfileForState(state)) {
  const byId = new Map();
  const add = (candidate) => {
    if (!candidate || !candidate.id || !candidate.pos || !candidate.kind) return;
    const distance = dist(origin, candidate.pos);
    const range = Math.max(1, Number(candidate.range) || NEAR_SCAN_RADIUS);
    if (distance > range) return;
    const row = { ...candidate, distance, range, pos: pos2(candidate.pos) };
    const previous = byId.get(row.id);
    if (!previous || row.distance < previous.distance) byId.set(row.id, row);
  };

  for (const entity of nearby || []) {
    if (!entity || !entity.alive || entity.id === state.playerId || !entity.pos) continue;
    const kind = signalKindForEntity(entity);
    if (!kind) continue;
    add({
      id: `signal:entity:${entity.id}`,
      kind,
      sourceId: entity.id,
      entityId: entity.id,
      pos: entity.pos,
      range: profile.nearRadius,
    });
  }

  const active = state.world && state.world.activeSector;
  for (const poi of active && active.pois || []) {
    if (!poi || !(poi.hidden || String(poi.type || '').toLowerCase() === 'anomaly')) continue;
    const kind = signalKindForPoi(poi);
    if (!kind) continue;
    const entity = state.entities && state.entities.get && state.entities.get(poi.id);
    const pos = entity && entity.pos || poi.pos;
    if (!pos) continue;
    const sourceId = poi.poiId || poi.id;
    add({
      id: `signal:poi:${sourceId}`,
      kind,
      sourceId,
      entityId: entity && entity.id || null,
      pos,
      range: profile.hiddenPoiRadius,
    });
  }

  const living = state.livingPoiBehaviors && state.livingPoiBehaviors.activeByZone;
  for (const row of Object.values(living || {})) {
    if (!row || row.sectorId !== sectorId || row.status === 'resolved' || row.status === 'aftermath') continue;
    const kind = signalKindForLivingPoi(row);
    if (!kind || !row.zoneCenter) continue;
    add({
      id: `signal:living:${row.behaviorId}`,
      kind,
      sourceId: row.behaviorId,
      entityId: null,
      pos: row.zoneCenter,
      range: profile.hiddenPoiRadius,
    });
  }

  // Ambush tells deliberately remain an uncertain traffic class at every stage. The scanner does
  // not consult hostility, encounter labels, or faction intent here: investigation earns warning,
  // never omniscient red paint.
  const tells = state.ambushSignatures && state.ambushSignatures.tells;
  for (const tell of Object.values(tells || {})) {
    if (!tell || tell.active === false || tell.sectorId !== sectorId || !tell.pos) continue;
    add({
      id: `signal:${tell.id}`,
      kind: 'ambush',
      sourceId: tell.id,
      entityId: null,
      pos: tell.pos,
      range: profile.hiddenPoiRadius,
    });
  }

  return [...byId.values()].sort(compareSignalRows);
}

function compareSignalRows(a, b) {
  const priority = (SIGNAL_KIND_PRIORITY[b && (b.sourceKind || b.kind)] || 0)
    - (SIGNAL_KIND_PRIORITY[a && (a.sourceKind || a.kind)] || 0);
  if (priority) return priority;
  const distance = (Number(a && a.distance) || 0) - (Number(b && b.distance) || 0);
  if (distance) return distance;
  return String(a && a.id || '').localeCompare(String(b && b.id || ''));
}

function pruneSignalRecords(own) {
  const ids = Object.keys(own.records || {});
  if (ids.length <= SIGNAL_RECORD_CAP) return;
  ids.sort((a, b) => {
    const aProtected = a === own.trackedId || !!own.completed[a];
    const bProtected = b === own.trackedId || !!own.completed[b];
    if (aProtected !== bProtected) return aProtected ? 1 : -1;
    const time = (Number(own.records[a] && own.records[a].lastScanAt) || 0)
      - (Number(own.records[b] && own.records[b].lastScanAt) || 0);
    return time || a.localeCompare(b);
  });
  for (const id of ids.slice(0, Math.max(0, ids.length - SIGNAL_RECORD_CAP))) {
    if (id !== own.trackedId && !own.completed[id]) delete own.records[id];
  }
}

function cloneSignalRecord(record) {
  if (!record || typeof record !== 'object') return null;
  return { ...record, pos: pos2(record.pos) };
}

function cloneSignalReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return null;
  return { ...receipt, pos: pos2(receipt.pos) };
}

function cloneSignalState(own) {
  const records = {};
  const completed = {};
  for (const [id, row] of Object.entries(own.records || {})) {
    const clone = cloneSignalRecord(row);
    if (clone) records[id] = clone;
  }
  for (const [id, receipt] of Object.entries(own.completed || {})) {
    const clone = cloneSignalReceipt(receipt);
    if (clone) completed[id] = clone;
  }
  return {
    schemaVersion: 1,
    records,
    completed,
    receipts: (own.receipts || []).map(cloneSignalReceipt).filter(Boolean).slice(-SIGNAL_RECEIPT_CAP),
    trackedId: own.trackedId && records[own.trackedId] && !completed[own.trackedId] ? own.trackedId : null,
  };
}

function normalizeSignalState(data) {
  const source = data && typeof data === 'object' ? data : freshSignalState();
  const normalized = freshSignalState();
  for (const [id, row] of Object.entries(source.records || {})) {
    if (!id || !row || typeof row !== 'object') continue;
    normalized.records[id] = cloneSignalRecord({ ...row, id });
  }
  for (const [id, receipt] of Object.entries(source.completed || {})) {
    if (!id || !receipt || typeof receipt !== 'object') continue;
    normalized.completed[id] = cloneSignalReceipt({ ...receipt, signalId: receipt.signalId || id });
  }
  normalized.receipts = (Array.isArray(source.receipts) ? source.receipts : [])
    .map(cloneSignalReceipt).filter(Boolean).slice(-SIGNAL_RECEIPT_CAP);
  normalized.trackedId = source.trackedId && normalized.records[source.trackedId]
    && !normalized.completed[source.trackedId] ? source.trackedId : null;
  pruneSignalRecords(normalized);
  return normalized;
}

export const scanner = {
  name: 'scanner',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this._scratch = [];
    this._cooldownUntil = 0;
    ensureSignalState(this.state);
    this._contactHail = null;
    this._contactHailAvailability = null;
    this._contactHailAvailabilitySignature = '';
    this._contactHailNextPollTick = 0;
    this._contactHailLastTargetId = undefined;
    this._onSignalTrack = (payload) => this._trackSignal(payload || {});
    this._onContactHailRequest = (payload) => this._requestContactHail(payload || {});
    this._onContactHailChoice = (payload) => this._chooseContactHail(payload || {});
    this._onContactHailReset = () => this._resetContactHail('lifecycle');
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('signal:track', this._onSignalTrack);
      this.bus.on('contactHail:request', this._onContactHailRequest);
      this.bus.on('contactHail:choice', this._onContactHailChoice);
      this.bus.on('game:new', this._onContactHailReset);
      this.bus.on('game:load', this._onContactHailReset);
      this.bus.on('dock:docked', this._onContactHailReset);
      this.bus.on('mode:changed', this._onContactHailReset);
    }
  },

  newGame() {
    this._resetContactHail('new_game');
    if (this.state) this.state.signalInvestigation = freshSignalState();
  },

  update(_dt, state) {
    this._updateContactHail(state);
    if (state.mode !== 'flight') return;
    this._updateTrackedSignal(state);
    const actions = state.input && state.input.actions;
    if (!actions?.scanPulse) return;
    actions.scanPulse = false;

    const now = state.simTime || 0;
    if (now < this._cooldownUntil) return;

    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.alive) return;

    this._cooldownUntil = now + PULSE_COOLDOWN_S;
    this._pulse(state, player, now);
  },

  _pulse(state, player, now) {
    const sectorId = state.world && state.world.currentSectorId || null;
    const origin = pos2(player.pos);
    const profile = scannerProfileForState(state);
    const found = { asteroids: 0, wrecks: 0, anomalies: 0 };
    const candidates = queryNearbyEntities(state, origin, profile.nearRadius, this._scratch, state.entityList);

    this.bus.emit('scan:pulse', { pos: origin });

    for (const entity of candidates) {
      if (!entity || !entity.alive || entity.id === player.id || !entity.pos) continue;
      if (dist(origin, entity.pos) > profile.nearRadius) continue;
      const data = entity.data || (entity.data = {});
      if (entity.type === 'asteroid') {
        data.scanHighlightUntil = now + ASTEROID_HIGHLIGHT_S;
        data.scanOreGlyph = oreGlyphForAsteroid(entity);
        found.asteroids++;
      } else if (isWreckLike(entity)) {
        data.pingedUntil = now + profile.pingPersistS;
        // Scan-resolve the derelict: the strip's "??? UNSCANNED" ghost fills in with a manifest +
        // a weak-point callout (GDD 2.0 §7.4 "scanning resolves the outline into a manifest").
        data.scanned = true;
        data.manifest = buildWreckManifest(entity);
        if (!data.weakPoint) data.weakPoint = weakPointFor(entity);
        found.wrecks++;
      } else if (isCargoLike(entity)) {
        data.pingedUntil = now + profile.pingPersistS;
      } else if (isAnomalyLike(entity)) {
        data.pingedUntil = now + profile.pingPersistS;
        found.anomalies++;
      }
    }

    // Weak-point reveal (BP-02): a pulse exposes the soft spot on nearby LARGE hostiles so the HUD can
    // guide the player to flank it. Flag-gated (`combat.weakPoints`, OFF in the golden) and reveal-only
    // — the arc itself is deterministic data (weakPoints.js); nothing is written onto the sim entity.
    if (combatFlag('weakPoints')) {
      const playerTeam = player.team;
      for (const entity of candidates) {
        if (!entity || !entity.alive || entity.id === player.id || !entity.pos) continue;
        if (entity.type !== 'ship' && entity.type !== 'drone') continue;
        if (dist(origin, entity.pos) > profile.nearRadius) continue;
        if (!isHostileToPlayer(entity, playerTeam, state)) continue;
        const wp = weakPointForEntity(entity);
        if (wp) this.bus.emit('scan:weakPoint', {
          entityId: entity.id,
          label: wp.label,
          hint: wp.hint,
          until: now + profile.pingPersistS,
        });
      }
    }

    if (sectorId) this._pingHiddenPois(state, sectorId, origin, profile.hiddenPoiRadius);
    const signals = this._scanSignals(state, sectorId, origin, now, candidates, profile);
    this.bus.emit('scan:completed', { targetId: null, sectorId, found, signalCount: signals.length });
    if (signals.length) this.bus.emit('signal:scanResults', {
      sectorId,
      scannedAt: now,
      primary: { ...signals[0], pos: { ...signals[0].pos } },
      signals: signals.map((row) => ({ ...row, pos: { ...row.pos } })),
      total: signals.length,
    });
  },

  _pingHiddenPois(state, sectorId, origin, scanRadius = HIDDEN_POI_RADIUS) {
    const active = state.world && state.world.activeSector;
    for (const poi of active && active.pois || []) {
      if (!poi || !(poi.hidden || poi.type === 'anomaly')) continue;
      const entity = state.entities && state.entities.get && state.entities.get(poi.id);
      const pos = entity && entity.pos || poi.pos;
      if (!pos || dist(origin, pos) > scanRadius) continue;
      upsertUnknownPing(state, sectorId, {
        id: poi.poiId || `poi_${poi.id}`,
        pos,
        kind: 'unknown',
      });
    }
  },

  _scanSignals(state, sectorId, origin, now, candidates, profile = scannerProfileForState(state)) {
    const own = ensureSignalState(state);
    const raw = collectSignalCandidates(state, sectorId, origin, candidates, profile);
    const rows = [];
    for (const candidate of raw) {
      if (own.completed[candidate.id]) continue;
      const previous = own.records[candidate.id] || null;
      const scanCount = (previous && previous.scanCount || 0) + 1;
      const stage = signalClassificationStage(scanCount, candidate.distance);
      const strength = signalStrengthFor(candidate.distance, candidate.range);
      const confidence = Math.min(0.98, 0.24 + (stage - 1) * 0.27 + strength * 0.2);
      const record = {
        id: candidate.id,
        sectorId,
        sourceKind: candidate.kind,
        sourceId: candidate.sourceId || null,
        entityId: candidate.entityId || null,
        pos: pos2(candidate.pos),
        classification: signalClassLabel(candidate.kind, stage),
        detail: signalDetail(candidate.kind, stage),
        stage,
        confidence: Number(confidence.toFixed(3)),
        strength: Number(strength.toFixed(3)),
        distance: Math.round(candidate.distance),
        range: candidate.range,
        scanCount,
        firstSeenAt: previous ? previous.firstSeenAt : now,
        lastScanAt: now,
        bestDistance: Math.min(
          previous && Number.isFinite(Number(previous.bestDistance)) ? Number(previous.bestDistance) : Infinity,
          candidate.distance,
        ),
        status: previous && previous.status === 'tracked' ? 'tracked' : 'detected',
      };
      own.records[record.id] = record;
      rows.push(record);
    }
    rows.sort(compareSignalRows);
    pruneSignalRecords(own);
    return rows.slice(0, 6);
  },

  _trackSignal(payload) {
    const state = this.state;
    const own = state && ensureSignalState(state);
    const id = String(payload.signalId || payload.id || '');
    const record = own && own.records[id];
    if (!record || own.completed[id] || !record.pos) return false;
    if (own.trackedId && own.records[own.trackedId]) own.records[own.trackedId].status = 'detected';
    own.trackedId = id;
    record.status = 'tracked';
    const course = {
      pos: { x: record.pos.x, z: record.pos.z },
      targetEntityId: record.entityId,
      label: record.classification,
      reason: `Investigate ${record.classification.toLowerCase()}`,
      waypointKind: 'signal',
      arrivalRadius: SIGNAL_INVESTIGATE_RADIUS,
      autopilot: true,
    };
    this.bus.emit('ui:setCourse', course);
    this.bus.emit('signal:tracked', { ...record, pos: { ...record.pos }, course });
    return true;
  },

  _requestContactHail(payload) {
    const state = this.state;
    const availability = contactHailAvailability(state);
    if (!availability.enabled || payload.targetId != null && payload.targetId !== availability.targetId) {
      this._clearContactHail('request_invalid');
      return false;
    }
    if (availability.kind === 'toll') {
      const demand = pirateParleyDemandForHandoff(availability.parley);
      if (!demand || !(Number(demand.deadlineAt) > Number(state.simTime || 0))) {
        this._clearContactHail('parley_invalid');
        return false;
      }
      this._clearContactHail('parley_handoff');
      this.bus.emit('contactHail:handoff', {
        targetId: availability.targetId,
        squadId: demand.squadId,
      });
      // Reuse the shipped presenter and its COMPLY / REFUSE / RUN intents verbatim. Scanner does
      // not become a second payment, hostility, or escape authority.
      this.bus.emit('pirateParley:demand', demand);
      return true;
    }
    const now = Number(state.simTime) || 0;
    const requestId = `contact-hail:${availability.kind}:${String(availability.targetId)}:${state.tick | 0}:${Math.round(now * 1000)}`;
    const offer = createContactHailOffer(
      state,
      availability,
      requestId,
      now + CONTACT_HAIL_REQUEST_TTL_S,
    );
    if (!offer) {
      this._clearContactHail('offer_invalid');
      return false;
    }
    this._contactHail = offer;
    this.bus.emit('contactHail:offer', cloneContactHailPayload(offer));
    return true;
  },

  _chooseContactHail(payload) {
    const active = this._contactHail;
    if (!active || payload.requestId !== active.requestId) return false;
    const state = this.state;
    const now = Number(state && state.simTime) || 0;
    const availability = contactHailAvailability(state);
    const valid = now < Number(active.expiresAt)
      && payload.targetId === active.targetId
      && availability.enabled
      && availability.targetId === active.targetId
      && availability.kind === active.kind;
    if (!valid) {
      this._clearContactHail('choice_invalid');
      return false;
    }
    const target = availability.entity;
    const ai = target && target.data && target.data.ai || {};
    const wanted = isPlayerWanted(state);
    const response = createContactHailResponse(state, active, payload.choice, {
      wanted,
      weaponsAuthorized: wanted || ai.securityTargetId === state.playerId,
      roe: ai.roe || null,
    });
    if (!response) return false;
    this._contactHail = null;
    this.bus.emit('contactHail:response', cloneContactHailPayload(response));
    return true;
  },

  _updateContactHail(state) {
    const active = this._contactHail;
    const now = Number(state && state.simTime) || 0;
    // Expiry remains exact at the fixed-step cadence; range/classification work sleeps at 5 Hz.
    if (active && now >= Number(active.expiresAt)) this._clearContactHail('expired');

    const targetId = state && state.player && state.player.targetId;
    const targetDirty = targetId !== this._contactHailLastTargetId;
    const tick = state && state.tick | 0;
    if (!targetDirty && tick < this._contactHailNextPollTick) return;

    const availability = contactHailAvailability(state);
    this._contactHailLastTargetId = targetId;
    this._contactHailNextPollTick = tick + CONTACT_HAIL_POLL_TICKS;
    this._publishContactHailAvailability(availability);

    const current = this._contactHail;
    if (current && (!availability.enabled
      || availability.targetId !== current.targetId
      || availability.kind !== current.kind)) {
      this._clearContactHail('availability_lost');
    }
  },

  _publishContactHailAvailability(availability) {
    const publicView = {
      enabled: availability && availability.enabled === true,
      reason: availability && availability.reason || null,
      targetId: availability && availability.targetId != null ? availability.targetId : null,
      kind: availability && availability.kind || null,
      label: availability && availability.label || 'HAIL',
    };
    const signature = `${publicView.enabled}:${String(publicView.targetId)}:${publicView.kind}:${publicView.reason}:${publicView.label}`;
    this._contactHailAvailability = publicView;
    if (signature === this._contactHailAvailabilitySignature) return false;
    this._contactHailAvailabilitySignature = signature;
    this.bus.emit('contactHail:availability', { ...publicView });
    return true;
  },

  _resetContactHail(reason) {
    this._clearContactHail(reason);
    this._contactHailAvailability = null;
    this._contactHailAvailabilitySignature = '';
    this._contactHailNextPollTick = 0;
    this._contactHailLastTargetId = undefined;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('contactHail:availability', {
        enabled: false, reason, targetId: null, kind: null, label: 'HAIL',
      });
    }
  },

  _clearContactHail(reason) {
    if (!this._contactHail) return false;
    const previous = this._contactHail;
    this._contactHail = null;
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('contactHail:clear', {
        requestId: previous.requestId,
        targetId: previous.targetId,
        reason,
      });
    }
    return true;
  },

  _updateTrackedSignal(state) {
    const own = ensureSignalState(state);
    const record = own.trackedId && own.records[own.trackedId];
    if (!record || own.completed[record.id]) return;
    const sectorId = state.world && state.world.currentSectorId;
    if (record.sectorId && sectorId && record.sectorId !== sectorId) return;
    const player = state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!player || !player.alive || !player.pos) return;
    const target = record.entityId && state.entities && state.entities.get && state.entities.get(record.entityId);
    const pos = target && target.pos || record.pos;
    if (!pos) return;
    record.pos = pos2(pos);
    const distance = dist(player.pos, pos);
    record.distance = Math.round(distance);
    if (distance > SIGNAL_INVESTIGATE_RADIUS) return;
    const receipt = {
      id: `signal-receipt:${record.id}`,
      signalId: record.id,
      sectorId: record.sectorId,
      classification: record.classification,
      sourceKind: record.sourceKind,
      sourceId: record.sourceId,
      entityId: record.entityId,
      pos: { ...record.pos },
      outcome: 'investigated',
      completedAt: Number(state.simTime) || 0,
    };
    own.completed[record.id] = receipt;
    own.receipts.push(receipt);
    while (own.receipts.length > SIGNAL_RECEIPT_CAP) own.receipts.shift();
    record.status = 'investigated';
    own.trackedId = null;
    this.bus.emit('signal:investigated', { ...receipt, pos: { ...receipt.pos } });
    this.bus.emit('signal:receipt', { ...receipt, pos: { ...receipt.pos } });
  },

  serialize() {
    const own = ensureSignalState(this.state);
    return cloneSignalState(own);
  },

  deserialize(data) {
    this._resetContactHail('load');
    this.state.signalInvestigation = normalizeSignalState(data);
  },

  destroy() {
    if (this.bus && typeof this.bus.off === 'function') {
      if (this._onSignalTrack) this.bus.off('signal:track', this._onSignalTrack);
      if (this._onContactHailRequest) this.bus.off('contactHail:request', this._onContactHailRequest);
      if (this._onContactHailChoice) this.bus.off('contactHail:choice', this._onContactHailChoice);
      if (this._onContactHailReset) {
        this.bus.off('game:new', this._onContactHailReset);
        this.bus.off('game:load', this._onContactHailReset);
        this.bus.off('dock:docked', this._onContactHailReset);
        this.bus.off('mode:changed', this._onContactHailReset);
      }
    }
    this._contactHail = null;
    this._contactHailAvailability = null;
    this._contactHailAvailabilitySignature = '';
    this._onSignalTrack = null;
    this._onContactHailRequest = null;
    this._onContactHailChoice = null;
    this._onContactHailReset = null;
  },
};

function cloneContactHailPayload(payload) {
  return {
    ...payload,
    lines: Array.isArray(payload.lines) ? payload.lines.slice(0, 2) : [],
    actions: Array.isArray(payload.actions)
      ? payload.actions.slice(0, 2).map((row) => ({ ...row }))
      : [],
  };
}

// ── Contact classification (Radar & Contacts — on-demand threat list) ────────────────────────
// Pure, allocation-free readers the HUD contacts strip (hud.js updateOverview) uses to turn a live
// entity into an at-a-glance threat readout: a mass-based tier, a one-word state, and a
// scanned/unscanned gate for derelicts. Kept next to the scan pulse that resolves them so the
// "what is this contact" logic has a single home (goal: "Lives in radar.js and scanner.js").

const THREAT_MASS_TIERS = [300, 1200, 4000]; // mass thresholds for tier 1 / 2 / 3

export function contactMass(e) {
  if (!e) return 0;
  if (typeof e.mass === 'number') return e.mass;
  return (e.data && typeof e.data.mass === 'number') ? e.data.mass : 0;
}

// 0..3 threat tier. Mass sets the base ("how much hull is pointed at you"); a hostile contact is
// floored at tier 1 so even a light interceptor reads as a live threat (the "+ faction" term).
export function contactThreatTier(e, hostile) {
  const m = contactMass(e);
  let tier = 0;
  for (let i = 0; i < THREAT_MASS_TIERS.length; i++) if (m >= THREAT_MASS_TIERS[i]) tier = i + 1;
  if (hostile && tier < 1) tier = 1;
  return tier;
}

export function isHostileToPlayer(e, playerTeam, state) {
  if (!e || e.team === playerTeam || e.team === 0) return false;
  const playerId = state && state.playerId;
  const data = e.data || {};
  const ai = data.ai || null;
  const combat = data.combat || null;
  const intent = data.intent || null;
  const targetsPlayer = !!(combat && playerId != null && (combat.targetId === playerId || combat.lockTarget === playerId));
  if (ai && ai.passive) return false;
  if (e.team === 2) return false;
  // A live incident response is narrower than global WANTED heat: a patrol may identify the
  // specific ship that just attacked inside its jurisdiction, including before one hit crosses
  // the WANTED threshold. No securityTargetId means the canonical heat gate remains authoritative.
  if (ai && ai.lawful) return ai.securityTargetId === playerId || isPlayerWanted(state);
  if (ai && ai.retaliationTargetId === playerId) return true;
  if (ai && Array.isArray(ai.hostileTeams) && ai.hostileTeams.includes(playerTeam)) return true;
  if (targetsPlayer) return true;
  if (intent && intent.fire && targetsPlayer) return true;
  if (ai && (ai.forcePlayerTarget || ai.huntPlayer)) return true;
  if (data.encounter) return true;
  const context = String((ai && (ai.spawnContext || ai.context)) || '');
  if (PLAYER_DANGER_CONTEXTS.has(context)) return true;
  const archetype = String((ai && (ai.archetype || ai.doctrine || ai.role)) || data.role || data.scenarioRole || '').toLowerCase();
  if (archetype.includes('trad') || archetype.includes('miner') || archetype.includes('civilian')) return false;
  if (context !== 'ambient' && archetype.includes('pirate')) return true;
  const security = finiteNumber(ai && ai.sectorSecurity, currentSectorSecurity(state));
  const tier = finiteNumber(ai && ai.sectorTier, currentSectorTier(state));
  if ((security <= UNSAFE_PLAYER_SECURITY || tier >= 2) && playerIsInLaneDanger(state)) return true;
  return false;
}

// One-word contact state for the strip. Derelicts read DERELICT; player-aligned ships WINGMAN/ALLY;
// opposing ships resolve to HOSTILE / PATROL / HAULER / COURIER / MINER via trafficRole + AI signals,
// with a plain team fallback so a contact never renders blank (respects the "one word" contract).
// Intent is the operational role (who they are / what they're doing), not a prose wall.
export function contactStateWord(e, playerTeam, state) {
  if (isWreckLike(e)) return 'DERELICT';
  if (e && e.data && e.data.echoOfPlayer === true) return 'ECHO';
  const playerId = state && state.playerId;
  if (e.team === 0 && e.id !== playerId) return (e.data && e.data.isWingman) ? 'WINGMAN' : 'ALLY';
  const data = e.data || {};
  const ai = data.ai;
  const combat = data.combat;
  const targetsPlayer = !!(combat && playerId != null && combat.targetId === playerId);
  const attacking = !!(ai && (ai.fsm === 'attack' || ai.fsm === 'pursue' || ai.fsm === 'strafe'));
  if ((attacking || targetsPlayer) && isHostileToPlayer(e, playerTeam, state)) return 'HOSTILE';

  // Traffic / encounter role is the primary readability channel (faction lives on the faction chip).
  const trafficRole = String(data.trafficRole || data.role || (ai && ai.encounterRole) || '').toLowerCase();
  if (trafficRole === 'patrol' || trafficRole === 'escort') return trafficRole === 'escort' ? 'ESCORT' : 'PATROL';
  if (trafficRole === 'miner' || trafficRole === 'mining' || trafficRole === 'mining_barge') return 'MINER';
  if (trafficRole === 'courier') return 'COURIER';
  if (trafficRole === 'hauler' || trafficRole === 'freighter') return 'HAULER';
  if (trafficRole === 'smuggler') return 'SMUGGLER';
  if (trafficRole === 'rescue') return 'RESCUE';
  if (trafficRole === 'pirate' || trafficRole === 'raider') {
    return isHostileToPlayer(e, playerTeam, state) ? 'HOSTILE' : 'RAIDER';
  }

  if (ai) {
    if (ai.lawful) return 'PATROL';
    const ctx = String(ai.spawnContext || ai.context || '');
    if (ctx === 'patrol') return 'PATROL';
    if (ctx === 'convoy_civilian') return 'HAULER';
    if (ai.passive) return 'TRADER';
    const arch = String(ai.archetype || '');
    if (arch.includes('min')) return 'MINER';
    if (arch.includes('trad')) return 'TRADER';
  }
  if (isHostileToPlayer(e, playerTeam, state)) return 'HOSTILE';
  return 'NEUTRAL';
}

function currentSector(state) {
  const world = state && state.world;
  const id = world && world.currentSectorId;
  return id && world && world.sectors ? world.sectors[id] : null;
}

function currentSectorSecurity(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.security) ? sector.security : 1;
}

function currentSectorTier(state) {
  const sector = currentSector(state);
  return Number.isFinite(sector && sector.tier) ? sector.tier : 0;
}

function finiteNumber(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function playerIsInLaneDanger(state) {
  const player = state && state.entities && state.entities.get ? state.entities.get(state.playerId) : null;
  const active = state && state.world && state.world.activeSector;
  const gates = active && Array.isArray(active.gates) ? active.gates : [];
  const hazards = active && Array.isArray(active.hazards) ? active.hazards : [];
  if (!player || !player.pos) return false;
  const inner2 = LANE_CONTEXT_INNER_R * LANE_CONTEXT_INNER_R;
  const outer2 = LANE_CONTEXT_OUTER_R * LANE_CONTEXT_OUTER_R;
  for (const gate of gates) {
    if (!gate || !gate.pos) continue;
    const dx = player.pos.x - gate.pos.x;
    const dz = player.pos.z - gate.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= inner2 && d2 <= outer2) return true;
  }
  for (const hazard of hazards) {
    if (!hazard || !hazard.center || !Number.isFinite(hazard.radius)) continue;
    const dx = player.pos.x - hazard.center.x;
    const dz = player.pos.z - hazard.center.z;
    const radius = Math.max(0, hazard.radius);
    if (dx * dx + dz * dz <= radius * radius) return true;
  }
  return false;
}

// Has a derelict/wreck been scan-resolved (manifest known)? Unscanned wrecks show only a ghost
// outline in the strip; a scan pulse fills in the manifest + weak point.
export function wreckScanned(e) {
  return !!(e && e.data && e.data.scanned);
}

export { isWreckLike };
