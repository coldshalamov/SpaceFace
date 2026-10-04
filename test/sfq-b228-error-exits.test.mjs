// SFQ-B228 — failures leave an exit: a corrupted optional save region and a missing boot
// asset each land on a stated recovery surface (named cause + retry/menu/export option)
// through the real error owners instead of a generic or unhandled failure.
//
//   * Corrupt optional region: a real save.restore walk (bandRadio region) must fail closed,
//     roll back to the untouched live run, and emit ONE save:error whose cause the UI owner
//     (uiRoot.saveErrorText) states together with the way out.
//   * Missing boot asset: the scenario-contract load failure must classify into the shared
//     recovery pane owner (runtimeFailurePresenter) as named cause + Retry, not a raw stack.
//
// Run: node --test test/sfq-b228-error-exits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { saveErrorText } from '../src/ui/uiRoot.js';
import {
  createRuntimeFailurePresenter,
  describeBootFailure,
} from '../src/ui/runtimeFailurePresenter.js';
import { fakeDom, findAll } from './helpers/fake-dom.mjs';

// ---------------------------------------------------------------- corrupted optional region

const SEED = 4242;

function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(other) { this.x = other.x || 0; this.y = other.y || 0; this.z = other.z || 0; return this; },
  };
}

// The save-restore-atomicity harness shape, scoped to one optional region: the stub registry
// only knows `bandRadio` (restored mid-walk at saveSystem _restoreChunks), whose deserialize
// throws on the corrupt marker and passes the honest empty record so the rollback lane lives.
function makeRegionHarness() {
  const state = createGameState(SEED);
  state.mode = 'flight';
  state.save.currentSlot = 'original-slot';
  state.meta.playtimeS = 31;
  state.simTime = 31;
  state.tick = 1860;
  state.world.currentSectorId = 'sector_helios_prime';

  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: vec(120, -35),
    vel: vec(8, -2),
    rot: 0.35,
    prevRot: 0.35,
    hull: 88,
    hullMax: 100,
    shield: 42,
    shieldMax: 50,
    cap: 12,
    capMax: 20,
    radius: 6,
    team: 0,
    factionId: 'faction_free',
    flags: {},
    data: { defId: 'ship_kestrel', weapons: [{ id: 'wpn_pulse_laser_s' }], fittings: [] },
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const events = [];
  const bandRadioCalls = [];
  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = { emit(name, payload = {}) { events.push({ name, payload }); } };
  save.registry = {
    get(name) {
      if (name !== 'bandRadio') return null;
      return {
        deserialize(data) {
          bandRadioCalls.push(data);
          if (data && data.corrupted) throw new Error('synthetic bandRadio restore failure');
        },
      };
    },
  };
  save.helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const spawned = {
        ...spec,
        id,
        alive: spec.alive !== false,
        pos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: vec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        prevPos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevRot: Number.isFinite(spec.rot) ? spec.rot : 0,
        flags: { ...(spec.flags || {}) },
        data: spec.data || {},
      };
      state.entities.set(id, spawned);
      state.entityList.push(spawned);
      return spawned;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;

  const liveSnapshot = () => ({
    mode: state.mode,
    currentSlot: state.save.currentSlot,
    playerPos: { x: state.entities.get(state.playerId).pos.x, z: state.entities.get(state.playerId).pos.z },
    hull: state.entities.get(state.playerId).hull,
    entityIds: state.entityList.map((entity) => entity.id),
  });

  return { save, state, events, bandRadioCalls, liveSnapshot };
}

test('a corrupted optional region fails closed, names its cause, and leaves the run untouched', () => {
  const harness = makeRegionHarness();
  const before = harness.liveSnapshot();

  const envelope = harness.save.serialize('target-slot');
  envelope.data.bandRadio = { corrupted: true };
  delete envelope.checksum; // the walk, not the checksum gate, must refuse this save

  const ok = harness.save.loadEnvelope(envelope, 'target-slot');

  assert.equal(ok, false, 'a corrupted optional region must not report a load success');
  assert.equal(harness.bandRadioCalls.length, 2, 'one target attempt plus one rollback attempt');
  assert.deepEqual(harness.liveSnapshot(), before, 'rollback must preserve the live run byte-for-byte');
  assert.equal(harness.events.some((e) => e.name === 'save:loaded' && e.payload.slot === 'target-slot'), false,
    'a refused load must never publish a loaded success for the target');

  const errors = harness.events.filter((e) => e.name === 'save:error');
  assert.equal(errors.length, 1, 'exactly one truthful load-failure receipt');
  assert.deepEqual(errors[0].payload, {
    slot: 'target-slot',
    reason: 'load_failed',
    rollback: 'restored',
    error: 'synthetic bandRadio restore failure',
  });

  // The UI recovery surface states the cause AND the way out (retry / export / menu).
  const text = saveErrorText(errors[0].payload);
  assert.match(text, /synthetic bandRadio restore failure/, 'the named cause reaches the player');
  assert.match(text, /untouched/, 'the receipt states the save was not destroyed');
  assert.match(text, /try again/, 'retry is offered');
  assert.match(text, /export a backup/, 'export is offered');

  // A bare load_failed (no cause attached) keeps the previous honest generic wording.
  assert.equal(saveErrorText({ slot: 'latest', reason: 'load_failed' }), 'Save/load failed for latest save');
});

// ------------------------------------------------------------------------- boot: missing asset

function enhanceNode(node, focused) {
  node.hasAttribute = (name) => Object.prototype.hasOwnProperty.call(node.attributes, name);
  node.removeAttribute = (name) => { delete node.attributes[name]; };
  node.removeChild = (child) => {
    const index = node.children.indexOf(child);
    if (index >= 0) node.children.splice(index, 1);
    child.parentNode = null;
    return child;
  };
  node.contains = (other) => {
    for (let cur = other; cur; cur = cur.parentNode) {
      if (cur === node) return true;
    }
    return false;
  };
  const matches = (n, selector) => {
    if (selector.startsWith('.')) return n.className.split(/\s+/).includes(selector.slice(1));
    return n.tagName === selector;
  };
  const visit = (n, selector, out) => {
    for (const child of n.children || []) {
      if (matches(child, selector)) out.push(child);
      visit(child, selector, out);
    }
    return out;
  };
  node.querySelectorAll = (selector) => visit(node, selector, []);
  node.querySelector = (selector) => visit(node, selector, [])[0] || null;
  node.focus = () => { focused.push(node); };
  return node;
}

function createBootFixture() {
  const doc = fakeDom();
  const focused = [];
  const make = (tag) => enhanceNode(doc._make(tag), focused);
  doc.createElement = make;
  const host = {
    listeners: [],
    addEventListener(type, fn) { this.listeners.push({ type, fn }); },
    removeEventListener(type, fn) {
      const index = this.listeners.findIndex((l) => l.type === type && l.fn === fn);
      if (index >= 0) this.listeners.splice(index, 1);
    },
    location: { reloads: 0, reload() { this.reloads++; } },
  };
  doc.defaultView = host;

  // The overlay carries a live loading shell: a lockup whose label must be hidden, not
  // deleted, when the recovery pane takes over — the failure must not sit beside "Loading…".
  const overlay = make('div');
  overlay.id = 'boot-overlay';
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-busy', 'true');
  const lockup = make('div');
  lockup.className = 'boot-lockup';
  lockup.textContent = 'Initializing systems…';
  overlay.appendChild(lockup);
  const hud = make('div');
  hud.id = 'hud';
  const screens = make('div');
  screens.id = 'screens';
  doc.head.appendChild(hud);
  doc.head.appendChild(screens);
  doc.head.appendChild(overlay);
  return { doc, host, overlay, lockup, hud, screens, focused };
}

function withDocument(doc, fn) {
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return fn();
  } finally {
    globalThis.document = previous;
  }
}

test('a missing scenario asset classifies into a named-cause boot recovery spec', () => {
  const contract = describeBootFailure(
    new Error('Unable to load scenario contract ./data/scenarios/47a.scenario.json: HTTP 404'));
  assert.equal(contract.code, 'BOOT_SCENARIO_UNAVAILABLE');
  assert.equal(contract.headline, 'The opening scenario could not be loaded');
  assert.match(contract.fills, /missing|network/, 'the cause names the failed asset path');
  assert.match(contract.detail, /saved games are unaffected/i, 'saves are stated safe');
  assert.equal(contract.verbLabel, 'Retry', 'the pane offers the exit');
  assert.equal(contract.message, 'Unable to load scenario contract ./data/scenarios/47a.scenario.json: HTTP 404');

  const timeout = describeBootFailure(Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' }));
  assert.equal(timeout.code, 'BOOT_SERVICE_UNAVAILABLE');
  assert.equal(timeout.verbLabel, 'Retry');

  const generic = describeBootFailure(new Error('Cannot read properties of undefined'));
  assert.equal(generic.code, 'BOOT_FAILED');
  assert.equal(generic.verbLabel, 'Retry');
  assert.match(generic.detail, /saved games are unaffected/i);
});

test('the boot recovery pane shows cause + Retry through the shared presenter owner', () => {
  const fixture = createBootFixture();
  let restarts = 0;
  const presenter = createRuntimeFailurePresenter({
    document: fixture.doc,
    host: fixture.host,
    onRestart() { restarts++; },
  });

  const spec = describeBootFailure(
    new Error('Unable to load scenario contract ./data/scenarios/47a.scenario.json: HTTP 404'));
  const shown = withDocument(fixture.doc, () => presenter.show(spec));
  assert.equal(shown, true, 'the pane mounts over the boot overlay');

  assert.equal(fixture.overlay.classList.contains('hidden'), false);
  assert.equal(fixture.overlay.style.display, 'flex');
  assert.equal(fixture.overlay.getAttribute('aria-busy'), 'false');
  assert.equal(fixture.lockup.style.display, 'none', 'the dead loading shell is hidden, not co-shown');

  const pane = findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state'))[0];
  assert.ok(pane, 'one recovery pane exists');
  assert.equal(pane.getAttribute('role'), 'alertdialog');
  assert.equal(pane.getAttribute('aria-modal'), 'true');
  assert.equal(pane.getAttribute('data-failure-message'),
    'Unable to load scenario contract ./data/scenarios/47a.scenario.json: HTTP 404');
  assert.equal(pane.querySelector('.sf-state__head').textContent,
    'The opening scenario could not be loaded');
  assert.match(pane.querySelector('.sf-state__fills').textContent, /missing|network/);
  assert.match(pane.querySelector('.sf-state__detail').textContent, /saved games are unaffected/i);
  const verb = pane.querySelector('.sf-state__verb');
  assert.equal(verb.children[0].textContent, 'Retry', 'the verb label names the exit');
  assert.equal(fixture.focused[0], verb, 'the retry verb takes focus');

  verb.click();
  assert.equal(restarts, 1, 'the Retry verb drives the restart exit');
  assert.equal(fixture.hud.getAttribute('inert'), '', 'the dead world stays inert behind the pane');

  presenter.destroy();
  assert.equal(findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state')).length, 0,
    'destroy removes the pane');
});

test('the flight-interrupted default copy is unchanged for the loop failure path', () => {
  const fixture = createBootFixture();
  const presenter = createRuntimeFailurePresenter({
    document: fixture.doc,
    host: fixture.host,
    onRestart() {},
  });
  withDocument(fixture.doc, () => presenter.show({ message: 'fault-injection: broken component' }));
  const pane = findAll(fixture.overlay, (n) => n.className.split(/\s+/).includes('sf-state'))[0];
  assert.equal(pane.querySelector('.sf-state__word').textContent, 'FLIGHT INTERRUPTED');
  assert.equal(pane.querySelector('.sf-state__head').textContent, 'Flight interrupted');
  assert.equal(pane.querySelector('.sf-state__verb').children[0].textContent, 'Restart to main menu');
  presenter.destroy();
});
