// PQ-030.00 — Monofilament sweep cuts an NPC tether in one pass and dumps blade momentum.
// Seed 30000. Slack does not cut. Hull is not a lever. No headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { resolveHitstunLaw } from '../src/combat/impulseKernel.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { resolveGovernedCombatSpeed } from '../src/core/flight/propulsionCatalog.js';
import { mulberry32 } from '../src/core/rng.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  MONOFILAMENT_CUT_INTEGRITY_COST,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const SEED = 30000;
const DT = 1 / 60;
const SWING_SPEED = 105;
const TOW_SPEED = 40;

function stubCombatPhysics() {
  const joints = new Map();
  return {
    createAttachment(input) {
      const handle = {
        id: input.attachmentId,
        attachmentId: input.attachmentId,
        ownerId: input.ownerId,
        targetId: input.targetId,
      };
      joints.set(input.attachmentId, handle);
      return handle;
    },
    cutAttachment(input) {
      joints.delete(input.attachmentId);
      return true;
    },
    setAttachmentReel() { return true; },
    getAttachmentTelemetry() { return null; },
  };
}

function spawn(id, type, pos, extra = {}) {
  return {
    id,
    type,
    team: extra.team ?? 2,
    alive: true,
    pos: { x: pos.x, z: pos.z },
    vel: { x: extra.vel?.x ?? 0, z: extra.vel?.z ?? 0 },
    rot: 0,
    radius: extra.radius ?? 8,
    mass: extra.mass ?? 20,
    collides: true,
    hull: extra.hull ?? 100,
    hullMax: extra.hull ?? 100,
    flags: {},
    data: extra.data || {},
  };
}

function motionOf(entity) {
  return {
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    rot: entity.rot,
    hull: entity.hull,
  };
}

function setupCutWorld(options = {}) {
  const player = spawn(1, 'ship', { x: 0, z: 0 }, {
    team: 0,
    mass: 20,
    vel: { x: 0, z: options.swingSpeed ?? SWING_SPEED },
    data: { derived: { masslineHeadId: 'monofilament_sweep' } },
  });
  const anchor = spawn(2, 'asteroid', { x: 100, z: 0 }, { mass: 800, radius: 16, team: null });
  const tug = spawn(3, 'ship', { x: 50, z: -40 }, {
    mass: 16,
    vel: { x: TOW_SPEED, z: 0 },
    hull: 100,
    data: {
      role: 'fighter',
      trafficRole: 'tug',
      intent: { fire: true, moveX: 1, moveZ: 0 },
    },
  });
  const load = spawn(4, 'payload', { x: 50, z: 40 }, {
    mass: 80,
    radius: 4,
    vel: { x: TOW_SPEED, z: 0 },
    data: { towable: true, salvagePool: { cmdty_scrap_metal: 2 } },
  });
  const entityList = [player, anchor, tug, load];
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    seed: SEED,
    rng: mulberry32(SEED),
    playerId: player.id,
    player: {
      tether: {
        active: true,
        targetId: anchor.id,
        strain: options.strain ?? 0.6,
        load: options.load ?? 0.6,
        attachmentId: null,
        restLength: options.restLength ?? 100,
        phase: options.phase ?? 'loaded',
      },
    },
    entities,
    entityList,
    input: { actions: { tetherFire: false, tetherCut: false, reelDelta: 0 } },
    runtime: { profileId: 'production', features: PRODUCTION_FEATURES },
    combat: null,
  };
  ensureCombatState(state);
  const bus = createBus();
  const cuts = [];
  const stuns = [];
  bus.on('massline:npcLineCut', (payload) => cuts.push(payload));
  bus.on('combat:hitstunImpulse', (payload) => stuns.push(payload));
  const catalog = createCombatCatalog();
  const helpers = { combatPhysics: stubCombatPhysics() };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const system = Object.assign({}, tetherGameplay);
  system.init({
    state,
    bus,
    helpers,
    registry: {
      get(name) {
        if (name === 'actions' || name === 'combat') return { kernel };
        return null;
      },
    },
  });
  const blade = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: anchor.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: anchor.pos.x, y: 0, z: anchor.pos.z },
  });
  state.player.tether.attachmentId = blade.attachment.id;
  if (options.restLength) blade.attachment.restLength = options.restLength;
  const npcLine = attachments.create({
    defId: 'tether_standard',
    ownerId: tug.id,
    targetId: load.id,
    controlMode: 'npc_tow',
    sourceWorld: { x: tug.pos.x, y: 0, z: tug.pos.z },
    targetWorld: { x: load.pos.x, y: 0, z: load.pos.z },
  });
  return { state, bus, system, attachments, kernel, player, anchor, tug, load, blade, npcLine, cuts, stuns };
}

test('PQ-030.00 seed 30000: taut sweep cuts the NPC tow in one pass and kicks both ends', (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  const h = setupCutWorld();
  const kernel = createCombatKernel({
    state: h.state,
    bus: h.bus,
    helpers: { combatPhysics: stubCombatPhysics() },
    registry: { get: () => null },
  });
  const tumble = Object.create(tumbleStates);
  tumble.init({
    state: h.state,
    bus: h.bus,
    helpers: {},
    registry: { get: (name) => (name === 'combat' ? { kernel } : null) },
  });
  t.after(() => tumble.destroy());

  const tumbled = [];
  h.bus.on('combat:tumbled', (payload) => tumbled.push(payload));

  const beforeTug = motionOf(h.tug);
  const beforeLoad = motionOf(h.load);
  h.system.update(DT, h.state);

  assert.equal(h.state.combat.attachments.byId[h.npcLine.attachment.id].state, 'broken',
    'the crossing NPC tow must be severed in the same taut pass');
  assert.equal(h.state.combat.attachments.byId[h.npcLine.attachment.id].breakReason, 'monofilament_sweep');
  assert.equal(h.cuts.length, 1);
  assert.equal(h.cuts[0].integrity, 1 - MONOFILAMENT_CUT_INTEGRITY_COST);

  assert.deepEqual(motionOf(h.tug).vel, beforeTug.vel, 'the cut never writes or clamps the tug velocity');
  assert.deepEqual(motionOf(h.load).vel, beforeLoad.vel, 'the cut never writes or clamps the load velocity');
  assert.equal(h.tug.hull, 100, 'hit points never scale — the tug hull is untouched');
  assert.equal(h.load.hull, 100, 'hit points never scale — the load hull is untouched');

  const tugCmd = consumePhysicsCommand(h.tug);
  const loadCmd = consumePhysicsCommand(h.load);
  assert.ok(tugCmd && tugCmd.impulses.length === 1, 'the tug receives one additive kick');
  assert.ok(loadCmd && loadCmd.impulses.length === 1, 'the load receives one additive kick');
  const tugKick = Math.hypot(tugCmd.impulses[0].x, tugCmd.impulses[0].z);
  const loadKick = Math.hypot(loadCmd.impulses[0].x, loadCmd.impulses[0].z);
  const tugDeltaV = tugKick / h.tug.mass;
  assert.ok(Math.abs(tugCmd.impulses[0].x) < 1e-6, 'the kick is along the blade, not against the tow');
  assert.ok(tugCmd.impulses[0].z > 0, 'a +z swing dumps +z momentum into what it cuts');
  assert.ok(tugDeltaV >= 20, `tug kick ΔV ${tugDeltaV.toFixed(3)} wu/s must be a felt shove, not a number`);
  assert.equal(beforeTug.vel.x, TOW_SPEED, 'characterization: the tug was already travelling');

  const cruise = resolveGovernedCombatSpeed(h.tug, h.state, 0);
  const law = resolveHitstunLaw({
    deltaV: SWING_SPEED * 0.5,
    victimCruise: cruise,
    attackerMass: (20 * 800) / 820,
    victimMass: 16,
  });
  const status = readTumbleStatus(h.state, h.tug);
  assert.ok(status, 'the light tug tumbles from the blade kick');
  assert.ok(law.k >= 0.30, `k=${law.k} must meet the B11 30% bar`);
  assert.ok(tumbled.length >= 1);
  assert.equal(h.tug.data.intent.moveX, 0);
  assert.equal(h.tug.data.intent.fire, false);

  h.system.update(DT, h.state);
  assert.equal(h.cuts.length, 1, 'a severed line is not cut again');

  console.log(
    `PQ-030.00 SEED=${SEED} TAUT_CUT=1 TUG_DV=${tugDeltaV.toFixed(3)} LOAD_KICK=${loadKick.toFixed(3)} `
    + `HULL=${h.tug.hull} INTEGRITY=${h.cuts[0].integrity} K=${law.k.toFixed(3)} CRUISE=${cruise} TOW_VX=${beforeTug.vel.x}`,
  );
});

test('PQ-030.00 seed 30000: slack sweep neither cuts nor queues a kick', () => {
  const h = setupCutWorld({ phase: 'slack', strain: 0, load: 0, restLength: 200, swingSpeed: SWING_SPEED });
  h.blade.attachment.restLength = 200;
  h.system.update(DT, h.state);
  assert.equal(h.state.combat.attachments.byId[h.npcLine.attachment.id].state, 'active');
  assert.equal(h.cuts.length, 0);
  assert.equal(consumePhysicsCommand(h.tug), null, 'slack queues no hidden recovery impulse');
  assert.equal(consumePhysicsCommand(h.load), null);
  console.log(`PQ-030.00 SEED=${SEED} SLACK_CUT=0 SLACK_KICK=0`);
});
