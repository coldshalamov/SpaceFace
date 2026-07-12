// securityReadout.js — BP-12 packet SECURITY_RESPONSE_READ ("Security Follows Danger").
//
// As a sector heats up, patrol presence visibly tightens — and the player can predict the next
// checkpoint. The causal drift is SHIPPED: sectorSim.effectiveSectorFor projects security/
// enemyDensity from the field, and dangerModel.classifyDrivers already tags a sector whose danger is
// FALLING (trend.danger < -0.0015) with a Concord-patrols-responding driver. This module is a PURE
// READ that turns that tag + trend into a single map/overview line.
//
// CRITICAL DISCIPLINE (the packet's failure modes, enforced structurally):
//   • securityReadout is PURE — it reads sectorSignalFor (the field-preferring public contract) and
//     maps the enumerated driver tags to prose. A tag outside the enumerated set renders NOTHING.
//   • The readout maps to a route/avoid decision (never a glyph that informs nothing). Concord
//     patrols responding = "safer to travel"; interdiction wave = "expect checkpoints". Each line
//     carries an `advice` field ('route'|'avoid'|'caution') so the UI can pair it with route-risk.
//   • One per sector max (the glyph budget). The wired module refreshes state.ui.securityReadout for
//     the CURRENT sector only, on sector:enter / dock:docked. It never speaks (voice:none).
//   • Cosmetic only — it NEVER couples to factionId hostility (scanner.isHostileToPlayer owns that).
//
// noTouch honored: sectorSim.js / galaxyMap.js / world.js are imported read-only (the exported
// sectorSignalFor contract) or not at all. Budget: spawn:none · voice:none · draw:none.

import { sectorSignalFor } from '../systems/sectorSim.js';
import { SECTORS } from '../data/sectors.js';
import { FACTION_META } from '../data/factions.js';

const SECTOR_BY_ID = new Map(SECTORS.map((s) => [s.id, s]));
const FACTION_BY_ID = new Map(FACTION_META.map((f) => [f.id, f]));
const RECOGNIZED_LAW = new Set(['faction_scn', 'faction_mts', 'faction_dmc', 'faction_free']);

/** Four player-facing jurisdiction bands, shared by sector entry and the unified map inspector. */
export function securityTierFor(value) {
  const security = Math.max(0, Math.min(1, Number(value) || 0));
  if (security >= 0.75) return Object.freeze({ key: 'high', label: 'HIGH SECURITY', security });
  if (security >= 0.45) return Object.freeze({ key: 'medium', label: 'MEDIUM SECURITY', security });
  if (security >= 0.15) return Object.freeze({ key: 'low', label: 'LOW SECURITY', security });
  return Object.freeze({ key: 'lawless', label: 'LAWLESS', security });
}

/**
 * Pure sector-law contract used by every presentation seam. Security measures response strength;
 * faction ownership does not by itself invent police authority.
 */
export function sectorLawProfile(state, sectorId, securityOverride = null) {
  const base = SECTOR_BY_ID.get(sectorId) || null;
  const live = state && state.world && state.world.sectors && state.world.sectors[sectorId] || null;
  const security = Number.isFinite(securityOverride)
    ? Number(securityOverride)
    : Number.isFinite(live && live.security) ? live.security
      : Number.isFinite(base && base.security) ? base.security : 0;
  const tier = securityTierFor(security);
  const factionId = live && live.factionId || live && live.owner || base && base.factionId || null;
  const faction = FACTION_BY_ID.get(factionId) || null;
  const recognized = tier.key !== 'lawless' && RECOGNIZED_LAW.has(factionId);
  const authority = recognized
    ? String(faction && faction.name || factionId).replace(/^faction_/, '')
    : 'No recognized authority';
  let illegal;
  let response;
  if (!recognized) {
    illegal = 'No statutory protection; crews may retaliate in self-defense.';
    response = 'No patrol dispatch.';
  } else if (tier.key === 'high') {
    illegal = 'Attacking civilians, patrols, or stations triggers dispatch.';
    response = 'Rapid patrol response; reserve units available.';
  } else if (tier.key === 'medium') {
    illegal = 'Attacking civilians, patrols, or stations triggers dispatch.';
    response = 'Patrol response inside protected station rings.';
  } else {
    illegal = 'Station-ring aggression triggers dispatch; open space is self-defense only.';
    response = 'Limited station-ring response; no open-space guarantee.';
  }
  return Object.freeze({
    sectorId,
    sectorName: String(base && base.name || live && live.name || sectorId || 'Unknown sector'),
    security: tier.security,
    level: tier.label,
    levelKey: tier.key,
    factionId,
    controller: String(faction && (faction.short || faction.name) || factionId || 'Unaffiliated'),
    authority,
    recognized,
    illegal,
    response,
  });
}

// The enumerated danger tags this readout interprets. Anything else → no readout (no invented text).
// (concord_patrols: dangerModel.js:444 — trend.danger<-0.0015 + scn>0.20; interdiction_wave: :466.)
export const SECURITY_TAGS = Object.freeze({
  concord_patrols: Object.freeze({
    label: 'Concord patrols responding',
    detail: 'Security rising — lanes are tightening back up.',
    advice: 'route', // safer to travel
  }),
  interdiction_wave: Object.freeze({
    label: 'Interdiction wave',
    detail: 'Customs checkpoints active — expect scans on the lane.',
    advice: 'caution', // lawful pressure, not outright danger
  }),
  reach_pressure: Object.freeze({
    label: 'Reach raiders pushing in',
    detail: 'Danger rising on the lanes.',
    advice: 'avoid',
  }),
});

/**
 * securityReadoutFor(signal) -> { tag, label, detail, advice } | null — PURE.
 *
 * `signal` is a sectorSignalFor packet. Returns the security readout for the dominant danger tag,
 * gated on the trend direction the tag already implies (concord_patrols is meaningful only when
 * security is actually recovering — trend.danger < 0). null for a sector with no security-relevant
 * driver. Deterministic per field digest.
 */
export function securityReadoutFor(signal) {
  if (!signal || !signal.driver || !signal.trend) return null;
  const tag = signal.driver.danger;
  const meta = SECURITY_TAGS[tag];
  if (!meta) return null; // enumerated tags only — unknown tag renders nothing
  // Concord-patrols-responding is the "security RISING" readout: only surface it when danger is
  // actually falling (the kernel's own gate is trend.danger < -0.0015). A rising trend under the
  // same tag would mislead — render nothing instead.
  if (tag === 'concord_patrols' && (Number(signal.trend.danger) || 0) >= 0) return null;
  return { tag, label: meta.label, detail: meta.detail, advice: meta.advice };
}

/**
 * securityReadout(state, sectorId) -> the readout for a live sector, or null. Routes through
 * sectorSignalFor (the field node wins over the legacy drift mirror). Deterministic per digest.
 */
export function securityReadout(state, sectorId) {
  const signal = sectorSignalFor(state, sectorId);
  const out = securityReadoutFor(signal);
  if (!out) return null;
  const base = SECTOR_BY_ID.get(sectorId);
  return {
    sectorId,
    sectorName: (base && base.name) || String(sectorId).replace(/^sector_/, '').replace(/_/g, ' '),
    ...out,
  };
}

// ── registry SYSTEMS-only entry (current-sector only; additive UI state; zero voice) ───────────
export const securityReadoutSystem = {
  name: 'securityReadout',

  init(ctx) {
    this._state = ctx && ctx.state;
    this._bus = ctx && ctx.bus;
    this._onEnter = (p) => this._refresh(p && p.sectorId);
    this._onDocked = (p) => {
      // dock:docked carries a stationId — resolve to its sector (one readout per sector max).
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
    const out = securityReadout(state, id);
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    // Additive UI state (NOT in the sim snapshot hash). Cleared when there is no readout so the
    // map/overview never shows a stale glyph from the previous sector.
    if (out) state.ui.securityReadout = { ...out, t: state.simTime || 0 };
    else delete state.ui.securityReadout;
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

// stationId → sectorId (same derivation causeLedger/economyContracts use).
function stationSector(stationId) {
  for (const sec of SECTORS) {
    for (const st of (sec.stations || [])) if (st.id === stationId) return sec.id;
  }
  return null;
}

export default securityReadoutSystem;
