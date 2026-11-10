// SFQ-I063 — an excluded material slipping through a selective plane or boundary
// leaves a shape on the field and takes no shove from it. Bloom is off on purpose:
// the read is the ring and the puff, not a glow.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { fields } from '../src/systems/fields.js';
import { vfx } from '../src/render/vfx.js';

const DT = 1 / 60;
const SEED = 4242;

function rngOf(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function body(id, extra = {}) {
  const mass = extra.mass || 12;
  return {
    id,
    type: extra.type || 'ship',
    alive: true,
    pos: { x: extra.x ?? 12, z: extra.z ?? 0 },
    vel: { x: extra.vx ?? 16, z: extra.vz ?? 0 },
    rot: 0,
    angVel: 0,
    radius: extra.radius || 6,
    mass,
    hull: 40,
    hullMax: 40,
    flags: {},
    materialCategory: extra.materialCategory,
    data: extra.data || {},
    physicsBody: {
      schemaVersion: 1,
      radius: extra.radius || 6,
      mass,
      dynamic: true,
      material: 'ship',
    },
  };
}

function boot(entities, coatedId = null) {
  const list = Array.isArray(entities) ? entities : [entities];
  const combat = { entities: {} };
  if (coatedId != null) {
    combat.entities[String(coatedId)] = {
      statuses: { status_goo: { stacks: 2, expiresTick: 500 } },
    };
  }
  const state = {
    tick: 20,
    simTime: 20 * DT,
    mode: 'flight',
    playerId: 1,
    rng: rngOf(SEED),
    entities: new Map(list.map((e) => [e.id, e])),
    entityList: list,
    input: { actions: {} },
    combat,
    settings: { video: { bloom: false, bloomStrength: 0, particleQuality: 'low' } },
    render: { scene: new THREE.Scene(), bloom: null },
  };
  const cues = [];
  const bus = createBus();
  bus.on('presentation:vfxCue', (payload) => {
    if (payload && payload.id === 'inertFieldPass') cues.push(payload);
  });
  fields.init({
    state,
    bus,
    helpers: {},
    registry: { get: () => null },
  });
  return { state, bus, cues };
}

function pass(state) {
  return fields._applyForces(DT, state, state.fields);
}

test('a mineral crossing a selective plane takes no force and stamps one inert pass', () => {
  const mineral = body(11, { materialCategory: 'mineral' });
  const { state, cues } = boot(mineral);
  fields.registerExternal({
    id: 'selective-plane',
    kind: 'plane',
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: 80,
    damping: 4,
    strength: 0,
    frame: { x: 0, z: 0 },
    filters: { types: ['ship', 'drone'] },
    durationS: Infinity,
    createdAt: 0,
  });
  const first = pass(state);
  const command = consumePhysicsCommand(mineral);
  assert.equal(first.affected, 0);
  assert.equal(command, null, 'the plane records no impulse on an excluded mineral');
  assert.equal(cues.length, 1);
  assert.equal(cues[0].id, 'inertFieldPass');
  assert.equal(cues[0].lights, 0);
  assert.equal(cues[0].shape, 'ring');
  assert.ok(cues[0].position && Number.isFinite(cues[0].position.x));
  state.tick += 1;
  state.simTime += DT;
  pass(state);
  assert.equal(cues.length, 1, 'a body still inside does not stamp a second pass');
  assert.equal(state.fields.inertFieldPass.length, 1);

  mineral.pos.x = 400;
  state.tick += 1;
  state.simTime += DT;
  pass(state);
  mineral.pos.x = 12;
  state.tick += 1;
  state.simTime += DT;
  pass(state);
  assert.equal(cues.length, 2, 'leaving and crossing again stamps one new pass');
});

test('a coated composite slips a boundary, and a plain coated hull still sticks', () => {
  const composite = body(21, { materialCategory: 'precursor_composite', vx: 10, vz: 4 });
  const hull = body(22, { x: 18, vx: 10, vz: 4 });
  const { state, cues } = boot([composite, hull], null);
  state.combat.entities['21'] = { statuses: { status_goo: { stacks: 2, expiresTick: 500 } } };
  state.combat.entities['22'] = { statuses: { status_goo: { stacks: 2, expiresTick: 500 } } };
  fields.registerExternal({
    id: 'selective-boundary',
    kind: 'boundary',
    center: { x: 0, z: 0 },
    radius: 80,
    strength: 14,
    damping: 2,
    durationS: Infinity,
    createdAt: 0,
  });
  pass(state);
  assert.equal(consumePhysicsCommand(composite), null);
  const stuck = consumePhysicsCommand(hull);
  assert.ok(stuck && stuck.impulses.length === 1);
  assert.ok(Math.hypot(stuck.impulses[0].x, stuck.impulses[0].z) > 0.2);
  assert.equal(cues.filter((cue) => cue.id === 'inertFieldPass').length, 1);
});

test('a route token slips the plane, and a far rock or a fuel pod stays quiet', () => {
  const token = body(31, {
    type: 'payload',
    materialCategory: undefined,
    data: { machineToken: { tokenId: 'machine-token:site' } },
  });
  const rock = body(32, { type: 'asteroid', x: 500, materialCategory: undefined, data: {} });
  const quiet = body(34, { type: 'pickup', x: 10, data: { commodityId: 'cmdty_fuel_cells' } });
  const { state, cues } = boot([token, rock, quiet]);
  fields.registerExternal({
    id: 'selective-plane-b',
    kind: 'plane',
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: 80,
    damping: 4,
    strength: 0,
    filters: { types: ['ship', 'drone'] },
    durationS: Infinity,
    createdAt: 0,
  });
  pass(state);
  assert.equal(consumePhysicsCommand(token), null);
  assert.equal(consumePhysicsCommand(rock), null);
  assert.equal(consumePhysicsCommand(quiet), null);
  assert.equal(cues.length, 1, 'only the token crossing the plane stamps a pass');
  assert.equal(cues[0].position.x, token.pos.x);
});

test('a well still pulls ore that the plane lets through, and the pull does not grow', () => {
  function oreBody() {
    return body(33, { materialCategory: 'mineral', x: 30 });
  }
  const alone = oreBody();
  const wellOnly = boot(alone);
  fields.registerExternal({
    id: 'plain-well',
    kind: 'well',
    center: { x: 0, z: 0 },
    radius: 200,
    strength: 220,
    damping: 0,
    falloff: 1,
    durationS: Infinity,
    createdAt: 0,
  });
  pass(wellOnly.state);
  const wellImpulse = consumePhysicsCommand(alone);
  assert.ok(wellImpulse && wellImpulse.impulses.length === 1);
  const wellMag = Math.hypot(wellImpulse.impulses[0].x, wellImpulse.impulses[0].z);
  assert.equal(wellOnly.cues.length, 0, 'a well is not a selective plane');

  const ore = oreBody();
  const both = boot(ore);
  fields.registerExternal({
    id: 'plain-well',
    kind: 'well',
    center: { x: 0, z: 0 },
    radius: 200,
    strength: 220,
    damping: 0,
    falloff: 1,
    durationS: Infinity,
    createdAt: 0,
  });
  fields.registerExternal({
    id: 'selective-plane-c',
    kind: 'plane',
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: 80,
    damping: 4,
    strength: 0,
    filters: { types: ['ship', 'drone'] },
    durationS: Infinity,
    createdAt: 0,
  });
  pass(both.state);
  const mixed = consumePhysicsCommand(ore);
  assert.ok(mixed && mixed.impulses.length === 1);
  const mixedMag = Math.hypot(mixed.impulses[0].x, mixed.impulses[0].z);
  assert.ok(Math.abs(mixedMag - wellMag) < 1e-6, 'the plane adds no force on top of the well');
  assert.equal(both.cues.length, 1);
});

test('the pass draws a growing ring and a puff with bloom disabled and no light', () => {
  const mineral = body(41, { materialCategory: 'mineral' });
  const { state, bus } = boot(mineral);
  fields.registerExternal({
    id: 'selective-plane-draw',
    kind: 'plane',
    center: { x: 0, z: 0 },
    dir: { x: 1, z: 0 },
    radius: 80,
    damping: 4,
    strength: 0,
    filters: { types: ['ship', 'drone'] },
    durationS: Infinity,
    createdAt: 0,
  });
  vfx.init({ state, bus, helpers: {} });
  try {
    assert.equal(state.settings.video.bloom, false);
    assert.equal(state.settings.video.bloomStrength, 0);
    pass(state);
    const alive = (vfx._spr || []).filter((sprite) => sprite && sprite.alive);
    const ring = alive.find((sprite) => sprite.kind === 1 && sprite.size1 > sprite.size0 && sprite.op0 >= 0.5);
    const puff = alive.find((sprite) => sprite.kind === 2 && sprite.op0 > 0);
    assert.ok(ring, 'a ripple ring is in the color buffer with bloom off');
    assert.ok(puff, 'a deflection puff is in the color buffer with bloom off');
    const lights = vfx._lights || [];
    assert.equal(lights.some((slot) => slot && slot.active), false);
    assert.equal(vfx._lastInertFieldPass && vfx._lastInertFieldPass.bloomIndependent, true);
    assert.equal(vfx._lastInertFieldPass.lights, 0);
  } finally {
    vfx.destroy();
  }
});
