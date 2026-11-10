// custodyProjection.js — SF-243 sim half ("cargo custody visible at a transfer decision").
//
// One pure, read-only projection of WHERE a load physically is and WHO holds it, so a trade or
// mission screen can distinguish the three custody locations before the player chooses sell,
// hand off or recover:
//   • hold       — the player hold (state.player.cargo, cargo-owned);
//   • operation  — an operation shipment (group.shipment, cargoCustody-owned: asteroid-site
//                  berths, automation drones) — NEVER sellable as personal cargo;
//   • pod        — a physical jettisoned/spilled pod in the world — recoverable, not sellable.
//
// Combining identical commodity names launders ownership; adding another inventory creates
// competing truth. This module is a PROJECTION: it reads the canonical custody state at the
// query moment and never writes it. cargoCustody is consumed through its pure readers only —
// and even those are guarded, because `shipmentUsed`/`shipmentQty` call `ensureShipment`, which
// would mint an empty shipment on a group that has none. A read must not create state.
//
// PURE and VIEW-ONLY (ARCHITECTURE §5): no mutation, no events, no Three.js, no Math.random.
// Single-writer law: economy owns credits, cargo owns the hold, cargoCustody owns operation
// shipments, the world owns pods. This file owns none of them.

import { sellableCargoQuantity } from '../../systems/cargo.js';

// ── read-only entity iteration ─────────────────────────────────────────────────────────────────
// state.entities may be a Map, an object-map, or absent (state.entityList array). The projection
// never relies on a live index; a plain iteration is the honest read at the query moment.
function forEachEntity(state, fn) {
  const entities = state && state.entities;
  if (entities && typeof entities.forEach === 'function') {
    entities.forEach(fn);
    return;
  }
  if (entities && typeof entities === 'object') {
    for (const key of Object.keys(entities)) fn(entities[key], key);
    return;
  }
  if (Array.isArray(state && state.entityList)) {
    for (const entity of state.entityList) fn(entity);
  }
}

function pointCopy(value) {
  if (!value || !Number.isFinite(Number(value.x)) || !Number.isFinite(Number(value.z))) return null;
  return { x: Number(value.x), z: Number(value.z) };
}

// ── hold ───────────────────────────────────────────────────────────────────────────────────────
// One lot per held commodity. `qty` is the full held stack; `sellableQty` is what cargo's own
// seal reader leaves the player (preloaded contract freight stays aboard). A sealed stack is
// UNAVAILABLE custody, not zero stock — the distinction the transfer decision needs.
function holdLots(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  const lots = [];
  if (!items || typeof items !== 'object') return lots;
  for (const commodityId of Object.keys(items).sort()) {
    const qty = Math.max(0, Math.floor(Number(items[commodityId]) || 0));
    if (!(qty > 0)) continue;
    const sellableQty = Math.min(qty, Math.max(0, Math.floor(Number(sellableCargoQuantity(state, commodityId)) || 0)));
    lots.push({
      key: `hold:${commodityId}`,
      custody: 'hold',
      commodityId,
      qty,
      sellableQty,
      sellable: sellableQty > 0,
      recoverable: false,
      holder: { kind: 'player', id: state.playerId != null ? String(state.playerId) : 'player', label: 'Your hold' },
      pos: null,
      note: sellableQty >= qty ? null : 'sealed freight — sale/dump reserved by its contract',
    });
  }
  return lots;
}

// ── operation shipments ────────────────────────────────────────────────────────────────────────
// Any canonical cargoCustody "group": objects that carry `group.shipment` (asteroid sites under
// state.sites.byId, automation drones under state.automation.drones). Enumeration stays defensive
// — a group without a shipment contributes nothing and must not gain one.
function shipmentGroups(state) {
  const groups = [];
  const drones = state && state.automation && state.automation.drones;
  if (Array.isArray(drones)) {
    for (const group of drones) if (group && typeof group === 'object') groups.push(group);
  }
  const byId = state && state.sites && state.sites.byId;
  if (byId && typeof byId === 'object') {
    for (const siteId of Object.keys(byId)) {
      const site = byId[siteId];
      if (site && typeof site === 'object') groups.push(site);
    }
  }
  return groups;
}

function operationLots(state) {
  const lots = [];
  for (const group of shipmentGroups(state)) {
    const shipment = group.shipment;
    if (!shipment || typeof shipment !== 'object') continue;
    const items = shipment.items;
    if (!items || typeof items !== 'object' || Array.isArray(items)) continue;
    const holderId = String(shipment.owner || group.id || 'operation');
    const holderLabel = String(group.name || group.defId || group.id || holderId);
    const destination = shipment.destination != null ? String(shipment.destination) : null;
    const deliveryState = shipment.deliveryState != null ? String(shipment.deliveryState) : null;
    for (const commodityId of Object.keys(items).sort()) {
      const qty = Math.max(0, Math.floor(Number(items[commodityId]) || 0));
      if (!(qty > 0)) continue;
      lots.push({
        key: `operation:${holderId}:${commodityId}`,
        custody: 'operation',
        commodityId,
        qty,
        sellableQty: 0,
        sellable: false,
        recoverable: false,
        holder: { kind: 'operation', id: holderId, label: holderLabel },
        pos: null,
        destination,
        deliveryState,
        note: 'operation shipment — belongs to its crew, not to your hold',
      });
    }
  }
  return lots;
}

// ── physical pods ──────────────────────────────────────────────────────────────────────────────
// Jettisoned/spilled hold pods: payload bodies stamped by lootShards.spawnJettisonedCargoPod
// (data.jettisonedCargo + commodityId + amount). Position is the pod's live XZ — the projection
// copies it, so a later sim move can never mutate through the projected row.
function podLots(state) {
  const lots = [];
  forEachEntity(state, (entity) => {
    if (!entity || entity.alive === false || entity.type !== 'payload') return;
    const data = entity.data;
    if (!data || data.jettisonedCargo !== true) return;
    const qty = Math.max(0, Math.floor(Number(data.amount) || 0));
    const commodityId = data.commodityId;
    if (!(qty > 0) || typeof commodityId !== 'string' || !commodityId) return;
    const pos = pointCopy(entity.pos);
    const holderId = data.ownerId != null ? String(data.ownerId) : null;
    lots.push({
      key: `pod:${entity.id}:${commodityId}`,
      custody: 'pod',
      commodityId,
      qty,
      sellableQty: 0,
      sellable: false,
      recoverable: true,
      holder: { kind: 'pod', id: holderId, label: 'Loose pod' },
      pos,
      note: pos ? 'physical pod — recover it before it can be sold or handed off' : 'physical pod (position unknown)',
    });
  });
  lots.sort((a, b) => a.key.localeCompare(b.key));
  return lots;
}

// ── projection ─────────────────────────────────────────────────────────────────────────────────
/**
 * projectCargoCustody(state) -> { lots, byCommodity }
 *
 * `lots` is one row per custody lot at the query moment. `byCommodity[commodityId]` folds them to
 * per-custody totals: { hold, holdSellable, operation, pod, total }. Frozen deep enough that a
 * screen can hold a row without the sim rewriting it underneath; positions and holder objects are
 * copies. Never throws on malformed state — missing custody reads as nothing held, never as zero
 * stock elsewhere.
 */
export function projectCargoCustody(state) {
  const lots = [...holdLots(state), ...operationLots(state), ...podLots(state)];
  const byCommodity = {};
  for (const lot of lots) {
    const fold = byCommodity[lot.commodityId]
      || (byCommodity[lot.commodityId] = { hold: 0, holdSellable: 0, operation: 0, pod: 0, total: 0 });
    fold[lot.custody] += lot.qty;
    if (lot.custody === 'hold') fold.holdSellable += lot.sellableQty;
    fold.total += lot.qty;
  }
  return { lots: Object.freeze(lots.map(Object.freeze)), byCommodity: Object.freeze(byCommodity) };
}

/**
 * custodyTotals(state, commodityId) -> { hold, holdSellable, operation, pod, total }
 * The transfer-decision read: how much of one good sits in each custody location right now.
 * Returns all zeros when nothing is held anywhere — unavailable custody and zero stock are the
 * same empty answer per location, and the lots list is what tells them apart.
 */
export function custodyTotals(state, commodityId) {
  const totals = { hold: 0, holdSellable: 0, operation: 0, pod: 0, total: 0 };
  if (typeof commodityId !== 'string' || !commodityId) return totals;
  const fold = projectCargoCustody(state).byCommodity[commodityId];
  return fold || totals;
}

/**
 * Whether `qty` of `commodityId` could be sold as PERSONAL cargo right now. Operation and pod
 * custody are structurally excluded: this answers from the hold's own seal reader only, so an
 * operation load can never be sold as personal cargo through a screen that asks here.
 */
export function personalSellableQty(state, commodityId) {
  if (typeof commodityId !== 'string' || !commodityId) return 0;
  return Math.max(0, Math.floor(Number(sellableCargoQuantity(state, commodityId)) || 0));
}
