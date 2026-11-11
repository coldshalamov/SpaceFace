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
  const names = ['window', 'document', 'innerWidth', 'innerHeight', 'addEventListener', 'removeEventListener', 'ResizeObserver'];
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

  // 'auto' (default) installs a recording fake; 'off' leaves ResizeObserver absent;
  // 'throwing' makes observe() fail so the interaction must re-measure every pick.
  const roMode = opts.resizeObserver || 'auto';
  let roCallback = null;
  let roDisconnects = 0;
  let roInstalled = false;
  if (roMode === 'off') {
    delete globalThis.ResizeObserver;
  } else {
    globalThis.ResizeObserver = class FakeResizeObserver {
      constructor(cb) { roCallback = cb; }
      observe() {
        if (roMode === 'throwing') throw new Error('ResizeObserver.observe failed');
        roInstalled = true;
      }
      disconnect() { roDisconnects += 1; }
    };
  }
  const ro = {
    get installed() { return roInstalled; },
    get disconnects() { return roDisconnects; },
    fire() { if (roCallback) roCallback([]); },
  };

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
    return fn({ state, win, doc, canvas, bus, emitted, tick, clickDownAt, clickUp, pointOn, woi, miner, thrower, player, rock, hostile, station, hudEl, host, ctx, advanceUiClock, ro, setModal: (v) => {
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

test('an RMB hold never mines — the captured subject is beamed by the aimed-mine wheel latch', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, rock, miner, player, host }) => {
    const pt = pointOn(rock);
    // G18-02: RMB is the Line in every context. No hold length turns it into a beam.
    clickDownAt(pt.x, pt.y);
    tick(19);
    assert.notEqual(state.input.fireGroup, 2, 'RMB never produces the beam');
    assert.equal(state.input.worldObjectTargetId, rock.id, 'the click still captures the subject');
    // The beam now rides the context wheel's aimed-mine latch — it fires on the captured rock.
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(1);
    assert.equal(state.input.fireGroup, 2, 'the wheel latch is the beam now');
    const acquired = miner._acquireTarget(player, 200, state);
    assert.equal(acquired && acquired.id, rock.id, 'the beam acts on exactly the clicked rock');
    clickUp();
    tick(1);
    assert.equal(state.input.fireGroup, 2, 'the latch outlives the click — it is a toggle');
    assert.equal(state.player.targetId, rock.id, 'selection outlives the gesture');
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(1);
    assert.notEqual(state.input.fireGroup, 2, 'the toggle releases the beam');
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

test('a latched hostile arms the sling on RMB — the wheel beam stays on the clicked rock', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, miner, player, rock, hostile, host }) => {
    state.player.tether = { active: true, targetId: hostile.id };
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(3);
    // G18-02: while the rope carries a throwable payload RMB is the sling arm — the click
    // captures the beam subject, it does not decide what RMB does.
    assert.equal(state.input.actions.throwArm, true, 'the rope owns RMB while it is throwable');
    assert.notEqual(state.input.fireGroup, 2, 'the beam is not RMB\'s job anymore');
    assert.equal(state.input.worldObjectTargetId, rock.id);
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(1);
    assert.notEqual(state.input.fireGroup, 2, 'the armed sling pre-empts the wheel beam while held');
    assert.equal(miner._acquireTarget(player, 200, state).id, rock.id,
      'the captured rock is still what the beam resolves');
    clickUp();
    tick(1);
    assert.equal(state.input.actions.throwArm, false, 'the arm spent itself on release');
    assert.equal(state.input.fireGroup, 2, 'with RMB up the wheel beam runs');
  });
});

test('an RMB press while roped to a throwable is the sling arm — release is the throw', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, hostile }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(hostile);
    clickDownAt(pt.x, pt.y);
    tick(2);
    // G18-02: the Line IS the sling — holding RMB aims, releasing throws. There is no gate.
    assert.equal(state.input.actions.throwArm, true, 'holding RMB on the rope arms the throw');
    clickUp();
    tick(2);
    assert.equal(state.input.actions.throwArm, false, 'release disarms the arm');
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

test('a depleted rock under the click cannot disarm the rope — RMB follows the Line', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, miner, player, rock, hostile, thrower, host }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(3);
    assert.equal(state.input.actions.throwArm, true, 'the rope owns RMB — the click cannot disarm it');
    rock.data.respawnAt = state.simTime + 999;
    tick(3);
    assert.equal(state.input.actions.throwArm, true, 'still the sling — nothing drifts');
    assert.equal(miner._acquireTarget(player, 200, state), null,
      'a depleted rock offers the captured beam nothing');
    clickUp();
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(2);
    assert.equal(state.input.fireGroup, 2, 'the wheel beam runs after release');
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
  });
});

test('a damaged friendly welds under the wheel beam — never under the rope\'s sling', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, hostile, thrower, host }) => {
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
    tick(2);
    // G18-02: the rope owns RMB — clicking a friend is a select, not a shield for the hostile.
    assert.equal(state.input.actions.throwArm, true, 'the rope arms on RMB, not the click subject');
    clickUp();
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(2);
    assert.equal(state.input.fireGroup, 2, 'the weld rides the wheel beam');
    assert.equal(state.input.actions.throwArm, false, 'the sling released with the button');
    friend.hull = friend.hullMax;
    tick(3);
    assert.equal(state.input.fireGroup, 2, 'the beam stays on the wheel, never the rope');
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
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

test('the sling arm dies with its rope — a different catch in the same hold re-arms', () => {
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
    tick(3);
    assert.equal(state.input.actions.throwArm, true, 'precondition: the rope arms the held Line');

    state.player.tether = { active: false, targetId: null };
    tick(3);
    assert.equal(state.input.actions.throwArm, false, 'the arm dies with the rope');

    // G18-02: the held Line owns whatever it has caught — a fresh rope to a throwable
    // payload arms inside the same hold; the release slings it.
    state.player.tether = { active: true, targetId: pod.id, phase: 'taut' };
    tick(5);
    assert.equal(state.input.actions.throwArm, true,
      'the held Line arms on its new catch — the throw follows the rope');
    clickUp();
    tick(1);
    assert.equal(state.input.actions.throwArm, false, 'release disarms');

    clickDownAt(pt.x, pt.y);
    tick(3);
    assert.equal(state.input.actions.throwArm, true, 'a fresh press arms the same way');
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

test('leaving the canvas keeps the captured subject and its beam, paints nothing, never repicks', () => {
  withWorldObjectHarness(({ state, canvas, tick, clickDownAt, pointOn, woi, rock, hostile, host }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    tick(2);
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(1);
    assert.equal(state.input.fireGroup, 2, 'precondition: the wheel beam is live on the rock');
    canvas.dispatch('pointerleave');
    tick(2);
    let diag = woi.diagnostics();
    assert.equal(diag.hoverId, null, 'hover preview clears outside the canvas');
    assert.equal(diag.gestureTargetId, rock.id, 'the captured subject stays on the rock');
    assert.equal(state.input.fireGroup, 2, 'the beam keeps running while the cursor is off-canvas');
    const over = pointOn(hostile);
    canvas.dispatch('mousemove', { clientX: over.x, clientY: over.y });
    tick(1);
    diag = woi.diagnostics();
    assert.equal(diag.hoverId, rock.id,
      're-entering over another body still shows the captured subject, not a repaint behind it');
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
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

test('a rope acquired mid-hold arms — the held Line owns the catch it lands', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, clickUp, pointOn, station, hostile, thrower }) => {
    const pt = pointOn(station);
    clickDownAt(pt.x, pt.y);
    tick(3);
    assert.equal(state.input.actions.throwArm, false, 'precondition: select only, no rope');
    // G18-02: RMB is the Line — while it is held, whatever it catches is yours to sling.
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    tick(5);
    assert.equal(state.input.actions.throwArm, true,
      'the rope landing inside the hold arms the throw — press → latch → aim → release');
    clickUp();
    tick(1);
    assert.equal(state.input.actions.throwArm, false, 'release disarms the arm');
  });
});

test('a dead captured subject cancels through input before the field is removed', () => {
  withWorldObjectHarness(({ state, tick, clickDownAt, pointOn, rock, emitted, woi, host, miner, player }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
    tick(2);
    assert.equal(state.input.fireGroup, 2, 'precondition: the wheel beam is live on the rock');
    rock.alive = false;
    tick(1);
    assert.equal(Object.hasOwn(state.input, 'worldObjectTargetId'), false,
      'the dead subject ends the captured gesture');
    assert.ok(emitted.some((e) => e.name === 'input:worldGestureCancelled'),
      'the cancel ran through the input owner, not a silent field delete');
    const diag = woi.diagnostics();
    assert.equal(diag.gestureActive, false);
    assert.equal(diag.gestureTargetId, null, 'the dead subject leaves no target behind');
    host.applyWheelVerb({ action: 'aimedMine', phase: 'toggle' });
  });
});

test('RMB is the Line from the first tick — there is no hold gate to wait out', () => {
  withWorldObjectHarness(({ state, win, tick, clickDownAt, clickUp, pointOn, rock, host }) => {
    const pt = pointOn(rock);
    // G18-02: the m2 tool lane and its 280ms gate are gone. The press feeds the Line's
    // grammar immediately; no physical or sim clock ever turns RMB into a beam.
    clickDownAt(pt.x, pt.y);
    tick(1);
    assert.equal(state.input.actions.tetherFire, true, 'the Line fires on the first tick');
    assert.notEqual(state.input.fireGroup, 2, 'and it is never the beam');
    assert.ok(!win.__timers || win.__timers.every((t) => t.ms !== 280),
      'no tool-hold timer exists for the retired lane');
    tick(19);
    assert.notEqual(state.input.fireGroup, 2, 'no hold length turns RMB into the beam');
    clickUp();
  }, { uiClock: true });
});

test('release, blur, and destroy leave no sling arm behind', () => {
  withWorldObjectHarness(({ state, win, tick, clickDownAt, clickUp, pointOn, hostile, ctx, host, emitted }) => {
    state.player.tether = { active: true, targetId: hostile.id, phase: 'taut' };
    const pt = pointOn(hostile);
    clickDownAt(pt.x, pt.y);
    tick(2);
    assert.equal(state.input.actions.throwArm, true, 'precondition: the held Line arms');
    clickUp();
    tick(1);
    assert.equal(state.input.actions.throwArm, false, 'release disarms');

    clickDownAt(pt.x, pt.y);
    tick(2);
    assert.equal(state.input.actions.throwArm, true);
    win.dispatch('blur');
    tick(2);
    assert.equal(state.input.actions.throwArm, false, 'blur cannot leave an arm behind');
    assert.ok(emitted.some((e) => e.name === 'input:worldGestureCancelled'));

    clickDownAt(pt.x, pt.y);
    tick(1);
    host.destroy();
    assert.equal(host._m2, false, 'teardown releases the button');
    host.init(ctx);
    tick(2);
    assert.equal(state.input.actions.throwArm, false, 'a dead owner cannot arm the next one');
  });
});

// ---- observed viewport bounds: one record, invalidated by real geometry events ------------
// Picking must not repeatedly force layout after HUD writes. Bounds share one measured record,
// while resize, scroll, and deliberate clicks keep targeting aligned with the live canvas.
// Count only direct woi.tick/pick paths — host input ticks may read the canvas on their own.

function rectCounter(canvas) {
  const raw = canvas.getBoundingClientRect;
  const counter = { reads: 0 };
  canvas.getBoundingClientRect = () => { counter.reads += 1; return raw(); };
  return counter;
}

test('observed canvas bounds are measured once per layout change, not once per pick', () => {
  withWorldObjectHarness(({ state, canvas, woi, pointOn, rock, ro }) => {
    assert.equal(ro.installed, true, 'precondition: the observer path is live');
    const counter = rectCounter(canvas);
    const pt = pointOn(rock);
    state.input.pointerScreen = { x: pt.x, y: pt.y, active: true };
    canvas.dispatch('mousemove', { target: canvas, clientX: pt.x, clientY: pt.y });
    woi.tick(1 / 60);
    assert.equal(counter.reads, 1, 'the first observed pick measures the canvas exactly once');
    assert.equal(woi.diagnostics().hoverId, rock.id);
    counter.reads = 0;
    for (let i = 0; i < 10; i += 1) woi.tick(1 / 60);
    assert.equal(counter.reads, 0, 'an unchanged layout reuses the measured record');
    assert.equal(woi.diagnostics().hoverId, rock.id, 'the cached record still hovers the rock');
  });
});

test('cached bounds never freeze the raycast — a moved world target still updates hover', () => {
  withWorldObjectHarness(({ state, canvas, woi, pointOn, rock, hostile }) => {
    const pt = pointOn(rock);
    state.input.pointerScreen = { x: pt.x, y: pt.y, active: true };
    canvas.dispatch('mousemove', { target: canvas, clientX: pt.x, clientY: pt.y });
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id);

    const over = pointOn(hostile);
    state.input.pointerScreen.x = over.x;
    state.input.pointerScreen.y = over.y;
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, hostile.id,
      'a moving cursor still raycasts fresh hits under cached bounds');

    rock.pos.x = 200;
    rock.pos.z = 200;
    const root = state.render.meshes.get(rock.id);
    root.position.set(200, 0, 200);
    state.render.scene.updateMatrixWorld(true);
    state.input.pointerScreen.x = pt.x;
    state.input.pointerScreen.y = pt.y;
    woi.tick(1 / 60);
    assert.notEqual(woi.diagnostics().hoverId, rock.id,
      'a moved body leaves the previously-hovered point');
  });
});

test('world sweep under a still cursor is latched — hover never strobes at pick rate', () => {
  withWorldObjectHarness(({ state, canvas, woi, tick, pointOn, rock, hostile }) => {
    const realPerf = globalThis.performance;
    let now = realPerf.now();
    globalThis.performance = { now: () => now };
    try {
      const pt = pointOn(rock);
      state.input.pointerScreen = { x: pt.x, y: pt.y, active: true };
      canvas.dispatch('mousemove', { target: canvas, clientX: pt.x, clientY: pt.y });
      woi.tick(1 / 60);
      assert.equal(woi.diagnostics().hoverId, rock.id, 'precondition: the rock is hovered');

      // The world sweeps: the rock leaves and the hostile slides under the MOTIONLESS cursor.
      rock.pos.x = 200; rock.pos.z = 200;
      state.render.meshes.get(rock.id).position.set(200, 0, 200);
      hostile.pos.x = 0; hostile.pos.z = 0;
      state.render.meshes.get(hostile.id).position.set(0, 0, 0);
      state.render.scene.updateMatrixWorld(true);

      // Idle-cadence repick 1 sees the hostile once — a single sighting must not switch.
      woi.tick(0.13);
      assert.equal(woi.diagnostics().hoverId, rock.id,
        'one pick under a still cursor does not retarget the hover');

      // Repick 2 agrees — the sweep is real, not jitter, so the hover follows.
      woi.tick(0.13);
      assert.equal(woi.diagnostics().hoverId, hostile.id,
        'a sustained sweep retargets after two agreeing picks');

      // Everything sweeps away: the empty pick holds through the grace window, then drops.
      hostile.pos.x = 250; hostile.pos.z = 250;
      state.render.meshes.get(hostile.id).position.set(250, 0, 250);
      state.render.scene.updateMatrixWorld(true);
      woi.tick(0.13);
      assert.equal(woi.diagnostics().hoverId, hostile.id,
        'a first empty pick does not blink the hover off');
      now += 200;
      woi.tick(0.13);
      assert.equal(woi.diagnostics().hoverId, null,
        'a sustained empty pick retires the hover');
    } finally {
      globalThis.performance = realPerf;
    }
  });
});

test('a resize observer delivery re-measures new canvas bounds', () => {
  withWorldObjectHarness(({ state, canvas, woi, pointOn, rock, ro }) => {
    state.input.pointerScreen = { x: 500, y: 400, active: true };
    canvas.dispatch('mousemove', { target: canvas, clientX: 500, clientY: 400 });
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id, 'precondition: the center hits the rock');

    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400 });
    state.input.pointerScreen.x = 250;
    state.input.pointerScreen.y = 200;
    woi.tick(1 / 60);
    assert.notEqual(woi.diagnostics().hoverId, rock.id,
      'without invalidation the stale 1000x800 record misses the new center');

    ro.fire();
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id,
      'the observer callback re-measures and the 500x400 center selects');
  });
});

test('a captured document scroll re-measures moved canvas offsets', () => {
  withWorldObjectHarness(({ state, canvas, doc, woi, pointOn, rock }) => {
    state.input.pointerScreen = { x: 500, y: 400, active: true };
    canvas.dispatch('mousemove', { target: canvas, clientX: 500, clientY: 400 });
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id);

    canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 1000, height: 800 });
    state.input.pointerScreen.x = 600;
    state.input.pointerScreen.y = 450;
    woi.tick(1 / 60);
    assert.notEqual(woi.diagnostics().hoverId, rock.id,
      'the stale zero offset misses the shifted client point');

    doc.dispatch('scroll');
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id,
      'scroll invalidates and the refreshed (100,50) offset centers the rock');
  });
});

test('a window resize invalidates the cached record', () => {
  withWorldObjectHarness(({ state, win, canvas, woi, pointOn, rock }) => {
    state.input.pointerScreen = { x: 500, y: 400, active: true };
    canvas.dispatch('mousemove', { target: canvas, clientX: 500, clientY: 400 });
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id);

    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 500, height: 400 });
    state.input.pointerScreen.x = 250;
    state.input.pointerScreen.y = 200;
    woi.tick(1 / 60);
    assert.notEqual(woi.diagnostics().hoverId, rock.id, 'precondition: the stale record misses');

    win.dispatch('resize');
    woi.tick(1 / 60);
    assert.equal(woi.diagnostics().hoverId, rock.id,
      'window resize re-measures and the new center selects');
  });
});

test('right-button down re-measures immediately — no invalidation delivery required', () => {
  withWorldObjectHarness(({ state, canvas, clickDownAt, clickUp, pointOn, rock }) => {
    const pt = pointOn(rock);
    clickDownAt(pt.x, pt.y);
    assert.equal(state.player.targetId, rock.id, 'down on the existing target selects');
    clickUp();
    assert.equal(state.player.targetId, rock.id, 'release retains the selection');

    canvas.getBoundingClientRect = () => ({ left: 300, top: 200, width: 1000, height: 800 });
    clickDownAt(300 + pt.x, 200 + pt.y);
    assert.equal(state.player.targetId, rock.id,
      'a down after a silent layout shift still re-measures and lands the rock');
    clickUp();
  });
});

test('a host without a working ResizeObserver re-measures every pick and follows changes', () => {
  for (const mode of ['off', 'throwing']) {
    withWorldObjectHarness(({ state, canvas, woi, pointOn, rock, ro }) => {
      assert.equal(ro.installed, false, `${mode}: no observation is active`);
      const counter = rectCounter(canvas);
      const pt = pointOn(rock);
      state.input.pointerScreen = { x: pt.x, y: pt.y, active: true };
      canvas.dispatch('mousemove', { target: canvas, clientX: pt.x, clientY: pt.y });
      woi.tick(1 / 60);
      woi.tick(1 / 60);
      assert.equal(counter.reads, 2, `${mode}: every pick re-measures without an observer`);
      assert.equal(woi.diagnostics().hoverId, rock.id);

      canvas.getBoundingClientRect = () => {
        counter.reads += 1;
        return { left: 0, top: 0, width: 500, height: 400 };
      };
      state.input.pointerScreen.x = 250;
      state.input.pointerScreen.y = 200;
      woi.tick(1 / 60);
      assert.equal(counter.reads, 3, `${mode}: the changed rect is read on the next pick`);
      assert.equal(woi.diagnostics().hoverId, rock.id,
        `${mode}: unobserved picks always follow the real bounds`);
    }, { resizeObserver: mode });
  }
});

test('destroy disconnects the observer once and drops the invalidation listeners', () => {
  withWorldObjectHarness(({ state, win, doc, canvas, woi, ro, pointOn, rock }) => {
    const counter = rectCounter(canvas);
    state.input.pointerScreen = { x: 500, y: 400, active: true };
    canvas.dispatch('mousemove', { target: canvas, clientX: 500, clientY: 400 });
    woi.tick(1 / 60);
    const resizeBefore = win.listenerCount('resize');
    const scrollBefore = doc.listenerCount('scroll');
    assert.ok(resizeBefore >= 1, 'the resize listener is installed');
    assert.ok(scrollBefore >= 1, 'the captured scroll listener is installed');
    assert.ok(counter.reads >= 1, 'a pick measured the canvas');

    woi.destroy();
    assert.equal(ro.disconnects, 1, 'the observer is disconnected exactly once');
    assert.equal(win.listenerCount('resize'), resizeBefore - 1,
      'the resize listener leaves with destroy (the input host keeps its own)');
    assert.equal(doc.listenerCount('scroll'), scrollBefore - 1,
      'the scroll listener leaves with destroy');

    counter.reads = 0;
    ro.fire();
    woi.tick(1 / 60);
    woi.destroy();
    assert.equal(counter.reads, 0, 'a stale observer delivery after destroy is inert');
    assert.equal(ro.disconnects, 1, 'a second destroy cannot double-disconnect');
  });
});
