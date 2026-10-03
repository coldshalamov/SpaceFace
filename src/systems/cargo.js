// Cargo system (ARCHITECTURE §0.6 single-writer, §0.12/§0.13 cargo shape, spec 02-mining-ores-cargo).
// Owns state.player.cargo = { items:{[cmdtyId]:qty}, usedVolume, usedMass, capVolume, capMass }.
// VOLUME is the only hard cap; MASS is informational (flight reads it as a handling penalty, never blocks).
// All cargo mutation funnels through addCargo/removeCargo so the usedVolume/usedMass caches never desync.
import { COMMODITIES } from '../data/commodities.js';
import { combatFlag } from '../data/featureFlags.js';
import { PERSISTENT_CARGO } from '../data/narrative.js';
import { resolveGovernedCombatSpeed } from '../core/flight/propulsionCatalog.js';
import {
  finiteWholePickupAmount,
  PICKUP_ACCEPTANCE_RETRY_S,
} from '../core/pickupAcceptance.js';
import { spawnJettisonedCargoPod, volatileThrowSpeedScale } from './lootShards.js';
import { getDerivedStats, shipworksStationAccess } from './ships.js';

// commodityId -> { volPerU, massPerU } lookup, built once from the static registry.
const VOL = Object.create(null);
const MASS = Object.create(null);
for (const c of COMMODITIES) { VOL[c.id] = c.volPerU; MASS[c.id] = c.massPerU; }
// Receipt copy needs the player-facing name (the mechanic voice uses the same registry).
const COMMODITY_NAME = new Map(COMMODITIES.map((c) => [c.id, c.name]));
function commodityName(commodityId) {
  return COMMODITY_NAME.get(commodityId) || String(commodityId || '');
}
const PERSISTENT_FOOTPRINT = new Map(PERSISTENT_CARGO.map((c) => [c.id, { vol: 0, mass: c.mass, persistent: true }]));
const JETTISON_POD_RADIUS = 3;
const JETTISON_EJECT_SPEED = 60;
const JETTISON_CLEARANCE = 4;
const JETTISON_PICKUP_EMBARGO_S = 2;
export const HOT_DOCK_CRUISE_FRACTION = 0.2;
export const HOT_DOCK_MAX_PODS = 2;

// One commodity the mechanic can name. A later dock with no new spill deletes it,
// so the same sentence is not spoken again.
function clearDockSpill(state) {
  const cargo = state && state.player && state.player.cargo;
  if (cargo && Object.prototype.hasOwnProperty.call(cargo, 'dockSpill')) delete cargo.dockSpill;
}

function writeDockSpill(state, commodityId, count) {
  const cargo = state && state.player && state.player.cargo;
  if (!cargo) return;
  const qty = Math.floor(Number(count) || 0);
  if (typeof commodityId !== 'string' || !commodityId || qty <= 0) {
    clearDockSpill(state);
    return;
  }
  cargo.dockSpill = { commodityId, count: qty };
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
/**
 * Sealed contract freight. A preloaded mission (`preloadedCargo:true` on cargo_delivery /
 * salvage_retrieval / smuggling_run) reserves units of `params.cmdtyId` until it delivers or ends;
 * units the player bought or salvaged on top of the manifest are their own. Persistent story cargo
 * and `fixtureSealed` ids seal the entire held lot. `bulk_trade`/`bulk_haul` commodities stay
 * sellable — those missions require selling generic goods at the destination.
 *
 * Plain state reads (no missions import) → no circular dependency. The canonical cargo writer
 * (`removeCargo`) is intentionally NOT gated: the missions system removes preloaded cargo through
 * the writer directly. The guards belong on player intent, not on the writer.
 */
function heldCargoQuantity(state, commodityId) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  return Math.max(0, Math.floor(Number(items && items[commodityId]) || 0));
}

/**
 * Remaining sealed claim for one preloaded contract.
 * An accounted `sealedRemaining` is the owner's record. A known `qty` with no delivery
 * record reserves the full obligation — old saves must not invent delivered progress.
 * No quantity at all is ambiguous: the whole held stack stays sealed.
 */
function preloadedClaim(mission) {
  if (!mission || mission.preloadedCargo !== true || !mission.params) return null;
  const commodityId = mission.params.cmdtyId;
  if (typeof commodityId !== 'string' || !commodityId) return null;
  const params = mission.params;
  if (params.sealAccounted === true && Number.isFinite(Number(params.sealedRemaining))) {
    return {
      commodityId,
      remaining: Math.max(0, Math.floor(Number(params.sealedRemaining))),
      explicit: true,
    };
  }
  const qty = Number(params.qty);
  if (Number.isFinite(qty) && qty > 0) {
    return { commodityId, remaining: Math.floor(qty), explicit: true };
  }
  return { commodityId, remaining: null, explicit: false };
}

function activePreloadedClaims(state, commodityId) {
  const active = state && state.missions && state.missions.active;
  if (!Array.isArray(active)) return [];
  const claims = [];
  for (const mission of active) {
    if (!mission || mission.status !== 'active') continue;
    const claim = preloadedClaim(mission);
    if (!claim || claim.commodityId !== commodityId) continue;
    claims.push({ mission, claim });
  }
  return claims;
}

/** Units of `commodityId` ordinary sale and jettison must leave aboard. */
export function reservedCargoQuantity(state, commodityId) {
  const held = heldCargoQuantity(state, commodityId);
  if (isPersistentCargo(state, commodityId)) return held;
  if (Array.isArray(state?.fixtureSealed) && state.fixtureSealed.includes(commodityId)) return held;
  const claims = activePreloadedClaims(state, commodityId);
  if (!claims.length) return 0;
  if (claims.some((row) => !row.claim.explicit)) return held;
  let reserved = 0;
  for (const row of claims) reserved += row.claim.remaining;
  return reserved;
}

/** Units the player may sell or dump. Held minus a valid reservation, never below zero. */
export function sellableCargoQuantity(state, commodityId) {
  if (isPersistentCargo(state, commodityId)) return 0;
  if (Array.isArray(state?.fixtureSealed) && state.fixtureSealed.includes(commodityId)) return 0;
  const held = heldCargoQuantity(state, commodityId);
  const claims = activePreloadedClaims(state, commodityId);
  if (!claims.length) return held;
  if (claims.some((row) => !row.claim.explicit)) return 0;
  let reserved = 0;
  for (const row of claims) reserved += row.claim.remaining;
  return Math.max(0, held - reserved);
}

/** NXB-025 published spellings — aliases of the canonical *Quantity readers above. */
export function reservedCargoQty(state, commodityId) {
  return reservedCargoQuantity(state, commodityId);
}

export function sellableCargoQty(state, commodityId) {
  return sellableCargoQuantity(state, commodityId);
}

/** True when a seal exists and leaves nothing the player may sell or dump. */
export function isUnsellableCargo(state, commodityId) {
  const sealed = isPersistentCargo(state, commodityId)
    || (Array.isArray(state?.fixtureSealed) && state.fixtureSealed.includes(commodityId))
    || activePreloadedClaims(state, commodityId).length > 0;
  return sealed && sellableCargoQuantity(state, commodityId) <= 0;
}

/**
 * Units this contract may take out of the hold without spending another contract's reservation.
 * Ambiguous rows (no quantity) release only the legacy single-unit obligation, capped by
 * explicit siblings. An explicit row releases its own remaining units, and nothing when an
 * ambiguous sibling still seals the whole stack.
 */
export function releasableContractUnits(state, mission) {
  const claim = preloadedClaim(mission);
  if (!claim) return 0;
  const held = heldCargoQuantity(state, claim.commodityId);
  let explicitOthers = 0;
  let ambiguousSibling = false;
  const active = state && state.missions && state.missions.active;
  if (Array.isArray(active)) {
    for (const other of active) {
      if (!other || other === mission || other.id === mission.id || other.status !== 'active') continue;
      const sibling = preloadedClaim(other);
      if (!sibling || sibling.commodityId !== claim.commodityId) continue;
      if (!sibling.explicit) ambiguousSibling = true;
      else explicitOthers += sibling.remaining;
    }
  }
  const room = Math.max(0, held - explicitOthers);
  if (!claim.explicit) {
    const qty = Math.max(1, Math.floor(Number(mission.params && mission.params.qty) || 1));
    return Math.min(qty, room);
  }
  if (ambiguousSibling) return 0;
  return Math.min(claim.remaining, room);
}

/** The lot a flight jettison dumps.
 *  A held explicit focus is that lot, or a refusal when the lot is sealed.
 *  Another dumpable lot is the default only when no held focus was chosen.
 */
export function selectedJettisonLot(state) {
  const cargo = state && state.player && state.player.cargo;
  const items = cargo && cargo.items;
  if (!items || typeof items !== 'object') return null;
  const fromHold = typeof cargo.selectedId === 'string' && cargo.selectedId ? cargo.selectedId : '';
  const fromUi = !fromHold && state.ui && typeof state.ui.selectedCommodityId === 'string'
    ? state.ui.selectedCommodityId
    : '';
  const focus = fromHold || fromUi;
  // An explicit fully sealed or persistent lot is a refusal. Do not substitute a different good.
  // A lot that still has unreserved units dumps those units, not a neighbor.
  if (focus && Number(items[focus]) > 0) {
    return sellableCargoQuantity(state, focus) > 0 ? focus : null;
  }
  const ids = Object.keys(items)
    .filter((id) => Number(items[id]) > 0 && sellableCargoQuantity(state, id) > 0)
    .sort();
  return ids[0] || null;
}

// Exported addCargo/removeCargo calls need their state-local bus without relying on whichever
// system instance initialized most recently. Bindings are weakly keyed by state so isolated
// runtimes cannot cross-talk and disposed states do not stay alive through this module.
const stateBindings = new WeakMap();
const ownerBindings = new WeakMap();
let _moduleSeq = 0n;

function detachBinding(binding) {
  if (!binding) return;
  for (const unsubscribe of binding.unsubs || []) {
    if (typeof unsubscribe === 'function') unsubscribe();
  }
  binding.unsubs.length = 0;
  if (stateBindings.get(binding.state) === binding) stateBindings.delete(binding.state);
  const owned = ownerBindings.get(binding.owner);
  if (owned) {
    owned.delete(binding);
    if (owned.size === 0) ownerBindings.delete(binding.owner);
  }
  if (binding.owner && binding.owner._binding === binding) {
    binding.owner._binding = null;
    binding.owner._unsubs = [];
  }
}

function attachBinding(state, bus, owner) {
  const existingBindings = ownerBindings.get(owner);
  if (existingBindings) {
    for (const binding of [...existingBindings]) detachBinding(binding);
  }
  const prior = stateBindings.get(state);
  if (prior) detachBinding(prior);
  const binding = {
    state,
    bus,
    owner,
    unsubs: [],
    dirty: false,
    massDirty: false,
  };
  stateBindings.set(state, binding);
  let owned = ownerBindings.get(owner);
  if (!owned) {
    owned = new Set();
    ownerBindings.set(owner, owned);
  }
  owned.add(binding);
  return binding;
}

function subscribe(binding, event, handler) {
  if (!binding || !binding.bus || typeof binding.bus.on !== 'function') return;
  const unsubscribe = binding.bus.on(event, handler);
  if (typeof unsubscribe === 'function') binding.unsubs.push(unsubscribe);
  else if (typeof binding.bus.off === 'function') {
    binding.unsubs.push(() => binding.bus.off(event, handler));
  }
}

function busForState(state) {
  const binding = state && typeof state === 'object' ? stateBindings.get(state) : null;
  return binding && binding.bus && typeof binding.bus.emit === 'function' ? binding.bus : null;
}

function nextLooseModuleInstanceId(state) {
  // Continue may restore legacy mi_N inventory into a fresh process. Rebase before every allocation
  // so the process-local fast path can never mint an ID already present in restored save data.
  let rebased = _moduleSeq;
  const inventory = state && state.player && state.player.moduleInventory;
  if (Array.isArray(inventory)) {
    for (const item of inventory) {
      const match = /^mi_(\d+)$/.exec(item && item.instanceId);
      if (!match) continue;
      const sequence = BigInt(match[1]);
      if (sequence > rebased) rebased = sequence;
    }
  }
  _moduleSeq = rebased + 1n;
  return `mi_${_moduleSeq}`;
}

function emitChanged(state, cargo) {
  const bus = busForState(state);
  if (bus) bus.emit('cargo:changed', { cargo, usedU: cargo.usedVolume, massT: cargo.usedMass });
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
    emitChanged(state, cargo);
  }
  const bus = busForState(state);
  if (accepted < requested && bus) bus.emit('cargo:full', { commodityId });
  return accepted;
}

// ---- Salvage bay (hull-burst overhaul slice D, design doc section 7.5; flag combat.salvageBay) ----------------------
// The player's own KILL loot lands in a separate store instead of the trade hold: the hold keeps its trade and
// mining role, and the pilot never weighs loot against pack space. The bay auto-fills, is written only here, and
// its contents are cashed in when the player docks (the scrap rate) through the economy owner. When the bay is full a
// pickup is refused as usual and mining converts the remainder to credits (arcade overflow).
// state.player.salvageBay = { items:{[cmdtyId]:qty}, usedVolume }, created lazily (absent until the first pickup, so a
// player who never fights, and the frozen 47-A profile, carry no new field).
export const SALVAGE_BAY = Object.freeze({
  capMult: 5,       // bay volume = this x the ordinary hold...
  capFloor: 600,    // ...but never less than this, so a small hull still has a usable bay
  saleRate: 0.6,    // share of a commodity's reference price the dock pays (the doc's 60% scrap placeholder)
});
const BASE_PRICE = Object.create(null);
for (const c of COMMODITIES) BASE_PRICE[c.id] = Number.isFinite(c.basePrice) ? c.basePrice : 0;

export function salvageBayCap(state) {
  const hold = Number(state && state.player && state.player.cargo && state.player.cargo.capVolume) || 0;
  return Math.max(SALVAGE_BAY.capFloor, hold * SALVAGE_BAY.capMult);
}

/** What the UI shows: { used, cap, units } or null when the bay has never held anything. Pure. */
export function salvageBayReading(state) {
  const bay = state && state.player && state.player.salvageBay;
  if (!bay) return null;
  let units = 0;
  for (const id in bay.items) units += Number(bay.items[id]) || 0;
  return { used: Math.round(Number(bay.usedVolume) || 0), cap: Math.round(salvageBayCap(state)), units };
}

function ensureBay(state) {
  const player = state.player;
  if (!player.salvageBay || typeof player.salvageBay !== 'object') player.salvageBay = { items: {}, usedVolume: 0 };
  if (!player.salvageBay.items) player.salvageBay.items = {};
  return player.salvageBay;
}

/** Add kill loot to the salvage bay. Clamps to the bay's remaining volume. Returns the amount accepted. */
export function addSalvage(state, commodityId, qty) {
  const def = defOf(state, commodityId);
  const requested = finiteWholePickupAmount(qty);
  if (!def || requested <= 0) return 0;
  const volPerU = volumePerUnit(def);
  const bay = ensureBay(state);
  const free = salvageBayCap(state) - (Number(bay.usedVolume) || 0);
  const accepted = volPerU === 0 ? requested : Math.max(0, Math.min(requested, Math.floor(free / volPerU)));
  if (accepted > 0) {
    bay.items[commodityId] = (bay.items[commodityId] || 0) + accepted;
    bay.usedVolume = (Number(bay.usedVolume) || 0) + accepted * volPerU;
    const bus = busForState(state);
    if (bus) bus.emit('salvage:changed', { used: Math.round(bay.usedVolume), cap: Math.round(salvageBayCap(state)) });
  }
  return accepted;
}

/** Empty the bay and say what it was worth at the scrap rate. Returns { units, credits, lots } or null when empty. */
export function cashInSalvage(state) {
  const bay = state && state.player && state.player.salvageBay;
  if (!bay || !bay.items) return null;
  let units = 0;
  let credits = 0;
  const lots = [];
  for (const id of Object.keys(bay.items).sort()) {
    const qty = Math.floor(Number(bay.items[id]) || 0);
    if (qty <= 0) continue;
    const value = Math.floor(qty * (BASE_PRICE[id] || 0) * SALVAGE_BAY.saleRate);
    units += qty;
    credits += value;
    lots.push({ commodityId: id, qty, credits: value });
  }
  bay.items = {};
  bay.usedVolume = 0;
  if (units <= 0) return null;
  return { units, credits, lots };
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
  emitChanged(state, cargo);
  return removed;
}

export const cargo = {
  name: 'cargo',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
    const binding = attachBinding(this.state, this.bus, this);
    this._binding = binding;
    this._unsubs = binding.unsubs;
    this._dirty = false;
    this._massDirty = false;
    this._lastHotDockSpillTick = -1;
    this._pendingSpillAnnounce = null;

    const state = this.state;
    // Collapse any number of synchronous cargo mutations into one settled mass receipt during
    // cargo's registered simulation update. Consumers can refresh physics once per tick without
    // delaying or weakening the authoritative cargo:changed UI/data signal.
    subscribe(binding, 'cargo:changed', () => {
      binding.massDirty = true;
      if (this._binding === binding) this._massDirty = true;
    });

    // Story items (E1 depth program, PERSISTENT_CARGO): the emitter records the lock in
    // state.story.persistentCargo; this seam is the grant itself, so the hold actually carries
    // the black box / letter the narrative says the player took. Persistent items are vol 0,
    // so the grant can never be refused by a full hold.
    subscribe(binding, 'cargo:persistentAdded', (payload) => {
      if (!payload || typeof payload.id !== 'string' || !payload.id) return;
      const cargo = state.player && state.player.cargo;
      if (!cargo || (cargo.items && cargo.items[payload.id] > 0)) return;
      addCargo(state, payload.id, 1);
    });
    // Saves made while the grant seam was dead carry the story lock but an empty hold: backfill
    // the missing persistent items on load so the manifest matches the narrative again.
    subscribe(binding, 'save:loaded', () => {
      const locked = state.story && state.story.persistentCargo;
      if (!Array.isArray(locked)) return;
      for (const id of locked) {
        if (typeof id !== 'string' || !PERSISTENT_FOOTPRINT.has(id)) continue;
        if (!(state.player && state.player.cargo && state.player.cargo.items
          && state.player.cargo.items[id] > 0)) addCargo(state, id, 1);
      }
    });

    // Ejected ore / dropped cargo / loose modules collected by the player ship → hold or inventory.
    subscribe(binding, 'pickup:collected', (payload) => {
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
        // Kill loot (the player's own kill burst; never a run wallet's) goes to the salvage bay, not the trade hold.
        const combatLoot = combatFlag('salvageBay') && pickup && pickup.data
          && pickup.data.combatLoot === true && pickup.data.wallet !== 'run';
        const accepted = combatLoot ? addSalvage(state, commodityId, qty) : addCargo(state, commodityId, qty, source);
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
      } else if (kind === 'module') {
        // physics only hands us a commodityId → treat it as the module defId; mint a deterministic instanceId.
        const count = typeof commodityId === 'string' && commodityId.length > 0 ? qty : 0;
        for (let i = 0; i < count; i++) {
          state.player.moduleInventory.push({ instanceId: nextLooseModuleInstanceId(state), defId: commodityId });
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

    subscribe(binding, 'dock:docked', (payload) => this._spillHotArrival(payload || {}));
    // Docking cashes the salvage bay in at the scrap rate (credits through the economy owner).
    subscribe(binding, 'dock:docked', () => this._cashInSalvage());
    // The spill itself lands under the dock clunk and the station hub, so the undock is the
    // legible moment: the player is back in flight right beside their spilled pods. Cargo owns
    // the spill receipt, so cargo announces it here — once per spill, no repeat on later undocks.
    subscribe(binding, 'dock:undocked', () => this._announceHotDockSpill());

    // Active-ship cargo capacity changes (fit swap / stats recompute) → adopt the new derived cap.
    const setCap = (shipId, cargoCap) => {
      if (shipId !== state.playerId) return;
      if (typeof cargoCap === 'number' && cargoCap >= 0) {
        if (state.player.cargo.capVolume === cargoCap) return;
        state.player.cargo.capVolume = cargoCap;
        binding.dirty = true;
        if (this._binding === binding) {
          this._dirty = true; // backstop recompute (a cap decrease leaves used > cap until volume drops)
        }
      }
    };
    subscribe(binding, 'ship:cargoCapChanged', ({ shipId, cargoCap }) => setCap(shipId, cargoCap));
    subscribe(binding, 'ship:statsChanged', ({ shipId, derived }) => {
      if (derived && typeof derived.cargoCap === 'number') setCap(shipId, derived.cargoCap);
    });

    // FB-061 — the hold is part of the hull. Ships announces a berth swap before it flips
    // activeShipIndex; cargo does the whole move here so state.player.cargo keeps one writer:
    // the live hold parks onto the outgoing record, the incoming hull's parked hold loads in,
    // and anything over the new capacity simply stays parked aboard that hull.
    subscribe(binding, 'ship:parkedHoldSwap', (payload) => this._swapParkedHold(payload || {}));
    // The cargo-deck verb: docked at a shipyard with a second hull parked, the deck crew moves
    // units between the live hold and that hull's hold. UI emits the intent only.
    subscribe(binding, 'ui:transferParkedCargo', (payload) => this._transferParkedCargo(payload || {}));

    this.recompute(); // seed caches from whatever the starting hold contains
  },

  update(dt, state) {
    if (state && state.input && state.input.actions && state.input.actions.jettisonLot) {
      state.input.actions.jettisonLot = false;
      const commodityId = selectedJettisonLot(state);
      if (commodityId) this.jettison(commodityId, 1);
    }
    const binding = stateBindings.get(state);
    const dirty = binding ? binding.dirty : this._dirty;
    const massDirty = binding ? binding.massDirty : this._massDirty;
    if (dirty) {
      this.recompute(state);
      if (binding) binding.dirty = false;
      this._dirty = false;
    }
    if (massDirty) {
      if (binding) binding.massDirty = false;
      this._massDirty = false;
      const c = state.player.cargo;
      const bus = binding && binding.bus ? binding.bus : this.bus;
      if (bus && typeof bus.emit === 'function') {
        bus.emit('cargo:massSettled', { cargo: c, usedU: c.usedVolume, massT: c.usedMass });
      }
    }
  },

  /** Authoritative full recompute of usedVolume/usedMass from items (drift backstop). */
  recompute(state = this.state) {
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
    const bay = state.player.salvageBay;
    if (bay && bay.items) {
      let bayVol = 0;
      for (const id in bay.items) {
        const def = defOf(state, id);
        if (def) bayVol += (Number(bay.items[id]) || 0) * volumePerUnit(def);
      }
      bay.usedVolume = bayVol;
    }
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
    emitChanged(state, cargo);
  },

  addCargo(commodityId, qty, lotSource = null) {
    return addCargo(this.state, commodityId, qty, lotSource);
  },

  removeCargo(commodityId, qty) {
    return removeCargo(this.state, commodityId, qty);
  },

  // ---- FB-061: parked holds ---------------------------------------------------------------
  // `ownedShip.cargo` is the hold aboard a hull that is not flying: { items, richLots,
  // usedVolume, usedMass }. Written only here; absent on old saves and created the first time a
  // hull actually parks with units aboard (an empty store deletes itself, records stay lean).

  _parkedStore(owned) {
    const store = owned.cargo && typeof owned.cargo === 'object'
      ? owned.cargo
      : (owned.cargo = { items: {}, richLots: [] });
    if (!store.items || typeof store.items !== 'object') store.items = {};
    if (!Array.isArray(store.richLots)) store.richLots = [];
    return store;
  },

  _syncParkedCaches(state, store) {
    let vol = 0;
    let mass = 0;
    for (const id of Object.keys(store.items)) {
      const def = defOf(state, id);
      if (!def) continue;
      const qty = Math.floor(Number(store.items[id]) || 0);
      if (qty <= 0) continue;
      vol += qty * volumePerUnit(def);
      mass += qty * def.mass;
    }
    store.usedVolume = vol;
    store.usedMass = mass;
    return store;
  },

  /**
   * Berth swap, run on `ship:parkedHoldSwap` before ships flips activeShipIndex: the live hold
   * merges onto the outgoing record (adding to any remainder already parked aboard that hull),
   * then the incoming hull's parked hold loads into the live hold under the new capacity.
   * Cargo the pilot cannot put down — sealed contract freight, story items — never parks; if it
   * alone would overflow the new hold the swap refuses before anything moves. What does not fit
   * stays aboard the parked hull. Nothing is created or lost: every unit is held somewhere.
   */
  _swapParkedHold(payload) {
    const state = this.state;
    const p = state && state.player;
    const live = p && p.cargo;
    if (!p || !Array.isArray(p.ownedShips) || !live || !live.items) return false;
    const from = p.ownedShips[payload && payload.fromIndex];
    const to = p.ownedShips[payload && payload.toIndex];
    if (!from || !to || from === to) return false;
    const cap = Math.max(0, Number(payload && payload.cargoCapVolume) || 0);

    // Feasibility first: reserved units ride with the pilot, so they have to fit the new hold.
    let mustCarryVol = 0;
    for (const id of Object.keys(live.items)) {
      const held = Math.floor(Number(live.items[id]) || 0);
      const keep = Math.min(held, reservedCargoQuantity(state, id));
      if (keep <= 0) continue;
      const def = defOf(state, id);
      if (def) mustCarryVol += keep * volumePerUnit(def);
    }
    if (mustCarryVol > cap) {
      if (payload) payload.refused = 'sealed_cargo_overflow';
      return false;
    }

    const store = this._parkedStore(from);
    for (const id of Object.keys(live.items)) {
      const held = Math.floor(Number(live.items[id]) || 0);
      const keep = Math.min(held, reservedCargoQuantity(state, id));
      const parkedQty = held - keep;
      if (parkedQty <= 0) continue;
      store.items[id] = (store.items[id] || 0) + parkedQty;
      if (keep > 0) live.items[id] = keep;
      else delete live.items[id];
      for (const lot of richLotSourcesForQty(live, id, parkedQty)) store.richLots.push({ ...lot });
      decrementRichLots(live, id, parkedQty);
    }

    // The live hold now carries only what must ride with the pilot; adopt the incoming cap so
    // the parked hold's load phase obeys it before ships re-derives the entity.
    live.capVolume = cap;
    this.recompute(state);

    const parked = to.cargo && to.cargo.items ? to.cargo : null;
    let movedUnits = 0;
    if (parked) {
      const ids = Object.keys(parked.items)
        .filter((id) => Math.floor(Number(parked.items[id]) || 0) > 0)
        .sort();
      for (const id of ids) {
        const qty = Math.floor(Number(parked.items[id]) || 0);
        if (qty <= 0 || !defOf(state, id)) continue;
        const accepted = addCargo(state, id, qty);
        if (accepted <= 0) continue;
        const left = qty - accepted;
        if (left > 0) parked.items[id] = left;
        else delete parked.items[id];
        for (const lot of richLotSourcesForQty(parked, id, accepted)) appendRichLot(live, lot, id, lot.richQty);
        decrementRichLots(parked, id, accepted);
        movedUnits += accepted;
      }
      this._syncParkedCaches(state, parked);
      if (!Object.keys(parked.items).length) delete to.cargo;
    }
    this._syncParkedCaches(state, store);
    if (!Object.keys(store.items).length) delete from.cargo;
    const bus = busForState(state);
    if (bus) bus.emit('cargo:parkedHoldSwapped', { fromIndex: payload.fromIndex, toIndex: payload.toIndex, loadedUnits: movedUnits });
    return true;
  },

  /**
   * The cargo-deck verb (`ui:transferParkedCargo`): docked at a shipyard with a second hull in
   * the berths, move units between the live hold and that parked hull's hold. `direction` is
   * 'load' (parked → live hold, under the live cap) or 'stow' (live → parked, under the parked
   * hull's own derived hold cap). Sealed/persistent units never leave the pilot's hold.
   */
  _transferParkedCargo({ shipIndex, direction, commodityId, qty }) {
    const state = this.state;
    const access = shipworksStationAccess(state);
    if (!access.hull) {
      const bus = busForState(state);
      if (bus) bus.emit('toast', { text: access.hullReason || 'Dock at a shipyard', kind: 'error', ttl: 3 });
      return false;
    }
    const p = state.player;
    if (!p || !Array.isArray(p.ownedShips) || p.ownedShips.length < 2) return false;
    const index = Number(shipIndex);
    const live = p.cargo;
    if (!Number.isInteger(index) || index === p.activeShipIndex || !live || !live.items) return false;
    const owned = p.ownedShips[index];
    if (!owned) return false;
    const dir = direction === 'stow' ? 'stow' : 'load';
    const source = dir === 'load' ? (owned.cargo && owned.cargo.items ? owned.cargo : null) : live;
    if (!source) return false;
    const target = dir === 'load' ? live : this._parkedStore(owned);
    const capVolume = dir === 'load'
      ? Math.max(0, Number(live.capVolume) || 0)
      : Math.max(0, Number(getDerivedStats(owned.defId, owned.fittings || [], p).cargoCap) || 0);
    const ids = (commodityId ? [commodityId] : Object.keys(source.items))
      .filter((id) => Math.floor(Number(source.items[id]) || 0) > 0)
      .sort();
    let moved = 0;
    for (const id of ids) {
      const def = defOf(state, id);
      if (!def) continue;
      let want = Math.floor(Number(source.items[id]) || 0);
      if (dir === 'stow') want = Math.min(want, sellableCargoQuantity(state, id));
      if (qty != null) want = Math.min(want, Math.max(0, Math.floor(Number(qty) || 0)));
      if (want <= 0) continue;
      const volPerU = volumePerUnit(def);
      const free = capVolume - (Number(target.usedVolume) || 0);
      const accepted = volPerU === 0 ? want : Math.max(0, Math.min(want, Math.floor(free / volPerU)));
      if (accepted <= 0) continue;
      target.items[id] = (target.items[id] || 0) + accepted;
      target.usedVolume = (Number(target.usedVolume) || 0) + accepted * volPerU;
      target.usedMass = (Number(target.usedMass) || 0) + accepted * def.mass;
      const left = Math.floor(Number(source.items[id]) || 0) - accepted;
      if (left > 0) source.items[id] = left;
      else delete source.items[id];
      for (const lot of richLotSourcesForQty(source, id, accepted)) appendRichLot(target, lot, id, lot.richQty);
      decrementRichLots(source, id, accepted);
      moved += accepted;
    }
    this._syncParkedCaches(state, dir === 'load' ? source : target);
    if (owned.cargo && owned.cargo.items && !Object.keys(owned.cargo.items).length) delete owned.cargo;
    this.recompute(state);
    const bus = busForState(state);
    if (bus) {
      bus.emit('cargo:parkedTransfer', { shipIndex: index, direction: dir, movedUnits: moved });
      bus.emit('toast', {
        text: moved > 0
          ? `Deck crew moved ${moved} unit${moved === 1 ? '' : 's'} ${dir === 'load' ? 'aboard' : 'onto the parked hull'}.`
          : 'Nothing the deck crew could move.',
        kind: moved > 0 ? 'success' : 'info',
        ttl: 3,
      });
    }
    return moved > 0;
  },

  _spillHotArrival(payload = {}) {
    const state = this.state;
    const player = state && state.entities && state.entities.get && state.entities.get(state.playerId);
    if (!state || !player || !player.pos || !player.vel) return null;
    const tick = state.tick | 0;
    if (this._lastHotDockSpillTick === tick) return null;
    const cruiseSpeed = resolveGovernedCombatSpeed(player, state, 0);
    if (!(cruiseSpeed > 0)) {
      clearDockSpill(state);
      return null;
    }
    const threshold = cruiseSpeed * HOT_DOCK_CRUISE_FRACTION;
    const entrySpeed = Math.hypot(Number(player.vel.x) || 0, Number(player.vel.z) || 0);
    if (!(entrySpeed > threshold)) {
      clearDockSpill(state);
      return null;
    }
    const desiredPods = entrySpeed >= threshold * 1.25 ? HOT_DOCK_MAX_PODS : 1;
    const items = state.player && state.player.cargo && state.player.cargo.items || {};
    const commodityIds = Object.keys(items).filter((id) => Number(items[id]) > 0 && !isUnsellableCargo(state, id)).sort();
    const spilled = Object.create(null);
    let pods = 0;
    for (const commodityId of commodityIds) {
      while (pods < desiredPods && Number(items[commodityId]) > 0) {
        const amount = this.jettison(commodityId, 1, { bay: true, slot: pods });
        if (!(amount > 0)) break;
        spilled[commodityId] = (spilled[commodityId] || 0) + amount;
        pods += 1;
      }
      if (pods >= desiredPods) break;
    }
    if (pods === 0) {
      clearDockSpill(state);
      return null;
    }
    this._lastHotDockSpillTick = tick;
    const commodityId = commodityIds.find((id) => (spilled[id] || 0) > 0) || null;
    writeDockSpill(state, commodityId, commodityId ? spilled[commodityId] : 0);
    const receipt = {
      stationId: payload.stationId || null,
      entrySpeed,
      cruiseSpeed,
      threshold,
      fraction: HOT_DOCK_CRUISE_FRACTION,
      pods,
      spilled,
      tick,
    };
    this._pendingSpillAnnounce = receipt;
    if (this.bus && typeof this.bus.emit === 'function') this.bus.emit('cargo:hotDockSpill', receipt);
    // PIC-28: the spill is seen at the berth, not only counted. One presentation cue anchored
    // to the dock position carries the lot count; the world-cue whitelist resolves it into the
    // berth-apron mark. Odds, pods and physics above are untouched; no pickups are spawned here.
    if (this.bus && typeof this.bus.emit === 'function' && player.pos) {
      this.bus.emit('presentation:cue', {
        id: 'cargo.spill.berth',
        sourceEvent: 'cargo:hotDockSpill',
        sourceId: state.playerId,
        position: { x: Number(player.pos.x) || 0, z: Number(player.pos.z) || 0 },
        spilled,
        count: pods,
      });
    }
    return receipt;
  },

  /**
   * One-shot undock receipt for a hot-dock spill: the cause ("came in hot"), the loss (named
   * pods), and the remedy in place (they are floating right beside the ship, scoopable). The
   * announcement rides the toast + alert voices; the spilled pods themselves are persistent
   * payload entities, so the beat resolves in the world whether or not the player reacts.
   */
  _cashInSalvage() {
    if (!combatFlag('salvageBay')) return;
    const sale = cashInSalvage(this.state);
    if (!sale || !this.bus || typeof this.bus.emit !== 'function') return;
    if (sale.credits > 0) {
      this.bus.emit('economy:grantCredits', {
        amount: sale.credits,
        reason: 'salvage:bay_sale',
        receiptId: `salvage_bay:${this.state.tick | 0}`,
      });
    }
    this.bus.emit('salvage:bayCashedIn', { units: sale.units, credits: sale.credits, lots: sale.lots });
    this.bus.emit('salvage:changed', { used: 0, cap: Math.round(salvageBayCap(this.state)) });
    this.bus.emit('toast', {
      text: `Salvage bay cashed in: ${sale.units} units for ${sale.credits} cr.`,
      kind: 'good',
      ttl: 6,
    });
    this.bus.emit('audio:cue', { id: 'sfx_loot_collect' });
  },

  _announceHotDockSpill() {
    const receipt = this._pendingSpillAnnounce;
    this._pendingSpillAnnounce = null;
    if (!receipt || !this.bus || typeof this.bus.emit !== 'function') return;
    const spilled = receipt.spilled && typeof receipt.spilled === 'object' ? receipt.spilled : {};
    const names = Object.keys(spilled)
      .filter((id) => Number(spilled[id]) > 0)
      .sort()
      .map((id) => commodityName(id))
      .filter(Boolean);
    if (!names.length) return;
    const pods = Math.max(1, Math.floor(Number(receipt.pods) || names.length));
    const list = names.length > 1
      ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
      : names[0];
    this.bus.emit('toast', {
      text: `Came in hot — the hold cracked open. ${pods} ${list} pod${pods === 1 ? '' : 's'} floating by the dock.`,
      kind: 'warn',
      ttl: 6,
    });
    this.bus.emit('audio:cue', { id: 'alert' });
  },

  destroy() {
    const owned = ownerBindings.get(this);
    if (owned) {
      for (const binding of [...owned]) detachBinding(binding);
    }
    this._binding = null;
    this._unsubs = [];
    this.state = null;
    this.bus = null;
    this.helpers = null;
    this._dirty = false;
    this._massDirty = false;
    this._lastHotDockSpillTick = -1;
    this._pendingSpillAnnounce = null;
  },

  /** Dump up to `qty` units of `commodityId` as a colliding persistent cargo pod. Returns amount dumped. */
  jettison(commodityId, qty, options = null) {
    const free = sellableCargoQuantity(this.state, commodityId);
    if (qty == null) qty = free;
    qty = Math.max(0, Math.floor(Number(qty) || 0));
    // A sealed manifest refuses a dump that would reach into it outright — the request named a
    // count the contract forbids. "Dump everything" (no qty) means only the free units.
    if (reservedCargoQuantity(this.state, commodityId) > 0 && qty > free) return 0;
    qty = Math.min(qty, free);
    if (qty <= 0) return 0;
    const state = this.state;
    const richSources = richLotSourcesForQty(state.player.cargo, commodityId, qty);
    const dumped = removeCargo(state, commodityId, qty);
    if (dumped <= 0) return 0;
    const player = state.entities.get(state.playerId);
    if (player && this.helpers && this.helpers.spawnEntity) {
      const px = player.pos.x, pz = player.pos.z;
      const rot = Number.isFinite(player.rot) ? player.rot : 0;
      const fx = Math.cos(rot), fz = Math.sin(rot);
      const r = Math.max(0, Number(player.radius) || 0) + JETTISON_POD_RADIUS + JETTISON_CLEARANCE;
      const vx = Number.isFinite(player.vel && player.vel.x) ? player.vel.x : 0;
      const vz = Number.isFinite(player.vel && player.vel.z) ? player.vel.z : 0;
      const def = defOf(state, commodityId);
      const unitMass = def && Number.isFinite(def.mass) ? def.mass : 0.5;
      const bay = !!(options && options.bay);
      // A deliberate dump leaves aft at eject speed. A hot dock leaves the pods beside the hull,
      // almost stopped, so they sit in the bay instead of riding the approach back out the lane.
      const eject = bay ? 0 : JETTISON_EJECT_SPEED * volatileThrowSpeedScale(commodityId);
      const spawnJettisonPod = (amount, richSource = null) => {
        if (!(amount > 0)) return;
        const slot = bay ? Math.max(0, Math.floor(Number(options && options.slot) || 0)) : 0;
        const along = bay ? (slot - 0.5) * (JETTISON_POD_RADIUS * 2.4) : 0;
        const pos = bay
          ? { x: px - fz * r + fx * along, z: pz + fx * r + fz * along }
          : { x: px - fx * r, z: pz - fz * r };
        const vel = bay
          ? { x: vx * 0.04, z: vz * 0.04 }
          : { x: vx - fx * eject, z: vz - fz * eject };
        // Industrial-beam payload body: mass, collides, tetherable, flags.persistent. Not a TTL pickup.
        spawnJettisonedCargoPod(state, {
          pos,
          vel,
          radius: JETTISON_POD_RADIUS,
          commodityId,
          amount,
          unitMass,
          richSource,
          pickupEmbargoUntil: state.simTime + JETTISON_PICKUP_EMBARGO_S,
          factionId: player.factionId || 'player',
          ownerId: player.id,
        }, this.helpers);
      };
      let allocated = 0;
      for (const richSource of richSources) {
        const amount = Math.min(dumped - allocated, richSource.richQty);
        spawnJettisonPod(amount, richSource);
        allocated += amount;
      }
      spawnJettisonPod(Math.max(0, dumped - allocated));
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
