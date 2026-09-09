// PQ-030.00 / PQ-030.02 — Monofilament sweep cuts crossing tethers.
// Seed 30000. One taut pass cuts; slack does not. Range stays untouched; no headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { specialistPlanById } from '../src/ai/specialistPlans.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { trigger as raiderAmbush } from '../src/data/encounters/334-tether-control-raider-ambush.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  MONOFILAMENT_CUT_INTEGRITY_COST,
  tetherGameplay,
} from '../src/systems/tetherGameplay.js';

const SEED = 30000;
const DT = 1 / 60;

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
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: extra.radius ?? 8,
    mass: extra.mass ?? 20,
    collides: true,
    hull: 100,
    hullMax: 100,
    flags: {},
    data: extra.data || {},
  };
}

test('a taut Monofilament swing cuts a crossing NPC tow in one pass', () => {
  const player = spawn(1, 'ship', { x: 0, z: 0 }, {
    team: 0,
    data: { derived: { masslineHeadId: 'monofilament_sweep' } },
  });
  const anchor = spawn(2, 'asteroid', { x: 100, z: 0 }, { mass: 800, radius: 16, team: null });
  const tug = spawn(3, 'ship', { x: 50, z: -40 }, {
    data: { trafficRole: 'tug', worldRecordId: 'sector:sweep:tug' },
  });
  const load = spawn(4, 'payload', { x: 50, z: 40 }, {
    mass: 80,
    radius: 4,
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
        strain: 0.6,
        load: 0.6,
        attachmentId: null,
        restLength: 100,
        phase: 'loaded',
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
  bus.on('massline:npcLineCut', (payload) => cuts.push(payload));
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
  assert.equal(blade.ok, true);
  assert.equal(blade.attachment.tetherPolicy.headId, 'monofilament_sweep');
  state.player.tether.attachmentId = blade.attachment.id;

  const npcLine = attachments.create({
    defId: 'tether_standard',
    ownerId: tug.id,
    targetId: load.id,
    controlMode: 'npc_tow',
    sourceWorld: { x: tug.pos.x, y: 0, z: tug.pos.z },
    targetWorld: { x: load.pos.x, y: 0, z: load.pos.z },
  });
  assert.equal(npcLine.ok, true);
  assert.equal(npcLine.attachment.state, 'active');

  system.update(DT, state);

  assert.equal(state.combat.attachments.byId[npcLine.attachment.id].state, 'broken',
    'the crossing NPC tow must be severed in the same taut pass');
  assert.equal(state.combat.attachments.byId[npcLine.attachment.id].breakReason, 'monofilament_sweep');
  assert.equal(state.combat.attachments.byId[blade.attachment.id].state, 'active',
    'the player blade stays up');
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].attachmentId, npcLine.attachment.id);
  assert.equal(cuts[0].headId, 'monofilament_sweep');
  assert.equal(cuts[0].integrity, 1 - MONOFILAMENT_CUT_INTEGRITY_COST);
  assert.equal(
    state.combat.attachments.byId[blade.attachment.id].masslineRuntime.integrity,
    1 - MONOFILAMENT_CUT_INTEGRITY_COST,
    'the taut pass spends line integrity',
  );

  system.update(DT, state);
  assert.equal(cuts.length, 1, 'a severed line is not cut again');
  console.log(`SEED=${SEED} TAUT_CUT=1 INTEGRITY=${cuts[0].integrity} COST=${MONOFILAMENT_CUT_INTEGRITY_COST}`);
});

test('a slack Monofilament line does not cut a crossing NPC tow', () => {
  const player = spawn(1, 'ship', { x: 0, z: 0 }, {
    team: 0,
    data: { derived: { masslineHeadId: 'monofilament_sweep' } },
  });
  const anchor = spawn(2, 'asteroid', { x: 100, z: 0 }, { mass: 800, radius: 16, team: null });
  const tug = spawn(3, 'ship', { x: 50, z: -40 }, { data: { trafficRole: 'tug' } });
  const load = spawn(4, 'payload', { x: 50, z: 40 }, {
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
        strain: 0,
        load: 0,
        attachmentId: null,
        restLength: 200,
        phase: 'slack',
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
  bus.on('massline:npcLineCut', (payload) => cuts.push(payload));
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
  });
  assert.equal(blade.ok, true);
  blade.attachment.restLength = 200;
  state.player.tether.attachmentId = blade.attachment.id;

  const npcLine = attachments.create({
    defId: 'tether_standard',
    ownerId: tug.id,
    targetId: load.id,
    controlMode: 'npc_tow',
  });
  assert.equal(npcLine.ok, true);

  system.update(DT, state);
  assert.equal(state.combat.attachments.byId[npcLine.attachment.id].state, 'active');
  assert.equal(cuts.length, 0, 'slack does not cut');
  assert.equal(state.combat.attachments.byId[blade.attachment.id].masslineRuntime, undefined,
    'slack does not spend line integrity');
  console.log(`SEED=${SEED} SLACK_CUT=0`);
});

test('the tether-cutter reads as a corsair blade that spools a Massline before Fire Control unlocks', () => {
  const plan = specialistPlanById('tether_cutter');
  const hull = ENEMY_TYPES.find((row) => row.id === plan.enemyId);
  const sweep = MODULES.find((row) => row.id === 'mod_monofilament_sweep_m');
  const tech = TECH_NODES.find((row) => row.id === sweep.requiresTech);

  assert.equal(hull.silhouette, 'corsair_blade');
  assert.equal(hull.telegraph.cue, 'attach_spool');
  assert.match(hull.behavior, /Massline/i);
  assert.equal(plan.verb, 'cut_line');
  assert.equal(raiderAmbush.gates.requiredTech, undefined,
    'the specialist is not gated on Fire Control');
  assert.ok(raiderAmbush.gates.minSectorTier >= 1);
  assert.equal(sweep.requiresTech, 'tech_fire_control');
  assert.ok(tech.cost.rp >= 110, 'Fire Control is the late buy; the raider arrives on the route first');
});

test('a taut tether-cutter sweep severs the player line in one pass', () => {
  const player = spawn(1, 'ship', { x: 50, z: -40 }, { team: 0 });
  const rock = spawn(2, 'asteroid', { x: 50, z: 40 }, { mass: 800, radius: 16, team: null });
  const raider = spawn(3, 'ship', { x: 0, z: 0 }, {
    team: 1,
    data: {
      lootTableId: 'tether_control_raider',
      enemyTypeId: 'tether_control_raider',
      ai: { forcePlayerTarget: true },
    },
  });
  const pin = spawn(4, 'asteroid', { x: 100, z: 0 }, { mass: 800, radius: 16, team: null });
  const entityList = [player, rock, raider, pin];
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const state = {
    mode: 'flight',
    simTime: 1,
    tick: 60,
    playerId: player.id,
    player: {
      tether: {
        active: true,
        targetId: rock.id,
        strain: 0.6,
        load: 0.6,
        attachmentId: null,
        restLength: 80,
        phase: 'loaded',
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
  bus.on('massline:playerLineCut', (payload) => cuts.push(payload));
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

  const playerLine = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: rock.id,
    sourceWorld: { x: player.pos.x, y: 0, z: player.pos.z },
    targetWorld: { x: rock.pos.x, y: 0, z: rock.pos.z },
  });
  assert.equal(playerLine.ok, true);
  state.player.tether.attachmentId = playerLine.attachment.id;

  raider.data.derived = { masslineHeadId: 'monofilament_sweep' };
  const blade = attachments.create({
    defId: 'tether_standard',
    ownerId: raider.id,
    targetId: pin.id,
    controlMode: 'npc_tow',
    sourceWorld: { x: raider.pos.x, y: 0, z: raider.pos.z },
    targetWorld: { x: pin.pos.x, y: 0, z: pin.pos.z },
  });
  assert.equal(blade.ok, true);

  system.update(DT, state);

  assert.equal(state.combat.attachments.byId[playerLine.attachment.id].state, 'broken',
    'the specialist sweep severs the player line in one taut pass');
  assert.equal(state.combat.attachments.byId[blade.attachment.id].state, 'active',
    'the cutter keeps its own blade');
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].cutterId, raider.id);
  assert.equal(cuts[0].headId, 'monofilament_sweep');
  assert.equal(cuts[0].integrity, 1 - MONOFILAMENT_CUT_INTEGRITY_COST);
  assert.equal(raider.data.derived.masslineHeadId, 'monofilament_sweep');

  system.update(DT, state);
  assert.equal(cuts.length, 1, 'a severed player line is not cut again');
});

