import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { createCombatKernel } from '../src/combat/kernel.js';
import {
  consumePhysicsCommand,
  damageThruster,
  queuePhysicsImpulse,
  queuePhysicsTorqueImpulse,
  readPhysicsTelemetry,
  writePhysicsControl,
} from '../src/core/physicsAuthority.js';
import {
  SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION,
  createSg02CombatPhysicsPort,
  createSg02DynamicBodyOwner,
} from '../src/core/sg02DynamicBodyOwner.js';

const first = await runScenario();
const second = await runScenario();
const tetherFirst = await runTetherScenario();
const tetherSecond = await runTetherScenario();
const layeredFirst = await runLayeredSyncScenario();
const layeredSecond = await runLayeredSyncScenario();
const combatFirst = await runCombatKernelScenario();
const combatSecond = await runCombatKernelScenario();

assert.deepEqual(second.hash, first.hash, 'SG-02 dynamic owner lab should replay to the same quantized hash');
assert.deepEqual(second.snapshot, first.snapshot, 'SG-02 dynamic owner lab snapshots should be stable');
assert.deepEqual(tetherSecond.hash, tetherFirst.hash, 'SG-02 tether lab should replay to the same quantized hash');
assert.deepEqual(tetherSecond.snapshot, tetherFirst.snapshot, 'SG-02 tether lab snapshots should be stable');
assert.deepEqual(layeredSecond.hash, layeredFirst.hash, 'SG-02 layered body sync should replay to the same quantized hash');
assert.deepEqual(layeredSecond.snapshot, layeredFirst.snapshot, 'SG-02 layered body sync snapshots should be stable');
assert.deepEqual(combatSecond.compactTrace, combatFirst.compactTrace, 'SG-03 kernel trace over SG-02 port should be deterministic');
assert.deepEqual(combatSecond.snapshot, combatFirst.snapshot, 'SG-03 kernel over SG-02 port should replay to the same body snapshot');

console.log('SG-02 dynamic body owner checks OK');

async function runScenario() {
  const ship = makeShip();
  const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5 });

  try {
    owner.syncFromEntities([ship]);
    const initialDiagnostics = owner.diagnostics();
    assert.equal(initialDiagnostics.schemaVersion, SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION, 'diagnostics should be versioned');
    assert.equal(initialDiagnostics.bodies, 1, 'lab should create one Rapier body');
    assert.equal(initialDiagnostics.dynamicBodies, 1, 'ship should be a dynamic body');
    assert.equal(initialDiagnostics.ccdBodies, 1, 'ship should preserve CCD authoring');

    writePhysicsControl(ship, {
      source: 'sg02-dynamic-owner-check',
      mode: 'assisted',
      force: { x: 28, y: 9001, z: -14 },
      torque: { x: 123, y: 88, z: 456 },
      maxSpeed: 3,
    });
    assert.equal(queuePhysicsImpulse(ship, { x: 2, y: 99, z: 0 }), true, 'linear impulse should queue');
    assert.equal(queuePhysicsTorqueImpulse(ship, { x: 4, y: 1, z: 8 }), true, 'yaw torque impulse should queue');

    owner.step(1 / 60);
    assert.equal(consumePhysicsCommand(ship), null, 'dynamic owner should consume commands exactly once');
    assert(ship.pos.x > 0, 'positive force/impulse should move the ship on X');
    assert(ship.vel.x > 0, 'positive force/impulse should produce positive X velocity');
    assert(ship.rot > 0, 'positive yaw torque should rotate the ship');
    assert(Math.hypot(ship.vel.x, ship.vel.z) <= 3 + 1e-9, 'maxSpeed should clamp measured body velocity');

    const firstTelemetry = readPhysicsTelemetry(ship);
    assertTelemetry(firstTelemetry);
    assert.deepEqual(firstTelemetry.force, { x: 28, y: 0, z: -14 }, 'owner should apply force in the XZ plane');
    assert.deepEqual(firstTelemetry.torque, { x: 0, y: 88, z: 0 }, 'owner should apply yaw torque only');
    assert.equal(firstTelemetry.mass, 28, 'telemetry should report authored mass');
    assert.equal(firstTelemetry.inertiaY, 88, 'telemetry should report authored yaw inertia');

    const damaged = damageThruster(ship, 'drive-port', 0.5);
    assert(damaged && damaged.authority.forward < 1, 'fixture should damage a real thruster');
    writePhysicsControl(ship, {
      source: 'sg02-dynamic-owner-check',
      mode: 'assisted',
      force: { x: 0, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      maxSpeed: 3,
    });
    owner.step(1 / 60);
    const damagedTelemetry = readPhysicsTelemetry(ship);
    assertTelemetry(damagedTelemetry);
    assert(damagedTelemetry.authority.forward < firstTelemetry.authority.forward, 'thruster damage should change measured force authority');
    assert(damagedTelemetry.authority.yaw < firstTelemetry.authority.yaw, 'thruster damage should change measured yaw authority');

    for (let i = 0; i < 30; i++) owner.step(1 / 60);
    const finalDiagnostics = owner.diagnostics();
    assert.equal(finalDiagnostics.lockedPlaneBodies, 1, 'body should stay locked to the 2.5D XZ plane');
    assert.equal(finalDiagnostics.tick, 32, 'fixed-step tick count should be deterministic');

    const snapshot = owner.quantizedSnapshot();
    assert.equal(snapshot.length, 1, 'snapshot should include the live body');
    assertFiniteSnapshot(snapshot[0]);
    return { snapshot, hash: hashSnapshot(snapshot) };
  } finally {
    owner.dispose();
  }
}

async function runTetherScenario() {
  const ownerShip = makeShip(101, 0);
  const targetShip = makeShip(202, 20);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5 });
  const port = createSg02CombatPhysicsPort(owner);

  try {
    owner.syncFromEntities([ownerShip, targetShip]);
    assert.equal(owner.diagnostics().bodies, 2, 'tether lab should create both dynamic bodies');
    assert.equal(port.applyImpulse({
      entityId: targetShip.id,
      impulse: { x: 1.5, y: 100, z: 0 },
      reason: 'sg02-port-check',
      tick: 0,
    }), true, 'SG-03-shaped port should apply impulses through the dynamic owner');

    const handle = port.createAttachment({
      attachmentId: 'att_sg02_lab',
      defId: 'att_massline',
      ownerId: ownerShip.id,
      targetId: targetShip.id,
      sourceSocketId: 'massline',
      targetSocketId: 'massline',
      sourceWorld: { x: ownerShip.pos.x, y: 0, z: ownerShip.pos.z },
      targetWorld: { x: targetShip.pos.x, y: 0, z: targetShip.pos.z },
      restLength: 12,
      break: { maxTension: 10_000, maxImpulse: 10_000, stiffness: 180, damping: 12 },
      tick: 0,
    });
    assert.deepEqual(handle, {
      id: 'att_sg02_lab',
      attachmentId: 'att_sg02_lab',
      ownerId: ownerShip.id,
      targetId: targetShip.id,
    }, 'createAttachment should return a serializable SG-03 physics handle');
    assert.equal(owner.diagnostics().attachments, 1, 'dynamic owner should track the Rapier rope attachment');

    for (let i = 0; i < 30; i++) owner.step(1 / 60);
    const firstTelemetry = port.getAttachmentTelemetry({ attachmentId: 'att_sg02_lab', physicsHandle: handle, tick: 30 });
    assertAttachmentTelemetry(firstTelemetry, 12);
    assert(firstTelemetry.distance < 20, 'rope joint should reduce initial cable violation');

    assert.equal(port.setAttachmentReel({
      attachmentId: 'att_sg02_lab',
      physicsHandle: handle,
      restLength: 8,
      previousRestLength: 12,
      tick: 31,
    }), true, 'setAttachmentReel should rebuild the rope at the requested rest length');
    for (let i = 0; i < 30; i++) owner.step(1 / 60);
    const reeledTelemetry = port.getAttachmentTelemetry({ attachmentId: 'att_sg02_lab', physicsHandle: handle, tick: 61 });
    assertAttachmentTelemetry(reeledTelemetry, 8);
    assert(reeledTelemetry.distance <= firstTelemetry.distance + 1e-6, 'reeling should not increase anchor distance');

    assert.equal(port.cutAttachment({
      attachmentId: 'att_sg02_lab',
      physicsHandle: handle,
      reason: 'sg02-check',
      tick: 62,
    }), true, 'cutAttachment should remove the Rapier rope attachment');
    assert.equal(port.getAttachmentTelemetry({ attachmentId: 'att_sg02_lab', physicsHandle: handle, tick: 62 }), null,
      'cut attachments should stop publishing telemetry');
    assert.equal(owner.diagnostics().attachments, 0, 'dynamic owner should clear cut attachments');

    return { snapshot: owner.quantizedSnapshot(), hash: hashSnapshot(owner.quantizedSnapshot()) };
  } finally {
    owner.dispose();
  }
}

async function runLayeredSyncScenario() {
  const ship = makeShip(303, 0);
  const asteroid = makeAsteroid(404, 24);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5 });

  try {
    owner.syncFromEntityLayers([asteroid], [ship], 1, [ship, asteroid]);
    const initialDiagnostics = owner.diagnostics();
    assert.equal(initialDiagnostics.syncMode, 'layered', 'layered sync should report layered mode');
    assert.equal(initialDiagnostics.syncStaticEntities, 1, 'first layered sync should import fixed bodies once');
    assert.equal(initialDiagnostics.syncDynamicEntities, 1, 'first layered sync should import dynamic bodies');
    assert.equal(initialDiagnostics.bodies, 2, 'layered sync should keep fixed collision bodies and dynamic craft');
    assert.equal(initialDiagnostics.dynamicBodies, 1, 'layered sync should mark only the craft as dynamic');

    const staticTrap = {
      length: 1,
      [Symbol.iterator]() {
        throw new Error('unchanged SG-02 static layer should not be iterated');
      },
    };
    owner.syncFromEntityLayers(staticTrap, [ship], 1, staticTrap);
    const steadyDiagnostics = owner.diagnostics();
    assert.equal(steadyDiagnostics.syncStaticEntities, 0, 'unchanged layered sync should not revisit fixed bodies');
    assert.equal(steadyDiagnostics.syncDynamicEntities, 1, 'unchanged layered sync should still refresh dynamic bodies');
    assert.equal(steadyDiagnostics.bodies, 2, 'unchanged layered sync should preserve fixed collision bodies');

    writePhysicsControl(ship, {
      source: 'sg02-layered-sync-check',
      mode: 'assisted',
      force: { x: 18, y: 0, z: 0 },
      torque: { x: 0, y: 0, z: 0 },
      maxSpeed: 6,
    });
    owner.step(1 / 60);
    assert(ship.pos.x > 0, 'layered sync should still advance dynamic bodies');
    assert.equal(asteroid.pos.x, 24, 'layered sync should not write kinematics into fixed collision bodies');

    asteroid.alive = false;
    owner.syncFromEntityLayers([], [ship], 2);
    const removedDiagnostics = owner.diagnostics();
    assert.equal(removedDiagnostics.bodies, 1, 'static layer version changes should remove stale fixed bodies');
    assert.equal(removedDiagnostics.dynamicBodies, 1, 'static removal should keep dynamic craft alive');

    const snapshot = owner.quantizedSnapshot();
    assert.equal(snapshot.length, 1, 'snapshot should include the remaining dynamic craft after static removal');
    return { snapshot, hash: hashSnapshot(snapshot) };
  } finally {
    owner.dispose();
  }
}

async function runCombatKernelScenario() {
  const actor = makeCombatShip(1, 0, 0);
  const target = makeCombatShip(2, 1, 40);
  const owner = await createSg02DynamicBodyOwner({ fixedDt: 1 / 60, quantum: 1e-5 });
  owner.syncFromEntities([actor, target]);
  const state = {
    tick: 0,
    simTime: 0,
    mode: 'flight',
    playerId: actor.id,
    entities: new Map([[actor.id, actor], [target.id, target]]),
    entityList: [actor, target],
    combat: { beams: [], threatTables: new Map() },
    meta: { seed: 0x4702 },
  };
  const ctx = {
    state,
    bus: createBus(),
    helpers: { combatPhysics: createSg02CombatPhysicsPort(owner) },
    registry: { get() { return null; } },
  };
  const kernel = createCombatKernel(ctx);

  try {
    requestAndStep({ kernel, owner, state }, 0, { actorId: actor.id, actionId: 'action_dash', source: { kind: 'player' } });
    stepCombat({ kernel, owner, state }, 1);
    requestAndStep({ kernel, owner, state }, 2, { actorId: actor.id, actionId: 'action_attach', targetId: target.id, source: { kind: 'player' } });
    stepCombat({ kernel, owner, state }, 3);
    const attachmentId = Object.keys(state.combat.attachments.byId)[0];
    assert(attachmentId, 'SG-03 attachment action should create a semantic attachment through the SG-02 port');

    requestAndStep({ kernel, owner, state }, 4, { actorId: actor.id, actionId: 'action_reel', attachmentId, source: { kind: 'player' } });
    stepCombat({ kernel, owner, state }, 5);
    requestAndStep({ kernel, owner, state }, 6, { actorId: actor.id, actionId: 'action_sling', attachmentId, source: { kind: 'player' } });
    stepCombat({ kernel, owner, state }, 7);
    requestAndStep({ kernel, owner, state }, 8, { actorId: actor.id, actionId: 'action_cut', attachmentId, source: { kind: 'player' } });

    const compactTrace = state.combat.trace.events.map(compactCombatEvent).filter(Boolean);
    assert(compactTrace.includes('3:attachment:create'), 'SG-03 attach should reach the SG-02 createAttachment port');
    assert(compactTrace.includes('4:attachment:reel'), 'SG-03 reel should reach the SG-02 setAttachmentReel port');
    assert(compactTrace.includes('7:impulse:action_sling'),
      `SG-03 sling should reach the SG-02 applyImpulse port:\n${compactTrace.join('\n')}`);
    assert(compactTrace.includes('8:attachment:break'), 'SG-03 cut should reach the SG-02 cutAttachment port');
    assert(!state.combat.trace.events.some((event) => String(event.reason || '').includes('physics_port_unavailable')),
      'SG-03 kernel should not report physics port unavailability against the SG-02 lab port');
    assert.equal(state.combat.attachments.byId[attachmentId].state, 'broken', 'SG-03 cut should break the semantic attachment');
    assert.equal(owner.diagnostics().attachments, 0, 'SG-02 port should clear the physical rope after SG-03 cut');
    assert(Math.hypot(actor.vel.x, actor.vel.z) > 0, 'SG-02 port should move the actor body through SG-03 actions');

    return { compactTrace, snapshot: owner.quantizedSnapshot() };
  } finally {
    kernel.dispose();
    owner.dispose();
  }
}

function makeShip(id = 47, x = 0) {
  return {
    id,
    type: 'ship',
    alive: true,
    radius: 12,
    mass: 28,
    flightModel: { inertia: 88 },
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function makeAsteroid(id = 404, x = 24) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    radius: 10,
    mass: 800,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function makeCombatShip(id, team, x) {
  return {
    ...makeShip(id, x),
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

function requestAndStep(fixture, tick, request) {
  fixture.state.tick = tick;
  fixture.state.simTime = tick / 60;
  fixture.kernel.actions.requestAction(request);
  stepCombat(fixture, tick);
}

function stepCombat({ kernel, owner, state }, tick) {
  state.tick = tick;
  state.simTime = tick / 60;
  kernel.prePhysics(1 / 60);
  owner.step(1 / 60);
  kernel.postPhysics(1 / 60);
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

function assertAttachmentTelemetry(value, restLength) {
  assert(value, 'attachment telemetry should be published');
  assert.equal(value.schemaVersion, SG02_DYNAMIC_BODY_OWNER_SCHEMA_VERSION, 'attachment telemetry should be versioned');
  assert.equal(value.attachmentId, 'att_sg02_lab', 'attachment telemetry should identify the attachment');
  assert.equal(value.restLength, restLength, 'attachment telemetry should report current rest length');
  for (const key of ['distance', 'stretch', 'relativeSpeed', 'tension', 'impulse']) {
    assert(Number.isFinite(value[key]), `attachment telemetry ${key} should be finite`);
  }
  assertVectorFinite(value.sourceWorld, 'attachment sourceWorld should be finite');
  assertVectorFinite(value.targetWorld, 'attachment targetWorld should be finite');
}

function assertTelemetry(value) {
  assert(value, 'telemetry should be published');
  assert.equal(value.dynamic, true, 'telemetry should preserve dynamic body state');
  assert.equal(value.ccd, true, 'telemetry should preserve CCD state');
  for (const field of ['force', 'torque', 'linearAcceleration']) {
    assertVectorFinite(value[field], `telemetry ${field} should be finite`);
  }
  assert(Number.isFinite(value.angularAccelerationY), 'telemetry angular acceleration should be finite');
  assert(Number.isFinite(value.lateralAcceleration), 'telemetry lateral acceleration should be finite');
}

function assertFiniteSnapshot(snapshot) {
  for (const key of ['x', 'z', 'yaw', 'vx', 'vz', 'wy']) {
    assert(Number.isFinite(snapshot[key]), `snapshot ${key} should be finite`);
  }
}

function assertVectorFinite(vector, message) {
  assert(vector, message);
  assert(Number.isFinite(vector.x), message);
  assert(Number.isFinite(vector.y), message);
  assert(Number.isFinite(vector.z), message);
}

function hashSnapshot(snapshot) {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
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
