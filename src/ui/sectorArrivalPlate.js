// sectorArrivalPlate.js — PLACES-1 (INV-25 item 7): arrival names the place, in its own voice.
//
// On `sector:enter` (a real arrival, not a continuous boundary handoff), show ONE small
// one-shot DOM layer: the sector's name plus the FIRST line of its shipped greeting barks
// (`SECTOR_GREETING_BARKS`, src/data/barks.js V-01) — the lines a local might say on an open
// hail. The barks previously rode only the ambient pass-by hail share; pinning the first one
// to the enter moment makes the screen say where you are, in the place's own voice, within a
// second of arrival.
//
// Split of concerns (copies the sectorPostcard.js shape):
//   • buildArrivalPlate(sectorId, sectorRecord) — PURE. No DOM, no bus, no clock, no
//     Math.random. Same inputs → same plate. Degrades to a bare name card for an unknown
//     sector (never throws).
//   • sectorArrivalPlate (registry SYSTEMS-only entry, NOT UPDATE_ORDER) — subscribes to
//     `sector:enter`, stores the plate on state.ui.sectorArrival (additive UI state, NOT in
//     the sim snapshot hash), and mounts a `typeof document`-guarded card that is its own
//     small DOM layer (not the Stage's banner slot, which the postcard owns): text-only, one
//     line of voice, never speaks through the voice queue, never blocks flight input
//     (pointer-events: none; the dismissal listeners only remove the card), and enters through
//     the kit motion seam — settle() normally, cut() when the player asked for reduced motion.
//
// Suppression: a continuous Voronoi handoff is not an arrival (the world's own per-arrival
// comms line makes the same carve), and OPENING-1b's "one voice during lessons" rule
// (05_ADVENTURE.md §8) keeps the glass quiet while the opening rail speaks: until the pilot
// has docked once, the objective line is the only voice.

import { SECTORS } from '../data/sectors.js';
import { sectorGreetingBarkFor } from '../data/barks.js';
import { openingQuiet } from '../onboarding/openingQuiet.js';
import { cut, reducedMotion, settle } from './kit/motion.js';

/** Cosmetic auto-fade; any input dismisses sooner. Shorter than the postcard's card: the
 *  plate is a beat, not a reference card. */
export const SECTOR_ARRIVAL_PLATE_TTL_MS = 5600;

/** De-prefixed human fallback for an unknown sector id. */
function prettySectorName(sectorId) {
  return String(sectorId || 'unknown sector').replace(/^sector_/, '').replace(/_/g, ' ');
}

/**
 * buildArrivalPlate(sectorId, sectorRecord?) -> { sectorId, name, line }
 *
 * PURE + deterministic over shipped data. `line` is the sector's FIRST greeting bark — the
 * same table the ambient hail reads, picked through the same exported deterministic picker
 * (`sectorGreetingBarkFor(sectorId, 0)`), so there is exactly one source of sector voice.
 * Unknown sector → bare name card, never throws.
 */
export function buildArrivalPlate(sectorId, sectorRecord = null) {
  const id = String(sectorId || '');
  const known = sectorRecord && typeof sectorRecord.name === 'string' && sectorRecord.name
    ? sectorRecord
    : SECTORS.find((s) => s && s.id === id) || null;
  const name = known ? known.name : prettySectorName(id);
  const line = sectorGreetingBarkFor(id, 0);
  return { sectorId: id, name, line };
}

// ── registry SYSTEMS-only entry (no update; event-driven, cosmetic, text-only) ────────────────

export const sectorArrivalPlate = {
  name: 'sectorArrivalPlate',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._el = null;
    this._dismiss = null;
    this._hideTimer = null;
    this._onEnter = (p) => this._handleEnter(p || {});
    if (this._bus && this._bus.on) this._bus.on('sector:enter', this._onEnter);
  },

  _handleEnter(p) {
    const state = this._state;
    if (!state || !p.sectorId) return;
    // A continuous Voronoi handoff is cruise, not arrival — 38 of these an hour would make
    // the plate wallpaper. The world's own comms line carves the same case.
    if (p.continuous === true) return;
    // OPENING-1b: while the opening rail speaks (until the first dock) the glass carries one
    // voice — the objective line. Arrival plates wait for the pilot's own departures.
    if (openingQuiet(state)) return;
    const plate = buildArrivalPlate(p.sectorId, p.sector);

    // Additive UI state — readable by HUD/tests; NOT part of the sim snapshot hash (state.ui).
    if (!state.ui || typeof state.ui !== 'object') state.ui = {};
    state.ui.sectorArrival = { ...plate, t: Number.isFinite(state.simTime) ? state.simTime : 0 };

    this._render(plate);
  },

  // ── DOM plate (cosmetic; fully guarded; never blocks flight) ─────────────────────────────
  // Its own small layer under #ui-root, NOT the Stage banner: the banner slot is the
  // postcard's, and a queued item would wait behind that card's 12 s hold — arrival must
  // name the place within the first second. The look (lower-centre wash, lit name) is
  // styles/kit.css `#sf-sector-arrival`; no backdrop blur in flight.
  _render(plate) {
    if (typeof document === 'undefined') return;

    this._hide(); // one-shot: a new arrival replaces any plate still on screen

    const el = document.createElement('div');
    el.id = 'sf-sector-arrival';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-label', 'Sector arrival');
    el.className = 'sf-arrival';

    const nameEl = document.createElement('div');
    nameEl.className = 'sf-arrival__name';
    nameEl.textContent = plate.name;
    el.appendChild(nameEl);
    if (plate.line) {
      const voiceEl = document.createElement('div');
      voiceEl.className = 'sf-arrival__voice';
      voiceEl.textContent = `\u201C${plate.line}\u201D`;
      el.appendChild(voiceEl);
    }

    const host = document.getElementById('ui-root') || document.body;
    if (!host || typeof host.appendChild !== 'function') return;
    host.appendChild(el);
    this._el = el;

    // The kit motion seam — the same door every stage item enters through: settle for
    // ordinary motion, cut (no transition) when the player asked for reduced motion. Motion
    // is cosmetic; a failure never costs the plate its text.
    try {
      if (reducedMotion()) cut(null, el, { state: 'sector-arrival' });
      else settle(el, { from: 'bottom', state: 'sector-arrival' });
    } catch { /* cosmetic — the plate still shows */ }

    // Dismiss on ANY input; auto-fade as cosmetic hygiene. The listeners only remove the
    // plate — nothing is prevented, focused or captured, and the layer itself is
    // pointer-events: none, so flight input is never blocked.
    const dismiss = () => this._hide();
    this._dismiss = dismiss;
    document.addEventListener('keydown', dismiss, { once: true });
    document.addEventListener('pointerdown', dismiss, { once: true });
    if (typeof window !== 'undefined' && typeof window.setTimeout === 'function') {
      this._hideTimer = window.setTimeout(dismiss, SECTOR_ARRIVAL_PLATE_TTL_MS);
    }
  },

  _hide() {
    if (typeof document !== 'undefined' && this._dismiss) {
      document.removeEventListener('keydown', this._dismiss);
      document.removeEventListener('pointerdown', this._dismiss);
    }
    this._dismiss = null;
    if (this._hideTimer != null && typeof window !== 'undefined' && typeof window.clearTimeout === 'function') {
      window.clearTimeout(this._hideTimer);
    }
    this._hideTimer = null;
    if (this._el && this._el.parentNode) this._el.parentNode.removeChild(this._el);
    this._el = null;
  },

  destroy() {
    if (this._bus && this._bus.off && this._onEnter) this._bus.off('sector:enter', this._onEnter);
    this._onEnter = null;
    this._bus = null;
    this._state = null;
    this._hide();
  },
};

export default sectorArrivalPlate;
