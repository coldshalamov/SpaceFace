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
import { buildPoiCausalOffer } from '../missions/poiCausalOffers.js';

const SECTOR_BY_ID = new Map(SECTORS.map((sector) => [sector.id, sector]));
const DAY_SECONDS = 600;
const PLAN_BUDGET = 12;
const RECEIPT_CAP = 48;
const HIGH_SECURITY = 0.85;
const SAVE_SCHEMA_VERSION = 2;

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
export function planPoiBehaviors({
  seed = 1,
  sectorId,
  dayIndex = 0,
  zones = [],
  sector = null,
  pinnedByFamily = {},
} = {}) {
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
    const pinnedZoneId = pinnedByFamily && pinnedByFamily[familyId] && pinnedByFamily[familyId].zoneId;
    const pinned = pinnedZoneId ? candidates.find((candidate) => candidate.id === pinnedZoneId) : null;
    const index = hash32(seed, sectorId, dayIndex, familyId, 'poi-family') % candidates.length;
    const zone = pinned || candidates[index];
    usedZones.add(zone.id);
    spent += family.budgetCost;
    const station = selectStationForFamily(stations, zone, familyId);
    const behaviorId = stableBehaviorId(sectorId, familyId, zone.id);
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
    this._listen('sector:enter', (payload) => this._activateSector(payload || {}));
    this._listen('sector:exit', (payload) => this._departSector(payload || {}));
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

  _activateSector(payload = {}) {
    const sectorId = payload.sectorId || this.state.world && this.state.world.currentSectorId;
    if (!sectorId) return [];
    const own = ensureState(this.state);
    const dayIndex = Math.floor((this.state.simTime || 0) / DAY_SECONDS);
    const sameActivation = own.activeSectorId === sectorId
      && own.plannedDayIndex === dayIndex
      && hasActivePlan(own.activeByZone);
    // Continuous membership handoffs may repeat their destination receipt. Preserve the exact live
    // plan (including progress/status) when identity+day already match, but rebuild after Continue
    // because deserialize intentionally restores durable consequences without stale live rows.
    if (sameActivation) return [];
    return this.planSector(sectorId, { dayIndex, sector: payload.sector || sectorOf(this.state, sectorId) });
  },

  _departSector(payload = {}) {
    const own = ensureState(this.state);
    if (payload.sectorId && own.activeSectorId && payload.sectorId !== own.activeSectorId) return false;
    // Departure clears presence only. Aftermath, receipts, entered identities, and the plan remain
    // available until the destination identity activates; no consequence is rolled back here.
    own.currentZoneId = null;
    return true;
  },

  planSector(sectorId, options = {}) {
    const own = ensureState(this.state);
    const dayIndex = Number.isInteger(options.dayIndex)
      ? options.dayIndex
      : Math.floor((this.state.simTime || 0) / DAY_SECONDS);
    const sector = options.sector || sectorOf(this.state, sectorId);
    const zones = options.zones || zonesForSector(sectorId);
    pruneExpiredAftermath(own, dayIndex);
    const pinnedByFamily = activeAftermathPins(own, sectorId, dayIndex);
    const rows = planPoiBehaviors({
      seed: this.state.meta && this.state.meta.seed || 1,
      sectorId,
      dayIndex,
      zones,
      sector,
      pinnedByFamily,
    });
    const priorZoneId = own.activeSectorId === sectorId ? own.currentZoneId : null;
    own.activeSectorId = sectorId;
    own.plannedDayIndex = dayIndex;
    own.currentZoneId = null;
    own.activeByZone = {};
    for (const row of rows) {
      // sectorZones are authored in sector-local coordinates while scanner courses, entities,
      // autopilot, and the seamless world all consume global_v1. Keep the authored coordinate for
      // diagnostics, but expose exactly one composed global position on the live/public row.
      row.zoneLocalCenter = { x: row.zoneCenter.x, z: row.zoneCenter.z };
      row.zoneCenter = sectorLocalToGlobalForSector(row.zoneLocalCenter, row.sectorId);
      const aftermath = own.aftermath[row.behaviorId];
      if (aftermath && aftermath.expiresDay > dayIndex) {
        row.status = 'aftermath';
        row.fingerprint = aftermath.fingerprint;
        row.mapLabel = `${row.mapLabel} · ${aftermath.kind.replaceAll('_', ' ').toUpperCase()}`;
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
      this._publishGuidance(row, 'aftermath', own.aftermath[row.behaviorId] || null);
      return;
    }
    if (row.status === 'available') row.status = 'entered';
    this._emit('poi:behaviorReadout', readoutOf(row));
    if (own.entered[row.behaviorId]) return;
    own.entered[row.behaviorId] = true;
    this._publishGuidance(row, 'approach');
  },

  _interactAt(verb, payload) {
    const zoneId = payload.zoneId || this._zoneIdAt(payload.pos) || ensureState(this.state).currentZoneId;
    this._interact(zoneId, verb, payload);
  },

  _interactFamily(familyId, verb, payload) {
    const own = ensureState(this.state);
    const stationId = payload && payload.stationId != null ? String(payload.stationId) : null;
    const row = Object.values(own.activeByZone).find((item) => (
      item.familyId === familyId
      && (familyId !== 'lawful_station_yard'
        || stationId != null && item.stationId != null && String(item.stationId) === stationId)
    ));
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
    if (row.progress < row.contract.required) this._publishGuidance(row, 'progress');
    else this._resolve(row, row.contract.successOutcome, payload);
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
    this._publishGuidance(row, 'outcome', aftermath);
    return true;
  },

  _publishGuidance(row, phase, aftermath = null) {
    if (!row) return false;
    const family = POI_BEHAVIOR_FAMILIES[row.familyId];
    if (!family) return false;
    const contract = row.contract && row.contract.verb ? row.contract : family.contract;
    const durable = aftermath || ensureState(this.state).aftermath[row.behaviorId] || null;
    const payload = {
      ...readoutOf(row),
      phase,
      dangerMode: row.dangerMode,
      riskLabel: family.riskLabel,
      rewardLabel: family.rewardLabel,
      rewardChannels: contract.channels.slice(),
      aftermathKind: durable && durable.kind || family.aftermath.kind,
      aftermathExpiresDay: durable && durable.expiresDay || null,
      persistsDays: family.aftermath.persistsDays,
    };
    this._emit('poi:behaviorGuidance', payload);

    const label = row.mapLabel.split(' · ')[0];
    let text;
    let kind = 'info';
    if (phase === 'outcome') {
      text = `${label} · ${prettyToken(payload.aftermathKind)} · ${family.rewardLabel}`;
      kind = 'good';
    } else if (phase === 'aftermath') {
      const remaining = Math.max(1, (durable && durable.expiresDay || 0)
        - Math.floor((this.state.simTime || 0) / DAY_SECONDS));
      text = `${label} · ${prettyToken(payload.aftermathKind)} REMAINS · ${remaining}D`;
      kind = 'info';
    } else if (phase === 'progress') {
      text = `${label} · ${prettyToken(contract.verb)} ${row.progress || 0}/${contract.required}`
        + ` · ${family.riskLabel} → ${family.rewardLabel}`;
      kind = row.progress >= contract.required ? 'good' : 'info';
    } else {
      text = `${label} · ${prettyToken(contract.verb)} ${row.progress || 0}/${contract.required}`
        + ` · ${family.riskLabel} → ${family.rewardLabel}`;
      kind = row.dangerMode === 'telegraphed' ? 'warn' : 'info';
    }
    // Resolution receipts must survive a same-tick campaign/tutorial line. A four-second story
    // floor is common on first-hour authority events; keep the durable result live long enough to
    // take the floor afterwards instead of expiring unseen in the arbiter queue.
    const ttl = phase === 'outcome' ? 8 : phase === 'aftermath' ? 6 : phase === 'approach' ? 5 : 3.5;
    const voice = this.helpers && this.helpers.voice;
    const spoken = voice && typeof voice.say === 'function' && voice.say({
      id: `poi:${row.behaviorId}`,
      channel: phase === 'aftermath' ? 'info' : 'objective',
      text,
      kind,
      ttl,
    });
    if (!spoken) this._emit('toast', { text, kind, ttl });
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
        this._emitMissionLead(row, 'Recovered records point to another registered loss.');
        break;
      case 'anomaly_research':
        this._emitMissionLead(row, 'Stable bearings expose a second research signal.');
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

  _emitMissionLead(row, summary) {
    // A resolved derelict/anomaly creates a normal, complete board contract. The pure builder
    // binds the offer to the durable aftermath fingerprint; missions still validates, boards,
    // accepts, spawns, settles, and receipts the work through its ordinary authority path.
    const aftermath = ensureState(this.state).aftermath[row.behaviorId];
    const offer = buildPoiCausalOffer({
      seed: this.state.meta && this.state.meta.seed || 1,
      aftermath,
      stationId: row.stationId,
      factionId: row.beneficiaryFactionId,
      zoneName: row.zoneName,
    });
    if (!offer) return false;
    // Retain the family-authored terse lead when it adds useful context without replacing the
    // causal destination/investigation instruction.
    if (summary) offer.summary = `${summary} ${offer.summary}`;
    this._emit('mission:offered', offer);
    return true;
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
    const center = row.zoneCenter;
    // A lawful-yard contract resolves at one exact authored station. Its public anchor must point
    // at that same station rather than whichever unrelated POI/gate happens to be closer to the
    // broad jurisdiction zone centre.
    if (row.familyId === 'lawful_station_yard' && row.stationId != null) {
      const station = (active.stations || []).find((item) => {
        if (!item || item.id == null) return false;
        if (item.stationId != null) return String(item.stationId) === String(row.stationId);
        const entity = this.state.entities.get(item.id);
        return entity && entity.data && String(entity.data.stationId) === String(row.stationId);
      });
      const entity = station && this.state.entities.get(station.id);
      if (entity) {
        entity.data = entity.data || {};
        entity.data.poiBehavior = readoutOf(row);
        row.anchorEntityId = station.id;
        return;
      }
    }
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
      schemaVersion: SAVE_SCHEMA_VERSION,
      aftermath: own.aftermath,
      receipts: own.receipts.slice(-RECEIPT_CAP),
      entered: own.entered,
    });
  },

  deserialize(data) {
    const source = data && typeof data === 'object' ? data : {};
    const migrated = migrateSavedState(source);
    this.state.livingPoiBehaviors = {
      ...freshState(),
      aftermath: migrated.aftermath,
      receipts: migrated.receipts,
      entered: migrated.entered,
    };
  },

  destroy() {
    for (const unsub of this._unsubs || []) unsub();
    this._unsubs = [];
  },
};

function readoutOf(row) {
  const family = POI_BEHAVIOR_FAMILIES[row.familyId];
  const pos = row.zoneCenter || row.pos || { x: 0, z: 0 };
  const contract = row.contract && row.contract.verb ? row.contract : family && family.contract || {};
  return {
    behaviorId: row.behaviorId,
    familyId: row.familyId,
    sectorId: row.sectorId,
    zoneId: row.zoneId,
    zoneName: row.zoneName,
    pos: { x: Number(pos.x) || 0, z: Number(pos.z) || 0 },
    mapLabel: row.mapLabel,
    radarKind: row.radarKind,
    affordance: row.affordance || contract.verb || null,
    objective: contract.objective || '',
    progress: row.progress || 0,
    required: contract.required || 0,
    status: row.status,
    dangerMode: row.dangerMode,
    riskLabel: family && family.riskLabel || null,
    rewardLabel: family && family.rewardLabel || null,
    rewardChannels: Array.isArray(contract.channels) ? contract.channels.slice() : [],
    aftermathKind: family && family.aftermath.kind || null,
    persistsDays: family && family.aftermath.persistsDays || 0,
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
  const typed = preferred ? pool.filter((item) => preferred.has(item.type)) : pool;
  const candidates = typed.length ? typed : pool;
  const center = zone && zone.center || null;
  return candidates.slice().sort((a, b) => {
    const distanceA = dist2(a && a.pos, center);
    const distanceB = dist2(b && b.pos, center);
    if (distanceA !== distanceB) {
      if (!Number.isFinite(distanceA)) return 1;
      if (!Number.isFinite(distanceB)) return -1;
      return distanceA - distanceB;
    }
    return String(a && a.id || '').localeCompare(String(b && b.id || ''));
  })[0] || null;
}

function freshState() {
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
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
  own.schemaVersion = SAVE_SCHEMA_VERSION;
  if (!own.activeByZone || typeof own.activeByZone !== 'object' || Array.isArray(own.activeByZone)) own.activeByZone = {};
  if (!own.aftermath || typeof own.aftermath !== 'object' || Array.isArray(own.aftermath)) own.aftermath = {};
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!own.entered || typeof own.entered !== 'object' || Array.isArray(own.entered)) own.entered = {};
  return own;
}

function hasActivePlan(activeByZone) {
  if (!activeByZone || typeof activeByZone !== 'object') return false;
  for (const zoneId in activeByZone) if (activeByZone[zoneId]) return true;
  return false;
}

function stableBehaviorId(sectorId, familyId, zoneId) {
  return `poib:${String(sectorId)}:${String(familyId)}:${String(zoneId)}`;
}

function pruneExpiredAftermath(own, dayIndex) {
  for (const [behaviorId, aftermath] of Object.entries(own.aftermath || {})) {
    if (!aftermath || !Number.isFinite(aftermath.expiresDay) || aftermath.expiresDay <= dayIndex) {
      delete own.aftermath[behaviorId];
    }
  }
}

function activeAftermathPins(own, sectorId, dayIndex) {
  const pins = {};
  for (const aftermath of Object.values(own.aftermath || {})) {
    if (!aftermath || aftermath.sectorId !== sectorId || aftermath.expiresDay <= dayIndex) continue;
    const prior = pins[aftermath.familyId];
    if (!prior || compareAftermathAge(aftermath, prior) >= 0) pins[aftermath.familyId] = aftermath;
  }
  return pins;
}

function migrateSavedState(source) {
  const aftermath = {};
  const identityByLegacyId = new Map();
  let ordinal = 0;
  for (const [legacyId, raw] of Object.entries(plainObject(source.aftermath))) {
    ordinal += 1;
    if (!raw || !raw.sectorId || !raw.familyId || !raw.zoneId) continue;
    const behaviorId = stableBehaviorId(raw.sectorId, raw.familyId, raw.zoneId);
    const candidate = { ...clonePlain(raw), behaviorId, _migrationOrdinal: ordinal };
    const prior = aftermath[behaviorId];
    if (!prior || compareAftermathAge(candidate, prior) >= 0) aftermath[behaviorId] = candidate;
    identityByLegacyId.set(legacyId, behaviorId);
  }
  for (const record of Object.values(aftermath)) delete record._migrationOrdinal;

  const receipts = (Array.isArray(source.receipts) ? source.receipts : []).slice(-RECEIPT_CAP).map((raw) => {
    const receipt = clonePlain(raw);
    const stableId = receipt && receipt.sectorId && receipt.familyId && receipt.zoneId
      ? stableBehaviorId(receipt.sectorId, receipt.familyId, receipt.zoneId)
      : identityByLegacyId.get(receipt && receipt.behaviorId);
    if (stableId) receipt.behaviorId = stableId;
    return receipt;
  });

  const entered = {};
  for (const [legacyId, value] of Object.entries(plainObject(source.entered))) {
    if (!value) continue;
    const stableId = identityByLegacyId.get(legacyId)
      || (Number(source.schemaVersion) >= SAVE_SCHEMA_VERSION ? legacyId : null);
    if (stableId) entered[stableId] = true;
  }
  return { aftermath, receipts, entered };
}

function compareAftermathAge(a, b) {
  const dayDelta = finiteNumber(a && a.resolvedDay) - finiteNumber(b && b.resolvedDay);
  if (dayDelta) return dayDelta;
  const timeDelta = finiteNumber(a && a.resolvedAt) - finiteNumber(b && b.resolvedAt);
  if (timeDelta) return timeDelta;
  return finiteNumber(a && a._migrationOrdinal) - finiteNumber(b && b._migrationOrdinal);
}

function finiteNumber(value) {
  return Number.isFinite(value) ? value : 0;
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

function prettyToken(value) {
  return String(value || 'recorded').replaceAll('_', ' ').toUpperCase();
}

export default livingPoiBehaviors;
