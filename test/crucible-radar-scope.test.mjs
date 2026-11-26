import { test } from 'node:test';
import assert from 'node:assert/strict';
import { censusRadarContactsStillLayer, createRadarContactsStillCache, radarScopeRange } from '../src/ui/radar.js';
import { projectRadarPoint, tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

test('the normal Swarm scale separates ships in the arena and its enlarged scope sees farther', () => {
  const state = { ui: { radarRange: 4000 }, run: { kind: 'survival', ruleset: 'swarm', phase: 'active' } };
  const range = radarScopeRange(state);
  const metrics = tacticalRadarMetrics(false);
  const pilot = { x: 0, z: 0 };
  const left = projectRadarPoint(pilot, { x: 120, z: 0 }, range, metrics);
  const right = projectRadarPoint(pilot, { x: -120, z: 0 }, range, metrics);
  assert.ok(Math.abs(left.x - right.x) > 20, 'nearby enemies are distinct from the pilot and each other');
  assert.equal(radarScopeRange(state, true), range * 2);
  state.ui.radarRange = 450;
  assert.equal(radarScopeRange(state), 450, 'the dial respects a lower fitted sensor range');
  state.ui.radarRange = 4100;
  state.run.kind = 'adventure';
  assert.equal(radarScopeRange(state), 4100, 'Adventure keeps its ship scope');
});

test('Crucible radar drops sector infrastructure but retains room and wave markers', () => {
  const state = { playerId: 1, factions: {}, run: { kind: null, phase: 'inactive' } };
  const player = { id: 1, pos: { x: 0, z: 0 }, team: 0 };
  const mk = (id, type, data) => ({ id, type, data, pos: { x: id * 20, z: 0 }, alive: true, team: 0 });
  const ambientStation = mk(2, 'station', { isGate: true });
  const ambientBeacon = mk(3, 'beacon', {});
  const room = mk(4, 'station', { roomOwner: 'survival-arena' });
  const flare = mk(5, 'beacon', { swarmGateFlare: true });
  const enemy = mk(6, 'ship', { runCohort: 'survival' }); enemy.team = 2;
  const contacts = [ambientStation, ambientBeacon, room, flare, enemy];
  const hostileMarks = [], infrastructureMarks = [], neutralMarks = [], cache = createRadarContactsStillCache();
  const run = () => censusRadarContactsStillLayer({ contacts, player, playerTeam: 0, state, range: 4000,
    rangeSq: 16000000, metrics: tacticalRadarMetrics(false), targetId: null,
    projectScratch: {}, hostileMarks, infrastructureMarks, neutralMarks, cache,
    hostileOf: e => e === enemy,
    pushHostileMark: e => hostileMarks.push({ entity: e }),
    pushInfrastructureMark: e => infrastructureMarks.push({ entity: e }),
    pushNeutralMark: e => neutralMarks.push({ entity: e }) });
  run();
  assert.ok(infrastructureMarks.some(m => m.entity === ambientStation));
  state.run = { kind: 'survival', phase: 'active' };
  run();
  assert.ok(!infrastructureMarks.some(m => m.entity === ambientStation));
  assert.ok(!neutralMarks.some(m => m.entity === ambientBeacon));
  assert.ok(infrastructureMarks.some(m => m.entity === room));
  assert.ok(neutralMarks.some(m => m.entity === flare));
  assert.ok(hostileMarks.some(m => m.entity === enemy));
  state.run.phase = 'inactive';
  run();
  assert.ok(infrastructureMarks.some(m => m.entity === ambientStation));
});
