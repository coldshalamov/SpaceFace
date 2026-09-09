// dockDenyBanner.js — BP-11 packet A3 "Sealed Berth" (SURFACE — see design/revamp/detail/A_sector_station.md).
//
// dockDeny.js is SHIPPED (faction-voiced refusal reasons) but until now had zero callers — the
// player never met a station that turns them away in its own voice. This module surfaces it: on a
// dock attempt against a non-dockable station it resolves the SHIPPED dockDenyReason(station,
// factionMeta) and surfaces {label, reason, text} as a scan-result line + routes the flavored
// `text` through ctx.helpers.voice.say({channel:'comms'}) EXACTLY ONCE per attempt (debounced).
//
// Wiring (noTouch honored — world.js / uiRoot.js / bindings.js / input.js are never edited):
//   * Subscribes to `dock:attempt` {stationId|station} — the canonical attempt seam (nothing emits
//     it yet; the input lead can emit it from doDock() when deny-flagged stations enter content).
//   * Also subscribes to `dock:docked` — today's only live attempt signal. In the default game no
//     spawned station carries a deny flag, so this resolves null and stays silent; once content
//     flags stations, the denial surfaces even before the input-side block lands.
//   * On a denial it emits `dock:denied` {stationId, reason, text} — the additive seam a future
//     input-side blocker / contacts strip can consume.
//
// Contract details (packet failureModes):
//   * ALWAYS passes factionMeta (FACTION_META entry + live rep) so the faction-flavored line wins
//     over the generic text for a factioned station.
//   * Routes through voice.say, never bus.emit('toast') — the arbiter serializes voice, so the
//     denial can never double-voice over a market card on the same dock attempt.
//   * Debounce: the same station within DEBOUNCE_S of simTime is ONE attempt (guards against the
//     attempt+docked double-signal), timed on state.simTime — deterministic, no wall clock.

import { dockDenyReason } from '../data/dockDeny.js';
import { FACTION_META } from '../data/factions.js';
import { mountDataState, settleDataState } from './uiPrimitives.js';
import { MAP_FOCUS, openGalaxyMap } from './mapAuthority.js';

const DEBOUNCE_S = 2;        // same station inside this simTime window = one attempt
const BANNER_TTL_MS = 12000; // long enough to read the fault and take the verb
const DENY_CODES = Object.freeze({
  abandoned: 'STATION_DARK',
  private: 'BERTH_RESTRICTED',
  military_only: 'CREDENTIAL_INSUFFICIENT',
  under_construction: 'BERTH_OFFLINE',
  quarantine: 'QUARANTINE_SEAL',
  hostile_rep: 'DOCKING_CLEARANCE_REVOKED',
});

/** Human label for a station (entity data name, else de-prefixed id). */
function stationLabel(station, stationId) {
  const name = (station && (station.name || (station.data && station.data.name))) || null;
  if (name) return name;
  return String(stationId || 'station').replace(/^station_/, '').replace(/_/g, ' ');
}

/** Find the live station entity's data by stationId (defensive; null if absent). */
function findStationData(state, stationId) {
  if (!state || !stationId) return null;
  const list = (state.entityIndex && state.entityIndex.stations) || state.entityList || [];
  for (const e of list) {
    if (!e || e.alive === false || e.type !== 'station') continue;
    const data = e.data || {};
    if (data.stationId === stationId) return { ...data, factionId: data.factionId || e.factionId || null };
  }
  return null;
}

/**
 * resolveDockDeny(state, stationRef) -> { stationId, label, reason, text, factionId } | null
 *
 * stationRef: a stationId string (resolved against live entities) or a station-like object.
 * PURE over its inputs: calls the SHIPPED dockDenyReason with a full factionMeta (meta + live
 * rep from state.factions) so the flavored line always wins for a factioned station.
 * null = dockable (surface nothing).
 */
export function resolveDockDeny(state, stationRef) {
  const stationId = typeof stationRef === 'string'
    ? stationRef
    : (stationRef && (stationRef.stationId || stationRef.id || (stationRef.data && stationRef.data.stationId))) || null;
  const station = typeof stationRef === 'object' && stationRef !== null
    ? (stationRef.data ? { ...stationRef.data, factionId: stationRef.data.factionId || stationRef.factionId || null } : stationRef)
    : findStationData(state, stationId);
  if (!station) return null;

  const factionId = station.factionId || null;
  const meta = FACTION_META.find((f) => f && f.id === factionId) || null;
  const rep = state && state.factions && factionId && state.factions[factionId]
    ? state.factions[factionId].rep : undefined;
  // ALWAYS pass factionMeta (flavored voice wins); carry live rep for the minRep gate.
  const factionMeta = meta
    ? (Number.isFinite(rep) ? { ...meta, rep } : meta)
    : (factionId || undefined);

  const deny = dockDenyReason(station, factionMeta);
  if (!deny) return null;
  return {
    stationId: stationId || null,
    label: stationLabel(station, stationId),
    reason: deny.reason,
    text: deny.text,
    factionId,
  };
}

// ── registry SYSTEMS-only entry (no update; event-driven) ──────────────────────────────────────

export const dockDenyBanner = {
  name: 'dockDenyBanner',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._last = { stationId: null, t: -Infinity };
    this._onAttempt = (p) => this._handleAttempt(p);
    if (this._bus && this._bus.on) {
      this._bus.on('dock:attempt', this._onAttempt); // canonical seam (future input-side emit)
      this._bus.on('dock:docked', this._onAttempt);  // today's live attempt signal
    }
    this._bannerEl = null;
    this._hideTimer = null;
  },

  _handleAttempt(p) {
    const state = this._state;
    if (!state || !p) return;
    const ref = p.station || p.stationId;
    if (!ref) return;

    const deny = resolveDockDeny(state, ref);
    if (!deny) return; // dockable → surface NOTHING

    // Debounce: attempt+docked double-signal (or key mashing) inside the window is one attempt.
    const now = state.simTime || 0;
    if (deny.stationId && deny.stationId === this._last.stationId && (now - this._last.t) < DEBOUNCE_S) return;
    this._last = { stationId: deny.stationId, t: now };

    // Scan-result line: silent card text on additive UI state + the additive bus seam.
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    state.ui.dockDeny = { stationId: deny.stationId, label: deny.label, reason: deny.reason, text: deny.text, t: now };
    if (this._bus && this._bus.emit) {
      this._bus.emit('dock:denied', { stationId: deny.stationId, reason: deny.reason, text: deny.text });
    }

    // ONE comm-denial voice line per attempt — through the arbiter, never a raw toast.
    const helpers = (this._ctx && this._ctx.helpers) || {};
    if (helpers.voice && typeof helpers.voice.say === 'function') {
      helpers.voice.say({ channel: 'comms', text: deny.text, kind: 'dockDeny', factionId: deny.factionId });
    }

    this._render(deny);
  },

  // ── DOM scan line (cosmetic; fully guarded; never blocks flight) ─────────────────────────────
  _render(deny) {
    if (typeof document === 'undefined') return;
    const host = document.getElementById('hud') || document.body;
    if (!host) return;
    this._hide();

    const el = document.createElement('div');
    el.id = 'sf-dock-deny';
    el.className = 'sf-dock-deny';
    mountDataState(el, 'denied', {
      code: DENY_CODES[deny.reason] || 'CLEARANCE_DENIED',
      headline: 'You cannot dock at ' + deny.label + '.',
      fills: deny.text,
      compact: true,
      verb: {
        label: 'Plot another berth',
        onActivate: () => {
          this._hide();
          openGalaxyMap(this._ctx, {
            focus: MAP_FOCUS.SYSTEM,
            source: 'dock-deny',
            stationId: deny.stationId || undefined,
          });
        },
      },
    });

    host.appendChild(el);
    this._bannerEl = el;
    if (typeof window !== 'undefined') this._hideTimer = window.setTimeout(() => this._hide(), BANNER_TTL_MS);
  },

  _hide() {
    if (this._hideTimer != null && typeof window !== 'undefined') window.clearTimeout(this._hideTimer);
    this._hideTimer = null;
    if (this._bannerEl) settleDataState(this._bannerEl);
    if (this._bannerEl && this._bannerEl.parentNode) this._bannerEl.parentNode.removeChild(this._bannerEl);
    this._bannerEl = null;
  },

  destroy() {
    if (this._bus && this._bus.off && this._onAttempt) {
      this._bus.off('dock:attempt', this._onAttempt);
      this._bus.off('dock:docked', this._onAttempt);
    }
    this._onAttempt = null;
    this._hide();
  },
};

export default dockDenyBanner;
