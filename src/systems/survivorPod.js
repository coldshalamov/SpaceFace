// survivorPod.js - BP-01.1 packet SURVIVOR_POD_TRIAGE.
//
// Enriches the shipped derelict-field salvage loop without touching salvage.js or missions.js.
// One existing salvage point in a sector can become a survivor-pod communicator using the shipped
// wm_survivor_pod template. Rescue is shaped as a passenger_transport mission offer; strip pays via
// economy/faction intents only. The oxygen clock is soft: it changes payout/readout, not fate.

import { hash32 } from '../core/rng.js';
import { SECTORS } from '../data/sectors.js';
import { wreckMissionById } from '../data/wreckMissions.js';

const MISSION_ID = 'wm_survivor_pod';
const CONCORD_FACTION_ID = 'faction_scn';
const OXYGEN_WINDOW_S = 210;
const OXYGEN_DECAY_WINDOW_S = 240;
const MIN_REWARD_MULTIPLIER = 0.45;
const RESCUE_DISTANCE_WU = 600;
const STRIP_POOL = Object.freeze({
  cmdty_salvage_electronics: 2,
  cmdty_medical: 1,
});
const STRIP_BASE_CREDITS = 260;
const STRIP_REP_DELTA = -8;

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const ALL_STATIONS = [];
for (const sec of SECTORS) {
  for (const st of (sec.stations || [])) {
    ALL_STATIONS.push({ ...st, sectorId: sec.id });
  }
}

function ensureState(state) {
  if (!state) return null;
  if (!state.survivorPod || typeof state.survivorPod !== 'object') {
    state.survivorPod = { promotedBySector: {}, promotedByPoint: {} };
  }
  const own = state.survivorPod;
  if (!own.promotedBySector || typeof own.promotedBySector !== 'object') own.promotedBySector = {};
  if (!own.promotedByPoint || typeof own.promotedByPoint !== 'object') own.promotedByPoint = {};
  return own;
}

function clone(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

function entityForPoint(state, point) {
  if (!state || !point || point.entityId == null || !state.entities) return null;
  if (typeof state.entities.get === 'function') return state.entities.get(point.entityId) || null;
  return state.entities[point.entityId] || null;
}

function pointForRec(state, rec) {
  const points = state && state.salvage && Array.isArray(state.salvage.points) ? state.salvage.points : [];
  return points.find((p) => p && p.id === rec.salvagePointId) || null;
}

function choosePoint(seed, sectorId, candidates) {
  if (!candidates.length) return null;
  const ordered = candidates.slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const idx = hash32(seed || 1, sectorId || '', 'survivorPodPoint') % ordered.length;
  return ordered[idx] || ordered[0];
}

function rescueStationForSector(sectorId) {
  const sec = SECTOR_BY_ID.get(sectorId);
  const local = (sec && sec.stations) || [];
  return local.find((s) => s.factionId === CONCORD_FACTION_ID)
    || local.find((s) => s.services && s.services.includes('missions'))
    || local[0]
    || ALL_STATIONS.find((s) => s.factionId === CONCORD_FACTION_ID)
    || ALL_STATIONS[0]
    || null;
}

function secondsLeft(state, rec) {
  return Math.max(0, Math.ceil((rec.oxygenDueAt || 0) - (state.simTime || 0)));
}

function rewardMultiplier(state, rec) {
  const overdue = Math.max(0, (state.simTime || 0) - (rec.oxygenDueAt || 0));
  if (overdue <= 0) return 1;
  const span = Math.max(1, rec.oxygenDecayWindow_s || OXYGEN_DECAY_WINDOW_S);
  const min = Math.max(0, Math.min(1, rec.minRewardMultiplier || MIN_REWARD_MULTIPLIER));
  return Math.max(min, 1 - (overdue / span) * (1 - min));
}

function countdownLabel(state, rec) {
  const left = secondsLeft(state, rec);
  if (left <= 0) return 'oxygen depleted - survivor stable, payout decaying';
  return `oxygen ${left}s`;
}

function publicMeta(state, rec) {
  const mult = rewardMultiplier(state, rec);
  const left = secondsLeft(state, rec);
  return {
    salvagePointId: rec.salvagePointId,
    entityId: rec.entityId,
    sectorId: rec.sectorId,
    destStationId: rec.destStationId,
    destSectorId: rec.destSectorId,
    factionId: rec.factionId,
    oxygenDueAt: rec.oxygenDueAt,
    oxygenRemaining_s: left,
    oxygenExpired: left <= 0,
    rewardMultiplier: mult,
    minRewardMultiplier: rec.minRewardMultiplier,
    stripPool: clone(rec.stripPool),
    stripCredits: rec.stripCredits,
    rescueSelected: !!rec.rescueSelected,
    stripped: !!rec.stripped,
    label: countdownLabel(state, rec),
  };
}

function mirrorMeta(state, rec, point, ent) {
  const meta = publicMeta(state, rec);
  rec.oxygenRemaining_s = meta.oxygenRemaining_s;
  rec.oxygenExpired = meta.oxygenExpired;
  rec.rewardMultiplier = meta.rewardMultiplier;
  if (point) point.survivorPod = { ...meta };
  if (ent && ent.data) {
    ent.data.survivorPod = { ...meta };
    ent.data.scanLabel = meta.oxygenExpired ? 'Survivor Pod - oxygen depleted' : `Survivor Pod - ${meta.label}`;
  }
  return meta;
}

function stripCreditsFor(seed, pointId) {
  return STRIP_BASE_CREDITS + (hash32(seed || 1, pointId || '', 'survivorPodStrip') % 90);
}

export const survivorPod = {
  name: 'survivorPod',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    ensureState(this._state);
    this._onPlaced = (p) => this._promoteSector(p && p.sectorId);
    this._onSectorEnter = (p) => this._promoteSector(p && p.sectorId);
    this._onMissionOffered = (offer) => this._stampOffer(offer);
    this._onChoice = (p) => this._handleChoice(p);
    this._onNewGame = () => this.newGame();
    if (this._bus && this._bus.on) {
      this._bus.on('salvage:placed', this._onPlaced);
      this._bus.on('sector:enter', this._onSectorEnter);
      this._bus.on('mission:offered', this._onMissionOffered);
      this._bus.on('survivorPod:choose', this._onChoice);
      this._bus.on('game:newGame', this._onNewGame);
      this._bus.on('save:loaded', this._onNewGame);
    }
  },

  newGame() {
    if (this._state) this._state.survivorPod = { promotedBySector: {}, promotedByPoint: {} };
  },

  update(_dt, state) {
    const own = ensureState(state);
    if (!own) return;
    const currentSectorId = state.world && state.world.currentSectorId;
    let visible = null;
    for (const rec of Object.values(own.promotedByPoint)) {
      if (!rec || rec.stripped) continue;
      const point = pointForRec(state, rec);
      const ent = entityForPoint(state, point || rec);
      const meta = mirrorMeta(state, rec, point, ent);
      if (!visible && rec.sectorId === currentSectorId) visible = meta;
    }
    if (!state.ui) state.ui = {};
    if (visible) state.ui.survivorPod = visible;
    else if (state.ui.survivorPod && state.ui.survivorPod.salvagePointId) state.ui.survivorPod = null;
  },

  _promoteSector(sectorId) {
    const state = this._state;
    if (!state || !sectorId) return null;
    const own = ensureState(state);
    const existing = own.promotedBySector[sectorId];
    if (existing && own.promotedByPoint[existing.salvagePointId]) return existing;

    const points = state.salvage && Array.isArray(state.salvage.points) ? state.salvage.points : [];
    const eligible = points.filter((p) => {
      if (!p || p.sectorId !== sectorId || p.offered || p.survivorPod || p.lossInvestigation) return false;
      return !!entityForPoint(state, p);
    });
    const preferred = eligible.filter((p) => !p.isCommunicator && !p.wreckMissionId);
    const point = choosePoint(state.meta && state.meta.seed, sectorId, preferred.length ? preferred : eligible);
    if (!point) return null;

    const dest = rescueStationForSector(sectorId);
    const startedAt = state.simTime || 0;
    const rec = {
      salvagePointId: point.id,
      entityId: point.entityId == null ? null : point.entityId,
      sectorId,
      zoneId: point.zoneId || null,
      wreckMissionId: MISSION_ID,
      factionId: CONCORD_FACTION_ID,
      destStationId: dest ? dest.id : null,
      destSectorId: dest ? dest.sectorId : sectorId,
      oxygenStartedAt: startedAt,
      oxygenDueAt: startedAt + OXYGEN_WINDOW_S,
      oxygenDecayWindow_s: OXYGEN_DECAY_WINDOW_S,
      minRewardMultiplier: MIN_REWARD_MULTIPLIER,
      rewardMultiplier: 1,
      stripPool: clone(STRIP_POOL),
      stripCredits: stripCreditsFor(state.meta && state.meta.seed, point.id),
      rescueSelected: false,
      stripped: false,
    };

    point.isCommunicator = true;
    point.wreckMissionId = MISSION_ID;
    point.survivorPod = publicMeta(state, rec);

    const ent = entityForPoint(state, point);
    if (ent && ent.data) {
      ent.data.parentType = 'survivor_pod';
      ent.data.isCommunicator = true;
      ent.data.wreckMissionId = MISSION_ID;
      ent.data.salvagePointId = point.id;
      ent.data.salvagePool = clone(STRIP_POOL);
      ent.data.tetherRole = 'survivor_pod';
      ent.data.survivorPod = { ...point.survivorPod };
      ent.data.scanLabel = `Survivor Pod - ${countdownLabel(state, rec)}`;
    }

    own.promotedBySector[sectorId] = rec;
    own.promotedByPoint[point.id] = rec;
    if (this._bus && this._bus.emit) {
      this._bus.emit('survivorPod:promoted', { ...publicMeta(state, rec), zoneId: point.zoneId || null });
    }
    return rec;
  },

  _stampOffer(offer) {
    const state = this._state;
    if (!state || !offer || offer.source !== 'salvage' || !offer.salvagePointId) return;
    const own = ensureState(state);
    const rec = own.promotedByPoint[offer.salvagePointId];
    if (!rec || rec.stripped) return;
    const template = wreckMissionById(MISSION_ID);
    if (!template) return;

    const point = pointForRec(state, rec);
    const ent = entityForPoint(state, point || rec);
    const meta = mirrorMeta(state, rec, point, ent);
    const reward = Math.max(
      Math.round((template.reward_cr || 0) * meta.minRewardMultiplier),
      Math.round((template.reward_cr || 0) * meta.rewardMultiplier),
    );

    offer.id = offer.id || offer.offerId || `survivor_${rec.salvagePointId}`;
    offer.offerId = offer.offerId || offer.id;
    offer.wreckMissionId = MISSION_ID;
    offer.type = 'passenger_transport';
    offer.title = template.title;
    offer.giver = template.giver;
    offer.log = template.log;
    offer.summary = `${template.summary} ${meta.label}.`;
    offer.reward_cr = reward;
    offer.collateral_cr = 0;
    offer.riskTier = offer.riskTier == null ? 1 : offer.riskTier;
    offer.time_limit_s = offer.time_limit_s || (meta.oxygenRemaining_s + 300);
    offer.choice = clone(template.choice);
    offer.tag = template.tag || 'wreck_salvage';
    offer.factionId = CONCORD_FACTION_ID;
    offer.stationId = offer.stationId || null;
    offer.destStationId = rec.destStationId;
    offer.destSectorId = rec.destSectorId || rec.sectorId;
    offer.distance = offer.distance || RESCUE_DISTANCE_WU;
    offer.params = {
      cmdtyId: null,
      qty: 1,
      cargoValue: 0,
      fValue: 1,
      taskTime: 20,
      passengers: 1,
      survivorPodId: rec.salvagePointId,
    };
    offer.survivorPod = {
      ...meta,
      oxygenCountdownLabel: meta.label,
      rescueRoute: {
        type: 'passenger_transport',
        factionId: CONCORD_FACTION_ID,
        destStationId: rec.destStationId,
        destSectorId: rec.destSectorId || rec.sectorId,
      },
      stripRoute: {
        credits: rec.stripCredits,
        repDelta: STRIP_REP_DELTA,
        salvagePool: clone(rec.stripPool),
      },
    };
  },

  _handleChoice(payload) {
    if (!payload) return false;
    const state = this._state;
    const own = ensureState(state);
    const point = this._pointFromChoice(payload);
    if (!point || !point.survivorPod) return false;
    const rec = own.promotedByPoint[point.id];
    if (!rec || rec.stripped) return false;
    const optionId = payload.optionId || payload.choiceId || payload.id;
    if (optionId === 'rescue') return this._chooseRescue(point, rec);
    if (optionId === 'strip') return this._chooseStrip(point, rec);
    return false;
  },

  _pointFromChoice(payload) {
    const state = this._state;
    const points = state && state.salvage && Array.isArray(state.salvage.points) ? state.salvage.points : [];
    if (payload.salvagePointId) return points.find((p) => p && p.id === payload.salvagePointId) || null;
    if (payload.entityId != null) return points.find((p) => p && p.entityId === payload.entityId) || null;
    return null;
  },

  _chooseRescue(point, rec) {
    const state = this._state;
    const tether = state && state.player && state.player.tether;
    if (!tether || tether.active !== true || tether.targetId !== point.entityId) {
      if (this._bus && this._bus.emit) {
        this._bus.emit('survivorPod:rescueBlocked', {
          salvagePointId: point.id,
          entityId: point.entityId,
          reason: 'tow_required',
        });
      }
      return false;
    }
    rec.rescueSelected = true;
    const ent = entityForPoint(state, point);
    const meta = mirrorMeta(state, rec, point, ent);
    if (this._bus && this._bus.emit) {
      this._bus.emit('survivorPod:rescueSelected', {
        ...meta,
        missionType: 'passenger_transport',
        factionId: CONCORD_FACTION_ID,
        destStationId: rec.destStationId,
        destSectorId: rec.destSectorId || rec.sectorId,
      });
    }
    return true;
  },

  _chooseStrip(point, rec) {
    const state = this._state;
    rec.stripped = true;
    rec.rescueSelected = false;
    point.offered = true;
    const ent = entityForPoint(state, point);
    if (ent) {
      ent.alive = false;
      if (ent.data) {
        ent.data.survivorPod = { ...publicMeta(state, rec), stripped: true };
        ent.data.salvagePool = clone(rec.stripPool);
      }
    }
    point.survivorPod = { ...publicMeta(state, rec), stripped: true };

    if (this._bus && this._bus.emit) {
      this._bus.emit('economy:grantCredits', {
        amount: rec.stripCredits,
        reason: 'survivorPod:strip',
        salvagePointId: point.id,
        salvagePool: clone(rec.stripPool),
      });
      this._bus.emit('faction:repDelta', {
        factionId: CONCORD_FACTION_ID,
        delta: STRIP_REP_DELTA,
        reason: 'survivorPod:strip',
        salvagePointId: point.id,
      });
      this._bus.emit('survivorPod:stripped', {
        salvagePointId: point.id,
        entityId: point.entityId,
        amount: rec.stripCredits,
        salvagePool: clone(rec.stripPool),
        factionId: CONCORD_FACTION_ID,
        repDelta: STRIP_REP_DELTA,
      });
    }
    return true;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onPlaced) this._bus.off('salvage:placed', this._onPlaced);
      if (this._onSectorEnter) this._bus.off('sector:enter', this._onSectorEnter);
      if (this._onMissionOffered) this._bus.off('mission:offered', this._onMissionOffered);
      if (this._onChoice) this._bus.off('survivorPod:choose', this._onChoice);
      if (this._onNewGame) this._bus.off('game:newGame', this._onNewGame);
      if (this._onNewGame) this._bus.off('save:loaded', this._onNewGame);
    }
    this._onPlaced = null;
    this._onSectorEnter = null;
    this._onMissionOffered = null;
    this._onChoice = null;
    this._onNewGame = null;
  },
};

export default survivorPod;
