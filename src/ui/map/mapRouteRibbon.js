// src/ui/map/mapRouteRibbon.js — the route ribbon, as a pure model (Wave 2, Slice C).
//
// WHY THIS EXISTS
// ---------------
// The map-experience brief asks the chart to show, for a plotted or flying route: its legs, the
// resources it will cost, where it can be interrupted, and where it arrives. Those facts already
// exist in state and were simply never assembled: `world.computeRoute` returns per-leg
// `{from, to, fuel, charge, interdict}` plus `totalFuel`/`totalHops` (`world.js:2168`), and
// `routeFollower` owns live progress in `nav.executor` (`status`, `legIndex`, `legs[]`).
//
// This module joins the two — the PLAN and the EXECUTION — into one frozen record so the ribbon,
// the inspector's Travel tab and anything added later cannot disagree about which leg is live.
//
// ─── THE TWO RULES THIS MODULE EXISTS TO ENFORCE ──────────────────────────────────────────────
//
// 1. **CONTEXTUAL, NOT PERMANENT (ADR D9.9).** `visible` is false whenever there is no route. The
//    ribbon is an instrument that appears exactly when its information becomes load-bearing and
//    goes away again — the ruling D5 Amendment 2 reached for the velocity tape, applied here. A
//    ribbon that is always on screen is a new permanent panel with extra steps, and the reported
//    density paradox ("too little useful information, yet crowded") gets worse, not better.
//
// 2. **NEVER FAKE AN ACTION.** Every action carries `available` + a populated `reason` + the bus
//    event that will actually fire. An action with no runtime consumer is reported UNAVAILABLE
//    with the reason saying so — it is never rendered as an enabled control that does nothing.
//    Concretely: `routeFollower` subscribes to `nav:engageRoute` and `nav:abortRoute` and to
//    NOTHING ELSE, so engage / resume / disengage are real and **pause is not**. Pause therefore
//    ships permanently unavailable, explaining that disengage-then-resume is the shipped
//    equivalent (an interrupted executor keeps its legs and its legIndex, so resuming picks the
//    same trip up on the same leg — `routeFollower.engage`'s resume branch).
//
// ─── HONEST ETA ───────────────────────────────────────────────────────────────────────────────
// There is no route-wide time-of-arrival anywhere in state, and inventing one would be exactly the
// fabricated field this packet is forbidden to ship. Two REAL time facts are published instead:
//   * `eta` — time to the next waypoint AT THE SHIP'S CURRENT SPEED. A standard instrument
//     reading, derived from a real distance and a real velocity. When the ship is not making way
//     the estimate is genuinely undefined, so it reports `available:false` with a reason rather
//     than a number.
//   * `totals.chargeS` — the summed authored `charge` (jump align time) of the remaining legs.
//     Real authored seconds, labelled as align time, never passed off as trip time.
//
// THE FRAME CONTRACT (ADR D2.1): every coordinate in and out of here is GLOBAL (`global_v1`).
// There is no `drawPos` in this module and there must never be one — distances and addresses are
// actionable-frame concepts. Projection is the draw site's job.
//
// PURITY — no DOM, no canvas, no import of galaxyMap.js, no module-level mutable state, inputs
// never mutated. Unit-testable under `node --test` with no browser. Deliberately NOT reachable
// from `scripts/sf-sim.mjs`'s import graph, so it is structurally incapable of moving the 47a
// golden.

import { formatDistanceWU } from './mapNavContext.js';

export const MAP_ROUTE_RIBBON_SCHEMA = 'map_route_ribbon_v1';

/** Per-leg progress state. Non-colour semantics: the draw site maps these to glyph and line style
 *  as well as tone, so the ribbon still reads in forced-colors and for colour-blind players. */
export const RIBBON_LEG_STATE = Object.freeze({
  /** Flown. */
  DONE: 'done',
  /** The leg the executor is on right now. */
  ACTIVE: 'active',
  /** Not yet started. */
  AHEAD: 'ahead',
});

/** Interdiction bands. A WORD, not a colour — `interdict` is an authored probability and the
 *  identity forbids relying on hue alone. */
export const RIBBON_HAZARD = Object.freeze({
  CALM: 'calm',
  WATCHED: 'watched',
  CONTESTED: 'contested',
});

/** Action order, fixed so the draw site cannot reorder or invent a fifth control. */
export const RIBBON_ACTION_IDS = Object.freeze(['engage', 'pause', 'resume', 'disengage']);

/** Speed below which a time-to-waypoint estimate is meaningless rather than merely large. */
const ETA_MIN_SPEED_WU_S = 1;

/** Interdiction thresholds. Authored `interdict` is a 0..1 chance (`world._interdictChance`). */
const HAZARD_WATCHED_AT = 0.15;
const HAZARD_CONTESTED_AT = 0.35;

function finite(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function hasXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function distanceWU(a, b) {
  if (!hasXZ(a) || !hasXZ(b)) return null;
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Look a sector name up out of either a Map or a plain object; fall back to the raw id. */
function sectorName(names, id) {
  if (!id) return '';
  if (names && typeof names.get === 'function') {
    const hit = names.get(id);
    if (hit) return String(hit);
  } else if (names && typeof names === 'object') {
    const hit = names[id];
    if (hit) return String(hit);
  }
  return String(id);
}

export function hazardBandFor(interdict) {
  const p = finite(interdict, 0);
  if (p >= HAZARD_CONTESTED_AT) return RIBBON_HAZARD.CONTESTED;
  if (p >= HAZARD_WATCHED_AT) return RIBBON_HAZARD.WATCHED;
  return RIBBON_HAZARD.CALM;
}

/** Plain-language hazard label. Text, so the band never depends on colour to be understood. */
export function hazardLabelFor(band) {
  if (band === RIBBON_HAZARD.CONTESTED) return 'Contested';
  if (band === RIBBON_HAZARD.WATCHED) return 'Watched';
  return 'Calm';
}

/** `137` -> `2m 17s`. Seconds only below a minute; never returns a bare number. */
export function formatDurationS(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function makeAction(id, label, available, reason, event) {
  return Object.freeze({ id, label, available: !!available, reason, event: available ? event : null });
}

/**
 * Resolve the ribbon's actions from real executor status.
 *
 * Availability comes from what `routeFollower` actually subscribes to, never from what would make
 * a tidy button row. The follower's `init` binds exactly `nav:engageRoute` and `nav:abortRoute`.
 */
function resolveRibbonActions(hasRoute, status, engaged) {
  const live = !!status && status !== 'idle' && status !== 'arrived';

  const engage = !hasRoute
    ? makeAction('engage', 'Engage', false, 'No route plotted — set a course to a sector first', 'nav:engageRoute')
    : live
      ? makeAction('engage', 'Engage', false, 'Already engaged — use Disengage to hand control back', 'nav:engageRoute')
      : makeAction('engage', 'Engage', true, 'Hand the plotted route to the route follower', 'nav:engageRoute');

  // PAUSE HAS NO RUNTIME CONSUMER AND IS REPORTED AS SUCH. The route follower exposes engage and
  // abort; there is no hold-position verb. Shipping this as an enabled button that emits an event
  // nothing listens to is precisely the faked action this packet forbids, so it ships disabled
  // with the shipped equivalent named in the reason.
  const pause = makeAction(
    'pause',
    'Pause',
    false,
    'Pause is not a route-follower verb — Disengage keeps the itinerary and Resume picks it up on the same leg',
    null,
  );

  const resume = status === 'interrupted'
    ? makeAction('resume', 'Resume', true, 'Pick the itinerary up on the same leg', 'nav:engageRoute')
    : makeAction('resume', 'Resume', false,
      live ? 'Route is already running' : 'Nothing to resume — the route is not interrupted', 'nav:engageRoute');

  const disengage = live
    ? makeAction('disengage', 'Disengage', true, 'Hand control back to you — the itinerary is kept', 'nav:abortRoute')
    : makeAction('disengage', 'Disengage', false, 'No route is being flown', 'nav:abortRoute');

  return Object.freeze({ order: RIBBON_ACTION_IDS, engage, pause, resume, disengage });
}

/**
 * Build the ribbon record.
 *
 * @param {object} [input]
 * @param {object|null} [input.route]        `nav.route` — `{legs:[{from,to,fuel,charge,interdict}], totalFuel, totalHops}`
 * @param {object|null} [input.executor]     the map's executor adapter output (`readRouteExecutorForMap`)
 * @param {{x:number,z:number}|null} [input.playerGlobal]
 * @param {number} [input.playerSpeedWUs]    current ship speed, for an honest at-current-speed ETA
 * @param {Map|object|null} [input.sectorNames]
 * @returns {Readonly<object>} never null
 */
export function resolveRouteRibbon(input = {}) {
  const src = input || {};
  const route = src.route && typeof src.route === 'object' ? src.route : null;
  const executor = src.executor && typeof src.executor === 'object' ? src.executor : null;
  const names = src.sectorNames || null;
  const playerGlobal = hasXZ(src.playerGlobal) ? { x: src.playerGlobal.x, z: src.playerGlobal.z } : null;
  const speed = finite(src.playerSpeedWUs, 0);

  const status = executor && executor.status ? String(executor.status) : null;
  const engaged = !!(executor && executor.engaged);
  const live = !!status && status !== 'idle' && status !== 'arrived';

  // The PLAN. Prefer the executor's own decomposed legs once it exists — those are the legs
  // actually being flown, and they carry resolved targets — but keep the planned legs as the
  // source of fuel/charge/interdict, which the executor does not copy.
  const planLegs = route && Array.isArray(route.legs) ? route.legs : [];
  const execLegs = executor && Array.isArray(executor.legs) ? executor.legs : [];
  const legCount = Math.max(planLegs.length, execLegs.length,
    Number.isFinite(executor && executor.legCount) ? executor.legCount : 0);

  const hasRoute = legCount > 0;
  const actions = resolveRibbonActions(hasRoute, status, engaged);

  if (!hasRoute) {
    // CONTEXTUAL: no route, no ribbon. The reason is still published so a caller that wants to
    // explain the absence (the Travel tab does) has words to use rather than rendering a blank.
    return Object.freeze({
      schema: MAP_ROUTE_RIBBON_SCHEMA,
      visible: false,
      reason: 'No route plotted. Set a course to a sector to plan one.',
      status,
      engaged: false,
      live: false,
      legs: Object.freeze([]),
      activeLegIndex: -1,
      destination: null,
      arrival: null,
      totals: Object.freeze({ legs: 0, legsRemaining: 0, fuel: 0, fuelRemaining: 0, chargeS: 0 }),
      nextWaypoint: null,
      eta: Object.freeze({ available: false, seconds: null, label: '—', reason: 'No route plotted' }),
      interruption: null,
      actions,
    });
  }

  const activeLegIndex = live && Number.isFinite(executor && executor.legIndex)
    ? Math.max(0, Math.min(legCount - 1, executor.legIndex))
    : -1;

  const legs = [];
  let fuelRemaining = 0;
  let chargeRemaining = 0;
  let fuelTotal = 0;

  for (let i = 0; i < legCount; i++) {
    const plan = planLegs[i] || null;
    const exec = execLegs[i] || null;
    const fromSectorId = (plan && plan.from) || (exec && exec.fromSectorId) || null;
    const toSectorId = (plan && plan.to) || (exec && exec.toSectorId) || null;
    const fuel = finite(plan && plan.fuel, 0);
    const chargeS = finite(plan && plan.charge, 0);
    const interdict = finite(plan && plan.interdict, 0);
    const band = hazardBandFor(interdict);

    const state = activeLegIndex < 0
      ? RIBBON_LEG_STATE.AHEAD
      : i < activeLegIndex
        ? RIBBON_LEG_STATE.DONE
        : i === activeLegIndex
          ? RIBBON_LEG_STATE.ACTIVE
          : RIBBON_LEG_STATE.AHEAD;

    fuelTotal += fuel;
    if (state !== RIBBON_LEG_STATE.DONE) {
      fuelRemaining += fuel;
      chargeRemaining += chargeS;
    }

    legs.push(Object.freeze({
      index: i,
      state,
      fromSectorId,
      toSectorId,
      fromName: sectorName(names, fromSectorId),
      toName: sectorName(names, toSectorId),
      // The executor's label names the physical object being flown to (a gate); the plan only
      // knows sectors. Prefer the concrete one when the executor has decomposed the leg.
      label: (exec && exec.label) || (toSectorId ? sectorName(names, toSectorId) : `Leg ${i + 1}`),
      fuel,
      chargeS,
      interdict,
      hazard: band,
      hazardLabel: hazardLabelFor(band),
      // `resolved:false` means the atlas found no flyable endpoint for this leg. Surfacing it lets
      // the ribbon warn BEFORE the follower turns it into an interruption.
      resolved: exec ? exec.resolved !== false : true,
      target: exec && hasXZ(exec.target) ? Object.freeze({ x: exec.target.x, z: exec.target.z }) : null,
    }));
  }

  const finalLeg = legs[legs.length - 1] || null;
  const destinationSectorId = (executor && executor.destinationSectorId)
    || (finalLeg && finalLeg.toSectorId)
    || null;

  const activeLeg = activeLegIndex >= 0 ? legs[activeLegIndex] : null;

  // NEXT WAYPOINT — the concrete thing the ship is flying at right now, in the global frame.
  let nextWaypoint = null;
  if (activeLeg) {
    const target = activeLeg.target
      || (hasXZ(executor && executor.legTarget) ? { x: executor.legTarget.x, z: executor.legTarget.z } : null);
    if (target) {
      const d = distanceWU(playerGlobal, target);
      nextWaypoint = Object.freeze({
        label: activeLeg.label,
        sectorId: activeLeg.toSectorId,
        globalPos: Object.freeze({ x: target.x, z: target.z }),
        distanceWU: d,
        distanceLabel: d == null ? '—' : formatDistanceWU(d),
      });
    } else {
      nextWaypoint = Object.freeze({
        label: activeLeg.label,
        sectorId: activeLeg.toSectorId,
        globalPos: null,
        distanceWU: null,
        distanceLabel: '—',
      });
    }
  }

  // ETA — real distance over real speed, or an explicit refusal. Never a fabricated number.
  let eta;
  if (!activeLeg) {
    eta = { available: false, seconds: null, label: '—', reason: 'Engage the route to estimate arrival' };
  } else if (!nextWaypoint || nextWaypoint.distanceWU == null) {
    eta = { available: false, seconds: null, label: '—', reason: 'Next waypoint has no resolved position' };
  } else if (speed < ETA_MIN_SPEED_WU_S) {
    eta = { available: false, seconds: null, label: '—', reason: 'Hold way on to estimate — the ship is not making speed' };
  } else {
    const seconds = nextWaypoint.distanceWU / speed;
    eta = {
      available: true,
      seconds,
      label: formatDurationS(seconds),
      reason: 'To next waypoint at current speed',
    };
  }

  const interruption = status === 'interrupted'
    ? Object.freeze({
      active: true,
      reason: (executor && executor.interruptReason) ? String(executor.interruptReason) : 'unknown',
      label: (executor && executor.interruptReason)
        ? `Interrupted — ${String(executor.interruptReason).replace(/[-_]+/g, ' ')}`
        : 'Interrupted',
      // Interruption never orphans an itinerary: the executor keeps its legs and its legIndex.
      resumable: true,
    })
    : null;

  const legsRemaining = activeLegIndex < 0 ? legCount : legCount - activeLegIndex;

  return Object.freeze({
    schema: MAP_ROUTE_RIBBON_SCHEMA,
    visible: true,
    // An INTERRUPTED executor is technically still "live" (it is neither idle nor arrived, and it
    // keeps its legs so it can resume), but reporting it as "Flying leg 2 of 2" would be a plain
    // lie to the pilot — the ship is not flying it. Interruption owns the headline.
    reason: interruption
      ? `${interruption.label} — leg ${activeLegIndex + 1} of ${legCount}`
      : live
        ? `Flying leg ${activeLegIndex + 1} of ${legCount}`
        : `${legCount} leg${legCount === 1 ? '' : 's'} plotted — not engaged`,
    status,
    engaged,
    live,
    legs: Object.freeze(legs),
    activeLegIndex,
    destination: destinationSectorId
      ? Object.freeze({ sectorId: destinationSectorId, name: sectorName(names, destinationSectorId) })
      : null,
    arrival: finalLeg
      ? Object.freeze({
        sectorId: finalLeg.toSectorId,
        name: finalLeg.toName,
        label: `Arrive ${finalLeg.toName}`,
      })
      : null,
    totals: Object.freeze({
      legs: legCount,
      legsRemaining,
      fuel: finite(route && route.totalFuel, fuelTotal),
      fuelRemaining,
      chargeS: chargeRemaining,
      chargeLabel: formatDurationS(chargeRemaining),
    }),
    nextWaypoint,
    eta: Object.freeze(eta),
    interruption,
    actions,
  });
}
