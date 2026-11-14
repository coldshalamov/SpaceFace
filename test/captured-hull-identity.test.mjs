import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { defaultShipAppearance } from '../src/core/shipAppearance.js';
import { isStarterHull } from '../src/data/hullIdentity.js';
import { paletteFor } from '../src/render/partsLibrary.js';
import { resolvePalette } from '../src/render/visualFactory.js';
import { cargo } from '../src/systems/cargo.js';
import { makeShipEntitySpec, ships } from '../src/systems/ships.js';
import { entityVitalsOf } from '../scripts/lib/simWorkerHost.mjs';
import { applyEntityVitals, applySpawnInfos, createReadModel } from '../scripts/lib/simReadModel.mjs';

function runtime(appearance, legacyStarter = false) {
  const state = createGameState(4242);
  const bus = createBus();
  state.mode = 'flight';
  const starterAppearance = legacyStarter ? null : defaultShipAppearance('ship_kestrel');
  state.player.ownedShips = [{ defId: 'ship_kestrel', vesselId: 'vessel:starter',
    fittings: [], fittedInstances: {}, ...(starterAppearance ? { appearance: starterAppearance } : {}) }];
  state.player.activeShipIndex = 0;
  const from = makeEntity(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, factionId: 'faction_free', appearance: starterAppearance,
  }));
  const to = makeEntity(makeShipEntitySpec('ship_kestrel', {
    team: 1, factionId: 'faction_reach', ai: { fsm: 'surrender' }, pos: { x: 65, z: 0 },
  }));
  from.id = 1; to.id = 2;
  from.data.vesselId = 'vessel:starter'; from.data.shipjackGeneration = 'starter:1';
  to.data.vesselId = 'vessel:prize'; to.data.shipjackGeneration = 'prize:1';
  to.data.appearance = appearance;
  from.vel.set(0, 0, 0); to.vel.set(0, 0, 0);
  state.entities = new Map([[1, from], [2, to]]);
  state.entityList = [from, to]; state.playerId = 1;
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 40, capMass: 40 };
  const owner = Object.create(ships);
  owner.init({ state, bus, helpers: { getEntity: id => state.entities.get(id) } });
  const cargoOwner = Object.create(cargo);
  cargoOwner.init({ state, bus, helpers: {} });
  const request = { targetId: 2, targetGeneration: 'prize:1', vesselId: 'vessel:prize', operationId: 'capture:1' };
  return { state, owner, from, to, request };
}

test('both capture routes admit a separate Hitch identity and preserve explicit paint', () => {
  for (const via of ['admitCapturedVessel', 'captureAndTransfer']) {
    for (const [appearance, decalId] of [
      [null, 'none'],
      [{ hullColor: '#334455' }, 'none'],
      [{ decalId: 'not-a-decal', hullColor: '#334455' }, 'none'],
      [{ decalId: 'concord', hullColor: '#334455' }, 'concord'],
      [{ decalId: 'borrowed_time' }, 'borrowed_time'],
    ]) {
      const h = runtime(appearance);
      const result = h.owner[via](h.request);
      assert.equal(result.ok, true, `${via}: ${result.reason}`);
      const owned = h.state.player.ownedShips[result.index];
      assert.equal(owned.starterHull, false);
      assert.equal(isStarterHull(owned, 0), false);
      assert.equal(owned.appearance.decalId, decalId, `${via} owned decal`);
      assert.equal(h.to.data.appearance.decalId, decalId, `${via} live decal`);
      if (appearance?.hullColor) assert.equal(owned.appearance.hullColor, '#334455');
      assert.equal(paletteFor(h.to).decalId, decalId);
      assert.equal(resolvePalette(h.to).decalId, decalId);
    }
  }
});

test('physical handoff parks the original starter with its own appearance, including legacy records', () => {
  for (const legacy of [false, true]) {
    const h = runtime(null, legacy);
    const result = h.owner.captureAndTransfer(h.request);
    assert.equal(result.ok, true, result.reason);
    assert.equal(h.from.isPlayer, false);
    assert.equal(h.from.data.appearance.decalId, 'borrowed_time');
    assert.equal(paletteFor(h.from).decalId, 'borrowed_time');
    assert.equal(resolvePalette(h.from).decalId, 'borrowed_time');
    const reverse = h.owner.captureAndTransfer({ targetId: 1, targetGeneration: 'starter:1',
      vesselId: 'vessel:starter', operationId: 'capture:2' });
    assert.equal(reverse.ok, true, reverse.reason);
    assert.equal(h.state.player.activeShipIndex, 0);
    assert.notEqual(h.state.player.ownedShips[0].starterHull, false);
    assert.equal(h.from.data.appearance.decalId, 'borrowed_time');
  }
});

test('worker presentation preserves each physical hull identity across a legacy handoff', () => {
  const h = runtime(null, true);
  const readModel = createReadModel();
  applySpawnInfos(readModel, [h.from, h.to].map((entity) => ({
    entityId: entity.id, type: entity.type, alive: true, team: entity.team,
    factionId: entity.factionId, radius: entity.radius, isPlayer: entity.isPlayer,
    data: entity.data, vitals: entityVitalsOf(entity),
  })));
  const result = h.owner.captureAndTransfer(h.request);
  assert.equal(result.ok, true, result.reason);
  // The worker updates control as vitals; it does not resend the entities' whole data blocks.
  applyEntityVitals(readModel, [h.from, h.to].map((entity) => [entity.id, entityVitalsOf(entity)]));
  const parked = readModel.entities.get(h.from.id);
  const captured = readModel.entities.get(h.to.id);
  assert.equal(parked.isPlayer, false);
  assert.equal(captured.isPlayer, true);
  assert.equal(paletteFor(parked).decalId, 'borrowed_time');
  assert.notEqual(paletteFor(captured).decalId, 'borrowed_time');
  assert.equal(resolvePalette(parked).decalId, 'borrowed_time');
  assert.notEqual(resolvePalette(captured).decalId, 'borrowed_time');
});
