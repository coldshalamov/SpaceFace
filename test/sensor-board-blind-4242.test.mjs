// A dead or jammed sensor bank already refuses the scan pulse. The scope
// kept painting the same contacts. Seed 4242: the census is the scope.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  censusRadarContactsStillLayer,
  createRadarContactsStillCache,
  radarBoardBlind,
} from '../src/ui/radar.js';
import { tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

const RANGE = 4000;
const rangeSq = RANGE * RANGE;
const metrics = tacticalRadarMetrics(false);

function ship(id, x, team) {
  return {
    id, type: 'ship', alive: true, team, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { namedLaneContactId: `lane-${id}` },
  };
}
function station(id, x, gate) {
  return {
    id, type: 'station', alive: true, team: 0, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: gate ? { isGate: true } : {},
  };
}
function wreck(id, x) {
  return {
    id, type: 'wreck', alive: true, team: 0, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
}

const CONTACTS = [
  ship(10, 900, 0),
  ship(11, 1200, 1),
  wreck(12, 700),
  station(50, 2200, false),
  station(51, 2800, true),
  ship(16, 5200, 1),
];

function stateFor(mode) {
  const sensor = { effectiveDisabled: mode === 'out' };
  const capabilities = mode === 'jammed' ? { sensor: false } : { sensor: true };
  return {
    playerId: 1,
    factions: {},
    meta: { seed: 4242 },
    combat: {
      entities: {
        1: { subsystems: { subsystem_sensor: sensor }, capabilities },
      },
    },
  };
}

function census(mode, cache = createRadarContactsStillCache()) {
  const player = { id: 1, pos: { x: 0, z: 0 }, team: 0 };
  const state = stateFor(mode);
  const hostile = [];
  const infra = [];
  const neutral = [];
  const ghosts = [];
  const marks = (list) => ({
    set length(v) { list.length = v; },
    get length() { return list.length; },
  });
  const result = censusRadarContactsStillLayer({
    contacts: CONTACTS,
    player,
    playerTeam: 0,
    state,
    range: RANGE,
    rangeSq,
    metrics,
    targetId: 11,
    projectScratch: { x: 0, y: 0, dx: 0, dz: 0, distance: 0, offRange: false, angle: 0, scale: 0, resolved: true },
    pushHostileMark: (entity) => hostile.push(entity.id),
    pushInfrastructureMark: (entity) => infra.push(entity.id),
    pushNeutralMark: (entity) => neutral.push(entity.id),
    hostileMarks: marks(hostile),
    infrastructureMarks: marks(infra),
    neutralMarks: marks(neutral),
    cache,
    hostileOf: (entity) => entity.team === 1,
    veil: false,
    ghostMarks: marks(ghosts),
    pushGhostMark: (entity) => ghosts.push(entity.id),
  });
  return { result, hostile, infra, neutral, ghosts, blind: radarBoardBlind(state, player) };
}

test('seed 4242 a live sensor bank still paints the scope', () => {
  const seen = census('live');
  assert.equal(seen.blind, false);
  assert.deepEqual(seen.hostile.sort(), [11]);
  assert.ok(seen.neutral.includes(10));
  assert.ok(seen.neutral.includes(12));
  assert.deepEqual(seen.infra.sort(), [50, 51]);
  assert.equal(seen.result.nearestOffRangeHostile.id, 16);
});

test('seed 4242 a dead sensor bank clears sensed marks and keeps the chart', () => {
  const dead = census('out');
  assert.equal(dead.blind, true);
  assert.deepEqual(dead.hostile, []);
  assert.deepEqual(dead.neutral, []);
  assert.deepEqual(dead.ghosts, []);
  assert.equal(dead.result.nearestOffRangeHostile, null);
  assert.deepEqual(dead.infra.sort(), [50, 51]);
  assert.equal(dead.result.hostileCount, 0);
});

test('seed 4242 a jammed bank clears the same marks, and the scope returns when the bank does', () => {
  const cache = createRadarContactsStillCache();
  const jammed = census('jammed', cache);
  assert.equal(jammed.blind, true);
  assert.deepEqual(jammed.hostile, []);
  assert.deepEqual(jammed.neutral, []);
  assert.deepEqual(jammed.infra.sort(), [50, 51]);
  const back = census('live', cache);
  assert.equal(back.blind, false);
  assert.equal(back.result.skipped, false);
  assert.deepEqual(back.hostile, [11]);
  assert.ok(back.neutral.includes(10));
});
