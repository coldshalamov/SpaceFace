import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as THREE from 'three';

import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord, planWorldSiteMaterialization } from '../src/systems/worldSiteKernel.js';
import { installWorldSitePresentation } from '../src/render/worldSitePresentation.js';
import { resolveGalaxyMapPrimaryAction } from '../src/ui/galaxyMap.js';
import {
  evaluatePq018MatchedPerformance,
  PQ018_FIXED_GLOBAL_POS,
  PQ018_ROOT_WORLD_ID,
  PQ018_ROUTE_SCHEMA,
} from '../scripts/lib/pq018WreckCathedralPublicRoute.mjs';
import { WORLD_SITE_PUBLIC_ROUTE_DRIVER } from '../scripts/lib/pq017WorldSitePublicRoute.mjs';
import {
  evaluatePq018CoordinateReservation,
  PQ018_COORDINATE_ENVELOPE_RADIUS_WU,
} from '../scripts/lib/pq018CoordinateReservation.mjs';
import {
  createPq018WreckCathedralManifest,
  PQ018_AUTHORIZED_BASE_SHA,
  PQ018_FIXED_SEED,
} from '../scripts/validation-manifests/pq018-wreck-cathedral.mjs';

const SITE_ID = 'world_site_wreck_cathedral';
const repoRoot = new URL('../', import.meta.url);

test('broker manifest binds one serialized Browser/Electron campaign to the Cathedral candidate', () => {
  const manifest = createPq018WreckCathedralManifest();
  assert.equal(manifest.id, 'pq018-wreck-cathedral');
  assert.equal(manifest.runtimeKind, 'browser-electron');
  assert.equal(manifest.maxLaunchesPerCandidate, 1);
  assert.equal(manifest.fixedSeed, PQ018_FIXED_SEED);
  assert.equal(manifest.requireBrokerClaim, true);
  assert.equal(manifest.bindGitRevision, true);
  assert.equal(manifest.authorizedBaseCommit, PQ018_AUTHORIZED_BASE_SHA);
  assert.equal(manifest.runtimeProfile, '1440x900-dark-reduced-motion-reduced-flash');
  assert.equal(manifest.commandArgs[0], 'scripts/probe-pq018-wreck-cathedral.mjs');
  assert.equal(
    PQ018_AUTHORIZED_BASE_SHA,
    '7a8a0c7892e6583f73b42c21c9452559542d3d48',
    'matched evidence must use the exact current pre-PQ-018 parent',
  );
  assert.deepEqual(manifest.scenarioPaths, [
    '.devshots/pq018-wreck-cathedral/baseline/aggregate.json',
    '.devshots/pq018-wreck-cathedral/baseline/browser/evidence.json',
    '.devshots/pq018-wreck-cathedral/baseline/electron/evidence.json',
  ]);
  assert(manifest.regressionSourcePaths.includes('test/pq018-wreck-cathedral.test.mjs'));
  assert(manifest.productionSourcePaths.includes(
    'assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb',
  ));
  assert(manifest.productionSourcePaths.includes(
    'assets/ships/parts/places/place_landmark_wreck_cathedral.glb',
  ));
  assert(manifest.productionSourcePaths.includes('src/render/partsLibrary.js'));
  for (const ownerPath of [
    'src/core/physics.js',
    'src/core/registry.js',
    'src/save/saveSystem.js',
    'src/systems/economy.js',
    'src/systems/factions.js',
    'src/systems/flightV3.js',
    'src/systems/input.js',
    'src/systems/mining.js',
    'src/systems/tetherGameplay.js',
  ]) {
    assert(
      manifest.productionSourcePaths.includes(ownerPath),
      `exact-revision manifest omits route owner ${ownerPath}`,
    );
  }
  assert(manifest.harnessSourcePaths.includes(
    'scripts/lib/pq018WreckCathedralPublicRoute.mjs',
  ));
  assert(manifest.harnessSourcePaths.includes(
    'scripts/build-pq018-wreck-cathedral-release.mjs',
  ));
});

test('validation broker CLI exposes the packet manifest without a package.json mutation', async () => {
  const cli = await readFile(new URL('../scripts/validation-broker-cli.mjs', import.meta.url), 'utf8');
  assert.match(cli, /'pq018-wreck-cathedral': \(\) => import\('\.\/validation-manifests\/pq018-wreck-cathedral\.mjs'\)/);
  assert.match(cli, /mode: 'diagnostic'/);
  const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(packageJson.scripts['check:pq018:wreck-cathedral'], undefined);
});

test('later packets reuse the ordinary public-control driver instead of copying the PQ-017 route', () => {
  for (const helper of [
    'travelThroughOrdinaryGate',
    'cycleToComponent',
    'worldPosition',
    'settleAtWorldRecord',
    'flyToPoint',
    'releaseFlightKeys',
    'startPerformanceWindow',
    'finishPerformanceWindow',
  ]) {
    assert.equal(typeof WORLD_SITE_PUBLIC_ROUTE_DRIVER[helper], 'function', helper);
  }
});

test('the public route observes state but does not inject gameplay events or write game state', async () => {
  const route = await readFile(
    new URL('../scripts/lib/pq018WreckCathedralPublicRoute.mjs', import.meta.url),
    'utf8',
  );
  assert.match(route, new RegExp(PQ018_ROUTE_SCHEMA.replaceAll('.', '\\.')));
  assert.match(route, /page\.keyboard\.press\('KeyN'\)|searchAndSelect\(page, 'Wreck Cathedral'/);
  assert.match(route, /name: 'Track Target', exact: true/);
  assert.match(route, /reduced-flash-enabled-through-settings/);
  assert.match(route, /passThrough:\s*\{/);
  assert.match(route, /page\.keyboard\.down\('KeyB'\)/);
  assert.match(route, /page\.keyboard\.press\('F5'\)/);
  for (const operationId of [
    'extract_bridge_navigation_record',
    'extract_registry_scan',
    'repair_emergency_relay_clock',
    'cut_cargo_clamp_forensics',
    'repair_marker_service_spine',
    'settle_cathedral_black_box',
  ]) {
    assert.match(route, new RegExp(operationId), `live route omits ${operationId}`);
  }
  assert.match(route, /deliverCathedralBlackBox/);
  assert.match(route, /cathedral-hull-failed-by-player-impact/);
  assert.match(route, /cathedral-hull-recovered/);
  assert.match(
    route,
    /approachCathedralCoordinate\(page, routeTimeout\(360_000\)\)/,
    'baseline and candidate must share one ordinary-control approach helper',
  );
  assert.doesNotMatch(route, /SF\?*\.state\s*=|state\.[A-Za-z0-9_.]+\s*=|bus\.emit\(/);
  assert.doesNotMatch(route, /debug|teleport|setPosition|currentSectorId\s*=(?!=)/i);
  assert.doesNotMatch(route, /worldPosition\(page,\s*PQ018_ROOT_WORLD_ID/);
});

test('the Cathedral public-map action follows the ordinary World Site POI contract', async () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const target = {
    id: SITE_ID,
    kind: 'poi',
    mapKind: 'world-site',
    name: manifest.name,
    sectorId: manifest.sectorId,
    x: manifest.placement.pos.x,
    z: manifest.placement.pos.z,
  };
  const action = resolveGalaxyMapPrimaryAction({
    world: { currentSectorId: manifest.sectorId },
  }, target);
  assert.equal(action.kind, 'waypoint');
  assert.equal(action.label, 'Track Target');
  assert.equal(action.coursePayload.autopilot, true);
  assert.equal(
    action.coursePayload.targetWorldRecordId,
    undefined,
    'static Atlas POIs arm a coordinate waypoint; stable runtime identity binds after materialization',
  );
  assert.deepEqual(
    { x: action.coursePayload.pos.x, z: action.coursePayload.pos.z },
    manifest.placement.pos,
  );
});

test('the map route observes the coordinate waypoint actually written by the world owner', async () => {
  const route = await readFile(
    new URL('../scripts/lib/pq018WreckCathedralPublicRoute.mjs', import.meta.url),
    'utf8',
  );
  const navigation = route.match(
    /async function navigateToCathedralThroughPublicMap[\s\S]*?\r?\n}\r?\n\r?\nasync function approachCathedralCoordinate/,
  )?.[0] || '';
  assert.match(navigation, /waypointState\?\.label === label/);
  assert.match(navigation, /waypointState\?\.pos\?\.x/);
  assert.match(navigation, /waypointState\?\.pos\?\.z/);
  assert.doesNotMatch(
    navigation,
    /targetWorldRecordId/,
    'the actor cannot wait for stable runtime identity before the site materializes',
  );
});

test('the baseline route uses the same canonical Ceres global coordinate as the live site', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  assert.deepEqual(PQ018_FIXED_GLOBAL_POS, manifest.placement.pos);
  assert.deepEqual(PQ018_FIXED_GLOBAL_POS, { x: -11988, z: 10892 });
});

test('the 620 WU Cathedral reservation clears Ceres bodies, fields, traffic, and lanes', () => {
  const receipt = evaluatePq018CoordinateReservation();
  assert.equal(PQ018_COORDINATE_ENVELOPE_RADIUS_WU, 620);
  assert.equal(receipt.pass, true, receipt.failures.join('; '));
  assert.deepEqual(receipt.local, { x: 300, z: 2700 });
  assert.deepEqual(receipt.global, PQ018_FIXED_GLOBAL_POS);
  assert(receipt.minimumClearance > 0);
  for (const requiredKind of [
    'station-safe-body',
    'gate-safe-body',
    'asteroid-field',
    'hazard-body',
    'canonical-place',
    'current-traffic-lane',
    'conservative-transit-lane',
    'sector-boundary',
  ]) {
    assert(
      receipt.constraints.some((constraint) => constraint.kind === requiredKind),
      `coordinate reservation omits ${requiredKind}`,
    );
  }
  assert.match(receipt.receiptDigest, /^[0-9a-f]{64}$/);
});

test('the route observes the materialized root record rather than the durable site record', async () => {
  const manifest = worldSiteManifestById(SITE_ID);
  assert.equal(PQ018_ROOT_WORLD_ID, `${manifest.worldObjectId}/root`);
  const route = await readFile(
    new URL('../scripts/lib/pq018WreckCathedralPublicRoute.mjs', import.meta.url),
    'utf8',
  );
  assert.match(route, /snapshot\(page\)[\s\S]*page\.evaluate\(\(\[siteId, rootWorldRecordId\]\)/);
  assert.match(route, /worldRecordId === rootWorldRecordId/);
  assert.match(route, /\[PQ018_SITE_ID, PQ018_ROOT_WORLD_ID\]/);
});

test('matched performance is fail-closed on frame and bounded renderer growth', () => {
  const frameWindow = (p95, memory, render, hitches = 2) => ({
    frameTimes: {
      samples: 80,
      distributionMs: { p95, p99: p95 + 2, max: p95 + 4 },
      hitchesOverThreshold: hitches,
      floorP95BudgetMs: 34,
      floorP95BudgetMet: p95 <= 34,
    },
    threeWebgl: { memory, render },
  });
  const sample = (p95, memory, render, hitches = 2) => ({
    performance: {
      ceresApproach: frameWindow(p95, memory, render, hitches),
      activeOperation: frameWindow(p95, memory, render, hitches),
      leaveReturn: frameWindow(p95, memory, render, hitches),
    },
  });
  const baseline = sample(12, { geometries: 100, textures: 20, programs: 8 }, {
    calls: 110, triangles: 120_000,
  });
  const green = sample(14, { geometries: 180, textures: 46, programs: 12 }, {
    calls: 180, triangles: 220_000,
  });
  assert.deepEqual(evaluatePq018MatchedPerformance(green, baseline).failures, []);
  const red = sample(30, { geometries: 240, textures: 60, programs: 20 }, {
    calls: 260, triangles: 300_000,
  });
  assert.equal(evaluatePq018MatchedPerformance(red, baseline).pass, false);
  assert(evaluatePq018MatchedPerformance(red, baseline).failures.length >= 4);
  const realShapeRed = structuredClone(green);
  realShapeRed.performance.ceresApproach.frameTimes.distributionMs.p95 = 999;
  realShapeRed.performance.ceresApproach.frameTimes.floorP95BudgetMet = false;
  assert.equal(evaluatePq018MatchedPerformance(realShapeRed, baseline).pass, false);
  const fabricatedOldShape = structuredClone(green);
  fabricatedOldShape.performance.ceresApproach.frameTimes = { samples: 80, p95: 1 };
  assert.equal(evaluatePq018MatchedPerformance(fabricatedOldShape, baseline).pass, false);
  const missingLifecycleWindow = structuredClone(green);
  delete missingLifecycleWindow.performance.leaveReturn;
  assert.equal(evaluatePq018MatchedPerformance(missingLifecycleWindow, baseline).pass, false);
  const missingRendererCounters = structuredClone(green);
  missingRendererCounters.performance.activeOperation.threeWebgl = { memory: {}, render: {} };
  const missingRendererEvaluation = evaluatePq018MatchedPerformance(
    missingRendererCounters,
    baseline,
  );
  assert.equal(missingRendererEvaluation.pass, false);
  assert(
    missingRendererEvaluation.failures.some((failure) => (
      failure.includes('Three/WebGL memory.geometries')
    )),
    'empty renderer objects must fail closed rather than producing NaN growth',
  );
  const inheritedRedBaseline = sample(50, { geometries: 100, textures: 20, programs: 8 }, {
    calls: 110, triangles: 120_000,
  }, 200);
  assert.equal(
    evaluatePq018MatchedPerformance(green, inheritedRedBaseline).pass,
    true,
    'an inherited red baseline remains comparison evidence but cannot veto a green candidate',
  );
  const unchangedInheritedRed = structuredClone(inheritedRedBaseline);
  assert.equal(
    evaluatePq018MatchedPerformance(unchangedInheritedRed, inheritedRedBaseline).pass,
    false,
    'route acceptance cannot pass while the candidate remains over the hard frame floor',
  );
  assert.equal(
    evaluatePq018MatchedPerformance(unchangedInheritedRed, inheritedRedBaseline)
      .frames.candidateFloorBudgetMet,
    false,
  );
});

test('probe promotion is campaign-atomic and exact-digest-bound', async () => {
  const probe = await readFile(
    new URL('../scripts/probe-pq018-wreck-cathedral.mjs', import.meta.url),
    'utf8',
  );
  assert.match(probe, /claim\?\.digests\?\.candidateDigest/);
  assert.match(probe, /assert\(candidateDigest,/);
  assert.match(probe, /DIAGNOSTIC \? 'diagnostic' : 'accepted'/);
  assert.match(probe, /promote\(campaignStaging, modeRoot\)/);
  assert.match(probe, /coordinateReservation/);
  assert.match(probe, /performanceComparisonScope/);
  assert.match(probe, /absoluteFloor:/);
  assert.doesNotMatch(probe, /promote\(staging, cellRoot\)/);
});

test('Cathedral presentation retains a stable readable pose under reduced motion and flash', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const presentation = planWorldSiteMaterialization(
    manifest,
    createWorldSiteRecord(manifest, { tick: 0 }),
  ).root.presentation;
  const root = new THREE.Group();
  for (const name of new Set(presentation.fixtures.map((entry) => entry.socketId))) {
    const socket = new THREE.Object3D();
    socket.name = name;
    socket.userData.spacefaceSocket = true;
    root.add(socket);
  }
  const entity = { data: { worldSitePresentation: presentation } };
  const controller = installWorldSitePresentation(root, entity);
  assert.ok(controller);
  const meshes = [];
  root.traverse((object) => {
    if (object.userData.worldSitePresentationFixtureId) meshes.push(object);
  });
  assert.equal(meshes.length, 3);
  controller.update(entity, 0, { reducedMotion: true, reducedFlash: true });
  const first = meshes.map((mesh) => ({
    id: mesh.userData.worldSitePresentationFixtureId,
    scale: mesh.parent.scale.x,
    opacity: mesh.material.opacity,
  }));
  controller.update(entity, 120, { reducedMotion: true, reducedFlash: true });
  const second = meshes.map((mesh) => ({
    id: mesh.userData.worldSitePresentationFixtureId,
    scale: mesh.parent.scale.x,
    opacity: mesh.material.opacity,
  }));
  assert.deepEqual(second, first);
  assert(first.every((entry) => entry.scale === 1 && entry.opacity >= 0.55));
  controller.dispose();
});

void repoRoot;
