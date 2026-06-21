import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';

const DT = 1 / 60;
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);

const restoreGlobals = installHeadlessBrowserStubs();

try {
  assertDefaultRegistryUsesLegacyAI();
  const harness = await makeLiveRegistryHarness();
  const { state, helpers, registry } = harness;

  const player = helpers.spawnEntity(makeShipSpec({
    team: 0,
    x: 180,
    factionId: 'faction_free',
    role: 'player_probe_target',
  }));
  const actor = helpers.spawnEntity(makeShipSpec({
    team: 1,
    x: 0,
    factionId: 'faction_scn',
    ai: {
      squadId: 'sg06_live_registry_wing',
      doctrine: 'official',
      preferredRole: 'leader',
      capabilities: ['ranged'],
    },
  }));
  state.playerId = player.id;
  state.spatialHash.rebuild(state.entityList);

  const legacyIntent = Object.freeze({ fire: false, sentinel: 'live-registry-must-not-touch-legacy-intent' });
  actor.data.intent = legacyIntent;

  for (let i = 0; i < 10; i++) registry.step(DT);

  const events = state.combat.trace.events;
  const aiRequest = events.find((event) =>
    event.kind === 'action.requested' &&
    event.actorId === actor.id &&
    event.actionId === 'action_burst' &&
    event.source &&
    event.source.kind === 'ai' &&
    event.source.controllerId === 'sg06');
  const aiStart = events.find((event) =>
    event.kind === 'action.started' &&
    event.actorId === actor.id &&
    event.actionId === 'action_burst' &&
    event.source &&
    event.source.kind === 'ai' &&
    event.source.controllerId === 'sg06');
  const aiEffect = events.find((event) =>
    event.kind === 'action.effect' &&
    event.actorId === actor.id &&
    event.actionId === 'action_burst');
  const portDiagnostics = helpers.inspectAIPorts();
  const physicsDiagnostics = state.physicsRuntime && state.physicsRuntime.diagnostics;

  assert.equal(registry.get('ai'), registry.get('tacticalAI'), 'AI slot should resolve to tacticalAI when SG-06 backend is opted in');
  assert.equal(registry.get('ai').name, 'tacticalAI', 'production AI slot should run the SG-06 system');
  assert.equal(physicsDiagnostics && physicsDiagnostics.sg02Ready, true, 'live SG-06 registry gate should run against SG-02 dynamic authority');
  assert(aiRequest, 'live registry tacticalAI should submit canonical action_burst through SG-03');
  assert(aiStart, 'SG-03 should start the live-registry AI action through the canonical queue');
  assert(aiEffect, 'SG-03 should own the live-registry AI action effect');
  assert.equal(aiRequest.target.entityId, player.id, 'live registry AI action should target the hostile ship through SG-03');
  assert.equal(actor.data.intent, legacyIntent, 'live registry tacticalAI must not mutate the legacy AI intent contract');
  assert.equal(actor.data.intent.fire, false, 'live registry tacticalAI must not request combat through legacy intent.fire');
  assert(portDiagnostics.acceptedManeuvers > 0, 'live registry tacticalAI should bind the production maneuver port');
  assert(portDiagnostics.flushedManeuvers > 0, 'production registry aiPorts should flush SG-06 maneuvers into SG-02');
  assert.equal(portDiagnostics.lastDropReason, null, 'live registry SG-06 maneuvers should not be dropped after SG-02 is ready');

  harness.dispose();
} finally {
  restoreGlobals();
}

console.log('SG-06 live production-registry checks OK');

function assertDefaultRegistryUsesLegacyAI() {
  const state = createGameState(0x47060001);
  const bus = createBus();
  const ctx = { state, bus, helpers: {}, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;
  assert.equal(state.settings.gameplay.aiBackend, 'legacy', 'default settings should keep the legacy AI backend');
  assert.equal(registry.get('ai').name, 'ai', 'default registry AI slot should remain legacy');
  assert.equal(registry.get('tacticalAI'), undefined, 'default registry should not register tacticalAI');
}

async function makeLiveRegistryHarness() {
  const state = createGameState(0x4706c0df);
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.settings.gameplay.tutorialHints = false;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  const registry = createRegistry(ctx);
  ctx.registry = registry;

  for (const system of registry.systems) {
    if (HEADLESS_SKIP.has(system.name)) continue;
    if (typeof system.init === 'function') system.init(ctx);
  }
  assert.equal(registry.get('ai'), registry.get('tacticalAI'), 'opted-in registry should alias ai to tacticalAI');
  await ensureSg02Ready(registry, state);

  return {
    state,
    bus,
    helpers,
    registry,
    dispose() {
      const physics = registry.get('physics');
      if (physics && typeof physics._disableSg02DynamicAuthority === 'function') {
        physics._disableSg02DynamicAuthority();
      }
    },
  };
}

async function ensureSg02Ready(registry, state) {
  for (let i = 0; i < 8; i++) {
    registry.step(DT);
    const physics = registry.get('physics');
    if (physics && physics._sg02Init) await physics._sg02Init;
    const diag = state.physicsRuntime && state.physicsRuntime.diagnostics;
    if (diag && diag.backend === 'rapier-dynamic' && diag.sg02Ready === true) return;
  }
  assert.fail('SG-02 dynamic owner should initialize before live SG-06 registry fixture starts combat');
}

function makeShipSpec({ team, x, factionId, role = 'ship', ai = null }) {
  return {
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 32,
    thrust: 90,
    turnRate: 3,
    drag: 1.2,
    maxSpeed: 140,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    team,
    factionId,
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 60,
    shieldMax: 60,
    cap: 100,
    capMax: 100,
    capRegen: 8,
    flightModel: { inertia: 88 },
    data: {
      role,
      combatProfileId: 'combat_profile_standard_ship',
      ...(ai ? { ai } : {}),
    },
  };
}

function installHeadlessBrowserStubs() {
  const previous = {
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
    innerWidth: globalThis.innerWidth,
    innerHeight: globalThis.innerHeight,
    document: globalThis.document,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
  };
  const listeners = new Map();
  globalThis.addEventListener = (type, fn) => {
    let set = listeners.get(type);
    if (!set) listeners.set(type, set = new Set());
    set.add(fn);
  };
  globalThis.removeEventListener = (type, fn) => {
    const set = listeners.get(type);
    if (set) set.delete(fn);
  };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;
  globalThis.document = {
    getElementById() { return null; },
    querySelector() { return null; },
    createElement() {
      return {
        style: {},
        classList: { add() {}, remove() {}, toggle() {} },
        appendChild() {},
        remove() {},
        setAttribute() {},
        addEventListener() {},
        querySelector() { return null; },
        innerHTML: '',
        textContent: '',
      };
    },
    head: { appendChild() {} },
    body: { appendChild() {} },
  };
  globalThis.window = globalThis;
  globalThis.localStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {},
    key() { return null; },
    clear() {},
    get length() { return 0; },
  };
  return () => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  };
}
