import assert from 'node:assert/strict';
import test from 'node:test';

import { PRESENTATION_TIER, SIM_TIER } from '../src/world/activityClassification.js';
import { ensureActivityClassified } from '../src/world/activityRuntime.js';
import { insertFarActor } from '../src/world/farActorTable.js';
import {
  collectMeshPresentationEntities,
  isPresentationLedgerRow,
  resolveWorldPresentationEntity,
} from '../src/world/presentationSources.js';
import { isEntityRenderRelevant } from '../src/render/renderer.js';
import { residencyPrefetchRadius } from '../src/render/tabletopPolicy.js';

function makeState(entities) {
  const map = new Map();
  for (const entity of entities) map.set(entity.id, entity);
  return {
    tick: 10,
    simTime: 10,
    playerId: 1,
    mode: 'flight',
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
    entities: map,
    entityList: entities,
    player: {},
    combat: {},
  };
}

test('presentation residency follows glass and runway tiers, not sector existence', () => {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, collides: true, team: 0, data: {},
  };
  const glassShip = {
    id: 2, type: 'ship', alive: true, pos: { x: 20, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, collides: true, team: 1, data: {},
  };
  const farShip = {
    id: 3, type: 'ship', alive: true, pos: { x: 4000, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, collides: true, team: 2, data: { itinerary: { routeId: 'lane_a' } },
  };
  const state = makeState([player, glassShip, farShip]);
  const runtime = ensureActivityClassified(state);
  assert.equal(player.activity.presentationTier, PRESENTATION_TIER.R0_GLASS);
  assert.equal(glassShip.activity.presentationTier, PRESENTATION_TIER.R0_GLASS);
  assert.notEqual(farShip.activity.presentationTier, PRESENTATION_TIER.R0_GLASS);
  assert.equal(isEntityRenderRelevant(player, state), true);
  assert.equal(isEntityRenderRelevant(glassShip, state), true);
  assert.equal(isEntityRenderRelevant(farShip, state), false);
  assert.ok(runtime.glassIds.includes(1));
  assert.ok(runtime.glassIds.includes(2));
  assert.equal(runtime.glassIds.includes(3), false);
  assert.equal(farShip.alive, true);
  assert.equal(farShip.activity.simTier, SIM_TIER.S2_ABSTRACT);
});

test('a stamped runway package stays meshed even when far from the live radius fallback', () => {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, data: {},
  };
  const incoming = {
    id: 4, type: 'ship', alive: true, pos: { x: 8000, z: 0 }, radius: 8, data: {},
    activity: { presentationTier: PRESENTATION_TIER.R1_RUNWAY, simTier: SIM_TIER.S1_NEAR },
  };
  const state = makeState([player, incoming]);
  assert.equal(isEntityRenderRelevant(incoming, state), true);
});

test('a shelved far hull still draws from the ledger before it rematerializes', () => {
  const prefetch = residencyPrefetchRadius();
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, data: {},
  };
  const state = makeState([player]);
  const rec = insertFarActor(state, {
    id: 88,
    type: 'ship',
    pos: { x: prefetch - 30, z: 0 },
    vel: { x: -80, z: 0 },
    rot: 0,
    radius: 8,
    mass: 20,
    hull: 40,
    hullMax: 40,
    team: 1,
    data: { trafficRole: 'hauler' },
    flags: {},
  });
  assert.equal(rec.farResident, true);
  assert.equal(state.entities.has(88), false);
  assert.equal(resolveWorldPresentationEntity(state, 88), rec);
  assert.equal(isPresentationLedgerRow(rec), true);
  const meshList = collectMeshPresentationEntities(state);
  assert.ok(meshList.some((row) => row.id === 88));
  state.render = {
    activityFrame: { complete: true, renderGlassIds: [1], renderRunwayIds: [] },
  };
  assert.equal(isEntityRenderRelevant(rec, state), true,
    'activity frame cannot hide a nearby ledger hull or the rim blinks empty');
});
