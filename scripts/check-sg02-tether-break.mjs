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

const actor = makeCombatShip(1, 0, 0);
const target = makeCombatShip(2, 1, 120);
for (const entity of [actor, target]) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
}

const helpers = {};
const bus = createBus();
const ctx = { state, bus, helpers, registry: { get() { return null; } } };

let attachmentId = null;
const telemetryHigh = { tension: 0, impulse: 0 };

try {
  physics.init(ctx);
  actions.init(ctx);

  physics.update(DT, state);
  await physics._sg02Init;
  assert(physics._sg02, 'production SG-02 owner should initialize for the Massline break fixture');

  requestAction(0, { actorId: actor.id, actionId: 'action_attach', targetId: target.id, source: { kind: 'player' } });
  runTicks(0, 3, telemetryHigh);
  attachmentId = Object.keys(state.combat.attachments.byId)[0];
  assert(attachmentId, 'attach should create a semantic Massline attachment');
  assert.equal(state.combat.attachments.byId[attachmentId].state, 'active', 'Massline should start active');
  assert.equal(physics._sg02.diagnostics().attachments, 1, 'SG-02 should own one physical Massline rope');

  state.tick = 4;
  state.simTime = 4 * DT;
  const reelResult = actions.kernel.attachments.reel(attachmentId, -999, 8);
  assert.equal(reelResult.ok, true, 'SG-03 attachment service should be able to shorten the Massline for overload');
  assert.equal(state.combat.attachments.byId[attachmentId].restLength, 8, 'overload fixture should force the Massline to minimum rest length');

  for (let tick = 4; tick <= 30 && state.combat.attachments.byId[attachmentId].state === 'active'; tick++) {
    applyOutwardLoad(tick);
    step(tick, telemetryHigh);
  }

  const attachment = state.combat.attachments.byId[attachmentId];
  const breakEvents = state.combat.trace.events.filter((event) =>
    event && event.kind === 'attachment.broken' && event.attachmentId === attachmentId);

  assert.equal(attachment.state, 'broken',
    `overloaded Massline should break through SG-03 semantic state; maxTension=${telemetryHigh.tension} maxImpulse=${telemetryHigh.impulse}`);
  assert.equal(attachment.breakReason, 'threshold', 'break reason should identify authored threshold overload');
  assert(attachment.lastTension > 140, `break should preserve tension telemetry above the authored threshold; got ${attachment.lastTension}`);
  assert(attachment.lastImpulse > 0, 'break should preserve impulse telemetry');
  assert.equal(breakEvents.length, 1, 'Massline threshold overload should emit exactly one break event');
  assert.equal(breakEvents[0].reason, 'threshold', 'break trace should report threshold reason');
  assert(breakEvents[0].tension > 140, 'break trace should include tension telemetry');
  assert(breakEvents[0].impulse > 0, 'break trace should include impulse telemetry');
  assert.equal(physics._sg02.diagnostics().attachments, 0, 'threshold break should remove the physical SG-02 rope');
} finally {
  if (actions.kernel && typeof actions.kernel.dispose === 'function') actions.kernel.dispose();
  if (typeof physics._disableSg02DynamicAuthority === 'function') physics._disableSg02DynamicAuthority();
}

console.log('SG-02 Massline break telemetry checks OK');

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

function applyOutwardLoad(tick) {
  if (!helpers.combatPhysics || !attachmentId) return;
  const attachment = state.combat.attachments.byId[attachmentId];
  if (!attachment || attachment.state !== 'active') return;
  const impulse = 120;
  helpers.combatPhysics.applyImpulse({
    entityId: actor.id,
    impulse: { x: -impulse, y: 0, z: 0 },
    reason: 'sg02_tether_break_fixture',
    tick,
  });
  helpers.combatPhysics.applyImpulse({
    entityId: target.id,
    impulse: { x: impulse, y: 0, z: 0 },
    reason: 'sg02_tether_break_fixture',
    tick,
  });
}

function recordTelemetry(highWater) {
  if (!helpers.combatPhysics || !attachmentId) return;
  const attachment = state.combat.attachments.byId[attachmentId];
  if (!attachment || attachment.state !== 'active') return;
  const telemetry = helpers.combatPhysics.getAttachmentTelemetry({
    attachmentId,
    physicsHandle: attachment.physicsHandle,
    tick: state.tick,
  });
  if (!telemetry) return;
  highWater.tension = Math.max(highWater.tension, telemetry.tension);
  highWater.impulse = Math.max(highWater.impulse, telemetry.impulse);
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
