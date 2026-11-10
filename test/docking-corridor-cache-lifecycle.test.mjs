import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { COLLISION_PROXY_MANIFESTS, resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';

function station(id = 2) {
  return {
    id, type: 'station', alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 42,
    data: { stationId: 'test-station', dockRadius: 90, collisionProxy: 'helios_trade_hub' },
    physicsBody: { collisionProxyManifest: { ...COLLISION_PROXY_MANIFESTS.helios_trade_hub, id: 'test-dock-a' } },
  };
}

function system() {
  const owner = Object.create(dockingCorridor);
  owner.init({ bus: createBus() });
  return owner;
}

test('docking follows the current manifest after entity replacement or authored revision', () => {
  const owner = system(), original = station(), replacement = station();
  owner._manifestFor(original);
  replacement.physicsBody.collisionProxyManifest = {
    ...replacement.physicsBody.collisionProxyManifest, id: 'test-dock-b',
  };
  assert.equal(owner._manifestFor(replacement), resolveCollisionProxyManifest(replacement));
  replacement.physicsBody.collisionProxyManifest.id = 'test-dock-c';
  replacement.physicsBody.revision = 1;
  assert.equal(owner._manifestFor(replacement), resolveCollisionProxyManifest(replacement));
  owner.destroy();
});

test('proxy diagnostics update with berth scale and do not inherit a previous occupant of an entity id', () => {
  const owner = system(), body = station();
  const state = { entityList: [body] };
  owner._publishProxyDiagnostics(state);
  const first = state.physicsRuntime.collisionProxies[0];
  body.data.dockRadius *= 2;
  owner._publishProxyDiagnostics(state);
  const resized = state.physicsRuntime.collisionProxies[0];
  assert.equal(resized.corridor.mouthRadius, first.corridor.mouthRadius * 2);
  assert.notDeepEqual(resized.berth, first.berth);
  const replacement = station();
  replacement.data.stationId = 'replacement-station';
  state.entityList = [replacement];
  owner._publishProxyDiagnostics(state);
  assert.equal(state.physicsRuntime.collisionProxies[0].stationId, 'replacement-station');
  assert.equal(owner._proxyGeometryCache.size, 1, 'retired entity templates must be released');
  owner.destroy();
});
