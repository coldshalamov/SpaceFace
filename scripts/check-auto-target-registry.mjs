import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DT = 1 / 60;
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);
const restoreGlobals = installHeadlessBrowserStubs();

try {
  assertMainLifecycleWiring();
  const { state, registry, ctx, listeners } = makeRegistryHarness();
  const player = makeShip({ id: 1, team: 0, x: 0, z: 0 });
  const target = makeShip({ id: 2, team: 1, x: 220, z: 0, vel: { x: 0, z: 30 } });
  state.playerId = player.id;
  state.player.targetId = target.id;
  state.mode = 'flight';
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  state.entityList.push(player, target);

  const assist = registry.get('autoTargetAssist');
  assert(assist, 'registry must expose the shipped G auto-target system');
  let acquisitionRequests = 0;
  busOn(ctx.bus, 'ui:targetNearestHostileToPlayer', () => acquisitionRequests++);

  assist._onKeyDown(keyEvent('KeyG'));
  assist._onKeyUp(keyEvent('KeyG'));
  assert.equal(state.input.autoFire, true, 'G must enable auto-target');
  assert.equal(acquisitionRequests, 1, 'enabling auto-target must request the nearest hostile');

  assist.update(DT, state);
  assert(state.input.aimWorld.z > target.pos.z,
    'the registry-owned update must lead a moving target');

  state.input.autoTargetPath = {
    active: true,
    drawing: false,
    cursorX: 0,
    cursorY: 0,
    pointIndex: 1,
    points: [{ x: 0, z: 0 }, { x: 0, z: 180 }],
  };
  assist.update(DT, state);
  assert(Math.abs(state.input.moveX) + Math.abs(state.input.moveZ) + Math.abs(state.input.turnIntent) > 0,
    'the registry-owned update must translate a drawn path into flight input');
  console.log('[PASS] registry G toggle -> lead aim -> draw-to-fly command');

  assist._onKeyDown(keyEvent('KeyG'));
  assist._onKeyUp(keyEvent('KeyG'));
  assert.equal(state.input.autoFire, false, 'a second G press must disable auto-target');

  assert(assist._onKeyDown && assist._onKeyUp, 'registry init must attach G handlers');
  const keydownBeforeDestroy = listeners.get('keydown')?.size || 0;
  registry.destroy();
  assert.equal(assist._onKeyDown, null, 'registry.destroy must clear the G keydown handler');
  assert((listeners.get('keydown')?.size || 0) < keydownBeforeDestroy,
    'registry.destroy must remove the capture-phase listener');
  autoTargetAssist.init.call(assist, ctx);
  const keydownAfterReinit = listeners.get('keydown')?.size || 0;
  autoTargetAssist.destroy.call(assist);
  assert((listeners.get('keydown')?.size || 0) < keydownAfterReinit,
    're-init/destroy must not stack G listeners');
  console.log('[PASS] registry teardown + re-init listener lifecycle');
} finally {
  restoreGlobals();
}

console.log('Auto-target registry checks OK');

function busOn(bus, event, handler) {
  bus.on(event, handler);
}

function keyEvent(code) {
  return {
    code,
    target: null,
    preventDefault() {},
    stopImmediatePropagation() {},
  };
}

function assertMainLifecycleWiring() {
  const mainSource = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  assert.match(mainSource, /beforeunload[\s\S]*registry\.destroy\(\)/,
    'main.js must wire beforeunload -> registry.destroy');
  assert.match(mainSource, /resetCombatInputMode[\s\S]*autoFire\s*=\s*false/,
    'main.js must clear auto-target on new/load entry');
  console.log('[PASS] main lifecycle resets auto-target and destroys listeners');
}

function makeShip({ id, team, x, z, vel = { x: 0, z: 0 } }) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    team,
    radius: 8,
    pos: { x, y: 0, z },
    prevPos: { x, y: 0, z },
    rot: 0,
    prevRot: 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    vel: { x: vel.x, z: vel.z },
    cap: 100,
    data: { weapons: [{ projSpeed: 360 }], combat: {}, derived: { cap: 100, mass: 120 } },
  };
}

function makeRegistryHarness() {
  const state = createGameState(0xa0701e01);
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;
  for (const system of registry.systems) {
    if (HEADLESS_SKIP.has(system.name)) continue;
    if (typeof system.init === 'function') system.init(ctx);
  }
  return { state, registry, ctx, listeners: globalThis.__sfListenerMap };
}

function installHeadlessBrowserStubs() {
  const previous = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    document: globalThis.document,
    window: globalThis.window,
    performance: globalThis.performance,
  };
  const listeners = new Map();
  globalThis.__sfListenerMap = listeners;
  globalThis.addEventListener = (type, fn) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, set = new Set());
    set.add(fn);
  };
  globalThis.removeEventListener = (type, fn) => listeners.get(type)?.delete(fn);
  globalThis.innerWidth = 800;
  globalThis.innerHeight = 600;
  let now = 1000;
  globalThis.performance = { now: () => now };
  globalThis.__setRegistryNow = (value) => { now = value; };
  const elementStub = () => ({
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    appendChild() {},
    remove() {},
    setAttribute() {},
    addEventListener() {},
    removeEventListener() {},
  });
  globalThis.document = {
    getElementById: elementStub,
    createElement: elementStub,
    addEventListener() {},
    removeEventListener() {},
    body: { classList: { contains: () => false } },
  };
  globalThis.window = globalThis;
  return () => {
    globalThis.addEventListener = previous.addEventListener;
    globalThis.removeEventListener = previous.removeEventListener;
    globalThis.innerWidth = previous.innerWidth;
    globalThis.innerHeight = previous.innerHeight;
    globalThis.document = previous.document;
    globalThis.window = previous.window;
    globalThis.performance = previous.performance;
    delete globalThis.__sfListenerMap;
    delete globalThis.__setRegistryNow;
  };
}
