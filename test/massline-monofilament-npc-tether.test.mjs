// PQ-030.00 — Monofilament sweep cuts an NPC tether in one pass.
// Range stays untouched; no headed capture.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';

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
  assert.equal(state.combat.attachments.byId[blade.attachment.id].state, 'active',
    'the player blade stays up');
  assert.equal(cuts.length, 1);
  assert.equal(cuts[0].attachmentId, npcLine.attachment.id);
  assert.equal(cuts[0].headId, 'monofilament_sweep');

  system.update(DT, state);
  assert.equal(cuts.length, 1, 'a severed line is not cut again');
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
});
