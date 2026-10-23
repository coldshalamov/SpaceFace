import assert from 'node:assert/strict';
import test from 'node:test';
import { debrisImpactDamage } from '../src/systems/debrisCrossings.js';
import { world } from '../src/systems/world.js';
import { createGameState } from '../src/core/gameState.js';

function pilot(speed) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.tick = 0;
  let flip = 0;
  state.rng = () => {
    const value = flip % 2 === 0 ? 0 : 0.5;
    flip += 1;
    return value;
  };
  const player = {
    id: 1,
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: speed, z: 0 },
    radius: 8,
    hull: 80,
    shield: 0,
    flags: {},
  };
  state.playerId = 1;
  state.entities.set(1, player);
  state.ui = state.ui || {};
  state.ui.docked = false;
  state.world.currentSectorId = 'sector_debris_4242';
  state.world.activeSector = state.world.activeSector || {};
  state.world.activeSector.hazards = [{
    id: 'hazard_debris_4242',
    type: 'debris',
    center: { x: 0, z: 0 },
    radius: 400,
    intensity: 1,
  }];
  return { state, player };
}

function hostFor(state, combat) {
  const specs = [];
  const host = {
    bus: { emit() {} },
    registry: combat ? { get(name) { return name === 'combat' ? combat : null; } } : null,
    _hazardSet: new Set(),
    _hazardNextSet: new Set(),
    _resolveMovingHazards() {},
    _emitHazardPresence() {},
    _hazardEffectiveIntensity() { return 1; },
    _applyRadiationTick() {},
    _applyDebrisCrossings: world._applyDebrisCrossings,
    _applyDebrisImpact: world._applyDebrisImpact,
    helpers: {
      spawnEntity(spec) {
        specs.push(spec);
        const entity = {
          id: 100 + specs.length,
          alive: true,
          type: spec.type,
          collides: spec.collides,
          radius: spec.radius,
          pos: { x: spec.pos.x, z: spec.pos.z },
          vel: { x: 0, z: 0 },
          data: { ...spec.data },
        };
        state.entities.set(entity.id, entity);
        return entity;
      },
      removeEntity(id) {
        const entity = state.entities.get(id);
        if (entity) entity.alive = false;
      },
    },
    specs,
  };
  return host;
}

function fly(host, state, seconds) {
  const step = 1 / 10;
  const ticks = Math.round(seconds / step);
  for (let i = 0; i < ticks; i++) world._tickHazards.call(host, step, state);
}

test('seed 4242 debris junk crosses the disc and a fast hull takes the hit', () => {
  const { state, player } = pilot(100);
  const routes = [];
  const combat = {
    state,
    ensureKernel() {
      return { routeDamage(request) { routes.push(request); } };
    },
  };
  const host = hostFor(state, combat);
  fly(host, state, 8);
  assert.ok(host.specs.length >= 1);
  const spec = host.specs[0];
  assert.equal(spec.type, 'pickup');
  assert.equal(spec.collides, false);
  assert.equal(spec.data.hazardDebris, true);
  assert.equal(spec.data.name, 'Crossing junk');
  assert.ok(Math.abs(Math.hypot(spec.pos.x, spec.pos.z) - 400) < 1);
  assert.equal(player.hull, 80);
  assert.ok(routes.length >= 1);
  assert.equal(routes.length <= 2, true);
  const expected = debrisImpactDamage(1, 100);
  assert.equal(routes[0].origin.kind, 'hazard_debris');
  assert.equal(routes[0].packet.source.kind, 'hazard_debris');
  assert.ok(Math.abs(routes[0].packet.channels.kinetic - expected) < 1e-9);
  assert.equal(routes[0].packet.channels.thermal, 0);
  assert.equal(routes[0].targetId, player.id);
});

test('seed 4242 a slow hull grazes the same junk and keeps its hull', () => {
  const { state, player } = pilot(20);
  const host = hostFor(state, null);
  fly(host, state, 9);
  assert.ok(host.specs.length >= 1);
  assert.equal(player.hull, 80);
  assert.equal(player.shield, 0);
  const junk = [...state.entities.values()].filter((entity) => entity.data && entity.data.hazardDebris);
  assert.ok(junk.length >= 1);
  assert.equal(junk[0].alive, false);
});

test('seed 4242 outside the disc and a docked hull throw no junk', () => {
  const outside = pilot(100);
  outside.player.pos.x = 5000;
  const far = hostFor(outside.state, null);
  fly(far, outside.state, 5);
  assert.equal(far.specs.length, 0);
  assert.equal(outside.player.hull, 80);

  const docked = pilot(100);
  docked.state.ui.docked = true;
  const berth = hostFor(docked.state, null);
  fly(berth, docked.state, 8);
  assert.equal(berth.specs.length, 0);
  assert.equal(docked.player.hull, 80);
});
