// PL-08 Applause plant — A slingshot kill within sight of a station makes its dock lamps flash twice.
// What the player can do: Do it on purpose.
//
// Invariants:
// - Deterministic: uses state.simTime only; no Math.random() or Date.now().
// - Preserves single intent writer: mixed into traffic.js as applausePlantOps.
// - Physical: a thrown-body kill within 1500 WU of a station makes the station's
//   dock lamps flash twice.
// - Dock lamps flash: sets dockLampsFlashing and dockLampFlashUntil on station entity data
//   and emits station:applause and station:dockLampFlash.
// - Cooldown: per-station cooldown (20 s) to prevent multiple kills flashing on top of each other.
// - Clean separation: simulation evaluates geometry and events; renderer drives lamp shaders.

import { KillCause, classifyImpactResponsibility, impactLinkFromPresentation, killCauseFromPayload } from '../combat/killCausality.js';

export const APPLAUSE_PLANT_EVENT = 'station:applause';
export const APPLAUSE_FLASH_EVENT = 'station:dockLampFlash';

export const APPLAUSE_PLANT_TUNING = Object.freeze({
  maxSightRangeWu: 1500,       // packet PL-08: a station within 1500 WU of the kill
  flashDurationS: 0.45,        // on 0.15 s, off 0.15 s, on 0.15 s, then off
  stationCooldownS: 20,        // at most once per station per 20 s of sim time
  pulse1StartS: 0.0,
  pulse1EndS: 0.15,
  pulse2StartS: 0.30,
  pulse2EndS: 0.45,
  flashGain: 4.5,              // bright emissive multiplier during flash
  reducedFlashGain: 1.8,       // accessible multiplier under reduced flash
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Evaluates whether an entity:killed receipt is a player THROW kill: the lethal blow was a
 * collision with a body (the impactor) carrying the player's fresh Massline throw provenance.
 * A gun kill never qualifies, whatever the player's sling state is. Reads the canonical
 * combat.js receipt: cause, impactorId, presentation.impactLink {actorId, tag, appliedTick,
 * holdUntilTick}, judged by the same classifier the law card and deed record use.
 */
export function isSlingshotKill(state, payload) {
  if (!state || !payload) return false;
  if (payload.id != null && payload.id === state.playerId) return false;
  if (payload.type != null && payload.type !== 'ship') return false;
  const cause = killCauseFromPayload(payload);
  if (cause !== KillCause.SHIP_COLLISION && cause !== KillCause.TERRAIN_COLLISION) return false;
  if (payload.impactorId == null) return false;
  const link = impactLinkFromPresentation(payload.presentation, {
    impactTick: Number.isInteger(state.tick) ? state.tick : null,
    playerId: state.playerId,
  });
  if (!link) return false;
  const verdict = classifyImpactResponsibility({
    playerId: state.playerId,
    actorId: link.actorId,
    tag: link.tag,
    impactTick: link.impactTick,
    appliedTick: link.appliedTick,
    holdUntilTick: link.holdUntilTick,
  });
  return verdict.responsible === true && verdict.class === 'indirect';
}

/**
 * Finds all real stations (excluding transit gates/wormholes) within sight range of the given position.
 */
export function findStationsInSight(state, pos, maxRange = APPLAUSE_PLANT_TUNING.maxSightRangeWu) {
  if (!state || !pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return [];

  const candidates = [];
  const entities = state.entities;

  if (entities) {
    if (typeof entities.values === 'function') {
      for (const e of entities.values()) {
        candidates.push(e);
      }
    } else if (Array.isArray(entities)) {
      for (const e of entities) {
        candidates.push(e);
      }
    }
  }

  // Also check state.stations if present
  if (Array.isArray(state.stations)) {
    for (const s of state.stations) {
      if (!candidates.includes(s)) candidates.push(s);
    }
  }

  const results = [];
  const maxRangeSq = maxRange * maxRange;

  for (const ent of candidates) {
    if (!ent || ent.alive === false) continue;
    if (ent.type !== 'station') continue;

    const data = ent.data || {};
    // Gates are transit collars, not stations
    if (data.isGate === true || data.isWormhole === true) continue;

    const epos = ent.pos;
    if (!epos || !Number.isFinite(epos.x) || !Number.isFinite(epos.z)) continue;

    const dx = epos.x - pos.x;
    const dz = epos.z - pos.z;
    const distSq = dx * dx + dz * dz;

    if (distSq <= maxRangeSq) {
      results.push({
        station: ent,
        distanceWu: Math.sqrt(distSq),
      });
    }
  }

  return results;
}

/**
 * Triggers the applause reaction on a station if cooldown permits.
 * Returns true if triggered, false if on cooldown or invalid.
 */
export function triggerStationApplause(station, state, bus, killPayload, distWu = 0, tuning = APPLAUSE_PLANT_TUNING) {
  if (!station || !state) return false;

  const now = Number.isFinite(state.simTime) ? state.simTime : (state.tick ? state.tick / 60 : 0);
  const data = station.data || (station.data = {});

  // Cooldown check: do not overlap flashing or re-trigger inside cooldown
  if (Number.isFinite(data.lastApplauseTime) && (now - data.lastApplauseTime) < tuning.stationCooldownS) {
    return false;
  }

  // Apply state change on station
  data.dockLampsFlashing = true;
  data.dockLampFlashUntil = now + tuning.flashDurationS;
  data.lastApplauseTime = now;
  data.applauseCount = (data.applauseCount || 0) + 1;

  const stationId = data.stationId || station.id || 'station';
  const stationName = data.name || station.name || String(stationId).replace(/^station_/, '').replace(/_/g, ' ');
  const killPos = (killPayload && killPayload.pos) || { x: 0, z: 0 };
  const victimId = killPayload && killPayload.id != null ? killPayload.id : null;

  if (bus && typeof bus.emit === 'function') {
    bus.emit(APPLAUSE_PLANT_EVENT, {
      stationId,
      entityId: station.id,
      stationName,
      stationPos: { x: station.pos.x, z: station.pos.z },
      killPos: { x: killPos.x, z: killPos.z },
      victimId,
      distanceWu: Math.round(distWu * 10) / 10,
      flashes: 2,
      duration: tuning.flashDurationS,
      t: now,
    });

    bus.emit(APPLAUSE_FLASH_EVENT, {
      stationId,
      entityId: station.id,
      flashes: 2,
      duration: tuning.flashDurationS,
      until: now + tuning.flashDurationS,
      t: now,
    });
  }

  return true;
}

/**
 * Traffic ops mixin for PL-08 Applause plant.
 */
export const applausePlantOps = {
  _initApplausePlantListeners() {
    if (!this.bus || this._applausePlantListenersInstalled) return;
    this._applausePlantListenersInstalled = true;

    this.bus.on('entity:killed', (payload) => {
      this._onEntityKilledForApplause(payload);
    });
  },

  _onEntityKilledForApplause(payload) {
    if (!this.state || !payload) return;
    if (!isSlingshotKill(this.state, payload)) return;

    const killPos = payload.pos || (this.state.entities?.get && payload.id ? this.state.entities.get(payload.id)?.pos : null);
    if (!killPos) return;

    const nearby = findStationsInSight(this.state, killPos, APPLAUSE_PLANT_TUNING.maxSightRangeWu);
    for (const { station, distanceWu } of nearby) {
      triggerStationApplause(station, this.state, this.bus, payload, distanceWu);
    }
  },
};
