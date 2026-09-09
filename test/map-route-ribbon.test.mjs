// test/map-route-ribbon.test.mjs — the route ribbon MODEL (Wave 2, Slice C).
//
// Unit-level companion to `check:map-information-depth`, which drives the mounted screen. This
// file pins the pure maths and the action matrix; the check pins reachability. Neither substitutes
// for the other — a passing unit test is explicitly not completion under the wired-features
// contract, and a DOM check cannot economically enumerate every state permutation.
//
// Every fixture mirrors a REAL producer: `world.computeRoute` returns
// `{legs:[{from,to,fuel,charge,interdict}], totalFuel, totalHops}` and `routeFollower.makeExecutor`
// writes `status` + a `legs` array. Fixtures shaped any other way are how the W2-D defect stayed
// invisible, so they are not used here.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveRouteRibbon,
  hazardBandFor,
  hazardLabelFor,
  formatDurationS,
  RIBBON_LEG_STATE,
  RIBBON_HAZARD,
  RIBBON_ACTION_IDS,
  MAP_ROUTE_RIBBON_SCHEMA,
} from '../src/ui/map/mapRouteRibbon.js';

const HELIOS = 'sector_helios_prime';
const CERES = 'sector_ceres_waypoint';
const TETHYS = 'sector_tethys_junction';

function route(hops = 2) {
  const ids = [HELIOS, CERES, TETHYS, 'sector_dione_lane'];
  const legs = [];
  for (let i = 0; i < hops; i++) {
    legs.push({ from: ids[i], to: ids[i + 1], fuel: 14 - i * 2, charge: 6 - i, interdict: 0.05 + i * 0.2 });
  }
  return { legs, totalFuel: legs.reduce((s, l) => s + l.fuel, 0), totalHops: legs.length };
}

/** The map's executor ADAPTER output (`readRouteExecutorForMap`), which is what the ribbon takes. */
function executor(status, { legIndex = 0, hops = 2, interruptReason = null, resolved = true } = {}) {
  const r = route(hops);
  return {
    status,
    engaged: status !== 'idle',
    legIndex,
    legCount: r.legs.length,
    destinationSectorId: r.legs[r.legs.length - 1].to,
    legLabel: `Gate to ${r.legs[legIndex] ? r.legs[legIndex].to : ''}`,
    legFrom: r.legs[legIndex] ? r.legs[legIndex].from : null,
    legTo: r.legs[legIndex] ? r.legs[legIndex].to : null,
    interruptReason,
    legTarget: { x: 1000, z: 0 },
    legs: r.legs.map((leg, index) => ({
      index,
      fromSectorId: leg.from,
      toSectorId: leg.to,
      label: `Gate to ${leg.to}`,
      resolved,
      final: index === r.legs.length - 1,
      target: { x: 1000 * (index + 1), z: 0 },
    })),
  };
}

// --- contextual visibility -------------------------------------------------------------------

test('no route means NOT VISIBLE — the ribbon is contextual, never a permanent panel', () => {
  const r = resolveRouteRibbon();
  assert.equal(r.schema, MAP_ROUTE_RIBBON_SCHEMA);
  assert.equal(r.visible, false);
  assert.ok(r.reason.length > 0, 'even the invisible state publishes words, for the Travel tab');
  assert.deepEqual(r.legs, []);
  assert.equal(r.eta.available, false);
});

test('a plotted route becomes visible without being engaged', () => {
  const r = resolveRouteRibbon({ route: route(3) });
  assert.equal(r.visible, true);
  assert.equal(r.live, false);
  assert.equal(r.legs.length, 3);
  assert.match(r.reason, /3 legs plotted/);
  assert.equal(r.activeLegIndex, -1, 'nothing is being flown, so no leg is active');
});

test('resolveRouteRibbon never returns null and never throws on junk', () => {
  assert.doesNotThrow(() => resolveRouteRibbon(null));
  assert.doesNotThrow(() => resolveRouteRibbon({ route: 'nonsense', executor: 42 }));
  assert.ok(resolveRouteRibbon(undefined));
});

// --- leg progress ------------------------------------------------------------------------------

test('legs before legIndex are done, legIndex is active, the rest are ahead', () => {
  const r = resolveRouteRibbon({ route: route(3), executor: executor('transiting', { legIndex: 1, hops: 3 }) });
  assert.deepEqual(r.legs.map((l) => l.state), [
    RIBBON_LEG_STATE.DONE, RIBBON_LEG_STATE.ACTIVE, RIBBON_LEG_STATE.AHEAD,
  ]);
  assert.equal(r.activeLegIndex, 1);
  assert.equal(r.totals.legsRemaining, 2);
});

test('fuel remaining excludes flown legs; the total stays the whole trip', () => {
  const plan = route(3); // 14 + 12 + 10 = 36
  const r = resolveRouteRibbon({ route: plan, executor: executor('transiting', { legIndex: 1, hops: 3 }) });
  assert.equal(r.totals.fuel, 36, 'the total is the route as planned');
  assert.equal(r.totals.fuelRemaining, 22, 'remaining drops the flown leg only');
});

test('an unresolved leg is surfaced BEFORE the follower turns it into an interruption', () => {
  const r = resolveRouteRibbon({ route: route(2), executor: executor('acquiring', { resolved: false }) });
  assert.equal(r.legs.every((l) => l.resolved === false), true);
});

test('the executor label wins over the bare sector name — it names the object being flown to', () => {
  const r = resolveRouteRibbon({ route: route(2), executor: executor('transiting') });
  assert.match(r.legs[0].label, /^Gate to /);
});

// --- arrival and destination -------------------------------------------------------------------

test('arrival is the final leg destination, and the trip never orphans it', () => {
  const r = resolveRouteRibbon({ route: route(3), sectorNames: { sector_dione_lane: 'Dione Lane' } });
  assert.equal(r.arrival.sectorId, 'sector_dione_lane');
  assert.equal(r.arrival.name, 'Dione Lane');
  assert.match(r.arrival.label, /^Arrive Dione Lane$/);
});

test('sector names resolve from a Map as well as a plain object', () => {
  const names = new Map([[TETHYS, 'Tethys Junction']]);
  const r = resolveRouteRibbon({ route: route(2), sectorNames: names });
  assert.equal(r.legs[1].toName, 'Tethys Junction');
  const bare = resolveRouteRibbon({ route: route(2) });
  assert.equal(bare.legs[1].toName, TETHYS, 'an unknown id falls back to the id, never to blank');
});

// --- interruption ------------------------------------------------------------------------------

test('interruption carries its reason and stays resumable', () => {
  const r = resolveRouteRibbon({
    route: route(2),
    executor: executor('interrupted', { legIndex: 1, interruptReason: 'combat_hit' }),
  });
  assert.equal(r.interruption.active, true);
  assert.equal(r.interruption.resumable, true, 'an interrupted executor keeps its legs and legIndex');
  assert.match(r.interruption.label, /combat hit/i, 'underscores must not leak into player-facing text');
});

test('an interrupted route does not report itself as FLYING', () => {
  // It is neither idle nor arrived, so it is technically "live" — but the ship is not flying it,
  // and saying so would be a plain lie to the pilot.
  const r = resolveRouteRibbon({
    route: route(2),
    executor: executor('interrupted', { legIndex: 1, interruptReason: 'combat' }),
  });
  assert.ok(!/flying/i.test(r.reason), 'interruption owns the headline, not leg progress');
  assert.match(r.reason, /interrupted/i);
});

// --- ETA honesty -------------------------------------------------------------------------------

test('ETA is exactly distance over speed, and carries its qualifier', () => {
  const r = resolveRouteRibbon({
    route: route(2),
    executor: executor('transiting'),
    playerGlobal: { x: 0, z: 0 },
    playerSpeedWUs: 50,
  });
  assert.equal(r.nextWaypoint.distanceWU, 1000);
  assert.equal(r.eta.available, true);
  assert.equal(r.eta.seconds, 20);
  assert.match(r.eta.reason, /current speed/i, 'an estimate without its qualifier overstates certainty');
});

test('a stationary ship gets a REFUSAL with a reason, never a fabricated number', () => {
  const r = resolveRouteRibbon({
    route: route(2), executor: executor('transiting'),
    playerGlobal: { x: 0, z: 0 }, playerSpeedWUs: 0,
  });
  assert.equal(r.eta.available, false);
  assert.equal(r.eta.seconds, null);
  assert.equal(r.eta.label, '—');
  assert.ok(r.eta.reason.length > 0);
});

test('no active leg means no ETA — a plotted route is not an in-progress one', () => {
  const r = resolveRouteRibbon({ route: route(2), playerSpeedWUs: 200 });
  assert.equal(r.eta.available, false);
  assert.match(r.eta.reason, /engage/i);
});

test('align time is the summed authored charge of REMAINING legs only', () => {
  // charge = 6, 5 for a 2-hop route.
  const all = resolveRouteRibbon({ route: route(2) });
  assert.equal(all.totals.chargeS, 11);
  const half = resolveRouteRibbon({ route: route(2), executor: executor('transiting', { legIndex: 1 }) });
  assert.equal(half.totals.chargeS, 5, 'a flown leg no longer costs align time');
});

// --- the action matrix: the "never fake an action" contract ------------------------------------

test('every action carries a reason in BOTH states, and only available ones carry an event', () => {
  const cases = [
    resolveRouteRibbon(),
    resolveRouteRibbon({ route: route(2) }),
    resolveRouteRibbon({ route: route(2), executor: executor('acquiring') }),
    resolveRouteRibbon({ route: route(2), executor: executor('transiting') }),
    resolveRouteRibbon({ route: route(2), executor: executor('approaching') }),
    resolveRouteRibbon({ route: route(2), executor: executor('interrupted') }),
    resolveRouteRibbon({ route: route(2), executor: executor('arrived') }),
  ];
  for (const r of cases) {
    for (const id of RIBBON_ACTION_IDS) {
      const a = r.actions[id];
      assert.ok(a, `${id} must always be resolved`);
      assert.ok(a.reason && a.reason.length > 0, `${id} must explain itself in both states`);
      if (!a.available) assert.equal(a.event, null, `${id}: an unavailable action must not carry an event`);
      else assert.ok(a.event, `${id}: an available action must name its event`);
    }
  }
});

test('PAUSE is permanently unavailable and names the shipped equivalent', () => {
  for (const status of ['acquiring', 'transiting', 'approaching', 'interrupted', 'arrived', 'idle']) {
    const r = resolveRouteRibbon({ route: route(2), executor: executor(status) });
    assert.equal(r.actions.pause.available, false,
      `pause must never be available (${status}) — routeFollower has no hold verb`);
    assert.equal(r.actions.pause.event, null);
    assert.match(r.actions.pause.reason, /Disengage/,
      'refusing is only honest if it names what the player should do instead');
  }
});

test('engage / disengage / resume track real executor status', () => {
  const plotted = resolveRouteRibbon({ route: route(2) });
  assert.equal(plotted.actions.engage.available, true);
  assert.equal(plotted.actions.engage.event, 'nav:engageRoute');
  assert.equal(plotted.actions.disengage.available, false);

  const flying = resolveRouteRibbon({ route: route(2), executor: executor('transiting') });
  assert.equal(flying.actions.engage.available, false, 'you cannot engage what is already engaged');
  assert.equal(flying.actions.disengage.available, true);
  assert.equal(flying.actions.disengage.event, 'nav:abortRoute');
  assert.equal(flying.actions.resume.available, false);

  const stopped = resolveRouteRibbon({ route: route(2), executor: executor('interrupted') });
  assert.equal(stopped.actions.resume.available, true);
  assert.equal(stopped.actions.resume.event, 'nav:engageRoute', 'resume re-engages rather than re-plotting');

  const done = resolveRouteRibbon({ route: route(2), executor: executor('arrived', { legIndex: 1 }) });
  assert.equal(done.actions.disengage.available, false, 'an arrived route is not being flown');
});

test('with no route at all, nothing is available and engage says why', () => {
  const r = resolveRouteRibbon();
  for (const id of RIBBON_ACTION_IDS) assert.equal(r.actions[id].available, false);
  assert.match(r.actions.engage.reason, /no route plotted/i);
});

// --- hazard grammar (non-colour semantics) ------------------------------------------------------

test('interdiction bands are words as well as thresholds', () => {
  assert.equal(hazardBandFor(0), RIBBON_HAZARD.CALM);
  assert.equal(hazardBandFor(0.14), RIBBON_HAZARD.CALM);
  assert.equal(hazardBandFor(0.15), RIBBON_HAZARD.WATCHED);
  assert.equal(hazardBandFor(0.34), RIBBON_HAZARD.WATCHED);
  assert.equal(hazardBandFor(0.35), RIBBON_HAZARD.CONTESTED);
  assert.equal(hazardBandFor(NaN), RIBBON_HAZARD.CALM, 'junk must not become a false alarm');
  for (const band of Object.values(RIBBON_HAZARD)) {
    assert.ok(hazardLabelFor(band).length > 0, 'every band has a readable label, not only a colour');
  }
});

test('each leg publishes its band AND its label', () => {
  const r = resolveRouteRibbon({ route: route(3) }); // interdict 0.05, 0.25, 0.45
  assert.deepEqual(r.legs.map((l) => l.hazard), [
    RIBBON_HAZARD.CALM, RIBBON_HAZARD.WATCHED, RIBBON_HAZARD.CONTESTED,
  ]);
  assert.deepEqual(r.legs.map((l) => l.hazardLabel), ['Calm', 'Watched', 'Contested']);
});

// --- formatting ----------------------------------------------------------------------------------

test('durations format without ever emitting a bare NaN', () => {
  assert.equal(formatDurationS(0), '0s');
  assert.equal(formatDurationS(45), '45s');
  assert.equal(formatDurationS(60), '1m');
  assert.equal(formatDurationS(137), '2m 17s');
  assert.equal(formatDurationS(3600), '1h 0m');
  assert.equal(formatDurationS(NaN), '—');
  assert.equal(formatDurationS(-5), '—');
});

// --- purity ---------------------------------------------------------------------------------------

test('the record is frozen and the inputs are never mutated', () => {
  const plan = route(2);
  const snapshot = JSON.stringify(plan);
  const exec = executor('transiting');
  const execSnapshot = JSON.stringify(exec);
  const r = resolveRouteRibbon({ route: plan, executor: exec, playerGlobal: { x: 0, z: 0 }, playerSpeedWUs: 10 });
  assert.equal(Object.isFrozen(r), true);
  assert.equal(Object.isFrozen(r.legs), true);
  assert.equal(Object.isFrozen(r.actions), true);
  assert.equal(Object.isFrozen(r.eta), true);
  assert.equal(JSON.stringify(plan), snapshot, 'the plan must not be mutated');
  assert.equal(JSON.stringify(exec), execSnapshot, 'the executor must not be mutated');
});

test('ALL coordinates out of this module are GLOBAL — there is no drawPos anywhere (ADR D2.1)', () => {
  const r = resolveRouteRibbon({ route: route(2), executor: executor('transiting'), playerGlobal: { x: 0, z: 0 } });
  assert.equal(JSON.stringify(r).includes('drawPos'), false,
    'a draw-frame coordinate in an actionable-frame model is the exact defect this program exists to fix');
  assert.deepEqual(r.nextWaypoint.globalPos, { x: 1000, z: 0 });
});
