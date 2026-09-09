// fragileCargo.js - BP-02 FRAGILE-ORE backend.
//
// Event-driven cargo consequence for hard player impacts. Cargo mutation still
// goes through cargo.removeCargo; this system only decides which fragile stacks
// crack and records the receipt/readout for UI consumers.
import { ORES } from '../data/mining.js';
import { COMMODITIES } from '../data/commodities.js';
import { removeCargo } from './cargo.js';

export const FRAGILE_CARGO_HARD_DELTA_V = 18;
export const FRAGILE_CARGO_MAX_LOSS_FRACTION = 0.22;
export const FRAGILE_CARGO_COOLDOWN_S = 0.75;
export const FRAGILE_CARGO_RECEIPT_CAP = 12;
export const FRAGILE_CARGO_TAGS = Object.freeze(['crystal', 'rare', 'exotic']);

const STATE_VERSION = 1;
const FRAGILE_TAG_SET = new Set(FRAGILE_CARGO_TAGS);
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

  const receipt = {
    event: 'fragile_cargo_impact',
    t: simTime,
    tick: Math.max(0, Math.floor(finiteOrZero(payload.tick != null ? payload.tick : state && state.tick))),
    aId: payload.aId == null ? null : payload.aId,
    bId: payload.bId == null ? null : payload.bId,
    dp: round4(payload.dp),
    playerDeltaV: round4(payload.playerDeltaV),
    fraction: plan.fraction,
    items,
    totalQty: items.reduce((sum, item) => sum + item.qty, 0),
    totalValueCr: items.reduce((sum, item) => sum + item.valueCr, 0),
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
  const text = `Fragile cargo cracked on impact: ${label} -${receipt.totalQty}u`;
  const voice = helpers && helpers.voice;
  if (voice && typeof voice.say === 'function') {
    const said = voice.say({ channel: 'alert', text, kind: 'fragileCargo', ttl: 3 });
    if (said) return;
  }
  if (bus && typeof bus.emit === 'function') bus.emit('toast', { text, kind: 'warn', ttl: 3 });
}

export const fragileCargo = {
  name: 'fragileCargo',

  init(ctx) {
    this.state = ctx && ctx.state;
    this.bus = ctx && ctx.bus;
    this.helpers = ctx && ctx.helpers || {};
    ensureFragileCargoState(this.state);
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
    return applyFragileCargoImpact(this.state, payload, {
      bus: this.bus,
      helpers: this.helpers,
    });
  },
};
