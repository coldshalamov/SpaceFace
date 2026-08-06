import assert from 'node:assert/strict';
import test from 'node:test';

import { effectiveTetherPolicy } from '../src/combat/attachments.js';
import { makeEntity } from '../src/core/entity.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { MODULES } from '../src/data/modules.js';
import { TECH_NODES } from '../src/data/tech.js';
import { LEGACY47A_FEATURES, PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import {
  masslineSnares,
  resolveTransverseSnarePreview,
  TRANSVERSE_SNARE_DEF_ID,
} from '../src/systems/masslineSnares.js';
import { fittingsFromDefaultModules, getDerivedStats } from '../src/systems/ships.js';
import { masslineTetherStatus } from '../src/ui/hud.js';
import { MASSLINE_HUD_CSS } from '../src/ui/masslineHud.js';
import { statSnippet } from '../src/ui/screens/outfitting.js';

const DT = 1 / 60;
const STANDARD = ATTACHMENT_DEFS.find((def) => def.id === 'tether_standard');
const SNARE_DEF = ATTACHMENT_DEFS.find((def) => def.id === TRANSVERSE_SNARE_DEF_ID);
const SNARE_MODULE = MODULES.find((def) => def.id === 'mod_transverse_snare_m');

test('Transverse Snare is reachable, exclusive, default-on, and ordered after settled line observers', () => {
  const fittings = fittingsFromDefaultModules('ship_drifter', [SNARE_MODULE.id]);
  const derived = getDerivedStats('ship_drifter', fittings, null);
  const production = effectiveTetherPolicy(STANDARD, { data: { derived } }, PRODUCTION_FEATURES);
  const legacy = effectiveTetherPolicy(STANDARD, { data: { derived } }, LEGACY47A_FEATURES);
  const tech = TECH_NODES.find((node) => node.id === SNARE_MODULE.requiresTech);

  assert.ok(SNARE_DEF, 'the remote line has a production attachment definition');
  assert.ok(fittings.includes(SNARE_MODULE.id), 'a normal production hull can fit the head');
  assert.ok(tech.unlocks.modules.includes(SNARE_MODULE.id), 'Fire Control exposes the head');
  assert.equal(derived.masslineHeadId, 'transverse_snare');
  assert.equal(PRODUCTION_FEATURES.massline2.masslineHeadTransverseSnare, true);
  assert.equal(LEGACY47A_FEATURES.massline2.masslineHeadTransverseSnare, false);
  assert.equal(production.headId, 'transverse_snare');
  assert.deepEqual(production.spring, STANDARD.spring, 'defensive ordinary-latch fallback stays an ordinary rope');
  assert.equal(legacy.headId, undefined);
  assert.match(statSnippet(SNARE_MODULE), /free-target crossing snare/i);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('masslineSnares') > PRODUCTION_UPDATE_ORDER.indexOf('masslineImpacts'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('masslineSnares') < PRODUCTION_UPDATE_ORDER.indexOf('masslineThrow'));
});

test('free-target preview is deterministic, clamped, perpendicular, and names the exact deploy line', () => {
  const player = { pos: { x: 10, z: -20 }, rot: 0 };
  const near = resolveTransverseSnarePreview(player, { x: 11, z: -20 });
  const far = resolveTransverseSnarePreview(player, { x: 1010, z: -20 });

  assert.deepEqual(near.center, { x: 70, z: -20 }, 'near aim clamps to a legible 60-wu deployment range');
  assert.deepEqual(far.center, { x: 310, z: -20 }, 'far aim clamps to the authored 300-wu range');
  assert.equal(Math.hypot(near.target.x - near.source.x, near.target.z - near.source.z), 160);
  const aimDx = near.center.x - player.pos.x;
  const aimDz = near.center.z - player.pos.z;
  const lineDx = near.target.x - near.source.x;
  const lineDz = near.target.z - near.source.z;
  assert.ok(Math.abs(aimDx * lineDx + aimDz * lineDz) < 1e-9, 'the snare crosses the aim ray at 90 degrees');
});

test('admitting the production system is inert until the head is actually fitted and used', () => {
  const state = { player: {}, entities: new Map(), playerId: null };
  const system = Object.create(masslineSnares);
  system.init({ state, bus: immediateBus(), helpers: {}, registry: null });

  assert.equal(state.player.remoteMassline, undefined,
    'ordinary flight and its save/hash surface do not gain unused snare state');
  system.destroy();
});

test('one press deploys one physical remote line and only a real hostile crossing is caught', () => {
  const h = createHarness();
  const preview = publishThenDeploy(h);
  assert.equal(h.spawned.length, 3, 'two endpoints plus one AI hazard sentinel are the bounded deployment');
  const sentinel = h.spawned.find((entity) => entity.type === 'masslineSnare');
  assert.equal(sentinel._noMesh, true, 'the AI-only center contact never produces a fallback world mesh');
  assert.equal(sentinel.collisionMask, 0, 'the AI contact cannot resolve as a hidden physics body');
  assert.equal(h.state.player.remoteMassline.phase, 'deploying');
  assert.deepEqual(preview.source, { x: 100, z: 80 });
  assert.deepEqual(preview.target, { x: 100, z: -80 });

  stepToArmed(h);
  const before = motionSnapshot(h.player, h.victim);
  h.system.update(DT, h.state);

  assert.equal(h.attachments.rebindCalls.length, 1, 'the crossing retopologizes the existing line once');
  assert.equal(h.state.player.remoteMassline.phase, 'caught');
  assert.equal(h.state.player.remoteMassline.caughtId, h.victim.id);
  assert.equal(h.state.player.remoteMassline.targetId, h.victim.id);
  assert.deepEqual(motionSnapshot(h.player, h.victim), before,
    'snare targeting never writes position, velocity, facing, thrust, speed, or braking');
  assert.equal(h.attachments.activeCount(), 1, 'catch reuses one attachment rather than stacking lines');
});

test('slow, along-line, friendly, neutral, and station contacts pass through', () => {
  const cases = [
    { victim: { vel: { x: 12, z: 0 } } },
    { victim: { vel: { x: 0, z: 80 } } },
    { victim: { team: 0 } },
    { victim: { team: 2, data: {} } },
    { victim: { type: 'station', team: 1 } },
  ];
  for (const options of cases) {
    const h = createHarness(options);
    publishThenDeploy(h);
    stepToArmed(h);
    h.system.update(DT, h.state);
    assert.equal(h.attachments.rebindCalls.length, 0,
      'the snare is not a proximity slow, friendly trap, or arbitrary station cutter');
    assert.equal(h.state.player.remoteMassline.phase, 'armed');
  }
});

test('non-colliding payloads use the bounded payload index and can be physically caught', () => {
  const h = createHarness({ noSpatialVictim: true });
  const payload = makeBody({
    id: 9,
    type: 'payload',
    team: 0,
    collides: false,
    pos: { x: 100.5, z: 0 },
    vel: { x: 60, z: 0 },
    radius: 3,
  });
  h.state.entities.set(payload.id, payload);
  h.state.entityList.push(payload);
  h.state.entityIndex.payloads.push(payload);
  publishThenDeploy(h);
  stepToArmed(h);
  h.system.update(DT, h.state);

  assert.equal(h.spatialQueries, 1, 'craft admission remains one local spatial query');
  assert.equal(h.attachments.rebindCalls.length, 1);
  assert.equal(h.attachments.rebindCalls[0].spec.targetId, payload.id);
});

test('second press cuts immediately, cleans endpoints, and never kills a caught body', () => {
  const h = createHarness();
  publishThenDeploy(h);
  stepToArmed(h);
  h.system.update(DT, h.state);
  const caughtVictim = h.victim;
  const anchorIds = h.spawned.filter((entity) => entity.type === 'masslineSnareAnchor').map((entity) => entity.id);

  h.system.handleInput({ state: h.state, player: h.player, masslineCommand: { cut: true } });

  assert.equal(h.attachments.cutCalls.length, 1);
  assert.equal(h.state.player.remoteMassline.active, false);
  assert.equal(caughtVictim.alive, true, 'cleanup owns anchors, never the world body caught by rebind');
  for (const id of anchorIds) assert.equal(h.state.entities.get(id).alive, false);
});

test('HUD exposes preview geometry and non-reel remote status with non-color language', () => {
  assert.match(MASSLINE_HUD_CSS, /ml2-snare-preview/);
  assert.deepEqual(
    masslineTetherStatus({
      active: true,
      kind: 'transverse_snare',
      headId: 'transverse_snare',
      phase: 'armed',
      strain: 0,
      load: 0,
      automaticBreakAllowed: true,
    }),
    { text: 'TRANSVERSE SNARE · ARMED', warn: false },
  );
});

function publishThenDeploy(h) {
  h.system.handleInput({ state: h.state, player: h.player, wantsLatch: false });
  const preview = clonePreview(h.state.player.masslineSnarePreview);
  h.state.tick += 1;
  h.state.simTime += DT;
  h.system.handleInput({ state: h.state, player: h.player, wantsLatch: true, masslineCommand: { latch: true } });
  h.system.update(DT, h.state);
  return preview;
}

function stepToArmed(h) {
  h.state.tick += 1;
  h.state.simTime += DT;
  h.system.update(DT, h.state); // endpoints admitted, attachment created
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
    pos: { x: 100.5, z: 0, ...(victimSpec.pos || {}) },
    vel: { x: 60, z: 0, ...(victimSpec.vel || {}) },
    radius: 4,
    data: victimSpec.data || { ai: { forcePlayerTarget: true } },
  });
  const state = {
    mode: 'flight',
    tick: 100,
    simTime: 5,
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
  let spatialQueries = 0;
  state.spatialHash = {
    diagnostics: { activeBuckets: 1 },
    queryRadius(_x, _z, _radius, out) {
      spatialQueries += 1;
      if (!options.noSpatialVictim) out.push(victim);
      return out;
    },
  };
  const attachments = fakeAttachments(state);
  const registry = { get(id) { return id === 'combat' ? { kernel: { attachments } } : null; } };
  const system = Object.create(masslineSnares);
  system.init({ state, bus, helpers, registry });
  return {
    state, bus, helpers, attachments, system, spawned, player, victim,
    get spatialQueries() { return spatialQueries; },
  };
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

function motionSnapshot(...entities) {
  return entities.map((entity) => ({
    id: entity.id,
    pos: { x: entity.pos.x, z: entity.pos.z },
    vel: { x: entity.vel.x, z: entity.vel.z },
    rot: entity.rot,
    thrust: entity.thrust,
    maxSpeed: entity.maxSpeed,
  }));
}

function clonePreview(preview) {
  return {
    source: { ...preview.source },
    target: { ...preview.target },
    center: { ...preview.center },
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
