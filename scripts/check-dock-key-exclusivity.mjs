// Dock-key exclusivity probe for src/ui/input.js.
//
// THE DEFECT THIS PINS. The dock branch called ev.preventDefault() and nothing else. In this codebase
// preventDefault() is NOT suppression: the window-level flight adapter (src/systems/input.js) never
// inspects defaultPrevented — its only gates are modalInputActive / text-entry / ui-command targets.
// So the dock key also reached the flight verbs, and `strafeRight` is KeyE in BOTH the pilot (default)
// and classic scheme tables. Pressing E to dock therefore also strafed the ship sideways, precisely
// while the player was trying to hold a docking line. Helm-assist was unaffected because it binds
// strafeRight to KeyD/ArrowRight, which is why this never showed up in a scheme sweep.
//
// stopPropagation() from the document-level UI listener is what actually stops the window-level one.
// claimBase already used that idiom; dock did not. Nothing covered E.
import assert from 'node:assert/strict';

import { createUiInput } from '../src/ui/input.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { DEFAULTS } from '../src/systems/input.js';

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`ok   ${name}`); } catch (err) { failures.push(name); console.error(`FAIL ${name}\n     ${err.message}`); }
}

function installDomHarness() {
  const documentListeners = new Map();
  globalThis.document = {
    activeElement: null,
    body: { tagName: 'BODY', isContentEditable: false },
    addEventListener(type, fn) { documentListeners.set(type, fn); },
    removeEventListener(type, fn) { if (documentListeners.get(type) === fn) documentListeners.delete(type); },
  };
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  return documentListeners;
}

function press(listeners, key, code) {
  const event = {
    key,
    code: code || ('Key' + String(key).toUpperCase()),
    target: globalThis.document.body,
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
  };
  const handler = listeners.get('keydown');
  assert.equal(typeof handler, 'function', 'UI input should register a keydown listener');
  handler(event);
  return event;
}

/** Player next to a dockable station (in range) or far from one (out of range). */
function makeHarness({ inRange }) {
  const listeners = installDomHarness();
  const player = { id: 'player', alive: true, type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: {} };
  const station = {
    id: 'station_1', alive: true, type: 'station',
    pos: inRange ? { x: 20, z: 0 } : { x: 9000, z: 0 },
    radius: 40,
    data: { stationId: 'station_helios', name: 'Helios Station', dockable: true },
  };
  const events = [];
  const state = {
    mode: 'flight',
    ui: { screenStack: [], docked: false },
    playerId: 'player',
    player: { credits: 1000, researchedNodes: [], cargo: { items: {} } },
    entities: new Map([['player', player], ['station_1', station]]),
    entityList: [player, station],
    world: { currentSectorId: 'sector_helios_prime', activeSector: { stations: [station] } },
  };
  // A real (tiny) bus: `dockInRange` is driven by a `dock:range` EVENT from physics, not derived from
  // entity positions, so the harness has to be able to deliver it.
  const handlers = new Map();
  const bus = {
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, new Set());
      handlers.get(name).add(fn);
      return () => handlers.get(name).delete(fn);
    },
    emit(name, payload) {
      events.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
  const ctx = { state, bus, gamepad: null, registry: { get() { return null; } } };
  const screenManager = {
    isOpen() { return false },
    hasScreen() { return true },
    pushScreen(id) { state.ui.screenStack.push(id); },
    getActiveScreenDef() { return null; },
    popScreen() {},
  };
  const input = createUiInput(ctx, screenManager);
  // Physics publishes the dock prompt; replay it so the UI owner's dockInRange reflects the fixture.
  bus.emit('dock:range', { stationId: 'station_helios', inRange });
  return { listeners, events, state, input };
}

check('the dock key is bound to a flight verb in the shipped schemes — so exclusivity matters', () => {
  // If this ever stops being true the rest of this file is moot, so assert the premise rather than
  // leaving it implied.
  const dockCode = BINDINGS.dock.code || ('Key' + String(BINDINGS.dock.key).toUpperCase());
  const collisions = [];
  for (const [scheme, table] of Object.entries((DEFAULTS && DEFAULTS.SCHEMES) || {})) {
    for (const [action, codes] of Object.entries(table || {})) {
      if (Array.isArray(codes) && codes.includes(dockCode)) collisions.push(`${scheme}.${action}`);
    }
  }
  assert(collisions.length > 0,
    `expected the dock code ${dockCode} to collide with at least one flight verb (it collides in pilot/classic); found none — if the schemes were re-keyed, retarget this probe`);
});

check('docking in range stops propagation so the dock key cannot also fly the ship', () => {
  const h = makeHarness({ inRange: true });
  const ev = press(h.listeners, BINDINGS.dock.key, BINDINGS.dock.code);
  assert.equal(ev.defaultPrevented, true, 'dock key should be UI-owned while a dock prompt is live');
  assert.equal(ev.propagationStopped, true,
    'dock key must stop propagation — preventDefault alone does not keep the window-level flight adapter from strafing');
  h.input.dispose();
});

check('Enter, the secondary dock trigger, is suppressed the same way', () => {
  const h = makeHarness({ inRange: true });
  const ev = press(h.listeners, 'Enter', 'Enter');
  assert.equal(ev.propagationStopped, true, 'the secondary dock trigger must not leak to gameplay either');
  h.input.dispose();
});

check('out of dock range the key falls through untouched so ordinary strafing still works', () => {
  const h = makeHarness({ inRange: false });
  const ev = press(h.listeners, BINDINGS.dock.key, BINDINGS.dock.code);
  assert.equal(ev.defaultPrevented, false, 'away from a dock the key must reach normal flight input');
  assert.equal(ev.propagationStopped, false, 'away from a dock the key must not be swallowed');
  h.input.dispose();
});

if (failures.length) {
  console.error(`\nFAIL check:dock-key-exclusivity — ${failures.length} failing group(s)`);
  process.exit(1);
}
console.log('\nPASS check:dock-key-exclusivity');
