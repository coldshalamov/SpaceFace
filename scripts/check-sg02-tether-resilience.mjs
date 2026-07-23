import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';

const DT = 1 / 60;
const state = createGameState(0x4702be);
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.entities.clear();
state.entityList.length = 0;
state.playerId = 1;

const helpers = {};
const bus = createBus();
const ctx = { state, bus, helpers, registry: { get() { return null; } } };
const breakReceipts = [];
const nearBreakReceipts = [];
bus.on('tether:broken', (payload) => breakReceipts.push(payload));
bus.on('tether:nearBreak', (payload) => nearBreakReceipts.push(payload));

try {
  physics.init(ctx);
  actions.init(ctx);

  const ordinary = addPair({ actorId: 1, targetId: 2, extreme: false });
  physics.update(DT, state);
  await physics._sg02Init;
  assert(physics._sg02, 'production SG-02 owner should initialize for the Massline resilience fixture');

  const ordinaryCase = createLoadedAttachment(ordinary, 0);
  for (let tick = 4; tick <= 90; tick++) {
    applyOutwardLoad(ordinaryCase.attachmentId, ordinary, tick);
    step(tick, ordinaryCase.telemetryHigh);
    assert.equal(
      state.combat.attachments.byId[ordinaryCase.attachmentId]?.state,
      'active',
      `ordinary action_attach Massline must survive outward thrust (tick ${tick}/90)`,
    );
  }

  const ordinaryAttachment = state.combat.attachments.byId[ordinaryCase.attachmentId];
  const ordinaryThresholdTrace = thresholdBreakTrace(ordinaryCase.attachmentId);
  assert(
    ordinaryCase.telemetryHigh.tension > ordinaryAttachment.tetherPolicy.break.maxTension
      || ordinaryCase.telemetryHigh.impulse > ordinaryAttachment.tetherPolicy.break.maxImpulse,
    `ordinary resilience load must cross a former automatic-break edge; got ${JSON.stringify(ordinaryCase.telemetryHigh)}`,
  );
  assert.equal(ordinaryAttachment.breakReason, null, 'ordinary load must not fabricate a break reason');
  assert.equal(ordinaryAttachment.masslineRuntime?.integrity, 1,
    'ordinary action_attach load must not accumulate hidden integrity damage');
  assert.equal(ordinaryAttachment.masslineRuntime?.overloadS, 0,
    'ordinary action_attach load must not accumulate overload debt');
  assert.equal(ordinaryThresholdTrace.length, 0, 'ordinary load emits no threshold-break trace');
  assert.equal(
    breakReceipts.filter((receipt) => receipt?.attachmentId === ordinaryCase.attachmentId).length,
    0,
    'ordinary load emits no break receipt',
  );
  assert.equal(
    nearBreakReceipts.filter((receipt) => receipt?.attachmentId === ordinaryCase.attachmentId).length,
    0,
    'ordinary load emits no impending-break warning',
  );
  assert.equal(physics._sg02.diagnostics().attachments, 1,
    'ordinary action_attach retains its physical SG-02 attachment');

  const manualCut = actions.kernel.attachments.cut(
    ordinaryCase.attachmentId,
    ordinary.actor.id,
    'tether_cut',
  );
  assert.equal(manualCut.ok, true, 'pilot/manual cut remains available on a non-breaking line');
  assert.equal(ordinaryAttachment.state, 'broken');
  assert.equal(ordinaryAttachment.breakReason, 'tether_cut');
  assert.equal(physics._sg02.diagnostics().attachments, 0, 'manual cut removes the physical attachment');

  const extreme = addPair({ actorId: 3, targetId: 4, extreme: true });
  state.tick = 100;
  state.simTime = 100 * DT;
  physics.update(DT, state);
  const extremeCase = createLoadedAttachment(extreme, 101);
  for (let tick = 105; tick <= 180; tick++) {
    applyOutwardLoad(extremeCase.attachmentId, extreme, tick);
    step(tick, extremeCase.telemetryHigh);
    if (state.combat.attachments.byId[extremeCase.attachmentId]?.state === 'broken') break;
  }

  const extremeAttachment = state.combat.attachments.byId[extremeCase.attachmentId];
  const extremeBreaks = breakReceipts.filter((receipt) =>
    receipt?.attachmentId === extremeCase.attachmentId && receipt?.reason === 'threshold');
  const extremeWarnings = nearBreakReceipts.filter((receipt) =>
    receipt?.attachmentId === extremeCase.attachmentId);
  assert.equal(extremeAttachment.state, 'broken',
    `explicit extreme endpoint should preserve overload-break telemetry; max=${JSON.stringify(extremeCase.telemetryHigh)}`);
  assert.equal(extremeAttachment.breakReason, 'threshold');
  assert(extremeAttachment.lastTension > 0, 'extreme break preserves tension telemetry');
  assert(extremeAttachment.lastImpulse > 0, 'extreme break preserves impulse telemetry');
  assert.equal(extremeWarnings.length, 1, 'explicit extreme endpoint emits one ordered near-break warning');
  assert.equal(extremeBreaks.length, 1, 'explicit extreme endpoint emits one threshold-break receipt');
  assert.equal(thresholdBreakTrace(extremeCase.attachmentId).length, 1,
    'explicit extreme endpoint appends one canonical threshold-break trace');
  assert.equal(physics._sg02.diagnostics().attachments, 0,
    'explicit extreme overload removes the physical SG-02 attachment');
} finally {
  if (actions.kernel && typeof actions.kernel.dispose === 'function') actions.kernel.dispose();
  if (typeof physics._disableSg02DynamicAuthority === 'function') physics._disableSg02DynamicAuthority();
}

console.log('SG-02 production Massline resilience checks OK');

function addPair({ actorId, targetId, extreme }) {
  const actor = makeCombatShip(actorId, 0, 0);
  const target = makeCombatShip(targetId, 1, 120);
  if (extreme) target.data.masslineBreakPolicy = 'extreme_overload';
  for (const entity of [actor, target]) {
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
  }
  return { actor, target };
}

function createLoadedAttachment(pair, startTick) {
  requestAction(startTick, {
    actorId: pair.actor.id,
    actionId: 'action_attach',
    targetId: pair.target.id,
    source: { kind: 'player' },
  });
  const telemetryHigh = { tension: 0, impulse: 0 };
  runTicks(startTick, startTick + 3, telemetryHigh);
  const attachment = Object.values(state.combat.attachments.byId)
    .find((candidate) => candidate?.state === 'active' && candidate.ownerId === pair.actor.id);
  assert(attachment, 'action_attach should create an active semantic Massline attachment');
  assert.equal(attachment.defId, 'attachment_massline',
    'SG-02 resilience gate exercises the generic production action_attach definition');

  state.tick = startTick + 4;
  state.simTime = (startTick + 4) * DT;
  const reelResult = actions.kernel.attachments.reel(attachment.id, -999, 8);
  assert.equal(reelResult.ok, true, 'SG-03 attachment service should shorten the Massline for the load fixture');
  assert(attachment.restLength > 8, 'load fixture respects SG-02 safe reel clamping');
  assert(attachment.restLength < 120, 'load fixture shortens the line enough to load it');
  return { attachmentId: attachment.id, telemetryHigh };
}

function requestAction(tick, request) {
  state.tick = tick;
  state.simTime = tick * DT;
  const result = helpers.requestCombatAction(request);
  assert.equal(result.ok, true, `action request should be accepted: ${request.actionId}`);
}

function runTicks(fromTick, toTick, highWater = null) {
  for (let tick = fromTick; tick <= toTick; tick++) step(tick, highWater);
}

function step(tick, highWater = null) {
  state.tick = tick;
  state.simTime = tick * DT;
  actions.update(DT, state);
  physics.update(DT, state);
  actions.kernel.postPhysics(DT);
  if (highWater) recordTelemetry(highWater);
}

function applyOutwardLoad(attachmentId, pair, tick) {
  const attachment = state.combat.attachments.byId[attachmentId];
  if (!helpers.combatPhysics || !attachment || attachment.state !== 'active') return;
  const impulse = 120;
  helpers.combatPhysics.applyImpulse({
    entityId: pair.actor.id,
    impulse: { x: -impulse, y: 0, z: 0 },
    reason: 'sg02_tether_resilience_fixture',
    tick,
  });
  helpers.combatPhysics.applyImpulse({
    entityId: pair.target.id,
    impulse: { x: impulse, y: 0, z: 0 },
    reason: 'sg02_tether_resilience_fixture',
    tick,
  });
}

function recordTelemetry(highWater) {
  for (const attachment of Object.values(state.combat.attachments.byId)) {
    if (!attachment || attachment.state !== 'active') continue;
    const telemetry = helpers.combatPhysics.getAttachmentTelemetry({
      attachmentId: attachment.id,
      physicsHandle: attachment.physicsHandle,
      tick: state.tick,
    });
    if (!telemetry) continue;
    highWater.tension = Math.max(highWater.tension, telemetry.tension);
    highWater.impulse = Math.max(highWater.impulse, telemetry.impulse);
  }
}

function thresholdBreakTrace(attachmentId) {
  return state.combat.trace.events.filter((event) =>
    event?.kind === 'attachment.broken'
      && event.attachmentId === attachmentId
      && event.reason === 'threshold');
}

function makeCombatShip(id, team, x) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 12,
    mass: 28,
    flightModel: { inertia: 88 },
    pos: { x, z: 0 },
    prevPos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    team,
    factionId: `faction_sg02_${team}`,
    hull: 150,
    hullMax: 150,
    armorHp: 40,
    armorMax: 40,
    armorFlat: 2,
    shield: 50,
    shieldMax: 50,
    cap: 100,
    capMax: 100,
    capRegen: 5,
    lastDamageT: -1e9,
    flags: {},
    data: {
      derived: { damageReductionMult: 1 },
      combatProfileId: 'combat_profile_standard_ship',
    },
  };
}

function createBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      let set = listeners.get(event);
      if (!set) listeners.set(event, set = new Set());
      set.add(fn);
      return () => set.delete(fn);
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload, event);
    },
  };
}
