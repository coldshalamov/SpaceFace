#!/usr/bin/env node
// BP-13/B13 Route Danger Feedback contract.
//
// Pirate route feedback is causal and bounded: ignored hot lanes become more dangerous, cleared
// named leaders suppress ambush scheduling and improve convoy weighting, and every shift announces
// its cause once through the station-news seam.
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import {
  ROUTE_DANGER_CLEAR_DELTA,
  ROUTE_DANGER_IGNORED_EVENTS,
  ROUTE_DANGER_MAX,
  pirateRumor,
  routeAdjustedEncounterPlan,
  routeAdjustedTrafficMix,
  routeDangerFeedbackForZone,
} from '../src/systems/pirateRumor.js';

assert.equal(typeof window, 'undefined', 'this check must run headless');
assert.equal(ROUTE_DANGER_IGNORED_EVENTS, 5, 'ignored-pirate feedback waits for sustained heat');
assert.ok(ROUTE_DANGER_MAX <= 0.75, 'route feedback stays bounded');
assert.ok(ROUTE_DANGER_CLEAR_DELTA < 0, 'leader clears lower route danger');

let sections = 0;
function ok(label) { sections++; console.log(`  PASS ${label}`); }

function guarded(fn) {
  const random = Math.random;
  const now = Date.now;
  Math.random = () => { throw new Error('Math.random in route danger feedback path'); };
  Date.now = () => { throw new Error('Date.now in route danger feedback path'); };
  try { return fn(); } finally { Math.random = random; Date.now = now; }
}

guarded(testLeaderClearSuppressesAmbushesAndBoostsConvoys);
guarded(testIgnoredAmbushesRaiseBoundedDanger);
guarded(testCauseNewsIsOneShot);

console.log(`[check-route-danger-feedback] PASS - ${sections} sections green`);

function boot(seed = 1319) {
  const sim = createSimulation({ seed, systems: [pirateRumor] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_pallas_drift';
  const log = { news: [] };
  bus.on('news:headline', (p) => log.news.push(p));
  return { sim, state, bus, log };
}

function samplePlan() {
  return [
    {
      encounterId: 'amb-1',
      shapeId: 'ambush_snare',
      kind: 'ambush_snare',
      script: 'ambush',
      deck: 'combat',
      zoneId: 'zone_pallas_ambush',
      dueAt: 100,
    },
    {
      encounterId: 'toll-1',
      shapeId: 'pirate_toll',
      kind: 'pirate_toll',
      script: 'toll',
      deck: 'combat',
      zoneId: 'zone_pallas_ambush',
      dueAt: 130,
    },
    {
      encounterId: 'convoy-1',
      shapeId: 'convoy_departure',
      kind: 'convoy_departure',
      script: 'convoy',
      deck: 'civilian',
      zoneId: 'zone_pallas_ambush',
      dueAt: 180,
    },
  ];
}

function countPirates(plan) {
  return plan.filter((item) => ['ambush_snare', 'pirate_toll', 'named_hunter', 'claim_threat'].includes(item.shapeId || item.kind)).length;
}

function testLeaderClearSuppressesAmbushesAndBoostsConvoys() {
  const t = boot();
  t.bus.emit('encounter:resolved', {
    shape: 'named_hunter',
    kind: 'named_hunter',
    outcome: 'killed',
    sectorId: 'sector_pallas_drift',
    zoneId: 'zone_pallas_ambush',
  });
  const feedback = routeDangerFeedbackForZone(t.state, 'sector_pallas_drift', 'zone_pallas_ambush');
  assert.ok(feedback.ambushWeightMult < 1, 'leader clear lowers ambush weight');
  assert.ok(feedback.convoyWeightMult > 1, 'leader clear raises convoy weight');

  const base = samplePlan();
  const adjusted = routeAdjustedEncounterPlan(t.state, base);
  assert.equal(countPirates(base), 2, 'test precondition has two pirate schedule items');
  assert.equal(countPirates(adjusted), 1, 'leader clear suppresses one pending pirate item for the next plan');
  const convoy = adjusted.find((item) => item.shapeId === 'convoy_departure');
  assert.ok(convoy.routeDangerFeedback.convoyWeightMult > 1, 'convoy item carries boosted route feedback');

  const mix = routeAdjustedTrafficMix(t.state, 'sector_pallas_drift', 'zone_pallas_ambush',
    { hauler: 30, courier: 18, miner: 16, patrol: 14, escort: 8, pirate: 5 });
  assert.ok(mix.hauler > 30, 'hauler/convoy mix is nudged upward');
  assert.ok(mix.escort > 8, 'escort/convoy support is nudged upward');
  ok('defeating a named leader lowers next-plan ambushes and boosts convoy weighting');
}

function testIgnoredAmbushesRaiseBoundedDanger() {
  const t = boot(1320);
  for (let i = 0; i < ROUTE_DANGER_IGNORED_EVENTS + 12; i++) {
    t.state.simTime = i * 12;
    t.bus.emit('encounter:spawned', {
      encounterId: `ignored-${i}`,
      kind: 'ambush_snare',
      sectorId: 'sector_pallas_drift',
      zoneId: 'zone_pallas_ambush',
      count: 3,
    });
  }
  const feedback = routeDangerFeedbackForZone(t.state, 'sector_pallas_drift', 'zone_pallas_ambush');
  assert.ok(feedback.ambushWeightMult > 1, 'ignored ambushes raise ambush weight');
  assert.ok(feedback.danger <= ROUTE_DANGER_MAX, 'ignored ambush feedback clamps at the max');
  const adjusted = routeAdjustedEncounterPlan(t.state, samplePlan());
  assert.ok(countPirates(adjusted) > countPirates(samplePlan()), 'ignored ambushes add one bounded pressure item');
  ok('sustained ignored ambushes raise bounded route danger');
}

function testCauseNewsIsOneShot() {
  const t = boot(1321);
  for (let i = 0; i < ROUTE_DANGER_IGNORED_EVENTS; i++) {
    t.state.simTime = i * 12;
    t.bus.emit('encounter:spawned', {
      encounterId: `news-${i}`,
      kind: 'ambush_snare',
      sectorId: 'sector_pallas_drift',
      zoneId: 'zone_pallas_ambush',
      count: 3,
    });
  }
  const routeNews = t.log.news.filter((p) => p.kind === 'route-feedback');
  assert.equal(routeNews.length, 1, 'route feedback emits exactly one cause headline on first shift');
  assert.match(routeNews[0].headline, /deadlier|raider/i, 'cause headline explains the danger shift');

  t.bus.emit('encounter:spawned', {
    encounterId: 'news-extra',
    kind: 'ambush_snare',
    sectorId: 'sector_pallas_drift',
    zoneId: 'zone_pallas_ambush',
    count: 3,
  });
  assert.equal(t.log.news.filter((p) => p.kind === 'route-feedback').length, 1,
    'same route shift does not spam news inside cooldown');
  ok('route danger shifts announce one cause line without news spam');
}
