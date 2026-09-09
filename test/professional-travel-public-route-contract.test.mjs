// Non-headed contracts for PROFESSIONAL-TRAVEL-PUBLIC-ROUTE-HARNESS.
// Run: node --test test/professional-travel-public-route-contract.test.mjs
//      npm run check:professional-travel:public-route:contracts

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  TRAVEL_ROUTE_SCHEMA,
  TRAVEL_REQUIRED_MARKS,
  TRAVEL_SCREENSHOTS,
  TRAVEL_DESTINATION,
  evaluateJumpReceipts,
  validateTravelRouteSources,
} from '../scripts/lib/professionalTravelPublicRoute.mjs';
import {
  isOneHopNeighbor,
  resolveGalaxyMapPrimaryAction,
  emitGalaxyMapPrimaryAction,
  resolveCourseTarget,
  isPlayerInGateRange,
} from '../src/ui/galaxyMap.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTE = path.join(ROOT, 'scripts', 'lib', 'professionalTravelPublicRoute.mjs');
const BROWSER = path.join(ROOT, 'scripts', 'check-professional-travel-public-route-browser.mjs');
const ELECTRON = path.join(ROOT, 'scripts', 'check-professional-travel-public-route-electron.mjs');
const GALAXY = path.join(ROOT, 'src', 'ui', 'galaxyMap.js');
const PACKAGE = path.join(ROOT, 'package.json');

test('travel route files exist', () => {
  assert.equal(existsSync(ROUTE), true);
  assert.equal(existsSync(BROWSER), true);
  assert.equal(existsSync(ELECTRON), true);
});

test('package wires browser/electron/contracts scripts exactly once each', async () => {
  const pkg = JSON.parse(await readFile(PACKAGE, 'utf8'));
  assert.equal(
    pkg.scripts['check:professional-travel:public-route:contracts'],
    'node --test test/professional-travel-public-route-contract.test.mjs test/galaxy-map-gate-jump-seam.test.mjs',
  );
  assert.equal(
    pkg.scripts['check:professional-travel:public-route:browser'],
    'npm run check:professional-travel:public-route:contracts && node scripts/check-professional-travel-public-route-browser.mjs',
  );
  assert.equal(
    pkg.scripts['check:professional-travel:public-route:electron'],
    'npm run check:professional-travel:public-route:contracts && node scripts/check-professional-travel-public-route-electron.mjs',
  );
  assert.equal(
    pkg.scripts['check:professional-travel:public-route'],
    'npm run check:professional-travel:public-route:browser && npm run check:professional-travel:public-route:electron',
  );
  // Headed gates must not be duplicated into the broad check:ci aggregate accidentally more than once.
  for (const name of Object.keys(pkg.scripts)) {
    if (name === 'check:professional-travel:public-route:browser') continue;
    if (name === 'check:professional-travel:public-route') continue;
    assert.equal(
      String(pkg.scripts[name] || '').split('check-professional-travel-public-route-browser.mjs').length - 1,
      0,
      `${name} must not duplicate headed browser travel route`,
    );
  }
});

test('shared sources fail closed on injection patterns and require public seams', async () => {
  const [routeSrc, browserSrc, electronSrc, galaxySrc] = await Promise.all([
    readFile(ROUTE, 'utf8'),
    readFile(BROWSER, 'utf8'),
    readFile(ELECTRON, 'utf8'),
    readFile(GALAXY, 'utf8'),
  ]);
  // Route + harnesses only — galaxyMap is allowed to emit world:requestJump as the public seam.
  const harness = validateTravelRouteSources({ routeSrc, browserSrc, electronSrc });
  assert.deepEqual(harness.failures, [], harness.failures.join('; '));

  // Harnesses must share the one route core.
  assert.match(browserSrc, /runProfessionalTravelPublicRoute/);
  assert.match(electronSrc, /runProfessionalTravelPublicRoute/);
  assert.match(browserSrc, /professionalTravelPublicRoute\.mjs/);
  assert.match(electronSrc, /professionalTravelPublicRoute\.mjs/);

  // Galaxy map owns the Jump public seam (not an alternate game path).
  assert.match(galaxySrc, /world:requestJump/);
  assert.match(galaxySrc, /Set Course & Jump/);
  assert.match(galaxySrc, /gateTo/);
  assert.match(galaxySrc, /emitGalaxyMapPrimaryAction/);
  assert.match(galaxySrc, /resolveGalaxyMapPrimaryAction/);
});

test('screenshot + mark contracts are complete', () => {
  assert.equal(TRAVEL_ROUTE_SCHEMA, 'spaceface.professionalTravelPublicRoute.v1');
  assert.equal(TRAVEL_SCREENSHOTS.approach, '05-gate-approach.png');
  assert.equal(TRAVEL_SCREENSHOTS.commitWindow, '06-jump-commit-window.png');
  assert.equal(TRAVEL_SCREENSHOTS.arrival, '07-arrival-destination.png');
  assert.ok(TRAVEL_REQUIRED_MARKS.includes('gate-range-reached'));
  assert.ok(TRAVEL_REQUIRED_MARKS.includes('jump-aligning'));
  assert.ok(TRAVEL_REQUIRED_MARKS.includes('jump-commit-window'));
  assert.ok(TRAVEL_REQUIRED_MARKS.includes('jump-arrived'));
  assert.ok(TRAVEL_REQUIRED_MARKS.includes('continue-destination-restored'));
  assert.equal(TRAVEL_DESTINATION.sectorId, 'sector_ceres_belt');
});

test('evaluateJumpReceipts accepts a complete intentional gate chain', () => {
  const events = [
    { event: 'jump:chargeStart', payload: { targetSectorId: 'sector_ceres_belt', via: 'gate', chargeNeeded: 3 } },
    { event: 'jump:chargeTick', payload: { progress: 0.4 } },
    { event: 'jump:chargeTick', payload: { progress: 0.75 } },
    { event: 'presentation:cue', payload: { id: 'travel.jump.commit_window' } },
    { event: 'jump:start', payload: { from: 'sector_helios_prime', to: 'sector_ceres_belt', via: 'gate' } },
    { event: 'presentation:cue', payload: { id: 'travel.jump.committed', tags: ['no_return'] } },
    { event: 'sector:enter', payload: { sectorId: 'sector_ceres_belt', continuous: false } },
    { event: 'jump:arrive', payload: { sectorId: 'sector_ceres_belt', interdicted: false } },
  ];
  const result = evaluateJumpReceipts(events);
  assert.equal(result.pass, true, result.failures.join('; '));
});

test('evaluateJumpReceipts fails closed on missing commit/arrive', () => {
  const result = evaluateJumpReceipts([
    { event: 'jump:chargeStart', payload: { targetSectorId: 'sector_ceres_belt', via: 'gate' } },
  ]);
  assert.equal(result.pass, false);
  assert.ok(result.failures.length >= 1);
});

test('galaxy map pure helpers: one-hop neighbor → Set Course & Jump', () => {
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          neighbors: ['sector_ceres_belt', 'sector_tethys_junction'],
        },
        sector_ceres_belt: { id: 'sector_ceres_belt', neighbors: ['sector_helios_prime'] },
        sector_ashfall_reach: { id: 'sector_ashfall_reach', neighbors: [] },
      },
    },
    entities: new Map(),
    playerId: 1,
  };
  assert.equal(isOneHopNeighbor(state, 'sector_ceres_belt'), true);
  assert.equal(isOneHopNeighbor(state, 'sector_ashfall_reach'), false);

  const action = resolveGalaxyMapPrimaryAction(state, {
    kind: 'sector',
    id: 'sector_ceres_belt',
    name: 'Ceres Belt',
  });
  assert.equal(action.kind, 'jump');
  assert.equal(action.label, 'Set Course & Jump');
  assert.equal(action.targetSectorId, 'sector_ceres_belt');

  const multi = resolveGalaxyMapPrimaryAction(state, {
    kind: 'sector',
    id: 'sector_ashfall_reach',
    name: 'Ashfall',
  });
  assert.equal(multi.kind, 'route');
  assert.equal(multi.label, 'Plot Course');
});

test('galaxy map pure helpers: gate waypoint vs in-range Jump', () => {
  const player = { id: 1, pos: { x: 0, z: 0 }, radius: 8 };
  const gate = {
    id: 9,
    type: 'station',
    alive: true,
    pos: { x: 50, z: 0 },
    radius: 32,
    data: { isGate: true, gateTo: 'sector_ceres_belt', dockRadius: 70 },
  };
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          neighbors: ['sector_ceres_belt'],
        },
        sector_ceres_belt: { id: 'sector_ceres_belt', neighbors: ['sector_helios_prime'] },
      },
    },
    entities: new Map([[1, player], [9, gate]]),
    playerId: 1,
  };
  const farGateTarget = {
    kind: 'gate',
    name: 'Gate → Ceres Belt',
    entityId: 9,
    targetSectorId: 'sector_ceres_belt',
    x: 3000,
    z: 0,
  };
  // Entity is near; use entityId path.
  assert.equal(isPlayerInGateRange(state, { kind: 'gate', entityId: 9, x: 50, z: 0 }), true);
  const inRange = resolveGalaxyMapPrimaryAction(state, {
    kind: 'gate',
    entityId: 9,
    targetSectorId: 'sector_ceres_belt',
    name: 'Gate → Ceres Belt',
    x: 50,
    z: 0,
  });
  assert.equal(inRange.kind, 'jump');
  assert.equal(inRange.label, 'Jump');

  // Move player far from gate entity.
  player.pos.x = -5000;
  const far = resolveGalaxyMapPrimaryAction(state, farGateTarget);
  assert.equal(far.kind, 'waypoint');
  assert.equal(far.label, 'Set Waypoint');

  const course = resolveCourseTarget({
    kind: 'gate',
    name: 'Gate → Ceres Belt',
    x: 100,
    z: 200,
    targetSectorId: 'sector_ceres_belt',
    entityId: 9,
  });
  assert.equal(course.sectorId, 'sector_ceres_belt');
  assert.equal(course.autopilot, true);
});

test('emitGalaxyMapPrimaryAction emits world:requestJump for jump kind only', () => {
  const emitted = [];
  const bus = { emit(type, payload) { emitted.push({ type, payload }); } };
  emitGalaxyMapPrimaryAction(bus, {
    kind: 'jump',
    targetSectorId: 'sector_ceres_belt',
    coursePayload: { type: 'sector', sectorId: 'sector_ceres_belt', path: null, label: 'Ceres Belt' },
  });
  assert.ok(emitted.some((e) => e.type === 'world:requestJump'
    && e.payload.targetSectorId === 'sector_ceres_belt'
    && e.payload.via === 'gate'));
  assert.ok(emitted.some((e) => e.type === 'ui:setCourse'));

  const emitted2 = [];
  const bus2 = { emit(type, payload) { emitted2.push({ type, payload }); } };
  emitGalaxyMapPrimaryAction(bus2, {
    kind: 'waypoint',
    coursePayload: {
      type: 'gate',
      pos: { x: 1, z: 2 },
      label: 'Gate',
      autopilot: true,
      arrivalRadius: 72,
      waypointKind: 'nav',
    },
  });
  assert.ok(!emitted2.some((e) => e.type === 'world:requestJump'));
  assert.ok(emitted2.some((e) => e.type === 'ui:setCourse'));
});
