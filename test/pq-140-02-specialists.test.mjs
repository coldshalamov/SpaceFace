import test from 'node:test';
import assert from 'node:assert/strict';

import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { SPECIALIST_PLANS, specialistPlanById } from '../src/ai/specialistPlans.js';
import { applySpecialistCounterplay } from '../src/ai/specialistCounterplay.js';
import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
} from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { activeFieldSnapshot, fields } from '../src/systems/fields.js';

function enemy(id) {
  return ENEMY_TYPES.find((row) => row.id === id);
}

test('PQ-140.02 four specialists, each named plan and a distinct silhouette-or-mass read', () => {
  assert.equal(SPECIALIST_PLANS.length, 4);
  const ids = SPECIALIST_PLANS.map((row) => row.id);
  for (const need of ['tether_cutter', 'field_disruptor', 'anchor', 'cargo_protector']) {
    assert.ok(ids.includes(need), need);
  }
  const silhouettes = new Set(SPECIALIST_PLANS.map((row) => row.silhouette));
  assert.ok(silhouettes.size >= 3, 'at least three silhouettes so a still can tell them apart');
  const anchor = specialistPlanById('anchor');
  const warden = specialistPlanById('cargo_protector');
  assert.equal(anchor.silhouette, warden.silhouette);
  const anchorHull = enemy(anchor.enemyId);
  const wardenHull = enemy(warden.enemyId);
  assert.ok(anchorHull.mass >= 150, 'anchor is moving terrain');
  assert.ok(wardenHull.mass < anchorHull.mass, 'warden is the lighter bruiser');
  assert.ok(anchorHull.maxSpeed < wardenHull.maxSpeed, 'anchor turns and crawls; the screen can dart');
});

test('PQ-140.02 tether-cutter waits for the spool telegraph, then breaks a live line', () => {
  const h = liveLine();
  const raider = {
    id: 'raider',
    alive: true,
    pos: { x: 40, z: 0 },
    data: { lootTableId: 'tether_control_raider' },
  };
  h.state.entities.set(raider.id, raider);
  h.state.player.tether = { active: true, attachmentId: h.line.id };

  const duringCue = applySpecialistCounterplay({
    state: h.state,
    specialist: raider,
    enemyId: 'tether_control_raider',
    doctrinePhase: 'spool_cue',
    tick: 30,
    attachments: h.attachments,
    fields: null,
  });
  assert.equal(duringCue, null, 'cut is the ability the player cannot see coming if it lands on spool_cue');
  assert.equal(h.attachments.get(h.line.id).state, 'active');

  const afterWindow = applySpecialistCounterplay({
    state: h.state,
    specialist: raider,
    enemyId: 'tether_control_raider',
    doctrinePhase: 'attach_window',
    tick: 31,
    attachments: h.attachments,
    fields: null,
  });
  assert.equal(afterWindow.verb, 'cut_line');
  assert.equal(h.attachments.get(h.line.id).state, 'broken');
  assert.equal(h.attachments.get(h.line.id).breakReason, 'specialist_cut');
});

test('PQ-140.02 field-disruptor waits for the charge telegraph, then collapses a parked well', () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({ seed: 14002, bus: createBus(), systems: [fields] });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hull: 200,
      hullMax: 200,
      flags: {},
      data: {},
    });
    state.playerId = player.id;
    const fieldsSys = sim.registry.get('fields');
    state.input.aimWorld = { x: 220, z: 0 };
    state.input.actions.deployWell = true;
    sim.step();
    assert.ok(fieldsSys._kernel.size >= 1, 'player well is parked');

    const ghost = {
      id: 'ghost',
      alive: true,
      pos: { x: 40, z: 0 },
      data: { lootTableId: 'quiet_ghost' },
    };
    state.entities.set(ghost.id, ghost);

    const duringCharge = applySpecialistCounterplay({
      state,
      specialist: ghost,
      enemyId: 'quiet_ghost',
      doctrinePhase: 'charge_cue',
      tick: 12,
      attachments: null,
      fields: fieldsSys,
    });
    assert.equal(duringCharge, null, 'disrupt does not land on the charge cue');
    assert.ok(fieldsSys._kernel.size >= 1);

    const afterFire = applySpecialistCounterplay({
      state,
      specialist: ghost,
      enemyId: 'quiet_ghost',
      doctrinePhase: 'fire_window',
      tick: 13,
      attachments: null,
      fields: fieldsSys,
    });
    assert.equal(afterFire.verb, 'disrupt_field');
    assert.ok(afterFire.count >= 1);
    assert.equal(fieldsSys._kernel.size, 0, 'the parked well is gone');

    const lancer = {
      id: 'lancer',
      alive: true,
      pos: { x: 40, z: 0 },
      data: { lootTableId: 'lancer_sniper' },
    };
    const ordinary = applySpecialistCounterplay({
      state,
      specialist: lancer,
      enemyId: 'lancer_sniper',
      doctrinePhase: 'fire_window',
      tick: 40,
      attachments: null,
      fields: fieldsSys,
    });
    assert.equal(ordinary, null, 'ordinary ranged_disengager hulls do not steal the ghost verb');
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
});

test('PQ-140.02 anchor carries a snare the player cannot kite through', () => {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({ seed: 14003, bus: createBus(), systems: [fields] });
    const { state } = sim;
    state.mode = 'flight';
    state.world.currentSectorId = 'sector_ceres_belt';
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 12,
      hull: 160,
      hullMax: 160,
      data: { ai: {}, intent: {} },
    });
    state.playerId = player.id;
    const spec = makeEnemySpawnSpec('field_anchor_controller', 6, { x: 400, z: 0 });
    const anchor = sim.spawn(spec);
    assert.ok(anchor.data.fieldAnchor);
    assert.ok(anchor.data.fieldAnchor.radius >= 200);
    for (let i = 0; i < 60; i++) sim.step(1 / 60);
    const snares = activeFieldSnapshot(state).filter((row) => row.sourceId === anchor.id);
    assert.ok(snares.length >= 1, 'snare registered through the shared field owner');
    assert.ok(snares[0].radius >= 200);
  } finally {
    FIELD_FLAGS.enabled = previous;
  }
});

test('PQ-140.02 cargo-protector screens a packmate, not a hunt', () => {
  const hull = enemy('warden_escort');
  assert.equal(hull.combatDoctrineId, 'escort_screen');
  assert.match(String(hull.behavior), /screen|ward|pack/i);

  const runtime = new CombatDoctrineRuntime({ seed: 14004 });
  let hold = null;
  for (let tick = 0; tick <= 120; tick++) {
    const snap = runtime.update({
      tick,
      entityId: 2,
      doctrineId: CombatDoctrineId.ESCORT_SCREEN,
      perception: escortPerception(),
      directive: escortDirective(),
    });
    if (snap && snap.phase === 'screen_hold') hold = snap;
  }
  assert.ok(hold, 'the screen reaches hold');
  assert.ok(hold.flightPoint, 'hold is pinned to a screen point');
  const wardX = 200;
  const threatX = 900;
  assert.ok(hold.flightPoint.x > wardX, 'the point sits on the ward→threat side');
  assert.ok(hold.flightPoint.x < threatX, 'the point is not the hunt — it is short of the threat');
});

function liveLine() {
  const player = body('player', 'ship', 0, 0, { radius: 8, mass: 40 });
  const rock = body('rock', 'asteroid', 120, 0, { radius: 16, mass: 640 });
  const entities = new Map([[player.id, player], [rock.id, rock]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
    playerId: player.id,
    player: {},
    entities,
    entityList: [...entities.values()],
    runtime: { features: {} },
    world: { currentSectorId: 'test-sector' },
  };
  ensureCombatState(state);
  const catalog = createCombatCatalog();
  const physics = {
    createAttachment(spec) { return { id: `joint:${spec.attachmentId}` }; },
    cutAttachment() { return true; },
  };
  const attachments = createAttachmentService({
    state,
    catalog,
    helpers: { combatPhysics: physics },
    bus: createBus(),
  });
  const created = attachments.create({
    defId: 'tether_standard',
    ownerId: player.id,
    targetId: rock.id,
    sourceWorld: { x: 0, z: 0 },
    targetWorld: { x: 120, z: 0 },
  });
  assert.equal(created.ok, true, created.reason || 'line must exist');
  return { state, player, rock, line: created.attachment, attachments };
}

function body(id, type, x, z, extra = {}) {
  return {
    id,
    type,
    alive: true,
    collides: true,
    team: type === 'ship' ? 0 : null,
    pos: { x, z },
    vel: { x: 0, z: 0 },
    rot: 0,
    hull: 100,
    hullMax: 100,
    data: {},
    ...extra,
  };
}

function escortPerception() {
  return {
    self: {
      id: 2,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      activity: {
        kind: 'screen',
        reason: 'pq140_escort',
        anchor: { x: 0, z: 0 },
        leashRadius: 2600,
        preferredRange: 150,
        startedTick: 0,
      },
      roe: 'weapons_free',
    },
    contacts: [
      {
        id: 1,
        kind: ContactKind.SHIP,
        alive: true,
        valid: true,
        visible: true,
        hostile: true,
        confidence: 1,
        threat: 0.5,
        pos: { x: 900, z: 0 },
        vel: { x: -40, z: 0 },
        tethered: false,
        tags: [],
      },
      {
        id: 9,
        kind: ContactKind.SHIP,
        alive: true,
        valid: true,
        visible: true,
        hostile: false,
        confidence: 1,
        threat: 0.1,
        pos: { x: 200, z: 0 },
        vel: { x: 0, z: 0 },
        tethered: false,
        tags: [],
      },
    ],
    events: [],
  };
}

function escortDirective() {
  return Object.freeze({
    objective: Object.freeze({ kind: ObjectiveKind.SCREEN, targetId: 1, reason: 'fixture' }),
    formation: Object.freeze({ breakFormation: false }),
  });
}
