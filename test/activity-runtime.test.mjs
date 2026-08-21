import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

import { SIM_TIER } from '../src/world/activityClassification.js';
import { shouldOwnerThink } from '../src/core/activityScheduler.js';
import {
  ensureActivityClassified,
  entityNeedsAiThink,
  entityNeedsPhysics,
} from '../src/world/activityRuntime.js';

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
});
