// Shipped-registry auto-target contract: createRegistry → init → step uses real input + autoTargetAssist order.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { wrapAngle } from '../src/core/rng.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';
import { targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DT = 1 / 60;
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);

const restoreGlobals = installHeadlessBrowserStubs();

try {
  assertMainLifecycleWiring();
  const harness = makeRegistryHarness();
  const { state, bus, registry, ctx, listeners } = harness;

  const player = makeMovableShip({
    id: 1, team: 0, x: 0, z: 0,
    data: { weapons: [], combat: {}, derived: { cap: 100 } },
  });
  const hostile = makeMovableShip({
    id: 2, team: 1, x: 220, z: 0,
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 } },
    vel: { x: 0, z: 0 },
  });
  state.playerId = 1;
  state.player.targetId = 2;
  state.mode = 'flight';
  state.input.autoFire = true;
  state.input.turnIntent = 0.8;
  state.input.pointerScreen = { x: 520, y: 200, active: true };
  state.entities.set(1, player);
  state.entities.set(2, hostile);
  state.entityList.push(player, hostile);
  ensurePhysicsBodySpec(player);
  ensurePhysicsBodySpec(hostile);

  bus.on('ui:targetNearestHostileToPlayer', ({ quiet } = {}) => {
    targetNearestHostileToPlayer(state, bus, { quiet });
  });

  const inputSys = registry.get('input');
  assert(inputSys && typeof inputSys.update === 'function', 'registry must expose the live input system');
  inputSys._screen = { x: 400, y: 300, active: true };
  inputSys._ndc = { x: 0, y: 0 };
  inputSys._autoTargetPointerMode = true;
  state.input.autoTargetPath = {
    active: true,
    drawing: false,
    cursorX: 400,
    cursorY: 120,
    pointIndex: 1,
    points: [{ x: 0, z: 0 }, { x: 0, z: 300 }],
  };
  inputSys._lastKbmMs = performance.now();
  inputSys._keys = Object.create(null);
  if (inputSys.helpers) {
    inputSys.helpers.raycastToPlane = (ndc) => ({ x: ndc.x * 300, z: ndc.y * 300 });
  }

  registry.step(DT);

  const hostileAim = Math.atan2(hostile.pos.z - player.pos.z, hostile.pos.x - player.pos.x);
  const cursorAngle = Math.atan2(100, 90);
  assert.equal(state.input.aimWorld.x, hostile.pos.x, 'registry.step must publish lock aimWorld.x after assist');
  assert.equal(state.input.aimWorld.z, hostile.pos.z, 'registry.step must publish lock aimWorld.z after assist');
  assert(Math.abs(wrapAngle(state.input.aimAngle - hostileAim)) < 0.02,
    'registry.step aimAngle must track locked hostile, not cursor');
  assert(Math.abs(wrapAngle(state.input.aimAngle - cursorAngle)) > 0.5,
    'registry.step aimAngle must diverge from cursor bearing');
  assert(state.input.autoTargetPath.active,
    'registry.step must retain the drawn world route after captured motion stops');
  assert(state.input.autoTargetPath.points.at(-1).z === 300,
    'the drawn route endpoint must remain the flight authority');
  assert(state.input.moveX > 0.9,
    'world +Z must produce immediate right/lateral thrust while the ship faces +X');
  assert(Math.abs(state.input.moveZ) < 0.02,
    'world +Z must not be reinterpreted as ship-local forward throttle');
  assert(state.input.turnIntent > 0.9,
    'the nose must concurrently turn toward the requested world +Z travel direction');
  const physicsSys = registry.get('physics');
  if (physicsSys && physicsSys._sg02Init) await physicsSys._sg02Init;
  assert(physicsSys && physicsSys._sg02,
    'registry proof must wait for the real Rapier dynamic authority before judging ship travel');
  const initialX = player.pos.x;
  const initialZ = player.pos.z;
  const initialRot = player.rot;
  for (let i = 0; i < 45; i++) registry.step(DT);
  const travelX = player.pos.x - initialX;
  const travelZ = player.pos.z - initialZ;
  assert(travelZ > 0.2 && travelZ > Math.abs(travelX) * 2,
    `real Flight V3 + physics must accelerate mainly along requested world +Z; dx=${travelX} dz=${travelZ}`);
  assert(Math.abs(wrapAngle(player.rot - initialRot)) > 0.08,
    `real Flight V3 + physics must also turn the nose; start=${initialRot} end=${player.rot} turn=${state.input.turnIntent} route=${JSON.stringify(state.input.autoTargetPath)} auto=${state.input.autoFire} mode=${state.mode}`);

  globalThis.__setRegistryNow(1300);
  registry.step(DT);
  assert.equal(state.input.autoTargetPath.active, true,
    'finger lift must not discard an unfinished route');
  assert(Math.hypot(state.input.moveX, state.input.moveZ) > 0.1,
    'the flight computer must keep traversing the retained route after idle');
  assert.equal(state.input.boost, false,
    'path overdrive must not consume or impersonate the resource-gated boost input');
  console.log(`[PASS] registry-step-auto-target aimAngle=${state.input.aimAngle.toFixed(3)} travel=(${travelX.toFixed(3)},${travelZ.toFixed(3)}) rotDelta=${wrapAngle(player.rot - initialRot).toFixed(3)} routeActive=true`);

  const assist = registry.get('autoTargetAssist');
  assert(assist._onKeyDown && assist._onKeyUp, 'registry init must attach autoTargetAssist G-key handlers');
  const keydownBeforeDestroy = listeners.get('keydown')?.size || 0;
  const keyupBeforeDestroy = listeners.get('keyup')?.size || 0;
  registry.destroy();
  assert.equal(assist._onKeyDown, null, 'registry.destroy must clear autoTargetAssist keydown handler');
  assert.equal(assist._onKeyUp, null, 'registry.destroy must clear autoTargetAssist keyup handler');
  assert((listeners.get('keydown')?.size || 0) < keydownBeforeDestroy,
    'registry.destroy must remove at least the autoTargetAssist keydown listener');
  assert((listeners.get('keyup')?.size || 0) < keyupBeforeDestroy,
    'registry.destroy must remove at least the autoTargetAssist keyup listener');

  autoTargetAssist.init.call(assist, ctx);
  assert(assist._onKeyDown && assist._onKeyUp, 'autoTargetAssist re-init after destroy must reattach G-key handlers');
  const keydownAfterReinit = listeners.get('keydown')?.size || 0;
  autoTargetAssist.destroy.call(assist);
  assert.equal(assist._onKeyDown, null, 'second destroy must clear re-attached keydown handler');
  assert((listeners.get('keydown')?.size || 0) < keydownAfterReinit,
    'second destroy must tear down re-attached listeners without stacking');
  console.log('[PASS] registry-destroy-main-flow listeners torn down and re-init is idempotent');
} finally {
  restoreGlobals();
}

console.log('Auto-target registry checks OK');

function assertMainLifecycleWiring() {
  const mainSrc = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  assert.match(mainSrc, /beforeunload[\s\S]*registry\.destroy\(\)/,
    'main.js must wire beforeunload → registry.destroy for listener teardown');
  assert.match(mainSrc, /resetCombatInputMode\(state, registry\)/,
    'main.js must reset auto-target on new game and loaded-game entry');
  console.log('[PASS] main-lifecycle beforeunload destroy + resetCombatInputMode wired');
}

function makeMovableShip({ id, team, x, z, data = {}, vel = null }) {
  const pos = vec3(x, z);
  const v = vel || { x: 0, z: 0 };
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    team,
    radius: 8,
    pos,
    prevPos: vec3(x, z),
    rot: 0,
    prevRot: 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    vel: { x: v.x || 0, z: v.z || 0 },
    cap: 100,
    data,
  };
}

function vec3(x, z) {
  const v = { x, y: 0, z };
  v.copy = (other) => {
    v.x = other.x;
    v.y = other.y ?? 0;
    v.z = other.z;
    return v;
  };
  return v;
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
  assert(registry.get('autoTargetAssist'), 'registry must register autoTargetAssist for init + step');
  assert(registry.get('input'), 'registry must register input for the shipped tick path');

  return { state, bus, registry, ctx, listeners: globalThis.__sfListenerMap };
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
  globalThis.addEventListener = (type, fn, opts) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, set = new Set());
    set.add(fn);
    return previous.addEventListener?.(type, fn, opts);
  };
  globalThis.removeEventListener = (type, fn, opts) => {
    listeners.get(type)?.delete(fn);
    return previous.removeEventListener?.(type, fn, opts);
  };
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
