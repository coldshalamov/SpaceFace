import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { advanceCircuit, gateApproach } from '../src/systems/racingGeometry.js';
import { RACING_PRECISION, scoreRacingPrecision } from '../src/systems/racingPrecision.js';
import { flightV3 } from '../src/systems/flightV3.js';

function harness() {
  const gates = [{ x: 0, z: 0 }, { x: 1000, z: 0 }, { x: 1000, z: 1000 }, { x: 0, z: 0 }];
  const params = { racingContractId: 'precision-test', closedCircuit: true, raceStartSimS: 0,
    gateRadiusWU: 90, gates, nextGate: 0, lap: 0, laps: 3 };
  const mission = { id: 'race-1', type: 'race', status: 'active', params };
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, boost: { max: 100, energy: 10 } };
  const state = { mode: 'flight', playerId: 1, entities: new Map([[1, player]]), missions: { active: [mission] } };
  const bus = createBus(), flight = { ...flightV3 };
  flight.init({ state, bus });
  let now = 0;
  function cross({ offset = 0, speed = 200, alignment = 1, sweep = 0 } = {}) {
    const index = params.nextGate, gate = gates[index], from = gateApproach(gates, index);
    const point = (along, side) => ({ x: gate.x + from.nx * along - from.nz * side,
      z: gate.z + from.nz * along + from.nx * side });
    const sample = {
      prev: point(-10, offset - sweep), pos: point(10, offset + sweep),
      vel: { x: speed * (from.nx * alignment - from.nz * Math.sqrt(1 - alignment ** 2)),
        z: speed * (from.nz * alignment + from.nx * Math.sqrt(1 - alignment ** 2)) },
      gates, previousTime: now, now: ++now,
    };
    const events = advanceCircuit(params, sample);
    assert.equal(events.length, 1);
    const result = scoreRacingPrecision(mission, events[0], sample);
    Object.assign(params, result.patch);
    if (result.intent) bus.emit('flight:racePrecision', result.intent);
    return { ...result, event: events[0], sample };
  }
  return { gates, params, mission, player, state, bus, cross };
}

test('ordered precise gates grow a capped boost refill through the live flight owner', () => {
  const h = harness();
  const initialMotion = JSON.stringify({ pos: h.player.pos, vel: h.player.vel });
  assert.equal(h.cross().intent.energy, 2);
  assert.equal(h.cross().intent.energy, 3);
  assert.equal(h.cross().intent.energy, 4);
  assert.equal(h.cross().intent.energy, 5);
  assert.equal(h.params.lap, 1);
  assert.equal(h.cross().intent.energy, 5, 'the next lap skips the already-shared finish/start gate');
  assert.equal(h.params.precisionChain, 5);
  assert.equal(h.params.precisionBest, 5);
  assert.equal(h.player.boost.energy, 29);
  assert.equal(JSON.stringify({ pos: h.player.pos, vel: h.player.vel }), initialMotion, 'reward never writes motion');
  h.player.boost.energy = 99;
  h.cross();
  assert.equal(h.player.boost.energy, 100, 'existing fitted pool is the only cap');
});

test('precision measures the swept intersection, not the frame endpoint', () => {
  const h = harness();
  const result = h.cross({ sweep: 80 });
  assert.equal(result.reason, 'precise');
  assert.equal(result.patch.lastPrecision.offsetWU, 0);
  assert.equal(h.player.boost.energy, 12);
});

for (const [reason, input] of [
  ['wide', { offset: 30 }], ['slow', { speed: RACING_PRECISION.minSpeed - 1 }],
  ['alignment', { alignment: RACING_PRECISION.minAlignment - 0.01 }],
]) test(`${reason} pass breaks the chain and earns no refill`, () => {
  const h = harness();
  h.cross();
  const before = h.player.boost.energy;
  assert.equal(h.cross(input).reason, reason);
  assert.equal(h.player.boost.energy, before);
  assert.equal(h.params.precisionChain, 0);
  assert.equal(h.params.precisionBest, 1);
  assert.equal(h.cross().intent.energy, 2);
});

test('duplicates, forged intents and out-of-order events cannot farm boost', () => {
  const h = harness(), first = h.cross(), before = h.player.boost.energy;
  h.bus.emit('flight:racePrecision', first.intent);
  h.bus.emit('flight:racePrecision', { ...first.intent, energy: 1e9 });
  const duplicate = scoreRacingPrecision(h.mission, first.event, first.sample);
  assert.equal(duplicate.reason, 'duplicate');
  assert.equal(duplicate.intent, null);
  const skipped = scoreRacingPrecision(h.mission, { ...first.event, gateIndex: 2 }, first.sample);
  assert.equal(skipped.reason, 'invalid_order');
  Object.assign(h.params, skipped.patch);
  assert.equal(h.params.precisionChain, 0);
  assert.equal(h.player.boost.energy, before);
  assert.equal(h.cross().intent.energy, 2);
});

test('recovery breaks the chain, consumes its next gate without credit, and preserves replay protection', () => {
  const h = harness(), first = h.cross();
  h.params.resetCount = 1;
  const before = h.player.boost.energy;
  assert.equal(h.cross().reason, 'recovery');
  assert.equal(h.player.boost.energy, before);
  assert.equal(h.params.precisionChain, 0);
  assert.equal(scoreRacingPrecision(h.mission, first.event, first.sample).reason, 'duplicate');
  assert.equal(h.cross().intent.energy, 2);
});

test('detached, completed and ordinary races cannot grant precision energy', () => {
  for (const change of [h => { h.state.missions.active = []; }, h => { h.mission.status = 'completed'; },
    h => { h.state.mode = 'paused'; }, h => { h.player.alive = false; }]) {
    const h = harness(), gate = h.gates[0];
    const sample = { prev: { x: gate.x - 10, z: 0 }, pos: { x: gate.x + 10, z: 0 },
      vel: { x: 200, z: 0 }, gates: h.gates, previousTime: 0, now: 1 };
    const event = advanceCircuit(h.params, sample)[0];
    const result = scoreRacingPrecision(h.mission, event, sample);
    Object.assign(h.params, result.patch);
    change(h);
    h.bus.emit('flight:racePrecision', result.intent);
    assert.equal(h.player.boost.energy, 10);
  }
  const h = harness();
  delete h.params.racingContractId;
  assert.equal(scoreRacingPrecision(h.mission, {}, {}).reason, 'inactive');
  h.bus.emit('flight:racePrecision', { energy: 1000 });
  assert.equal(h.player.boost.energy, 10);
});

test('scored progress survives JSON saves without replaying the previous gate', () => {
  const h = harness(), first = h.cross();
  h.mission.params = JSON.parse(JSON.stringify(h.params));
  const replay = scoreRacingPrecision(h.mission, first.event, first.sample);
  assert.equal(replay.reason, 'duplicate');
  assert.equal(replay.intent, null);
});
