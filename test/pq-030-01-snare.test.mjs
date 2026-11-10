// PQ-030.01 — Transverse snare clothesline: a full-burn pursuer is caught, yanked, and tumbled (B11).
// Seed 30001. Catch converts crossing momentum into tension and rotation. No teleport. No freeze.

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHitstunLaw } from '../src/combat/impulseKernel.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  masslineSnares,
  TRANSVERSE_SNARE_CATCH_COUPLING,
  TRANSVERSE_SNARE_YANK_COUPLING,
} from '../src/systems/masslineSnares.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const SEED = 30001;
const DT = 1 / 60;
const FULL_BURN = 105;

function publishThenDeploy(h) {
  h.system.handleInput({ state: h.state, player: h.player, wantsLatch: false });
  h.state.tick += 1;
  h.state.simTime += DT;
  h.system.handleInput({ state: h.state, player: h.player, wantsLatch: true, masslineCommand: { latch: true } });
  h.system.update(DT, h.state);
}

function stepToArmed(h) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.system.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += 0.4;
}

function createHarness(options = {}) {
  const bus = immediateBus();
  const player = makeBody({
    id: 1,
    type: 'ship',
    team: 0,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    data: { derived: { masslineHeadId: 'transverse_snare' } },
  });
  const victimSpec = options.victim || {};
  const victim = makeBody({
    id: 2,
    type: victimSpec.type || 'ship',
    team: victimSpec.team == null ? 1 : victimSpec.team,
    mass: victimSpec.mass || 16,
    pos: { x: 100.5, z: 0, ...(victimSpec.pos || {}) },
    vel: { x: FULL_BURN, z: 0, ...(victimSpec.vel || {}) },
    radius: 4,
    data: victimSpec.data || {
      role: 'fighter',
      intent: { fire: true, moveX: 1, moveZ: 0 },
      ai: { forcePlayerTarget: true },
    },
  });
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    seed: SEED,
    playerId: player.id,
    player: {},
    input: { aimWorld: { x: 100, z: 0 }, actions: {} },
    runtime: { features: PRODUCTION_FEATURES },
    entities: new Map([[player.id, player], [victim.id, victim]]),
    entityList: [player, victim],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      shipLike: [player, victim],
      payloads: [],
    },
  };
  let nextId = 20;
  const spawned = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = nextId++;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  state.spatialHash = {
    diagnostics: { activeBuckets: 1 },
    queryRadius(_x, _z, _radius, out) {
      out.push(victim);
      return out;
    },
  };
  const attachments = fakeAttachments(state);
  const registry = { get(id) { return id === 'combat' ? { kernel: { attachments } } : null; } };
  const system = Object.create(masslineSnares);
  system.init({ state, bus, helpers, registry });
  return { state, bus, helpers, attachments, system, spawned, player, victim };
}

function fakeAttachments(state) {
  const byId = new Map();
  let next = 1;
  const cutCalls = [];
  const rebindCalls = [];
  return {
    cutCalls,
    rebindCalls,
    create(spec) {
      const owner = state.entities.get(spec.ownerId);
      const target = state.entities.get(spec.targetId);
      if (!owner || !target) return { ok: false, reason: 'endpoint_missing' };
      const attachment = {
        id: `att_${next++}`,
        defId: spec.defId,
        ownerId: spec.ownerId,
        targetId: spec.targetId,
        controllerId: spec.controllerId,
        controlMode: spec.controlMode,
        state: 'active',
        restLength: Math.hypot(target.pos.x - owner.pos.x, target.pos.z - owner.pos.z),
        lastTension: 0,
        lastImpulse: 0,
        nearBreakWarned: false,
      };
      byId.set(attachment.id, attachment);
      return { ok: true, attachment };
    },
    get(id) { return byId.get(id) || null; },
    cut(id, actorId, reason) {
      const attachment = byId.get(id);
      cutCalls.push({ id, actorId, reason });
      if (!attachment || attachment.state !== 'active') return { ok: false, reason: 'attachment_missing' };
      attachment.state = 'broken';
      attachment.breakReason = reason;
      return { ok: true, attachment };
    },
    rebind(id, actorId, spec) {
      const attachment = byId.get(id);
      rebindCalls.push({ id, actorId, spec });
      if (!attachment || attachment.state !== 'active') return { ok: false, reason: 'attachment_missing' };
      if (attachment.controllerId !== actorId) return { ok: false, reason: 'not_attachment_owner' };
      const owner = state.entities.get(spec.ownerId);
      const target = state.entities.get(spec.targetId);
      if (!owner || !target) return { ok: false, reason: 'endpoint_missing' };
      attachment.ownerId = spec.ownerId;
      attachment.targetId = spec.targetId;
      attachment.controllerId = spec.controllerId;
      attachment.controlMode = spec.controlMode;
      attachment.restLength = Math.hypot(spec.targetWorld.x - spec.sourceWorld.x, spec.targetWorld.z - spec.sourceWorld.z);
      return { ok: true, attachment };
    },
    activeCount() { return [...byId.values()].filter((attachment) => attachment.state === 'active').length; },
  };
}

function makeBody(spec) {
  const entity = makeEntity({
    alive: true,
    collides: spec.collides !== false,
    mass: spec.mass || 40,
    hull: 100,
    hullMax: 100,
    rot: spec.rot || 0,
    thrust: spec.thrust || 0,
    ...spec,
  });
  entity.id = spec.id;
  return entity;
}

function motionSnapshot(entity) {
  return {
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    rot: entity.rot,
    hull: entity.hull,
  };
}

function immediateBus() {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}

test('PQ-030.01 seed 30001: full-burn pursuer is caught, yanked toward the anchor, and tumbled', (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  const h = createHarness({
    victim: {
      mass: 16,
      vel: { x: FULL_BURN, z: 0 },
      data: {
        role: 'fighter',
        intent: { fire: true, moveX: 1, moveZ: 0 },
        ai: { forcePlayerTarget: true },
      },
    },
  });
  const kernel = createCombatKernel({
    state: h.state,
    bus: h.bus,
    helpers: h.helpers,
    registry: { get: () => null },
  });
  const tumble = Object.create(tumbleStates);
  tumble.init({
    state: h.state,
    bus: h.bus,
    helpers: h.helpers,
    registry: { get: (name) => (name === 'combat' ? { kernel } : null) },
  });
  t.after(() => tumble.destroy());

  const tumbled = [];
  h.bus.on('combat:tumbled', (payload) => tumbled.push(payload));

  publishThenDeploy(h);
  stepToArmed(h);
  const before = motionSnapshot(h.victim);
  h.system.update(DT, h.state);

  assert.equal(h.attachments.rebindCalls.length, 1, 'the clothesline catches by rebind, not a teleport');
  assert.equal(h.state.player.remoteMassline.caughtId, h.victim.id);
  assert.deepEqual(motionSnapshot(h.victim).vel, before.vel,
    'catch never writes or clamps the pursuer velocity');
  assert.equal(h.victim.hull, 100, 'hit points never scale');

  const command = consumePhysicsCommand(h.victim);
  assert.ok(command && command.impulses.length === 1, 'crossing momentum becomes one additive yank/catch impulse');
  assert.ok(command.torqueImpulses.length >= 1, 'the same contact converts linear momentum into rotation');
  assert.ok(command.impulses[0].x < 0, 'the clothesline opposes the crossing, it does not freeze the ship');
  assert.ok(command.impulses[0].z > 0, 'the leftover is a yank toward the kept anchor');

  const reduced = (16 * 40) / (16 + 40);
  const expectedCatch = reduced * FULL_BURN * TRANSVERSE_SNARE_CATCH_COUPLING;
  const expectedYank = reduced * FULL_BURN * TRANSVERSE_SNARE_YANK_COUPLING;
  assert.ok(Math.abs(Math.abs(command.impulses[0].x) - expectedCatch) < 1e-6);
  assert.ok(Math.abs(command.impulses[0].z - expectedYank) < 1e-6);
  const catchDeltaV = Math.abs(command.impulses[0].x) / 16;
  const yankDeltaV = command.impulses[0].z / 16;

  const cruise = resolveGovernedCombatSpeed(h.victim, h.state, 0);
  const law = resolveHitstunLaw({
    deltaV: FULL_BURN,
    victimCruise: cruise,
    victimMass: 16,
    worldBody: true,
  });
  console.log(
    `PQ-030.01 SEED=${SEED} CATCH=1 BURN=${FULL_BURN} K=${law.k.toFixed(3)} DURATION=${law.durationS.toFixed(3)} `
    + `CATCH_DV=${catchDeltaV.toFixed(3)} YANK_DV=${yankDeltaV.toFixed(3)} HULL=${h.victim.hull} VX=${before.vel.x}`,
  );
  assert.ok(cruise >= FULL_BURN - 1e-9, `wasp-class full burn is 105 wu/s, got ${cruise}`);
  assert.ok(law.k >= 0.30, `full-burn clothesline k=${law.k} must meet the B11 30% bar`);
  assert.ok(law.durationS >= 1, `B11 lights lose helm ≥1s, got ${law.durationS}s`);

  const status = readTumbleStatus(h.state, h.victim);
  assert.ok(status, 'the caught pursuer is tumbling');
  assert.ok(
    (status.data && status.data.until) - h.state.simTime >= 1 - 1e-6,
    `scheduled helm-loss must last a B11 second from ${h.state.simTime}`,
  );
  assert.equal(tumbled.length, 1);
  assert.equal(tumbled[0].deltaV, FULL_BURN);
  assert.equal(h.victim.data.intent.moveX, 0);
  assert.equal(h.victim.data.intent.fire, false);
});
