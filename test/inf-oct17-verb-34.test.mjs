// VERB-34 — an impulse charge thrown at the body you are towing sticks to it.
// Detonating that plate throws the body through the impulse authority and lets the line go.
// Seed 4242. A wreck is the tow: plates already stick to ships, drones and rocks, and a
// wreck is what the line actually hauls. The miss cases must stay quiet.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { mulberry32 } from '../src/core/rng.js';
import { createAttachmentService } from '../src/combat/attachments.js';
import { createCombatCatalog, ensureCombatState } from '../src/combat/runtime.js';
import { impulseCharges } from '../src/systems/impulseCharges.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';

const DT = 1 / 60;
const SEED = 4242;

function ship() {
  return {
    id: 1,
    type: 'ship',
    team: 0,
    alive: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 8,
    mass: 32,
    flags: {},
    data: {},
  };
}

function wreck() {
  return {
    id: 42,
    type: 'wreck',
    alive: true,
    pos: { x: 36, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 12,
    mass: 40,
    collides: true,
    team: null,
    data: {},
    flags: {},
  };
}

function makeSpatialHash(entityList) {
  return {
    diagnostics: { activeBuckets: 1 },
    queryRadius(x, z, radius, out) {
      for (const entity of entityList) {
        if (!entity || !entity.pos || entity.alive === false) continue;
        const distance = Math.hypot(entity.pos.x - x, entity.pos.z - z);
        if (distance <= radius + (entity.radius || 0)) out.push(entity);
      }
    },
  };
}

function open(bodies) {
  const player = ship();
  const entityList = [player, ...bodies];
  const entities = new Map(entityList.map((entity) => [entity.id, entity]));
  const impulses = [];
  const events = { latched: [], released: [], stuck: [], toasts: [] };
  let nextId = 900;
  const state = {
    mode: 'flight',
    seed: SEED,
    rng: mulberry32(SEED),
    simTime: 1,
    tick: 60,
    playerId: player.id,
    player: {
      heat: 0,
      targetId: null,
      tether: {
        active: false, targetId: null, strain: 0, load: 0,
        attachmentId: null, restLength: 0, phase: 'slack',
      },
      cargo: {
        items: { cmdty_impulse_charge: 3 },
        usedVolume: 6,
        usedMass: 6,
        capVolume: 40,
        capMass: 80,
      },
    },
    entities,
    entityList,
    spatialHash: makeSpatialHash(entityList),
    input: {
      aimWorld: { x: 36, z: 0 },
      aimAngle: 0,
      moveZ: 0,
      brake: false,
      actions: {
        tetherFire: false,
        tetherCut: false,
        reelDelta: 0,
        chargeThrow: false,
        chargeDetonate: false,
      },
    },
    ui: { screenStack: [] },
    combat: null,
  };
  ensureCombatState(state);

  const bus = createBus();
  bus.on('tether:latched', (payload) => events.latched.push(payload));
  bus.on('tether:released', (payload) => events.released.push(payload));
  bus.on('charge:stuck', (payload) => events.stuck.push(payload));
  bus.on('toast', (payload) => events.toasts.push(payload));

  const catalog = createCombatCatalog();
  const helpers = {
    combatPhysics: {
      createAttachment(input) {
        return { id: input.attachmentId, attachmentId: input.attachmentId, ownerId: input.ownerId, targetId: input.targetId };
      },
      cutAttachment() { return true; },
      setAttachmentReel() { return true; },
      getAttachmentTelemetry() { return null; },
      applyImpulse(request) {
        impulses.push(request);
        return true;
      },
    },
    spawnEntity(spec) {
      const spawned = {
        ...spec,
        id: nextId,
        alive: true,
        prevPos: { x: spec.pos.x, z: spec.pos.z },
        prevRot: spec.rot || 0,
        vel: spec.vel || { x: 0, z: 0 },
        data: spec.data || {},
      };
      nextId += 1;
      entityList.push(spawned);
      entities.set(spawned.id, spawned);
      return spawned;
    },
  };
  const attachments = createAttachmentService({ state, catalog, helpers, bus });
  const kernel = { attachments, catalog: { attachments: catalog.attachments } };
  const registry = {
    get(name) {
      if (name === 'actions' || name === 'combat') return { kernel };
      return null;
    },
  };

  const charges = Object.assign({}, impulseCharges);
  const tether = Object.assign({}, tetherGameplay);
  charges.init({ state, bus, helpers, registry });
  tether.init({ state, bus, helpers, registry });

  return { state, player, bus, events, impulses, charges, tether, attachments, wreck: bodies[0] };
}

function step(h, actions) {
  if (actions) Object.assign(h.state.input.actions, actions);
  h.charges.update(DT, h.state);
  h.tether.update(DT, h.state);
  h.state.tick += 1;
  h.state.simTime += DT;
}

function latch(h) {
  step(h, { tetherFire: true });
  for (let i = 0; i < 5 && !h.state.player.tether.active; i += 1) step(h);
  assert.equal(h.events.latched.length, 1, `tow did not catch: ${JSON.stringify(h.events.toasts)}`);
  assert.equal(h.state.player.tether.active, true);
  assert.equal(h.state.player.tether.targetId, h.wreck.id);
}

function throwAt(h, aim) {
  h.state.input.aimWorld = { x: aim.x, z: aim.z };
  h.state.input.aimAngle = Math.atan2(aim.z - h.player.pos.z, aim.x - h.player.pos.x);
  const before = h.state.player.cargo.items.cmdty_impulse_charge;
  step(h, { chargeThrow: true });
  assert.equal(h.state.player.cargo.items.cmdty_impulse_charge, before - 1, 'the throw spends one charge');
}

function liveCharges(h) {
  return h.state.entityList.filter((entity) => entity && entity.type === 'charge' && entity.alive !== false);
}

test('seed 4242: a charge thrown at the wreck you are towing sticks, then detonation throws it and lets the line go', () => {
  const h = open([wreck()]);
  assert.equal(h.state.seed, SEED);
  latch(h);
  throwAt(h, h.wreck.pos);
  let stuck = null;
  for (let i = 0; i < 40; i += 1) {
    step(h);
    stuck = liveCharges(h).find((charge) => charge.data && charge.data.hostId === h.wreck.id) || null;
    if (stuck) break;
  }
  assert.ok(stuck, 'the dart attaches to the latched body');
  assert.equal(stuck.data.hostId, h.wreck.id, 'the dart attaches to the latched body');
  assert.equal(stuck.data.armed, true);
  h.impulses.length = 0;
  h.events.released.length = 0;
  step(h, { chargeDetonate: true });
  const kick = h.impulses.find((row) => row.entityId === h.wreck.id);
  assert.ok(kick, 'detonation throws the latched body');
  assert.equal(kick.provenance && kick.provenance.tag, 'impulse_charge_blast');
  assert.ok(kick.impulse.x > 0, 'the throw travels out along the line');
  assert.ok(Math.abs(kick.impulse.z) < 1e-6);
  assert.equal(stuck.alive, false);
  assert.equal(h.state.player.tether.active, false, 'detonation releases the line');
  assert.equal(h.state.player.tether.targetId, null);
  assert.equal(h.events.released.at(-1) && h.events.released.at(-1).targetId, h.wreck.id);
});

test('a charge thrown at a wreck you are not towing does not stick', () => {
  const h = open([wreck()]);
  throwAt(h, h.wreck.pos);
  for (let i = 0; i < 40; i += 1) step(h);
  const stuck = liveCharges(h).find((charge) => charge.data && charge.data.hostId != null);
  assert.equal(stuck, undefined, 'a loose wreck is not a plate surface');
  assert.equal(h.events.stuck.length, 0);
  assert.equal(h.state.player.tether.active, false);
});

test('detonating a plate on some other body does not drop the tow line', () => {
  const h = open([wreck()]);
  latch(h);
  const rock = {
    id: 77,
    type: 'asteroid',
    alive: true,
    pos: { x: -80, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 16,
    mass: 200,
    collides: true,
    data: {},
    flags: {},
  };
  h.state.entityList.push(rock);
  h.state.entities.set(rock.id, rock);
  throwAt(h, rock.pos);
  let stuck = null;
  for (let i = 0; i < 60; i += 1) {
    step(h);
    stuck = liveCharges(h).find((charge) => charge.data && charge.data.hostId === rock.id) || null;
    if (stuck) break;
  }
  assert.ok(stuck, 'a plate still sticks to a rock it actually hits');
  h.events.released.length = 0;
  h.impulses.length = 0;
  step(h, { chargeDetonate: true });
  const kick = h.impulses.find((row) => row.entityId === rock.id);
  assert.ok(kick, 'the rock takes the blast');
  assert.equal(h.state.player.tether.active, true, 'the tow line stays up');
  assert.equal(h.state.player.tether.targetId, h.wreck.id);
  assert.equal(h.events.released.length, 0);
});
