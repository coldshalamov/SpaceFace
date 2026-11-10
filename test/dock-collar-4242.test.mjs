// The berth already names a speed gate. A hull inside that pocket above the
// gate takes one scrape. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { resolveCollisionProxyManifest, resolveDockAnchor } from '../src/data/collisionProxyManifests.js';
import { dockCollarDamage, DOCK_BUMP_GAP_S } from '../src/systems/dockCollar.js';
import { world } from '../src/systems/world.js';

function stationAtOrigin() {
  return {
    id: 9,
    type: 'station',
    alive: true,
    pos: { x: 0, y: 0, z: 0 },
    radius: 90,
    data: { stationId: 'st_4242', collisionProxy: 'station_ring_hub', dockRadius: 90 },
  };
}

function pilot(speed) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.simTime = 0;
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
  const station = stationAtOrigin();
  const manifest = resolveCollisionProxyManifest(station);
  const anchor = resolveDockAnchor(station, manifest, player);
  assert.ok(anchor && anchor.dockRadius > 0, 'the ring hub publishes a berth');
  player.pos.x = anchor.x;
  player.pos.z = anchor.z;
  state.playerId = 1;
  state.entities.set(1, player);
  state.entityList = [player, station];
  state.ui = state.ui || {};
  state.ui.docked = false;
  return { state, player, station, anchor };
}

function hostFor(routes) {
  const host = {
    bus: { emit() {} },
    registry: { get() { return null; } },
    helpers: {},
  };
  host._applyDockCollar = world._applyDockCollar;
  host._applyDockCollarHit = world._applyDockCollarHit;
  if (routes) {
    host.registry.get = (name) => (name === 'combat' ? {
      state: null,
      ensureKernel() {
        return { routeDamage(request) { routes.push(request); } };
      },
    } : null);
  }
  return host;
}

test('seed 4242 a fast hull in the berth takes the scrape and a crawl does not', () => {
  const fast = pilot(40);
  const routes = [];
  const host = hostFor(routes);
  host.registry.get = (name) => (name === 'combat' ? {
    state: fast.state,
    ensureKernel() {
      return { routeDamage(request) { routes.push(request); } };
    },
  } : null);
  world._applyDockCollar.call(host, 0.1, fast.state);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].origin.kind, 'dock_collar');
  assert.equal(routes[0].packet.source.kind, 'dock_collar');
  assert.equal(routes[0].packet.channels.kinetic, dockCollarDamage(40, fast.anchor.speedGate));
  assert.ok(routes[0].packet.channels.kinetic > 0);
  assert.equal(fast.player.hull, 80);

  const slow = pilot(6);
  const quiet = [];
  const slowHost = hostFor(quiet);
  slowHost.registry.get = (name) => (name === 'combat' ? {
    state: slow.state,
    ensureKernel() {
      return { routeDamage(request) { quiet.push(request); } };
    },
  } : null);
  world._applyDockCollar.call(slowHost, 0.1, slow.state);
  assert.equal(quiet.length, 0);
  assert.equal(slow.player.hull, 80);
});

test('seed 4242 open space and a docked hull are not scraped, and the pocket waits between bumps', () => {
  const away = pilot(40);
  away.player.pos.x += 8000;
  const host = hostFor(null);
  world._applyDockCollar.call(host, 0.1, away.state);
  assert.equal(away.player.hull, 80);

  const docked = pilot(40);
  docked.state.ui.docked = true;
  world._applyDockCollar.call(host, 0.1, docked.state);
  assert.equal(docked.player.hull, 80);

  const hot = pilot(40);
  const expected = dockCollarDamage(40, hot.anchor.speedGate);
  world._applyDockCollar.call(host, 0.1, hot.state);
  const afterFirst = hot.player.hull;
  assert.equal(afterFirst, 80 - expected);
  hot.state.simTime = 0.2;
  world._applyDockCollar.call(host, 0.1, hot.state);
  assert.equal(hot.player.hull, afterFirst);
  hot.state.simTime = DOCK_BUMP_GAP_S;
  world._applyDockCollar.call(host, 0.1, hot.state);
  assert.equal(hot.player.hull, afterFirst - expected);
});
