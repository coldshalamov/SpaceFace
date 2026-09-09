// Exact tests for the galaxy-map intentional-gate Jump public seam.
// Complements professional-travel-public-route-contract.test.mjs.
// Run: node --test test/galaxy-map-gate-jump-seam.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  isOneHopNeighbor,
  isPlayerInGateRange,
  resolveGalaxyMapPrimaryAction,
  emitGalaxyMapPrimaryAction,
  buildSystemModel,
} from '../src/ui/galaxyMap.js';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const GALAXY_SRC = readFileSync(join(ROOT, 'src/ui/galaxyMap.js'), 'utf8');
const STARMAP_SRC = readFileSync(join(ROOT, 'src/ui/screens/starmap.js'), 'utf8');

test('seam source: galaxyMap reads live gateTo and emits world:requestJump', () => {
  assert.match(GALAXY_SRC, /data\.gateTo/);
  assert.match(GALAXY_SRC, /world:requestJump/);
  assert.match(GALAXY_SRC, /via:\s*['"]gate['"]/);
  assert.match(GALAXY_SRC, /Set Course & Jump/);
  // Must not invent a second jump state machine.
  assert.doesNotMatch(GALAXY_SRC, /jump\.state\s*=/);
  assert.doesNotMatch(GALAXY_SRC, /enterSector\s*\(/);
});

test('seam source: legacy starmap jump payload shape is preserved', () => {
  assert.match(STARMAP_SRC, /world:requestJump/);
  assert.match(STARMAP_SRC, /via:\s*['"]gate['"]/);
  assert.match(STARMAP_SRC, /Set Course &amp; Jump|Set Course & Jump/);
});

test('buildSystemModel exposes gateTo as targetSectorId for live gates', () => {
  const gate = {
    id: 42,
    type: 'station',
    alive: true,
    pos: { x: 1200, z: -400 },
    factionId: 'faction_scn',
    data: {
      isGate: true,
      gateTo: 'sector_ceres_belt',
      name: 'Gate → Ceres Belt',
      dockRadius: 70,
    },
  };
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          name: 'Helios Prime',
          neighbors: ['sector_ceres_belt'],
          stations: [],
        },
      },
    },
    entities: new Map([[42, gate]]),
    entityList: [gate],
    playerId: 1,
  };
  const model = buildSystemModel(state, 'sector_helios_prime');
  const gatePoint = model.points.find((p) => p.kind === 'gate');
  assert.ok(gatePoint, 'live gate must appear in system model');
  assert.equal(gatePoint.targetSectorId, 'sector_ceres_belt');
  assert.equal(gatePoint.name, 'Gate → Ceres Belt');
});

test('primary action matrix: sector one-hop jump, multi-hop route, station waypoint', () => {
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          neighbors: ['sector_ceres_belt'],
        },
        sector_ceres_belt: { id: 'sector_ceres_belt', neighbors: ['sector_helios_prime'] },
        sector_sker_haven: { id: 'sector_sker_haven', neighbors: [] },
      },
    },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, radius: 8 }]]),
    playerId: 1,
  };
  assert.equal(isOneHopNeighbor(state, 'sector_ceres_belt'), true);
  assert.equal(
    resolveGalaxyMapPrimaryAction(state, { kind: 'sector', id: 'sector_ceres_belt' }).kind,
    'jump',
  );
  assert.equal(
    resolveGalaxyMapPrimaryAction(state, { kind: 'sector', id: 'sector_sker_haven' }).kind,
    'route',
  );
  assert.equal(
    resolveGalaxyMapPrimaryAction(state, {
      kind: 'station',
      name: 'Helios Station',
      x: 10,
      z: 20,
      stationId: 'station_helios',
    }).kind,
    'waypoint',
  );
});

test('physical gate action jumps only for the live in-range gate', () => {
  const player = { id: 1, pos: { x: 0, z: 0 }, radius: 8 };
  const gate = {
    id: 42,
    type: 'station',
    alive: true,
    pos: { x: 220, z: 0 },
    radius: 32,
    data: {
      isGate: true,
      gateTo: 'sector_ceres_belt',
      name: 'Gate → Ceres Belt',
      dockRadius: 70,
    },
  };
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime',
          neighbors: ['sector_ceres_belt'],
          stations: [],
        },
        sector_ceres_belt: { id: 'sector_ceres_belt', neighbors: ['sector_helios_prime'] },
      },
    },
    entities: new Map([[player.id, player], [gate.id, gate]]),
    entityList: [player, gate],
    playerId: player.id,
  };
  const target = buildSystemModel(state).points.find((point) => point.kind === 'gate');
  assert.ok(target, 'live gate target exists');
  assert.equal(target.targetSectorId, 'sector_ceres_belt');

  assert.equal(isPlayerInGateRange(state, target), false);
  assert.equal(resolveGalaxyMapPrimaryAction(state, target).kind, 'waypoint');

  player.pos.x = 100;
  assert.equal(isPlayerInGateRange(state, target), true);
  assert.equal(resolveGalaxyMapPrimaryAction(state, target).kind, 'jump');

  assert.equal(
    resolveGalaxyMapPrimaryAction(state, {
      kind: 'gate',
      entityId: 999,
      targetSectorId: 'sector_ceres_belt',
      x: player.pos.x,
      z: player.pos.z,
    }).kind,
    'waypoint',
    'a coordinate-only or stale gate target cannot request an instant jump',
  );
});

test('out-of-range gate emits only a waypoint; route and station intents stay distinct', () => {
  const state = {
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: { id: 'sector_helios_prime', neighbors: ['sector_ceres_belt'] },
        sector_ceres_belt: { id: 'sector_ceres_belt', neighbors: ['sector_helios_prime'] },
        sector_sker_haven: { id: 'sector_sker_haven', neighbors: [] },
      },
    },
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 }, radius: 8 }]]),
    playerId: 1,
  };
  const cases = [
    {
      target: { kind: 'gate', entityId: 42, targetSectorId: 'sector_ceres_belt', x: 500, z: 0, name: 'Gate' },
      expectedEvents: ['ui:setCourse', 'toast'],
    },
    {
      target: { kind: 'sector', id: 'sector_sker_haven', name: 'Sker Haven' },
      expectedEvents: ['world:requestRoute', 'ui:setCourse', 'toast'],
    },
    {
      target: { kind: 'station', stationId: 'station_helios', x: 20, z: 30, name: 'Helios Station' },
      expectedEvents: ['ui:setCourse', 'toast'],
    },
  ];

  for (const entry of cases) {
    const log = [];
    const action = resolveGalaxyMapPrimaryAction(state, entry.target);
    assert.equal(emitGalaxyMapPrimaryAction({ emit(type, payload) { log.push([type, payload]); } }, action), true);
    assert.deepEqual(log.map(([type]) => type), entry.expectedEvents);
    assert.equal(log.some(([type]) => type === 'world:requestJump'), false);
  }
});

test('emit jump does not emit requestRoute-only; course is still set', () => {
  const log = [];
  const bus = { emit(t, p) { log.push([t, p]); } };
  emitGalaxyMapPrimaryAction(bus, {
    kind: 'jump',
    targetSectorId: 'sector_ceres_belt',
    coursePayload: { type: 'sector', sectorId: 'sector_ceres_belt', path: null, label: 'Ceres Belt' },
  });
  assert.deepEqual(
    log.filter((e) => e[0] === 'world:requestJump').map((e) => e[1]),
    [{ targetSectorId: 'sector_ceres_belt', via: 'gate' }],
  );
  assert.ok(log.some((e) => e[0] === 'ui:setCourse'));
});
