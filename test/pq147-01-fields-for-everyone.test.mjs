// PQ-147.01 — Fields participate in physics for everyone.
// A well bends ≥ 5 bodies (cargo / debris / wrecks / NPC hulls). A scavenger in ordinary
// traffic deploys a cone. Volumes stay cone/ring/sheet — never a sphere, never a damage aura.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields, activeFieldSnapshot } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS, FIELD_VOLUMES, fieldVolumeOf } from '../src/data/fields.js';
import {
  NPC_FIELD_ROLES,
  npcFieldRole,
  planNpcFieldDeploy,
} from '../src/ai/npcFieldDeploy.js';

const SEED = 14701;
const BEND_SPEED = 4; // WU/s — a visible drift, not a twitch
const BEND_TICKS = 40; // 0.67 s

function withFlag(on, fn) {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = on;
  let result;
  try {
    result = fn();
  } catch (err) {
    FIELD_FLAGS.enabled = prev;
    throw err;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => { FIELD_FLAGS.enabled = prev; });
  }
  FIELD_FLAGS.enabled = prev;
  return result;
}

function boot(seed = SEED, { withPhysics = false } = {}) {
  const sim = createSimulation({
    seed,
    bus: createBus(),
    systems: withPhysics ? [fields, physics] : [fields],
  });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  const events = [];
  sim.bus.on('fields:deployed', (p) => events.push({ name: 'fields:deployed', p, tick: state.tick }));
  return { sim, state, player, events, fieldsSys: sim.registry.get('fields'), physicsSys: sim.registry.get('physics') };
}

async function bootPhysics(seed = SEED) {
  const t = boot(seed, { withPhysics: true });
  t.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await t.physicsSys.prepareBackend(t.state), true, 'rapier-dynamic should initialize headless');
  t.cleanup = () => {
    if (typeof t.physicsSys._disableSg02DynamicAuthority === 'function') {
      t.physicsSys._disableSg02DynamicAuthority();
    }
  };
  return t;
}

function speed(e) {
  return Math.hypot(e.vel.x, e.vel.z);
}

function cargoPod(sim, x, z, mass = 0.4) {
  return sim.spawn({
    type: 'pickup', team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 3,
    collides: false,
    physicsBody: { schemaVersion: 1, radius: 3, mass, inertiaY: 1, dynamic: true, ccd: false, material: 'sensor', revision: 0 },
    data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 2, jettisonedCargo: true },
  });
}

function debris(sim, x, z, mass = 2) {
  return sim.spawn({
    type: 'wreck', team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 4, collides: true,
    physicsBody: { schemaVersion: 1, radius: 4, mass, inertiaY: 4, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: { majorDebris: true, parentType: 'debris' },
  });
}

function wreckHull(sim, x, z, mass = 3) {
  return sim.spawn({
    type: 'wreck', team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 6, collides: true,
    physicsBody: { schemaVersion: 1, radius: 6, mass, inertiaY: 8, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: { parentType: 'freighter', salvagePool: { cmdty_scrap_metal: 2 } },
  });
}

function npcHull(sim, x, z, mass = 16) {
  return sim.spawn({
    type: 'ship', team: 1, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 10, collides: true,
    hull: 80, hullMax: 80, flightModel: { inertia: 40 },
    physicsBody: { schemaVersion: 1, radius: 10, mass, inertiaY: 40, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { ai: { doctrine: 'balanced', passive: true }, combatProfileId: 'combat_profile_standard_ship' },
  });
}

function scavenger(sim, x, z) {
  return sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_reach',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 12, collides: true,
    hull: 70, hullMax: 70, flightModel: { inertia: 36 },
    physicsBody: { schemaVersion: 1, radius: 12, mass: 18, inertiaY: 36, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: {
      ai: { doctrine: 'scavenger', role: 'scavenger', passive: false },
      lootTableId: 'wasp_swarmer',
      role: 'scavenger',
    },
  });
}

test('scavenger role plans a cone; anchor specialists do not double-deploy a well', () => {
  const scav = {
    id: 8, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { ai: { doctrine: 'scavenger' }, role: 'scavenger' },
  };
  const wreck = { id: 9, type: 'wreck', alive: true, pos: { x: 40, z: 0 }, data: { majorDebris: true } };
  const state = { entities: new Map([[8, scav], [9, wreck]]), entityList: [scav, wreck] };
  assert.equal(npcFieldRole(scav), NPC_FIELD_ROLES.SCAVENGER_CONE);
  const plan = planNpcFieldDeploy(scav, state);
  assert.equal(plan.action, 'on');
  assert.equal(plan.kind, 'cone');
  const anchor = {
    id: 3, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { lootTableId: 'field_anchor_controller', fieldAnchor: { defKey: 'anchorSnare' } },
  };
  assert.equal(npcFieldRole(anchor), NPC_FIELD_ROLES.ANCHOR_WELL);
  assert.equal(planNpcFieldDeploy(anchor, state), null, 'spawn-time fieldAnchor already owns the well');
});

test('a well bends ≥ 5 bodies: cargo, debris, wrecks and an NPC hull', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics(SEED);
    const well = { x: 200, z: 0 };
    const bodies = [
      cargoPod(t.sim, 200, 45),
      cargoPod(t.sim, 200, -45),
      debris(t.sim, 155, 0),
      wreckHull(t.sim, 245, 10),
      npcHull(t.sim, 210, 70),
    ];
    const start = bodies.map((e) => ({ x: e.pos.x, z: e.pos.z }));
    t.state.input.aimWorld = well;
    t.state.input.actions.deployWell = true;
    t.sim.step();
    for (let i = 0; i < BEND_TICKS; i++) t.sim.step();
    const bent = bodies.filter((e, i) => {
      const moved = Math.hypot(e.pos.x - start[i].x, e.pos.z - start[i].z);
      return speed(e) >= BEND_SPEED || moved >= 6;
    });
    assert.ok(
      bent.length >= 5,
      `Drop a ring that pulls loose mass into one pile; expected ≥5 bodies to drift, got ${bent.length} `
      + `(speeds ${bodies.map((e) => speed(e).toFixed(1)).join(', ')} WU/s)`,
    );
    assert.equal(bodies[0].collides, false, 'jettisoned cargo stays non-colliding and still obeys the well');
    assert.ok(t.state.fields.telemetry.affected >= 5, `telemetry.affected ${t.state.fields.telemetry.affected} ≥ 5`);
    t.cleanup();
  });
});

test('a scavenger in ordinary traffic deploys a cone, not a sphere', () => {
  withFlag(true, () => {
    const t = boot(14711);
    const scav = scavenger(t.sim, 80, 0);
    debris(t.sim, 140, 0);
    cargoPod(t.sim, 160, 8);
    for (let i = 0; i < 8; i++) t.sim.step();
    const snap = activeFieldSnapshot(t.state);
    const cone = snap.find((f) => f.sourceId === scav.id && f.kind === 'cone');
    assert.ok(cone, 'scavenger near wrecks/cargo deploys a clearing cone');
    assert.equal(cone.tag, 'npc');
    assert.equal(fieldVolumeOf(cone), FIELD_VOLUMES.CONE);
    assert.notEqual(cone.volume, 'sphere');
    assert.ok(t.events.some((e) => e.name === 'fields:deployed' && e.p.npc === true && e.p.kind === 'cone'
      && e.p.sourceId === scav.id), 'ordinary-traffic deploy is a real fields:deployed event');
    assert.ok(t.state.fields.npcFields[scav.id], 'runtime tracks the NPC cone');
  });
});
