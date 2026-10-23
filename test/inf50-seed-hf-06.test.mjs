// SEED-HF-06 — thrown mass tears a named part on a swarm champion, not only on a mission capital.
// Seed 4242. The packet is the same combat:routeDamage seam. Mission params are not written.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createCapitalBossEncounters } from '../src/systems/capitalBossEncounters.js';

const SEED = 4242;
const DRIVE = 'subsystem_drive';
const WEAPON = 'subsystem_weapon';
const SPOOL = 'subsystem_tether_spool';

function worldPos(entity, center) {
  const radius = Math.max(1, Number(entity.radius) || 20);
  return {
    x: entity.pos.x + (Number(center[0]) || 0) * radius,
    z: entity.pos.z + (Number(center[1]) || 0) * radius,
  };
}

function boot() {
  const state = {
    tick: 3,
    simTime: 0.5,
    playerId: 1,
    meta: { seed: SEED },
    entities: new Map(),
    missions: {
      active: [{
        id: 'mission-capital',
        type: 'capital_boss',
        status: 'active',
        params: { physicsHits: 2, gunHits: 1, subsystemsHurtByMass: ['subsystem_drive'] },
      }],
    },
  };
  const missionSnapshot = JSON.parse(JSON.stringify(state.missions));
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, radius: 8 };
  state.entities.set(1, player);
  const routed = [];
  let helperCalls = 0;
  const bus = createBus();
  const cap = createCapitalBossEncounters({
    observe() { return { boss: null, target: null, active: false, targets: [] }; },
    spawnWing() { return []; },
  });
  cap.init({
    state,
    bus,
    helpers: {
      routeCombatDamage() { helperCalls += 1; },
    },
  });
  bus.on('combat:routeDamage', (request) => routed.push(request));
  return { state, bus, cap, routed, missionSnapshot, helperCalls: () => helperCalls };
}

function body(id, overrides = {}) {
  const entity = {
    id,
    type: 'ship',
    alive: true,
    team: 1,
    pos: { x: 100, z: 40 },
    rot: 0,
    radius: 20,
    hull: 720,
    data: { swarmChampion: true },
    ...overrides,
  };
  return entity;
}

function add(state, entity) {
  state.entities.set(entity.id, entity);
  return entity;
}

test('SEED-HF-06 seed 4242 a swarm champion rotates thrown-mass parts, and a mission fight does not', () => {
  const h = boot();
  const missionBoss = add(h.state, body(10, { data: { physicalRole: 'capital_hull' } }));
  const champion = add(h.state, body(11));
  h.bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_foreman',
    fightId: 'contract:capital_boss_foreman',
    bossId: missionBoss.id,
    targetId: 1,
  });
  h.bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_foreman',
    fightId: 'swarm:foreman:w20',
    bossId: champion.id,
    targetId: 1,
  });

  h.bus.emit('tether:whipImpact', { victimId: missionBoss.id, rating: 'solid', targetId: 90 });
  h.bus.emit('massline:throw', { payloadId: 90, aimTargetId: missionBoss.id });
  assert.equal(h.routed.length, 0, 'a mission fight is not routed a second time from here');

  h.bus.emit('tether:whipImpact', { victimId: champion.id, rating: 'glance', targetId: 90 });
  h.bus.emit('tether:whipImpact', { victimId: 99, rating: 'crushing', targetId: 90 });
  h.bus.emit('massline:throw', { payloadId: 90, aimTargetId: 99 });
  assert.equal(h.routed.length, 0, 'a glance or a miss does not tear a part');

  h.bus.emit('tether:whipImpact', { victimId: champion.id, rating: 'solid', targetId: 90 });
  h.bus.emit('tether:whipImpact', { victimId: champion.id, rating: 'crushing', targetId: 90 });
  h.bus.emit('massline:throw', { payloadId: 90, aimTargetId: champion.id });
  h.bus.emit('massline:throw', { payloadId: champion.id, aimTargetId: null });

  assert.equal(h.helperCalls(), 0, 'thrown mass does not call a second damage helper');
  assert.deepEqual(h.routed.map((row) => row.packet.hit.subsystemId), [DRIVE, WEAPON, SPOOL, DRIVE]);
  assert.deepEqual(h.routed.map((row) => row.packet.channels.kinetic), [40, 40, 40, 40]);
  assert.deepEqual(h.routed.map((row) => row.origin.subsystemId), [DRIVE, WEAPON, SPOOL, DRIVE]);
  for (const row of h.routed) {
    assert.equal(row.attackerId, 1);
    assert.equal(row.targetId, champion.id);
    assert.equal(row.origin.kind, 'thrown_mass');
    assert.equal(row.packet.source.kind, 'thrown_mass');
    assert.equal(row.packet.subsystemShare, 1);
    assert.deepEqual(row.packet.flags, { ignoreFriendlyFire: true, allowAnyTarget: true });
  }
  assert.deepEqual(h.routed[0].packet.hit.pos, worldPos(champion, [-0.58, 0]));
  assert.deepEqual(h.routed[1].packet.hit.pos, worldPos(champion, [0.5, 0]));
  assert.deepEqual(h.routed[2].packet.hit.pos, worldPos(champion, [-0.18, 0.48]));
  assert.deepEqual(h.state.missions, h.missionSnapshot, 'mission params stay untouched');

  const fight = h.state.capitalBossEncounters.fights['swarm:foreman:w20'];
  fight.terminal = 'down';
  h.bus.emit('tether:whipImpact', { victimId: champion.id, rating: 'solid', targetId: 90 });
  assert.equal(h.routed.length, 4, 'a settled swarm fight takes no further part tear');

  h.cap.detach('swarm:foreman:w20');
  h.cap.detach('contract:capital_boss_foreman');
  h.cap.destroy();
});

test('SEED-HF-06 a stamped role table is the rotation, not a second hardcoded list', () => {
  const h = boot();
  const champion = add(h.state, body(11, {
    data: {
      swarmChampion: true,
      capitalSubsystemRoles: {
        thrusters: 'subsystem_sensor',
        turrets: 'subsystem_power',
        bays: 'subsystem_drive',
      },
    },
  }));
  h.bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_foreman',
    fightId: 'swarm:foreman:w30',
    bossId: champion.id,
    targetId: 1,
  });
  h.bus.emit('tether:whipImpact', { victimId: champion.id, rating: 'solid' });
  assert.equal(h.routed[0].packet.hit.subsystemId, 'subsystem_sensor');
  assert.deepEqual(h.routed[0].packet.hit.pos, worldPos(champion, [0.72, 0]));
  assert.deepEqual(h.state.missions, h.missionSnapshot);
  h.cap.destroy();
});
