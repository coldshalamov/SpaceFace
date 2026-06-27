import assert from 'node:assert/strict';

import { createUiInput } from '../src/ui/input.js';

function installDomHarness() {
  const documentListeners = new Map();
  const windowListeners = new Map();
  globalThis.document = {
    activeElement: null,
    body: { tagName: 'BODY', isContentEditable: false },
    addEventListener(type, fn) { documentListeners.set(type, fn); },
    removeEventListener(type, fn) {
      if (documentListeners.get(type) === fn) documentListeners.delete(type);
    },
  };
  globalThis.window = {
    addEventListener(type, fn) { windowListeners.set(type, fn); },
    removeEventListener(type, fn) {
      if (windowListeners.get(type) === fn) windowListeners.delete(type);
    },
  };
  return { documentListeners, windowListeners };
}

function press(listeners, key) {
  const event = {
    key,
    code: 'Key' + String(key).toUpperCase(),
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

function makeHarness({ claimed = false, baseRegistered = true, claimSucceeds = true, withClaimPoi = true, gamepad = null } = {}) {
  const { documentListeners } = installDomHarness();
  const playerEntity = { id: 'player', alive: true, type: 'ship', pos: { x: 0, z: 0 }, data: {} };
  const claimPoi = {
    id: 'poi_body',
    alive: true,
    type: 'poi',
    pos: { x: 35, z: 20 },
    data: { poi: true, claimable: true, poiId: 'poi_body', name: 'Arden Moon', size: 'M' },
  };
  const bodies = claimed
    ? [{ id: 'claim_existing', poiId: 'poi_body', name: 'Arden Moon', modules: [], slots: 3 }]
    : [];
  const events = [];
  const pushes = [];
  const state = {
    mode: 'flight',
    ui: { screenStack: [] },
    playerId: 'player',
    player: { credits: 50000, researchedNodes: [], cargo: { items: {} } },
    entities: new Map([['player', playerEntity]]),
    entityList: withClaimPoi ? [playerEntity, claimPoi] : [playerEntity],
  };
  const bus = {
    on() {},
    emit(name, payload) { events.push({ name, payload }); },
  };
  const claimsSys = {
    isClaimed(poiId) { return bodies.some((body) => body.poiId === poiId); },
    list() { return bodies; },
    claim(poiDef) {
      events.push({ name: 'claim:call', payload: poiDef });
      if (!claimSucceeds) return false;
      bodies.push({ id: 'claim_new', poiId: poiDef.id, name: poiDef.name, modules: [], slots: 3 });
      return true;
    },
  };
  const ctx = {
    state,
    bus,
    gamepad,
    registry: { get(name) { return name === 'claims' ? claimsSys : null; } },
  };
  const screenManager = {
    isOpen() { return false; },
    hasScreen(id) { return id === 'base' && baseRegistered; },
    pushScreen(id) {
      pushes.push(id);
      state.ui.screenStack.push(id);
    },
    getActiveScreenDef() { return null; },
    popScreen() {},
  };
  const input = createUiInput(ctx, screenManager);
  return { bodies, events, pushes, state, listeners: documentListeners, input };
}

function assertNoComingSoon(events) {
  const toastText = events
    .filter((event) => event.name === 'toast')
    .map((event) => String(event.payload && event.payload.text || ''))
    .join('\n');
  assert.equal(/coming soon/i.test(toastText), false, 'claim/base interaction must not show a coming-soon fallback');
}

function checkAlreadyClaimedBodyOpensBase() {
  const h = makeHarness({ claimed: true });
  const event = press(h.listeners, 'c');
  assert.equal(event.defaultPrevented, true, 'claim key should be UI-owned in flight');
  assert.equal(event.propagationStopped, true, 'claim key should not also reach gameplay countermeasure input when it opens a base');
  assert.deepEqual(h.pushes, ['base'], 'pressing C near an already-claimed body should open the Base screen');
  assert.equal(h.state.ui.pendingClaimBodyId, 'claim_existing', 'base handoff should target the existing claim record');
  assertNoComingSoon(h.events);
  h.input.dispose();
}

function checkNewClaimOpensBaseImmediately() {
  const h = makeHarness({ claimed: false });
  const event = press(h.listeners, 'c');
  assert.equal(event.defaultPrevented, true, 'claim key should be UI-owned when a claimable body is in range');
  assert.equal(event.propagationStopped, true, 'claim key should not also deploy countermeasures while claiming a body');
  assert.equal(h.events.some((event) => event.name === 'claim:call'), true, 'unclaimed body should call claims.claim');
  assert.equal(h.bodies.length, 1, 'successful claim should create a claim record');
  assert.deepEqual(h.pushes, ['base'], 'successful claim should open the Base screen immediately');
  assert.equal(h.state.ui.pendingClaimBodyId, 'claim_new', 'base handoff should target the new claim record');
  assertNoComingSoon(h.events);
  h.input.dispose();
}

function checkClaimKeyFallsThroughAwayFromBodies() {
  const h = makeHarness({ withClaimPoi: false });
  const event = press(h.listeners, 'c');
  assert.equal(event.defaultPrevented, false, 'C away from claimable bodies should fall through to gameplay countermeasure input');
  assert.equal(event.propagationStopped, false, 'C away from claimable bodies should not stop gameplay input');
  assert.deepEqual(h.pushes, [], 'C away from claimable bodies should not open the Base screen');
  const toastText = h.events
    .filter((ev) => ev.name === 'toast')
    .map((ev) => String(ev.payload && ev.payload.text || ''))
    .join('\n');
  assert.equal(/No claimable body/i.test(toastText), false, 'countermeasure C should not show a claim/body warning in open space');
  h.input.dispose();
}

function checkRegistrationRaceDoesNotLie() {
  const h = makeHarness({ claimed: true, baseRegistered: false });
  const event = press(h.listeners, 'c');
  assert.equal(event.defaultPrevented, true, 'base registration race should still consume the claim key');
  assert.equal(event.propagationStopped, true, 'base registration race should not also reach gameplay countermeasure input');
  assert.deepEqual(h.pushes, [], 'unregistered base screen should not be pushed');
  assert.equal(h.state.ui.pendingClaimBodyId, 'claim_existing', 'base target should stay primed while screen registration catches up');
  assert.equal(h.events.some((event) => event.name === 'toast' && /initializing/i.test(event.payload.text)), true,
    'registration race should tell the player the base interface is initializing');
  assertNoComingSoon(h.events);
  h.input.dispose();
}

function checkGamepadCodexOpensCodex() {
  const gamepad = {
    axes: { leftX: 0, leftY: 0 },
    actions: {
      pause: { pressed: false },
      map: { pressed: false },
      codex: { pressed: true },
      cycleTarget: { pressed: false },
    },
    isConnected() { return true; },
    tick() {},
  };
  const h = makeHarness({ gamepad });
  h.input.tick(0.016);
  assert.deepEqual(h.pushes, ['codex'], 'gamepad Y/Triangle codex action should open the Codex, not Help');
  h.input.dispose();
}

checkAlreadyClaimedBodyOpensBase();
checkNewClaimOpensBaseImmediately();
checkRegistrationRaceDoesNotLie();
checkClaimKeyFallsThroughAwayFromBodies();
checkGamepadCodexOpensCodex();

console.log('Claim/base and gamepad UI routing checks OK');
