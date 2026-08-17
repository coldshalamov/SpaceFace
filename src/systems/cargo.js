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
const JETTISON_POD_RADIUS_MIN = 2.5;
const JETTISON_POD_RADIUS_MAX = 6.5;
const JETTISON_POD_MASS_MIN = 4;
const JETTISON_POD_MASS_MAX = 90;
const JETTISON_EJECT_SPEED = 60;
const JETTISON_CLEARANCE = 4;
const JETTISON_PICKUP_EMBARGO_S = 2;

// Plan 54 loadout presets keep cargo under Cargo's authority. A fit preset never owns a shadow
// hold and never silently throws freight away; its saved policy is an admission rule evaluated
// against the target derived capacity before Ships commits an otherwise-atomic module swap.
export const LOADOUT_CARGO_POLICIES = Object.freeze([
  Object.freeze({
    id: 'carry_current',
    label: 'Carry current cargo',
    detail: 'Switch if every unit already aboard fits the target hold.',
  }),
  Object.freeze({
    id: 'reserve_quarter',
    label: 'Keep 25% hold free',
    detail: 'Switch only with one quarter of the target hold left open for salvage or ore.',
  }),
]);
const LOADOUT_CARGO_POLICY_IDS = new Set(LOADOUT_CARGO_POLICIES.map((policy) => policy.id));

export function normalizeLoadoutCargoPolicy(value) {
  return LOADOUT_CARGO_POLICY_IDS.has(value) ? value : 'carry_current';
}

/** Pure Cargo-owned gate for a proposed loadout capacity. Returns the exact unload requirement;
 * callers may explain the failure, but only Cargo/economy writers may change the hold. */
export function loadoutCargoPolicyStatus(state, policyId, targetCapacity) {
  const cargo = state && state.player && state.player.cargo || {};
  const cargoPolicy = normalizeLoadoutCargoPolicy(policyId);
  const capacity = Math.max(0, Math.floor(Number(targetCapacity) || 0));
  const used = Math.max(0, Number(cargo.usedVolume) || 0);
  const reserve = cargoPolicy === 'reserve_quarter' ? Math.ceil(capacity * 0.25) : 0;
  const permittedUsed = Math.max(0, capacity - reserve);
  const unloadVolume = Math.max(0, Math.ceil(used - permittedUsed));
  const ok = unloadVolume === 0;
  const text = ok ? null : cargoPolicy === 'reserve_quarter'
    ? `Preset keeps 25% of the hold free — unload ${unloadVolume}u first`
    : `Current cargo exceeds the target hold — unload ${unloadVolume}u first`;
  return Object.freeze({
    ok,
    policyId: cargoPolicy,
    capacity,
    used,
    reserve,
    permittedUsed,
    unloadVolume,
    text,
  });
}

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

function emitLootCollected(bus, payload, amount) {
  if (!bus || !bus.emit || !(amount > 0)) return;
  const lotSource = payload.lotSource && typeof payload.lotSource === 'object'
    ? { ...payload.lotSource }
    : null;
  bus.emit('loot:collected', {
    kind: payload.kind,
    commodityId: payload.commodityId,
    amount,
    pickupId: payload.pickupId ?? null,
    collectorId: payload.collectorId ?? null,
    source: 'pickup',
    simTime: payload.simTime ?? null,
    ...(lotSource ? { lotSource } : {}),
  });
}

function richLotSource(source, commodityId, qty) {
  if (!source || typeof source !== 'object') return null;
  const opportunityId = typeof source.richOpportunityId === 'string' && source.richOpportunityId
    ? source.richOpportunityId
    : typeof source.opportunityId === 'string' && source.opportunityId ? source.opportunityId : null;
  const provenanceId = typeof source.provenanceId === 'string' && source.provenanceId
    ? source.provenanceId : null;
  const explicitLotId = typeof source.lotId === 'string' && source.lotId ? source.lotId : null;
  if (!opportunityId && !provenanceId && !explicitLotId) return null;
  const sourceQty = source.richQty != null ? source.richQty
    : source.lotQty != null ? source.lotQty : qty;
  const amount = Math.max(0, Math.floor(Number(sourceQty) || 0));
  if (amount <= 0) return null;
  const lotId = explicitLotId || `rich-lot:${opportunityId}`;
  return {
    lotId,
    commodityId,
    qty: amount,
    ...(opportunityId ? {
      richOpportunityId: opportunityId,
      richBonusU: Math.max(0, Math.floor(Number(source.richBonusU) || 0)),
    } : {}),
    ...(provenanceId ? { provenanceId } : {}),
    ...(source.sourceKind ? { sourceKind: String(source.sourceKind) } : {}),
    ...(source.sourcePoiId ? { sourcePoiId: String(source.sourcePoiId) } : {}),
    ...(source.recordId ? { recordId: String(source.recordId) } : {}),
    ...(source.choiceId ? { choiceId: String(source.choiceId) } : {}),
    ...(source.fieldId != null ? { fieldId: String(source.fieldId) } : {}),
    ...(source.activityObjectSlotId != null ? { activityObjectSlotId: String(source.activityObjectSlotId) } : {}),
    ...(source.richResolution || source.resolution
      ? { resolution: source.richResolution || source.resolution }
      : {}),
    sourceOwner: source.sourceOwner || (source.claimedByKind === 'npc' ? 'npc' : 'player'),
  };
}

function appendRichLot(cargo, source, commodityId, qty) {
  const lot = richLotSource(source, commodityId, qty);
  if (!lot) return;
  lot.qty = Math.min(lot.qty, qty);
  if (!Array.isArray(cargo.richLots)) cargo.richLots = [];
  const existing = cargo.richLots.find((row) => row && row.lotId === lot.lotId);
  if (existing) {
    existing.qty += lot.qty;
    return;
  }
  cargo.richLots.push(lot);
}

function decrementRichLots(cargo, commodityId, qty) {
  if (!Array.isArray(cargo.richLots) || qty <= 0) return;
  let remaining = qty;
  for (const lot of cargo.richLots) {
    if (remaining <= 0) break;
    if (!lot || lot.commodityId !== commodityId || !(lot.qty > 0)) continue;
    const used = Math.min(remaining, lot.qty);
    lot.qty -= used;
    remaining -= used;
  }
  cargo.richLots = cargo.richLots.filter((lot) => lot && lot.qty > 0);
}

function richLotSourcesForQty(cargo, commodityId, qty) {
  if (!Array.isArray(cargo.richLots) || qty <= 0) return [];
  const allocations = [];
  let remaining = qty;
  for (const lot of cargo.richLots) {
    if (remaining <= 0) break;
    if (!lot || lot.commodityId !== commodityId || !(lot.qty > 0)) continue;
    const richQty = Math.min(remaining, lot.qty);
    allocations.push({ ...lot, richQty });
    remaining -= richQty;
  }
  return allocations;
}

/** Add `qty` units of `commodityId` to the player hold. Clamps to remaining VOLUME (hard cap).
 *  Updates the usedVolume/usedMass caches incrementally (so back-to-back adds in one tick respect
 *  the cap and the emitted totals are accurate). Returns the amount actually accepted. */
export function addCargo(state, commodityId, qty, lotSource = null) {
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
    if (lotSource) appendRichLot(cargo, lotSource, commodityId, accepted);
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
  decrementRichLots(cargo, commodityId, removed);
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
        const pickup = payload.pickupId != null && state.entities && state.entities.get
          ? state.entities.get(payload.pickupId) : null;
        const source = payload.richLotSource || payload.lotSource
          || pickup && pickup.data && (pickup.data.richLotSource || pickup.data.lotSource)
          || null;
        const accepted = addCargo(state, commodityId, qty, source);
        payload.acceptedAmount = accepted;
        payload.rejectedAmount = Math.max(0, qty - accepted);
        // Downstream outcome owners receive the finalized accepted provenance even when the core
        // collision seam supplied only pickupId. The payload is the synchronous commit receipt.
        if (source && source.provenanceId) {
          payload.lotSource = { ...source, lotQty: accepted };
        }
        if (qty <= 0) payload.invalidAmount = true;
        if (payload.rejectedAmount > 0) {
          payload.acceptanceRetryAt = (state.simTime || 0) + PICKUP_ACCEPTANCE_RETRY_S;
        }
        emitLootCollected(bus, payload, accepted);
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
        emitLootCollected(bus, payload, count);
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
    if (Array.isArray(cargo.richLots)) {
      const available = cargo.items || {};
      const remaining = { ...available };
      cargo.richLots = cargo.richLots
        .filter((lot) => lot && typeof lot.commodityId === 'string' && lot.qty > 0 && available[lot.commodityId] > 0)
        .map((lot) => {
          const qty = Math.min(Math.floor(Number(lot.qty) || 0), Math.floor(Number(remaining[lot.commodityId]) || 0));
          remaining[lot.commodityId] = Math.max(0, (remaining[lot.commodityId] || 0) - qty);
          return { ...lot, qty };
        })
        .filter((lot) => lot.qty > 0);
    }
    emitChanged(cargo);
  },

  addCargo(commodityId, qty, lotSource = null) {
    return addCargo(this.state, commodityId, qty, lotSource);
  },

  removeCargo(commodityId, qty) {
    return removeCargo(this.state, commodityId, qty);
  },

  /** Dump up to `qty` units of `commodityId` into space as recoverable physical pods. Returns amount dumped. */
  jettison(commodityId, qty, options = {}) {
    const state = this.state;
    const placement = options && options.placement && typeof options.placement === 'object'
      ? options.placement
      : null;
    const richSources = richLotSourcesForQty(state.player.cargo, commodityId, qty);
    const dumped = removeCargo(state, commodityId, qty);
    if (dumped <= 0) return 0;
    const player = state.entities.get(state.playerId);
    if (player && this.helpers && this.helpers.spawnEntity) {
      const px = player.pos.x, pz = player.pos.z;
      const rot = Number.isFinite(player.rot) ? player.rot : 0;
      const fx = Math.cos(rot), fz = Math.sin(rot);
      const vx = Number.isFinite(player.vel && player.vel.x) ? player.vel.x : 0;
      const vz = Number.isFinite(player.vel && player.vel.z) ? player.vel.z : 0;
      const podIds = [];
      const spawnJettisonPod = (amount, richSource = null) => {
        if (!(amount > 0)) return;
        const unitMass = Math.max(0.1, Number(MASS[commodityId]) || 0.1);
        const podMass = Math.max(JETTISON_POD_MASS_MIN,
          Math.min(JETTISON_POD_MASS_MAX, unitMass * amount));
        const podRadius = Math.max(JETTISON_POD_RADIUS_MIN,
          Math.min(JETTISON_POD_RADIUS_MAX, JETTISON_POD_RADIUS_MIN + Math.sqrt(amount) * 0.35));
        const clearance = Math.max(0, Number(player.radius) || 0) + podRadius + JETTISON_CLEARANCE;
        const placedX = placement && Number.isFinite(Number(placement.x)) ? Number(placement.x) : px - fx * clearance;
        const placedZ = placement && Number.isFinite(Number(placement.z)) ? Number(placement.z) : pz - fz * clearance;
        const placedVx = placement && Number.isFinite(Number(placement.vx)) ? Number(placement.vx) : vx - fx * JETTISON_EJECT_SPEED;
        const placedVz = placement && Number.isFinite(Number(placement.vz)) ? Number(placement.vz) : vz - fz * JETTISON_EJECT_SPEED;
        const placedSolid = !!(placement && placement.solid === true);
        const ttl = placement && placement.persistent === true
          ? Number.POSITIVE_INFINITY
          : Math.max(1, Number(placement && placement.ttl) || 180);
        const pod = this.helpers.spawnEntity({
          type: 'payload',
          // Reaction mass leaves directly aft, already outside hull contact. A short sim-time
          // embargo lets the payload establish separation before it becomes a solid collision
          // body; the jettison owner then admits it to ordinary Rapier contact and recovery.
          pos: { x: placedX, z: placedZ },
          vel: { x: placedVx, z: placedVz },
          radius: podRadius,
          mass: podMass,
          ttl,
          collides: placedSolid,
          physicsBody: {
            dynamic: true,
            ccd: true,
            radius: podRadius,
            mass: podMass,
            inertiaY: 0.5 * podMass * podRadius * podRadius,
            material: placedSolid ? 'payload' : 'massline_sensor',
            shape: 'ball',
          },
          data: {
            kind: 'cargo', commodityId, amount,
            ...(richSource ? { richLotSource: { ...richSource, richQty: amount } } : {}),
            jettisonedCargo: true,
            recoverableCargoPod: true,
            sourceActorId: player.id,
            jettisonPurpose: String(options && options.purpose || 'manual'),
            solidMaterialAfterEmbargo: 'payload',
            pickupEmbargoUntil: state.simTime + (placedSolid ? 0 : JETTISON_PICKUP_EMBARGO_S),
            despawnAt: Number.isFinite(ttl) ? state.simTime + ttl : Number.POSITIVE_INFINITY,
          },
        });
        if (pod && pod.id != null) podIds.push(pod.id);
      };
      let allocated = 0;
      for (const richSource of richSources) {
        const amount = Math.min(dumped - allocated, richSource.richQty);
        spawnJettisonPod(amount, richSource);
        allocated += amount;
      }
      spawnJettisonPod(Math.max(0, dumped - allocated));
      options = { ...(options || {}), podIds };
    }
    // Receipt seam (Wave M2 §5.3): the dump is announced so reaction-impulse/heat/AI layers can
    // observe it without owning cargo. Emitting is not a state write — the 47-A harness has no
    // subscriber for it, and the massline2 impulse consumer is flag-gated OFF headless.
    if (this.bus && typeof this.bus.emit === 'function') {
      this.bus.emit('cargo:jettisoned', {
        commodityId,
        amount: dumped,
        purpose: String(options && options.purpose || 'manual'),
        parleySquadId: options && options.parleySquadId || null,
        reactionImpulse: !(options && options.reactionImpulse === false),
        podIds: Array.isArray(options && options.podIds) ? options.podIds.slice() : [],
      });
    }
    return dumped;
  },
};
