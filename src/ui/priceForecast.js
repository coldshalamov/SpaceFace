// priceForecast.js — BP-12 packet PRICE_FORECAST_CONE ("Where Air Is About To Be Cheap").
//
// The map shows not just today's prices but the DIRECTION the field is pushing them — so the player
// can trade ahead of it. The trend is SHIPPED: sectorSignalFor already carries trend.pricePressure
// (the field's first derivative). This module is a PURE READ that turns its sign into a per-sector
// rising/falling/steady arrow, gated to sectors with material movement so the map isn't cluttered.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • forecastArrow is PURE — it reads the sign of trend.pricePressure and labels it a FORECAST,
//     never a guarantee (the failure mode: presenting the trend as certainty). The label always
//     carries `confidence: 'forecast'`, and the UI is expected to render it as such.
//   • Gated to sectors with |trend.pricePressure| above a threshold — no arrow on a calm market
//     (glyph-clutter failure mode). One arrow per sector.
//   • Cosmetic only — it NEVER touches prices (economy owns them) and never couples to factionId.
//   • The wired module refreshes state.ui.priceForecast per sector on sector:enter / dock:docked and
//     never speaks (voice:none). It is a read layer over the field, nothing more.
//
// noTouch honored: sectorSim.js / economy.js / galaxyMap.js are imported read-only (the exported
// sectorSignalFor contract) or not at all. Budget: spawn:none · voice:none · draw:none.

import { sectorSignalFor } from '../systems/sectorSim.js';
import { SECTORS } from '../data/sectors.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));

// |trend.pricePressure| above this → an arrow; below → steady/no arrow. Tuned to the kernel's own
// meaningful-movement band (dangerModel uses ±0.0015 as its trend gate; prices move slower, so we
// gate slightly higher to avoid a forest of tiny arrows).
export const FORECAST_THRESHOLD = 0.002;

/**
 * forecastArrow(signal) -> { direction, glyph, label, confidence } | null — PURE.
 *
 * `signal` is a sectorSignalFor packet. direction ∈ {'rising','falling','steady'}; null when there
 * is no signal at all. The label is always a FORECAST (confidence:'forecast'), never a guarantee.
 * Deterministic per field digest.
 */
export function forecastArrow(signal) {
  if (!signal || !signal.trend) return null;
  const t = Number(signal.trend.pricePressure) || 0;
  if (t > FORECAST_THRESHOLD) {
    return { direction: 'rising', glyph: '▲', label: 'prices forecast rising', confidence: 'forecast' };
  }
  if (t < -FORECAST_THRESHOLD) {
    return { direction: 'falling', glyph: '▼', label: 'prices forecast falling', confidence: 'forecast' };
  }
  return { direction: 'steady', glyph: '■', label: 'prices steady', confidence: 'forecast' };
}

/**
 * forecastFor(state, sectorId) -> the forecast for a live sector, or null. Routes through
 * sectorSignalFor (the field node wins over the legacy drift mirror). Deterministic per digest.
 * Returns null for an unknown sector.
 */
export function forecastFor(state, sectorId) {
  const signal = sectorSignalFor(state, sectorId);
  const arrow = forecastArrow(signal);
  if (!arrow) return null;
  const base = SECTOR_BY_ID.get(sectorId);
  return {
    sectorId,
    sectorName: (base && base.name) || String(sectorId).replace(/^sector_/, '').replace(/_/g, ' '),
    ...arrow,
  };
}

// ── registry SYSTEMS-only entry (current-sector + neighbors; additive UI state; zero voice) ────
//
// Refreshes state.ui.priceForecast = { current, neighbors:[{sectorId,name,direction,glyph,label}] }
// so the map can annotate the current sector + its visible neighbors in one read. Only sectors with
// material movement (|trend| > threshold) appear in `neighbors` — calm sectors are omitted (no
// clutter). The `current` entry is always present (steady if calm) so the player's own sector reads.
export const priceForecastSystem = {
  name: 'priceForecast',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._onEnter = (p) => this._refresh(p && p.sectorId);
    this._onDocked = (p) => {
      const sid = p && p.stationId ? stationSector(p.stationId) : null;
      this._refresh(sid);
    };
    if (this._bus && this._bus.on) {
      this._bus.on('sector:enter', this._onEnter);
      this._bus.on('dock:docked', this._onDocked);
    }
  },

  _refresh(sectorId) {
    const state = this._state;
    if (!state) return;
    const id = sectorId || (state.world && state.world.currentSectorId);
    if (!id) return;
    const current = forecastFor(state, id);
    if (!current) return;
    // Annotate visible neighbors — only those with material movement (glyph-budget gate).
    const base = SECTOR_BY_ID.get(id);
    const neighbors = [];
    for (const nId of ((base && base.neighbors) || []).slice().sort()) {
      const f = forecastFor(state, nId);
      if (!f || f.direction === 'steady') continue; // calm neighbor → no arrow (no clutter)
      neighbors.push({ sectorId: f.sectorId, sectorName: f.sectorName, direction: f.direction, glyph: f.glyph, label: f.label });
    }
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    state.ui.priceForecast = { current, neighbors, t: state.simTime || 0 };
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onEnter) this._bus.off('sector:enter', this._onEnter);
      if (this._onDocked) this._bus.off('dock:docked', this._onDocked);
    }
    this._onEnter = null;
    this._onDocked = null;
  },
};

function stationSector(stationId) {
  for (const sec of SECTORS) {
    for (const st of (sec.stations || [])) if (st.id === stationId) return sec.id;
  }
  return null;
}

export default priceForecastSystem;
