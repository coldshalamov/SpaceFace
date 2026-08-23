import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { COUNTER_TETHER_RESPONSE_TICKS } from '../src/ai/sg03ActionPort.js';

const DT = 1 / 60;
// The authored counter-tether telegraph delays the first eligible dash by
// COUNTER_TETHER_RESPONSE_TICKS after first selection; the wait budget must exceed it or the
// canonical escape can never legally start.
const DASH_WAIT_TICKS = COUNTER_TETHER_RESPONSE_TICKS + 90;
const HEADLESS_SKIP = new Set(['render', 'vfx', 'feel', 'audio', 'ui', 'save']);
const STANDARD_MASSLINE_DEF = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const PREVIOUS_STANDARD_BREAK = Object.freeze({ maxTension: 1_050_000, maxImpulse: 19_000, maxYank: 15_000 });
assert(STANDARD_MASSLINE_DEF, 'tether_standard attachment definition must exist');

const restoreGlobals = installHeadlessBrowserStubs();
let harness = null;

try {
  harness = await makeLiveRegistryHarness();
  const { state, bus, helpers, registry } = harness;
  const breakEvents = [];
  bus.on('tether:broken', (payload) => breakEvents.push(payload));

  const player = helpers.spawnEntity(makeShipSpec({
    team: 0,
    x: 100,
    rot: Math.PI,
    factionId: 'faction_free',
    role: 'player_massline_owner',
  }));
  player.physicsBody = { dynamic: true, ccd: false, mass: 1000000, inertiaY: 1000000, radius: player.radius };
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

  const attachRequest = registry.get('actions').kernel.attachments.create({
    defId: STANDARD_MASSLINE_DEF.id,
    ownerId: player.id,
    targetId: actor.id,
  });
  assert.equal(attachRequest.ok, true, 'fixture should create the live standard Massline through the SG-03 attachment service');
  for (let i = 0; i < 5; i++) registry.step(DT);

  const attachmentId = attachRequest.attachment && attachRequest.attachment.id;
  assert(attachmentId, 'standard Massline fixture should return an attachment id before SG-06 is enabled');
  const attachment = state.combat.attachments.byId[attachmentId];
  assert.equal(attachment.defId, STANDARD_MASSLINE_DEF.id,
    'SG-06 durability acceptance must exercise the player-facing tether_standard definition');
  assert.equal(attachment.ownerId, player.id, 'fixture Massline owner should be the hostile endpoint from the AI perspective');
  assert.equal(attachment.targetId, actor.id, 'AI actor should be tethered as the Massline target');

  const legacyIntent = Object.freeze({ fire: false, sentinel: 'live-tether-resilience-must-not-touch-legacy-intent' });
  actor.data.intent = legacyIntent;
  actor.data.ai = {
    squadId: 'sg06_live_tether_resilience_wing',
    doctrine: 'official',
    preferredRole: 'tug',
    capabilities: ['counter_tether_overload', 'drive', 'tether', 'weapon', 'sensor'],
  };
  state.spatialHash.rebuild(state.entityList);

  let dash = null;
  for (let i = 0; i < DASH_WAIT_TICKS; i++) {
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
  assert(dash, 'SG-06 should choose canonical action_dash to escape an attached Massline');

  const beforeLoad = attachmentTelemetry(harness, attachmentId);
  assert(beforeLoad, 'standard Massline should expose SG-02 telemetry before the slack-load fixture arms');
  actor.rot = Math.atan2(
    beforeLoad.targetWorld.z - beforeLoad.sourceWorld.z,
    beforeLoad.targetWorld.x - beforeLoad.sourceWorld.x,
  );
  actor.angVel = 0;
  assert.equal(state.combat.attachments.byId[attachmentId].state, 'active',
    'standard Massline should remain active before the SG-06 dash-armed slack-load fixture');

  const slackTelemetry = armDashSlackFixture(harness, attachmentId);
  assert(slackTelemetry.restLength - slackTelemetry.distance >= 20,
    `SG-06 fixture should begin with meaningful line slack; got ${JSON.stringify({
      distance: slackTelemetry.distance,
      restLength: slackTelemetry.restLength,
    })}`);

  let peakDistance = slackTelemetry.distance;
  let peakTension = slackTelemetry.tension;
  let peakImpulse = slackTelemetry.impulse;
  for (let i = 0; i < 60; i++) {
    applyDashSlackLoad(harness, attachmentId, actor.id);
    registry.step(DT);
    const current = state.combat.attachments.byId[attachmentId];
    assert.equal(current && current.state, 'active',
      `ordinary standard Massline must remain active for the full forced dash/slack-load interval (tick ${i + 1}/60)`);
    const telemetry = attachmentTelemetry(harness, attachmentId);
    assert(telemetry, `standard Massline should retain SG-02 telemetry during forced load tick ${i + 1}/60`);
    peakDistance = Math.max(peakDistance, telemetry.distance);
    peakTension = Math.max(peakTension, telemetry.tension);
    peakImpulse = Math.max(peakImpulse, telemetry.impulse);
  }

  const thresholdBreakTrace = state.combat.trace.events.filter((event) =>
    event.kind === 'attachment.broken' &&
    event.attachmentId === attachmentId &&
    event.reason === 'threshold');
  const thresholdBreakEvents = breakEvents.filter((event) =>
    event &&
    event.attachmentId === attachmentId &&
    event.reason === 'threshold');
  const portDiagnostics = helpers.inspectAIPorts();
  const trace = registry.get('tacticalAI').inspect({ entityId: actor.id, trace: { layer: 'behavior', limit: 64 } }).trace;

  const finalAttachment = state.combat.attachments.byId[attachmentId];
  const finalTelemetry = attachmentTelemetry(harness, attachmentId);
  assert.equal(finalAttachment && finalAttachment.state, 'active',
    'ordinary standard Massline should still be active after the complete SG-06 dash/slack-load interval');
  assert(finalTelemetry, 'surviving standard Massline should retain live physical attachment telemetry');
  assert(peakDistance > slackTelemetry.restLength,
    `forced load must catch and extend the initially slack line so this durability proof is non-vacuous; got ${JSON.stringify({
      peakDistance,
      slackRestLength: slackTelemetry.restLength,
      peakTension,
      peakImpulse,
    })}`);
  assert(peakTension > 0, `forced slack catch should produce positive line tension; got ${peakTension}`);
  assert(peakImpulse > 0, `forced slack catch should produce positive line impulse; got ${peakImpulse}`);
  assert.equal(thresholdBreakTrace.length, 0, 'standard Massline must emit zero threshold-break trace entries');
  assert.equal(thresholdBreakEvents.length, 0, 'standard Massline must emit zero threshold-break bus events');
  assert.equal(harness.registry.get('physics')._sg02.diagnostics().attachments, 1,
    'surviving standard Massline should preserve its physical SG-02 rope');
  assert.notEqual(actor.data.intent, legacyIntent, 'fire adapter should replace frozen legacy intent snapshots safely');
  assert.equal(legacyIntent.fire, false, 'frozen legacy intent fixture must remain untouched');
  assert.equal(actor.data.intent.sentinel, 'live-tether-resilience-must-not-touch-legacy-intent',
    'fire adapter should preserve non-firing intent fields');
  assert.equal(actor.data.intent.fire, false, 'SG-06 tether escape must not fire through visible weapon intent');
  assert(portDiagnostics.flushedManeuvers > 0, 'SG-06 tether escape should flush maneuver requests through production aiPorts');
  assert.equal(portDiagnostics.lastDropReason, null, 'SG-06 tether escape maneuver requests should not be dropped');
  assert(trace.some((entry) =>
    entry.decision === 'execute_action_def' &&
    entry.selected &&
    entry.selected.decision === 'start' &&
    entry.selected.actionId === 'action_dash'),
    'SG-06 behavior trace should record starting the canonical dash escape action');

  // Challenge the ordinary endpoint above the former physical envelope. This is intentionally
  // more violent than the preceding real SG-06 dash/slack catch: it proves the semantic no-break
  // policy under a non-vacuous load that the previous tune could actually have classified as a
  // failure, while the normal maneuver above remains separately measured.
  let challengePeakTension = peakTension;
  let challengePeakImpulse = peakImpulse;
  for (let i = 0; i < 90; i++) {
    applyDashSlackLoad(harness, attachmentId, actor.id, 2_400);
    registry.step(DT);
    const current = state.combat.attachments.byId[attachmentId];
    assert.equal(current && current.state, 'active',
      `ordinary endpoint must survive the former-edge durability challenge (tick ${i + 1}/90)`);
    const telemetry = attachmentTelemetry(harness, attachmentId);
    assert(telemetry, 'former-edge durability challenge retains live SG-02 telemetry');
    challengePeakTension = Math.max(challengePeakTension, telemetry.tension);
    challengePeakImpulse = Math.max(challengePeakImpulse, telemetry.impulse);
  }
  assert(
    challengePeakTension > PREVIOUS_STANDARD_BREAK.maxTension || challengePeakImpulse > PREVIOUS_STANDARD_BREAK.maxImpulse,
    `live durability challenge must cross at least one former standard-Massline break edge; got ${JSON.stringify({
      challengePeakTension,
      challengePeakImpulse,
      previous: PREVIOUS_STANDARD_BREAK,
    })}`,
  );

  // Future station/singularity-class content must opt in explicitly. The same already-loaded line
  // becomes failure-capable only after the endpoint declares that authored extreme-load contract.
  actor.data.masslineBreakPolicy = 'extreme_overload';
  let extremeBreak = null;
  for (let i = 0; i < 180; i++) {
    // The authored 15-tick near-break warning lease (player counterplay) delays every threshold
    // cut; a merely-ordinary load decays below the overload edge before the lease expires. The
    // extreme-load contract is only exercised by a load that stays past the edge, like the
    // former-edge challenge above.
    applyDashSlackLoad(harness, attachmentId, actor.id, 2_400);
    registry.step(DT);
    const current = state.combat.attachments.byId[attachmentId];
    if (current && current.state === 'broken') {
      extremeBreak = current;
      break;
    }
  }
  assert(extremeBreak, 'an explicitly authored extreme-load endpoint retains the automatic overload-break seam');
  assert.equal(extremeBreak.breakReason, 'threshold');
  assert.equal(breakEvents.filter((event) => event?.attachmentId === attachmentId && event?.reason === 'threshold').length, 1,
    'the explicit extreme-load transition emits one canonical threshold-break receipt');
  assert.equal(harness.registry.get('physics')._sg02.diagnostics().attachments, 0,
    'the explicit extreme-load break removes the physical SG-02 attachment');
} finally {
  if (harness) harness.dispose();
  restoreGlobals();
}

console.log('SG-06 live standard-Massline resilience checks OK');

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
      if (typeof registry.destroy === 'function') registry.destroy();
      else {
        const physics = registry.get('physics');
        if (physics && typeof physics._disableSg02DynamicAuthority === 'function') {
          physics._disableSg02DynamicAuthority();
        }
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
  assert.fail('SG-02 dynamic owner should initialize before live SG-06 tether resilience fixture starts');
}

function armDashSlackFixture(harness, attachmentId) {
  const { registry, state } = harness;
  const attachment = state.combat.attachments.byId[attachmentId];
  const telemetry = attachmentTelemetry(harness, attachmentId);
  assert(telemetry, 'Massline slack-load fixture should have SG-02 telemetry');
  const restLength = Math.min(STANDARD_MASSLINE_DEF.maxLength, telemetry.distance + 60);
  const result = registry.get('actions').kernel.attachments.reel(
    attachmentId,
    restLength - attachment.restLength,
    STANDARD_MASSLINE_DEF.minLength,
  );
  assert.equal(result.ok, true, 'Massline slack-load fixture should use the SG-03 attachment service');
  registry.step(DT);
  const after = attachmentTelemetry(harness, attachmentId);
  assert(after, 'Massline slack-load fixture should preserve SG-02 telemetry after paying out line');
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

function applyDashSlackLoad(harness, attachmentId, entityId, loadImpulse = 240) {
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
  helpers.combatPhysics.applyImpulse({
    entityId,
    impulse: { x: towardEntity.x / length * loadImpulse, y: 0, z: towardEntity.z / length * loadImpulse },
    reason: 'sg06_dash_slack_load_fixture',
    tick: state.tick,
  });
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
    addEventListener: globalThis.addEventListener,
    removeEventListener: globalThis.removeEventListener,
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
