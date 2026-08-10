// Cargo system (ARCHITECTURE §0.6 single-writer, §0.12/§0.13 cargo shape, spec 02-mining-ores-cargo).
// Owns state.player.cargo = { items:{[cmdtyId]:qty}, usedVolume, usedMass, capVolume, capMass }.
// VOLUME is the only hard cap; MASS is informational (flight reads it as a handling penalty, never blocks).
// All cargo mutation funnels through addCargo/removeCargo so the usedVolume/usedMass caches never desync.
import { COMMODITIES } from '../data/commodities.js';
import { PERSISTENT_CARGO } from '../data/narrative.js';
import {
  finiteWholePickupAmount,
  PICKUP_ACCEPTANCE_RETRY_S,
} from '../core/pickupAcceptance.js';

// commodityId -> { volPerU, massPerU } lookup, built once from the static registry.
const VOL = Object.create(null);
const MASS = Object.create(null);
for (const c of COMMODITIES) { VOL[c.id] = c.volPerU; MASS[c.id] = c.massPerU; }
const PERSISTENT_FOOTPRINT = new Map(PERSISTENT_CARGO.map((c) => [c.id, { vol: 0, mass: c.mass, persistent: true }]));
const JETTISON_PICKUP_RADIUS = 1.5;
const JETTISON_EJECT_SPEED = 60;
const JETTISON_CLEARANCE = 4;
const JETTISON_PICKUP_EMBARGO_S = 2;

function volumePerUnit(def) {
  return def.persistent ? 0 : (def.vol > 0 ? def.vol : 1);
}

// Resolve per-unit footprint, preferring a runtime content registry if one was loaded.
function defOf(state, id) {
  const reg = state && state.content && state.content.commodities;
  if (reg) {
    const c = Array.isArray(reg) ? reg.find((x) => x.id === id) : reg[id];
    if (c) return { vol: c.volPerU, mass: c.massPerU };
  }
  if (id in VOL) return { vol: VOL[id], mass: MASS[id] };
  if (PERSISTENT_FOOTPRINT.has(id)) return PERSISTENT_FOOTPRINT.get(id);
  return null;
}

export function isPersistentCargo(state, commodityId) {
  const locked = state && state.story && state.story.persistentCargo;
  return Array.isArray(locked) && locked.includes(commodityId);
}

/**
 * True if `commodityId` is sealed contract freight that the player must not sell or jettison mid-run.
 *
 * This guards the player-facing trade/dump paths (market Sell, station hold Sell) the same way the
 * HUD already guards jettison. It narrows to ONLY preloaded-mission cargo: contracts that load a
 * sealed manifest into the hold at accept time (cargo_delivery / salvage_retrieval / smuggling_run
 * with `preloadedCargo:true`). Selling those bricks the mission with no recovery. It deliberately
 * does NOT cover `bulk_trade`/`bulk_haul` — those missions REQUIRE selling generic goods at the
 * destination, so those commodity ids must stay sellable.
 *
 * Plain state read (no missions import) → no circular dependency. The canonical cargo writer
 * (`removeCargo`) is intentionally NOT gated by this: the missions system has legitimate internal
 * consumers (`_deliverCargo`, `_removePreloadedContractCargo`) that remove preloaded cargo through
 * the writer directly. The guard belongs on player intent, not on the writer.
 */
export function isUnsellableCargo(state, commodityId) {
  if (isPersistentCargo(state, commodityId)) return true;
  const active = state && state.missions && state.missions.active;
  if (!Array.isArray(active)) return false;
  for (const m of active) {
    if (m && m.status === 'active' && m.preloadedCargo === true && m.params && m.params.cmdtyId === commodityId) {
      return true;
    }
  }
  return false;
}

// Module-level bus reference so the exported helpers can emit cargo:changed when called
// from outside the system instance (economy/mining/salvage). Stays null in unit tests → silent.
let busRef = null;
let _moduleSeq = 0;

function emitChanged(cargo) {
  if (busRef) busRef.emit('cargo:changed', { cargo, usedU: cargo.usedVolume, massT: cargo.usedMass });
}

/** Add `qty` units of `commodityId` to the player hold. Clamps to remaining VOLUME (hard cap).
 *  Updates the usedVolume/usedMass caches incrementally (so back-to-back adds in one tick respect
 *  the cap and the emitted totals are accurate). Returns the amount actually accepted. */
export function addCargo(state, commodityId, qty) {
  const cargo = state.player.cargo;
  const def = defOf(state, commodityId);
  const requested = finiteWholePickupAmount(qty);
  if (!def || requested <= 0) return 0;
  const volPerU = volumePerUnit(def);
  const free = cargo.capVolume - cargo.usedVolume;
  // floor so a bulky item (vol>1) only takes whole units that fit; max(0) guards over-capacity/float drift.
  const accepted = volPerU === 0 ? Math.max(0, requested) : Math.max(0, Math.min(requested, Math.floor(free / volPerU)));
  if (accepted > 0) {
    cargo.items[commodityId] = (cargo.items[commodityId] || 0) + accepted;
    cargo.usedVolume += accepted * volPerU;
    cargo.usedMass += accepted * def.mass;
    emitChanged(cargo);
  }
  if (accepted < requested && busRef) busRef.emit('cargo:full', { commodityId });
  return accepted;
}

/** Remove up to `qty` units of `commodityId`. Returns the amount actually removed. */
export function removeCargo(state, commodityId, qty) {
  if (isPersistentCargo(state, commodityId)) return 0;
  const cargo = state.player.cargo;
  const have = cargo.items[commodityId] || 0;
  const def = defOf(state, commodityId);
  const requested = finiteWholePickupAmount(qty);
  if (!def || requested <= 0 || have <= 0) return 0;
  const removed = Math.min(requested, have);
  if (removed <= 0) return 0;
  const left = have - removed;
  if (left > 0) cargo.items[commodityId] = left; else delete cargo.items[commodityId];
  cargo.usedVolume -= removed * volumePerUnit(def);
  cargo.usedMass -= removed * def.mass;
  if (cargo.usedVolume < 0) cargo.usedVolume = 0;
  if (cargo.usedMass < 0) cargo.usedMass = 0;
  emitChanged(cargo);
  return removed;
}

export const cargo = {
  name: 'cargo',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    busRef = ctx.bus;
    this._dirty = false;
    this._massDirty = false;

    const state = this.state, bus = this.bus;
    // Collapse any number of synchronous cargo mutations into one settled mass receipt during
    // cargo's registered simulation update. Consumers can refresh physics once per tick without
    // delaying or weakening the authoritative cargo:changed UI/data signal.
    bus.on('cargo:changed', () => { this._massDirty = true; });

    // Ejected ore / dropped cargo / loose modules collected by the player ship → hold or inventory.
    bus.on('pickup:collected', (payload) => {
      if (!payload || payload.collectorId !== state.playerId) return; // NPC/drone collection is not the player hold
      const { kind, commodityId } = payload;
      const qty = finiteWholePickupAmount(payload.amount);
      if (kind === 'ore' || kind === 'cargo') {
        // Synchronous acceptance is the collection commit point. Physics/mining emit one mutable
        // payload, cargo writes the exact accepted remainder, then the emitting owner decides
        // whether the physical pickup survives. Downstream observers see stable final fields.
        const accepted = addCargo(state, commodityId, qty);
        payload.acceptedAmount = accepted;
        payload.rejectedAmount = Math.max(0, qty - accepted);
        if (qty <= 0) payload.invalidAmount = true;
        if (payload.rejectedAmount > 0) {
          payload.acceptanceRetryAt = (state.simTime || 0) + PICKUP_ACCEPTANCE_RETRY_S;
        }
      } else if (kind === 'module') {
        // physics only hands us a commodityId → treat it as the module defId; mint a deterministic instanceId.
        const count = typeof commodityId === 'string' && commodityId.length > 0 ? qty : 0;
        for (let i = 0; i < count; i++) {
          state.player.moduleInventory.push({ instanceId: `mi_${++_moduleSeq}`, defId: commodityId });
        }
        payload.acceptedAmount = count;
        payload.rejectedAmount = Math.max(0, qty - count);
        if (qty <= 0 || count <= 0) payload.invalidAmount = true;
        if (payload.rejectedAmount > 0) {
          payload.acceptanceRetryAt = (state.simTime || 0) + PICKUP_ACCEPTANCE_RETRY_S;
        }
      }
      // kind 'credits' is economy's concern (§4.4) — ignore here.
    });

    // Active-ship cargo capacity changes (fit swap / stats recompute) → adopt the new derived cap.
    const setCap = (shipId, cargoCap) => {
      if (shipId !== state.playerId) return;
      if (typeof cargoCap === 'number' && cargoCap >= 0) {
        if (state.player.cargo.capVolume === cargoCap) return;
        state.player.cargo.capVolume = cargoCap;
        this._dirty = true; // backstop recompute (a cap *decrease* leaves used > cap until volume drops)
      }
    };
    bus.on('ship:cargoCapChanged', ({ shipId, cargoCap }) => setCap(shipId, cargoCap));
    bus.on('ship:statsChanged', ({ shipId, derived }) => {
      if (derived && typeof derived.cargoCap === 'number') setCap(shipId, derived.cargoCap);
    });

    this.recompute(); // seed caches from whatever the starting hold contains
  },

  update(dt, state) {
    if (this._dirty) { this.recompute(); this._dirty = false; }
    if (this._massDirty) {
      this._massDirty = false;
      const c = state.player.cargo;
      this.bus.emit('cargo:massSettled', { cargo: c, usedU: c.usedVolume, massT: c.usedMass });
    }
  },

  /** Authoritative full recompute of usedVolume/usedMass from items (drift backstop). */
  recompute() {
    const state = this.state;
    const cargo = state.player.cargo;
    let vol = 0, mass = 0;
    for (const id in cargo.items) {
      const q = cargo.items[id];
      const def = defOf(state, id);
      if (!def) continue;
      vol += q * volumePerUnit(def);
      mass += q * def.mass;
    }
    cargo.usedVolume = vol;
    cargo.usedMass = mass;
    emitChanged(cargo);
  },

  addCargo(commodityId, qty) {
    return addCargo(this.state, commodityId, qty);
  },

  removeCargo(commodityId, qty) {
    return removeCargo(this.state, commodityId, qty);
  },

  /** Dump up to `qty` units of `commodityId` into space as recoverable pickups. Returns amount dumped. */
  jettison(commodityId, qty) {
    const state = this.state;
    const dumped = removeCargo(state, commodityId, qty);
    if (dumped <= 0) return 0;
    const player = state.entities.get(state.playerId);
    if (player && this.helpers && this.helpers.spawnEntity) {
      const px = player.pos.x, pz = player.pos.z;
      const rot = Number.isFinite(player.rot) ? player.rot : 0;
      const fx = Math.cos(rot), fz = Math.sin(rot);
      const r = Math.max(0, Number(player.radius) || 0) + JETTISON_PICKUP_RADIUS + JETTISON_CLEARANCE;
      const vx = Number.isFinite(player.vel && player.vel.x) ? player.vel.x : 0;
      const vz = Number.isFinite(player.vel && player.vel.z) ? player.vel.z : 0;
      this.helpers.spawnEntity({
        type: 'pickup',
        // Reaction mass leaves directly aft, already outside both hull contact and the mining
        // collector. A short sim-time embargo lets it establish separation before magnetism can
        // reclaim it; after that it is ordinary recoverable cargo again.
        pos: { x: px - fx * r, z: pz - fz * r },
        vel: { x: vx - fx * JETTISON_EJECT_SPEED, z: vz - fz * JETTISON_EJECT_SPEED },
        radius: JETTISON_PICKUP_RADIUS,
        collides: false,
        data: {
          kind: 'cargo', commodityId, amount: dumped,
          jettisonedCargo: true,
          pickupEmbargoUntil: state.simTime + JETTISON_PICKUP_EMBARGO_S,
          despawnAt: state.simTime + 180,
        },
      });
    }
    // Receipt seam (Wave M2 §5.3): the dump is announced so reaction-impulse/heat/AI layers can
    // observe it without owning cargo. Emitting is not a state write — the 47-A harness has no
    // subscriber for it, and the massline2 impulse consumer is flag-gated OFF headless.
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:jettisoned', { commodityId, amount: dumped });
    }
    return dumped;
  },
};
