import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createGameState } from '../src/core/gameState.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
  PRODUCTION_FEATURES,
} from '../src/data/featureFlags.js';
import { input } from '../src/systems/input.js';
import { mining, isBeamTargetEligible } from '../src/systems/mining.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';
import { createWorldObjectInteraction } from '../src/ui/worldObjectInteraction.js';

const VP = { width: 1000, height: 800 };

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type, event = {}) {
    event.type = type;
    if (typeof event.preventDefault !== 'function') event.preventDefault = () => { event.defaultPrevented = true; };
    for (const listener of [...(this.listeners.get(type) || [])]) listener(event);
  }
  listenerCount(type) { return this.listeners.get(type)?.size || 0; }
}

function fakeElement() {
  const el = {
    children: [],
    dataset: {},
    style: {},
    className: '',
    textContent: '',
    hidden: false,
    parentNode: null,
    setAttribute() {},
    appendChild(child) { child.parentNode = el; el.children.push(child); return child; },
    removeChild(child) { el.children = el.children.filter((c) => c !== child); child.parentNode = null; },
    getBoundingClientRect() { return { left: 0, top: 0, width: VP.width, height: VP.height }; },
  };
  let innerHTML = '';
  Object.defineProperty(el, 'innerHTML', {
    get() { return innerHTML; },
    set(html) {
      innerHTML = html;
      el.children = html ? [fakeElement(), fakeElement(), fakeElement()] : [];
      for (const c of el.children) c.parentNode = el;
    },
  });
  return el;
}

function makeCamera() {
  const camera = new THREE.PerspectiveCamera(50, VP.width / VP.height, 0.1, 4000);
  camera.position.set(0, 100, 0.0001);
  camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function bodyRootAt(x, z, size = 10) {
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial());
  root.add(mesh);
  root.position.set(x, 0, z);
  root.updateMatrixWorld(true);
  return root;
}

function screenPosFor(worldX, worldZ, camera) {
  const v = new THREE.Vector3(worldX, 0, worldZ).project(camera);
  return { x: (v.x + 1) * 0.5 * VP.width, y: (-v.y + 1) * 0.5 * VP.height };
}

function withWorldObjectHarness(fn, opts = {}) {
  const names = ['window', 'document', 'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener'];
  const previous = {};
  for (const name of names) previous[name] = { present: Object.hasOwn(globalThis, name), value: globalThis[name] };
  const flagSnapshot = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);

  const win = new FakeEventTarget();
  win.innerWidth = VP.width; win.innerHeight = VP.height;
  let advanceUiClock = null;
  if (opts.uiClock) {
    const timers = [];
    let seq = 0;
    let now = 0;
    win.setTimeout = (cb, ms) => {
      const t = { id: ++seq, cb, ms, at: now + ms, cancelled: false, fired: false };
      timers.push(t);
      return t.id;
    };
    win.clearTimeout = (id) => {
      for (const t of timers) if (t.id === id) t.cancelled = true;
    };
    win.__timers = timers;
    advanceUiClock = (ms) => {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const t of timers) {
          if (!t.cancelled && !t.fired && t.at <= target && (!next || t.at < next.at)) next = t;
        }
        if (!next) break;
        next.fired = true;
        now = Math.max(now, next.at);
        next.cb();
      }
      now = target;
    };
  }
  const canvas = new FakeEventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: VP.width, height: VP.height });
  const hudEl = fakeElement();
  const headEl = fakeElement();
  const bodyEl = {
    classList: { contains: () => false },
    appendChild(child) { child.parentNode = bodyEl; },
    removeChild() {},
  };
  const doc = new FakeEventTarget();
  doc.body = bodyEl;
  doc.head = headEl;
  doc.visibilityState = 'visible';
  doc.pointerLockElement = null;
  doc.getElementById = (id) => (id === 'gl-canvas' ? canvas : (id === 'hud' ? hudEl : null));
  doc.createElement = () => fakeElement();
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.innerWidth = VP.width;
  globalThis.innerHeight = VP.height;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.removeEventListener = win.removeEventListener.bind(win);

  const state = createGameState(11);
  state.mode = 'flight';
  state.ui = { screenStack: [], docked: false, dockInRange: false };
  const player = {
    id: 1, type: 'ship', alive: true, team: 1,
    pos: { x: 0, z: -40 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 8, mass: 100, data: { defId: 'ship_kestrel' },
  };
  const rock = {
    id: 50, type: 'asteroid', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 400,
    data: { typeId: 'ast_common_rock', oreHP: 100, oreHPMax: 100, yieldU: 50 },
  };
  const hostile = {
    id: 60, type: 'ship', alive: true, team: 9,
    pos: { x: 60, z: 0 }, vel: { x: 0, z: 0 }, radius: 10, mass: 120, hull: 80, hullMax: 100,
    presentationAdmission: 'ready',
    data: { ai: { huntPlayer: true } },
  };
  const station = {
    id: 70, type: 'station', alive: true,
    pos: { x: -60, z: 0 }, vel: { x: 0, z: 0 }, radius: 20, mass: 5000,
    presentationAdmission: 'ready',
    data: { name: 'Refuge Dock' },
  };
  state.entities.set(player.id, player);
  state.entities.set(rock.id, rock);
  state.entities.set(hostile.id, hostile);
  state.entities.set(station.id, station);
  state.entityList = [player, rock, hostile, station];
  state.playerId = player.id;
  state.player.tether = { active: false, targetId: null };
  state.input.pointerScreen = { x: VP.width / 2, y: VP.height / 2, active: true };

  const camera = makeCamera();
  const scene = new THREE.Scene();
  const meshes = new Map([
    [rock.id, bodyRootAt(0, 0)],
    [hostile.id, bodyRootAt(60, 0)],
    [station.id, bodyRootAt(-60, 0, 20)],
  ]);
  for (const root of meshes.values()) scene.add(root);
  scene.add(camera);
  scene.updateMatrixWorld(true);
  state.render = Object.assign(state.render || {}, { camera, meshes, scene });

  const emitted = [];
  const subs = new Map();
  const bus = {
    on(name, fn) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(fn);
      return () => subs.get(name)?.delete(fn);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of [...(subs.get(name) || [])]) fn(payload);
    },
  };

  const host = Object.create(input);
  const ctx = {
    state,
    bus,
    helpers: { raycastToPlane: (ndc) => ({ x: ndc.x * 100, z: -ndc.y * 100 }) },
    registry: { get: (name) => (name === 'input' ? host : null) },
  };
  host.init(ctx);
  let modalOpen = false;
  const woi = createWorldObjectInteraction(ctx, {
    isOpen: () => modalOpen,
    isLiveOverlay: () => modalOpen,
  });
  const miner = Object.create(mining);
  miner.state = state;
  miner.helpers = {};
  const thrower = Object.create(masslineThrow);
  thrower.init({ state, bus, helpers: {} });

  const fireGroups = [];
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1;
      state.simTime = state.tick / 60;
      host.update(1 / 60, state);
      woi.tick(1 / 60);
      fireGroups.push(state.input.fireGroup);
    }
  };
  const clickDownAt = (x, y) => canvas.dispatch('mousedown', { button: 2, target: canvas, clientX: x, clientY: y });
  const clickUp = () => win.dispatch('mouseup', { button: 2 });
  const pointOn = (entity) => screenPosFor(entity.pos.x, entity.pos.z, camera);

  try {
    return fn({ state, win, doc, canvas, bus, emitted, tick, clickDownAt, clickUp, pointOn, woi, miner, thrower, player, rock, hostile, station, hudEl, host, ctx, advanceUiClock, setModal: (v) => {
      modalOpen = v;
      state.ui.screenStack = v ? ['modal'] : [];
    } });
  } finally {
    woi.destroy();
    thrower.destroy();
    host.destroy();
    restoreFeatureMaps(flagSnapshot);
    for (const name of names) {
      if (previous[name].present) globalThis[name] = previous[name].value;
      else delete globalThis[name];
    }
  }
}

test('right-button down selects immediately — before any sim tick runs', () => {
  withWorldObjectHarness(({ state, clickDownAt, clickUp, pointOn, rock }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    assert.equal(state.player.targetId, rock.id, 'DOWN selects, no hold needed');
    assert.equal(state.input.worldObjectTargetId, rock.id, 'gesture field exists while held');
    assert.equal(state.ui.objectSelection && state.ui.objectSelection.targetId, rock.id);
    assert.equal(state.ui.objectSelection.source, 'pointer');
    clickUp();
    assert.equal(Object.hasOwn(state.input, 'worldObjectTargetId'), false, 'field dies with the gesture');
    assert.equal(state.player.targetId, rock.id, 'release retains the selection');
  });
});

test('a tap never mines; a 0.28s hold beams the captured subject only', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, rock, miner, player }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(10);
    assert.notEqual(state.input.fireGroup, 2, 'short hold must not start the beam');
    clickUp();
    tick(2);
    assert.notEqual(state.input.fireGroup, 2);

    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.fireGroup, 2, 'the held button is the tool after the gate');
    assert.equal(state.input.worldObjectTargetId, rock.id);
    const acquired = miner._acquireTarget(player, 200, state);
    assert.equal(acquired && acquired.id, rock.id, 'the beam acts on exactly the clicked rock');
    clickUp();
    tick(1);
    assert.notEqual(state.input.fireGroup, 2, 'release stops the tool');
    assert.equal(state.player.targetId, rock.id, 'selection outlives the gesture');
  });
});

test('sweeping the cursor mid-hold never retargets the captured tool', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, woi, miner, player, rock, hostile }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(19);
    const over = pointOn(hostile);
    state.input.pointerScreen.x = over.x;
    state.input.pointerScreen.y = over.y;
    tick(3);
    const diag = woi.diagnostics();
    assert.equal(diag.hoverId, rock.id, 'the captured subject owns hover for the hold');
    assert.equal(state.input.worldObjectTargetId, rock.id);
    const acquired = miner._acquireTarget(player, 200, state);
    assert.equal(acquired && acquired.id, rock.id, 'beam stays on the captured rock');
    clickUp();
  });
});

test('a clicked ineligible subject produces no beam — no silent fallback', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, miner, player, hostile, rock }) => {
    const pt = pointOn(hostile);
    clickDownAt(pt.x, pt.y);
    assert.equal(state.player.targetId, hostile.id);
    tick(19);
    assert.notEqual(state.input.fireGroup, 2, 'the beam cannot answer an ineligible click');
    assert.equal(miner._acquireTarget(player, 200, state), null,
      'no fallback to the nearby rock while a gesture is captured');
    clickUp();
  });
});

test('empty-space right-click frees aim without touching the tether', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, rock }) => {
    state.player.targetId = rock.id;
    state.player.tether = { active: true, targetId: 60 };
    clickDownAt(40, 40);
    assert.equal(state.player.targetId, null, 'deliberate empty click clears selection');
    assert.equal(state.input.targetAssistDisabled, true, 'free aim stays free until Tab');
    assert.equal(state.input.worldObjectTargetId, null, 'the gesture is captured-empty, not absent');
    assert.equal(state.player.tether.active, true, 'the tether survives free aim');
    tick(19);
    assert.notEqual(state.input.fireGroup, 2, 'an empty hold never mines a nearby rock');
    clickUp();
  });
});

test('a latched hostile does not steal the beam from a clicked rock', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, miner, player, rock, hostile }) => {
    state.player.tether = { active: true, targetId: hostile.id };
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.fireGroup, 2, 'deliberate click on a beam subject beams even tethered');
    assert.equal(state.input.actions.throwArm, false, 'the sling must not arm over the click');
    assert.equal(miner._acquireTarget(player, 200, state).id, rock.id);
    clickUp();
  });
});

test('a quick enemy click while tethered never arms or throws the sling', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, hostile, thrower }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(hostile);
    clickDownAt(pt.x, pt.y);
    tick(8);
    assert.equal(state.input.actions.throwArm, false, 'a tap is never a sling arm');
    assert.equal(thrower._pendingSnap, null);
    clickUp();
    tick(2);
    assert.equal(thrower._pendingSnap, null, 'nothing pending after release');
  });
});

test('a deliberate hold on a non-beam subject still arms the latched sling', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, station, hostile }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, true, 'held non-beam destination aims the sling');
    clickUp();
    tick(1);
    assert.equal(state.input.actions.throwArm, false);
  });
});

test('blur cancels a captured gesture and resets a held sling arm without throwing', () => {
  withWorldObjectHarness(({ state, win, tick, clickDownAt, pointOn, station, hostile, emitted, thrower }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, true, 'precondition: sling arm was held');
    win.dispatch('blur');
    assert.equal(Object.hasOwn(state.input, 'worldObjectTargetId'), false, 'blur kills the gesture field');
    assert.ok(emitted.some((e) => e.name === 'input:worldGestureCancelled'), 'scoped cancel event emitted');
    assert.equal(thrower._pendingSnap, null);
    assert.equal(thrower._armAuthorized, false, 'a canceled arm cannot release on the way out');
    tick(3);
    assert.notEqual(state.input.fireGroup, 2);
    assert.equal(state.input.actions.throwArm, false);
  });
});

test('save/load lifecycle clears the gesture without a sling release', () => {
  withWorldObjectHarness(({ state, bus, tick, clickDownAt, pointOn, station, hostile, thrower, woi }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, true, 'precondition: sling arm was held');
    bus.emit('save:loaded', {});
    tick(1);
    const diag = woi.diagnostics();
    assert.equal(diag.gestureActive, false, 'lifecycle clears the in-flight gesture');
    assert.equal(thrower._armAuthorized, false, 'the canceled arm cannot re-fire without a fresh press');
    assert.equal(thrower._pendingSnap, null, 'no payload release leaks out of the canceled arm');
  });
});

test('a modal or open screen never selects or fires behind the UI', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, pointOn, rock, setModal }) => {
    setModal(true);
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    assert.equal(state.player.targetId, null, 'no selection behind a modal');
    assert.equal(Object.hasOwn(state.input, 'worldObjectTargetId'), false, 'no gesture behind a modal');
    tick(19);
    assert.notEqual(state.input.fireGroup, 2, 'nothing fires behind the UI');
  });
});

test('a depleted beam subject never drifts into sling with a hostile on the rope', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, miner, player, rock, hostile, thrower }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.fireGroup, 2, 'precondition: beam lane is live');
    rock.data.respawnAt = state.simTime + 999;
    tick(5);
    assert.equal(state.input.fireGroup, 2, 'the lane stays beam — never re-sampled as sling');
    assert.equal(state.input.actions.throwArm, false,
      'the tethered hostile must not arm when the rock dies');
    assert.equal(miner._acquireTarget(player, 200, state), null,
      'the beam simply finds no target — no fallback, no throw');
    assert.equal(thrower._armAuthorized, false);
    clickUp();
  });
});

test('a weld completing mid-hold stays non-destructive on the rope', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, hostile, thrower }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const friend = {
      id: 80, type: 'ship', alive: true, team: 1,
      pos: { x: 0, z: 30 }, vel: { x: 0, z: 0 }, radius: 9, mass: 120,
      hull: 40, hullMax: 100, data: { name: 'Limping Freighter' },
      presentationAdmission: 'ready',
    };
    state.entities.set(friend.id, friend);
    state.entityList.push(friend);
    const friendRoot = bodyRootAt(0, 30, 9);
    state.render.scene.add(friendRoot);
    state.render.scene.updateMatrixWorld(true);
    state.render.meshes.set(friend.id, friendRoot);
    const pt = pointOn(friend);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.fireGroup, 2, 'precondition: the weld lane is beaming');
    friend.hull = friend.hullMax;
    tick(5);
    assert.equal(state.input.fireGroup, 2, 'the lane is still the captured beam, not sling');
    assert.equal(state.input.actions.throwArm, false,
      'the tethered hostile never arms when the weld completes');
    assert.equal(thrower._armAuthorized, false);
    clickUp();
  });
});

test('a visible pending NPC hull hovers and selects; its capability hint stays honest', () => {
  withWorldObjectHarness(({ state, win, canvas, tick, clickDownAt, clickUp, pointOn, woi, hudEl }) => {
    const pending = {
      id: 95, type: 'ship', alive: true, team: 2,
      pos: { x: 0, z: 30 }, vel: { x: 0, z: 0 }, radius: 9, mass: 120,
      hull: 40, hullMax: 100,
      presentationAdmission: 'pending',
      data: { name: 'Inspection Tender' },
    };
    state.entities.set(pending.id, pending);
    state.entityList.push(pending);
    const root = bodyRootAt(0, 30, 9);
    state.render.scene.add(root);
    state.render.scene.updateMatrixWorld(true);
    state.render.meshes.set(pending.id, root);

    const pt = pointOn(pending);
    win.dispatch('mousemove', { clientX: pt.x, clientY: pt.y });
    canvas.dispatch('mousemove', { target: canvas, clientX: pt.x, clientY: pt.y });
    tick(2);
    const diag = woi.diagnostics();
    assert.equal(diag.hoverId, pending.id, 'the visible pending hull is inspectable');
    const tag = hudEl.children.find((c) => c.className === 'sf-woi');
    assert.ok(tag, 'the hover tag mounted');
    assert.match(tag.children[1].textContent, /Appearance loading/i,
      'the tag names the loading state, not an available tool');
    assert.equal(isBeamTargetEligible(pending, state), false,
      'the pending hull cannot advertise an available beam');

    clickDownAt(pt.x, pt.y);
    assert.equal(state.player.targetId, pending.id, 'tap selects the pending hull');
    tick(19);
    assert.notEqual(state.input.fireGroup, 2, 'the pending hull never beams');
    assert.equal(state.input.actions.throwArm, false);
    assert.equal(state.player.miningTargetId == null, true);
    clickUp();
    assert.equal(state.player.targetId, pending.id, 'release retains the selection');
    assert.equal(pending.presentationAdmission, 'pending',
      'inspection never flips the readiness receipt');
    assert.equal(root.parent, state.render.scene, 'the body root is untouched by inspection');
  });
});

test('a sling lane dies with its rope — a fresh tether needs a fresh press', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, station, hostile, thrower }) => {
    const pod = {
      id: 90, type: 'payload', alive: true,
      pos: { x: 30, z: 30 }, vel: { x: 0, z: 0 }, radius: 5, mass: 40,
      data: { payloadType: 'cargo_pod' },
    };
    state.entities.set(pod.id, pod);
    state.entityList.push(pod);
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, true, 'precondition: sling armed on the captured lane');

    state.player.tether = { active: false, targetId: null };
    tick(3);
    assert.equal(state.input.actions.throwArm, false, 'the arm dies with the rope');

    state.player.tether = { active: true, targetId: pod.id, phase: 'taut' };
    tick(5);
    assert.equal(state.input.actions.throwArm, false,
      'a different tether cannot arm inside the old gesture');
    assert.equal(thrower._pendingSnap, null, 'nothing can release without a fresh press');
    clickUp();
    tick(1);

    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, true, 'a fresh press arms the new rope');
    clickUp();
  });
});

test('document hidden without window blur still cancels a held sling', () => {
  withWorldObjectHarness(({ state, doc, tick, clickDownAt, pointOn, station, hostile, emitted, thrower }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, true, 'precondition: sling arm was held');
    doc.visibilityState = 'hidden';
    doc.dispatch('visibilitychange');
    assert.equal(Object.hasOwn(state.input, 'worldObjectTargetId'), false,
      'visibility loss without blur still clears the gesture');
    assert.ok(emitted.some((e) => e.name === 'input:worldGestureCancelled'),
      'the scoped cancel still reaches masslineThrow');
    assert.equal(thrower._armAuthorized, false);
    tick(3);
    assert.equal(state.input.actions.throwArm, false, 'nothing flings while hidden');
    doc.visibilityState = 'visible';
  });
});

test('leaving the canvas keeps the held tool but paints nothing and never repicks', () => {
  withWorldObjectHarness(({ state, canvas, tick, clickDownAt, pointOn, woi, rock, hostile }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.fireGroup, 2, 'precondition: beam lane is live');
    canvas.dispatch('pointerleave');
    tick(2);
    let diag = woi.diagnostics();
    assert.equal(diag.hoverId, null, 'hover preview clears outside the canvas');
    assert.equal(diag.gestureTargetId, rock.id, 'the captured tool stays on the rock');
    assert.equal(state.input.fireGroup, 2, 'the beam keeps running while the cursor is off-canvas');
    const over = pointOn(hostile);
    canvas.dispatch('mousemove', { clientX: over.x, clientY: over.y });
    tick(1);
    diag = woi.diagnostics();
    assert.equal(diag.hoverId, rock.id,
      're-entering over another body still shows the captured subject, not a repaint behind it');
  });
});

test('a depleted beam noun never advertises sling in the preview hint', () => {
  withWorldObjectHarness(({ state, win, canvas, tick, pointOn, rock, hostile, hudEl }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    rock.data.respawnAt = state.simTime + 999;
    const pt = pointOn(rock);
    win.dispatch('mousemove', { clientX: pt.x, clientY: pt.y });
    canvas.dispatch('mousemove', { clientX: pt.x, clientY: pt.y });
    tick(1);
    const tagEl = hudEl.children[0];
    assert.ok(tagEl, 'hover tag is mounted');
    const hintEl = tagEl.children.find((c) => c.className === 'sf-woi__hint');
    assert.ok(hintEl, 'hint row exists');
    assert.ok(!/sling/i.test(hintEl.textContent),
      `a depleted mine noun must not promise the sling (got "${hintEl.textContent}")`);
    assert.ok(/depleted/i.test(hintEl.textContent),
      `the hint reports the real beam status (got "${hintEl.textContent}")`);
  });
});

test('a rope acquired during an inspect hold never arms mid-hold', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, station, hostile, thrower }) => {
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.actions.throwArm, false, 'precondition: inspect lane, no rope');
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    tick(5);
    assert.equal(state.input.actions.throwArm, false,
      'the gesture was captured as inspect; a later rope stays inert until re-press');
    assert.equal(thrower._armAuthorized, false);
    clickUp();
  });
});

test('a dead captured subject cancels through input before the field is removed', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, pointOn, rock, emitted, woi }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.equal(state.input.fireGroup, 2, 'precondition: beam lane is live');
    rock.alive = false;
    tick(1);
    assert.equal(Object.hasOwn(state.input, 'worldObjectTargetId'), false,
      'the dead subject ends the captured gesture');
    assert.ok(emitted.some((e) => e.name === 'input:worldGestureCancelled'),
      'the cancel ran through the input owner, not a silent field delete');
    const diag = woi.diagnostics();
    assert.equal(diag.gestureActive, false);
    tick(3);
    assert.notEqual(state.input.fireGroup, 2, 'no zombie beam after the subject dies');
  });
});

test('the physical UI clock owns the hold gate — a starved sim still beams the clicked rock', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, rock, advanceUiClock, host }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(2);
    assert.notEqual(state.input.fireGroup, 2, 'two slow sim ticks is only 0.033 sim-s held');
    advanceUiClock(280);
    tick(1);
    assert.equal(state.input.fireGroup, 2,
      '280 physical ms engages the beam even when the sim only ticked 3 times');
    assert.equal(state.input.worldObjectTargetId, rock.id);
    assert.equal(host._m2UsesUiClock, true, 'the FakeWindow scheduler is the bound clock source');
    clickUp();
  }, { uiClock: true });
});

test('a fast sim cannot beat the physical hold gate while the device clock is bound', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, rock, advanceUiClock }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.notEqual(state.input.fireGroup, 2,
      '19 sim ticks inside 280 physical ms must remain tap-only');
    advanceUiClock(280);
    tick(1);
    assert.equal(state.input.fireGroup, 2, 'the physical 280ms then engages');
    assert.equal(state.input.worldObjectTargetId, rock.id);
    clickUp();
  }, { uiClock: true });
});

test('release, cancel, destroy, and stale timer deliveries can never arm the hold late', () => {
  withWorldObjectHarness(({ state, win, tick, clickDownAt, clickUp, pointOn, rock, advanceUiClock, host, ctx }) => {
    const pt = pointOn(rock);
    const holdTimers = () => win.__timers.filter((t) => t.ms === 280);

    clickDownAt(pt.x, pt.y);
    const stale = holdTimers().pop();
    assert.ok(stale, 'the press queued its own 280ms timer');
    advanceUiClock(100);
    clickUp();
    stale.cb();
    tick(2);
    assert.equal(host._m2HoldReady, false, 'a released press cannot turn ready late');
    assert.notEqual(state.input.fireGroup, 2);

    clickDownAt(pt.x, pt.y);
    stale.cb();
    tick(2);
    assert.notEqual(state.input.fireGroup, 2,
      'a zombie callback from press 1 must not arm press 2');
    advanceUiClock(280);
    tick(1);
    assert.equal(state.input.fireGroup, 2, 'the fresh press needs and gets its own 280ms');
    clickUp();
    tick(1);

    clickDownAt(pt.x, pt.y);
    advanceUiClock(100);
    win.dispatch('blur');
    advanceUiClock(300);
    tick(2);
    assert.notEqual(state.input.fireGroup, 2, 'a canceled gesture cannot arm late');
    assert.equal(host._m2HoldReady, false);

    clickDownAt(pt.x, pt.y);
    const deadTimer = holdTimers().filter((t) => !t.fired).pop();
    advanceUiClock(100);
    host.destroy();
    deadTimer.cb();
    assert.equal(host._m2HoldReady, false, 'the dead host cannot be armed');
    host.init(ctx);
    clickDownAt(pt.x, pt.y);
    deadTimer.cb();
    tick(2);
    assert.notEqual(state.input.fireGroup, 2,
      'a pre-destroy callback cannot arm a post-reinit press');
    advanceUiClock(280);
    tick(1);
    assert.equal(state.input.fireGroup, 2, 're-init + a real 280ms still engages');
    clickUp();
  }, { uiClock: true });
});

test('a host without a UI scheduler keeps the deterministic sim-tick hold', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, rock, host }) => {
    assert.ok(!host._m2UsesUiClock, 'no scheduler bound — the sim-time gate stays');
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(10);
    assert.notEqual(state.input.fireGroup, 2);
    tick(9);
    assert.equal(state.input.fireGroup, 2, '19 ticks at 60Hz = the deterministic 0.28s gate');
    assert.equal(state.input.worldObjectTargetId, rock.id);
    clickUp();
  });
});
