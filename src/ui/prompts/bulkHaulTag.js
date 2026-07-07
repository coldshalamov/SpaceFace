// bulkHaulTag.js -- T3-17 / TOW-THE-CHUNK prompt surface.
//
// Bulk-haul is already shipped in mining.js: oversized fracture chunks emit
// `mining:bulkRequiresTether`, then a tethered chunk delivered at a refinery pays through
// `bulkHaulPayoutForChunk` and `economy:grantCredits`. This module is only the surface layer:
// it mirrors one guarded prompt into state.ui.bulkHaulTag and optionally renders a tiny DOM tag
// when a browser HUD exists. It never mutates mining, tether, economy, cargo, or mission state.

import { BULK_HAUL_MIN_U } from '../../systems/mining.js';

export const BULK_HAUL_TAG_KIND = 'bulk_haul_tag';
export const BULK_HAUL_TAG_PREFIX = 'TETHER TO HAUL';
export const BULK_HAUL_HAULING_PREFIX = 'HAUL TO REFINERY';

function massFromChunk(chunk) {
  const d = chunk && chunk.data || {};
  return Math.max(0, Number(d.bulkMassU != null ? d.bulkMassU : d.yieldU != null ? d.yieldU : chunk && chunk.mass) || 0);
}

function formatMassU(massU) {
  const n = Number(massU) || 0;
  return Math.abs(n - Math.round(n)) < 0.001 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, '');
}

function chunkCommodityId(chunk) {
  const d = chunk && chunk.data || {};
  return d.commodityId || null;
}

function sectorEntries(state) {
  const sectors = state && state.world && state.world.sectors || {};
  return Array.isArray(sectors)
    ? sectors.map((sector) => [sector && sector.id, sector]).filter((entry) => entry[0])
    : Object.entries(sectors);
}

function stationIsRefinery(station) {
  return !!(station && (station.type === 'refinery' || (station.services || []).includes('refine')));
}

function sectorDistanceRank(state, sectorId) {
  const currentId = state && state.world && state.world.currentSectorId;
  if (!currentId || !sectorId) return 99;
  if (sectorId === currentId) return 0;
  const current = (state.world.sectors || {})[currentId];
  if (current && (current.neighbors || []).includes(sectorId)) return 1;
  return 2;
}

function compareText(a, b) {
  const aa = String(a);
  const bb = String(b);
  return aa < bb ? -1 : aa > bb ? 1 : 0;
}

export function bulkHaulMassU(chunk) {
  return massFromChunk(chunk);
}

export function isBulkHaulTagArmed(chunk, minU = BULK_HAUL_MIN_U) {
  return !!(chunk &&
    chunk.alive !== false &&
    chunk.type === 'asteroid' &&
    chunk.data &&
    chunk.data.isChunk &&
    massFromChunk(chunk) > minU);
}

export function nearestRefineryRouteHint(state) {
  const candidates = [];
  for (const [sectorId, sector] of sectorEntries(state)) {
    for (const station of sector && sector.stations || []) {
      if (!stationIsRefinery(station)) continue;
      candidates.push({
        stationId: station.id,
        stationName: station.name || station.id,
        sectorId,
        sectorName: sector.name || sectorId,
        rank: sectorDistanceRank(state, sectorId),
      });
    }
  }
  candidates.sort((a, b) =>
    (a.rank - b.rank) ||
    compareText(a.sectorName, b.sectorName) ||
    compareText(a.stationName, b.stationName));
  const best = candidates[0] || null;
  if (!best) return {
    stationId: null,
    stationName: null,
    sectorId: null,
    sectorName: null,
    local: false,
    text: 'Find a refinery dock.',
  };
  return {
    stationId: best.stationId,
    stationName: best.stationName,
    sectorId: best.sectorId,
    sectorName: best.sectorName,
    local: best.rank === 0,
    text: best.rank === 0
      ? `Haul to ${best.stationName}.`
      : `Plot refinery route to ${best.stationName}.`,
  };
}

export function buildBulkHaulTag(chunk, state, options = {}) {
  if (!isBulkHaulTagArmed(chunk, options.minU == null ? BULK_HAUL_MIN_U : options.minU)) return null;
  const massU = massFromChunk(chunk);
  const routeHint = nearestRefineryRouteHint(state);
  const phase = options.phase || 'tether';
  const prefix = phase === 'hauling' ? BULK_HAUL_HAULING_PREFIX : BULK_HAUL_TAG_PREFIX;
  return {
    kind: BULK_HAUL_TAG_KIND,
    phase,
    chunkId: chunk.id,
    asteroidId: chunk.id,
    massU,
    commodityId: chunkCommodityId(chunk),
    text: `${prefix} \u00b7 ${formatMassU(massU)}u`,
    routeHint,
    position: chunk.pos ? { x: chunk.pos.x, z: chunk.pos.z } : null,
    t: state && Number.isFinite(state.simTime) ? state.simTime : 0,
  };
}

export const bulkHaulTag = {
  name: 'bulkHaulTag',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._el = null;
    this._onRequires = (p) => this._show(p, 'tether');
    this._onTether = (p) => this._onTethered(p);
    this._onDelivered = (p) => this._clearIfCurrent(p && (p.chunkId || p.asteroidId), 'delivered');
    this._onDestroyed = (p) => this._clearIfCurrent(p && (p.id || p.entityId || p.targetId), 'destroyed');
    this._onSector = () => this._clear('sector');

    if (this._bus && this._bus.on) {
      this._bus.on('mining:bulkRequiresTether', this._onRequires);
      this._bus.on('tether:latched', this._onTether);
      this._bus.on('tether:attached', this._onTether);
      this._bus.on('mining:bulkHaulDelivered', this._onDelivered);
      this._bus.on('asteroid:destroyed', this._onDestroyed);
      this._bus.on('entity:destroyed', this._onDestroyed);
      this._bus.on('sector:enter', this._onSector);
    }
  },

  newGame() {
    this._clear('newGame');
  },

  _show(payload, phase) {
    const state = this._state;
    const chunkId = payload && (payload.asteroidId || payload.chunkId);
    const chunk = chunkId != null && state && state.entities && state.entities.get
      ? state.entities.get(chunkId)
      : null;
    const tag = buildBulkHaulTag(chunk, state, { phase });
    if (!tag) return null;
    return this._publish(tag);
  },

  _onTethered(payload) {
    const targetId = payload && (payload.targetId || payload.bodyBId);
    const current = this._state && this._state.ui && this._state.ui.bulkHaulTag;
    if (!current || current.chunkId !== targetId) return null;
    const chunk = this._state.entities && this._state.entities.get && this._state.entities.get(targetId);
    const tag = buildBulkHaulTag(chunk, this._state, { phase: 'hauling' });
    if (!tag) return null;
    return this._publish(tag);
  },

  _publish(tag) {
    const state = this._state;
    if (!state) return tag;
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    const prev = state.ui.bulkHaulTag;
    if (prev && prev.chunkId === tag.chunkId && prev.text === tag.text && prev.phase === tag.phase) return prev;
    state.ui.bulkHaulTag = tag;
    if (this._bus && this._bus.emit) this._bus.emit('ui:bulkHaulTag', tag);
    this._render(tag);
    return tag;
  },

  _clearIfCurrent(chunkId, reason) {
    const current = this._state && this._state.ui && this._state.ui.bulkHaulTag;
    if (!current || current.chunkId !== chunkId) return;
    this._clear(reason);
  },

  _clear(reason) {
    const state = this._state;
    const current = state && state.ui && state.ui.bulkHaulTag;
    if (!current) {
      this._removeDom();
      return;
    }
    state.ui.bulkHaulTag = null;
    if (this._bus && this._bus.emit) this._bus.emit('ui:bulkHaulTagCleared', { chunkId: current.chunkId, reason });
    this._removeDom();
  },

  _render(tag) {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('hud') || document.body;
    if (!host) return;
    let el = this._el;
    if (!el || !el.parentNode) {
      el = document.createElement('div');
      el.id = 'sf-bulk-haul-tag';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.style.cssText = [
        'position:absolute',
        'left:50%',
        'top:58%',
        'transform:translate(-50%,-50%)',
        'padding:5px 8px',
        'background:rgba(5,9,18,.88)',
        'border:1px solid rgba(255,179,92,.58)',
        'border-radius:4px',
        'color:#ffb35c',
        'font:11px/1.35 var(--mono,monospace)',
        'letter-spacing:.12em',
        'text-transform:uppercase',
        'pointer-events:none',
        'z-index:42',
      ].join(';');
      host.appendChild(el);
      this._el = el;
    }
    el.dataset.chunkId = String(tag.chunkId);
    if (tag.position) {
      el.dataset.worldX = String(Math.round(tag.position.x));
      el.dataset.worldZ = String(Math.round(tag.position.z));
    }
    el.textContent = tag.text;
    el.title = tag.routeHint && tag.routeHint.text || '';
  },

  _removeDom() {
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onRequires) this._bus.off('mining:bulkRequiresTether', this._onRequires);
      if (this._onTether) {
        this._bus.off('tether:latched', this._onTether);
        this._bus.off('tether:attached', this._onTether);
      }
      if (this._onDelivered) this._bus.off('mining:bulkHaulDelivered', this._onDelivered);
      if (this._onDestroyed) {
        this._bus.off('asteroid:destroyed', this._onDestroyed);
        this._bus.off('entity:destroyed', this._onDestroyed);
      }
      if (this._onSector) this._bus.off('sector:enter', this._onSector);
    }
    this._removeDom();
    this._ctx = this._bus = this._state = null;
    this._onRequires = this._onTether = this._onDelivered = this._onDestroyed = this._onSector = null;
  },
};

export default bulkHaulTag;
