import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';

const DT = 1 / 60;
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);

const restoreGlobals = installHeadlessBrowserStubs();
let harness = null;

try {
  harness = await makeLiveRegistryHarness();
  const { state, helpers, registry } = harness;

  const player = helpers.spawnEntity(makeShipSpec({
    team: 0,
    x: 100,
    rot: Math.PI,
    factionId: 'faction_free',
    role: 'player_massline_owner',
  }));
  player.physicsBody = { dynamic: false, ccd: false, mass: 1000000, inertiaY: 1000000, radius: player.radius };
  const actor = helpers.spawnEntity(makeShipSpec({
    team: 1,
    x: 0,
    rot: Math.PI,
    factionId: 'faction_scn',
    role: 'sg06_tether_escape_probe',
  }));
  actor.thrust = 2400;
  actor.maxSpeed = 1400;
  actor.drag = 0.15;
  actor.flightModel = {
    ...actor.flightModel,
    mainAccel: 2400,
    reverseAccel: 1200,
    strafeAccel: 1200,
    linearDrag: 0.15,
    maxSpeed: 1400,
  };
  state.playerId = player.id;
  state.spatialHash.rebuild(state.entityList);

  for (let i = 0; i < 2; i++) registry.step(DT);

  const attachRequest = helpers.requestCombatAction({
    actorId: player.id,
    actionId: 'action_attach',
    targetId: actor.id,
    source: { kind: 'fixture', controllerId: 'sg06-live-tether-break' },
  });
  assert.equal(attachRequest.ok, true, 'fixture should create Massline through the SG-03 action queue');
  for (let i = 0; i < 5; i++) registry.step(DT);

  const attachmentId = activeAttachmentId(state);
  assert(attachmentId, 'SG-03 action_attach should create an active Massline before SG-06 is enabled');
  const attachment = state.combat.attachments.byId[attachmentId];
  assert.equal(attachment.ownerId, player.id, 'fixture Massline owner should be the hostile endpoint from the AI perspective');
  assert.equal(attachment.targetId, actor.id, 'AI actor should be tethered as the Massline target');

  const legacyIntent = Object.freeze({ fire: false, sentinel: 'live-tether-break-must-not-touch-legacy-intent' });
  actor.data.intent = legacyIntent;
  actor.data.ai = {
    squadId: 'sg06_live_tether_break_wing',
    doctrine: 'official',
    preferredRole: 'tug',
    capabilities: ['counter_tether_overload', 'drive', 'tether', 'weapon', 'sensor'],
  };
  state.spatialHash.rebuild(state.entityList);

  let broken = null;
  let dash = null;
  for (let i = 0; i < 30; i++) {
    registry.step(DT);
    dash = state.combat.trace.events.find((event) =>
      event.kind === 'action.started' &&
      event.actorId === actor.id &&
      event.actionId === 'action_dash' &&
      event.source &&
      event.source.kind === 'ai' &&
      event.source.controllerId === 'sg06') || null;
    if (dash) break;
  }
  assert(dash, 'SG-06 should choose canonical action_dash to overload an attached Massline');

  const beforeOverload = attachmentTelemetry(harness, attachmentId);
  assert(beforeOverload, 'Massline should expose SG-02 telemetry before the overload fixture arms');
  actor.rot = Math.atan2(
    beforeOverload.targetWorld.z - beforeOverload.sourceWorld.z,
    beforeOverload.targetWorld.x - beforeOverload.sourceWorld.x,
  );
  actor.angVel = 0;
  assert.equal(state.combat.attachments.byId[attachmentId].state, 'active',
    'Massline should remain active before the SG-06 dash-armed overload fixture');
  assert(beforeOverload.tension <= 140,
    `Massline should stay below authored break tension before the SG-06 dash-armed overload fixture; got ${beforeOverload.tension}`);

  const armedOverload = armDashOverloadFixture(harness, attachmentId);
  assert(armedOverload.tension > 140,
    `SG-06 dash-armed overload fixture should load the Massline above threshold; got ${armedOverload.tension}`);

  for (let i = 0; i < 60; i++) {
    applyDashOverloadLoad(harness, attachmentId, actor.id);
    registry.step(DT);
    const current = state.combat.attachments.byId[attachmentId];
    if (current && current.state === 'broken') {
      broken = current;
      break;
    }
  }

  const breakEvent = state.combat.trace.events.find((event) =>
    event.kind === 'attachment.broken' &&
    event.attachmentId === attachmentId &&
    event.reason === 'threshold');
  const portDiagnostics = helpers.inspectAIPorts();
  const trace = registry.get('tacticalAI').inspect({ entityId: actor.id, trace: { layer: 'behavior', limit: 64 } }).trace;

  const finalAttachment = state.combat.attachments.byId[attachmentId];
  const finalTelemetry = finalAttachment && finalAttachment.state === 'active'
    ? helpers.combatPhysics.getAttachmentTelemetry({
      attachmentId,
      physicsHandle: finalAttachment.physicsHandle,
      tick: state.tick,
    })
    : null;
  assert(broken, `SG-06 escape behavior should arm a Massline overload that breaks through SG-02 threshold telemetry: ${JSON.stringify({
    actorPos: actor.pos,
    actorVel: actor.vel,
    dashTick: dash && dash.tick,
    finalAttachmentState: finalAttachment && finalAttachment.state,
    finalTension: finalAttachment && finalAttachment.lastTension,
    finalTelemetry,
    portDiagnostics,
  })}`);
  assert.equal(broken.breakReason, 'threshold', 'SG-06 dash-armed Massline break should preserve threshold reason');
  assert(breakEvent, 'SG-06 dash-armed Massline break should emit the threshold break trace');
  assert(breakEvent.tick >= dash.tick, 'threshold break should occur after the SG-06 dash starts');
  assert(broken.lastTension > 140, `break should preserve tension above threshold; got ${broken.lastTension}`);
  assert(broken.lastImpulse > 0, 'break should preserve impulse telemetry');
  assert.equal(harness.registry.get('physics')._sg02.diagnostics().attachments, 0,
    'SG-06 dash-armed threshold break should remove the physical SG-02 rope');
  assert.equal(actor.data.intent, legacyIntent, 'SG-06 tether escape must not mutate legacy intent');
  assert.equal(actor.data.intent.fire, false, 'SG-06 tether escape must not fire through legacy intent');
  assert(portDiagnostics.flushedManeuvers > 0, 'SG-06 tether escape should flush maneuver requests through production aiPorts');
  assert.equal(portDiagnostics.lastDropReason, null, 'SG-06 tether escape maneuver requests should not be dropped');
  assert(trace.some((entry) =>
    entry.decision === 'execute_action_def' &&
    entry.selected &&
    entry.selected.decision === 'start' &&
    entry.selected.actionId === 'action_dash'),
    'SG-06 behavior trace should record starting the canonical dash overload action');
} finally {
  if (harness) harness.dispose();
  restoreGlobals();
}

console.log('SG-06 live tether-break checks OK');

async function makeLiveRegistryHarness() {
  const state = createGameState(0x4706beef);
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
  assert.fail('SG-02 dynamic owner should initialize before live SG-06 tether-break fixture starts');
}

function armDashOverloadFixture(harness, attachmentId) {
  const { registry, state } = harness;
  const attachment = state.combat.attachments.byId[attachmentId];
  const telemetry = attachmentTelemetry(harness, attachmentId);
  assert(telemetry, 'Massline overload fixture should have SG-02 telemetry');
  const restLength = 8;
  const result = registry.get('actions').kernel.attachments.reel(
    attachmentId,
    restLength - attachment.restLength,
    restLength,
  );
  assert.equal(result.ok, true, 'Massline overload fixture should use the SG-03 attachment service');
  const after = attachmentTelemetry(harness, attachmentId);
  assert(after, 'Massline overload fixture should preserve SG-02 telemetry after reeling');
  return after;
}

function attachmentTelemetry(harness, attachmentId) {
  const { helpers, state } = harness;
  const attachment = state.combat.attachments.byId[attachmentId];
  if (!attachment || attachment.state !== 'active') return null;
  return helpers.combatPhysics.getAttachmentTelemetry({
    attachmentId,
    physicsHandle: attachment.physicsHandle,
    tick: state.tick,
  });
}

function applyDashOverloadLoad(harness, attachmentId, entityId) {
  const { helpers, state } = harness;
  const attachment = state.combat.attachments.byId[attachmentId];
  if (!attachment || attachment.state !== 'active') return;
  const telemetry = helpers.combatPhysics.getAttachmentTelemetry({
    attachmentId,
    physicsHandle: attachment.physicsHandle,
    tick: state.tick,
  });
  if (!telemetry) return;
  const towardEntity = attachment.targetId === entityId
    ? {
      x: telemetry.targetWorld.x - telemetry.sourceWorld.x,
      z: telemetry.targetWorld.z - telemetry.sourceWorld.z,
    }
    : {
      x: telemetry.sourceWorld.x - telemetry.targetWorld.x,
      z: telemetry.sourceWorld.z - telemetry.targetWorld.z,
    };
  const length = Math.hypot(towardEntity.x, towardEntity.z) || 1;
  const impulse = 240;
  helpers.combatPhysics.applyImpulse({
    entityId,
    impulse: { x: towardEntity.x / length * impulse, y: 0, z: towardEntity.z / length * impulse },
    reason: 'sg06_dash_overload_fixture',
    tick: state.tick,
  });
}

function activeAttachmentId(state) {
  return Object.keys(state.combat.attachments.byId)
    .sort()
    .find((id) => state.combat.attachments.byId[id].state === 'active') || null;
}

function makeShipSpec({ team, x, rot = 0, factionId, role = 'ship' }) {
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
    rot,
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
