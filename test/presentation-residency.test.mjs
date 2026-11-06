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

// OWNER, 2026-09-20: "sometimes I fly kind of away from something and it'll pop out of existence,
// asteroids pop out of existence all the time." The activity frame classifies from the player's
// position at the REQUESTED zoom; the picture is drawn from the camera look-at at the LIVE zoom,
// which combat group-fit pushes to 528 with the look-at led hundreds of WU off the player.
test('nothing on the live screen loses its mesh, whatever tier the sim-side frame gave it', () => {
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, radius: 8, collides: true, team: 0, data: {},
  };
  // 1020 WU out: beyond the ~960 WU authored-decode disc an inbound wreck admits at.
  const wreck = {
    id: 2, type: 'wreck', alive: true, pos: { x: 0, z: -1020 }, vel: { x: 0, z: 0 },
    radius: 14, collides: true, team: 0, data: {},
    activity: { presentationTier: PRESENTATION_TIER.R3_UNLOADED },
  };
  const state = makeState([player, wreck]);
  state.render = { activityFrame: { complete: true, renderGlassIds: [1], renderRunwayIds: [] } };

  assert.equal(isEntityRenderRelevant(wreck, state), false,
    'off the live screen, an unloaded record stays unloaded');

  // Combat group-fit: the camera pulls out and its look-at leads toward the fight.
  state.camera.liveZoom = 528;
  state.camera.focus = { x: 0, z: -600 };
  state.render.cameraFocus = { x: 0, z: -600 };
  const onScreen = isEntityRenderRelevant(wreck, state);
  state.camera.liveZoom = 144;
  assert.equal(isEntityRenderRelevant(wreck, state), false, 'and lets go again once the screen has moved off it');
  assert.equal(onScreen, true,
    'while the wreck is on the live glass its mesh must not be disposed by the residency poll');

  const noFrame = makeState([player, wreck]);
  noFrame.camera.liveZoom = 528;
  noFrame.camera.focus = { x: 0, z: -600 };
  noFrame.render = { cameraFocus: { x: 0, z: -600 } };
  assert.equal(isEntityRenderRelevant(wreck, noFrame), true,
    'the same law holds on the tier fallback path when no complete activity frame exists');
});

test('mesh eviction never sits inside mesh prefetch while the player zooms out', async () => {
  const { renderResidencyRadius } = await import('../src/render/runtime/residencyAdmissionQueries.js');
  const { residencyEvictRadius } = await import('../src/render/tabletopPolicy.js');
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    maxSpeed: 160, data: {},
  };
  const state = makeState([player]);

  // While wheel-out is still damping, residency uses the composed/requested frame for both
  // radii. Cover ordinary and maximum zoom targets through the actual renderer query owner.
  for (const [requestedZoom, composedZoom] of [[220, 220], [330, 330], [250, 290]]) {
    state.camera.zoom = requestedZoom;
    state.camera.liveZoom = 144;
    state.camera.composedZoom = composedZoom;
    const prefetch = renderResidencyRadius(state, 'prefetch');
    const evict = renderResidencyRadius(state, 'evict');
    const expectedEvict = residencyEvictRadius(160, composedZoom, 50, 16 / 9, 60);
    assert.equal(evict, expectedEvict,
      `eviction should follow the current composed zoom (${composedZoom}), not live zoom`);
    assert.ok(evict >= prefetch,
      `eviction must remain outside prefetch at requested zoom ${requestedZoom}`);
  }

  // The old live-only calculation demonstrates the annulus the real query must avoid.
  const liveZoomOnly = residencyEvictRadius(160, 144, 50, 16 / 9, 60);
  const requestedPrefetch = residencyPrefetchRadius(160, 330, 50, 16 / 9, 60);
  assert.ok(liveZoomOnly < requestedPrefetch,
    'live-only eviction would put the evict edge inside the requested prefetch edge');
});
