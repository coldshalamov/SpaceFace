// INF-096: bomb target collection reuses the canonical typed index without losing loose bodies.
// Two seeded runs of the same encounter — full-scan fallback vs ready typed index — must route
// identical damage/impulse effects in the same order, including noncolliding movable cargo.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { BOMB_DEFS } from '../src/data/bombs.js';
import { bombs } from '../src/systems/bombs.js';

const DT = 1 / 60;

function boot({ withIndex }) {
  const state = createGameState(47);
  state.mode = 'flight';
  state.simTime = 0;
  state.playerId = 1;
  const player = {
    id: 1, type: 'ship', alive: true, team: 0, mass: 32, radius: 6, rot: 0,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
  };
  state.entities.set(1, player);
  state.entityList = [player];
  const bus = createBus();
  const routed = [];
  const impulses = [];
  const detonated = [];
  bus.on('bombs:detonated', (p) => detonated.push(p));
  let nextId = 50;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, hull: 1, hullMax: 1, ...spec };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    routeCombatDamage(req) { routed.push(req); return { ok: true }; },
    combatPhysics: {
      applyImpulse(req) { impulses.push(req); return true; },
    },
  };
  const system = Object.create(bombs);
  system.init({ state, bus, helpers });
  const rt = state.bombs;
  rt.rack.cells[0] = { id: 'bomb_frag', count: BOMB_DEFS.bomb_frag.magazine };
  rt.selectedId = 'bomb_frag';

  const add = (spec) => helpers.spawnEntity(spec);
  // Blast-vicinity encounter: eligible craft, loose bodies, clutter, and corpses.
  const victim = add({ type: 'ship', team: 1, mass: 32, radius: 6, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 }, rot: 0 });
  const loosePickup = add({
    type: 'pickup', team: 1, mass: 1, radius: 2, collides: false, physicsBody: true,
    pos: { x: 34, z: 4 }, vel: { x: 0, z: 0 },
  });
  const looseWreck = add({
    type: 'wreck', team: 1, mass: 20, radius: 8, collides: true, physicsBody: true,
    pos: { x: 26, z: -6 }, vel: { x: 0, z: 0 },
  });
  add({ type: 'asteroid', mass: 100, radius: 12, collides: true, physicsBody: false, pos: { x: 32, z: 10 }, vel: { x: 0, z: 0 } });
  add({ type: 'fx', collides: false, physicsBody: false, pos: { x: 30, z: 0 }, vel: { x: 0, z: 0 } });
  add({ type: 'projectile', team: 1, mass: 1, radius: 1, collides: true, physicsBody: true, pos: { x: 31, z: 1 }, vel: { x: 0, z: 0 } });
  add({ type: 'mine', team: 1, mass: 5, radius: 3, collides: true, physicsBody: true, pos: { x: 29, z: -2 }, vel: { x: 0, z: 0 } });
  const corpse = add({ type: 'ship', team: 1, mass: 32, radius: 6, pos: { x: 30, z: 2 }, vel: { x: 0, z: 0 }, rot: 0 });
  corpse.alive = false;

  if (withIndex) {
    // A ready canonical index partitioned by type. The corpse stays bucketed on purpose: the
    // live alive re-check must filter it exactly as the full scan does.
    const buckets = { ships: [], drones: [], stations: [], asteroids: [], wrecks: [], pickups: [], payloads: [], bombs: [] };
    for (const e of state.entityList) {
      if (e.type === 'ship') buckets.ships.push(e);
      else if (e.type === 'drone') buckets.drones.push(e);
      else if (e.type === 'station') buckets.stations.push(e);
      else if (e.type === 'asteroid') buckets.asteroids.push(e);
      else if (e.type === 'wreck') buckets.wrecks.push(e);
      else if (e.type === 'pickup') buckets.pickups.push(e);
      else if (e.type === 'payload') buckets.payloads.push(e);
      else if (e.type === 'bomb') buckets.bombs.push(e);
    }
    state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true, ...buckets };
    // The dropped bomb spawns through the harness (no index append): admit it like spawnEntity does.
    const admitBomb = (entity) => {
      if (entity && entity.type === 'bomb') state.entityIndex.bombs.push(entity);
      return entity;
    };
    const rawSpawn = helpers.spawnEntity;
    helpers.spawnEntity = (spec) => admitBomb(rawSpawn(spec));
  }

  return {
    state, bus, system, routed, impulses, detonated, victim, loosePickup, looseWreck,
    tick(n = 1) {
      for (let i = 0; i < n; i++) {
        state.simTime += DT;
        state.tick += 1;
        system.update(DT, state);
      }
    },
    press(action) {
      state.input.actions = state.input.actions || {};
      state.input.actions[action] = true;
    },
  };
}

function runEncounter(withIndex) {
  const t = boot({ withIndex });
  t.press('dropBomb');
  t.tick(120);
  t.press('chargeDetonate');
  t.tick(600);
  assert.equal(t.detonated.length, 1, `seeded bomb must detonate (withIndex=${withIndex})`);
  return t;
}

test('indexed bomb targets receive the same effects in the same order, including loose bodies', () => {
  const fallback = runEncounter(false);
  const indexed = runEncounter(true);
  assert.deepEqual(indexed.routed, fallback.routed, 'damage packets must match the full scan');
  assert.deepEqual(indexed.impulses, fallback.impulses, 'impulses must match the full scan');
  assert.deepEqual(indexed.detonated, fallback.detonated, 'detonation receipt must match the full scan');
  const impulseTargets = (run) => run.impulses.map((req) => req.entityId ?? req.id ?? req.targetId);
  assert.ok(impulseTargets(fallback).includes(fallback.loosePickup.id), 'noncolliding movable cargo is shoved in the fallback run');
  assert.ok(impulseTargets(indexed).includes(indexed.loosePickup.id), 'noncolliding movable cargo is shoved in the indexed run');
  assert.ok(impulseTargets(fallback).includes(fallback.looseWreck.id), 'wrecks are shoved in the fallback run');
  assert.ok(impulseTargets(indexed).includes(indexed.looseWreck.id), 'wrecks are shoved in the indexed run');
});
