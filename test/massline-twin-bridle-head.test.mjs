import assert from 'node:assert/strict';
import test from 'node:test';

import { createAttachmentService, effectiveTetherPolicy } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { ATTACHMENT_DEFS, DEFAULT_COMBAT_PROFILE_BY_TYPE } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import {
  tetherGameplay,
  TWIN_BRIDLE_DEF_ID,
  TWIN_BRIDLE_HEAD_ID,
  TWIN_BRIDLE_SETUP_S,
  validateTwinBridlePair,
} from '../src/systems/tetherGameplay.js';
import { masslineTetherStatus } from '../src/ui/hud.js';
import { MASSLINE_HUD_CSS } from '../src/ui/masslineHud.js';
import { statSnippet } from '../src/ui/screens/outfitting.js';

const DT = 1 / 60;
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const BRIDLE_DEF = ATTACHMENT_DEFS.find((def) => def.id === TWIN_BRIDLE_DEF_ID);
const BRIDLE_MODULE = MODULES.find((def) => def.id === 'mod_twin_bridle_m');

test('Twin Bridle is a normal default-route fitting with a dedicated non-winch rope', () => {
  const fittings = fittingsFromDefaultModules('ship_drifter', [BRIDLE_MODULE.id]);
  const derived = getDerivedStats('ship_drifter', fittings, null);
  const production = effectiveTetherPolicy(STANDARD, { data: { derived } }, PRODUCTION_FEATURES);
  const legacy = effectiveTetherPolicy(STANDARD, { data: { derived } }, LEGACY47A_FEATURES);
  const tech = TECH_NODES.find((node) => node.id === BRIDLE_MODULE.requiresTech);

  assert.ok(BRIDLE_DEF);
  assert.equal(BRIDLE_DEF.massline, undefined, 'the world rope has no reel/winch controller');
  assert.equal(DEFAULT_COMBAT_PROFILE_BY_TYPE.fieldEmitter, 'combat_profile_tether_anchor');
  assert.ok(fittings.includes(BRIDLE_MODULE.id));
  assert.ok(tech.unlocks.modules.includes(BRIDLE_MODULE.id));
  assert.equal(derived.masslineHeadId, TWIN_BRIDLE_HEAD_ID);
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadTwinBridle, true);
  assert.equal(LEGACY47A_FEATURES.massline2.masslineHeadTwinBridle, false);
  assert.equal(production.headId, TWIN_BRIDLE_HEAD_ID);
  assert.deepEqual(production.spring, STANDARD.spring,
    'a defensive ordinary latch cannot turn the player ship into a bridle endpoint');
  assert.equal(legacy.headId, undefined);
  assert.match(statSnippet(BRIDLE_MODULE), /two-endpoint world tether/i);
});

test('two public Massline presses create exactly one A-to-B rope and never write movement controls', () => {
  const h = harness();
  const before = motionSnapshot(h.player, h.source, h.target);

  step(h, { aim: h.source.pos });
  assert.equal(h.state.masslineAcquisition.selected.targetId, h.source.id);
  step(h, { aim: h.source.pos, latch: true });

  assert.equal(h.state.masslineBridle.sourceId, h.source.id);
  assert.equal(h.state.player.remoteMassline, undefined,
    'endpoint A is only a visible expiring selection, not a hidden partial tether');
  assert.equal(Object.keys(h.state.combat.attachments.byId).length, 0);

  step(h, { aim: h.target.pos, dt: 0.1 });
  assert.equal(h.state.masslineAcquisition.selected.targetId, h.target.id);
  step(h, { aim: h.target.pos, latch: true });

  const active = Object.values(h.state.combat.attachments.byId).filter((entry) => entry.state === 'active');
  assert.equal(active.length, 1);
  assert.deepEqual([active[0].ownerId, active[0].targetId], [h.source.id, h.target.id]);
  assert.equal(active[0].controllerId, h.player.id);
  assert.equal(active[0].controlMode, TWIN_BRIDLE_HEAD_ID);
  assert.ok(![active[0].ownerId, active[0].targetId].includes(h.player.id),
    'the player is the cut owner, never a physical third endpoint');
  assert.equal(h.state.player.remoteMassline.kind, TWIN_BRIDLE_HEAD_ID);
  assert.equal(h.state.player.remoteMassline.active, true);
  assert.equal(h.state.player.tether.active, false);
  assert.deepEqual(h.physics.creates[0].sourceWorld, { x: h.source.pos.x, z: h.source.pos.z });
  const targetAnchor = h.physics.creates[0].targetWorld;
  assert.ok(Math.hypot(targetAnchor.x - h.target.pos.x, targetAnchor.z - h.target.pos.z) > 0,
    'the fixed field endpoint keeps a visible surface anchor');
  assert.ok(Math.hypot(targetAnchor.x - h.source.pos.x, targetAnchor.z - h.source.pos.z)
    < Math.hypot(h.target.pos.x - h.source.pos.x, h.target.pos.z - h.source.pos.z),
  'the fixed endpoint surface anchor faces the other body');
  assert.deepEqual(motionSnapshot(h.player, h.source, h.target), before,
    'selection and commit do not write thrust, braking, facing, speed, position, or velocity');

  const attachedEvent = h.events.find((entry) => entry.type === 'tether:attached');
  assert.equal(attachedEvent.payload.controllerId, h.player.id);
  assert.equal(attachedEvent.payload.controlMode, TWIN_BRIDLE_HEAD_ID);

  const physicsCreatesBeforeLoad = h.physics.creates.length;
  h.bus.emit('save:loaded');
  assert.equal(h.state.player.remoteMassline.active, false);
  step(h);
  assert.equal(h.state.player.remoteMassline.active, true,
    'the gameplay owner re-adopts the saved controlled rope without recreating it');
  assert.equal(h.physics.creates.length, physicsCreatesBeforeLoad);

  step(h, { cut: true });
  assert.equal(active[0].state, 'broken');
  assert.equal(active[0].breakReason, 'tether_cut');
  assert.equal(h.state.player.remoteMassline.active, false);
  assert.deepEqual(motionSnapshot(h.player, h.source, h.target), before,
    'cut preserves the real endpoint motion instead of injecting a release impulse');
});

test('setup has explicit same-endpoint cancel and simulation-time expiry with no partial line', () => {
  const cancel = harness();
  step(cancel, { aim: cancel.source.pos });
  step(cancel, { aim: cancel.source.pos, latch: true });
  step(cancel, { aim: cancel.source.pos, dt: 0.1 });
  step(cancel, { aim: cancel.source.pos, latch: true });
  assert.equal(cancel.state.masslineBridle, undefined);
  assert.equal(Object.keys(cancel.state.combat.attachments.byId).length, 0);

  const expiry = harness();
  step(expiry, { aim: expiry.source.pos });
  step(expiry, { aim: expiry.source.pos, latch: true });
  expiry.state.simTime += TWIN_BRIDLE_SETUP_S + DT;
  expiry.state.tick += 1;
  expiry.state.input.actions = { tetherFire: false, massline: null };
  expiry.system.update(DT, expiry.state);
  assert.equal(expiry.state.masslineBridle, undefined);
  assert.equal(Object.keys(expiry.state.combat.attachments.byId).length, 0);
  assert.ok(expiry.events.some((entry) => entry.type === 'massline:bridleSetupEnded'
    && entry.payload.reason === 'setup_expired'));
});

test('pair admission rejects loops and two heavy anchors while allowing one fixed field endpoint', () => {
  const h = harness();
  const heavyA = entity(10, 'asteroid', 40, 0, { physicsBody: { dynamic: false, mass: 8000 } });
  const heavyB = entity(11, 'station', 100, 0, { physicsBody: { dynamic: false, mass: 20000 } });
  assert.equal(validateTwinBridlePair(h.system, h.state, h.player, heavyA, heavyB, BRIDLE_DEF), 'two_heavy_endpoints');
  assert.equal(validateTwinBridlePair(h.system, h.state, h.player, h.source, h.target, BRIDLE_DEF), null,
    'one moving craft plus one fixed field emitter is the authored hazard use case');

  h.state.combat.attachments.byId.path_a = {
    id: 'path_a', state: 'active', ownerId: h.source.id, targetId: 30,
  };
  h.state.combat.attachments.byId.path_b = {
    id: 'path_b', state: 'active', ownerId: 30, targetId: h.target.id,
  };
  assert.equal(validateTwinBridlePair(h.system, h.state, h.player, h.source, h.target, BRIDLE_DEF), 'attachment_cycle');
});

test('unused system is hash-inert and the HUD names a non-reel A/B linked state', () => {
  const state = { player: {}, entities: new Map(), playerId: null };
  const system = Object.create(tetherGameplay);
  system.init({ state, bus: immediateBus(), helpers: {}, registry: null });
  assert.equal(state.masslineBridle, undefined);
  assert.equal(state.player.remoteMassline, undefined);
  assert.match(MASSLINE_HUD_CSS, /ml2-bridle-source/);
  assert.match(MASSLINE_HUD_CSS, /ml2-bridle-target/);
  assert.deepEqual(
    masslineTetherStatus({
      active: true,
      kind: TWIN_BRIDLE_HEAD_ID,
      headId: TWIN_BRIDLE_HEAD_ID,
      phase: 'slack',
      strain: 0,
      load: 0,
      automaticBreakAllowed: true,
    }),
    { text: 'TWIN BRIDLE · LINKED', warn: false },
  );
});

function harness() {
  const player = entity(1, 'ship', 0, 0, {
    team: 0,
    data: { derived: { masslineHeadId: TWIN_BRIDLE_HEAD_ID } },
    physicsBody: { dynamic: true, mass: 40 },
  });
  const source = entity(2, 'ship', 90, 0, {
    team: 1,
    data: { name: 'Raider A', ai: { forcePlayerTarget: true } },
    physicsBody: { dynamic: true, mass: 55 },
  });
  const target = entity(3, 'fieldEmitter', 150, 40, {
    team: 0,
    data: { name: 'Repulsor B', fieldEmitter: true },
    physicsBody: { dynamic: false, mass: 2500 },
  });
  const entities = new Map([[player.id, player], [source.id, source], [target.id, target]]);
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
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
    runtime: { features: PRODUCTION_FEATURES },
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
  return { state, player, source, target, physics, events, bus, attachments, system };
}

function step(h, { aim = null, latch = false, cut = false, dt = DT } = {}) {
  h.state.tick += 1;
  h.state.simTime += dt;
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
      return { tension: 0, impulse: 0, yank: 0, phase: 'slack' };
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
