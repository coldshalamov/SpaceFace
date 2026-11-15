import { test } from 'node:test';
import assert from 'node:assert/strict';
import { censusRadarContactsStillLayer, createRadarContactsStillCache } from '../src/ui/radar.js';
import { tacticalRadarMetrics } from '../src/ui/map/tacticalMapGrammar.js';

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
