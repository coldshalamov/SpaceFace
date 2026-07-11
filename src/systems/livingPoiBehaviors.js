// Milestone 4 — six deterministic POI behavior families.
//
// This system owns only state.livingPoiBehaviors. It observes existing physical verbs and emits
// consequence intents through the economy/faction/mission authorities. It never spawns actors,
// authorizes hostility, writes cargo, or fires weapons. Named-zone presence and combat remain owned
// by world/encounterDirector/AI; this layer gives places causal interaction and durable aftermath.

import { hash32 } from '../core/rng.js';
import { zonesForSector, zoneAt } from '../data/sectorZones.js';
import { globalToSectorLocalForSector, sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { SECTORS } from '../data/sectors.js';
import { POI_BEHAVIOR_FAMILIES, POI_FAMILY_IDS } from '../data/poiBehaviorFamilies.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const DAY_SECONDS = 600;
const PLAN_BUDGET = 12;
const RECEIPT_CAP = 48;
const HIGH_SECURITY = 0.85;

export function poiBehaviorFingerprint(row) {
  if (!row || typeof row !== 'object') return 'pb_0';
  return 'pb_' + hash32(
    row.behaviorId,
    row.familyId,
    row.sectorId,
    row.zoneId,
    row.dayIndex,
    row.dangerMode,
    row.contract && row.contract.verb,
    row.contract && row.contract.required,
  ).toString(36);
}

/** Pure planner: one bounded representative per family, never two families on one zone. */
export function planPoiBehaviors({ seed = 1, sectorId, dayIndex = 0, zones = [], sector = null } = {}) {
  if (!sectorId || !Array.isArray(zones) || zones.length === 0) return [];
  const definition = sector || SECTOR_BY_ID.get(sectorId) || { id: sectorId, security: 0.5, stations: [] };
  const security = Number.isFinite(definition.security) ? definition.security : 0.5;
  const stations = Array.isArray(definition.stations) ? definition.stations : [];
  const usedZones = new Set();
  const out = [];
  let spent = 0;

  for (const familyId of POI_FAMILY_IDS) {
    const family = POI_BEHAVIOR_FAMILIES[familyId];
    const candidates = zones
      .filter((zone) => zone && zone.id && family.zoneTypes.includes(zone.type) && !usedZones.has(zone.id))
      .slice()
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    if (!candidates.length || spent + family.budgetCost > PLAN_BUDGET) continue;
    const index = hash32(seed, sectorId, dayIndex, familyId, 'poi-family') % candidates.length;
    const zone = candidates[index];
    usedZones.add(zone.id);
    spent += family.budgetCost;
    const station = selectStationForFamily(stations, zone, familyId);
    const behaviorId = `poib:${sectorId}:${dayIndex}:${familyId}`;
    const dangerMode = familyId === 'pirate_contested_nest' && security >= HIGH_SECURITY
      ? 'jurisdiction_suppressed'
      : family.dangerMode;
    const row = {
      behaviorId,
      familyId,
      sectorId,
      dayIndex,
      zoneId: zone.id,
      zoneName: zone.name || zone.id,
      zoneType: zone.type,
      zoneCenter: zone.center ? { x: Number(zone.center.x) || 0, z: Number(zone.center.z) || 0 } : { x: 0, z: 0 },
      zoneRadius: Number(zone.radius) || 400,
      threat: Number.isFinite(zone.threat) ? zone.threat : 0,
      factionId: zone.factionId || null,
      beneficiaryFactionId: zone.factionId || (station && station.factionId) || definition.factionId || null,
      stationId: station && station.id || null,
      budgetCost: family.budgetCost,
      dangerMode,
      canAutoAggro: false,
      entryLine: family.entryLine,
      mapLabel: family.mapLabel,
      radarKind: family.radarKind,
      affordance: family.contract.verb,
      status: 'available',
      progress: 0,
      contract: {
        verb: family.contract.verb,
        required: family.contract.required,
        targetKind: family.contract.targetKind,
        cause: family.contract.cause,
        objective: family.contract.objective,
        resolutionEvent: family.contract.resolutionEvent,
        successOutcome: family.contract.successOutcome,
        channels: family.contract.channels.slice(),
      },
    };
    row.fingerprint = poiBehaviorFingerprint(row);
    out.push(row);
  }
  return out;
}

export const livingPoiBehaviors = {
  name: 'livingPoiBehaviors',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus || null;
    this.helpers = ctx.helpers || (ctx.helpers = {});
    this._unsubs = [];
    ensureState(this.state);
    this._listen('sector:enter', (payload) => {
      if (payload && (payload.continuous || payload.noTeleport)) return;
      const sectorId = payload && payload.sectorId || this.state.world && this.state.world.currentSectorId;
      if (sectorId) this.planSector(sectorId);
    });
    this._listen('world:zoneEntered', (payload) => this._onZoneEntered(payload || {}));
    this._listen('poi:interact', (payload) => this._interact(payload && payload.zoneId, payload && payload.verb, payload || {}));
    this._listen('dock:docked', (payload) => this._interactFamily('lawful_station_yard', 'dock', payload || {}));
    this._listen('mining:yield', (payload) => this._interactAt('mine', payload || {}));
    this._listen('salvage:completed', (payload) => this._onSalvageCompleted(payload || {}));
    this._listen('scan:pulse', (payload) => this._interactAt('triangulate', payload || {}));
    this._listen('encounter:resolved', (payload) => this._onEncounterResolved(payload || {}));
    this._listen('entity:killed', (payload) => this._onEntityKilled(payload || {}));
    this._listen('contraband:scanned', (payload) => this._onContrabandScanned(payload || {}));
    this._listen('cargo:changed', (payload) => this._onCargoChanged(payload || {}));
  },

  _listen(event, fn) {
    if (!this.bus || typeof this.bus.on !== 'function') return;
    const unsub = this.bus.on(event, fn);
    if (typeof unsub === 'function') this._unsubs.push(unsub);
  },

  _emit(event, payload) {
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit(event, payload);
  },

  newGame() {
    this.state.livingPoiBehaviors = freshState();
  },

  // Event-driven by design: no timers can silently turn ambience into combat.
  update() {},

  planSector(sectorId, options = {}) {
    const own = ensureState(this.state);
    const dayIndex = Number.isInteger(options.dayIndex)
      ? options.dayIndex
      : Math.floor((this.state.simTime || 0) / DAY_SECONDS);
    const sector = options.sector || sectorOf(this.state, sectorId);
    const zones = options.zones || zonesForSector(sectorId);
    const rows = planPoiBehaviors({
      seed: this.state.meta && this.state.meta.seed || 1,
      sectorId,
      dayIndex,
      zones,
      sector,
    });
    const priorZoneId = own.activeSectorId === sectorId ? own.currentZoneId : null;
    own.activeSectorId = sectorId;
    own.plannedDayIndex = dayIndex;
    own.currentZoneId = null;
    own.activeByZone = {};
    for (const row of rows) {
      const aftermath = own.aftermath[row.behaviorId];
      if (aftermath && aftermath.expiresDay >= dayIndex) {
        row.status = 'aftermath';
        row.mapLabel = `${row.mapLabel} · ${aftermath.kind.replaceAll('_', ' ').toUpperCase()}`;
      } else if (aftermath) {
        delete own.aftermath[row.behaviorId];
      }
      own.activeByZone[row.zoneId] = row;
      this._annotateNearestAnchor(row);
      this._emit('poi:behaviorPlanned', readoutOf(row));
    }
    if (priorZoneId && own.activeByZone[priorZoneId]) own.currentZoneId = priorZoneId;
    return rows;
  },

  _onZoneEntered(payload) {
    const own = ensureState(this.state);
    const row = own.activeByZone[payload.zoneId];
    own.currentZoneId = payload.zoneId || null;
    if (!row) return;
    if (row.status === 'aftermath') {
      this._emit('poi:behaviorReadout', readoutOf(row));
      return;
    }
    if (row.status === 'available') row.status = 'entered';
    this._emit('poi:behaviorReadout', readoutOf(row));
    if (own.entered[row.behaviorId]) return;
    own.entered[row.behaviorId] = true;
    const voice = this.helpers && this.helpers.voice;
    if (voice && typeof voice.say === 'function') {
      voice.say({ channel: 'news', text: row.entryLine, kind: 'poi-behavior' });
    }
  },

  _interactAt(verb, payload) {
    const zoneId = payload.zoneId || this._zoneIdAt(payload.pos) || ensureState(this.state).currentZoneId;
    this._interact(zoneId, verb, payload);
  },

  _interactFamily(familyId, verb, payload) {
    const own = ensureState(this.state);
    const row = Object.values(own.activeByZone).find((item) => item.familyId === familyId);
    if (row) this._interact(row.zoneId, verb, payload);
  },

  _interact(zoneId, verb, payload) {
    const own = ensureState(this.state);
    const row = zoneId && own.activeByZone[zoneId];
    if (!row || row.status === 'aftermath' || row.status === 'resolved') return false;
    if (verb !== row.contract.verb) return false;
    if (row.familyId === 'anomaly_research') {
      if (!payload || !payload.pos) return false;
      const local = this._localPosition(payload.pos);
      row._bearings = row._bearings || [];
      if (row._bearings.some((point) => dist2(point, local) < 180 * 180)) return false;
      row._bearings.push(local);
    }
    row.progress = Math.min(row.contract.required, (row.progress || 0) + 1);
    row.status = 'engaged';
    this._emit('poi:behaviorProgress', {
      behaviorId: row.behaviorId,
      familyId: row.familyId,
      zoneId: row.zoneId,
      verb,
      progress: row.progress,
      required: row.contract.required,
    });
    if (row.progress >= row.contract.required) this._resolve(row, row.contract.successOutcome, payload);
    return true;
  },

  _resolve(row, outcome, payload = {}) {
    const own = ensureState(this.state);
    if (!row || row.status === 'resolved' || own.aftermath[row.behaviorId]) return false;
    const family = POI_BEHAVIOR_FAMILIES[row.familyId];
    if (!family) return false;
    const dayIndex = Math.max(
      ensureState(this.state).plannedDayIndex || 0,
      Math.floor((this.state.simTime || 0) / DAY_SECONDS),
    );
    const aftermath = {
      behaviorId: row.behaviorId,
      familyId: row.familyId,
      sectorId: row.sectorId,
      zoneId: row.zoneId,
      kind: family.aftermath.kind,
      outcome,
      resolvedAt: Number(this.state.simTime) || 0,
      resolvedDay: dayIndex,
      expiresDay: dayIndex + family.aftermath.persistsDays,
      cause: row.contract.cause,
      fingerprint: row.fingerprint,
    };
    own.aftermath[row.behaviorId] = aftermath;
    row.status = 'resolved';
    row.outcome = outcome;
    own.receipts.push({
      behaviorId: row.behaviorId,
      familyId: row.familyId,
      sectorId: row.sectorId,
      zoneId: row.zoneId,
      outcome,
      t: aftermath.resolvedAt,
    });
    if (own.receipts.length > RECEIPT_CAP) own.receipts.splice(0, own.receipts.length - RECEIPT_CAP);
    this._emitConsequences(row, outcome, payload);
    this._emit('poi:behaviorOutcome', { ...aftermath, mapLabel: row.mapLabel, radarKind: row.radarKind });
    return true;
  },

  _emitConsequences(row, outcome, payload) {
    const commodityId = payload.commodityId || 'cmdty_refined_metals';
    switch (row.familyId) {
      case 'lawful_station_yard':
        if (row.beneficiaryFactionId) this._emit('faction:repDelta', {
          factionId: row.beneficiaryFactionId,
          delta: outcome === 'flagged' ? -2 : 1,
          reason: `poi:${outcome}`,
        });
        break;
      case 'mining_field':
        if (row.stationId) this._emit('economy:applyTradePressure', {
          stationId: row.stationId,
          good: commodityId,
          vol: Math.max(1, Math.min(5, Number(payload.qty) || row.contract.required)),
        });
        break;
      case 'derelict_salvage':
        this._emitMissionLead(row, 'salvage_retrieval', 'Recovered records point to another registered loss.');
        break;
      case 'anomaly_research':
        this._emitMissionLead(row, 'recon_scan', 'Stable bearings expose a second research signal.');
        break;
      case 'convoy_industrial_route':
        if (row.stationId) this._emit('economy:applyTradePressure', {
          stationId: row.stationId,
          good: commodityId,
          vol: outcome === 'route_disrupted' ? -8 : 8,
        });
        break;
      case 'pirate_contested_nest':
        if (row.beneficiaryFactionId) this._emit('faction:repDelta', {
          factionId: row.beneficiaryFactionId,
          delta: 4,
          reason: 'poi:nest_broken',
        });
        break;
      default:
        break;
    }
  },

  _emitMissionLead(row, type, summary) {
    this._emit('mission:offered', {
      id: `poi_offer:${row.behaviorId}`,
      source: 'poiBehavior',
      type,
      stationId: row.stationId,
      factionId: row.beneficiaryFactionId,
      title: `${row.zoneName}: ${type === 'recon_scan' ? 'follow the bearing' : 'recover the record'}`,
      summary,
      cause: { tag: `poi:${row.familyId}`, line: row.contract.cause },
      params: { poiBehaviorId: row.behaviorId, zoneId: row.zoneId, required: 1 },
    });
  },

  _onSalvageCompleted(payload) {
    let pos = payload.pos || null;
    if (!pos && payload.wreckId != null && this.state.entities) {
      const wreck = this.state.entities.get(payload.wreckId);
      if (wreck && wreck.pos) pos = wreck.pos;
    }
    this._interactAt('salvage', { ...payload, pos });
  },

  _onEncounterResolved(payload) {
    if (payload.shape !== 'convoy_departure' && payload.shape !== 'trader_run') return;
    const row = ensureState(this.state).activeByZone[payload.zoneId];
    if (!row || row.familyId !== 'convoy_industrial_route') return;
    if (payload.outcome === 'arrived' || payload.outcome === 'guarded') {
      this._interact(row.zoneId, 'escort', payload);
    } else if (payload.outcome === 'lost' || payload.outcome === 'robbed') {
      this._resolve(row, 'route_disrupted', payload);
    }
  },

  _onEntityKilled(payload) {
    if (!payload || payload.killerId !== this.state.playerId) return;
    const victim = payload.id != null && this.state.entities ? this.state.entities.get(payload.id) : null;
    let zoneId = payload.zoneId || this._zoneIdAt(payload.pos);
    if (!zoneId && victim) {
      zoneId = victim && victim.data && victim.data.ai && victim.data.ai.zoneId || this._zoneIdAt(victim && victim.pos);
    }
    const row = zoneId && ensureState(this.state).activeByZone[zoneId];
    if (!row || row.familyId !== 'pirate_contested_nest') return;
    const ai = victim && victim.data && victim.data.ai || {};
    const victimFaction = payload.factionId || victim && victim.factionId || null;
    const hostileContext = ['zone_hostile', 'encounter', 'ambush', 'pirate', 'bounty_hunter'].includes(ai.spawnContext);
    const authoredRaider = !!row.factionId && victimFaction === row.factionId;
    if (ai.passive || ai.lawful || victim && (victim.team === 0 || victim.team === 2)) return;
    if (!hostileContext && !authoredRaider) return;
    this._interact(zoneId, 'clear', payload);
  },

  _onContrabandScanned(payload) {
    if (!payload.found) return;
    const own = ensureState(this.state);
    let zoneId = payload.zoneId || null;
    if (!zoneId && payload.patrolId != null && this.state.entities) {
      const patrol = this.state.entities.get(payload.patrolId);
      zoneId = patrol && patrol.data && patrol.data.ai && patrol.data.ai.zoneId || this._zoneIdAt(patrol && patrol.pos);
    }
    if (!zoneId && payload.stationId && this.state.world && this.state.world.activeSector && this.state.entities) {
      const stationRec = (this.state.world.activeSector.stations || []).find((item) => {
        const entity = item && this.state.entities.get(item.id);
        return entity && entity.data && entity.data.stationId === payload.stationId;
      });
      zoneId = stationRec && this._zoneIdAt(stationRec.pos);
    }
    if (!zoneId) {
      const current = own.activeByZone[own.currentZoneId];
      if (current && current.familyId === 'lawful_station_yard') zoneId = current.zoneId;
    }
    const row = zoneId && own.activeByZone[zoneId];
    if (!row || row.familyId !== 'lawful_station_yard') return;
    if (row && row.status !== 'resolved' && row.status !== 'aftermath') this._resolve(row, 'flagged', payload);
  },

  _onCargoChanged(payload) {
    const own = ensureState(this.state);
    const row = own.activeByZone[own.currentZoneId];
    if (!row || (row.familyId !== 'mining_field' && row.familyId !== 'derelict_salvage')) return;
    this._emit('poi:cargoObserved', {
      behaviorId: row.behaviorId,
      familyId: row.familyId,
      zoneId: row.zoneId,
      usedU: Number(payload.usedU) || 0,
      massT: Number(payload.massT) || 0,
    });
  },

  _zoneIdAt(pos) {
    if (!pos) return null;
    const sectorId = ensureState(this.state).activeSectorId || this.state.world && this.state.world.currentSectorId;
    if (!sectorId) return null;
    const local = globalToSectorLocalForSector(pos, sectorId);
    const zone = zoneAt(sectorId, local.x, local.z);
    return zone && zone.id || null;
  },

  _localPosition(pos) {
    const sectorId = ensureState(this.state).activeSectorId || this.state.world && this.state.world.currentSectorId;
    return globalToSectorLocalForSector(pos || { x: 0, z: 0 }, sectorId);
  },

  _annotateNearestAnchor(row) {
    const active = this.state.world && this.state.world.activeSector;
    if (!active || !this.state.entities || typeof this.state.entities.get !== 'function') return;
    const center = sectorLocalToGlobalForSector(row.zoneCenter, row.sectorId);
    const candidates = [];
    for (const key of ['stations', 'fields', 'pois', 'gates']) {
      for (const item of active[key] || []) {
        if (item && item.id != null && item.pos) candidates.push(item);
      }
    }
    let best = null;
    let bestD2 = row.zoneRadius * row.zoneRadius;
    for (const item of candidates) {
      const d2 = dist2(item.pos, center);
      if (d2 <= bestD2) { best = item; bestD2 = d2; }
    }
    if (!best) return;
    const entity = this.state.entities.get(best.id);
    if (!entity) return;
    entity.data = entity.data || {};
    entity.data.poiBehavior = readoutOf(row);
    row.anchorEntityId = best.id;
  },

  serialize() {
    const own = ensureState(this.state);
    return clonePlain({
      schemaVersion: 1,
      aftermath: own.aftermath,
      receipts: own.receipts.slice(-RECEIPT_CAP),
      entered: own.entered,
    });
  },

  deserialize(data) {
    const source = data && typeof data === 'object' ? data : {};
    this.state.livingPoiBehaviors = {
      ...freshState(),
      aftermath: plainObject(source.aftermath),
      receipts: Array.isArray(source.receipts) ? clonePlain(source.receipts.slice(-RECEIPT_CAP)) : [],
      entered: plainObject(source.entered),
    };
  },

  destroy() {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },
};

function readoutOf(row) {
  return {
    behaviorId: row.behaviorId,
    familyId: row.familyId,
    sectorId: row.sectorId,
    zoneId: row.zoneId,
    zoneName: row.zoneName,
    pos: { x: row.zoneCenter.x, z: row.zoneCenter.z },
    mapLabel: row.mapLabel,
    radarKind: row.radarKind,
    affordance: row.affordance,
    objective: row.contract.objective,
    progress: row.progress || 0,
    required: row.contract.required,
    status: row.status,
    dangerMode: row.dangerMode,
    canAutoAggro: false,
    fingerprint: row.fingerprint,
  };
}

function sectorOf(state, sectorId) {
  return state.world && state.world.sectors && state.world.sectors[sectorId]
    || SECTOR_BY_ID.get(sectorId)
    || null;
}

function selectStationForFamily(stations, zone, familyId) {
  if (!Array.isArray(stations) || stations.length === 0) return null;
  const sameFaction = stations.filter((item) => item && zone && item.factionId === zone.factionId);
  const pool = sameFaction.length ? sameFaction : stations.filter(Boolean);
  const preferred = familyId === 'mining_field'
    ? new Set(['mining', 'refinery'])
    : familyId === 'convoy_industrial_route'
      ? new Set(['trade_hub', 'refinery', 'fab'])
      : familyId === 'anomaly_research'
        ? new Set(['research'])
        : null;
  return preferred && pool.find((item) => preferred.has(item.type)) || pool[0] || null;
}

function freshState() {
  return {
    schemaVersion: 1,
    activeSectorId: null,
    plannedDayIndex: 0,
    currentZoneId: null,
    activeByZone: {},
    aftermath: {},
    receipts: [],
    entered: {},
  };
}

function ensureState(state) {
  if (!state.livingPoiBehaviors || typeof state.livingPoiBehaviors !== 'object') {
    state.livingPoiBehaviors = freshState();
  }
  const own = state.livingPoiBehaviors;
  if (!own.activeByZone || typeof own.activeByZone !== 'object' || Array.isArray(own.activeByZone)) own.activeByZone = {};
  if (!own.aftermath || typeof own.aftermath !== 'object' || Array.isArray(own.aftermath)) own.aftermath = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!own.entered || typeof own.entered !== 'object' || Array.isArray(own.entered)) own.entered = {};
  return own;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? clonePlain(value) : {};
}

function clonePlain(value) {
  return JSON.parse(JSON.stringify(value == null ? null : value));
}

function dist2(a, b) {
  if (!a || !b) return Infinity;
  const dx = (Number(a.x) || 0) - (Number(b.x) || 0);
  const dz = (Number(a.z) || 0) - (Number(b.z) || 0);
  return dx * dx + dz * dz;
}

export default livingPoiBehaviors;
