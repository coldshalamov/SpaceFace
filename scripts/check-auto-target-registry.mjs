// Shipped-registry PQ-007 contract: G selection -> target-relative impulse -> manual release.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { ensurePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { autoTargetAssist } from '../src/systems/autoTargetAssist.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DT = 1 / 60;
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);
const restoreGlobals = installHeadlessBrowserStubs();

try {
  assertMainLifecycleWiring();
  const { state, registry, ctx, listeners } = makeRegistryHarness();
  const player = makeMovableShip({
    id: 1, team: 0, x: 0, z: 0,
    data: { weapons: [], combat: {}, derived: { cap: 100, mass: 120 } },
  });
  const target = makeMovableShip({
    id: 2, team: 1, x: 220, z: 0,
    data: { ai: { fsm: 'attack' }, combat: { targetId: 1 }, derived: { mass: 120 } },
    vel: { x: 0, z: 0 },
  });
  state.playerId = player.id;
  state.player.targetId = target.id;
  state.mode = 'flight';
  state.entities.set(player.id, player);
  state.entities.set(target.id, target);
  state.entityList.push(player, target);
  ensurePhysicsBodySpec(player);
  ensurePhysicsBodySpec(target);

  const inputSys = registry.get('input');
  const assist = registry.get('autoTargetAssist');
  assert(inputSys && assist, 'registry must expose the shipped input and G-assist systems');
  inputSys._screen = { x: 520, y: 200, active: true };
  inputSys._ndc = { x: 0.3, y: 1 / 3 };
  inputSys._lastKbmMs = performance.now();
  inputSys._keys = Object.create(null);
  inputSys.helpers.raycastToPlane = (ndc) => ({ x: ndc.x * 300, z: ndc.y * 300 });

  assist._onKeyDown(keyEvent('KeyG'));
  assist._onKeyUp(keyEvent('KeyG'));
  assert.equal(state.input.pursuitSlot.active, true, 'G must select the current ship lock');
  assert.equal(state.input.pursuitSlot.source, 'g');
  assert.equal(state.input.autoFire, false, 'G must not enable the retired persistent weapon autoaim');

  // Reposition the selected station to the target's port side. This is what relative pointer motion
  // edits; writing the already-tested slot value directly keeps this registry proof about ordering
  // and the real Flight V3 -> Rapier membrane.
  state.input.pursuitSlot = {
    ...state.input.pursuitSlot,
    bearing: Math.PI / 2,
    range: 220,
    reason: 'registry-proof-adjustment',
  };
  registry.step(DT);
  assert.equal(state.input.actions.autopursuit, true,
    'input must publish the selected slot before Flight V3 runs');
  assert(player._flightFrame?.pursuitSlot?.active,
    'Flight V3 must expose active pursuit telemetry on the shipped frame');
  assert(player._flightFrame.pursuitSlot.saturated,
    'the deliberately large station transition must visibly hit the bounded assist cap');
  const cursorAim = Math.atan2(100, 90);
  assert(Math.abs(state.input.aimAngle - cursorAim) < 0.02,
    'weapon aim must remain on the independent software cursor');

  assert(player._flightFrame.pursuitSlot.maxAcceleration > 0,
    'the shipped frame must expose the finite bounded acceleration cap');
  assert(player._flightFrame.pursuitSlot.desiredPosition.x > player.pos.x
    && player._flightFrame.pursuitSlot.desiredPosition.z > player.pos.z,
  'the target-relative station must resolve into the adjusted world quadrant');

  inputSys._keys.KeyW = true;
  registry.step(DT);
  assert.equal(state.input.pursuitSlot.active, false,
    'manual movement must release pursuit in the same input tick');
  assert.equal(state.input.pursuitSlot.reason, 'manual-override');
  assert.equal(state.input.actions.autopursuit, false,
    'Flight V3 must see no pursuit command on the release tick');
  console.log(`[PASS] registry pursuit select->bounded hold->manual release cap=${player._flightFrame.pursuitSlot.maxAcceleration.toFixed(3)} overrideTicks=1`);

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

console.log('Pursuit-slot registry checks OK');

function keyEvent(code) {
  return {
    code,
    target: null,
    preventDefault() {},
    stopImmediatePropagation() {},
  };
}

function assertMainLifecycleWiring() {
  const mainSrc = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
  assert.match(mainSrc, /beforeunload[\s\S]*registry\.destroy\(\)/,
    'main.js must wire beforeunload -> registry.destroy');
  assert.match(mainSrc, /resetCombatInputMode[\s\S]*pursuitSlot[\s\S]*runtime-reset/,
    'main.js must clear transient pursuit state for new/load entry');
  console.log('[PASS] main lifecycle resets pursuit and destroys listeners');
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
