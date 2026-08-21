import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { SIM_TIER } from '../src/world/activityClassification.js';
import { shouldOwnerThink } from '../src/core/activityScheduler.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { spatialHashLayersFromState } from '../src/core/physics.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  entityNeedsPhysics,
} from '../src/world/activityRuntime.js';
import { getActivityFrame } from '../src/core/worldActivityManager.js';

function makeState(entities, extras = {}) {
  const list = entities.slice();
  const map = new Map();
  for (const entity of list) map.set(entity.id, entity);
  return {
    tick: extras.tick == null ? 10 : extras.tick,
    simTime: extras.simTime == null ? 10 : extras.simTime,
    playerId: extras.playerId == null ? 1 : extras.playerId,
    mode: 'flight',
    camera: { zoom: 144 },
    settings: { video: { fov: 50 } },
    entities: map,
    entityList: list,
    player: extras.player || {},
    combat: extras.combat || {},
    ...extras,
  };
}

function ship(id, x, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    pos: { x, z: 0 },
    vel: { x: extras.vx || 0, z: 0 },
    rot: 0,
    angVel: 0,
    team: extras.team == null ? 1 : extras.team,
    isPlayer: extras.isPlayer === true,
    data: extras.data || {},
    flags: extras.flags || {},
    ...extras.rest,
  };
}

function rock(id, x, extras = {}) {
  return {
    id,
    type: 'asteroid',
    alive: true,
    collides: true,
    radius: 10,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    data: {
      oreHP: extras.oreHP == null ? 40 : extras.oreHP,
      oreHPMax: extras.oreHPMax == null ? 80 : extras.oreHPMax,
      fieldId: 'field_a',
      activityObjectSlotId: String(id),
      ...(extras.data || {}),
    },
    flags: extras.flags || {},
  };
}

test('far rocks and haulers leave the Rapier set without being deleted', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const nearRock = rock(2, 20);
  const farRock = rock(3, 4000);
  const farHauler = ship(4, 3500, { data: { itinerary: { routeId: 'lane_a' } }, team: 2 });
  const state = makeState([player, nearRock, farRock, farHauler]);
  const runtime = ensureActivityClassified(state);
  assert.equal(player.alive, true);
  assert.equal(farRock.alive, true);
  assert.equal(farHauler.alive, true);
  assert.equal(state.entityList.length, 4);
  assert.equal(player.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(farHauler.activity.simTier, SIM_TIER.S2_ABSTRACT);
  assert.equal(farRock.activity.simTier, SIM_TIER.S3_DORMANT);
  assert.equal(entityNeedsPhysics(farRock), false);
  assert.equal(entityNeedsPhysics(farHauler), false);
  assert.equal(entityNeedsPhysics(player), true);
  assert.equal(entityNeedsAiThink(farHauler), false);
  assert.ok(runtime.physicsDynamics.includes(player));
  assert.equal(runtime.physicsStatics.includes(farRock), false);
  assert.equal(runtime.counts.physics < 4, true);
  assert.equal(Object.keys(player).includes('activity'), false, 'activity stamp is runtime-only');
});

test('off-glass pursuer stays exact and in physics', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const pirate = ship(2, 2500, {
    team: 1,
    data: { combat: { targetId: 1 }, ai: { combatant: true, passive: false } },
  });
  const state = makeState([player, pirate]);
  const runtime = ensureActivityClassified(state);
  assert.equal(pirate.activity.simTier, SIM_TIER.S0_EXACT);
  assert.notEqual(pirate.activity.presentationTier, 'R0_GLASS');
  assert.ok(runtime.physicsDynamics.includes(pirate));
  assert.equal(entityNeedsAiThink(pirate), true);
});

test('tethered payload stays exact after leaving the glass', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const chunk = rock(9, 3000, { flags: { tethered: true } });
  const state = makeState([player, chunk], {
    combat: { attachments: { byId: { t1: { ownerId: 1, targetId: 9, state: 'active' } } } },
  });
  ensureActivityClassified(state);
  assert.equal(chunk.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(entityNeedsPhysics(chunk), true);
});

test('job-pinned far actor stays exact', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const courier = ship(8, 5000, { data: { jobId: 'job_courier_1' } });
  ensureActivityClassified(makeState([player, courier]));
  assert.equal(courier.activity.simTier, SIM_TIER.S0_EXACT);
});

test('mined rock keeps remaining ore after leaving and returning', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const ast = rock(12, 30, { oreHP: 17, oreHPMax: 80 });
  const state = makeState([player, ast], { tick: 1, simTime: 1 });
  ensureActivityClassified(state);
  assert.ok(entityNeedsPhysics(ast));
  ast.pos.x = 5000;
  state.tick = 2;
  state.simTime = 1.2;
  ensureActivityClassified(state);
  ast.pos.x = 5000;
  state.tick = 400;
  state.simTime = 8;
  ensureActivityClassified(state);
  assert.equal(ast.data.oreHP, 17);
  assert.equal(ast.alive, true);
  assert.equal(entityNeedsPhysics(ast), false);
  ast.pos.x = 20;
  ast.vel.x = 12;
  ast.activity.lastExactT = 4;
  ast.activity.simTier = SIM_TIER.S3_DORMANT;
  ast.activity.graceUntilT = -1;
  state.tick = 401;
  state.simTime = 10;
  ensureActivityClassified(state);
  assert.equal(ast.data.oreHP, 17);
  assert.ok(entityNeedsPhysics(ast));
  assert.ok(ast.pos.x > 20, 'catch-up must drift the returning body from lastExactT');
});

test('destroyed records are not the same as dematerialized far actors', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const pirate = ship(6, 4000, { data: { worldRecordId: 'wr_dead' } });
  pirate.alive = false;
  const state = makeState([player, pirate]);
  const runtime = ensureActivityClassified(state);
  assert.equal(runtime.physicsDynamics.includes(pirate), false);
  assert.equal(state.entityList.includes(pirate), true);
});

test('stamped dormant owners never think; unstamped hostiles still do', () => {
  const dormant = ship(20, 4000, { data: { itinerary: { routeId: 'x' } } });
  dormant.activity = { simTier: SIM_TIER.S3_DORMANT, pinnedExact: false };
  const opts = { playerId: 1, playerTeam: 0, origin: { x: 0, z: 0 }, authorityRadius: 120 };
  for (let tick = 0; tick < 16; tick++) {
    assert.equal(shouldOwnerThink(tick, dormant, opts), false);
  }
  const unstampedHostile = {
    id: 21,
    team: 3,
    ai: { combatant: true, passive: false },
    pos: { x: 8000, z: 0 },
  };
  assert.equal(shouldOwnerThink(0, unstampedHostile, { ...opts, playerTeam: 1 }), true);
});

test('consecutive ticks demote a far hauler after grace instead of restarting it', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const hauler = ship(4, 20, { data: { itinerary: { routeId: 'lane_a' } }, team: 2 });
  const state = makeState([player, hauler], { tick: 0, simTime: 0 });
  ensureActivityClassified(state);
  assert.equal(entityNeedsPhysics(hauler), true);
  hauler.pos.x = 4000;
  let stillExact = 0;
  for (let i = 1; i <= 150; i++) {
    state.tick = i;
    state.simTime = i / 60;
    ensureActivityClassified(state);
    if (entityNeedsPhysics(hauler)) stillExact++;
  }
  assert.ok(stillExact > 0 && stillExact < 150, 'grace holds briefly then releases');
  assert.equal(hauler.activity.simTier, SIM_TIER.S2_ABSTRACT);
  assert.equal(entityNeedsPhysics(hauler), false);
  assert.equal(entityNeedsAiThink(hauler), false);
});

test('mining lock and authored activity slots stay exact off the table', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const locked = rock(12, 4000);
  const clast = rock(13, 4500, { data: { activityObjectSlotId: 'ceres_seam_ore_clast', fieldId: 'f_ceres_1' } });
  const state = makeState([player, locked, clast], { player: { miningTargetId: 12 } });
  ensureActivityClassified(state);
  assert.equal(locked.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(clast.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(entityNeedsPhysics(locked), true);
  assert.equal(entityNeedsPhysics(clast), true);
});

test('SG-06 pursuit activity pins a far hostile', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const pirate = ship(2, 2500, {
    team: 1,
    data: { ai: { activity: { targetId: 1 }, combatant: true, passive: false } },
  });
  const state = makeState([player, pirate]);
  ensureActivityClassified(state);
  assert.equal(pirate.activity.simTier, SIM_TIER.S0_EXACT);
  assert.equal(entityNeedsAiThink(pirate), true);
});

test('demoting a durable hauler writes the world ledger without deleting it', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const hauler = ship(4, 20, {
    team: 2,
    data: { itinerary: { routeId: 'lane_a' }, homeSectorId: 'sec_helios' },
    rest: { homeSectorId: 'sec_helios' },
  });
  const state = makeState([player, hauler], {
    tick: 0,
    simTime: 0,
    world: { currentSectorId: 'sec_helios' },
    meta: { seed: 47 },
  });
  ensureActivityClassified(state);
  hauler.pos.x = 4000;
  for (let i = 1; i <= 150; i++) {
    state.tick = i;
    state.simTime = i / 60;
    ensureActivityClassified(state);
  }
  assert.equal(hauler.alive, true);
  assert.equal(state.entityList.includes(hauler), true);
  const rec = state.world.records && state.world.records.byId[hauler.data.worldRecordId];
  assert.ok(rec, 'dematerialize must capture a durable record');
  assert.equal(rec.alive, true);
  assert.equal(rec.pos.x, 4000);
  assert.ok(rec.lastExactT > 0);
});

test('spatial hash membership is the Rapier active set, not the whole sector', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const nearRock = rock(2, 20);
  const farRock = rock(3, 4000);
  const farHauler = ship(4, 3500, { data: { itinerary: { routeId: 'lane_a' } }, team: 2 });
  const state = makeState([player, nearRock, farRock, farHauler]);
  const layers = spatialHashLayersFromState(state);
  assert.ok(layers);
  assert.equal(layers.statics.includes(farRock), false);
  assert.equal(layers.dynamics.includes(farHauler), false);
  assert.ok(layers.dynamics.includes(player));
  assert.equal(state.entityList.includes(farRock), true);
  const hash = new SpatialHash(64);
  hash.rebuildLayers(layers.statics, layers.dynamics, layers.staticVersion);
  const found = [];
  hash.queryRadius(0, 0, 80, found);
  assert.equal(found.includes(farRock), false);
  assert.ok(found.includes(player) || found.includes(nearRock));
});

test('production physics, AI, and traffic call the activity runtime', async () => {
  const physics = await readFile(new URL('../src/core/physics.js', import.meta.url), 'utf8');
  const tactical = await readFile(new URL('../src/systems/tacticalAI.js', import.meta.url), 'utf8');
  const ai = await readFile(new URL('../src/systems/ai.js', import.meta.url), 'utf8');
  const ports = await readFile(new URL('../src/systems/aiPorts.js', import.meta.url), 'utf8');
  const traffic = await readFile(new URL('../src/systems/traffic.js', import.meta.url), 'utf8');
  const bark = await readFile(new URL('../src/systems/barkDirector.js', import.meta.url), 'utf8');
  const stack = await readFile(new URL('../src/ai/stack.js', import.meta.url), 'utf8');
  const save = await readFile(new URL('../src/save/saveSystem.js', import.meta.url), 'utf8');
  assert.match(physics, /ensureActivityClassified/);
  assert.match(physics, /spatialHashLayersFromState/);
  assert.match(physics, /activity\.physicsStatics/);
  assert.match(physics, /activity\.physicsDynamics/);
  assert.match(tactical, /ensureActivityClassified/);
  assert.match(tactical, /entityNeedsAiThink/);
  assert.match(ai, /entityNeedsAiThink/);
  assert.match(ports, /entityNeedsAiThink/);
  assert.match(traffic, /entityNeedsAiThink/);
  assert.match(bark, /ensureActivityClassified/);
  assert.match(stack, /activity: member\.activity/);
  assert.match(save, /['"]activity['"]/);
  const sg02 = await readFile(new URL('../src/core/sg02DynamicBodyOwner.js', import.meta.url), 'utf8');
  assert.match(sg02, /if \(live\) \{/);
  assert.match(sg02, /return;/);
  const mining = await readFile(new URL('../src/systems/mining.js', import.meta.url), 'utf8');
  assert.match(mining, /miningTargetId/);
});

test('S1 near actors think on a reduced cadence, not every tick', () => {
  const near = ship(30, 400, { data: { itinerary: { routeId: 'lane_b' } }, team: 2 });
  near.activity = { simTier: SIM_TIER.S1_NEAR, pinnedExact: false };
  const hits = [];
  for (let tick = 0; tick < 8; tick++) {
    hits.push(entityNeedsAiThink(near, { tick, playerId: 1, simTime: tick / 60 }));
  }
  assert.equal(hits.some(Boolean), true);
  assert.equal(hits.every(Boolean), false);
});

test('generic unobserved far ships become aggregate population, not 60 Hz bodies', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const extra = ship(40, 5000, { team: 2, data: {} });
  const state = makeState([player, extra]);
  const runtime = ensureActivityClassified(state);
  assert.equal(extra.alive, true);
  assert.equal(extra.activity.simTier, SIM_TIER.S4_AGGREGATE);
  assert.equal(entityNeedsPhysics(extra), false);
  assert.equal(entityNeedsAiThink(extra, state), false);
  assert.ok(runtime.counts.s4 >= 1);
});

test('activity manager publishes glass and exact sets from the live classifier', () => {
  const player = ship(1, 0, { isPlayer: true, team: 0 });
  const far = ship(4, 4000, { data: { itinerary: { routeId: 'lane_a' } }, team: 2 });
  const frame = getActivityFrame(makeState([player, far]));
  assert.ok(frame.exactIds.includes(1));
  assert.equal(frame.exactIds.includes(4), false);
  assert.ok(frame.renderGlassIds.includes(1));
  assert.equal(player.alive, true);
  assert.equal(far.alive, true);
});
