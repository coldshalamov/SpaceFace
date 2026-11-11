// inf-gratitude-parcel — the freighter you saved sends cargo later.
//
// The opening raid's earned-escape fact (a defended raid whose adopted working barge flew on
// with the load, recorded by the causal ledger) was worth one dock hail and nothing after.
// The parcel closes the loop: when that barge next makes a real delivery (freight:arrival), it
// arms exactly one parcel; on its next close pass to the player it launches one gift pod titled
// to the player — law-clean to scoop, an ordinary body through the ordinary jettison spawn —
// with the captain's line spoken from the hull that owed it. A dead captain ships nothing; a
// hard sector exit folds the armed pass; the paid fingerprint never pays twice. Runtime only:
// a WeakMap keyed by state, no new save fields.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { readFileSync } from 'node:fs';
import { GRATITUDE_PARCEL_REGISTER, gratitudeParcelBarkFor } from '../src/data/barks.js';
import {
  gratitudeParcelArrivalReceipt,
  stepGratitudeParcel,
  releaseGratitudeParcel,
} from '../src/world/gratitudeParcel.js';

const CAUSE = {
  shapeId: 'opening_hauler_raid',
  outcome: 'defended',
  adoptedWorkingBarge: true,
  resolutionMethod: 'physical_escape',
  carrierWorldRecordId: 'wr_barge_7',
  fingerprint: 'raid-escape:wr_barge_7:1',
  manifestId: 'manifest_1',
  commodityId: 'cmdty_food',
};

function rig({ sector = 'sector_helios_prime' } = {}) {
  const state = {
    simTime: 1000,
    playerId: 'player',
    world: { currentSectorId: sector },
    aftermathWrecks: { causes: { c1: CAUSE } },
    entities: new Map(),
  };
  const spawned = [];
  const helpers = {
    spawnEntity: (spec) => {
      const pod = { id: 'pod-' + (spawned.length + 1), alive: true, pos: { ...spec.pos }, data: {} };
      spawned.push({ spec, pod });
      state.entities.set(pod.id, pod);
      return pod;
    },
  };
  const o = { state, helpers, bus: createBus() };
  const events = [];
  o.bus.on('gratitude:parcel', (p) => events.push(p));
  return { o, state, helpers, spawned, events };
}

const arrival = (over = {}) => ({
  freighterKey: 'wr_barge_7',
  freighterId: 'hauler-1',
  stationId: 'station_ceres',
  ...over,
});

function dockHauler(state, id = 'hauler-1', name = 'Cobalt Haul') {
  const hauler = { id, alive: true, name, data: { name }, pos: { x: 900, z: 0 } };
  state.entities.set(id, hauler);
  return hauler;
}

function dockPlayer(state, pos = { x: 0, z: 0 }) {
  const me = { id: 'player', alive: true, pos };
  state.entities.set('player', me);
  return me;
}

test('a real delivery by the saved barge arms exactly one parcel', () => {
  const { o } = rig();
  assert.equal(gratitudeParcelArrivalReceipt(o, arrival()), true, 'the first arrival arms');
  assert.equal(gratitudeParcelArrivalReceipt(o, arrival()), false, 'the same arrival never re-arms');
  assert.equal(gratitudeParcelArrivalReceipt(o, arrival({ freighterKey: 'wr_other' })), false,
    'a barge the player never defended owes nothing');
});

test('the close pass launches one titled pod, pays the debt, and speaks once', () => {
  const { o, state, spawned, events } = rig();
  gratitudeParcelArrivalReceipt(o, arrival());
  dockHauler(state);
  dockPlayer(state);
  assert.equal(stepGratitudeParcel(o), true, 'the pass pays');
  assert.equal(spawned.length, 1, 'one gift pod, not a shower');
  const spec = spawned[0].spec;
  assert.equal(spec.data.commodityId, 'cmdty_food');
  assert.equal(spec.data.amount, 2);
  assert.equal(spec.data.ownerId, 'player', 'the pod is titled to the player');
  assert.ok(spawned[0].pod.data.gratitudeParcel, 'the pod carries the gratitude stamp');
  assert.equal(events.length, 1, 'the bark director gets exactly one receipt');
  assert.equal(events[0].from, 'Cobalt Haul');
  assert.equal(stepGratitudeParcel(o), false, 'the paid fingerprint never pays twice');
  assert.equal(gratitudeParcelArrivalReceipt(o, arrival()), false, 'the paid cause stays paid');
});

test('a dead captain ships nothing and the debt waits for a later arrival', () => {
  const { o, state } = rig();
  gratitudeParcelArrivalReceipt(o, arrival());
  dockPlayer(state); // the hauler never docks (dead / gone)
  assert.equal(stepGratitudeParcel(o), false, 'nothing is minted from a dead hull');
  // A later honest arrival re-arms and the debt can pay then.
  const hauler = dockHauler(state);
  hauler.pos = { x: 100, z: 0 };
  assert.equal(gratitudeParcelArrivalReceipt(o, arrival()), true, 're-armed');
  assert.equal(stepGratitudeParcel(o), true);
});

test('distance and sector bound the pass; a hard exit folds the arm', () => {
  const { o, state } = rig();
  gratitudeParcelArrivalReceipt(o, arrival());
  const hauler = dockHauler(state);
  const me = dockPlayer(state, { x: 5000, z: 0 });
  assert.equal(stepGratitudeParcel(o), false, 'a far pass is not a pass');
  me.pos = { x: 0, z: 0 };
  state.world.currentSectorId = 'sector_veil_nebula';
  assert.equal(stepGratitudeParcel(o), false, 'another sector never passes');
  assert.equal(releaseGratitudeParcel(o), true, 'the hard exit folds the arm');
  state.world.currentSectorId = 'sector_helios_prime';
  assert.equal(stepGratitudeParcel(o), false, 'the folded pass stays folded');
});

test('the bark director owns the parcel voice: registered once, whole lines, no placeholders', () => {
  const source = readSource('../src/systems/barkDirector.js');
  assert.match(source, /this\.bus\.on\('gratitude:parcel', this\._onGratitudeParcel\)/,
    'the director subscribes to the parcel receipt');
  assert.match(source, /if \(this\._onGratitudeParcel\) this\.bus\.off\('gratitude:parcel', this\._onGratitudeParcel\)/,
    'destroy unsubscribes');
  assert.match(source, /_speakEventLine\(entity, 'gratitude-parcel', 'gratitude:parcel'/,
    'the line rides the event-line channel from the hull that owed it');
  const barks = readSource('../src/data/barks.js');
  assert.match(barks, /gratitudeParcelBarkFor/);
  // The voice itself: whole lines, no placeholders, one register.
  for (const line of GRATITUDE_PARCEL_REGISTER) {
    assert.ok(line.length > 0 && !/\{/.test(line), `"${line}"`);
  }
  assert.equal(gratitudeParcelBarkFor(0), GRATITUDE_PARCEL_REGISTER[0]);
});


function readSource(rel) {
  return readFileSync(new URL(rel, import.meta.url), 'utf8');
}
