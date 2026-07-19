// W1-8 — plot and engage are SEPARATE actions, and engage is reachable on the default route.
//
// This is the wired-features pin for the route follower. Before it existed, nothing in production
// emitted `nav:engageRoute`: the follower was registered, unit-proven and unreachable, which is the
// "producer landed, consumer did not" pattern the atlas ledger tracks (S0-7, the RCS renderer).
// The point of these assertions is that the player can actually get at it, and that an unavailable
// action explains itself rather than silently doing nothing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  resolveRouteEngageAction,
  emitRouteEngageAction,
  emitGalaxyMapPrimaryAction,
} from '../src/ui/galaxyMap.js';

const MAP_SOURCE = readFileSync(new URL('../src/ui/galaxyMap.js', import.meta.url), 'utf8');

function busSpy() {
  const events = [];
  return { events, emit: (type, payload) => events.push({ type, payload }) };
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
  const a = resolveRouteEngageAction({ nav: { route: { path: ['a', 'b', 'c'] } } });
  assert.equal(a.enabled, true);
  assert.equal(a.event, 'nav:engageRoute');
  assert.match(a.reason, /3 legs/);
});

test('one leg is not pluralised', () => {
  const a = resolveRouteEngageAction({ nav: { route: { path: ['a'] } } });
  assert.match(a.reason, /1 leg\b/);
});

test('while transiting, the control becomes the way OUT so a pilot is never trapped', () => {
  const a = resolveRouteEngageAction({
    nav: { route: { path: ['a', 'b'] }, executor: { phase: 'transiting', legIndex: 0, legCount: 2 } },
  });
  assert.equal(a.enabled, true);
  assert.equal(a.label, 'Disengage');
  assert.equal(a.event, 'nav:abortRoute');
  assert.match(a.reason, /leg 1\/2/, 'progress must be legible from the control itself');
});

test('an interrupted route offers RESUME, and says the itinerary was kept', () => {
  const a = resolveRouteEngageAction({
    nav: { route: { path: ['a', 'b'] }, executor: { phase: 'interrupted', legIndex: 1, legCount: 2 } },
  });
  assert.equal(a.label, 'Resume Route');
  assert.equal(a.event, 'nav:engageRoute', 'resuming re-engages rather than re-plotting');
  assert.match(a.reason, /itinerary kept/i, 'interruption must never read as a lost route');
});

test('an arrived or idle executor falls back to the plot-first state', () => {
  for (const phase of ['idle', 'arrived']) {
    const a = resolveRouteEngageAction({ nav: { route: null, executor: { phase } } });
    assert.equal(a.enabled, false, `phase ${phase} with no route must not offer engage`);
  }
});

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
  const action = resolveRouteEngageAction({ nav: { route: { path: ['a', 'b'] } } });
  assert.equal(emitRouteEngageAction(bus, action), true);
  assert.deepEqual(bus.events.map((e) => e.type), ['nav:engageRoute']);
});

test('DISENGAGE emits nav:abortRoute with a manual reason', () => {
  const bus = busSpy();
  const action = resolveRouteEngageAction({
    nav: { route: { path: ['a'] }, executor: { phase: 'approaching', legIndex: 0, legCount: 1 } },
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
