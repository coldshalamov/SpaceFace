// PQ-031.02 — NPC counterplay: an ace cuts a player bridle; a heavy ignores it by mass.
// Seed 31002. Specialist still carries the cut_line verb. No headed capture; silhouette
// legibility is named for a later vision pass.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CombatDoctrineId,
  CombatDoctrineRuntime,
  DOCTRINE_TELEGRAPH_TICKS,
} from '../src/ai/combatDoctrine.js';
import { ContactKind, ObjectiveKind } from '../src/ai/contracts.js';
import { specialistPlanByEnemyId } from '../src/ai/specialistPlans.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createStatusService } from '../src/combat/statuses.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl } from '../src/core/physicsAuthority.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { MODULES } from '../src/data/modules.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import {
  tetherGameplay,
  TWIN_BRIDLE_HEAD_ID,
  validateTwinBridlePair,
} from '../src/systems/tetherGameplay.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';

const SEED = 31002;
const DT = 1 / 60;
const BRIDLE_DEF = ATTACHMENT_DEFS.find((def) => def.id === 'attachment_twin_bridle');
const ANCHOR = ENEMY_TYPES.find((row) => row.id === 'field_anchor_controller');
const RAIDER = ENEMY_TYPES.find((row) => row.id === 'tether_control_raider');

test('PQ-031.02 seed 31002: an ace cuts the bridle and a heavy ignores it by mass', async (t) => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = previous; });

  const plan = specialistPlanByEnemyId(RAIDER.id);
  assert.equal(plan.verb, 'cut_line', 'the specialist carries a line-cutter as a doctrine verb');
  assert.equal(MODULES.some((mod) => /line_cutter|cut_line/i.test(mod.id)), false,
    'the cutter is a verb on the specialist plan, not a fitted module');

  // --- one cut: Yara No-Cut reaches her own interceptor strike, then the line dies -----------
  const cut = harness({ twoLights: true });
  const statuses = createStatusService({
    state: cut.state,
    catalog: cut.catalog,
    bus: cut.bus,
    helpers: { combatPhysics: cut.physics },
  });
  const kernel = { attachments: cut.attachments, catalog: cut.catalog, statuses };
  cut.system.registry = {
    get(id) { return id === 'actions' || id === 'combat' ? { kernel } : null; },
  };

  step(cut, { aim: cut.source.pos });
  step(cut, { aim: cut.source.pos, latch: true });
  step(cut, { aim: cut.target.pos, dt: 0.1 });
  step(cut, { aim: cut.target.pos, latch: true });
  const line = Object.values(cut.state.combat.attachments.byId).find((entry) => entry.state === 'active');
  assert.ok(line, 'the throw still makes one player-controlled line');

  const ace = entity(9, 'ship', 120, 20, {
    team: 1,
    mass: 22,
    radius: 8,
    data: {
      name: 'Yara No-Cut',
      namedAceId: 'ace_yara_no_cut',
      ai: { namedAceId: 'ace_yara_no_cut', combatDoctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY },
    },
  });
  cut.state.entities.set(ace.id, ace);
  cut.state.entityList.push(ace);

  const doctrine = new CombatDoctrineRuntime({ seed: SEED });
  let phase = null;
  for (const [tick, distance] of [[0, 400], [DOCTRINE_TELEGRAPH_TICKS, 400]]) {
    phase = doctrine.update({
      tick,
      entityId: ace.id,
      doctrineId: CombatDoctrineId.INTERCEPTOR_FLYBY,
      perception: acePerception(ace.id, distance),
      directive: aceDirective(),
    });
  }
  assert.equal(phase.phase, 'strike', 'the ace reaches her own strike unaided');
  assert.equal(phase.phaseChanged, true, 'tacticalAI only publishes the phase on the change tick');

  cut.bus.emit('ai:doctrinePhase', {
    entityId: ace.id,
    targetId: phase.targetId,
    doctrineId: phase.doctrineId,
    flightProfile: phase.flightProfile,
    phase: phase.phase,
    fireWindow: phase.fireWindow,
    tick: cut.state.tick,
  });
  assert.equal(line.state, 'broken');
  assert.equal(line.breakReason, 'ace_cut');
  assert.ok(cut.events.some((entry) => entry.type === 'massline:npcCounterplay'
    && entry.payload.verb === 'cut_bridle'
    && entry.payload.role === 'ace'));

  // --- one ignore: the Anchor Controller takes the second latch and keeps the helm ------------
  const ignore = harness();
  const heavyNpc = entity(12, 'ship', 200, 0, {
    team: 1,
    mass: ANCHOR.mass,
    radius: ANCHOR.collisionRadius,
    physicsBody: { dynamic: true, mass: ANCHOR.mass },
    vel: { x: 0, z: 0 },
    data: {
      name: ANCHOR.name,
      lootTableId: ANCHOR.id,
      ai: { combatDoctrineId: ANCHOR.combatDoctrineId },
    },
  });
  ignore.source.vel = { x: 80, z: 0 };
  ignore.source.mass = 16;
  ignore.source.physicsBody = { dynamic: true, mass: 16 };
  ignore.source.data.role = 'fighter';
  assert.equal(
    validateTwinBridlePair(ignore.system, ignore.state, ignore.player, ignore.source, heavyNpc, BRIDLE_DEF),
    null,
    'a heavy NPC is a legal endpoint; ignore is mass, not an admission flag',
  );

  ignore.state.entities.set(heavyNpc.id, heavyNpc);
  ignore.state.entityList.push(heavyNpc);
  const ignoreStatuses = createStatusService({
    state: ignore.state,
    catalog: ignore.catalog,
    bus: ignore.bus,
    helpers: { combatPhysics: ignore.physics },
  });
  ignore.system.registry = {
    get(id) {
      return id === 'actions' || id === 'combat'
        ? { kernel: { attachments: ignore.attachments, catalog: ignore.catalog, statuses: ignoreStatuses } }
        : null;
    },
  };
  const tumble = Object.create(tumbleStates);
  tumble.init({
    state: ignore.state,
    bus: ignore.bus,
    helpers: { combatPhysics: ignore.physics },
    registry: ignore.system.registry,
  });
  t.after(() => tumble.destroy());

  step(ignore, { aim: ignore.source.pos });
  step(ignore, { aim: ignore.source.pos, latch: true });
  step(ignore, { aim: heavyNpc.pos, dt: 0.1 });
  assert.equal(ignore.state.masslineAcquisition.selected.targetId, heavyNpc.id,
    'the heavy is a selectable endpoint, so the rope below is the throw and not a selection miss');
  step(ignore, { aim: heavyNpc.pos, latch: true });
  const heavyLine = Object.values(ignore.state.combat.attachments.byId)
    .find((entry) => entry.state === 'active');
  assert.ok(heavyLine, 'a second press on a heavy becomes a rope');
  assert.deepEqual([heavyLine.ownerId, heavyLine.targetId], [ignore.source.id, heavyNpc.id]);
  assert.ok(readTumbleStatus(ignore.state, ignore.source), 'the light is yanked');
  assert.equal(readTumbleStatus(ignore.state, heavyNpc), null,
    'the heavy keeps the helm: its catch share sits under the hitstun floor');

  const physicsIgnore = await runHeavyIgnorePhysics();
  console.log(
    `PQ-031.02 seed=${SEED} aceCut=${line.breakReason} heavyLine=${heavyLine.state} `
    + `heavyDv=${physicsIgnore.heavySpeed.toFixed(2)} lightSpeed=${physicsIgnore.lightSpeed.toFixed(2)} `
    + `ratio=${physicsIgnore.ratio.toFixed(3)}`,
  );
  assert.ok(physicsIgnore.heavySpeed < physicsIgnore.lightSpeed * 0.2,
    `a 420 kg hull must shrug the 16 kg yank, heavy=${physicsIgnore.heavySpeed} light=${physicsIgnore.lightSpeed}`);
  assert.ok(physicsIgnore.ratio <= (16 / ANCHOR.mass) * 3,
    'heavy Δv vs the pair COM must fall out of the mass ratio, not a flag');
});

async function runHeavyIgnorePhysics() {
  const light = makeBody('light', -40, 0, 16, 0, 90);
  const heavy = makeBody('heavy', 40, 0, ANCHOR.mass, 0, 0);
  heavy.radius = ANCHOR.collisionRadius;
  heavy.physicsBody.radius = ANCHOR.collisionRadius;
  const runtime = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5, mode: 'rapier-dynamic' });
  try {
    runtime.syncFromEntities([light, heavy]);
    const handle = runtime.createAttachment({
      attachmentId: 'bridle-ignore',
      defId: 'attachment_twin_bridle',
      ownerId: light.id,
      targetId: heavy.id,
      sourceWorld: light.pos,
      targetWorld: heavy.pos,
      restLength: 80,
      spring: BRIDLE_DEF.spring,
      break: BRIDLE_DEF.break,
      tick: 0,
    });
    assert.ok(handle, 'ignore physics must create the bridle');
    for (let tick = 0; tick < 180; tick += 1) {
      writePhysicsControl(light, idleControl());
      writePhysicsControl(heavy, idleControl());
      runtime.step(DT);
    }
    const lightSpeed = Math.hypot(light.vel.x, light.vel.z);
    const heavySpeed = Math.hypot(heavy.vel.x, heavy.vel.z);
    return {
      lightSpeed,
      heavySpeed,
      ratio: lightSpeed > 1e-6 ? heavySpeed / lightSpeed : 0,
    };
  } finally {
    runtime.dispose();
  }
}

function harness(options = {}) {
  const twoLights = options.twoLights === true;
  const player = entity(1, 'ship', 0, 0, {
    team: 0,
    data: { derived: { masslineHeadId: TWIN_BRIDLE_HEAD_ID } },
    physicsBody: { dynamic: true, mass: 40 },
  });
  const source = entity(2, 'ship', 90, 0, {
    team: 1,
    mass: twoLights ? 16 : 16,
    vel: twoLights ? { x: 80, z: 0 } : { x: 80, z: 0 },
    data: {
      name: 'Raider A',
      role: 'fighter',
      intent: { fire: true, moveX: 1, moveZ: 0 },
      ai: { forcePlayerTarget: true },
    },
    physicsBody: { dynamic: true, mass: 16 },
  });
  const target = twoLights
    ? entity(3, 'ship', 150, 40, {
        team: 1,
        mass: 16,
        vel: { x: -80, z: 0 },
        data: {
          name: 'Raider B',
          role: 'fighter',
          intent: { fire: true, moveX: -1, moveZ: 0 },
          ai: { forcePlayerTarget: true },
        },
        physicsBody: { dynamic: true, mass: 16 },
      })
    : entity(3, 'fieldEmitter', 150, 40, {
        team: 0,
        data: { name: 'Repulsor B', fieldEmitter: true },
        physicsBody: { dynamic: false, mass: 2500 },
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

function acePerception(selfId, distanceWu) {
  return {
    self: {
      id: selfId,
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      activity: {
        kind: 'attack_run',
        reason: 'named_ace',
        anchor: { x: 0, z: 0 },
        leashRadius: 2800,
        preferredRange: 260,
        startedTick: 0,
      },
      roe: 'weapons_free',
    },
    contacts: [{
      id: 'player',
      kind: ContactKind.SHIP,
      alive: true,
      valid: true,
      visible: true,
      hostile: true,
      confidence: 1,
      threat: 0.8,
      pos: { x: distanceWu, z: 0 },
      vel: { x: 0, z: 0 },
      tethered: false,
      operationalMassBand: 'medium',
      mobilityBand: 'medium',
      cargoBand: 'rich',
      tetherabilityBand: 'poor',
      tags: [],
    }],
    events: [],
  };
}

function aceDirective() {
  return Object.freeze({
    objective: Object.freeze({ kind: ObjectiveKind.FOCUS, targetId: 'player', reason: 'fixture' }),
    formation: Object.freeze({ breakFormation: false }),
  });
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
    radius: type === 'station' ? 24 : type === 'asteroid' ? 16 : 8,
    mass: 50,
    hull: 100,
    hullMax: 100,
    team: 2,
    data: {},
    ...overrides,
  };
}

function makeBody(id, x, z, mass, vx, vz) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 6,
    mass,
    maxSpeed: 260,
    physicsBody: {
      schemaVersion: 1,
      radius: 6,
      mass,
      inertiaY: mass * 4,
      dynamic: true,
      ccd: true,
      revision: 0,
    },
    pos: { x, z },
    vel: { x: vx, z: vz },
    rot: 0,
    angVel: 0,
    data: {},
  };
}

function idleControl() {
  return {
    source: 'pq-031-02-ignore',
    mode: 'newtonian',
    force: { x: 0, y: 0, z: 0 },
    torque: { x: 0, y: 0, z: 0 },
    maxSpeed: Infinity,
  };
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
