// PL-154 Wrong way — Fly a freight lane against the flow: haulers flash hard, beacons go amber, a tug waits nose-on.
// Row (design/program/INFERENCE_PLANTS.md §A):
//   What happens: Fly a freight lane against the flow and every hauler coming at you flashes
//   hard; the lane's beacons turn amber as you pass. Far enough in, a tug meets you nose-on and
//   simply waits
//   What the player can do: Turn around; or argue with a tug
//
// Invariants:
// - Deterministic: state.simTime/state.tick only; no Math.random() or Date.now();
//   variety via hash32(seed, label, key) from src/core/rng.js.
// - No Three.js or DOM imports.
// - Memory bounded via WRONG_WAY_TUNING.memoryCap with FIFO + stale eviction.
// - NPC movement only via requestTrafficReaction/releaseTrafficReaction; oncoming haulers only
//   flash (no steering), and the tug spawns as its own holding hull, so nothing is leased here.
// - Cooldowns per hull key. All session state lives on `this`, never module-level.

export const PLANTS_WRONG_WAY_FLASH_EVENT = 'plants:wrongWayFlash';
export const PLANTS_WRONG_WAY_AMBER_EVENT = 'plants:wrongWayAmber';
export const PLANTS_WRONG_WAY_TUG_EVENT = 'plants:wrongWayTug';

export const WRONG_WAY_TUNING = Object.freeze({
  headOnRangeWu: 300,         // oncoming detection range
  oncomingRelSpeedWu: 90,     // closing speed at which a head-on pass counts
  oncomingDotMax: -0.6,       // player-vs-hauler velocity dot below this = against the flow
  flashDurationS: 2.5,        // "flashes hard": long lamp flash per oncoming hull
  hullCooldownS: 6,           // per-hull flash cooldown
  amberDurationS: 12,         // lane beacons hold their warning lamps this long as you pass
  beaconRangeWu: 420,         // beacons within this of the player turn warning
  tugCountThreshold: 4,       // oncoming hulls inside the window before the tug meets you
  tugWindowS: 45,             // the "far enough in" counting window
  tugAheadWu: 180,            // the tug meets you this far ahead of your bow, nose-on
  tugHoldS: 40,               // the tug simply waits this long
  tugRadius: 8,
  tugHull: 80,
  withFlowDecayS: 6,          // flying WITH the flow this long stands the tug down
  memoryCap: 32,
});

function finite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Eligibility: an oncoming civilian hauler running the lane the player is flying against.
 */
export function isOncomingHauler(entity, rec = null, state = null, player = null) {
  if (!entity || entity.alive === false || entity.type !== 'ship' || !entity.pos || !player) return false;
  if (state && entity.id === state.playerId) return false;
  const data = entity.data || {};
  if (data.playerOwned || data.wingman || data.isGate || data.isWormhole) return false;
  if (data.disabled || data.derelict) return false;
  if (data.ai && data.ai.pirate === true) return false;
  const role = String(
    (rec && rec.role)
    || data.trafficRole
    || data.jobKind
    || data.role
    || (data.ai && (data.ai.role || data.ai.archetype))
    || '',
  ).toLowerCase();
  return role.includes('hauler') || role.includes('freighter') || role.includes('tanker')
    || role.includes('ore_carrier') || role.includes('cargo');
}

/**
 * Geometry helper (pure): is the player flying against this hull's flow — a head-on closing?
 * Returns flow geometry or null.
 */
export function predictHeadOn(player, hauler, tuning = WRONG_WAY_TUNING) {
  if (!player || !hauler || !player.pos || !hauler.pos || !player.vel || !hauler.vel) return null;
  const rx = finite(player.pos.x) - finite(hauler.pos.x);
  const rz = finite(player.pos.z) - finite(hauler.pos.z);
  const dist = Math.hypot(rx, rz);
  if (!(dist <= tuning.headOnRangeWu)) return null;

  // Flow opposition: velocity directions oppose (cos of the angle below oncomingDotMax).
  const pSpeed = Math.hypot(finite(player.vel.x), finite(player.vel.z));
  const hSpeed = Math.hypot(finite(hauler.vel.x), finite(hauler.vel.z));
  if (!(pSpeed > 0 && hSpeed > 0)) return null;
  const dot = (finite(player.vel.x) * finite(hauler.vel.x) + finite(player.vel.z) * finite(hauler.vel.z));
  const cos = dot / (pSpeed * hSpeed);
  if (!(cos <= tuning.oncomingDotMax)) return null;

  // Closing head-on: separation shrinking fast.
  const rvx = finite(player.vel.x) - finite(hauler.vel.x);
  const rvz = finite(player.vel.z) - finite(hauler.vel.z);
  const closing = -(rx * rvx + rz * rvz) / Math.max(1, dist);
  if (!(closing >= tuning.oncomingRelSpeedWu * 0.4)) return null;
  const relSpeed = Math.hypot(rvx, rvz);
  if (!(relSpeed >= tuning.oncomingRelSpeedWu)) return null;

  return { dist, closing, relSpeed, dotNorm: dot };
}

/**
 * Memory-row builder (pure): the player's wrong-way window ledger, FIFO + stale eviction.
 */
export function wrongWayRowFor(memory, key, now, cap = WRONG_WAY_TUNING.memoryCap) {
  if (!memory || !key) return null;
  let row = memory.get(key);
  if (row && !(now >= row.lastAt)) row = null;
  if (!row) {
    if (memory.size >= cap) {
      for (const [id, old] of memory) {
        if (!(now >= old.lastAt) || now - old.lastAt > WRONG_WAY_TUNING.tugWindowS * 4) memory.delete(id);
      }
      while (memory.size >= cap) memory.delete(memory.keys().next().value);
    }
    row = {
      count: 0,
      windowStartAt: -Infinity,
      tugEntityId: null,
      tugHeldUntil: -Infinity,
      withFlowSince: -1,
      tugStandDownAt: -Infinity,
      lastAt: now,
    };
    memory.set(key, row);
  }
  return row;
}

export const wrongWayOps = {
  _initWrongWay(ctx = {}) {
    this._wrongWayMemory = new Map();
    this._wrongWayHulls = new Map();
    this._wrongWayBeacons = [];
    this._wrongWayLastScanTick = -1;
  },

  _wrongWayMemoryMap() {
    if (!(this._wrongWayMemory instanceof Map)) this._wrongWayMemory = new Map();
    return this._wrongWayMemory;
  },

  _wrongWayEntities() {
    const entities = this.state && this.state.entities;
    if (!entities) return [];
    const out = [];
    if (typeof entities.values === 'function') { for (const e of entities.values()) out.push(e); }
    else if (Array.isArray(entities)) { for (const e of entities) out.push(e); }
    return out;
  },

  /** Tick-gated beacon scan: once per sim tick, never once per hull. */
  _wrongWayScanBeacons(state) {
    const tick = Number.isInteger(state && state.tick) ? state.tick : 0;
    if (tick === this._wrongWayLastScanTick) return this._wrongWayBeacons;
    this._wrongWayLastScanTick = tick;
    this._wrongWayBeacons = this._wrongWayEntities().filter(
      (e) => e && e.alive !== false && e.type === 'beacon' && e.pos && !(e.data && (e.data.isGate || e.data.isWormhole)),
    );
    return this._wrongWayBeacons;
  },

  /**
   * Per-hull hook from the traffic dispatch (oncoming haulers). Haulers only flash hard —
   * they keep their lane, so this never claims the hull and answers false.
   */
  _reactWrongWay(e, rec, stations, state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!isOncomingHauler(e, rec, state, player)) return false;
    if (!player || player.alive === false || !player.pos) return false;

    const now = finite(state.simTime, 0);
    const hulls = this._wrongWayHulls;
    let hullRow = hulls.get(e.id);
    if (!hullRow || !(now >= hullRow.lastAt)) {
      if (hullRow && !(now >= hullRow.lastAt)) hulls.delete(e.id);
      if (hulls.size >= WRONG_WAY_TUNING.memoryCap) {
        while (hulls.size >= WRONG_WAY_TUNING.memoryCap) hulls.delete(hulls.keys().next().value);
      }
      hullRow = { lastFlashAt: -Infinity, lastAt: now };
      hulls.set(e.id, hullRow);
    }
    hullRow.lastAt = now;

    const flow = predictHeadOn(player, e);
    if (!flow) return false;
    if (now - hullRow.lastFlashAt < WRONG_WAY_TUNING.hullCooldownS) return false;
    hullRow.lastFlashAt = now;

    // The hauler flashes hard and keeps its course.
    const data = e.data || (e.data = {});
    data.lampsFlashing = true;
    data.lampFlashUntil = now + WRONG_WAY_TUNING.flashDurationS;

    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit(PLANTS_WRONG_WAY_FLASH_EVENT, { hullId: e.id, relSpeed: Math.round(flow.relSpeed), t: now });
    }

    // The lane's beacons turn warning as you pass: their own lamp flags (which render) carry
    // it — no invented amber field.
    const beaconRangeSq = WRONG_WAY_TUNING.beaconRangeWu * WRONG_WAY_TUNING.beaconRangeWu;
    for (const ent of this._wrongWayScanBeacons(state)) {
      const dx = ent.pos.x - player.pos.x;
      const dz = ent.pos.z - player.pos.z;
      if (dx * dx + dz * dz <= beaconRangeSq) {
        const bdata = ent.data || (ent.data = {});
        bdata.lampsFlashing = true;
        bdata.lampFlashUntil = now + WRONG_WAY_TUNING.amberDurationS;
        if (this.bus && typeof this.bus.emit === 'function') {
          this.bus.emit(PLANTS_WRONG_WAY_AMBER_EVENT, { beaconId: ent.id, until: bdata.lampFlashUntil, t: now });
        }
      }
    }

    // Far enough in: a tug meets you nose-on and simply waits.
    const row = wrongWayRowFor(this._wrongWayMemoryMap(), 'player', now);
    if (!row) return false;
    row.lastAt = now;
    if (now - row.windowStartAt > WRONG_WAY_TUNING.tugWindowS) {
      row.count = 1;
      row.windowStartAt = now;
    } else {
      row.count += 1;
    }

    const spawnEntity = this.helpers && this.helpers.spawnEntity;
    if (row.count >= WRONG_WAY_TUNING.tugCountThreshold && !row.tugEntityId && typeof spawnEntity === 'function') {
      const speed = Math.hypot(finite(player.vel.x), finite(player.vel.z)) || 1;
      const tug = spawnEntity({
        type: 'ship',
        pos: {
          x: finite(player.pos.x) + (finite(player.vel.x) / speed) * WRONG_WAY_TUNING.tugAheadWu,
          z: finite(player.pos.z) + (finite(player.vel.z) / speed) * WRONG_WAY_TUNING.tugAheadWu,
        },
        vel: { x: 0, z: 0 },
        radius: WRONG_WAY_TUNING.tugRadius,
        hull: WRONG_WAY_TUNING.tugHull,
        hullMax: WRONG_WAY_TUNING.tugHull,
        team: 2,
        data: {
          trafficRole: 'tug',
          plantsWrongWayTug: true,
          holdingNoseOn: true,
          tetherable: true,
          masslineTetherable: true,
        },
      });
      row.tugEntityId = tug && tug.id != null ? tug.id : null;
      row.tugHeldUntil = now + WRONG_WAY_TUNING.tugHoldS;
      if (this.bus && typeof this.bus.emit === 'function') {
        this.bus.emit(PLANTS_WRONG_WAY_TUG_EVENT, {
          tugId: row.tugEntityId,
          count: row.count,
          holdingUntil: row.tugHeldUntil,
          t: now,
        });
        this.bus.emit('audio:cue', {
          id: 'sfx_hauler_blast_lean',
          position: { x: player.pos.x, z: player.pos.z },
          gain: 0.9,
          rate: 0.8,
        });
      }
    }
    return false;
  },

  /**
   * Turn-around check, called per-hull for any eligible hull tick (or from the dispatch):
   * flying WITH the flow long enough stands the tug down. Never claims the hull.
   */
  _stepWrongWayTurnaround(state, player) {
    if (!state || (state.mode && state.mode !== 'flight')) return false;
    if (!player || player.alive === false) return false;
    const now = finite(state.simTime, 0);
    const row = wrongWayRowFor(this._wrongWayMemoryMap(), 'player', now);
    if (!row) return false;
    row.lastAt = now;

    const withFlow = (e) => {
      const flow = predictHeadOn(player, e);
      return !flow; // not head-on with anyone = with the flow (or off-lane)
    };
    if (row.tugEntityId != null) {
      if (now >= row.tugHeldUntil) {
        this._standDownTug(row, now, 'held');
        return false;
      }
      // Find any oncoming hull: still against the flow.
      let stillAgainst = false;
      for (const ent of this._wrongWayEntities()) {
        if (isOncomingHauler(ent, null, state, player) && predictHeadOn(player, ent)) {
          stillAgainst = true;
          break;
        }
      }
      if (!stillAgainst) {
        if (row.withFlowSince < 0) row.withFlowSince = now;
        else if (now - row.withFlowSince >= WRONG_WAY_TUNING.withFlowDecayS) {
          this._standDownTug(row, now, 'turned');
        }
      } else {
        row.withFlowSince = -1;
      }
    }
    return false;
  },

  _standDownTug(row, now, reason) {
    const tug = row.tugEntityId != null ? this._entityById(row.tugEntityId) : null;
    if (tug && tug.data) tug.data.holdingNoseOn = false;
    const removeEntity = this.helpers && this.helpers.removeEntity;
    if (tug && typeof removeEntity === 'function') removeEntity(row.tugEntityId);
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('plants:wrongWayStandDown', { tugId: row.tugEntityId, reason, t: now });
    }
    row.tugEntityId = null;
    row.tugHeldUntil = -Infinity;
    row.count = 0;
    row.withFlowSince = -1;
  },

  _entityById(id) {
    if (id == null) return null;
    const entities = this.state && this.state.entities;
    if (!entities) return null;
    if (typeof entities.get === 'function') return entities.get(id) || null;
    if (Array.isArray(entities)) return entities.find((e) => e && e.id === id) || null;
    return null;
  },
};
