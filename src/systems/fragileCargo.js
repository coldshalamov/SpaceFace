// fragileCargo.js - BP-02 FRAGILE-ORE backend.
//
// Event-driven cargo consequence for hard player impacts. Cargo mutation still
// goes through cargo.removeCargo; this system only decides which fragile stacks
// crack and records the receipt/readout for UI consumers.
import { hash32 } from '../core/rng.js';
import { ORES } from '../data/mining.js';
import { COMMODITIES } from '../data/commodities.js';
import { removeCargo } from './cargo.js';

export const FRAGILE_CARGO_HARD_DELTA_V = 18;
export const FRAGILE_CARGO_MAX_LOSS_FRACTION = 0.22;
export const FRAGILE_CARGO_COOLDOWN_S = 0.75;
export const FRAGILE_CARGO_RECEIPT_CAP = 12;
export const FRAGILE_CARGO_TAGS = Object.freeze(['crystal', 'rare', 'exotic']);
// Cracked cargo does not delete — half of it spills as physical pods the player can
// re-scoop. The spill inherits ship momentum plus a seeded scatter kick, and fragile
// pods sublimate fast (short TTL): the impact becomes a scramble, not a tax.
export const FRAGILE_CARGO_SPILL_FRAC = 0.5;
export const FRAGILE_CARGO_SPILL_TTL_S = 45;
export const FRAGILE_CARGO_SPILL_MAX_PODS = 4;
export const FRAGILE_CARGO_TRADE_GOODS = Object.freeze([
  'cmdty_medical',
  'cmdty_art',
  'cmdty_microchips',
  'cmdty_quantum_cores',
  'cmdty_luxury_goods',
  'cmdty_electronics',
]);

const STATE_VERSION = 1;
const FRAGILE_TAG_SET = new Set(FRAGILE_CARGO_TAGS);
const FRAGILE_TRADE_SET = new Set(FRAGILE_CARGO_TRADE_GOODS);
const ORE_BY_ID = new Map(ORES.map((ore) => [ore.id, ore]));
const COMMODITY_BY_ID = new Map(COMMODITIES.map((c) => [c.id, c]));
const FRAGILE_GLYPH = Object.freeze({
  token: 'fragile',
  label: 'Fragile',
  tone: 'warn',
  hint: 'Fragile - fly gently',
});

function freshState() {
  return { schemaVersion: STATE_VERSION, receipts: [], lastLossT: -Infinity, readout: [] };
}

function finiteOrZero(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function clamp(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

function round4(value) {
  return Math.round((Number(value) || 0) * 1e4) / 1e4;
}

function commodityName(commodityId) {
  const commodity = COMMODITY_BY_ID.get(commodityId);
  const ore = ORE_BY_ID.get(commodityId);
  return (commodity && commodity.name) || (ore && ore.name) || commodityId;
}

function commodityValue(commodityId) {
  const commodity = COMMODITY_BY_ID.get(commodityId);
  const ore = ORE_BY_ID.get(commodityId);
  return Math.max(0, finiteOrZero((commodity && commodity.basePrice) ?? (ore && ore.baseValue)));
}

function sortIds(ids) {
  return ids.slice().sort((a, b) => String(a).localeCompare(String(b)));
}

export function ensureFragileCargoState(state) {
  if (!state) return null;
  if (!state.fragileCargo || typeof state.fragileCargo !== 'object') {
    state.fragileCargo = freshState();
  }
  const own = state.fragileCargo;
  own.schemaVersion = STATE_VERSION;
  if (!Array.isArray(own.receipts)) own.receipts = [];
  if (!Array.isArray(own.readout)) own.readout = [];
  if (!Number.isFinite(own.lastLossT)) own.lastLossT = -Infinity;
  return own;
}

export function isFragileCommodity(commodityId) {
  if (FRAGILE_TRADE_SET.has(commodityId)) return true;
  const ore = ORE_BY_ID.get(commodityId);
  if (!ore || !Array.isArray(ore.tags)) return false;
  return ore.tags.some((tag) => FRAGILE_TAG_SET.has(tag));
}

export function fragileCargoGlyphFor(commodityId) {
  return isFragileCommodity(commodityId) ? { ...FRAGILE_GLYPH } : null;
}

export function fragileCargoReadout(state) {
  const items = state && state.player && state.player.cargo && state.player.cargo.items;
  if (!items) return [];
  const stacks = [];
  for (const commodityId of sortIds(Object.keys(items))) {
    const qty = Math.max(0, Math.floor(items[commodityId] || 0));
    const glyph = qty > 0 ? fragileCargoGlyphFor(commodityId) : null;
    if (!glyph) continue;
    stacks.push({
      commodityId,
      name: commodityName(commodityId),
      qty,
      glyph,
    });
  }
  return stacks;
}

export function fragileImpactLossFraction(payload = {}) {
  const deltaV = Math.max(0, finiteOrZero(payload.playerDeltaV));
  if (deltaV < FRAGILE_CARGO_HARD_DELTA_V) return 0;
  const over = (deltaV - FRAGILE_CARGO_HARD_DELTA_V) / FRAGILE_CARGO_HARD_DELTA_V;
  return round4(clamp(0.05 + over * 0.08, 0.05, FRAGILE_CARGO_MAX_LOSS_FRACTION));
}

export function planFragileCargoLoss(state, payload = {}) {
  const fraction = fragileImpactLossFraction(payload);
  const cargo = state && state.player && state.player.cargo;
  const items = cargo && cargo.items;
  const losses = [];
  if (!(fraction > 0) || !items) return { fraction, losses };
  for (const commodityId of sortIds(Object.keys(items))) {
    if (!isFragileCommodity(commodityId)) continue;
    const qty = Math.max(0, Math.floor(items[commodityId] || 0));
    if (qty <= 0) continue;
    const plannedQty = Math.max(1, Math.floor(qty * fraction));
    losses.push({
      commodityId,
      name: commodityName(commodityId),
      qty: plannedQty,
      valueCr: Math.round(plannedQty * commodityValue(commodityId)),
      glyph: fragileCargoGlyphFor(commodityId),
    });
  }
  return { fraction, losses };
}

export function applyFragileCargoImpact(state, payload = {}, options = {}) {
  if (!payload || payload.playerInvolved !== true) return null;
  const own = ensureFragileCargoState(state);
  if (!own) return null;
  const simTime = round4(payload.simTime != null ? payload.simTime : state && state.simTime);
  if (options.cooldown !== false && simTime - own.lastLossT < FRAGILE_CARGO_COOLDOWN_S) return null;
  const plan = planFragileCargoLoss(state, payload);
  if (!plan.losses.length) {
    own.readout = fragileCargoReadout(state);
    return null;
  }

  const items = [];
  for (const loss of plan.losses) {
    const removed = removeCargo(state, loss.commodityId, loss.qty);
    if (removed <= 0) continue;
    items.push({ ...loss, qty: removed, valueCr: Math.round(removed * commodityValue(loss.commodityId)) });
  }
  if (!items.length) {
    own.readout = fragileCargoReadout(state);
    return null;
  }

  const tick = Math.max(0, Math.floor(finiteOrZero(payload.tick != null ? payload.tick : state && state.tick)));
  const spilled = spillCrackedCargo(state, options, payload, items, simTime, tick);
  for (const item of items) {
    if (!Number.isInteger(item.spilled)) { item.spilled = 0; item.shattered = item.qty; }
  }
  const receipt = {
    event: 'fragile_cargo_impact',
    t: simTime,
    tick,
    aId: payload.aId == null ? null : payload.aId,
    bId: payload.bId == null ? null : payload.bId,
    dp: round4(payload.dp),
    playerDeltaV: round4(payload.playerDeltaV),
    fraction: plan.fraction,
    items,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
    totalValueCr: items.reduce((sum, item) => sum + item.valueCr, 0),
    totalSpilledQty: spilled.units,
    totalShatteredQty: items.reduce((sum, item) => sum + item.qty, 0) - spilled.units,
    spillPods: spilled.pods,
    spillPodIds: spilled.podIds,
    glyph: { ...FRAGILE_GLYPH },
  };
  own.lastLossT = simTime;
  own.receipts.push(receipt);
  if (own.receipts.length > FRAGILE_CARGO_RECEIPT_CAP) {
    own.receipts.splice(0, own.receipts.length - FRAGILE_CARGO_RECEIPT_CAP);
  }
  own.readout = fragileCargoReadout(state);

  const bus = options.bus;
  if (bus && typeof bus.emit === 'function') bus.emit('cargo:fragileLost', receipt);
  emitLossNotice(options.helpers, bus, receipt);
  return receipt;
}

function emitLossNotice(helpers, bus, receipt) {
  const first = receipt.items[0];
  const label = receipt.items.length === 1 ? first.name : `${receipt.totalQty} fragile units`;
  const spilled = receipt.totalSpilledQty || 0;
  const text = spilled > 0
    ? `Fragile cargo cracked: ${label} -${receipt.totalQty}u (${spilled}u spilled — scoop it back, fast!)`
    : `Fragile cargo cracked on impact: ${label} -${receipt.totalQty}u`;
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    const said = voice.say({ channel: 'alert', text, kind: 'fragileCargo', ttl: 3 });
    if (said) return;
  }
  if (bus && typeof bus.emit === 'function') bus.emit('toast', { text, kind: 'warn', ttl: 3 });
}

// Half of every cracked stack spills as one physical pod per commodity (capped): the
// pods inherit ship momentum plus a seeded scatter kick so chasing the spill is a
// maneuver, and they sublimate on a short TTL so it is also a race. Degrades to an
// all-shatter receipt when no spawner or player hull is available (focused harnesses).
function spillCrackedCargo(state, options, payload, items, simTime, tick) {
  const out = { units: 0, pods: 0, podIds: [] };
  const spawnEntity = options && options.helpers && options.helpers.spawnEntity;
  if (typeof spawnEntity !== 'function') return out;
  const player = state && state.entities && typeof state.entities.get === 'function'
    ? state.entities.get(state.playerId)
    : null;
  if (!player || !player.pos) return out;
  const seed = (state.meta && state.meta.seed) || 1;
  const deltaV = Math.max(0, finiteOrZero(payload.playerDeltaV));
  const px = finiteOrZero(player.vel && player.vel.x);
  const pz = finiteOrZero(player.vel && player.vel.z);
  const base = ((hash32(seed, tick, 'fragile-spill') >>> 0) / 4294967296) * Math.PI * 2;
  let spawned = 0;
  for (let i = 0; i < items.length && spawned < FRAGILE_CARGO_SPILL_MAX_PODS; i++) {
    const item = items[i];
    // Every crack spills at least one pod — small holds get the scramble too.
    const spillQty = Math.max(1, Math.floor((item.qty || 0) * FRAGILE_CARGO_SPILL_FRAC));
    if (!(spillQty > 0) || !(item.qty > 0)) continue;
    const ang = base + (spawned / FRAGILE_CARGO_SPILL_MAX_PODS) * Math.PI * 2;
    const kick = 6 + deltaV * 0.4;
    const pod = spawnEntity({
      type: 'pickup',
      pos: {
        x: player.pos.x + Math.cos(ang) * ((player.radius || 8) + 4),
        z: player.pos.z + Math.sin(ang) * ((player.radius || 8) + 4),
      },
      vel: { x: px * 0.5 + Math.cos(ang) * kick, z: pz * 0.5 + Math.sin(ang) * kick },
      radius: 3, mass: 0.1, collides: true,
      data: {
        kind: 'cargo', commodityId: item.commodityId, amount: spillQty,
        despawnAt: simTime + FRAGILE_CARGO_SPILL_TTL_S,
        fragileSpill: true,
      },
    });
    if (!pod) continue;
    spawned += 1;
    out.pods += 1;
    out.units += spillQty;
    if (pod.id != null) out.podIds.push(pod.id);
    item.spilled = spillQty;
    item.shattered = item.qty - spillQty;
  }
  return out;
}

export const fragileCargo = {
  name: 'fragileCargo',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers || {};
    ensureFragileCargoState(this.state);
    // The options literal is fixed at attach: hoisting it removes an allocation on every
    // physics:impact, including NPC-only contacts that bail inside applyFragileCargoImpact.
    this._impactOptions = { bus: this.bus, helpers: this.helpers };
    this._onImpact = (payload) => this.onImpact(payload || {});
    this._onNewGame = () => this.newGame();
    if (this.bus && typeof this.bus.on === 'function') {
      this.bus.on('physics:impact', this._onImpact);
      this.bus.on('game:newGame', this._onNewGame);
    }
  },

  newGame() {
    if (this.state) this.state.fragileCargo = freshState();
  },

  onImpact(payload) {
    return applyFragileCargoImpact(this.state, payload, this._impactOptions);
  },
};
