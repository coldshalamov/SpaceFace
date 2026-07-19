#!/usr/bin/env node
// DEFECT REPRODUCTION — not a gate. Run it; it exits 1 while the defect is live.
//
//   node scripts/repro-abandoned-route-hud.mjs
//
// This file exists so that two navigation defects found by packet E-2 are provable on demand rather
// than asserted in prose. It is deliberately NOT registered in any aggregate: a red gate would block
// the whole tree, and a verifier does not get to hold the build hostage to make a point. The
// assertions below were NOT weakened to go green anywhere else — they live here, intact, and they
// fail. `test/navigation-stale-route.test.mjs` carries only the invariants that genuinely hold.
//
// ── DEFECT 1 — the HUD reads a field the executor never sets ─────────────────────────────────────
//
// `src/ui/hud.js:3325`:   const executorActive = !!(nav.executor && nav.executor.active);
//
// The route executor has no `active` field. It has `engaged` (`routeFollower.js:175/275/307/577`),
// and `summarizeExecutor` publishes `engaged`. `executor.active` is read in exactly one place in the
// codebase and written in none, so `executorActive` is permanently false.
//
// The line's own comment states the intent: "The follower auto-brakes, so its arc would be noise.
// Only a hand-flown approach gets this." That suppression is therefore load-bearing and currently
// rests entirely on the autopilot flag next to it. Whenever the follower owns the ship but has not
// got the autopilot armed — between legs, while acquiring, during transit before handoff — the HUD
// concludes the player is hand-flying.
//
// ── DEFECT 2 — an abandoned route's destination survives into the arrival cue ────────────────────
//
// `_disarmAutopilot` (`routeFollower.js:443`) clears `active` and `status` but leaves `target`.
// `hud.js:3327` falls back to `nav.autopilot.target` whenever no waypoint is set, without consulting
// `active`. So after aborting or replanning a route, the manual-burn stopping arc and its BRAKE NOW
// cue are computed against the destination the player just walked away from.
//
// Graded as an OUTCOME, not as an internal call sequence: the check below recomputes hud.js's own
// three expressions verbatim from real post-replan state and asks whether the player is shown an
// arrival cue for an abandoned destination.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { routeFollower, ROUTE_EXECUTOR_STATUS } from '../src/systems/routeFollower.js';
import { buildAtlasIndex } from '../src/core/atlasIndex.js';

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

  const autopilotActive = !!(nav.autopilot && nav.autopilot.active);
  const executorActive = !!(nav.executor && nav.executor.active);
  const manual = !autopilotActive && !executorActive;
  const wp = nav.waypoint && nav.waypoint.pos ? nav.waypoint.pos : (nav.autopilot && nav.autopilot.target);
  const arrival = wp && Number.isFinite(wp.x) && Number.isFinite(wp.z)
    ? { x: wp.x, z: wp.z, radius: Math.max(0, Number(nav.autopilot && nav.autopilot.arrivalRadius) || 36) }
    : null;

  return {
    revealed: want,
    manual,
    arrival,
    // The approach row is only reached when the tape is revealed.
    showsArrivalCue: !!(want && manual && arrival),
  };
}

console.log('\nDEFECT 1 — hud.js reads nav.executor.active, which nothing writes\n');

record('the shipped HUD line still reads `nav.executor.active`', () => {
  const hud = readFileSync(new URL('../src/ui/hud.js', import.meta.url), 'utf8');
  assert.match(hud, /nav\.executor && nav\.executor\.active/,
    'if this no longer matches, the defect may already be fixed — re-verify and retire this repro');
});

record('`executor.active` is never assigned anywhere in src/', () => {
  const follower = readFileSync(new URL('../src/systems/routeFollower.js', import.meta.url), 'utf8');
  assert.doesNotMatch(follower, /executor\.active\s*=/,
    'executor.active is assigned after all — re-verify the defect');
  assert.match(follower, /engaged\s*=\s*true/, 'the real field is `engaged`');
});

record('DEFECT: an engaged executor reads as inactive to the HUD', () => {
  const { state, sys } = harness({
    legs: [{ from: 'sector_helios_prime', to: 'sector_tethys_junction' }], totalHops: 1,
  });
  sys.engage({});
  const executor = state.nav.executor;
  assert.equal(executor.engaged, true, 'precondition: the executor is engaged');
  assert.equal(!!executor.active, true,
    `the HUD asks for executor.active and gets ${JSON.stringify(executor.active)} while engaged===true`
    + ' — so `executorActive` is false and the HUD believes the ship is hand-flown');
});

console.log('\nDEFECT 2 — an abandoned route\'s target survives into the arrival cue\n');

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

record('DEFECT: aborting mid-transit leaves a BRAKE cue for the ABANDONED destination', () => {
  const state = abandonedRouteState('manual');
  const readout = hudTravelTape(state, TRAVEL_SPEED);
  assert.equal(readout.revealed, true, 'precondition: near the ceiling the tape IS revealed');
  assert.equal(readout.showsArrivalCue, false,
    'the player broke off this trip, yet the revealed tape computes an arrival cue at '
    + `(${readout.arrival?.x}, ${readout.arrival?.z}) — the abandoned route's target survived`
    + ' _disarmAutopilot, and hud.js:3327 consumes it without checking autopilot.active');
});

record('DEFECT: replanning onto a dead route mid-transit cues the abandoned destination too', () => {
  const state = abandonedRouteState('replan');
  const readout = hudTravelTape(state, TRAVEL_SPEED);
  assert.equal(readout.showsArrivalCue, false,
    `replanning left a cue at (${readout.arrival?.x}, ${readout.arrival?.z}) from the route the`
    + ' player just replaced');
});

record('SCOPE: at rest with the drive off the tape is hidden, so the stale target is latent only', () => {
  const state = abandonedRouteState('manual');
  const readout = hudTravelTape(state, AT_REST);
  assert.equal(readout.revealed, false,
    'the contextual tape must stay hidden at rest with the drive off (D5 Amendment 2)');
  assert.equal(readout.showsArrivalCue, false,
    'a hidden tape shows nothing — this is what bounds the defect above to revealed states');
  // The stale target is still SITTING there; it is simply not being drawn in this state.
  assert.ok(state.nav.autopilot.target,
    'the residual target persists regardless — only its visibility is state-dependent');
});

record('DEFECT (compound): resuming after an interdiction cues the leg already flown', () => {
  // The realistic sequence both defects meet in: on a route, pirates interdict (`combat:hit` ->
  // interrupt), the player re-engages. `engage()` resumes into ACQUIRING with `armedLegIndex` reset,
  // so the autopilot is not armed yet — but `_disarmAutopilot` left the PREVIOUS leg's target in
  // place. Defect 1 means the engaged executor cannot tell the HUD it owns the ship, so the HUD
  // reads "hand-flown"; defect 2 supplies the stale coordinate. At travel speed the tape is up, and
  // the player is told to brake for a waypoint already behind them while the follower is flying.
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
    'the route follower owns the ship, yet the HUD reads hand-flown (executor.active is undefined)'
    + ` and cues a brake for (${readout.arrival?.x}, ${readout.arrival?.z}) — the leg already flown`);
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
  console.error(`REPRODUCED ${failures.length} defect assertion(s):\n`);
  for (const f of failures) console.error(`  - ${f.label}\n      ${f.message}\n`);
  console.error('These are FINDINGS for the navigation and presentation lanes, not verifier tasks.');
  process.exit(1);
}
console.log('No defect reproduced — both navigation defects appear fixed. Retire this file and');
console.log('promote its assertions into test/navigation-stale-route.test.mjs.');
