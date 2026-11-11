// PL-08 Applause plant — A slingshot kill within sight of a station makes its dock lamps flash twice.
// What the player can do: Do it on purpose.
//
// Invariants:
// - Deterministic: uses state.simTime only; no Math.random() or Date.now().
// - Preserves single intent writer: mixed into traffic.js as applausePlantOps.
// - Physical: a slingshot kill within sight (<= 800 WU) of a station makes the station's
//   dock lamps flash twice.
// - Dock lamps flash: sets dockLampsFlashing and dockLampFlashUntil on station entity data
//   and emits station:applause and station:dockLampFlash.
// - Cooldown: per-station cooldown (4.0 s) to prevent multiple kills flashing on top of each other.
// - Clean separation: simulation evaluates geometry and events; renderer drives lamp shaders.

export const APPLAUSE_PLANT_EVENT = 'station:applause';
export const APPLAUSE_FLASH_EVENT = 'station:dockLampFlash';

export const APPLAUSE_PLANT_TUNING = Object.freeze({
  maxSightRangeWu: 800,        // within sight of a station (~800 WU)
  flashDurationS: 1.6,         // duration of the double-flash applause sequence
  stationCooldownS: 4.0,       // minimum time between applause reactions on the same station
  slingshotMemoryS: 2.0,       // recent slingshot release memory window
  pulse1StartS: 0.0,
  pulse1EndS: 0.30,
  pulse2StartS: 0.55,
  pulse2EndS: 0.85,
  flashGain: 4.5,              // bright emissive multiplier during flash
  reducedFlashGain: 1.8,       // accessible multiplier under reduced flash
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Returns true if the player is currently in slingshot state or recently released one.
 */
export function isSlingshotActive(state, tuning = APPLAUSE_PLANT_TUNING) {
  if (!state) return false;
  const now = Number.isFinite(state.simTime) ? state.simTime : (state.tick ? state.tick / 60 : 0);

  // 1. Direct active slingshot state stamped by tetherGameplay
  if (state.player?.tether?.slingshot === true) return true;

  // 2. Slingshot release memory window
  if (Number.isFinite(state._lastSlingshotReleaseTime)) {
    if (now - state._lastSlingshotReleaseTime <= tuning.slingshotMemoryS && now >= state._lastSlingshotReleaseTime) {
      return true;
    }
  }

  // 3. Stunt recognition memory window (slingshot_golf)
  if (state._lastStuntTrickId === 'slingshot_golf' && Number.isFinite(state._lastStuntTrickTime)) {
    if (now - state._lastStuntTrickTime <= tuning.slingshotMemoryS && now >= state._lastStuntTrickTime) {
      return true;
    }
  }

  return false;
}

/**
 * Evaluates whether an entity:killed receipt represents a player slingshot kill.
 */
export function isSlingshotKill(state, payload, tuning = APPLAUSE_PLANT_TUNING) {
  if (!state || !payload) return false;

  // Must be caused by the player
  if (payload.killerId == null || payload.killerId !== state.playerId) return false;

  // Player suicide or invalid target is not an applause kill
  if (payload.id != null && payload.id === state.playerId) return false;

  // Explicit payload flags
  if (payload.slingshot === true) return true;
  if (payload.cause === 'slingshot' || payload.cause === 'massline_whip') return true;

  // Active slingshot state on player or recent release
  return isSlingshotActive(state, tuning);
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
  if (Number.isFinite(data.dockLampFlashUntil) && now < data.dockLampFlashUntil) {
    return false;
  }
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

    this.bus.on('tether:cut', (payload) => {
      if (payload && payload.slingshot && this.state) {
        this.state._lastSlingshotReleaseTime = Number.isFinite(this.state.simTime)
          ? this.state.simTime
          : (this.state.tick ? this.state.tick / 60 : 0);
      }
    });

    this.bus.on('stunt:trickDetected', (payload) => {
      if (payload && payload.trickId === 'slingshot_golf' && this.state) {
        this.state._lastStuntTrickId = 'slingshot_golf';
        this.state._lastStuntTrickTime = Number.isFinite(this.state.simTime)
          ? this.state.simTime
          : (this.state.tick ? this.state.tick / 60 : 0);
      }
    });

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
