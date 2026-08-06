// Route follower — the reader for `nav.autoTravel` (ledger RC-5).
//
// These tests drive the REAL system object through the REAL atlas index and the REAL save
// serializer. Nothing here reimplements route decomposition or leg ordering, because a test that
// asserts against a parallel reimplementation proves only that two copies of a bug agree.
//
// The discriminating test in this file is `interruption leaves a RESUMABLE itinerary`: it drives the
// exact sequence flightV3 produces when the player grabs the stick mid-route (autopilot.active=false,
// status='manual', `nav:autopilot` emitted) and asserts the follower does NOT re-arm on the next
// tick. A level-triggered follower passes every other test in this file and fails that one, because a
// level-triggered follower fights the autopilot for the ship forever.

import test from 'node:test';
import assert from 'node:assert/strict';

import { routeFollower, ROUTE_EXECUTOR_STATUS } from '../src/systems/routeFollower.js';
import { buildAtlasIndex, gateNodeId } from '../src/core/atlasIndex.js';
import { save } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';

const ATLAS = buildAtlasIndex();

/** A minimal bus with a recorder, matching the emit/on surface the system uses. */
function makeBus() {
  const handlers = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
    of(name) {
      return events.filter((e) => e.name === name);
    },
    clear() {
      events.length = 0;
    },
  };
}

/**
 * Pick a real multi-hop route out of the authored graph so leg ordering is exercised against genuine
 * content rather than a two-node fixture. Walks atlas sector neighbours breadth-first from Helios.
 */
function findMultiHopSectorChain(minHops = 2) {
  const start = 'sector_helios_prime';
  const seen = new Set([start]);
  let frontier = [[start]];
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    for (const path of frontier) {
      const tail = path[path.length - 1];
      for (const neighbor of ATLAS.sectorNeighbors(tail)) {
        if (seen.has(neighbor)) continue;
        const extended = [...path, neighbor];
        if (extended.length - 1 >= minHops) return extended;
        seen.add(neighbor);
        next.push(extended);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return null;
}

const CHAIN = findMultiHopSectorChain(2);

function routeFromChain(chain) {
  const legs = [];
  for (let i = 0; i < chain.length - 1; i++) {
    legs.push({ from: chain[i], to: chain[i + 1], fuel: 4, charge: 1, interdict: 0 });
  }
  return { legs, totalFuel: legs.length * 4, totalHops: legs.length };
}

/** A harness holding only what the system actually reads. */
function makeHarness({ route = null, autoTravel = false, playerPos = { x: 0, z: 0 } } = {}) {
  const player = {
    id: 'player',
    pos: { ...playerPos },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    radius: 8,
  };
  const state = {
    playerId: 'player',
    entities: new Map([['player', player]]),
    nav: {
      route,
      autoTravel,
      waypoint: null,
      autopilot: { active: false, target: null, targetEntityId: null, label: '', arrivalRadius: 36, status: 'idle' },
    },
    world: { currentSectorId: CHAIN ? CHAIN[0] : 'sector_helios_prime' },
  };
  const bus = makeBus();
  const sys = Object.create(routeFollower);
  sys.init({ state, bus, atlas: ATLAS });
  return { state, bus, sys, player };
}

// ── strict no-op ──────────────────────────────────────────────────────────────────────────────────

test('no route + autoTravel false: update() mutates nothing at all', () => {
  const h = makeHarness();
  const before = JSON.stringify(h.state.nav);
  h.bus.clear();

  for (let i = 0; i < 10; i++) h.sys.update(1 / 60, h.state);

  assert.equal(JSON.stringify(h.state.nav), before, 'nav must be byte-identical after ticking');
  assert.equal('executor' in h.state.nav, false, 'update() must never lazily create the executor');
  assert.equal(h.bus.events.length, 0, 'a no-op tick must emit nothing');
});

test('autoTravel true but no route is still a strict no-op', () => {
  const h = makeHarness({ autoTravel: true });
  const before = JSON.stringify(h.state.nav);
  h.bus.clear();
  h.sys.update(1 / 60, h.state);
  assert.equal(JSON.stringify(h.state.nav), before);
  assert.equal(h.bus.events.length, 0);
});

// ── plot / engage separation ──────────────────────────────────────────────────────────────────────

test('a plotted route does NOT move the ship until engaged', () => {
  assert.ok(CHAIN, 'authored graph must yield a multi-hop chain');
  // This is exactly the state world._onSetCourse({sectorId}) leaves behind: route set, autoTravel
  // TRUE at plot time (world.js:2096), no executor. Plot must not imply go.
  const h = makeHarness({ route: routeFromChain(CHAIN), autoTravel: true });
  h.bus.clear();

  for (let i = 0; i < 30; i++) h.sys.update(1 / 60, h.state);

  assert.equal(h.state.nav.executor, undefined, 'plotting must not create an executor');
  assert.equal(h.state.nav.autopilot.active, false, 'plotting must not arm the autopilot');
  assert.equal(h.state.nav.waypoint, null, 'plotting must not set a waypoint');
  assert.equal(h.bus.of('nav:autopilot').length, 0, 'plotting must not emit autopilot arming');

  // Engage is the separate, explicit act.
  h.bus.emit('nav:engageRoute', {});
  h.sys.update(1 / 60, h.state);

  assert.equal(h.state.nav.autopilot.active, true, 'engaging must arm the delegated autopilot');
  assert.equal(h.state.nav.executor.engaged, true);
});

test('engaging without a plotted route is denied, not crashed', () => {
  const h = makeHarness({ autoTravel: true });
  h.bus.emit('nav:engageRoute', {});
  assert.equal(h.state.nav.executor, undefined);
  assert.equal(h.bus.of('nav:routeExecutorDenied')[0].payload.reason, 'no-route');
});

// ── decomposition ─────────────────────────────────────────────────────────────────────────────────

test('engaging decomposes a multi-sector route into legs in the right order', () => {
  assert.ok(CHAIN && CHAIN.length >= 3, 'need at least a two-hop chain');
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });

  const executor = h.sys.engage({});
  assert.ok(executor, 'engage must produce an executor');
  assert.equal(executor.legs.length, route.legs.length, 'one executor leg per route leg');

  // Leg order is INHERITED from world's Dijkstra output, never recomputed.
  executor.legs.forEach((leg, i) => {
    assert.equal(leg.index, i);
    assert.equal(leg.fromSectorId, route.legs[i].from, `leg ${i} keeps its authored origin`);
    assert.equal(leg.toSectorId, route.legs[i].to, `leg ${i} keeps its authored destination`);
    assert.equal(leg.final, i === route.legs.length - 1);
  });
  assert.equal(executor.destinationSectorId, CHAIN[CHAIN.length - 1]);
  assert.equal(executor.legIndex, 0, 'engagement starts at the first leg');
});

test('leg endpoints resolve to canonical GLOBAL atlas positions, not sector-local anchors', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  const executor = h.sys.engage({});

  for (const leg of executor.legs) {
    assert.equal(leg.resolved, true, `leg ${leg.fromSectorId}->${leg.toSectorId} must resolve`);
    const node = ATLAS.getNode(leg.targetNodeId);
    assert.ok(node && node.hasPosition, 'the target must be a positioned atlas node');
    // The atlas is the single conversion boundary — the follower must reuse its global position
    // verbatim rather than re-deriving the sector-local -> global composition (ADR D2 / D2.1).
    assert.deepEqual(leg.target, { x: node.globalPos.x, z: node.globalPos.z });
    const expectedId = ATLAS.getNode(gateNodeId(leg.fromSectorId, leg.toSectorId))?.hasPosition
      ? gateNodeId(leg.fromSectorId, leg.toSectorId)
      : leg.toSectorId;
    assert.equal(leg.targetNodeId, expectedId, 'gate preferred, destination sector as fallback');
  }
});

// ── leg advance ───────────────────────────────────────────────────────────────────────────────────

// REWRITTEN 2026-07-19, because the previous version pinned a DEFECT.
//
// It asserted that the local autopilot reporting 'arrived' advances the leg, full stop. But for a
// sector-changing leg the autopilot's waypoint is the GATE (resolveLegTarget prefers the gate node),
// not the destination — so "the autopilot arrived" means "the ship reached the doorway", not "the
// ship is there". Under the old rule a single-leg cross-sector route was declared COMPLETE while the
// ship sat in the origin sector: the live journey measured executor status='arrived',
// executorClaimedArrived=true, ship in sector_helios_prime, and jump receipts
// {chargeStart:0, start:0, arrive:0, sectorEnter:0}. A route that never moved reported success.
//
// This test now models what actually has to happen, and is STRICTER than what it replaced: reaching
// the gate must NOT advance, it must request the handoff, and only a real sector entry advances.
// The module's own header always said so — "sector transitions -> the existing gate handoff, observed
// via sector:enter" — so the old assertion contradicted the design it was testing.
test('reaching the GATE requests the handoff; only a real sector entry advances the leg', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.legIndex, 0);
  const firstTarget = { ...h.state.nav.autopilot.target };
  const legOneDestination = h.state.nav.executor.legs[0].toSectorId;
  h.bus.clear();

  // The delegated autopilot reports arrival exactly as flightV3.stopAutopilot(…, 'arrived') does —
  // i.e. the ship is at the gate. The world has NOT changed sector.
  h.state.nav.autopilot.active = false;
  h.state.nav.autopilot.status = 'arrived';
  h.bus.emit('nav:autopilot', h.state.nav.autopilot);

  assert.equal(h.state.nav.executor.legIndex, 0,
    'reaching the gate must NOT advance the leg — the ship has not changed sector yet');
  const jumps = h.bus.of('world:requestJump');
  assert.equal(jumps.length, 1, 'reaching the gate requests exactly one gate handoff');
  assert.equal(jumps[0].payload.targetSectorId, legOneDestination, 'the handoff targets the leg destination');
  assert.equal(jumps[0].payload.via, 'gate', 'the handoff goes through the shipped public gate seam');

  // Repeated 'arrived' reports while loitering in the arrival radius must not spam the jump request,
  // which would fight the charge it just started.
  h.bus.emit('nav:autopilot', h.state.nav.autopilot);
  assert.equal(h.bus.of('world:requestJump').length, 1,
    'the handoff request is edge-triggered per leg, not re-sent every arrival report');

  // Now the jump actually completes: the world changes sector and announces it.
  h.state.world.currentSectorId = legOneDestination;
  h.bus.emit('sector:enter', { sectorId: legOneDestination });

  assert.equal(h.state.nav.executor.legIndex, 1, 'a real sector entry advances the leg');
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.ACQUIRING);

  // The next tick re-arms for the NEW leg (edge-triggered by the changed legIndex).
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.autopilot.active, true, 'the next leg re-arms the autopilot');
  assert.notDeepEqual(h.state.nav.autopilot.target, firstTarget, 'a new leg targets a new endpoint');
});

test('an intra-sector leg still advances on autopilot arrival — the gate rule is not universal', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);
  h.bus.clear();

  // Pretend the ship is ALREADY in the leg's destination sector, which is what a final approach
  // within one sector looks like. Arrival is then genuine arrival, not a doorway.
  h.state.world.currentSectorId = h.state.nav.executor.legs[0].toSectorId;
  h.state.nav.autopilot.active = false;
  h.state.nav.autopilot.status = 'arrived';
  h.bus.emit('nav:autopilot', h.state.nav.autopilot);

  assert.equal(h.state.nav.executor.legIndex, 1, 'arrival inside the destination sector advances');
  assert.equal(h.bus.of('world:requestJump').length, 0,
    'no gate handoff is requested for a leg that needs no sector change');
});

test('a gate handoff into the leg destination sector also advances the leg', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);

  h.bus.emit('sector:enter', { sectorId: 'sector_not_on_this_route' });
  assert.equal(h.state.nav.executor.legIndex, 0, 'an unrelated sector entry must not advance');

  h.bus.emit('sector:enter', { sectorId: CHAIN[1] });
  assert.equal(h.state.nav.executor.legIndex, 1, 'entering the leg destination advances');
});

test('completing the final leg finishes the itinerary and disengages', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  for (let i = 0; i < route.legs.length; i++) {
    h.sys.update(1 / 60, h.state);
    h.bus.emit('sector:enter', { sectorId: route.legs[i].to });
  }
  const executor = h.state.nav.executor;
  assert.equal(executor.status, ROUTE_EXECUTOR_STATUS.ARRIVED);
  assert.equal(executor.engaged, false, 'arrival disengages — it does not keep driving');
  assert.equal(h.state.nav.route, null, 'the completed itinerary must not remain plotted behind the player');
  assert.equal(h.state.nav.autoTravel, false, 'completed travel intent retires with the itinerary');
  assert.equal(h.state.nav.waypoint, null, 'the completed route cannot leave an orphan HUD marker');

  h.bus.clear();
  h.sys.update(1 / 60, h.state);
  assert.equal(h.bus.events.length, 0, 'an arrived executor is a strict no-op');
});

test('a one-hop Set Course & Jump retires its plot on arrival without requiring Engage', () => {
  const route = routeFromChain(CHAIN.slice(0, 2));
  const h = makeHarness({ route, autoTravel: true });
  const destination = route.legs[0].to;

  // The chart's shipped one-hop action requests the jump before ui:setCourse creates this route, so
  // there is deliberately no executor. sector:enter is still authoritative proof that the course
  // was completed; leaving it plotted produces a false OUT OF RANGE target and a stale-route warning
  // after Continue.
  h.state.world.currentSectorId = destination;
  h.bus.emit('sector:enter', { sectorId: destination });

  assert.equal('executor' in h.state.nav, false, 'arrival does not invent an engaged controller');
  assert.equal(h.state.nav.route, null, 'the completed one-hop plot retires at its destination');
  assert.equal(h.state.nav.autoTravel, false, 'no completed travel intent survives the jump');
  assert.equal(h.state.nav.autopilot.active, false, 'route cleanup never takes control of the ship');
});

test('an arrived physical-gate waypoint retires through the real ui:setCourse shape', () => {
  const destination = CHAIN[1];
  const h = makeHarness();
  const worldSystem = Object.create(world);
  worldSystem.state = h.state;
  worldSystem.bus = h.bus;

  worldSystem._onSetCourse({
    type: 'gate',
    pos: { x: 640, z: -90 },
    targetEntityId: 'gate_helios_to_ceres',
    sectorId: destination,
    label: 'Gate → Ceres Belt',
    waypointKind: 'nav',
    arrivalRadius: 72,
    autopilot: true,
  });
  assert.equal(h.state.nav.waypoint.targetSectorId, destination,
    'world preserves the gate destination needed to distinguish completed guidance from a local fix');

  h.state.world.currentSectorId = destination;
  h.bus.emit('sector:enter', { sectorId: destination });

  assert.equal(h.state.nav.waypoint, null, 'the origin gate is not a target after entering its destination');
  assert.equal(h.state.nav.autopilot.active, false, 'arrival releases only the gate-owned local autopilot');
  assert.equal(h.state.nav.autopilot.target, null, 'the old-sector gate position cannot remain HUD guidance');
  assert.equal(h.state.nav.autopilot.status, 'arrived');
});

test('an unengaged multi-hop plot advances when the player manually completes a leg', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  const firstDestination = route.legs[0].to;
  const remainingFuel = route.legs.slice(1).reduce((sum, leg) => sum + leg.fuel, 0);

  h.state.world.currentSectorId = firstDestination;
  h.bus.emit('sector:enter', { sectorId: firstDestination });

  assert.equal('executor' in h.state.nav, false, 'manual progress remains a plot, not an assist');
  assert.equal(h.state.nav.route.legs.length, route.legs.length - 1);
  assert.equal(h.state.nav.route.legs[0].from, firstDestination, 'the next leg starts where the player arrived');
  assert.equal(h.state.nav.route.totalHops, route.legs.length - 1);
  assert.equal(h.state.nav.route.totalFuel, remainingFuel);
  assert.equal(h.state.nav.autopilot.active, false, 'advancing a plot never arms thrust or steering');
});

// ── interruption / resume ─────────────────────────────────────────────────────────────────────────

test('interruption leaves a RESUMABLE itinerary, never an orphan, and does not re-arm', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);
  h.bus.emit('sector:enter', { sectorId: CHAIN[1] });   // get onto leg 1 so resume is non-trivial
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.legIndex, 1);
  assert.equal(h.state.nav.autopilot.active, true);

  // THE DISCRIMINATING SEQUENCE: exactly what flightV3.stopAutopilot(host, state, 'manual') does
  // when hasManualFlightInput() sees the player take the stick.
  h.state.nav.autopilot.active = false;
  h.state.nav.autopilot.status = 'manual';
  h.bus.emit('nav:autopilot', h.state.nav.autopilot);

  const executor = h.state.nav.executor;
  assert.equal(executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED);
  assert.equal(executor.engaged, false);
  assert.equal(executor.interruptReason, 'manual');

  // Never an orphan: route and legs survive intact at the leg we reached.
  assert.ok(h.state.nav.route, 'the plotted route survives interruption');
  assert.equal(executor.legs.length, route.legs.length, 'the itinerary survives interruption');
  assert.equal(executor.legIndex, 1, 'progress survives interruption');

  // AND the follower must not fight the player for the ship.
  for (let i = 0; i < 30; i++) h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.autopilot.active, false, 'an interrupted follower must NEVER re-arm');

  // Resume picks up the same trip at the same leg — it does not re-plan from scratch.
  h.bus.emit('nav:engageRoute', {});
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.engaged, true);
  assert.equal(h.state.nav.executor.legIndex, 1, 'resume continues the same itinerary');
  assert.equal(h.state.nav.autopilot.active, true, 'resume re-arms the delegated autopilot');
});

// THE DISCRIMINATING TEST for edge-triggered delegation.
//
// The `interrupted` case above does NOT prove edge-triggering, and it is worth saying why in the file
// rather than discovering it again later: interrupt() clears `engaged`, so update() early-returns at
// gate 4 and never reaches the arming code at all. A level-triggered follower passes that test.
// (Verified by mutation: replacing the `armedLegIndex !== legIndex` guard with an unconditional
// `_armLeg` left all other tests green.)
//
// What actually discriminates is the SILENT loss — the autopilot going inactive without a
// `nav:autopilot` stop reaching us, while the executor is still engaged on the same leg. A
// level-triggered follower re-arms it on the very next tick; if the player is the reason it went
// inactive, that is a permanent tug of war for the ship.
test('a silently lost autopilot interrupts and is NEVER re-armed (edge-trigger proof)', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.autopilot.active, true, 'the leg must start armed');
  assert.equal(h.state.nav.executor.armedLegIndex, 0);

  // The controller stops flying, and NO nav:autopilot event is emitted — the seam is bypassed
  // entirely. This is what a foreign disarm or a dropped event looks like from here.
  h.state.nav.autopilot.active = false;
  h.bus.clear();

  h.sys.update(1 / 60, h.state);

  assert.equal(
    h.state.nav.autopilot.active, false,
    'a level-triggered follower would re-arm here and fight the player for the ship',
  );
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED);
  assert.equal(h.state.nav.executor.interruptReason, 'autopilot-lost');

  // Still resumable — a lost controller must not orphan the trip either.
  assert.ok(h.state.nav.route);
  assert.equal(h.state.nav.executor.legs.length, route.legs.length);

  for (let i = 0; i < 30; i++) h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.autopilot.active, false, 'and it must stay disarmed');
});

test('combat on the player interrupts travel; combat on someone else does not', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);

  h.bus.emit('combat:hit', { targetId: 'some_pirate' });
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.TRANSITING, 'not our problem');

  h.bus.emit('combat:hit', { targetId: 'player' });
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED);
  assert.equal(h.state.nav.executor.interruptReason, 'combat');
  assert.ok(h.state.nav.route, 'combat must not orphan the route');
});

test('a manual abort interrupts and disarms the autopilot we armed', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.autopilot.active, true);

  h.bus.emit('nav:abortRoute', { reason: 'manual' });
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED);
  assert.equal(h.state.nav.autopilot.active, false, 'aborting must release the delegated controller');
  assert.equal(h.state.nav.executor.legs.length, route.legs.length);
});

test('a leg with no resolvable endpoint interrupts rather than steering at a fabricated origin', () => {
  const route = { legs: [{ from: CHAIN[0], to: 'sector_does_not_exist' }], totalFuel: 1, totalHops: 1 };
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED);
  assert.equal(h.state.nav.executor.interruptReason, 'lost-leg');
  assert.equal(h.state.nav.autopilot.active, false);
});

// ── auto-brake handoff ────────────────────────────────────────────────────────────────────────────

test('the transit -> approach handoff is chosen from estimateBrakingSolution.bestMode', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  const leg = h.state.nav.executor.legs[0];

  // Far away: transiting, travel drive requested.
  h.player.pos.x = leg.target.x - 60000;
  h.player.pos.z = leg.target.z;
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.TRANSITING);
  assert.equal(h.bus.of('travel:request').length, 1, 'transit requests the travel drive');

  // Inside the handoff range: approach, drive released, brake cue published with the solution's mode.
  h.bus.clear();
  h.player.pos.x = leg.target.x - 200;
  h.sys.update(1 / 60, h.state);
  assert.equal(h.state.nav.executor.status, ROUTE_EXECUTOR_STATUS.APPROACHING);
  assert.equal(h.bus.of('travel:release').length, 1, 'terminal handoff releases the travel drive');
  const cue = h.bus.of('nav:routeBrake')[0];
  assert.ok(cue, 'the handoff publishes a brake cue');
  assert.ok(['direct', 'flipBurn', 'stopped'].includes(cue.payload.bestMode));
  assert.equal(h.state.nav.executor.brakeMode, cue.payload.bestMode);
});

test('a moving ship gets a longer handoff range than a stationary one', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});
  const leg = h.state.nav.executor.legs[0];
  h.player.pos.x = leg.target.x - 40000;
  h.player.pos.z = leg.target.z;

  h.sys.update(1 / 60, h.state);
  const atRest = h.state.nav.executor.handoffWU;

  h.player.vel.x = 900;
  h.sys.update(1 / 60, h.state);
  const atSpeed = h.state.nav.executor.handoffWU;

  assert.ok(atSpeed > atRest, `speed must widen the handoff (${atSpeed} > ${atRest})`);
});

// ── save / load ───────────────────────────────────────────────────────────────────────────────────

test('unfinished routes survive save/load; a completed itinerary restores as idle', () => {
  const route = routeFromChain(CHAIN);

  // Reach each status through the real transitions, then round-trip through the real serializer.
  const reach = {
    [ROUTE_EXECUTOR_STATUS.ACQUIRING]: (h) => { h.sys.engage({}); },
    [ROUTE_EXECUTOR_STATUS.TRANSITING]: (h) => {
      h.sys.engage({});
      const leg = h.state.nav.executor.legs[0];
      h.player.pos.x = leg.target.x - 60000;
      h.player.pos.z = leg.target.z;
      h.sys.update(1 / 60, h.state);
    },
    [ROUTE_EXECUTOR_STATUS.APPROACHING]: (h) => {
      h.sys.engage({});
      const leg = h.state.nav.executor.legs[0];
      h.player.pos.x = leg.target.x - 100;
      h.player.pos.z = leg.target.z;
      h.sys.update(1 / 60, h.state);
    },
    [ROUTE_EXECUTOR_STATUS.INTERRUPTED]: (h) => {
      h.sys.engage({});
      h.sys.update(1 / 60, h.state);
      h.bus.emit('nav:abortRoute', { reason: 'manual' });
    },
    [ROUTE_EXECUTOR_STATUS.ARRIVED]: (h) => {
      h.sys.engage({});
      for (let i = 0; i < route.legs.length; i++) {
        h.sys.update(1 / 60, h.state);
        h.bus.emit('sector:enter', { sectorId: route.legs[i].to });
      }
    },
  };

  for (const [status, drive] of Object.entries(reach)) {
    const h = makeHarness({ route, autoTravel: true });
    drive(h);
    const before = h.state.nav.executor;
    assert.equal(before.status, status, `harness must actually reach ${status}`);

    const saveInstance = Object.create(save);
    saveInstance.state = { nav: structuredClone(h.state.nav) };
    saveInstance.bus = { emit() {} };
    const serialized = saveInstance._serializeNav();
    saveInstance.state.nav = {};
    saveInstance._restoreNav(serialized);

    const after = saveInstance.state.nav.executor;
    if (status === ROUTE_EXECUTOR_STATUS.ARRIVED) {
      assert.equal(after, undefined, 'a completed executor is a receipt, not resumable save state');
      assert.equal(saveInstance.state.nav.route, null, 'the destination does not reload as a stale route');
      assert.equal(saveInstance.state.nav.autoTravel, false, 'completed travel intent stays retired');
      continue;
    }
    assert.ok(after, `${status}: the executor must survive the round trip`);
    assert.equal(after.status, before.status, `${status}: status round-trips`);
    assert.equal(after.engaged, before.engaged, `${status}: engagement round-trips`);
    assert.equal(after.legIndex, before.legIndex, `${status}: progress round-trips`);
    assert.equal(after.legs.length, before.legs.length, `${status}: the itinerary round-trips`);
    assert.equal(after.destinationSectorId, before.destinationSectorId);
    assert.equal(after.interruptReason, before.interruptReason ?? null);
    assert.deepEqual(after.legs[0].target, before.legs[0].target, `${status}: leg targets round-trip`);
    assert.ok(saveInstance.state.nav.route, `${status}: the plotted route round-trips`);
  }
});

test('save:loaded discards an engaged route whose persisted destination no longer exists', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});

  // This is a structurally valid shape accepted by the save sanitizer. The stale destination and
  // finite cached target model an older save after authored atlas content changed: without a live
  // atlas check, the follower trusts the cached numbers and arms the autopilot toward empty space.
  const leg = h.state.nav.executor.legs[0];
  route.legs[0].to = 'sector_removed_from_atlas';
  leg.toSectorId = 'sector_removed_from_atlas';
  leg.targetNodeId = 'gate_removed_from_atlas';
  leg.target = { x: 987654, z: -456789 };
  leg.resolved = true;
  h.state.nav.waypoint = { kind: 'route', label: 'Stale route', pos: { ...leg.target } };
  h.state.nav.autopilot = {
    active: true,
    target: { ...leg.target },
    targetEntityId: null,
    label: 'Stale route',
    arrivalRadius: 260,
    status: 'armed',
  };

  const saveInstance = Object.create(save);
  saveInstance.state = h.state;
  saveInstance.bus = h.bus;
  const serialized = saveInstance._serializeNav();
  saveInstance._restoreNav(serialized);
  assert.ok(h.state.nav.route, 'the structural save sanitizer deliberately accepts this stale shape');
  assert.equal(h.state.nav.executor.legs[0].resolved, true, 'the finite cached target survives sanitization');

  h.bus.clear();
  h.bus.emit('save:loaded', {});

  assert.equal(h.state.nav.route, null, 'an invalid restored itinerary must not remain resumable');
  assert.equal(h.state.nav.executor, null, 'cached executor targets must be discarded with the route');
  assert.equal(h.state.nav.autoTravel, false, 'invalid restored travel intent must be cleared');
  assert.equal(h.state.nav.autopilot.active, false, 'stale route steering must be disarmed');
  assert.equal(h.state.nav.waypoint, null, 'the stale route marker must be removed');
  assert.equal(h.bus.of('nav:routeInvalidated').length, 1, 'the player-facing route loss is explicit');
});

test('save:loaded preserves a valid engaged itinerary for normal resume', () => {
  const route = routeFromChain(CHAIN);
  const h = makeHarness({ route, autoTravel: true });
  h.sys.engage({});

  const saveInstance = Object.create(save);
  saveInstance.state = h.state;
  saveInstance.bus = h.bus;
  const serialized = saveInstance._serializeNav();
  saveInstance._restoreNav(serialized);

  h.bus.clear();
  h.bus.emit('save:loaded', {});

  assert.ok(h.state.nav.route, 'a current itinerary remains plotted');
  assert.ok(h.state.nav.executor, 'a current executor remains resumable');
  assert.equal(h.state.nav.autoTravel, true);
  assert.equal(h.bus.of('nav:routeInvalidated').length, 0);
  assert.equal(h.bus.of('toast').length, 0, 'normal resume stays silent');
});

test('an idle nav serializes with NO executor key, so the default save shape is unchanged', () => {
  // test/unified-map-professional.test.mjs:203 deep-equals the whole restored nav against a literal
  // with no executor key, and scripts/check-sectorSim.mjs:205 does the same for migrations. Emitting
  // an idle executor would break both, so the key is omitted when there is nothing to say.
  const saveInstance = Object.create(save);
  saveInstance.state = {
    nav: { route: null, autoTravel: false, waypoint: null, autopilot: null },
  };
  saveInstance.bus = { emit() {} };
  const serialized = saveInstance._serializeNav();
  assert.equal('executor' in serialized, false, 'idle nav must not carry an executor key');
});
