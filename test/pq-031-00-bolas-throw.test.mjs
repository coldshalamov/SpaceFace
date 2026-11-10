// PQ-031.00 — Bolas throw: two lights bridled within 3 s of the first latch, then B11 helm loss.
// Seed 31000. Combat-range pair. Setup window is 2 s. No headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveHitstunLaw } from '../src/combat/impulseKernel.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createStatusService } from '../src/combat/statuses.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  tetherGameplay,
  TWIN_BRIDLE_HEAD_ID,
  TWIN_BRIDLE_SETUP_S,
} from '../src/systems/tetherGameplay.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const SEED = 31000;
const DT = 1 / 60;
// Raider preferredRange is 260. A 220 WU pair is a combat-range clothesline, inside maxLength 480.
const COMBAT_RANGE_WU = 220;

test('PQ-031.00 seed 31000: two lights bridled within 3s at combat range both lose the helm', (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  assert.ok(TWIN_BRIDLE_SETUP_S <= 2, `the bolas is a throw, setup is ${TWIN_BRIDLE_SETUP_S}s`);

  const h = harness();
  const pairDist = Math.hypot(h.target.pos.x - h.source.pos.x, h.target.pos.z - h.source.pos.z);
  assert.ok(Math.abs(pairDist - COMBAT_RANGE_WU) < 1, `pair must sit at combat range, got ${pairDist}`);

  const statuses = createStatusService({
    state: h.state,
    catalog: h.catalog,
    bus: h.bus,
    helpers: { combatPhysics: h.physics },
  });
  const kernel = { attachments: h.attachments, catalog: h.catalog, statuses };
  h.system.registry = {
    get(id) { return id === 'actions' || id === 'combat' ? { kernel } : null; },
  };
  const tumble = Object.create(tumbleStates);
  tumble.init({
    state: h.state,
    bus: h.bus,
    helpers: { combatPhysics: h.physics },
    registry: h.system.registry,
  });
  t.after(() => tumble.destroy());

  step(h, { aim: h.source.pos });
  step(h, { aim: h.source.pos, latch: true });
  const firstLatchAt = h.state.simTime;
  // Re-aim across the 220 WU pair. One preview tick is enough for the standing receipt; 0.4 s is
  // the combat-range flick, still inside the 2 s throw window.
  step(h, { aim: h.target.pos, dt: 0.4 });
  const before = motionSnapshot(h.source, h.target);
  step(h, { aim: h.target.pos, latch: true });
  const elapsed = h.state.simTime - firstLatchAt;

  const active = Object.values(h.state.combat.attachments.byId).filter((entry) => entry.state === 'active');
  assert.equal(active.length, 1, 'latch A then B must create exactly one A-to-B rope');
  assert.deepEqual([active[0].ownerId, active[0].targetId], [h.source.id, h.target.id]);
  assert.ok(![active[0].ownerId, active[0].targetId].includes(h.player.id),
    'the player is the cut owner, never a third endpoint');
  assert.ok(elapsed <= 3, `two lights must be bridled within 3s, got ${elapsed}s`);
  assert.ok(elapsed <= TWIN_BRIDLE_SETUP_S, `setup at combat range must stay a throw, got ${elapsed}s`);
  assert.deepEqual(motionSnapshot(h.source, h.target), before,
    'the throw never writes velocity; tumble is the B11 hitstun law');

  const sourceMass = h.source.mass;
  const targetMass = h.target.mass;
  const rel = Math.hypot(h.source.vel.x - h.target.vel.x, h.source.vel.z - h.target.vel.z);
  const catchDeltaV = rel * (targetMass / (sourceMass + targetMass));
  const cruise = resolveGovernedCombatSpeed(h.source, h.state, 0);
  const law = resolveHitstunLaw({
    deltaV: catchDeltaV,
    victimCruise: cruise,
    attackerMass: targetMass,
    victimMass: sourceMass,
  });
  console.log(
    `PQ-031.00 seed=${SEED} elapsedS=${elapsed.toFixed(3)} setupS=${TWIN_BRIDLE_SETUP_S} `
    + `pairWu=${pairDist.toFixed(1)} catchDv=${catchDeltaV.toFixed(1)} `
    + `k=${law.k.toFixed(3)} durationS=${law.durationS.toFixed(3)} rel=${rel} cruise=${cruise}`,
  );
  assert.ok(law.k >= 0.30, `closing lights k=${law.k} must meet the B11 30% bar`);
  assert.ok(law.durationS >= 1, `B11 lights lose helm ≥1s, got ${law.durationS}s`);

  const a = readTumbleStatus(h.state, h.source);
  const b = readTumbleStatus(h.state, h.target);
  assert.ok(a, 'light A tumbles');
  assert.ok(b, 'light B tumbles');
  assert.ok((a.data && a.data.until) - h.state.simTime >= 1 - 1e-6);
  assert.ok((b.data && b.data.until) - h.state.simTime >= 1 - 1e-6);
});

function harness() {
  const player = entity(1, 'ship', 0, 0, {
    team: 0,
    data: { derived: { masslineHeadId: TWIN_BRIDLE_HEAD_ID } },
    physicsBody: { dynamic: true, mass: 40 },
  });
  const source = entity(2, 'ship', 180, 40, {
    team: 1,
    mass: 16,
    vel: { x: 0, z: 80 },
    data: {
      name: 'Raider A',
      role: 'fighter',
      intent: { fire: true, moveX: 0, moveZ: 1 },
      ai: { forcePlayerTarget: true },
    },
    physicsBody: { dynamic: true, mass: 16 },
  });
  const target = entity(3, 'ship', 180, 40 - COMBAT_RANGE_WU, {
    team: 1,
    mass: 16,
    vel: { x: 0, z: -80 },
    data: {
      name: 'Raider B',
      role: 'fighter',
      intent: { fire: true, moveX: 0, moveZ: -1 },
      ai: { forcePlayerTarget: true },
    },
    physicsBody: { dynamic: true, mass: 16 },
  });
  const entities = new Map([[player.id, player], [source.id, source], [target.id, target]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    seed: SEED,
    playerId: player.id,
    player: {},
    input: {
      aimWorld: { ...source.pos },
      aimAngle: 0,
      turnIntent: 0,
      moveX: 0,
      moveZ: 0,
      actions: {},
      tetherMode: null,
    },
    runtime: { profileId: 'production', features: PRODUCTION_FEATURES },
    world: { currentSectorId: 'sector_test' },
    entities,
    entityList: [...entities.values()],
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = fakePhysics();
  const events = [];
  const bus = immediateBus(events);
  const attachments = createAttachmentService({ state, catalog, helpers: { combatPhysics: physics }, bus });
  const registry = {
    get(id) {
      return id === 'actions' ? { kernel: { attachments, catalog } } : null;
    },
  };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus, helpers: { combatPhysics: physics }, registry });
  return { state, player, source, target, physics, events, bus, attachments, system, catalog };
}

function step(h, { aim = null, latch = false, cut = false, dt = DT } = {}) {
  h.state.tick += 1;
  h.state.simTime += dt;
  h.state.input.aimIntentActive = !!aim;
  if (aim) {
    h.state.input.aimWorld.x = aim.x;
    h.state.input.aimWorld.z = aim.z;
  }
  h.state.input.actions = {
    tetherFire: latch,
    tetherCut: cut,
    massline: latch || cut ? { latch, cut, lineControl: false, lineLength: 0 } : null,
  };
  h.state.input.tetherMode = null;
  h.system.update(dt, h.state);
}

function fakePhysics() {
  return {
    creates: [],
    cuts: [],
    createAttachment(spec) {
      this.creates.push(structuredClone(spec));
      return { id: `joint_${this.creates.length}` };
    },
    cutAttachment(spec) {
      this.cuts.push(structuredClone(spec));
      return true;
    },
    getAttachmentTelemetry() {
      return { tension: 0, impulse: 0, yank: 0, phase: 'loaded' };
    },
    setAttachmentReel() { return true; },
  };
}

function entity(id, type, x, z, overrides = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    thrust: 0,
    brake: false,
    maxSpeed: 120,
    radius: 8,
    mass: 50,
    hull: 100,
    hullMax: 100,
    team: 2,
    data: {},
    ...overrides,
  };
}

function motionSnapshot(...entities) {
  return entities.map((value) => ({
    id: value.id,
    pos: { ...value.pos },
    vel: { ...value.vel },
    rot: value.rot,
    thrust: value.thrust,
    brake: value.brake,
    maxSpeed: value.maxSpeed,
  }));
}

function immediateBus(events = []) {
  const listeners = new Map();
  return {
    on(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
    emit(type, payload) {
      events.push({ type, payload });
      for (const fn of listeners.get(type) || []) fn(payload);
    },
  };
}
