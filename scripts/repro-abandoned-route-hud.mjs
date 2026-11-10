#!/usr/bin/env node
// REGRESSION REPRODUCTION — not a gate. Run it to prove abandoned route guidance stays retired.
//
//   node scripts/repro-abandoned-route-hud.mjs
//
// This file began as the bounded D-2 defect reproduction. The product fix promoted its durable
// invariants into test/navigation-stale-route.test.mjs; this script remains as the seconds-scale
// end-to-end state reproduction and consumes the HUD's production truth helper.
//
// Two regressions are pinned here: the HUD reads executor.engaged while the route owns braking, and
// routeFollower retires its waypoint/target on abort, failed replan and interruption. Graded as an
// outcome from real post-transition state; the HUD calculation itself is not reimplemented here.

import assert from 'node:assert/strict';
import { routeFollower, ROUTE_EXECUTOR_STATUS } from '../src/systems/routeFollower.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import { travelTapeNavigationState } from '../src/ui/hud.js';

const ATLAS = buildAtlasIndex();
const GHOST = 'sector_removed_by_content_patch';
const failures = [];

function record(label, fn) {
  try {
    fn();
    console.log(`  ok   ${label}`);
  } catch (error) {
    failures.push({ label, message: error.message });
    console.log(`  FAIL ${label}`);
  }
}

function makeBus() {
  const handlers = new Map();
  return {
    on(n, f) { if (!handlers.has(n)) handlers.set(n, []); handlers.get(n).push(f); },
    emit(n, p) { for (const f of handlers.get(n) || []) f(p); },
  };
}

function harness(route, startSectorId = 'sector_helios_prime') {
  const player = { id: 'player', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 8 };
  const state = {
    playerId: 'player',
    entities: new Map([['player', player]]),
    nav: {
      route,
      autoTravel: true,
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
  return { state, sys };
}

/**
 * hud.js `updateTravelTape`, transcribed so this grades the SHIPPED expressions rather than a
 * paraphrase — including the reveal guard, which decides whether the approach row runs at all.
 *
 * The reveal guard matters and is easy to skip past. Per D5 Amendment 2 the tape is CONTEXTUAL:
 *
 *     const active      = driveState !== 'off';                  // hud.js:3284
 *     const nearCeiling = ceiling > 0 && speed >= ceiling * 0.8;  // hud.js:3285
 *     const want        = active || nearCeiling;                 // hud.js:3286
 *     if (!want && _vtapeAlpha <= 0.001) { ...clear...; return; } // hud.js:3295
 *
 * So a defect in the approach row is only player-visible in states where `want` is true. Grading the
 * approach expression WITHOUT this guard would over-claim: it would report a cue the player never
 * sees. Both states are therefore reported separately below.
 */
function hudTravelTape(state, { driveState = 'off', speed = 0, ceiling = 473 } = {}) {
  const nav = state.nav || {};
  const active = driveState !== 'off';
  const nearCeiling = ceiling > 0 && speed >= ceiling * 0.8;
  const want = active || nearCeiling;

  const { manual, arrival } = travelTapeNavigationState(nav);

  return {
    revealed: want,
    manual,
    arrival,
    // The approach row is only reached when the tape is revealed.
    showsArrivalCue: !!(want && manual && arrival),
  };
}

console.log('\nREGRESSION 1 — the HUD reads the route executor\'s real engagement field\n');

record('an engaged executor reads as route-owned rather than hand-flown', () => {
  const { state, sys } = harness({
    legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction' }], totalHops: 1,
  });
  sys.engage({});
  const executor = state.nav.executor;
  assert.equal(executor.engaged, true, 'precondition: the executor is engaged');
  assert.equal(hudTravelTape(state, { driveState: 'off', speed: 400, ceiling: 439 }).manual, false,
    'an engaged route owns braking even before the delegated autopilot arms');
});

console.log('\nREGRESSION 2 — an abandoned route cannot survive into the arrival cue\n');

/** Fly a route, then abandon it the given way. Returns the post-abandonment state. */
function abandonedRouteState(how) {
  const { state, sys } = harness({
    legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction' }], totalHops: 1,
  });
  sys.engage({});
  for (let i = 0; i < 10; i++) sys.update(1 / 60, state);
  assert.ok(state.nav.autopilot.target, 'precondition: the route armed a real target');

  if (how === 'replan') {
    state.nav.route = { legs: [{ from: 'sector_helios_prime', to: GHOST }], totalHops: 1 };
    sys.engage({ restart: true });
    for (let i = 0; i < 20; i++) sys.update(1 / 60, state);
    assert.equal(state.nav.executor.status, ROUTE_EXECUTOR_STATUS.INTERRUPTED,
      'precondition: the dead route interrupted cleanly');
  } else {
    sys.interrupt('manual');
  }
  return state;
}

// The realistic case. Aborting a route at travel speed is the ONLY way most players will ever abort
// one — you break off mid-transit, which is precisely when the ship is still near its ceiling and
// the tape is therefore revealed. `drive_reaction_m` ceiling is 439 WU/s (D5 amendment table), so
// 400 WU/s is a genuinely mid-transit speed and clears the 0.8x reveal threshold.
const TRAVEL_SPEED = { driveState: 'off', speed: 400, ceiling: 439 };
const AT_REST = { driveState: 'off', speed: 0, ceiling: 439 };

record('aborting mid-transit removes the BRAKE cue for the abandoned destination', () => {
  const state = abandonedRouteState('manual');
  const readout = hudTravelTape(state, TRAVEL_SPEED);
  assert.equal(readout.revealed, true, 'precondition: near the ceiling the tape IS revealed');
  assert.equal(readout.showsArrivalCue, false,
    'the player broke off this trip, yet the revealed tape computes an arrival cue at '
    + `(${readout.arrival?.x}, ${readout.arrival?.z}) — the abandoned route's target survived`
    + ' _disarmAutopilot, and hud.js:3327 consumes it without checking autopilot.active');
});

record('replanning onto a dead route does not cue the previous destination', () => {
  const state = abandonedRouteState('replan');
  const readout = hudTravelTape(state, TRAVEL_SPEED);
  assert.equal(readout.showsArrivalCue, false,
    `replanning left a cue at (${readout.arrival?.x}, ${readout.arrival?.z}) from the route the`
    + ' player just replaced');
});

record('at rest the tape is hidden and the abandoned target is retired', () => {
  const state = abandonedRouteState('manual');
  const readout = hudTravelTape(state, AT_REST);
  assert.equal(readout.revealed, false,
    'the contextual tape must stay hidden at rest with the drive off (D5 Amendment 2)');
  assert.equal(readout.showsArrivalCue, false,
    'a hidden tape shows nothing — this is what bounds the defect above to revealed states');
  assert.equal(state.nav.autopilot.target, null,
    'the route owner must retire its target rather than relying on the tape being hidden');
});

record('resuming after an interdiction does not cue the leg already flown', () => {
  // The compound edge case: pirates interdict, then the player resumes. During ACQUIRING the local
  // autopilot is not armed yet, but the executor still owns braking and the prior leg stays retired.
  const { state, sys } = harness({
    legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction' }], totalHops: 1,
  });
  sys.engage({});
  for (let i = 0; i < 10; i++) sys.update(1 / 60, state);
  sys.interrupt('combat');
  sys.engage({}); // resume

  const executor = state.nav.executor;
  assert.equal(executor.engaged, true, 'precondition: the follower is engaged again');
  assert.equal(state.nav.autopilot.active, false, 'precondition: the autopilot is not yet re-armed');

  const readout = hudTravelTape(state, TRAVEL_SPEED);
  assert.equal(readout.showsArrivalCue, false,
    `the resumed route must not cue a brake for the prior leg at (${readout.arrival?.x}, ${readout.arrival?.z})`);
});

record('control: a never-engaged nav cues nothing even when revealed (grader is not always-fail)', () => {
  const { state } = harness(null);
  const readout = hudTravelTape(state, TRAVEL_SPEED);
  assert.equal(readout.revealed, true, 'control is evaluated in the REVEALED state');
  assert.equal(readout.manual, true, 'a fresh nav is hand-flown');
  assert.equal(readout.showsArrivalCue, false,
    'with no route ever plotted there is no target to go stale, so no cue — the grader only fires'
    + ' when a real abandoned target exists');
});

console.log('');
if (failures.length) {
  console.error(`FAILED ${failures.length} abandoned-route regression assertion(s):\n`);
  for (const f of failures) console.error(`  - ${f.label}\n      ${f.message}\n`);
  console.error('The D-2 navigation/presentation regression has returned.');
  process.exit(1);
}
console.log('D-2 regression held: route ownership is truthful and abandoned guidance is retired.');
