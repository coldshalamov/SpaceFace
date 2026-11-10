import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { physics } from '../src/core/physics.js';
import { actions } from '../src/systems/actions.js';

const DT = 1 / 60;

const state = createGameState(0x4703);
state.mode = 'flight';
state.settings.gameplay.physicsBackend = 'rapier-dynamic';
state.entities.clear();
state.entityList.length = 0;
state.playerId = 1;

const actor = makeCombatShip(1, 0, 0);
const target = makeCombatShip(2, 1, 40);
for (const entity of [actor, target]) {
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
}

const helpers = {};
const bus = createBus();
const ctx = { state, bus, helpers, registry: { get() { return null; } } };

physics.init(ctx);
assert(helpers.combatPhysics, 'physics.init must install combatPhysics before actions.init captures the kernel');
actions.init(ctx);
assert.equal(actions.kernel && actions.kernel.schemaVersion, 1, 'actions.init should create the real SG-03 kernel');
assert.equal(helpers.combatPhysics.applyImpulse({ entityId: actor.id, impulse: { x: 1, y: 0, z: 0 } }), false,
  'captured production port should fail closed before Rapier is ready');

physics.update(DT, state);
await physics._sg02Init;
assert(physics._sg02, 'production SG-02 owner should initialize for the combat-port fixture');

requestAndStep(0, { actorId: actor.id, actionId: 'action_dash', source: { kind: 'player' } });
step(1);
requestAndStep(2, { actorId: actor.id, actionId: 'action_attach', targetId: target.id, source: { kind: 'player' } });
step(3);
const attachmentId = Object.keys(state.combat.attachments.byId)[0];
assert(attachmentId, 'production SG-03 attach should create semantic attachment state');

requestAndStep(4, { actorId: actor.id, actionId: 'action_reel', attachmentId, source: { kind: 'player' } });
step(5);
requestAndStep(6, { actorId: actor.id, actionId: 'action_sling', attachmentId, source: { kind: 'player' } });
step(7);
requestAndStep(8, { actorId: actor.id, actionId: 'action_cut', attachmentId, source: { kind: 'player' } });

const compactTrace = state.combat.trace.events.map(compactCombatEvent).filter(Boolean);
assert(compactTrace.includes('3:attachment:create'), 'production attach should reach SG-02 createAttachment');
assert(compactTrace.includes('4:attachment:reel'), 'production reel should reach SG-02 setAttachmentReel');
assert(compactTrace.includes('7:impulse:action_sling'), 'production sling should reach SG-02 applyImpulse');
assert(compactTrace.includes('8:attachment:break'), 'production cut should reach SG-02 cutAttachment');
assert(!state.combat.trace.events.some((event) => String(event.reason || '').includes('physics_port_unavailable')),
  'production SG-03 kernel should not see a stale missing physics port');
assert.equal(state.combat.attachments.byId[attachmentId].state, 'broken', 'production cut should break semantic attachment');
assert.equal(physics._sg02.diagnostics().attachments, 0, 'production cut should remove the physical rope');
assert(Math.hypot(actor.vel.x, actor.vel.z) > 0, 'production ActionDefs should move the actor through SG-02');

actions.kernel.dispose();
physics._disableSg02DynamicAuthority();

console.log('SG-02 production combat-port checks OK');

function requestAndStep(tick, request) {
  state.tick = tick;
  state.simTime = tick * DT;
  helpers.requestCombatAction(request);
  step(tick);
}

function step(tick) {
  state.tick = tick;
  state.simTime = tick * DT;
  actions.update(DT, state);
  physics.update(DT, state);
  actions.kernel.postPhysics(DT);
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

function compactCombatEvent(event) {
  switch (event.kind) {
    case 'action.requested': return `${event.tick}:request:${event.actionId}`;
    case 'action.started': return `${event.tick}:start:${event.actionId}`;
    case 'action.phase': return `${event.tick}:phase:${event.actionId}:${event.phase}`;
    case 'action.cancelled': return `${event.tick}:cancel:${event.actionId}`;
    case 'action.effect': return `${event.tick}:effect:${event.actionId}:${event.effectType}`;
    case 'physics.impulse': return event.reason === 'action' ? `${event.tick}:impulse:${event.actionId}` : null;
    case 'attachment.created': return `${event.tick}:attachment:create`;
    case 'attachment.reel': return `${event.tick}:attachment:reel`;
    case 'attachment.broken': return `${event.tick}:attachment:break`;
    default: return null;
  }
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
