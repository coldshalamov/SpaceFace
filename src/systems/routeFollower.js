// Route follower — the reader `state.nav.autoTravel` never had (ledger RC-5, ADR D6).
//
// WHAT THIS IS: a SEQUENCER. It owns `state.nav.route`, decomposes it into legs, and delegates every
// actual control authority to a controller that already exists and is already green:
//   • terminal approach within a sector  -> the LOCAL AUTOPILOT (`state.nav.autopilot`, flown by
//     flightV3.resolveAutopilotInput / flight.js). It has public dock receipts: five successes, one
//     on a clean checkout, 96 s to station_helios at 154 WU closest approach. It is not replaced.
//   • transit                            -> the travel drive, through the adapter seam at the bottom
//     of this file. Packet W1-A owns that system; this file never imports it.
//   • sector transitions                 -> the existing gate handoff, observed via `sector:enter`.
//
// WHAT THIS IS NOT — and the reason ADR D6 is binding: there is NO STEERING MATH in this file. No
// pursuit solver, no PID, no guidance vector, no thrust command. Search this file for `Math.atan2`,
// `throttle` or `turn` and you will find none. Every number here is a DISTANCE COMPARISON used to
// decide *which controller owns the ship right now*. If a future edit adds a control law here, that
// edit is in the wrong file — it belongs in the propulsion kernel or the autopilot.
//
// ─── The two facts that shaped this design ────────────────────────────────────────────────────────
//
// 1. `nav.autoTravel` is the PLOT gate, NOT the engage signal. `world._onSetCourse` sets it true the
//    moment a route is plotted (`world.js:2096`), and `test/m2-map-cutover.test.mjs:351` pins that.
//    Product direction requires plot and engage to be SEPARATE actions, so autoTravel cannot mean
//    "go". It is a necessary precondition; `executor.engaged` is the sufficient one. Plotting a route
//    leaves `nav.executor` absent entirely, so update() early-returns and the ship does not move.
//
// 2. We must NOT arm legs through `ui:setCourse`. The pos-branch of `world._onSetCourse`
//    (`world.js:2071-2072`) NULLS `nav.route` and clears `nav.autoTravel` — arming a leg through it
//    would delete the very itinerary we are following, on the first leg, every time. So this system
//    writes `state.nav.autopilot` directly and emits `nav:waypoint` + `nav:autopilot` itself,
//    mirroring the payload shapes read from `_onSetCourse`. world.js stays untouched.
//
// ─── Delegation is EDGE-TRIGGERED, never level-triggered ──────────────────────────────────────────
//
// The autopilot is armed EXACTLY ONCE per leg, on the transition into that leg (`armedLegIndex`).
// This is load-bearing. flightV3's `stopAutopilot` sets `autopilot.active = false` when the player
// touches the stick ('manual') or the target evaporates ('lost-target'); it does not know this system
// exists. A level-triggered follower that re-armed every tick would re-arm on the tick after the
// player grabbed the controls, and the two would fight for the ship forever. Instead we OBSERVE
// `nav:autopilot`: 'arrived' advances the leg, 'manual'/'lost-target' funnels into the single
// interrupt() transition. Echoes of our own arm ('armed') are ignored.
//
// ─── Auto-brake: decide WHEN, delegate the STOP ───────────────────────────────────────────────────
//
// ADR D5 says the route follower auto-brakes (unlike a manual burn, where overshoot must stay
// possible) and flip-and-burns when `estimateBrakingSolution` reports it as `bestMode`. The local
// autopilot ALREADY flies a full terminal stop — `terminalBrake` / `counterVelocityInput` /
// `shouldBrake` at `flightV3.js:604-635`. Injecting brake input on top of that would be double
// control of one ship. So the auto-brake responsibility discharged here is the SEQUENCING half:
// consume `estimateBrakingSolution().bestMode` (already computed — never re-derived) to choose the
// HANDOFF RANGE, release the travel drive, and hand the ship to the autopilot while the stop is still
// achievable. `bestMode === 'flipBurn'` yields the longer flip-inclusive handoff distance, so the
// flip-and-burn has room to happen; the autopilot then flies it.
//
// Determinism: no Math.random, no Date.now. This system is absent from `scripts/sf-sim.mjs`'s curated
// systems array, so it cannot move the 47a golden (verified empirically with check:sim:compare).

import { buildAtlasIndex, gateNodeId } from '../core/atlasIndex.js';
import { estimateBrakingSolution } from '../core/flight/flightTelemetry.js';
import { resolvePropulsionProfile } from '../core/flight/propulsionCatalog.js';

export const ROUTE_EXECUTOR_SCHEMA = 'route_executor_v1';

/** The six executor states. `arrived` and `interrupted` are both terminal-for-now and both RESUMABLE:
 *  neither clears the itinerary, so a route is never orphaned. */
export const ROUTE_EXECUTOR_STATUS = Object.freeze({
  IDLE: 'idle',
  ACQUIRING: 'acquiring',
  TRANSITING: 'transiting',
  APPROACHING: 'approaching',
  ARRIVED: 'arrived',
  INTERRUPTED: 'interrupted',
});

/** Multiplier on the braking solution's stopping distance when choosing the transit->approach
 *  handoff. Above 1 so the autopilot inherits the ship with margin in hand rather than already
 *  behind the stop; the autopilot's own terminal logic then owns the actual deceleration. */
const HANDOFF_MARGIN = 1.35;

/** Floor on the handoff range. At low speed the braking solution is tiny, and handing off 20 WU from
 *  a gate would leave the follower "transiting" for a leg it has effectively already flown. */
const HANDOFF_MIN_WU = 900;

/** Arrival radius handed to the autopilot for a gate leg. Gates are large and the handoff only needs
 *  to put the ship in the transition volume, not park it on a hardpoint. Clamped by world's own
 *  12..500 band so it stays a legal autopilot payload. */
const GATE_ARRIVAL_RADIUS = 260;

/** Arrival radius for the final destination anchor — tighter, because this is where the player
 *  actually wants to be, not a doorway they are passing through. */
const DESTINATION_ARRIVAL_RADIUS = 180;

function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function hasXZ(p) {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

function playerEntity(state) {
  return state && state.entities && state.playerId ? state.entities.get(state.playerId) || null : null;
}

/**
 * Resolve one route leg to a canonical GLOBAL target position through the atlas.
 *
 * The atlas (`src/core/atlasIndex.js`) is the one module that composes authored sector-local anchors
 * into `global_v1`, which is the frame `nav.autopilot.target` is read in. This system is its first
 * production consumer — that is deliberate, and the conversion is NOT duplicated here.
 *
 * Preference order:
 *   1. the gate node in `from` that points at `to` — the physical object the ship actually flies to;
 *   2. the destination SECTOR node — used when the leg is a corridor (continuous free-flight
 *      geography, no gate authored) or when a gate carries no authored anchor.
 * A leg that resolves to neither has no flyable endpoint and is reported as unresolved; the caller
 * turns that into an `interrupted` executor rather than steering at a fabricated (0,0).
 */
function resolveLegTarget(atlas, fromSectorId, toSectorId, isFinal) {
  const gate = atlas.getNode(gateNodeId(fromSectorId, toSectorId));
  if (gate && gate.hasPosition) {
    return {
      targetNodeId: gate.id,
      targetKind: 'gate',
      target: { x: gate.globalPos.x, z: gate.globalPos.z },
      arrivalRadius: isFinal ? DESTINATION_ARRIVAL_RADIUS : GATE_ARRIVAL_RADIUS,
      label: gate.name || `Gate to ${toSectorId}`,
    };
  }
  const sector = atlas.getNode(toSectorId);
  if (sector && sector.hasPosition) {
    return {
      targetNodeId: sector.id,
      targetKind: 'sector',
      target: { x: sector.globalPos.x, z: sector.globalPos.z },
      arrivalRadius: isFinal ? DESTINATION_ARRIVAL_RADIUS : GATE_ARRIVAL_RADIUS,
      label: sector.name || toSectorId,
    };
  }
  return null;
}

/**
 * Decompose `nav.route` into ordered executor legs. Route legs are already sector-to-sector pairs
 * produced by world's Dijkstra (`world.js:2157-2168`), so leg ORDER is inherited, never recomputed —
 * re-planning here would be a second route planner competing with the shipped one.
 */
function decomposeRoute(route, atlas) {
  const source = route && Array.isArray(route.legs) ? route.legs : [];
  const legs = [];
  for (let i = 0; i < source.length; i++) {
    const leg = source[i];
    if (!leg || typeof leg.from !== 'string' || typeof leg.to !== 'string') continue;
    const isFinal = i === source.length - 1;
    const resolved = resolveLegTarget(atlas, leg.from, leg.to, isFinal);
    legs.push({
      index: legs.length,
      fromSectorId: leg.from,
      toSectorId: leg.to,
      final: isFinal,
      resolved: !!resolved,
      targetNodeId: resolved ? resolved.targetNodeId : null,
      targetKind: resolved ? resolved.targetKind : null,
      target: resolved ? resolved.target : null,
      arrivalRadius: resolved ? resolved.arrivalRadius : GATE_ARRIVAL_RADIUS,
      label: resolved ? resolved.label : `${leg.from} → ${leg.to}`,
    });
  }
  return legs;
}

function makeExecutor(legs, destinationSectorId) {
  return {
    schema: ROUTE_EXECUTOR_SCHEMA,
    status: ROUTE_EXECUTOR_STATUS.ACQUIRING,
    engaged: true,
    legIndex: 0,
    legs,
    destinationSectorId,
    // Edge-trigger bookkeeping: which leg the autopilot is currently armed for. null = not armed.
    armedLegIndex: null,
    interruptReason: null,
    brakeMode: null,
    handoffWU: null,
  };
}

/**
 * The public executor summary. Emitted on `nav:routeExecutor` at every transition so UI, HUD and the
 * acceptance harness read one shape instead of each reaching into the subtree.
 */
export function summarizeExecutor(executor) {
  if (!executor) {
    return { status: ROUTE_EXECUTOR_STATUS.IDLE, engaged: false, legIndex: 0, legCount: 0 };
  }
  const legs = Array.isArray(executor.legs) ? executor.legs : [];
  const leg = legs[executor.legIndex] || null;
  return {
    schema: ROUTE_EXECUTOR_SCHEMA,
    status: executor.status,
    engaged: executor.engaged === true,
    legIndex: executor.legIndex,
    legCount: legs.length,
    destinationSectorId: executor.destinationSectorId || null,
    legFrom: leg ? leg.fromSectorId : null,
    legTo: leg ? leg.toSectorId : null,
    legLabel: leg ? leg.label : null,
    interruptReason: executor.interruptReason || null,
    brakeMode: executor.brakeMode || null,
    resumable: !!legs.length && executor.status !== ROUTE_EXECUTOR_STATUS.ARRIVED,
  };
}

export const routeFollower = {
  name: 'routeFollower',

  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    // Built once. The atlas is a pure derived read model over authored data (ADR D2) — it does not
    // tick and it does not change at runtime, so rebuilding it per engage would be pure waste.
    this._atlas = ctx.atlas || buildAtlasIndex();
    // Guard against re-entrancy: we emit `nav:autopilot` when arming a leg, and we also SUBSCRIBE to
    // `nav:autopilot`. Without this the arm would immediately observe itself.
    this._emittingAutopilot = false;

    const bus = this.bus;
    if (!bus || typeof bus.on !== 'function') return;

    // ENGAGE is a distinct explicit act, separate from plotting (product direction, ADR D6).
    bus.on('nav:engageRoute', (p) => this.engage(p || {}));
    bus.on('nav:abortRoute', (p) => this.interrupt((p && p.reason) || 'manual', p || {}));

    // Observe the delegated controller rather than polling it — see the edge-trigger note above.
    bus.on('nav:autopilot', (p) => this._onAutopilot(p));

    // Gate handoff: crossing into the leg's destination sector completes that leg, whether the
    // transition came from a gate jump or continuous M2a geography.
    bus.on('sector:enter', (p) => this._onSectorEnter(p || {}));

    // Combat interrupts travel. Both seams are covered: a direct hit on the player, and the
    // encounter-level interdiction receipt.
    bus.on('combat:hit', (p) => this._onCombatHit(p));
    bus.on('combat:routeDamage', (p) => this._onCombatHit(p));

    // A restored save re-publishes the executor so UI that missed the transition is not left blank.
    bus.on('save:loaded', () => this._publish());
  },

  /**
   * Engage (or RESUME) the plotted route. Idempotent while already engaged.
   *
   * Resume semantics are why interruption never orphans an itinerary: an `interrupted` executor keeps
   * its legs and its legIndex, so engaging again picks up the same trip at the same leg instead of
   * re-planning from scratch and losing the player's progress.
   */
  engage(payload = {}) {
    const state = this.state;
    const nav = state && state.nav;
    if (!nav) return null;

    const route = nav.route;
    if (!route || !Array.isArray(route.legs) || !route.legs.length) {
      this._emit('nav:routeExecutorDenied', { reason: 'no-route' });
      return null;
    }

    const existing = nav.executor;
    const resumable = existing
      && Array.isArray(existing.legs)
      && existing.legs.length
      && existing.status !== ROUTE_EXECUTOR_STATUS.ARRIVED
      && payload.restart !== true;

    if (resumable) {
      existing.engaged = true;
      existing.interruptReason = null;
      existing.armedLegIndex = null; // force a fresh arm for the leg we are resuming on
      existing.status = ROUTE_EXECUTOR_STATUS.ACQUIRING;
      this._publish('resumed');
      return existing;
    }

    const legs = decomposeRoute(route, this._atlas);
    if (!legs.length) {
      this._emit('nav:routeExecutorDenied', { reason: 'undecomposable-route' });
      return null;
    }
    const destination = legs[legs.length - 1].toSectorId;
    nav.executor = makeExecutor(legs, destination);
    this._publish('engaged');
    return nav.executor;
  },

  /**
   * The ONE interruption transition. Manual abort, combat, and a lost leg all funnel here so there is
   * exactly one code path that can stop the follower, and exactly one place that guarantees the
   * itinerary survives. Disarms the autopilot we armed; leaves `nav.route` and the legs intact.
   */
  interrupt(reason = 'manual', payload = {}) {
    const nav = this.state && this.state.nav;
    const executor = nav && nav.executor;
    if (!executor) return null;
    if (executor.status === ROUTE_EXECUTOR_STATUS.ARRIVED) return executor;
    if (executor.engaged !== true && executor.status === ROUTE_EXECUTOR_STATUS.INTERRUPTED) {
      return executor;
    }
    executor.engaged = false;
    executor.status = ROUTE_EXECUTOR_STATUS.INTERRUPTED;
    executor.interruptReason = String(reason || 'manual');
    executor.armedLegIndex = null;
    executor.brakeMode = null;
    executor.handoffWU = null;
    this._releaseTravelDrive('interrupted');
    this._disarmAutopilot(executor.interruptReason);
    this._publish('interrupted', { reason: executor.interruptReason, detail: payload.detail || null });
    return executor;
  },

  /**
   * The tick.
   *
   * STRICT NO-OP CONTRACT: the first four guards below return before touching anything at all — no
   * lazy subtree creation, no field writes, no events. That is provable by inspection, and it is why
   * `update()` never calls the executor constructor: only `engage()` may create `nav.executor`.
   */
  update(dt, state) {
    const nav = state && state.nav;
    if (!nav) return;
    if (nav.autoTravel !== true) return;                       // gate 1: no travel intent
    const route = nav.route;
    if (!route || !Array.isArray(route.legs) || !route.legs.length) return;  // gate 2: no route
    const executor = nav.executor;
    if (!executor) return;                                     // gate 3: plotted but never engaged
    if (executor.engaged !== true) return;                     // gate 4: engage is a separate act
    // ── everything past this line runs only for an explicitly engaged route ──

    const legs = Array.isArray(executor.legs) ? executor.legs : [];
    const leg = legs[executor.legIndex];
    if (!leg) {
      this._complete();
      return;
    }
    if (!leg.resolved || !hasXZ(leg.target)) {
      // A leg with no flyable endpoint is a LOST LEG, not a reason to steer at a fabricated origin.
      this.interrupt('lost-leg', { detail: leg.toSectorId });
      return;
    }

    // Arm the delegated controller exactly once per leg (edge-triggered — see the header).
    if (executor.armedLegIndex !== executor.legIndex) {
      this._armLeg(executor, leg);
    } else if (!nav.autopilot || nav.autopilot.active !== true) {
      // We armed this leg, and the controller we handed the ship to is no longer flying it — but no
      // `nav:autopilot` stop ever reached us. That happens whenever the autopilot is deactivated
      // outside the event seam: a foreign system disarming it, a restored save, a dropped event.
      //
      // The one thing we must NOT do here is re-arm. Re-arming on a controller that just went
      // inactive is precisely the fight-for-the-ship failure mode the edge trigger exists to
      // prevent: if the player is the reason it went inactive, a re-arm hands the ship straight back
      // to the autopilot, every tick, forever. So a silently lost controller is an INTERRUPTION —
      // resumable like every other one — rather than a stall in transit or a tug of war.
      this.interrupt('autopilot-lost');
      return;
    }

    const player = playerEntity(state);
    if (!player || !hasXZ(player.pos)) return;

    const dx = leg.target.x - finite(player.pos.x);
    const dz = leg.target.z - finite(player.pos.z);
    const dist = Math.sqrt(dx * dx + dz * dz);

    // Consume the ALREADY-COMPUTED braking solution to choose the handoff range. `bestMode` decides
    // whether the flip-inclusive distance or the direct distance is the one with authority; neither
    // number is re-derived here.
    const handoff = this._handoffRange(state, player, leg);
    executor.handoffWU = handoff.rangeWU;

    if (dist > handoff.rangeWU) {
      this._setStatus(executor, ROUTE_EXECUTOR_STATUS.TRANSITING);
      this._requestTravelDrive(leg, dist);
      return;
    }

    // Terminal handoff: release the travel drive and let the local autopilot fly the stop, flipping
    // and burning if that is what the solution says is fastest.
    if (executor.status !== ROUTE_EXECUTOR_STATUS.APPROACHING) {
      executor.brakeMode = handoff.bestMode;
      this._releaseTravelDrive('approach');
      this._setStatus(executor, ROUTE_EXECUTOR_STATUS.APPROACHING);
      this._emit('nav:routeBrake', {
        legIndex: executor.legIndex,
        bestMode: handoff.bestMode,
        rangeWU: handoff.rangeWU,
        distanceWU: dist,
      });
    }
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // delegation
  // ───────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Arm the LOCAL AUTOPILOT for one leg by writing `state.nav.autopilot` in the exact shape
   * `world._onSetCourse` writes (`world.js:2073-2090`) and emitting the same two events.
   *
   * We deliberately do NOT emit `ui:setCourse`: its pos-branch nulls `nav.route` and clears
   * `nav.autoTravel`, which would delete the itinerary we are mid-way through following.
   */
  _armLeg(executor, leg) {
    const nav = this.state && this.state.nav;
    if (!nav) return;
    const pos = { x: leg.target.x, z: leg.target.z };
    const label = leg.label || `${leg.fromSectorId} → ${leg.toSectorId}`;

    nav.waypoint = {
      kind: 'route',
      label,
      reason: `Route leg ${executor.legIndex + 1}/${executor.legs.length}`,
      pos,
    };
    nav.autopilot = {
      active: true,
      target: pos,
      targetEntityId: null,
      label,
      arrivalRadius: leg.arrivalRadius,
      status: 'armed',
    };
    executor.armedLegIndex = executor.legIndex;
    this._setStatus(executor, ROUTE_EXECUTOR_STATUS.ACQUIRING);

    this._emit('nav:waypoint', nav.waypoint);
    this._emittingAutopilot = true;
    try {
      this._emit('nav:autopilot', nav.autopilot);
    } finally {
      this._emittingAutopilot = false;
    }
  },

  _disarmAutopilot(reason) {
    const nav = this.state && this.state.nav;
    const autopilot = nav && nav.autopilot;
    if (!autopilot || autopilot.active !== true) return;
    autopilot.active = false;
    autopilot.status = reason || 'idle';
    this._emittingAutopilot = true;
    try {
      this._emit('nav:autopilot', autopilot);
    } finally {
      this._emittingAutopilot = false;
    }
  },

  /**
   * Travel-drive adapter seam (packet W1-A owns the system; this file must not import it).
   *
   * Expressed as bus intents plus a defensive read, so this follower composes with the travel drive
   * when it lands and is a harmless no-op until then. The follower never writes drive state itself —
   * that would be a second writer on an axis W1-A owns.
   */
  _requestTravelDrive(leg, distanceWU) {
    if (this._travelRequested) return;
    this._travelRequested = true;
    this._emit('travel:request', {
      reason: 'route-transit',
      legIndex: leg.index,
      toSectorId: leg.toSectorId,
      distanceWU,
    });
  },

  _releaseTravelDrive(reason) {
    if (!this._travelRequested) return;
    this._travelRequested = false;
    this._emit('travel:release', { reason });
  },

  /**
   * Choose the transit -> approach handoff range from the braking solution the flight telemetry
   * module already computes. `bestMode` selects which distance has authority; a flip-and-burn needs
   * the longer runway because the turn happens while coasting.
   */
  _handoffRange(state, player, leg) {
    let bestMode = 'direct';
    let stopDistance = 0;
    try {
      const profile = resolvePropulsionProfile(player, state);
      const solution = estimateBrakingSolution(
        { pos: player.pos, vel: player.vel, rot: player.rot, angVel: player.angVel },
        profile,
      );
      bestMode = solution.bestMode || 'direct';
      const candidate = bestMode === 'flipBurn' ? solution.flipBurnDistance : solution.directDistance;
      stopDistance = Number.isFinite(candidate) ? candidate : 0;
    } catch {
      // A profile we cannot resolve must not strand the follower in transit forever; fall back to the
      // floor, which hands off early. Early is safe: the autopilot cruises as well as it brakes.
      bestMode = 'direct';
      stopDistance = 0;
    }
    const rangeWU = Math.max(
      HANDOFF_MIN_WU,
      stopDistance * HANDOFF_MARGIN + finite(leg.arrivalRadius, GATE_ARRIVAL_RADIUS),
    );
    return { bestMode, rangeWU, stopDistance };
  },

  // ───────────────────────────────────────────────────────────────────────────────────────────────
  // observation
  // ───────────────────────────────────────────────────────────────────────────────────────────────

  _onAutopilot(payload) {
    if (this._emittingAutopilot) return;               // ignore the echo of our own arm
    const nav = this.state && this.state.nav;
    const executor = nav && nav.executor;
    if (!executor || executor.engaged !== true) return;
    const status = payload && payload.status;
    if (status === 'arrived') {
      this._advanceLeg('autopilot-arrived');
      return;
    }
    // The player took the stick, or the leg endpoint evaporated. flightV3's stopAutopilot does not
    // know this system exists, so this observation is the ONLY thing standing between us and a
    // re-arm fight for control of the ship.
    if (status === 'manual' || status === 'lost-target') {
      this.interrupt(status);
    }
  },

  _onSectorEnter({ sectorId }) {
    const nav = this.state && this.state.nav;
    const executor = nav && nav.executor;
    if (!executor || executor.engaged !== true) return;
    const leg = (executor.legs || [])[executor.legIndex];
    if (!leg || leg.toSectorId !== sectorId) return;
    this._advanceLeg('gate-handoff');
  },

  _onCombatHit(payload) {
    const state = this.state;
    const nav = state && state.nav;
    const executor = nav && nav.executor;
    if (!executor || executor.engaged !== true) return;
    const playerId = state.playerId;
    if (playerId == null) return;
    const target = payload && (payload.targetId ?? payload.entityId ?? payload.id);
    if (target == null || String(target) !== String(playerId)) return;
    this.interrupt('combat');
  },

  /** Leg complete: either advance to the next one (re-arming happens next tick, edge-triggered by the
   *  changed legIndex) or finish the itinerary. */
  _advanceLeg(reason) {
    const nav = this.state && this.state.nav;
    const executor = nav && nav.executor;
    if (!executor) return;
    const legs = Array.isArray(executor.legs) ? executor.legs : [];
    if (executor.legIndex >= legs.length - 1) {
      this._complete(reason);
      return;
    }
    executor.legIndex += 1;
    executor.armedLegIndex = null;
    executor.brakeMode = null;
    executor.handoffWU = null;
    this._setStatus(executor, ROUTE_EXECUTOR_STATUS.ACQUIRING);
    this._publish('leg-advanced', { reason });
  },

  _complete(reason = 'arrived') {
    const nav = this.state && this.state.nav;
    const executor = nav && nav.executor;
    if (!executor) return;
    executor.engaged = false;
    executor.status = ROUTE_EXECUTOR_STATUS.ARRIVED;
    executor.armedLegIndex = null;
    executor.interruptReason = null;
    this._releaseTravelDrive('arrived');
    this._publish('arrived', { reason });
  },

  _setStatus(executor, status) {
    if (executor.status === status) return;
    executor.status = status;
    this._publish(status);
  },

  _publish(transition = null, extra = null) {
    const nav = this.state && this.state.nav;
    const summary = summarizeExecutor(nav && nav.executor);
    this._emit('nav:routeExecutor', extra ? { ...summary, transition, ...extra } : { ...summary, transition });
  },

  _emit(event, payload) {
    const bus = this.bus;
    if (bus && typeof bus.emit === 'function') bus.emit(event, payload);
  },
};

export default routeFollower;
