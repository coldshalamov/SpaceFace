// hazardLanguage.js — BP-11 packet A7 "Hazard Language & Counterplay" (SURFACE — see
// design/revamp/detail/A_sector_station.md packet A7).
//
// A hazard's shape and color tell the player what it does AND what to do about it. This module
// LABELS the shipped hazard causes — world.js `_tickHazards` already applies the effects and
// already emits `hazard:enter`/`hazard:exit`; sectorZones.js already carries the hazard zone
// types. Nothing here adds or changes an effect (noTouch: sectors.js / sectorZones.js / world.js
// / galaxyMap.js / render root).
//
// Two halves:
//   • HAZARD_LANGUAGE — PURE table, total over sectors.js HAZARD_TYPES AND every `hazard:true`
//     zone type in sectorZones.js. Every entry carries a MANDATORY `counterplay` array of real
//     player verbs (COUNTERPLAY_VERBS) — a glyph with no counterplay is decoration, not language.
//     Zone-type colors are DERIVED from ZONE_TYPES (one source of truth); the same phenomenon
//     keeps the same glyph across its sector-hazard and zone forms (radiation ≡ radiation_field).
//   • hazardHints — SYSTEMS-only entry (registry, NOT UPDATE_ORDER): on the FIRST entry into a
//     hazard *type* per session it speaks ONE counterplay hint via voice.say({channel:'warn'}),
//     then stays silent for that type (tutorial-memory; packet failureMode: hint spam). It also
//     mirrors the active hazard's language onto additive UI state (state.ui.hazardRead) for the
//     HUD/render layer to read. No DOM, no window needed — headless-clean.
//
// RENDER HALF HANDED OFF (graphics lane active — `assets/ships/release.__building/` present, and
// src/render/** is graphics/perf-lane-owned per AGENTS §10): `src/render/hazardGlyphs.js` should
// draw the boundary edge glyph + map marker (≤1 boundary glyph + 1 map marker per hazard).
// Wiring contract for that file: import HAZARD_LANGUAGE for glyph/color, read the live hazard
// geometry from state.world.activeSector.hazards + sectorZones, and read state.ui.hazardRead for
// the player's current-hazard readout. No new effects, no spawns, cosmetic only.

import { ZONE_TYPES } from './sectorZones.js';

/** The real player verbs a counterplay entry may name (doctrine: no UI without decision). */
export const COUNTERPLAY_VERBS = ['avoid', 'shield', 'time', 'tether', 'route'];

/** hazard type (sectors.js HAZARD_TYPES ∪ hazard:true ZONE_TYPES keys) →
 *  { glyph, color, damages[], counterplay[], hint }. */
export const HAZARD_LANGUAGE = {
  // ── sector hazards (sectors.js HAZARD_TYPES; effects applied by world.js _tickHazards) ──
  dense_asteroid: {
    glyph: '◆', color: '#FFB13D',
    damages: ['hull on collision'],
    counterplay: ['avoid', 'time', 'tether'],
    hint: 'Dense rock: collisions chew hull — thread the gaps slowly, time the tumbles, or tether-swing through.',
  },
  nebula: {
    glyph: '≋', color: '#8A5FB0',
    damages: ['sensor visibility'],
    counterplay: ['route', 'avoid'],
    hint: 'Nebula: sensors wash out and ambushers hide in the murk — route around it, or cross eyes-open.',
  },
  radiation: {
    glyph: '☢', color: '#7FE05F',
    damages: ['shields', 'cargo', 'hull over time'],
    counterplay: ['shield', 'time', 'route'],
    hint: 'Radiation: it burns shields and cargo the whole time you are inside — shield up, transit fast, or route around.',
  },
  debris: {
    glyph: '✕', color: '#B08A6A',
    damages: ['hull on impact'],
    counterplay: ['avoid', 'time'],
    hint: 'Debris field: fast junk on flat arcs — keep your speed down and time the crossings.',
  },
  debris_current: {
    glyph: '⇢', color: '#39D0FF',
    damages: ['trajectory and unsecured payload control'],
    counterplay: ['time', 'tether', 'route'],
    hint: 'Debris current: the warning rails precede each surge — time the calm, tether the ballast, or route around.',
  },

  // ── hazard zone types (sectorZones.js `hazard:true`; same phenomenon = same glyph, zone color
  //    derived from ZONE_TYPES so the map and the language can never disagree) ──
  radiation_field: {
    glyph: '☢', color: ZONE_TYPES.radiation_field.color,
    damages: ['shields', 'cargo', 'hull over time'],
    counterplay: ['shield', 'time', 'route'],
    hint: 'Radiation field ahead: shields and cargo cook inside — shield up, cross fast, or route around.',
  },
  nebula_fog: {
    glyph: '≋', color: ZONE_TYPES.nebula_fog.color,
    damages: ['sensor visibility'],
    counterplay: ['route', 'avoid'],
    hint: 'Nebula fog: your scanner goes blind before you do — route around, or watch for shapes in the murk.',
  },
};

/** hazardLanguageFor(type) → entry | null (label lookup; never throws). */
export function hazardLanguageFor(type) {
  return HAZARD_LANGUAGE[type] || null;
}

// ── SYSTEMS-only entry: the once-per-type-per-session counterplay hint ──────────────────────────

export const hazardHints = {
  name: 'hazardHints',

  init(ctx) {
    this._ctx = ctx;
    this._bus = ctx && ctx.bus;
    this._state = ctx && ctx.state;
    this._hinted = new Set();   // hazard types hinted THIS session (tutorial-memory; not saved)
    this._onHazardEnter = (p) => this._enter(p && p.zoneType, 'hazard');
    this._onHazardExit = (p) => this._exit(p && p.zoneType, 'hazard');
    this._onZoneEnter = (p) => this._enter(p && p.type, 'zone');
    this._onZoneExit = () => this._exit(null, 'zone');
    if (this._bus && this._bus.on) {
      this._bus.on('hazard:enter', this._onHazardEnter);
      this._bus.on('hazard:exit', this._onHazardExit);
      this._bus.on('world:zoneEntered', this._onZoneEnter);
      this._bus.on('world:zoneExited', this._onZoneExit);
    }
  },

  newGame() {
    this._hinted = new Set();
    if (this._state && this._state.ui) this._state.ui.hazardRead = null;
  },

  _enter(type, source) {
    if (!type) return;
    const entry = HAZARD_LANGUAGE[type];
    if (!entry) return;   // non-hazard zone / unknown type → not our language
    const state = this._state;

    // Additive UI readout for the HUD/render layer (glyph + damage tag + counterplay verbs).
    if (state) {
      if (!state.ui || typeof state.ui !== 'object') state.ui = {};
      state.ui.hazardRead = {
        type, source, glyph: entry.glyph, color: entry.color,
        damages: entry.damages.slice(), counterplay: entry.counterplay.slice(),
        t: state.simTime || 0,
      };
    }

    // ONE counterplay hint the first time this hazard TYPE is entered this session, then silent.
    if (this._hinted.has(type)) return;
    this._hinted.add(type);
    const helpers = (this._ctx && this._ctx.helpers) || {};
    if (helpers.voice && typeof helpers.voice.say === 'function') {
      helpers.voice.say({ channel: 'warn', text: entry.hint, kind: 'hazardHint' });
    }
  },

  _exit(type, source) {
    const state = this._state;
    const read = state && state.ui && state.ui.hazardRead;
    if (!read) return;
    if (read.source !== source) return;              // the other overlay is still active
    if (type && read.type !== type) return;          // a different hazard took over the readout
    state.ui.hazardRead = null;
  },

  destroy() {
    if (this._bus && this._bus.off) {
      if (this._onHazardEnter) this._bus.off('hazard:enter', this._onHazardEnter);
      if (this._onHazardExit) this._bus.off('hazard:exit', this._onHazardExit);
      if (this._onZoneEnter) this._bus.off('world:zoneEntered', this._onZoneEnter);
      if (this._onZoneExit) this._bus.off('world:zoneExited', this._onZoneExit);
    }
    this._onHazardEnter = this._onHazardExit = this._onZoneEnter = this._onZoneExit = null;
  },
};

export default HAZARD_LANGUAGE;
