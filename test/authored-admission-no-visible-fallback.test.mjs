import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  authoredBootstrapPreloadPlan,
  buildAuthoredPlaceProp,
  isInitialAuthoredCompositionEntity,
  wrapShipWithAuthoredParts,
} from '../src/render/partsLibrary.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';

function fallback(name) {
  const root = new THREE.Group();
  root.name = name;
  root.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial()));
  return root;
}

test('required starter boundary fails closed instead of publishing its procedural body', () => {
  const procedural = fallback('ProceduralStarter');
  const boundary = wrapShipWithAuthoredParts({
    id: 1,
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  }, procedural, { releaseMode: true, requiredWholeShip: true });

  assert.equal(procedural.visible, false);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
  assert.equal(boundary.userData.renderContract.gracefulFallback, false);
});

test('an empty authored admission substrate can be demanded without a renderable trigger', () => {
  const substrate = new THREE.Group();
  substrate.name = 'DirectAuthoredAdmissionSubstrate';
  substrate.userData.authoredAdmissionSubstrate = true;
  const boundary = wrapShipWithAuthoredParts({
    id: 10,
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  }, substrate, { releaseMode: true, requiredWholeShip: true });

  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
  let renderables = 0;
  boundary.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints) renderables++;
  });
  assert.equal(renderables, 0, 'the direct authored boundary must allocate no temporary drawables');
});

test('the live direct-authored route skips bespoke and procedural ship construction', () => {
  let proceduralBuilds = 0;
  let heroBuilds = 0;
  const factory = {
    build() {
      proceduralBuilds++;
      return fallback('WrongProceduralIdentity');
    },
  };
  installVisualOverrides(factory, {
    releaseMode: true,
    directAuthoredMount: true,
    kestrelBuilder() {
      heroBuilds++;
      return fallback('ObsoleteHeroSubstrate');
    },
  });

  const boundary = factory.build({
    id: 11,
    type: 'ship',
    isPlayer: true,
    alive: true,
    data: { defId: 'ship_kestrel' },
  });

  assert.equal(heroBuilds, 0, 'resident authored ships must not construct the retired hero body');
  assert.equal(proceduralBuilds, 0, 'resident authored ships must not construct a generic body');
  assert.equal(boundary.userData.authoredAdmissionSubstrate, true);
  assert.equal(boundary.userData.authoredAdmissionTemporaryDrawables, 0,
    'direct admission diagnostics must describe the retired substrate without polluting the authored render contract');
  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
  let renderables = 0;
  boundary.traverse((object) => {
    if (object.isMesh || object.isLine || object.isPoints) renderables++;
  });
  assert.equal(renderables, 0, 'nothing can draw before the exact authored body is admitted');
});

test('direct authored mounting also skips ordinary NPC construction', () => {
  let proceduralBuilds = 0;
  const factory = {
    build() {
      proceduralBuilds++;
      return fallback('ProceduralNpc');
    },
  };
  installVisualOverrides(factory, { releaseMode: true, directAuthoredMount: true });

  const boundary = factory.build({
    id: 12,
    type: 'ship',
    alive: true,
    factionId: 'neutral',
    data: { defId: 'ship_mule' },
  });

  assert.equal(proceduralBuilds, 0);
  assert.equal(boundary.userData.shipConstruction, 'authored-direct');
  assert.equal(typeof boundary.userData.requestAuthoredUpgrade, 'function');
});

test('preview and precompile paths retain explicit procedural construction', () => {
  let previewBuilds = 0;
  const previewFactory = {
    build() {
      previewBuilds++;
      return fallback('PreviewShip');
    },
  };
  installVisualOverrides(previewFactory, { releaseMode: false, authoredShips: false });
  const preview = previewFactory.build({ id: 13, type: 'ship', alive: true, data: { defId: 'ship_mule' } });
  assert.equal(previewBuilds, 1);
  assert.equal(preview.name, 'PreviewShip');

  let precompileBuilds = 0;
  const precompileFactory = {
    build() {
      precompileBuilds++;
      return fallback('PrecompileShip');
    },
  };
  installVisualOverrides(precompileFactory, { releaseMode: false, directAuthoredMount: true });
  const probe = precompileFactory.build({
    id: 14,
    type: 'ship',
    alive: true,
    data: { defId: 'ship_mule', precompileProbe: true },
  });
  assert.equal(precompileBuilds, 1);
  assert.equal(probe.name, 'PrecompileShip');
});

test('authored world-place boundary does not publish the temporary box', () => {
  const boundary = buildAuthoredPlaceProp({
    id: 2,
    type: 'fx',
    alive: true,
    radius: 12,
    data: { placeId: 'place_asteroid_rock_a' },
  }, { releaseMode: true });
  const temporary = boundary.children[0];

  assert.ok(temporary);
  assert.equal(temporary.visible, false);
  assert.equal(boundary.userData.authoredAssetState, 'awaiting-authored-admission');
  assert.equal(boundary.userData.authoredVisualRoot, 'none-pending-admission');
});

test('an authored visual builder failure never publishes a different procedural identity', () => {
  let fallbackBuilds = 0;
  const factory = {
    build() {
      fallbackBuilds++;
      return fallback('WrongProceduralIdentity');
    },
  };
  installVisualOverrides(factory, {
    releaseMode: false,
    authoredPlaceBuilder() { throw new Error('synthetic authored place failure'); },
    onWarning() {},
  });

  const visual = factory.build({
    id: 3,
    type: 'fx',
    alive: true,
    data: { placeId: 'place_asteroid_rock_a' },
  });

  assert.equal(fallbackBuilds, 0);
  assert.equal(visual.visible, false);
  assert.equal(visual.children.length, 0);
  assert.equal(visual.userData.authoredAssetState, 'unavailable');
  assert.equal(visual.userData.authoredVisualRoot, 'none-build-failed');
});

test('boot preload contains only the opening-shot identities', () => {
  const plan = authoredBootstrapPreloadPlan();
  const hulls = new Set(plan.hull || []);

  assert.deepEqual([...hulls], ['wholeships/kestrel.glb']);
  for (const file of [
    'wholeships/wasp_production_v1.glb',
    'wholeships/ashline_dart.glb',
    'wholeships/ashline_lode.glb',
    'wholeships/ashline_rig.glb',
    'wholeships/helios_lark.glb',
    'wholeships/helios_cradle.glb',
    'wholeships/helios_span.glb',
  ]) assert.equal(hulls.has(file), false, `deferred production body must not tax boot residency: ${file}`);

  assert.equal(plan.place, undefined,
    'boot residency stays limited to the player; the live Helios entity owns its exact place plan');

  const player = { id: 1, alive: true, type: 'ship', pos: { x: 0, z: 0 } };
  const helios = {
    id: 'station_helios', alive: true, type: 'station', pos: { x: 600, z: 0 },
    data: {
      stationId: 'station_helios', sectorId: 'sector_helios_prime',
      archetypeGlb: 'place_station_trade_hub',
    },
  };
  const state = { playerId: 1, entities: new Map([[1, player]]) };
  assert.equal(isInitialAuthoredCompositionEntity(helios, state), true,
    'the critical starting hub remains an exact loading-gated authored boundary');

  assert.equal([...hulls].some((file) => /_lod[12]\.glb$/.test(file)), false);
});
