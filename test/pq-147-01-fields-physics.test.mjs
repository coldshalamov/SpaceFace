// PQ-147.01 — Fields participate in physics for everyone.
// A well bends ≥ 5 bodies. One ordinary-traffic role (scrap sweeper) deploys a cone.
// Fields bend motion; they are never HP auras. Volumes stay cone/ring/sheet.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields, activeFieldSnapshot } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS, FIELD_VOLUMES, fieldVolumeOf, fittingSentence, POWER_ROSTER } from '../src/data/fields.js';
import {
  NPC_FIELD_ROLES,
  npcFieldRole,
  planNpcFieldDeploy,
} from '../src/ai/npcFieldDeploy.js';

const SEED = 14701;
const BEND_SPEED = 4;
const BEND_TICKS = 40;

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

function trafficSweeper(sim, x, z) {
  return sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_free',
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius: 12, collides: true,
    hull: 70, hullMax: 70, flightModel: { inertia: 36 },
    physicsBody: { schemaVersion: 1, radius: 12, mass: 18, inertiaY: 36, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: {
      trafficRole: 'sweeper',
      role: 'sweeper',
      trafficLabel: 'Scrap Sweeper',
      ai: { archetype: 'fleeing_trader', passive: true },
    },
  });
}

test('fitting-screen sentences for the five powers stay authored data', () => {
  for (const row of POWER_ROSTER) {
    const sentence = fittingSentence(row.id);
    assert.ok(sentence && sentence.length >= 24, `${row.id} needs a fitting sentence`);
    assert.notEqual(fieldVolumeOf(row), 'sphere');
    assert.ok(
      row.volume === FIELD_VOLUMES.RING
      || row.volume === FIELD_VOLUMES.CONE
      || row.volume === FIELD_VOLUMES.SHEET,
      `${row.id} volume must be ring/cone/sheet`,
    );
  }
});

test('ordinary-traffic sweeper and salvor plan a cone; anchors do not double-deploy', () => {
  const wreck = { id: 9, type: 'wreck', alive: true, pos: { x: 40, z: 0 }, data: { majorDebris: true } };
  const sweeper = {
    id: 8, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { trafficRole: 'sweeper', role: 'sweeper', ai: { archetype: 'fleeing_trader' } },
  };
  const salvor = {
    id: 11, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { trafficRole: 'salvor', role: 'salvor' },
  };
  const state = { entities: new Map([[8, sweeper], [9, wreck], [11, salvor]]), entityList: [sweeper, salvor, wreck] };
  assert.equal(npcFieldRole(sweeper), NPC_FIELD_ROLES.SCAVENGER_CONE);
  const plan = planNpcFieldDeploy(sweeper, state);
  assert.equal(plan.action, 'on');
  assert.equal(plan.kind, 'cone');
  assert.equal(npcFieldRole(salvor), NPC_FIELD_ROLES.SCAVENGER_CONE);
  assert.equal(planNpcFieldDeploy(salvor, state).action, 'on');
  const anchor = {
    id: 3, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { lootTableId: 'field_anchor_controller', fieldAnchor: { defKey: 'anchorSnare' } },
  };
  assert.equal(npcFieldRole(anchor), NPC_FIELD_ROLES.ANCHOR_WELL);
  assert.equal(planNpcFieldDeploy(anchor, state), null, 'spawn-time fieldAnchor already owns the well');
});

test('a well on seed 14701 bends ≥ 5 bodies without cutting hull', async () => {
  await withFlag(true, async () => {
    const t = await bootPhysics(SEED);
    const well = { x: 200, z: 0 };
    const labeled = [
      { name: 'cargo-a', body: cargoPod(t.sim, 200, 45) },
      { name: 'cargo-b', body: cargoPod(t.sim, 200, -45) },
      { name: 'debris', body: debris(t.sim, 155, 0) },
      { name: 'wreck', body: wreckHull(t.sim, 245, 10) },
      { name: 'npc-hull', body: npcHull(t.sim, 210, 70) },
    ];
    const start = labeled.map(({ body }) => ({
      x: body.pos.x,
      z: body.pos.z,
      hull: body.hull,
    }));
    t.state.input.aimWorld = well;
    t.state.input.actions.deployWell = true;
    t.sim.step();
    for (let i = 0; i < BEND_TICKS; i++) t.sim.step();
    const rows = labeled.map((row, i) => {
      const moved = Math.hypot(row.body.pos.x - start[i].x, row.body.pos.z - start[i].z);
      const spd = speed(row.body);
      return {
        name: row.name,
        speed: spd,
        travel: moved,
        bent: spd >= BEND_SPEED || moved >= 6,
        hull: row.body.hull,
      };
    });
    const bent = rows.filter((row) => row.bent);
    const line = rows.map((row) => (
      `${row.name}: ${row.speed.toFixed(1)} WU/s, ${row.travel.toFixed(1)} WU`
    )).join(' | ');
    console.log(`PQ-147.01 well seed ${SEED} / ${BEND_TICKS} ticks: bent ${bent.length}/5 — ${line}`);
    console.log(`PQ-147.01 telemetry.affected=${t.state.fields.telemetry.affected}`);
    assert.ok(
      bent.length >= 5,
      `Drop a ring that pulls loose mass into one pile; expected ≥5 bodies to drift, got ${bent.length} (${line})`,
    );
    assert.equal(labeled[0].body.collides, false, 'jettisoned cargo stays non-colliding and still obeys the well');
    assert.ok(t.state.fields.telemetry.affected >= 5, `telemetry.affected ${t.state.fields.telemetry.affected} ≥ 5`);
    for (let i = 0; i < labeled.length; i++) {
      if (start[i].hull != null) {
        assert.equal(labeled[i].body.hull, start[i].hull, `${labeled[i].name} hull must not drop — fields are not HP auras`);
      }
    }
    t.cleanup();
  });
});

test('a scrap sweeper in ordinary traffic deploys a cone, not a sphere', () => {
  withFlag(true, () => {
    const t = boot(14711);
    const sweeper = trafficSweeper(t.sim, 80, 0);
    debris(t.sim, 140, 0);
    cargoPod(t.sim, 160, 8);
    for (let i = 0; i < 8; i++) t.sim.step();
    const snap = activeFieldSnapshot(t.state);
    const cone = snap.find((f) => f.sourceId === sweeper.id && f.kind === 'cone');
    assert.ok(cone, 'scrap sweeper near wrecks/cargo deploys a clearing cone');
    assert.equal(cone.tag, 'npc');
    assert.equal(fieldVolumeOf(cone), FIELD_VOLUMES.CONE);
    assert.notEqual(cone.volume, 'sphere');
    const deployed = t.events.find((e) => e.name === 'fields:deployed' && e.p.npc === true && e.p.kind === 'cone'
      && e.p.sourceId === sweeper.id);
    assert.ok(deployed, 'ordinary-traffic deploy is a real fields:deployed event');
    assert.equal(deployed.p.role, 'sweeper');
    assert.ok(t.state.fields.npcFields[sweeper.id], 'runtime tracks the NPC cone');
    console.log(`PQ-147.01 NPC deploy role=${deployed.p.role} volume=${fieldVolumeOf(cone)} tag=${cone.tag}`);
  });
});
