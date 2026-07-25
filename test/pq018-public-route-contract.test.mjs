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
  PQ018_ROUTE_SCHEMA,
} from '../scripts/lib/pq018WreckCathedralPublicRoute.mjs';
import { WORLD_SITE_PUBLIC_ROUTE_DRIVER } from '../scripts/lib/pq017WorldSitePublicRoute.mjs';
import {
  createPq018WreckCathedralManifest,
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
  assert.equal(manifest.runtimeProfile, '1440x900-dark-reduced-motion-reduced-flash');
  assert.equal(manifest.commandArgs[0], 'scripts/probe-pq018-wreck-cathedral.mjs');
  assert.deepEqual(manifest.scenarioPaths, [
    '.devshots/pq018-wreck-cathedral/baseline/aggregate.json',
    '.devshots/pq018-wreck-cathedral/baseline/browser/evidence.json',
    '.devshots/pq018-wreck-cathedral/baseline/electron/evidence.json',
  ]);
  assert(manifest.regressionSourcePaths.includes('test/pq018-wreck-cathedral.test.mjs'));
  assert(manifest.productionSourcePaths.includes(
    'assets/ships/release/parts/places/place_landmark_wreck_cathedral.glb',
  ));
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
  assert.match(
    route,
    /flyToPoint\(page, PQ018_FIXED_GLOBAL_POS, 120, routeTimeout\(360_000\)\)/,
    'the matched baseline leg retains the reproduced cold-flight time budget',
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
  assert.deepEqual(
    { x: action.coursePayload.pos.x, z: action.coursePayload.pos.z },
    manifest.placement.pos,
  );
});

test('the baseline route uses the same canonical Ceres global coordinate as the live site', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  assert.deepEqual(PQ018_FIXED_GLOBAL_POS, manifest.placement.pos);
  assert.deepEqual(PQ018_FIXED_GLOBAL_POS, { x: -11988, z: 10892 });
});

test('matched performance is fail-closed on frame and bounded renderer growth', () => {
  const sample = (p95, memory, render, hitches = 2) => ({
    performance: {
      ceresApproach: {
        frameTimes: {
          samples: 80,
          distributionMs: { p95 },
          hitchesOverThreshold: hitches,
          floorP95BudgetMs: 34,
          floorP95BudgetMet: p95 <= 34,
        },
        threeWebgl: { memory, render },
      },
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
  const inheritedRedBaseline = sample(50, { geometries: 100, textures: 20, programs: 8 }, {
    calls: 110, triangles: 120_000,
  }, 200);
  const unchangedInheritedRed = structuredClone(inheritedRedBaseline);
  assert.equal(
    evaluatePq018MatchedPerformance(unchangedInheritedRed, inheritedRedBaseline).pass,
    true,
    'a packet may preserve an inherited red floor but may not regress it',
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
