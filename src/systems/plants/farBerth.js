// PL-101 The far berth — Cut the dock queue under boost: horns hold down, the dock berths you at the far pier.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Cut the dock queue under boost and every horn behind you holds down; the dock
//   berths you at the far pier. Cut in twice more and the pier is chalked with your tag — the
//   walk is yours now
//   What the player can do: Queue like the rest; or own the joke and the exercise
//
// The chalk is physical and the joke has teeth: the third cut inside the window spawns a chalk
// tag prop at the pier (data.swarmFloorPad label renders via the existing pad layer) and a
// shadow tug (leased through trafficReactionLease) that shadows the player toward the far-pier
// approach for the window. One tug and one prop per station, despawned when the window ends or
// the sector does.
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via FAR_BERTH_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; the queue holds its
//   course (horns only), so queued hulls are never claimed; the shadow tug is, aborting when
//   the lease is refused.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.

import { hash32 } from '../../core/rng.js';
import { requestTrafficReaction, releaseTrafficReaction } from '../trafficReactionLease.js';

export const PLANTS_FAR_BERTH_CUT_EVENT = 'plants:farBerthCut';
export const PLANTS_FAR_BERTH_CHALK_EVENT = 'plants:farBerthChalk';

export const FAR_BERTH_TUNING = Object.freeze({
  stationQueueRadiusWu: 420,  // hull sits inside this of a station to count as dock queue
  minCutSpeedWu: 120,         // player must be at boost-level speed for the cut to count
  cutRangeWu: 34,             // player passes this close to a queued hull
  stationSideLeadWu: 10,      // player must be station-side (closer) by at least this much
  hornDurationS: 2.0,         // how long each queued hull's horn/lamps hold down
  hullCooldownS: 8,           // per-hull cooldown between counted cuts
  farPierWindowS: 90,         // one cut berths the player at the far pier for this long
  chalkCuts: 3,               // cuts inside the window before the pier is chalked with your tag
  chalkWindowS: 240,          // the "twice more" window
  chalkHoldS: 600,            // how long the chalk tag stays on the pier
  shadowS: 30,                // the shadow tug shadows you this long after the chalk
  farPierOffsetWu: 160,       // the far pier sits this far off the station heart
  tugRadius: 7,
  tugHull: 60,
  chalkPropRadius: 4,
  hornGain: 0.8,
  memoryCap: 32,              // bounded hull + station memory rows
});

export const FAR_BERTH_CHALK_LINE = 'Chalking you in. Enjoy the walk.';
export const FAR_BERTH_CHALK_LABEL = 'FAR PIER. CHALKED.';

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility predicate: a civilian hull sitting in a station's dock queue (near a real
 * station, not the player, not a gate/wormhole prop, not disabled).
 */
export function isFarBerthQueueHull(entity, rec = null, state = null, stations = []) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict || data.surrendered) return false;
  if (data.ai && (data.ai.pirate === true || data.ai.hostile === true)) return false;
  if (!Array.isArray(stations)) return false;
  for (const station of stations) {
    if (!station || station.alive === false || station.type !== 'station' || !station.pos) continue;
    const sdata = station.data || {};
    if (sdata.isGate || sdata.isWormhole) continue;
    const dx = entity.pos.x - station.pos.x;
    const dz = entity.pos.z - station.pos.z;
    if (dx * dx + dz * dz <= FAR_BERTH_TUNING.stationQueueRadiusWu * FAR_BERTH_TUNING.stationQueueRadiusWu) {
      return true;
    }
  }
  return false;
}

/**
 * Geometry helper: is the player cutting this queued hull under boost — passing close at
 * speed, on the station side of it? Returns cut geometry or null.
 */
export function predictQueueCut(player, hull, stations = [], tuning = FAR_BERTH_TUNING) {
  if (!player || !hull || !player.pos || !hull.pos) return null;
  const pvx = finite(player.vel && player.vel.x);
  const pvz = finite(player.vel && player.vel.z);
  const speed = Math.hypot(pvx, pvz);
  if (!(speed >= tuning.minCutSpeedWu)) return null;

  const rx = finite(player.pos.x) - finite(hull.pos.x);
  const rz = finite(player.pos.z) - finite(hull.pos.z);
  const dist = Math.hypot(rx, rz);
  if (!(dist <= tuning.cutRangeWu + finite(hull.radius, 6) + finite(player.radius, 6))) return null;

  // Station-side: for some real station nearby, the player is closer to it than the queued hull.
  let stationSide = false;
  let stationId = null;
  if (Array.isArray(stations)) {
    for (const station of stations) {
      if (!station || !station.pos || station.alive === false) continue;
      const sd = station.data || {};
      if (sd.isGate || sd.isWormhole) continue;
      const dh = Math.hypot(finite(hull.pos.x) - finite(station.pos.x), finite(hull.pos.z) - finite(station.pos.z));
      const dp = Math.hypot(finite(player.pos.x) - finite(station.pos.x), finite(player.pos.z) - finite(station.pos.z));
      if (dp + tuning.stationSideLeadWu < dh) {
        stationSide = true;
        stationId = (station.data && station.data.stationId) || station.id;
        break;
      }
    }
  }
  if (!stationSide) return null;

  return { speed, dist, stationId };
}

/**
 * Memory-row builder (pure): per-hull cut bookkeeping with FIFO + stale eviction at the cap.
 */
export function farBerthRowFor(memory, key, now, cap = FAR_BERTH_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > FAR_BERTH_TUNING.chalkWindowS * 2) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { lastCutAt: -Infinity, lastAt: now };
    memory.set(key, row);
  }
  return row;
}

/**
 * Per-station cut ledger row (pure builder). Station rows carry the window counters the dock
 * berth logic reads via berthChoiceFor, plus the chalk beat's prop/tug ids (capped at one each).
 */
export function farBerthStationRowFor(memory, stationId, now, cap = FAR_BERTH_TUNING.memoryCap) {
  if (!memory || !stationId) return null;
  let row = memory.get(`station:${stationId}`);
  if (!(now >= row?.lastAt)) {
    if (memory.size >= cap) {
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = { cuts: 0, windowStartAt: -Infinity, chalkPropId: null, tugId: null, shadowUntil: -Infinity, lastAt: now };
    memory.set(`station:${stationId}`, row);
  }
  return row;
}

/**
 * Pure dock-side read: what berth does the dock owe this arrival? Wiring (dock/traffic)
 * calls this when a player docks. 'far_pier' after one cut, 'chalked' once the tag is in.
 */
export function berthChoiceFor(station, now) {
  const data = station && station.data;
  if (!data) return null;
  if (Number.isFinite(data.farPierChalkUntil) && now < data.farPierChalkUntil) return 'chalked';
  if (Number.isFinite(data.farPierUntil) && now < data.farPierUntil) return 'far_pier';
  return null;
}

/**
 * Pure pier geometry: the far-pier point for a station (deterministic per station id).
 */
export function farPierPointFor(station, tuning = FAR_BERTH_TUNING) {
  if (!station || !station.pos) return null;
  const id = String((station.data && station.data.stationId) || station.id || 'station');
  const ang = (hash32(id, 'farPierAngle', 'a') % 6283) / 1000;
  return { x: finite(station.pos.x) + Math.cos(ang) * tuning.farPierOffsetWu, z: finite(station.pos.z) + Math.sin(ang) * tuning.farPierOffsetWu };
}

export const farBerthOps = {
  _initFarBerth(ctx = {}) {
    this._farBerthHulls = new Map();
    this._farBerthStations = new Map();
    if (this.bus && typeof this.bus.on === 'function' && !this._farBerthInstalled) {
      this._farBerthInstalled = true;
      this.bus.on('sector:exit', () => this._farBerthCleanup());
      this.bus.on('save:loaded', () => this._farBerthCleanup());
    }
  },

  _farBerthCleanup() {
    // Chalk props and shadow tugs never outlive the sector.
    for (const row of this._farBerthStations.values()) {
      const removeEntity = this.helpers && this.helpers.removeEntity;
      if (typeof removeEntity === 'function') {
        if (row.chalkPropId != null) removeEntity(row.chalkPropId);
        if (row.tugId != null) removeEntity(row.tugId);
      }
      row.chalkPropId = null;
      row.tugId = null;
      row.shadowUntil = -Infinity;
    }
    this._farBerthHulls = new Map();
  },

  _farBerthEntityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },

  // The shadow tug is plant-owned and deliberately absent from the freighter census.
  _stepFarBerthShadow(state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return;
    for (const row of this._farBerthStations.values()) {
      if (row.tugId == null) continue;
      const tug = this._farBerthEntityById(row.tugId);
      if (!tug || tug.alive === false) {
        row.tugId = null;
        row.shadowUntil = -Infinity;
        continue;
      }
      this._reactFarBerth(tug, null, [], state, player);
    }
  },

  /**
   * Per-hull hook from the traffic dispatch. Queued hulls: horns only, never claimed. The
   * chalk beat's shadow tug: a leased shadow/shoo toward the far pier — answers true only
   * while the tug's beat is being flown this tick.
   */
  _reactFarBerth(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    const now = finite(state.simTime, 0);

    // The shadow tug flies its beat: hold between the player and the far-pier approach.
    const data = e && e.data;
    if (data && data.plantsFarBerthTug === true) {
      let row = null;
      for (const candidate of this._farBerthStations.values()) {
        if (candidate.tugId === e.id) { row = candidate; break; }
      }
      if (!row || now >= row.shadowUntil) {
        releaseTrafficReaction(this, e);
        const removeEntity = this.helpers && this.helpers.removeEntity;
        if (row && typeof removeEntity === 'function') removeEntity(row.tugId);
        if (row) { row.tugId = null; row.shadowUntil = -Infinity; }
        return false;
      }
      const pier = farPierPointFor(data.farBerthStation);
      const target = player && player.pos ? player : (data.farBerthStation && data.farBerthStation.pos ? data.farBerthStation : null);
      if (!pier || !target || !target.pos) return false;
      // Hold the line between the pier and the player: nose on the player, station-side drift.
      const aim = Math.atan2(finite(target.pos.z) - finite(e.pos.z), finite(target.pos.x) - finite(e.pos.x));
      const owned = requestTrafficReaction(this, e, {
        moveX: 0, moveZ: 1, boost: false, fire: false, fireGroup: null, aimAngle: aim, brake: false,
      }, Math.max(0.5, row.shadowUntil - now));
      return owned === true;
    }

    if (!isFarBerthQueueHull(e, rec, state, stations)) return false;
    if (!player || player.alive === false) return false;

    const cut = predictQueueCut(player, e, stations);
    if (!cut) return false;

    const hullRow = farBerthRowFor(this._farBerthHulls, e.id, now);
    if (!hullRow) return false;
    hullRow.lastAt = now;
    if (now - hullRow.lastCutAt < FAR_BERTH_TUNING.hullCooldownS) return false;
    hullRow.lastCutAt = now;

    // The horn holds down and the alarm lamps flash; course is held (no intent write).
    const hullData = e.data || (e.data = {});
    hullData.lampsFlashing = true;
    hullData.lampFlashUntil = now + FAR_BERTH_TUNING.hornDurationS;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('audio:cue', {
        id: 'sfx_hauler_blast_lean',
        position: { x: e.pos.x, z: e.pos.z },
        gain: FAR_BERTH_TUNING.hornGain,
        rate: 1,
      });
    }

    // Station ledger: first cut → far pier; third inside the window → chalked tag, and the
    // joke gets teeth: a chalk prop at the pier and a shadow tug on your tail.
    const stationRow = farBerthStationRowFor(this._farBerthStations, cut.stationId, now);
    if (!stationRow) return false;
    stationRow.lastAt = now;
    const fresh = now - stationRow.windowStartAt > FAR_BERTH_TUNING.chalkWindowS;
    if (fresh) {
      stationRow.cuts = 1;
      stationRow.windowStartAt = now;
    } else {
      stationRow.cuts += 1;
    }

    const station = (Array.isArray(stations) ? stations : []).find(
      (s) => s && ((s.data && s.data.stationId) || s.id) === cut.stationId,
    );
    if (station) {
      const sdata = station.data || (station.data = {});
      sdata.farPierUntil = now + FAR_BERTH_TUNING.farPierWindowS;
      if (stationRow.cuts >= FAR_BERTH_TUNING.chalkCuts) {
        sdata.farPierChalkUntil = now + FAR_BERTH_TUNING.chalkHoldS;
        const spawnEntity = this.helpers && this.helpers.spawnEntity;
        const removeEntity = this.helpers && this.helpers.removeEntity;
        const pier = farPierPointFor(station);
        // One chalk prop per station: re-chalk replaces it.
        if (stationRow.chalkPropId != null && typeof removeEntity === 'function') removeEntity(stationRow.chalkPropId);
        if (pier && typeof spawnEntity === 'function') {
          const prop = spawnEntity({
            type: 'beacon',
            pos: { x: pier.x, z: pier.z },
            vel: { x: 0, z: 0 },
            radius: FAR_BERTH_TUNING.chalkPropRadius,
            mass: 1e6,
            hull: 1,
            hullMax: 1,
            data: {
              parentType: 'story_prop',
              scanLabel: 'Chalked pier tag',
              storyPropKind: 'far_berth_chalk',
              // The existing pad-label layer reads data.swarmFloorPad.label and renders it
              // screen-space above the body — the chalk everyone at the dock can read.
              swarmFloorPad: { label: FAR_BERTH_CHALK_LABEL },
              farBerthChalkFor: player.id,
              tetherable: true,
              masslineTetherable: true,
            },
          });
          stationRow.chalkPropId = prop && prop.id != null ? prop.id : null;
        }
        // One shadow tug per station: it shadows the player toward the far pier for shadowS.
        if (stationRow.tugId != null && typeof removeEntity === 'function') removeEntity(stationRow.tugId);
        if (pier && typeof spawnEntity === 'function') {
          const tug = spawnEntity({
            type: 'ship',
            pos: { x: pier.x + 30, z: pier.z },
            vel: { x: 0, z: 0 },
            radius: FAR_BERTH_TUNING.tugRadius,
            hull: FAR_BERTH_TUNING.tugHull,
            hullMax: FAR_BERTH_TUNING.tugHull,
            team: 2,
            data: {
              trafficRole: 'tug',
              plantsFarBerthTug: true,
              farBerthStation: station,
              stationId: cut.stationId,
              ai: { passive: true },
              tetherable: true,
              masslineTetherable: true,
            },
          });
          stationRow.tugId = tug && tug.id != null ? tug.id : null;
          stationRow.shadowUntil = now + FAR_BERTH_TUNING.shadowS;
        }
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_FAR_BERTH_CHALK_EVENT, {
            stationId: cut.stationId,
            cuts: stationRow.cuts,
            playerId: player.id,
            chalkPropId: stationRow.chalkPropId,
            tugId: stationRow.tugId,
            t: now,
          });
          this.bus.emit('comms:popup', {
            id: 'plants:pl101:chalk',
            sender: 'DOCKHAND',
            category: 'traffic',
            text: FAR_BERTH_CHALK_LINE,
            ttl: 6,
          });
        }
      }
    }

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_FAR_BERTH_CUT_EVENT, {
        hullId: e.id,
        stationId: cut.stationId,
        cuts: stationRow ? stationRow.cuts : 1,
        speed: Math.round(cut.speed),
        farPier: true,
        t: now,
      });
    }

    // Horns only — the queue keeps its own course; never claim the hull.
    return false;
  },
};
