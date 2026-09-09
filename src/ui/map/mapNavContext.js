// src/ui/map/mapNavContext.js — the "Never Lost" readout, as a pure module (Wave 2, Slice A).
//
// WHY THIS EXISTS
// ---------------
// The map-experience brief's first requirement is that the chart ALWAYS answers four questions,
// at every scale, in every sector, including empty deep space:
//
//     1. Where am I?              2. What am I tracking?
//     3. Where am I ultimately going?   4. What is the next reachable leg?
//
// Today the chart answers (1) only at LOCAL and SYSTEM, answers (2) only if a waypoint happens to
// be armed, and answers (3)/(4) nowhere at all. Worse, the four answers were derivable from four
// different places (`nav.waypoint`, `ui.trackedMissionId`, `nav.route`, `nav.executor`), so any
// consumer that wanted all four had to re-derive them and could disagree with the next consumer.
//
// This module derives all four ONCE, from one snapshot, so the chart cartouche, the framing
// controls and anything added later cannot contradict each other about where the player is.
//
// THE FRAME CONTRACT (ADR D2.1) — every coordinate in and out of this module is GLOBAL
// (`global_v1`). There is no `drawPos` here and there must never be one: this module produces
// ADDRESSES and DISTANCES, which are actionable-frame concepts. Projection is somebody else's job.
//
// D9.9 COMPLIANCE — this module deliberately returns a small, FIXED set of rows rather than an
// open-ended list of "things worth showing". The reported density paradox ("too little useful
// information, yet crowded") is a progressive-disclosure failure, and a readout that grows a row
// per feature is how that failure gets rebuilt. Four rows, always the same four, always present,
// each one either answering its question or saying plainly that it has no answer.
//
// PURITY — no DOM, no canvas, no import of galaxyMap.js, no module-level mutable state. Inputs are
// never mutated. Unit-testable under `node --test` with no browser.

import {
  resolveDeepSpaceAddress,
  formatAddressLabel,
} from '../../core/deepSpaceAddress.js';
import { frameBoth, framePreset, MAP_PRESET_SPAN_WU } from './mapCamera.js';
import { sectorGlobalOrigin } from '../../data/sectorCoordinates.js';

export const MAP_NAV_CONTEXT_SCHEMA = 'map_nav_context_v1';

/**
 * The four questions, in fixed order. Exported so the draw site cannot invent a fifth row or
 * reorder them, and so a test can assert the set is exactly this.
 */
export const NAV_CONTEXT_ROW_KEYS = Object.freeze(['location', 'objective', 'destination', 'leg']);

/**
 * Row tone. Deliberately NOT a colour — the identity reserves bright gold for the tracked
 * objective and the active route, and "never rely on colour alone" is a hard constraint. The draw
 * site maps tone to colour AND to line weight/glyph, so the rows stay distinguishable in
 * forced-colors and for colour-blind players.
 */
export const NAV_ROW_TONE = Object.freeze({
  /** Neutral fact. Ink, no accent. */
  PLAIN: 'plain',
  /** The tracked objective or the active route — the ONLY tone allowed to spend bright gold. */
  TRACKED: 'tracked',
  /** Present but not actionable — dimmed ink plus an explicit reason. */
  MUTED: 'muted',
});

// ---------------------------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------------------------

function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hasXZ(p) {
  return !!p && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z));
}

function readXZ(p) {
  return hasXZ(p) ? { x: Number(p.x), z: Number(p.z) } : null;
}

function distanceWU(a, b) {
  if (!a || !b) return null;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/**
 * Distance for display. Whole WU below 10k, then thousands with one decimal — a surveyor's table
 * does not print six significant figures for a number the pilot reads at a glance.
 */
export function formatDistanceWU(wu) {
  if (!Number.isFinite(wu)) return '—';
  const v = Math.abs(wu);
  if (v < 10000) return `${Math.round(v)} WU`;
  return `${(v / 1000).toFixed(1)}k WU`;
}

function sectorDisplayName(sectorId, sectorNames) {
  if (!sectorId) return null;
  if (sectorNames && typeof sectorNames.get === 'function') {
    const found = sectorNames.get(sectorId);
    if (found) return String(found);
  }
  if (sectorNames && typeof sectorNames === 'object' && sectorNames[sectorId]) {
    return String(sectorNames[sectorId]);
  }
  return String(sectorId);
}

// ---------------------------------------------------------------------------------------------
// Row copy
// ---------------------------------------------------------------------------------------------

/**
 * The DESTINATION detail line.
 *
 * Three genuinely different states, three different sentences. The one that matters is the middle
 * one: a contract destination with no course laid must say BOTH where you are going and that
 * nothing is plotted, or the row reads as a plotted route and the pilot wonders why the ribbon is
 * empty.
 */
function destinationDetail(destination) {
  if (!destination) return 'Accept a contract or double-click a sector to set one';
  if (destination.planned) {
    const n = destination.legCount;
    return `${destination.legsRemaining} of ${n} leg${n === 1 ? '' : 's'} remaining`;
  }
  if (destination.unreachable) {
    // Never a silent absence: the row states the blocker rather than leaving a dash.
    return 'Contract destination · no charted route from here yet';
  }
  const n = destination.legCount;
  return `Contract destination · ${n} leg${n === 1 ? '' : 's'} when plotted`;
}

/**
 * What NEXT LEG says when there is no leg to name.
 *
 * Deliberately still the bare placeholder "None". A destination we cannot path to has no next leg,
 * and dressing that up as an answer would be exactly the fake-success this readout exists to
 * prevent — the reason belongs in the detail line, where it does not masquerade as a leg.
 */
function nextLegAbsentValue() {
  return 'None';
}

function nextLegDetail(nextLeg, destination) {
  if (!nextLeg) {
    if (destination && destination.unreachable) return 'No charted path — survey the space between first';
    if (destination && !destination.planned) return 'Plot the course to resolve its legs';
    return '';
  }
  const where = Number.isFinite(nextLeg.distanceWU)
    ? `${formatDistanceWU(nextLeg.distanceWU)} · leg ${nextLeg.index + 1}/${nextLeg.count}`
    : `leg ${nextLeg.index + 1}/${nextLeg.count}`;
  // The preview is an estimate until it is plotted, and says so.
  return nextLeg.planned ? where : `${where} · previewed, not plotted`;
}

// ---------------------------------------------------------------------------------------------
// The readout
// ---------------------------------------------------------------------------------------------

/**
 * Resolve the four always-present navigation facts.
 *
 * Inputs are passed explicitly rather than dug out of `state` so this module stays independent of
 * the 7,000-line map screen and unit-testable without one. The caller (galaxyMap.js) already owns
 * `playerEntity` / `activeMapGoal` / `currentSectorId` and hands their results in.
 *
 * @param {{
 *   playerGlobal?: {x:number,z:number}|null,
 *   playerSectorId?: string|null,
 *   goal?: {label?:string, pos?:{x:number,z:number}|null, sectorId?:string|null, markerKind?:string}|null,
 *   route?: {legs?:Array<{from:string,to:string}>}|null,
 *   executor?: {status?:string, engaged?:boolean, legIndex?:number, legCount?:number,
 *               destinationSectorId?:string|null, legLabel?:string|null,
 *               legFrom?:string|null, legTo?:string|null}|null,
 *   missionDestination?: {sectorId?:string|null, stationId?:string|null, label?:string|null,
 *                         missionId?:string|null}|null,
 *   previewRoute?: {legs?:Array<{from:string,to:string}>, totalFuel?:number}|null,
 *   sectorNames?: Map<string,string>|Record<string,string>|null,
 *   atlas?: object|null,
 * }} [input]
 * @returns {Readonly<object>} never null; `rows` is always exactly NAV_CONTEXT_ROW_KEYS.length long
 */
export function resolveMapNavContext(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const playerGlobal = readXZ(src.playerGlobal);
  const sectorNames = src.sectorNames || null;

  // ---- 1. WHERE AM I -------------------------------------------------------------------------
  // Delegated wholesale to the addressing module. Re-deriving it here is explicitly forbidden by
  // the packet and would reintroduce exactly the disagreement D4 exists to remove: the HUD and the
  // chart must consume the SAME string.
  const address = playerGlobal
    ? resolveDeepSpaceAddress(playerGlobal, src.atlas ? { atlas: src.atlas } : {})
    : null;
  const locationLabel = address ? formatAddressLabel(address) : 'POSITION UNKNOWN';

  // ---- 2. WHAT AM I TRACKING ----------------------------------------------------------------
  const goal = src.goal && typeof src.goal === 'object' ? src.goal : null;
  const goalPos = goal ? readXZ(goal.pos) : null;
  const objective = goal
    ? Object.freeze({
      label: String(goal.label || 'Tracked objective').trim() || 'Tracked objective',
      globalPos: goalPos ? Object.freeze({ x: goalPos.x, z: goalPos.z }) : null,
      sectorId: goal.sectorId || null,
      sectorName: sectorDisplayName(goal.sectorId, sectorNames),
      markerKind: goal.markerKind || 'navigation',
      // A goal in another sector has a sector but no local fix — the distance is honestly null
      // rather than a fabricated number measured to a position that does not exist.
      distanceWU: goalPos && playerGlobal ? distanceWU(playerGlobal, goalPos) : null,
    })
    : null;

  // ---- 3. WHERE AM I ULTIMATELY GOING --------------------------------------------------------
  //
  // THE "NEVER LOST" CONTRACT DOES NOT START AT THE PLOT. This originally answered only from
  // `nav.route` / `nav.executor`, so a pilot carrying an accepted cargo contract — who knows
  // perfectly well where they are going, and whose station screen already told them — opened the
  // chart and read "No route plotted / None". The chart was the one surface in the game that did
  // not know the destination it exists to help you reach.
  //
  // So the destination resolves from a PLOTTED route first (it is the committed answer and
  // outranks intent), and falls back to the accepted contract's own destination. The fallback is
  // labelled as such and never dressed up as a plotted route: `planned` is false, the tone stays
  // PLAIN (bright gold is reserved for the tracked objective and the ACTIVE route), and the detail
  // row says in words that no course is laid yet.
  const route = src.route && typeof src.route === 'object' ? src.route : null;
  const plottedLegs = route && Array.isArray(route.legs) ? route.legs.filter(Boolean) : [];
  const executor = src.executor && typeof src.executor === 'object' ? src.executor : null;

  // A non-committal planner preview toward the mission destination. It is DISPLAY-ONLY: this
  // module never writes `nav.route`, and the caller must not either — auto-plotting on map open
  // would collapse the plot/engage separation ADR D6 makes unqualified.
  const preview = src.previewRoute && typeof src.previewRoute === 'object' ? src.previewRoute : null;
  const previewLegs = preview && Array.isArray(preview.legs) ? preview.legs.filter(Boolean) : [];

  const missionDest = src.missionDestination && typeof src.missionDestination === 'object'
    ? src.missionDestination
    : null;
  const missionDestSectorId = missionDest && missionDest.sectorId ? String(missionDest.sectorId) : null;

  const plottedDestSectorId = (executor && executor.destinationSectorId)
    || (plottedLegs.length ? plottedLegs[plottedLegs.length - 1].to : null)
    || null;
  const destSectorId = plottedDestSectorId || missionDestSectorId;
  const planned = !!plottedDestSectorId;

  // The legs that answer "next leg". Plotted legs are truth; preview legs are intent, and are used
  // only when there is no plotted route AND the preview actually leads to the destination we are
  // reporting — a stale preview aimed somewhere else is worse than no answer.
  const previewUsable = !planned
    && previewLegs.length > 0
    && !!missionDestSectorId
    && previewLegs[previewLegs.length - 1].to === missionDestSectorId;
  const legs = planned ? plottedLegs : (previewUsable ? previewLegs : []);

  let destination = null;
  if (destSectorId) {
    const origin = sectorGlobalOrigin(destSectorId);
    const destGlobal = origin && Number.isFinite(origin.x)
      ? { x: origin.x, z: origin.z }
      : null;
    const legIndex = planned && executor && Number.isFinite(executor.legIndex) ? executor.legIndex : 0;
    const legCount = planned && executor && Number.isFinite(executor.legCount) && executor.legCount > 0
      ? executor.legCount
      : legs.length;
    destination = Object.freeze({
      sectorId: destSectorId,
      sectorName: sectorDisplayName(destSectorId, sectorNames),
      globalPos: destGlobal ? Object.freeze({ x: destGlobal.x, z: destGlobal.z }) : null,
      distanceWU: destGlobal && playerGlobal ? distanceWU(playerGlobal, destGlobal) : null,
      legCount,
      // Remaining counts the leg you are ON as remaining — you have not finished it yet. An
      // itinerary that reads "0 legs remaining" while the ship is still flying is a lie the pilot
      // notices immediately.
      legsRemaining: Math.max(0, legCount - legIndex),
      engaged: !!(planned && executor && executor.engaged),
      status: (planned && executor && executor.status) || null,
      /** True only when a real course is laid. False means "this is where the contract sends you". */
      planned,
      source: planned ? 'route' : 'mission',
      missionId: !planned && missionDest ? (missionDest.missionId || null) : null,
      stationId: !planned && missionDest ? (missionDest.stationId || null) : null,
      /** Set when a mission destination is known but no charted path to it could be previewed. */
      unreachable: !planned && !previewUsable,
    });
  }

  // ---- 4. WHAT IS THE NEXT REACHABLE LEG -----------------------------------------------------
  let nextLeg = null;
  if (legs.length) {
    const idx = planned && executor && Number.isFinite(executor.legIndex)
      ? Math.max(0, Math.min(legs.length - 1, executor.legIndex))
      : 0;
    const leg = legs[idx];
    if (leg && leg.to) {
      const toOrigin = sectorGlobalOrigin(leg.to);
      const toGlobal = toOrigin && Number.isFinite(toOrigin.x)
        ? { x: toOrigin.x, z: toOrigin.z }
        : null;
      nextLeg = Object.freeze({
        index: idx,
        count: legs.length,
        fromSectorId: leg.from || null,
        toSectorId: leg.to,
        fromSectorName: sectorDisplayName(leg.from, sectorNames),
        toSectorName: sectorDisplayName(leg.to, sectorNames),
        label: (planned && executor && executor.legLabel)
          || `${sectorDisplayName(leg.from, sectorNames)} → ${sectorDisplayName(leg.to, sectorNames)}`,
        globalPos: toGlobal ? Object.freeze({ x: toGlobal.x, z: toGlobal.z }) : null,
        distanceWU: toGlobal && playerGlobal ? distanceWU(playerGlobal, toGlobal) : null,
        /** False when this leg comes from the preview rather than from a laid course. */
        planned,
      });
    }
  }

  // ---- Rows ----------------------------------------------------------------------------------
  // Always four, always in NAV_CONTEXT_ROW_KEYS order, `value` never empty. An absent answer says
  // so in words — "None tracked" — because a blank row reads as a broken instrument, and the whole
  // point of this readout is that the chart never looks broken in empty space.
  const rows = [
    Object.freeze({
      key: 'location',
      label: 'POSITION',
      value: locationLabel,
      detail: address && address.kind === 'transit' && address.transit
        ? `${formatDistanceWU(address.transit.remainingWU)} to ${address.transit.to.callSign}`
        : (address && Number.isFinite(address.distanceFromOriginWU)
          ? `${formatDistanceWU(address.distanceFromOriginWU)} from origin`
          : ''),
      tone: NAV_ROW_TONE.PLAIN,
    }),
    Object.freeze({
      key: 'objective',
      label: 'TRACKING',
      value: objective ? objective.label : 'None tracked',
      detail: objective
        ? (Number.isFinite(objective.distanceWU)
          ? formatDistanceWU(objective.distanceWU)
          : (objective.sectorName ? `in ${objective.sectorName}` : ''))
        : 'Select a mission or mark to track it',
      tone: objective ? NAV_ROW_TONE.TRACKED : NAV_ROW_TONE.MUTED,
    }),
    Object.freeze({
      key: 'destination',
      label: 'DESTINATION',
      value: destination ? destination.sectorName : 'No route plotted',
      detail: destinationDetail(destination),
      // Gold is reserved for the tracked objective and the ACTIVE route. A contract destination
      // that nobody has plotted a course to yet is a plain fact, not a live course, so it reads in
      // ink — and the detail line, not the colour, is what says which of the two it is.
      tone: destination
        ? (destination.planned ? NAV_ROW_TONE.TRACKED : NAV_ROW_TONE.PLAIN)
        : NAV_ROW_TONE.MUTED,
    }),
    Object.freeze({
      key: 'leg',
      label: 'NEXT LEG',
      value: nextLeg ? nextLeg.label : nextLegAbsentValue(destination),
      detail: nextLegDetail(nextLeg, destination),
      tone: nextLeg
        ? (nextLeg.planned ? NAV_ROW_TONE.TRACKED : NAV_ROW_TONE.PLAIN)
        : NAV_ROW_TONE.MUTED,
    }),
  ];

  return Object.freeze({
    schema: MAP_NAV_CONTEXT_SCHEMA,
    playerGlobal: playerGlobal ? Object.freeze({ x: playerGlobal.x, z: playerGlobal.z }) : null,
    playerSectorId: src.playerSectorId || (address ? address.sectorId : null) || null,
    address,
    locationLabel,
    objective,
    destination,
    nextLeg,
    rows: Object.freeze(rows),
  });
}

// ---------------------------------------------------------------------------------------------
// Framing controls
// ---------------------------------------------------------------------------------------------

/**
 * "Return to ship" and "Frame ship and destination".
 *
 * Both are resolved as {available, reason, framing} rather than as functions, because the brief's
 * fourth requirement is absolute: an unavailable action must be VISIBLY unavailable and must
 * EXPLAIN WHY. Returning a no-op closure would let the draw site render an enabled-looking button
 * that silently does nothing — the exact failure being legislated against. A caller cannot render
 * these without also having the reason string in hand.
 *
 * `framing` is a DESCRIPTOR ({focusGlobal, spanWU}), never a camera — same convention as
 * `framePreset`/`frameBoth` in mapCamera.js, so the draw site owns camera application.
 *
 * @param {ReturnType<typeof resolveMapNavContext>} context
 * @param {{marginFactor?:number, minSpanWU?:number, maxSpanWU?:number}} [opts]
 */
export function resolveMapFramingActions(context, opts = {}) {
  const ctx = context && typeof context === 'object' ? context : null;
  const player = ctx ? readXZ(ctx.playerGlobal) : null;

  const returnToShip = player
    ? {
      id: 'return-to-ship',
      label: 'Return to ship',
      available: true,
      reason: 'Centre the chart on your ship',
      framing: framePreset('local', { playerGlobal: player, sectorId: ctx.playerSectorId }),
    }
    : {
      id: 'return-to-ship',
      label: 'Return to ship',
      available: false,
      // Not "unavailable" — WHY. The player has no ship entity, which happens between a death and
      // a respawn and while a save is loading, and is worth saying out loud.
      reason: 'No ship position available yet',
      framing: null,
    };

  // "Frame ship and destination" prefers the tracked objective's actual fix over the route's
  // terminal sector origin: the objective is the thing the pilot opened the chart to find, and a
  // sector origin can be thousands of WU from the station inside it.
  let far = null;
  let farLabel = '';
  if (ctx && ctx.objective && ctx.objective.globalPos) {
    far = readXZ(ctx.objective.globalPos);
    farLabel = ctx.objective.label;
  } else if (ctx && ctx.destination && ctx.destination.globalPos) {
    far = readXZ(ctx.destination.globalPos);
    farLabel = ctx.destination.sectorName || ctx.destination.sectorId;
  } else if (ctx && ctx.nextLeg && ctx.nextLeg.globalPos) {
    far = readXZ(ctx.nextLeg.globalPos);
    farLabel = ctx.nextLeg.toSectorName || ctx.nextLeg.toSectorId;
  }

  let frameShipAndDestination;
  if (!player) {
    frameShipAndDestination = {
      id: 'frame-both',
      label: 'Frame ship + destination',
      available: false,
      reason: 'No ship position available yet',
      framing: null,
    };
  } else if (!far) {
    frameShipAndDestination = {
      id: 'frame-both',
      label: 'Frame ship + destination',
      available: false,
      reason: 'Nothing tracked — plot a route or track a mission first',
      framing: null,
    };
  } else {
    frameShipAndDestination = {
      id: 'frame-both',
      label: 'Frame ship + destination',
      available: true,
      reason: `Fit your ship and ${farLabel} in one view`,
      framing: frameBoth(player, far, {
        marginFactor: finite(opts && opts.marginFactor, 1.35),
        minSpanWU: opts && opts.minSpanWU !== undefined ? opts.minSpanWU : undefined,
        maxSpanWU: opts && opts.maxSpanWU !== undefined ? opts.maxSpanWU : undefined,
      }),
    };
  }

  // A degenerate frameBoth (ship and target coincident) would clamp to the minimum span and read
  // as an unexplained slam to maximum zoom. Floor it at the LOCAL preset so "frame both" always
  // produces a legible chart even when both marks are the same point.
  if (frameShipAndDestination.framing
    && frameShipAndDestination.framing.spanWU < MAP_PRESET_SPAN_WU.local) {
    frameShipAndDestination = {
      ...frameShipAndDestination,
      framing: {
        focusGlobal: frameShipAndDestination.framing.focusGlobal,
        spanWU: MAP_PRESET_SPAN_WU.local,
      },
    };
  }

  return Object.freeze({
    schema: MAP_NAV_CONTEXT_SCHEMA,
    order: Object.freeze(['return-to-ship', 'frame-both']),
    returnToShip: Object.freeze(returnToShip),
    frameShipAndDestination: Object.freeze(frameShipAndDestination),
  });
}
