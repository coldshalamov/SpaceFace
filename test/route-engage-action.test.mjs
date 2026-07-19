// W1-8 — plot and engage are SEPARATE actions, and engage is reachable on the default route.
//
// This is the wired-features pin for the route follower. Before it existed, nothing in production
// emitted `nav:engageRoute`: the follower was registered, unit-proven and unreachable, which is the
// "producer landed, consumer did not" pattern the atlas ledger tracks (S0-7, the RCS renderer).
// The point of these assertions is that the player can actually get at it, and that an unavailable
// action explains itself rather than silently doing nothing.

// ─── FIXTURE CORRECTION (W2-D, 2026-07-19) ───────────────────────────────────────────────────
//
// Every executor fixture below used to be hand-built as `{phase, legCount}` and every route as
// `{path:[...]}`. **No producer in the tree writes any of those three fields.** The fixtures
// encoded a contract that existed only inside this file, so the suite stayed green while
// `resolveRouteEngageAction` was structurally unable to see a live route: Disengage and Resume were
// unreachable in game. The fixtures now come from `makeRealExecutor` / `makeRealRoute`, which mirror
// `routeFollower.makeExecutor` and `world.computeRoute` field for field, and a contract test below
// re-derives the field names from those two producers so this cannot drift silently again.
//
// This is a CORRECTION, not a weakening: every original assertion is still made, on the same
// behaviour, plus new ones. No assertion was loosened and no golden was touched.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveRouteEngageAction,
  emitRouteEngageAction,
  emitGalaxyMapPrimaryAction,
} from '../src/ui/galaxyMap.js';
import { ROUTE_EXECUTOR_SCHEMA, ROUTE_EXECUTOR_STATUS, summarizeExecutor } from '../src/systems/routeFollower.js';

const MAP_SOURCE = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');
const FOLLOWER_SOURCE = readFileSync(new URL('../src/systems/routeFollower.js', import.meta.url), 'utf8');
const WORLD_SOURCE = readFileSync(new URL('../src/systems/world.js', import.meta.url), 'utf8');

function busSpy() {
  const events = [];
  return { events, emit: (type, payload) => events.push({ type, payload }) };
}

/** Mirrors `world.computeRoute`'s return value (world.js:2166) — `{legs, totalFuel, totalHops}`. */
function makeRealRoute(hops = 2) {
  const ids = ['sector_helios_prime', 'sector_tethys_junction', 'sector_dione_lane', 'sector_kore_reach'];
  const legs = [];
  for (let i = 0; i < hops; i++) {
    legs.push({ from: ids[i], to: ids[i + 1], fuel: 12 - i, charge: 3, interdict: 0.1 * (i + 1) });
  }
  return { legs, totalFuel: legs.reduce((s, l) => s + l.fuel, 0), totalHops: legs.length };
}

/** Mirrors `routeFollower.makeExecutor` (routeFollower.js:171) — `status` + a `legs` ARRAY. */
function makeRealExecutor(status, { legIndex = 0, hops = 2, interruptReason = null } = {}) {
  const route = makeRealRoute(hops);
  return {
    schema: ROUTE_EXECUTOR_SCHEMA,
    status,
    engaged: status !== ROUTE_EXECUTOR_STATUS.IDLE,
    legIndex,
    legs: route.legs.map((leg, index) => ({
      index,
      fromSectorId: leg.from,
      toSectorId: leg.to,
      final: index === route.legs.length - 1,
      resolved: true,
      targetNodeId: `gate_${leg.from}__${leg.to}`,
      targetKind: 'gate',
      target: { x: 1000 * (index + 1), z: 500 * (index + 1) },
      arrivalRadius: 260,
      label: `Gate to ${leg.to}`,
    })),
    destinationSectorId: route.legs[route.legs.length - 1].to,
    armedLegIndex: legIndex,
    interruptReason,
    brakeMode: null,
    handoffWU: null,
  };
}

// --- availability matrix ---------------------------------------------------------------------

test('no route plotted: engage is visible, disabled, and SAYS WHY', () => {
  const a = resolveRouteEngageAction({ nav: { route: null } });
  assert.equal(a.visible, true, 'the control must not vanish — a hidden action teaches nothing');
  assert.equal(a.enabled, false);
  assert.equal(a.event, null, 'a disabled action must carry no event, so it cannot fire');
  assert.match(a.reason, /no route plotted/i);
});

test('a plotted route offers engage, and reports how many legs', () => {
  const a = resolveRouteEngageAction({ nav: { route: makeRealRoute(3) } });
  assert.equal(a.enabled, true);
  assert.equal(a.event, 'nav:engageRoute');
  assert.match(a.reason, /3 legs/);
});

test('one leg is not pluralised', () => {
  const a = resolveRouteEngageAction({ nav: { route: makeRealRoute(1) } });
  assert.match(a.reason, /1 leg\b/);
});

test('while transiting, the control becomes the way OUT so a pilot is never trapped', () => {
  const a = resolveRouteEngageAction({
    nav: { route: makeRealRoute(2), executor: makeRealExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING, { legIndex: 0 }) },
  });
  assert.equal(a.enabled, true);
  assert.equal(a.label, 'Disengage');
  assert.equal(a.event, 'nav:abortRoute');
  assert.match(a.reason, /leg 1\/2/, 'progress must be legible from the control itself');
});

test('an interrupted route offers RESUME, and says the itinerary was kept', () => {
  const a = resolveRouteEngageAction({
    nav: {
      route: makeRealRoute(2),
      executor: makeRealExecutor(ROUTE_EXECUTOR_STATUS.INTERRUPTED, { legIndex: 1, interruptReason: 'combat' }),
    },
  });
  assert.equal(a.label, 'Resume Route');
  assert.equal(a.event, 'nav:engageRoute', 'resuming re-engages rather than re-plotting');
  assert.match(a.reason, /itinerary kept/i, 'interruption must never read as a lost route');
  assert.match(a.reason, /combat/i, 'why it stopped is the pilot\'s next decision — say it');
});

test('an arrived or idle executor falls back to the plot-first state', () => {
  for (const status of [ROUTE_EXECUTOR_STATUS.IDLE, ROUTE_EXECUTOR_STATUS.ARRIVED]) {
    const a = resolveRouteEngageAction({ nav: { route: null, executor: makeRealExecutor(status) } });
    assert.equal(a.enabled, false, `status ${status} with no route must not offer engage`);
  }
});

// --- the regression that made every assertion above vacuous -----------------------------------

test('EVERY executor status the follower can reach is distinguishable from merely-plotted', () => {
  // The defect this pins: reading a field no producer writes made transiting, interrupted and
  // plotted collapse onto one identical action. Assert they are all DIFFERENT, so a future reader
  // that silently sees `undefined` fails here instead of shipping an inert button.
  const plotted = resolveRouteEngageAction({ nav: { route: makeRealRoute(2), executor: null } });
  assert.equal(plotted.label, 'Engage Route');

  const live = [
    ROUTE_EXECUTOR_STATUS.ACQUIRING,
    ROUTE_EXECUTOR_STATUS.TRANSITING,
    ROUTE_EXECUTOR_STATUS.APPROACHING,
  ];
  for (const status of live) {
    const a = resolveRouteEngageAction({
      nav: { route: makeRealRoute(2), executor: makeRealExecutor(status) },
    });
    assert.equal(a.label, 'Disengage', `${status} must offer the way out, not another engage`);
    assert.equal(a.event, 'nav:abortRoute');
    assert.notEqual(a.reason, plotted.reason, `${status} must not read as an un-engaged route`);
  }

  const interrupted = resolveRouteEngageAction({
    nav: { route: makeRealRoute(2), executor: makeRealExecutor(ROUTE_EXECUTOR_STATUS.INTERRUPTED) },
  });
  assert.notEqual(interrupted.label, plotted.label);
});

test('the fixtures are shaped the way the REAL producer reads them', () => {
  // The strongest available guard short of booting a world: run the fixture through
  // `summarizeExecutor`, routeFollower's own exported reader. It reads `executor.status` and
  // `executor.legs`. If these fixtures drifted back to the phantom `{phase, legCount}` shape, the
  // summary would come back with a null status and a zero leg count instead of throwing — so
  // assert on the VALUES, which is exactly what the old fixtures could never have satisfied.
  const executor = makeRealExecutor(ROUTE_EXECUTOR_STATUS.TRANSITING, { legIndex: 1, hops: 3 });
  const summary = summarizeExecutor(executor);
  assert.equal(summary.status, ROUTE_EXECUTOR_STATUS.TRANSITING, 'the follower must recognise our status field');
  assert.equal(summary.legCount, 3, 'the follower must recognise our legs array');
  assert.equal(summary.legIndex, 1);
  assert.equal(summary.engaged, true);
  assert.equal(summary.legFrom, 'sector_tethys_junction', 'leg identity must survive the real reader');

  // Control: the shape the fixtures USED to use is not readable by the real producer at all.
  const phantom = summarizeExecutor({ phase: 'transiting', legIndex: 1, legCount: 3 });
  assert.equal(phantom.status, undefined, 'proof the old fixture shape was never the real contract');
  assert.equal(phantom.legCount, 0, 'proof the old fixture shape was never the real contract');
});

test('the map does not read any field the producers do not write', () => {
  // world.computeRoute returns `{ legs, totalFuel, totalHops: legs.length }` (world.js:2168) —
  // pinned narrowly on the part the map depends on, so cosmetic edits to the other keys are free.
  assert.match(WORLD_SOURCE, /return \{ legs, totalFuel,/,
    'computeRoute must keep returning `legs` — the map counts it for the plotted-route reason');
  assert.ok(!/^\s*phase:/m.test(FOLLOWER_SOURCE),
    'routeFollower must not introduce a `phase` field without the map being updated with it');

  // And the consumer must not drift back to the phantom shape. Scoped to the body of the function
  // under test: `legCount` is a legitimate field ON THE ADAPTER OUTPUT (`readRouteExecutorForMap`
  // synthesises it), so a whole-file grep would be a false positive. What must never come back is
  // reading those names off the RAW PERSISTED `nav.executor`.
  const body = resolveRouteEngageActionSource();
  assert.ok(!/executor\.phase/.test(body),
    'resolveRouteEngageAction must not read `executor.phase`: no producer writes it (W2-D regression)');
  assert.ok(!/executor\.legCount/.test(body),
    'resolveRouteEngageAction must not read `executor.legCount`: the persisted executor stores a `legs` array');
  assert.ok(!/route\.path\b/.test(body),
    'resolveRouteEngageAction must not read `route.path`: computeRoute returns `legs` (W2-D regression)');
  assert.match(body, /executor\.status/, 'it must read the field the follower actually writes');
});

/** The source text of `resolveRouteEngageAction` alone, so shape pins cannot false-positive on
 *  unrelated code elsewhere in a 7.9k-line file. */
function resolveRouteEngageActionSource() {
  const start = MAP_SOURCE.indexOf('export function resolveRouteEngageAction');
  assert.ok(start > 0, 'resolveRouteEngageAction must still exist and be exported');
  const end = MAP_SOURCE.indexOf('\nfunction titleCasePhase', start);
  assert.ok(end > start, 'expected titleCasePhase to still follow resolveRouteEngageAction');
  return MAP_SOURCE.slice(start, end);
}

test('a missing nav subtree hides the control instead of throwing', () => {
  const a = resolveRouteEngageAction({});
  assert.equal(a.visible, false);
  assert.equal(a.event, null);
  assert.doesNotThrow(() => resolveRouteEngageAction(undefined));
});

// --- the separation itself -------------------------------------------------------------------

test('PLOT does not engage: the primary action never emits nav:engageRoute', () => {
  const bus = busSpy();
  emitGalaxyMapPrimaryAction(bus, {
    kind: 'course',
    coursePayload: { type: 'sector', sectorId: 'sector_tethys_junction', label: 'Tethys Junction' },
  });
  const types = bus.events.map((e) => e.type);
  assert.ok(types.includes('world:requestRoute'), 'plotting must compute the route');
  assert.ok(
    !types.includes('nav:engageRoute'),
    'plotting must NOT start flying it — plot and engage are separate acts (ADR D6)',
  );
});

test('ENGAGE emits nav:engageRoute, the follower trigger', () => {
  const bus = busSpy();
  const action = resolveRouteEngageAction({ nav: { route: makeRealRoute(2) } });
  assert.equal(emitRouteEngageAction(bus, action), true);
  assert.deepEqual(bus.events.map((e) => e.type), ['nav:engageRoute']);
});

test('DISENGAGE emits nav:abortRoute with a manual reason', () => {
  const bus = busSpy();
  const action = resolveRouteEngageAction({
    nav: {
      route: makeRealRoute(1),
      executor: makeRealExecutor(ROUTE_EXECUTOR_STATUS.APPROACHING, { legIndex: 0, hops: 1 }),
    },
  });
  assert.equal(emitRouteEngageAction(bus, action), true);
  assert.equal(bus.events[0].type, 'nav:abortRoute');
  assert.equal(bus.events[0].payload.reason, 'manual');
});

test('a disabled action FAILS CLOSED — it can never fire a fake success', () => {
  const bus = busSpy();
  const action = resolveRouteEngageAction({ nav: { route: null } });
  assert.equal(emitRouteEngageAction(bus, action), false);
  assert.equal(bus.events.length, 0, 'not one event may escape from an unavailable action');
  assert.equal(emitRouteEngageAction(bus, null), false);
  assert.equal(emitRouteEngageAction(null, action), false);
});

// --- reachability on the default route --------------------------------------------------------

test('the engage control is wired into the shipped map DOM, not a hidden candidate', () => {
  assert.match(MAP_SOURCE, /id="gm-engage-route-btn"/, 'the button must exist in the mounted markup');
  assert.match(
    MAP_SOURCE,
    /_engageButton\.addEventListener\('click'/,
    'the button must be bound to a handler, or it is decoration',
  );
  assert.match(
    MAP_SOURCE,
    /_activateRouteEngage\(\)\s*\{/,
    'the handler must exist',
  );
  assert.match(
    MAP_SOURCE,
    /this\._updateEngageControl\(\);/,
    'the control must refresh from live executor state',
  );
});

test('routeFollower listens for exactly the events this control emits', () => {
  const follower = readFileSync(new URL('../src/systems/routeFollower.js', import.meta.url), 'utf8');
  assert.match(follower, /bus\.on\('nav:engageRoute'/, 'engage must have a listener on the other end');
  assert.match(follower, /bus\.on\('nav:abortRoute'/, 'disengage must have a listener on the other end');
});

test('the reason element is announced to assistive tech and carries non-colour semantics', () => {
  assert.match(MAP_SOURCE, /id="gm-engage-reason"[^>]*aria-live="polite"/,
    'a state change the player cannot see must still be announced');
  assert.match(MAP_SOURCE, /data-engage-state/,
    'state must be encoded as an attribute, not only as a colour');
});
