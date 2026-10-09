import test from 'node:test';
import assert from 'node:assert/strict';
import {
  censusRadarContactsStillLayer,
  createRadarContactsStillCache,
  RADAR_TRAFFIC_RANGE_FRACTION,
} from '../src/ui/radar.js';
import { TACTICAL_MAP_PALETTE, tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

// Owner 2026-10-03: the radar dial prioritises — infrastructure and hostiles read sector-wide,
// ordinary small traffic only resolves inside the close band.

const RANGE = 4000;
const rangeSq = RANGE * RANGE;
const metrics = tacticalRadarMetrics(false);
const CLOSE = RANGE * RADAR_TRAFFIC_RANGE_FRACTION;

function harness(contacts, targetId = null) {
  const player = { id: 1, pos: { x: 0, z: 0 }, team: 0 };
  const state = { playerId: 1, factions: {} };
  const hostileMarks = [];
  const infrastructureMarks = [];
  const neutralMarks = [];
  const cache = createRadarContactsStillCache();
  const result = censusRadarContactsStillLayer({
    contacts,
    player,
    playerTeam: 0,
    state,
    range: RANGE,
    rangeSq,
    metrics,
    targetId,
    projectScratch: {
      x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true,
    },
    pushHostileMark: (entity, p, distanceSq) => hostileMarks.push({ entity, distanceSq }),
    pushInfrastructureMark: (entity, p, gate, distanceSq) => infrastructureMarks.push({ entity, distanceSq }),
    pushNeutralMark: (entity, p, distanceSq, meta) => neutralMarks.push({ entity, distanceSq, ...meta }),
    hostileMarks,
    infrastructureMarks,
    neutralMarks,
    cache,
  });
  return { result, hostileMarks, infrastructureMarks, neutralMarks };
}

function ship(id, x, extra = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 0,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: { ...extra },
  };
}

test('ordinary traffic inside the close band draws; beyond it stays off the dial', () => {
  const near = ship(10, CLOSE * 0.5);
  const far = ship(11, CLOSE * 1.5);
  const { neutralMarks } = harness([near, far]);
  assert.ok(neutralMarks.some((m) => m.entity === near), 'close traffic draws');
  assert.ok(!neutralMarks.some((m) => m.entity === far), 'distant traffic hides');
});

test('band scales with the radar range fraction', () => {
  assert.equal(RADAR_TRAFFIC_RANGE_FRACTION, 0.5);
});

test('salient ships ignore the band: mission target, named lane contact, capital, selected target', () => {
  const mission = ship(20, CLOSE * 1.5, { missionTargetSlot: 0 });
  const named = ship(21, CLOSE * 1.5, { namedLaneContactId: 'lane-1' });
  const capital = ship(22, CLOSE * 1.5, { role: 'dreadnought' });
  const selected = ship(23, CLOSE * 1.5);
  const { neutralMarks } = harness(
    [mission, named, capital, selected],
    selected.id,
  );
  for (const salient of [mission, named, capital, selected]) {
    assert.ok(
      neutralMarks.some((m) => m.entity === salient),
      `salient ship ${salient.id} draws beyond the band`,
    );
  }
});

test('hostiles always draw and stations stay on the rim at any distance', () => {
  const farHostile = ship(30, CLOSE * 1.5, { encounter: true });
  farHostile.team = 7; // declared encounter hostility, no AI flags needed
  const farStation = {
    id: 31,
    type: 'station',
    alive: true,
    team: 0,
    pos: { x: RANGE * 2, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    data: {},
  };
  const { hostileMarks, infrastructureMarks } = harness([farHostile, farStation]);
  assert.ok(hostileMarks.some((m) => m.entity === farHostile), 'hostile inside radar range always draws');
  assert.ok(infrastructureMarks.some((m) => m.entity === farStation), 'distant station keeps its rim mark');
});

test('palette carries a distinct hue per contact class', () => {
  const hues = new Set([
    TACTICAL_MAP_PALETTE.hostile,
    TACTICAL_MAP_PALETTE.station,
    TACTICAL_MAP_PALETTE.gate,
    TACTICAL_MAP_PALETTE.friendly,
    TACTICAL_MAP_PALETTE.neutral,
    TACTICAL_MAP_PALETTE.wreck,
    TACTICAL_MAP_PALETTE.objective,
  ]);
  assert.equal(hues.size, 7, 'each class reads as its own colour');
});
