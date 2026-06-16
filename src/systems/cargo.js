// Cargo system (ARCHITECTURE §0.6 single-writer, §0.12/§0.13 cargo shape, spec 02-mining-ores-cargo).
// Owns state.player.cargo = { items:{[cmdtyId]:qty}, usedVolume, usedMass, capVolume, capMass }.
// VOLUME is the only hard cap; MASS is informational (flight reads it as a handling penalty, never blocks).
// All cargo mutation funnels through addCargo/removeCargo so the usedVolume/usedMass caches never desync.
import { COMMODITIES } from '../data/commodities.js';

// commodityId -> { volPerU, massPerU } lookup, built once from the static registry.
const VOL = Object.create(null);
const MASS = Object.create(null);
for (const c of COMMODITIES) { VOL[c.id] = c.volPerU; MASS[c.id] = c.massPerU; }

// Resolve per-unit footprint, preferring a runtime content registry if one was loaded.
function defOf(state, id) {
  const reg = state && state.content && state.content.commodities;
  if (reg) {
    const c = Array.isArray(reg) ? reg.find((x) => x.id === id) : reg[id];
    if (c) return { vol: c.volPerU, mass: c.massPerU };
  }
  if (id in VOL) return { vol: VOL[id], mass: MASS[id] };
  return null;
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
  if (!def || !(qty > 0)) return 0;
  const volPerU = def.vol > 0 ? def.vol : 1;
  const free = cargo.capVolume - cargo.usedVolume;
  // floor so a bulky item (vol>1) only takes whole units that fit; max(0) guards over-capacity/float drift.
  const accepted = Math.max(0, Math.min(Math.floor(qty), Math.floor(free / volPerU)));
  if (accepted > 0) {
    cargo.items[commodityId] = (cargo.items[commodityId] || 0) + accepted;
    cargo.usedVolume += accepted * volPerU;
    cargo.usedMass += accepted * def.mass;
    emitChanged(cargo);
  }
  if (accepted < Math.floor(qty) && busRef) busRef.emit('cargo:full', { commodityId });
  return accepted;
}

/** Remove up to `qty` units of `commodityId`. Returns the amount actually removed. */
export function removeCargo(state, commodityId, qty) {
  const cargo = state.player.cargo;
  const have = cargo.items[commodityId] || 0;
  const def = defOf(state, commodityId);
  if (!def || !(qty > 0) || have <= 0) return 0;
  const removed = Math.min(Math.floor(qty), have);
  if (removed <= 0) return 0;
  const left = have - removed;
  if (left > 0) cargo.items[commodityId] = left; else delete cargo.items[commodityId];
  cargo.usedVolume -= removed * (def.vol > 0 ? def.vol : 1);
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

    const state = this.state, bus = this.bus;

    // Ejected ore / dropped cargo / loose modules collected by the player ship → hold or inventory.
    bus.on('pickup:collected', ({ collectorId, kind, amount, commodityId }) => {
      if (collectorId !== state.playerId) return; // NPC/drone collection is not the player hold
      const qty = amount || 0;
      if (kind === 'ore' || kind === 'cargo') {
        addCargo(state, commodityId, qty);
      } else if (kind === 'module') {
        // physics only hands us a commodityId → treat it as the module defId; mint a deterministic instanceId.
        state.player.moduleInventory.push({ instanceId: `mi_${++_moduleSeq}`, defId: commodityId });
      }
      // kind 'credits' is economy's concern (§4.4) — ignore here.
    });

    // Active-ship cargo capacity changes (fit swap / stats recompute) → adopt the new derived cap.
    const setCap = (shipId, cargoCap) => {
      if (shipId !== state.playerId) return;
      if (typeof cargoCap === 'number' && cargoCap >= 0) {
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
      vol += q * (def.vol > 0 ? def.vol : 1);
      mass += q * def.mass;
    }
    cargo.usedVolume = vol;
    cargo.usedMass = mass;
    emitChanged(cargo);
  },

  /** Dump up to `qty` units of `commodityId` into space as recoverable pickups. Returns amount dumped. */
  jettison(commodityId, qty) {
    const state = this.state;
    const dumped = removeCargo(state, commodityId, qty);
    if (dumped <= 0) return 0;
    const player = state.entities.get(state.playerId);
    if (player && this.helpers && this.helpers.spawnEntity) {
      const px = player.pos.x, pz = player.pos.z;
      const ang = (state.rng ? state.rng() : 0) * Math.PI * 2; // deterministic scatter (no Math.random in sim)
      const r = 6 + (state.rng ? state.rng() : 0) * 4;
      this.helpers.spawnEntity({
        type: 'pickup',
        pos: { x: px + Math.cos(ang) * r, z: pz + Math.sin(ang) * r },
        radius: 1.5,
        data: { kind: 'cargo', commodityId, amount: dumped, despawnAt: state.simTime + 180 },
      });
    }
    return dumped;
  },
};
