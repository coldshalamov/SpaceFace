import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { beginScreenRegistrationCycle, reconcileSwarmPreparationCancellation,
  requestSwarmPreparationCancellation, ui } from '../src/ui/uiRoot.js';
import { fakeDom } from './helpers/fake-dom.mjs';

function installDomAndTimers() {
  const saved = Object.fromEntries(['document', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout']
    .map(key => [key, globalThis[key]]));
  const doc = fakeDom();
  const baseMake = doc.createElement;
  doc.createElement = (tag) => {
    const node = baseMake(tag);
    node.ownerDocument = doc;
    node.isConnected = true;
    node.style.removeProperty = function (key) { delete this[key]; };
    node.contains = candidate => {
      for (let current = candidate; current; current = current.parentNode) if (current === node) return true;
      return false;
    };
    node.removeEventListener = (event, fn) => { node.listeners[event] = (node.listeners[event] || []).filter(item => item !== fn); };
    node.removeChild = child => { node.children.splice(node.children.indexOf(child), 1); child.parentNode = null; };
    node.focus = () => { doc.activeElement = node; };
    node.blur = () => { doc.activeElement = doc.body; };
    return node;
  };
  doc.body = doc.createElement('body');
  doc.documentElement = doc.body;
  doc.activeElement = doc.body;
  const nodes = new Map();
  for (const id of ['screens', 'modal-backdrop', 'hud']) {
    const node = doc.createElement('div'); node.id = id; nodes.set(id, node); doc.body.appendChild(node);
  }
  const findOriginal = doc.getElementById;
  doc.getElementById = id => nodes.get(id) || findOriginal(id);
  doc.addEventListener = () => {};
  doc.removeEventListener = () => {};
  globalThis.document = doc;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const jobs = new Map(); let serial = 0;
  globalThis.setTimeout = (fn, delay) => { jobs.set(++serial, { fn, delay }); return serial; };
  globalThis.clearTimeout = id => jobs.delete(id);
  return {
    runNext() {
      const next = jobs.entries().next();
      if (next.done) return false;
      jobs.delete(next.value[0]); next.value[1].fn(); return true;
    },
    restore() {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
      }
    },
  };
}

function fixture({ cached = true } = {}) {
  const dom = installDomAndTimers();
  const sim = createSimulation({ seed: 4242, systems: [runSession, survivalResults], updateOrder: [] });
  const state = sim.state, bus = sim.bus;
  state.mode = 'menu';
  let generation = 1;
  const owner = Object.create(ui);
  owner.state = state; owner.bus = bus; owner.helpers = { workerReadGeneration: () => generation };
  const manager = createScreenManager({ state, bus, timeEffects: { set() {}, clear() {} } });
  owner.screenManager = manager;
  owner._registeredScreens = new Set();
  owner._screenRegistrationCycle = beginScreenRegistrationCycle(owner, manager);
  const native = sim.registry.get('runSession');
  const selection = { hullId: 'ship_drifter', arenaId: 'crucible_foundry', stake: 'veteran', startWave: 11 };
  let mounts = 0, hiddenDrafts = 0;
  const hangar = { id: 'crucible', mount(root) { mounts++; root.selection = selection; }, onShow() {}, onHide() {} };
  const register = (definition) => { manager.register(definition); owner._registeredScreens.add(definition.id); };
  const registerMenu = () => register({ id: 'mainMenu', mount() {}, onShow() {} });
  const registerHangar = () => register(hangar);
  register({ id: 'crucibleDraft', mount() {}, onHide() { hiddenDrafts++; } });
  register({ id: 'settings', mount() {} });
  if (cached) {
    registerMenu(); registerHangar();
    manager.pushScreen('mainMenu'); manager.pushScreen('crucible');
    manager.closeAll();
  }
  native.begin({ kind: 'survival', ruleset: 'swarm', seed: 4242, startWave: 11 });
  native.transition({ expectedPhase: 'loadout', nextPhase: 'draft' });
  state.mode = 'paused';
  bus.emit('mode:changed', { mode: 'paused' });
  manager.pushScreen('crucibleDraft');
  // Main publishes this mode edge synchronously before its worker mirror catches up. Exercise
  // the real manager's menu fence: closing the paused draft must not request resumed flight.
  const lifecycle = [];
  bus.on('game:exitToMenu', () => {
    lifecycle.push(['exit', state.run.phase]);
    bus.emit('mode:changed', { mode: 'menu', previousMode: 'paused' });
    owner._cancelPendingScreenRetry();
  });
  bus.on('run:preparationCancelResolved', receipt => reconcileSwarmPreparationCancellation(owner, receipt));
  bus.on('ui:cancelSwarmPreparation', request => requestSwarmPreparationCancellation(owner, request));
  return {
    dom, sim, state, bus, owner, manager, selection, registerMenu, registerHangar, lifecycle,
    mounts: () => mounts, hiddenDrafts: () => hiddenDrafts,
    advanceGeneration: () => { generation++; },
    cancel: () => bus.emit('ui:cancelSwarmPreparation', { token: state.run.retireToken }),
    destroy() { owner._cancelPendingScreenRetry(); manager.destroy(); sim.dispose(); dom.restore(); },
  };
}

test('the owned cancellation returns through the real screen manager and retains the cached hangar selection', () => {
  const h = fixture();
  try {
    const before = structuredClone(h.selection);
    const token = h.state.run.retireToken;
    h.cancel();
    assert.deepEqual(h.lifecycle, [['exit', 'inactive']], 'run retirement precedes the ordinary exit boundary');
    assert.deepEqual(h.state.ui.screenStack, ['mainMenu', 'crucible']);
    assert.equal(h.manager.top(), 'crucible');
    assert.equal(h.hiddenDrafts(), 1, 'the old draft is actually hidden and removed');
    assert.equal(h.mounts(), 1, 'the hangar selection is not rebuilt from defaults');
    assert.deepEqual(h.selection, before);
    assert.equal(h.sim.registry.get('survivalResults').lastResult(), null);
    assert.equal(h.state.mode, 'paused', 'the test deliberately leaves the asynchronous mode mirror behind');
    assert.equal(document.body.dataset.gameMode, 'menu', 'screen manager uses the published menu fence');
    h.bus.emit('run:preparationCancelResolved', { token, ok: true, reason: 'preparation_cancelled' });
    assert.deepEqual(h.state.ui.screenStack, ['mainMenu', 'crucible'], 'a duplicate receipt does not stack menus');
    h.manager.popScreen();
    assert.equal(h.manager.top(), 'mainMenu', 'Back cannot expose the cancelled draft');
  } finally { h.destroy(); }
});

test('return waits for real deferred screen registration and settles with the hangar on top', () => {
  const h = fixture({ cached: false });
  try {
    h.cancel();
    assert.equal(h.manager.top(), null);
    h.registerMenu(); h.dom.runNext();
    assert.equal(h.manager.top(), 'mainMenu');
    h.registerHangar(); h.dom.runNext();
    assert.deepEqual(h.state.ui.screenStack, ['mainMenu', 'crucible']);
    assert.equal(h.mounts(), 1);
    assert.equal(h.owner._swarmPreparationReturn, null);
  } finally { h.destroy(); }
});

test('a deferred return cannot overtake another screen or a newer worker generation', () => {
  for (const supersededBy of ['screen', 'generation']) {
    const h = fixture({ cached: false });
    try {
      h.cancel(); h.registerMenu(); h.dom.runNext();
      if (supersededBy === 'screen') h.manager.pushScreen('settings');
      else h.advanceGeneration();
      h.registerHangar(); h.dom.runNext();
      assert.equal(h.manager.top(), supersededBy === 'screen' ? 'settings' : 'mainMenu');
      assert.equal(h.mounts(), 0, 'the cancelled return does not mount the hangar later');
    } finally { h.destroy(); }
  }
});

test('stale acknowledgement identity never navigates the current preparation', () => {
  const h = fixture();
  try {
    const token = h.state.run.retireToken;
    h.owner._swarmPreparationCancellation = { token, generation: 1 };
    h.advanceGeneration();
    assert.equal(reconcileSwarmPreparationCancellation(h.owner, { token, ok: true }), false);
    assert.equal(h.manager.top(), 'crucibleDraft');
    assert.equal(h.state.run.phase, 'draft');
    assert.deepEqual(h.lifecycle, []);
  } finally { h.destroy(); }
});
