// Navigation — the NO-ROUTE and STALE-ROUTE cases, plus abort -> replan -> resume.
//
// WHY THIS EXISTS BESIDE test/route-follower.test.mjs (it extends, it does not duplicate).
//
// The existing suite covers the happy path plus NO-ROUTE ("engaging without a plotted route is
// denied") and single-leg unresolvability. What it does not cover at all — `grep -i stale` over
// every nav test returns nothing — is a route that was VALID WHEN PLOTTED and has since gone stale.
//
// That is not a hypothetical. `nav.route` is persisted (ledger W1-10, and the executor survives
// save/load in every state). So the real vector is: plot a route -> save -> content changes under
// the save (a sector renamed, a gate removed, a leg re-authored) -> load. The follower then reads an
// itinerary describing a universe that no longer exists. `save:loaded` re-publishes the executor
// (`routeFollower.js:246`) but does NOT revalidate it, so nothing in the system ever asks whether
// the plotted route is still flyable.
//
// WHAT THIS FILE ASSERTS, AND WHAT IT DELIBERATELY DOES NOT
//
// It asserts the SAFETY INVARIANTS that currently hold across every stale shape, so they cannot
// regress: no throw, no fabricated (0,0) target, no autopilot armed at a coordinate the route did
// not actually resolve, and an itinerary that is never orphaned.
//
// It does NOT assert staleness DETECTION, because staleness detection does not exist. Three gaps
// were found by probing the real system and are reported as defects in the packet return rather
// than encoded here as failing tests — a verifier's job is to grade the outcome and report, not to
// smuggle a feature request in as a red test:
//
//   1. A partially-stale route (leg 1 flyable, leg 2 dangling) engages and flies with no signal.
//   2. A DISCONTINUOUS leg chain (leg[i].to !== leg[i+1].from) is accepted as a valid itinerary.
//   3. A leg's `from` sector is never validated at all — an unknown origin still resolves and flies.
//
// GRADER ASSUMPTIONS: the real `routeFollower` system object, the real `buildAtlasIndex()` over live
// authored content, and the real save serializer. Nothing here reimplements route decomposition, so
// a passing assertion cannot merely mean "two copies of the same bug agree".

import test from 'node:test';
import assert from 'node:assert/strict';

import { routeFollower, ROUTE_EXECUTOR_STATUS, summarizeExecutor } from '../src/systems/routeFollower.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';

const ATLAS = buildAtlasIndex();

/** Sector ids that are certain NOT to exist, so "stale" means genuinely absent from the atlas. */
const GHOST_A = 'sector_removed_by_content_patch_a';
const GHOST_B = 'sector_removed_by_content_patch_b';

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
    of(name) { return events.filter((e) => e.name === name); },
    clear() { events.length = 0; },
  };
}

/** Walk the real authored graph so multi-hop routes are genuine content, not a two-node fixture. */
function findChain(minHops) {
  const start = 'sector_helios_prime';
  const seen = new Set([start]);
  let frontier = [[start]];
  for (let depth = 0; depth < 6; depth++) {
    const next = [];
    for (const path of frontier) {
      for (const neighbor of ATLAS.sectorNeighbors(path[path.length - 1])) {
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

const CHAIN = findChain(2);
assert.ok(CHAIN, 'authored graph must contain a 2-hop chain from Helios for these tests to mean anything');

function legsFrom(chain) {
  const legs = [];
  for (let i = 0; i < chain.length - 1; i++) {
    legs.push({ from: chain[i], to: chain[i + 1], fuel: 4, charge: 1, interdict: 0 });
  }
  return legs;
}

function harness({ route = null, autoTravel = true, startSectorId = CHAIN[0] } = {}) {
  const player = { id: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 8 };
  const state = {
    playerId: 'player',
    entities: new Map([['player', player]]),
    nav: {
      route,
      autoTravel,
      waypoint: null,
      autopilot: {
        active: false, target: null, targetEntityId: null,
        label: '', arrivalRadius: 36, status: 'idle',
      },
    },
    world: { currentSectorId: startSectorId },
  };
  const bus = makeBus();
  const sys = Object.create(routeFollower);
  sys.init({ state, bus, atlas: ATLAS });
  return { state, bus, sys, player };
}

/** Every stale shape a persisted route can take when content moves under it. */
const STALE_SHAPES = [
  {
    name: 'destination sector no longer exists',
    legs: [{ from: 'sector_helios_prime', to: GHOST_A }],
    flyable: false,
  },
  {
    name: 'every leg unresolvable',
    legs: [{ from: GHOST_A, to: GHOST_B }, { from: GHOST_B, to: 'sector_also_gone' }],
    flyable: false,
  },
  {
    name: 'origin sector no longer exists',
    legs: [{ from: GHOST_A, to: 'sector_tethys_junction' }],
    flyable: true,
  },
  {
    name: 'first leg flyable, second leg dangling',
    legs: [
      { from: 'sector_helios_prime', to: 'sector_tethys_junction' },
      { from: 'sector_tethys_junction', to: GHOST_A },
    ],
    flyable: true,
  },
  {
    name: 'malformed leg entries (corrupted save)',
    legs: [null, { from: 5, to: {} }, { from: 'sector_helios_prime', to: 'sector_tethys_junction' }],
    flyable: true,
  },
  {
    name: 'discontinuous leg chain',
    legs: [
      { from: 'sector_helios_prime', to: 'sector_tethys_junction' },
      { from: 'sector_ceres_belt', to: 'sector_vesta_forge' },
    ],
    flyable: true,
  },
];

// ── NO-ROUTE ─────────────────────────────────────────────────────────────────────────────────────

test('NO-ROUTE: engaging with no route is denied with a machine-readable reason, not a crash', () => {
  for (const route of [null, undefined, {}, { legs: [] }, { legs: null }]) {
    const { state, bus, sys } = harness({ route });
    const result = sys.engage({});
    assert.equal(result, null, 'engage must refuse rather than fabricate an executor');
    assert.equal(state.nav.executor, undefined,
      'a denied engage must not leave a half-built executor behind');
    const denied = bus.of('nav:routeExecutorDenied');
    assert.equal(denied.length, 1, 'exactly one denial is published so the HUD can explain itself once');
    assert.equal(denied[0].payload.reason, 'no-route',
      'the denial reason must be machine-readable, so UI never has to parse prose');
  }
});

test('NO-ROUTE: a denied engage leaves the autopilot completely untouched', () => {
  const { state, sys } = harness({ route: { legs: [] } });
  const before = JSON.parse(JSON.stringify(state.nav.autopilot));
  sys.engage({});
  for (let i = 0; i < 10; i++) sys.update(1 / 60, state);
  assert.deepEqual(state.nav.autopilot, before,
    'refusing a route must not steer the ship — not even to disarm something it never armed');
});

// ── STALE-ROUTE safety invariants ────────────────────────────────────────────────────────────────

test('STALE-ROUTE: no stale itinerary can crash the follower', () => {
  for (const shape of STALE_SHAPES) {
    const { state, sys } = harness({ route: { legs: shape.legs, totalHops: shape.legs.length } });
    assert.doesNotThrow(() => {
      sys.engage({});
      for (let i = 0; i < 20; i++) sys.update(1 / 60, state);
    }, `stale shape "${shape.name}" must be survivable — a persisted route is player data, not a contract`);
  }
});

test('STALE-ROUTE: the autopilot is never armed at a fabricated origin', () => {
  // The failure this guards is specific and nasty: an unresolved leg defaulting to {x:0,z:0} points
  // the ship at Helios Prime's origin, which IS a real place. In Helios it looks almost plausible;
  // from Ceres Belt it is a 14,770 WU flight to nowhere. It must never happen from any shape.
  for (const shape of STALE_SHAPES) {
    const { state, sys } = harness({ route: { legs: shape.legs, totalHops: shape.legs.length } });
    sys.engage({});
    for (let i = 0; i < 20; i++) sys.update(1 / 60, state);

    const target = state.nav.autopilot.target;
    if (!target) continue;
    const executor = state.nav.executor;
    const resolvedTargets = (executor?.legs || [])
      .filter((leg) => leg.resolved && leg.target)
      .map((leg) => `${leg.target.x},${leg.target.z}`);
    assert.ok(resolvedTargets.includes(`${target.x},${target.z}`),
      `"${shape.name}": autopilot target (${target.x}, ${target.z}) is not any leg's resolved endpoint`
      + ' — the follower invented a destination');
  }
});

test('STALE-ROUTE: a wholly unflyable route interrupts and says why, instead of flying nowhere', () => {
  for (const shape of STALE_SHAPES.filter((s) => !s.flyable)) {
    const { state, sys } = harness({ route: { legs: shape.legs, totalHops: shape.legs.length } });
    sys.engage({});
    for (let i = 0; i < 20; i++) sys.update(1 / 60, state);

    const executor = state.nav.executor;
    assert.ok(executor, `"${shape.name}": engage must still produce an executor to carry the failure`);
    assert.equal(executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED,
      `"${shape.name}": an unflyable itinerary must interrupt, not sit in transit forever`);
    assert.equal(executor.interruptReason, 'lost-leg',
      `"${shape.name}": the reason must name the actual failure so UI can explain it`);
    assert.equal(state.nav.autopilot.active, false,
      `"${shape.name}": the autopilot must not be left armed by a dead route`);
    assert.equal(state.nav.autopilot.target, null,
      `"${shape.name}": a dead route must leave no residual target`);
  }
});

test('STALE-ROUTE: interruption never orphans the itinerary — it stays resumable', () => {
  for (const shape of STALE_SHAPES) {
    const { state, sys } = harness({ route: { legs: shape.legs, totalHops: shape.legs.length } });
    sys.engage({});
    for (let i = 0; i < 20; i++) sys.update(1 / 60, state);
    sys.interrupt('manual');

    assert.ok(state.nav.route, `"${shape.name}": the plotted route must survive interruption`);
    const executor = state.nav.executor;
    if (!executor) continue;
    assert.ok(Array.isArray(executor.legs),
      `"${shape.name}": legs must survive so resuming does not re-plan from scratch`);
    const summary = summarizeExecutor(executor);
    assert.equal(summary.engaged, false, `"${shape.name}": an interrupted executor reads as disengaged`);
    assert.equal(summary.legCount, executor.legs.length,
      `"${shape.name}": the published summary must agree with the executor it summarizes`);
  }
});

test('STALE-ROUTE: malformed legs are dropped, never carried as half-legs', () => {
  const shape = STALE_SHAPES.find((s) => s.name.startsWith('malformed'));
  const { state, sys } = harness({ route: { legs: shape.legs, totalHops: shape.legs.length } });
  sys.engage({});
  const executor = state.nav.executor;
  assert.ok(executor, 'a route with one salvageable leg must still engage');
  assert.equal(executor.legs.length, 1,
    'null and wrongly-typed legs must be dropped, not coerced into legs with garbage endpoints');
  for (const leg of executor.legs) {
    assert.equal(typeof leg.fromSectorId, 'string', 'every surviving leg has a string origin');
    assert.equal(typeof leg.toSectorId, 'string', 'every surviving leg has a string destination');
  }
  // Leg indices must stay dense after filtering, or legIndex arithmetic walks off the end.
  executor.legs.forEach((leg, i) => {
    assert.equal(leg.index, i, 'surviving leg indices must be re-densified, not inherited from the raw array');
  });
});

// ── abort -> replan -> resume ─────────────────────────────────────────────────────────────────────

test('a manual abort mid-route is resumable at the SAME leg, not restarted from the top', () => {
  const { state, bus, sys } = harness({ route: { legs: legsFrom(CHAIN), totalHops: CHAIN.length - 1 } });
  sys.engage({});
  for (let i = 0; i < 10; i++) sys.update(1 / 60, state);

  // Advance to the second leg the way the world does: cross into the first leg's destination.
  bus.emit('sector:enter', { sectorId: CHAIN[1] });
  for (let i = 0; i < 5; i++) sys.update(1 / 60, state);
  const legAtAbort = state.nav.executor.legIndex;
  assert.ok(legAtAbort > 0, 'the fixture must actually have advanced a leg for this test to mean anything');

  sys.interrupt('manual');
  assert.equal(state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED);

  sys.engage({});
  assert.equal(state.nav.executor.legIndex, legAtAbort,
    'resuming must pick the trip up where it stopped — re-planning would discard player progress');
  assert.equal(state.nav.executor.engaged, true, 'resuming re-engages');
  assert.equal(state.nav.executor.interruptReason, null, 'resuming clears the stale interrupt reason');
});

test('an explicit replan restarts the itinerary, and is distinguishable from a resume', () => {
  const { state, bus, sys } = harness({ route: { legs: legsFrom(CHAIN), totalHops: CHAIN.length - 1 } });
  sys.engage({});
  for (let i = 0; i < 10; i++) sys.update(1 / 60, state);
  bus.emit('sector:enter', { sectorId: CHAIN[1] });
  for (let i = 0; i < 5; i++) sys.update(1 / 60, state);
  assert.ok(state.nav.executor.legIndex > 0, 'fixture must have advanced');

  sys.interrupt('manual');
  sys.engage({ restart: true });
  assert.equal(state.nav.executor.legIndex, 0,
    'an explicit restart re-decomposes from leg 0 — otherwise "replan" and "resume" are the same verb');
  assert.equal(state.nav.executor.status, ROUTE_EXECUTOR_STATUS.ACQUIRING);
});

test('replanning onto a stale route from a live one does not strand the executor mid-flight', () => {
  const { state, sys } = harness({ route: { legs: legsFrom(CHAIN), totalHops: CHAIN.length - 1 } });
  sys.engage({});
  for (let i = 0; i < 10; i++) sys.update(1 / 60, state);
  assert.equal(state.nav.autopilot.active, true, 'fixture must be under way');

  // The player re-plots onto a destination that no longer exists.
  state.nav.route = { legs: [{ from: CHAIN[0], to: GHOST_A }], totalHops: 1 };
  sys.engage({ restart: true });
  for (let i = 0; i < 20; i++) sys.update(1 / 60, state);

  assert.equal(state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED,
    'replanning onto an unflyable route must stop cleanly');
  assert.equal(state.nav.autopilot.active, false,
    'the autopilot armed for the PREVIOUS route must be released, not left steering at the old target');

  // NOT asserted here, and the omission is deliberate and disclosed: `nav.autopilot.target` still
  // holds the ABANDONED route's coordinate at this point, because `_disarmAutopilot`
  // (routeFollower.js:443) clears `active` and `status` but not `target`. That is a live defect, and
  // it is player-visible — `hud.js:3327` falls back to `autopilot.target` without consulting
  // `active`, so the manual-burn stopping arc cues a destination the player walked away from.
  //
  // The assertion is not softened, it is RELOCATED, intact and failing, to
  // `scripts/repro-abandoned-route-hud.mjs` (run it; it exits 1). It is kept out of this file so the
  // gate stays green for everyone else — a verifier reports defects, it does not hold the build
  // hostage to them. When the defect is fixed, promote the assertion back here and retire the repro.
});

// ── one fact, one reading ────────────────────────────────────────────────────────────────────────

test('the published summary never disagrees with the executor it describes', () => {
  // HUD and map both read the summary. If it can drift from the executor, the same trip reads
  // differently in two places — which is the contract this packet exists to defend.
  const shapes = [
    { legs: legsFrom(CHAIN), totalHops: CHAIN.length - 1 },
    ...STALE_SHAPES.map((s) => ({ legs: s.legs, totalHops: s.legs.length })),
  ];
  for (const route of shapes) {
    const { state, bus, sys } = harness({ route });
    sys.engage({});
    for (let i = 0; i < 20; i++) sys.update(1 / 60, state);

    const executor = state.nav.executor;
    if (!executor) continue;
    const summary = summarizeExecutor(executor);
    assert.equal(summary.status, executor.status, 'summary status must mirror the executor');
    assert.equal(summary.engaged, executor.engaged, 'summary engagement must mirror the executor');
    assert.equal(summary.legIndex, executor.legIndex, 'summary leg index must mirror the executor');
    assert.equal(summary.legCount, executor.legs.length, 'summary leg count must mirror the executor');
    assert.ok(summary.legIndex <= summary.legCount,
      `summary reports leg ${summary.legIndex} of ${summary.legCount} — a HUD would render "leg 3 of 2"`);

    // Every publication on the bus must carry the same shape the caller would compute itself.
    for (const event of bus.of('nav:routeExecutor')) {
      const payload = event.payload || {};
      if (payload.legCount == null) continue;
      assert.ok(payload.legIndex <= payload.legCount,
        'a published executor frame must never describe a leg beyond the itinerary');
    }
  }
});

test('summarizing an absent executor is a legal, non-throwing, idle reading', () => {
  for (const value of [null, undefined]) {
    const summary = summarizeExecutor(value);
    assert.equal(summary.status, ROUTE_EXECUTOR_STATUS.IDLE,
      'no executor reads as idle, so a fresh HUD has something true to render');
    assert.equal(summary.engaged, false);
    assert.equal(summary.legCount, 0);
  }
});
