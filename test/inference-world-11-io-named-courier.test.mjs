// WORLD-11 — Io Reach traffic can include one named courier.
// The done check: pickNamedLaneContact can return an Io-only id, and the live traffic owner stamps
// that identity onto a real ambient freighter.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  LANE_GIMMICK_LABELS,
  NAMED_LANE_CONTACTS,
  pickNamedLaneContact,
} from '../src/data/laneContacts.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

const IO = 'sector_io_reach';

test('WORLD-11: an Io-only named courier exists and is the only Io pick', () => {
  const pool = NAMED_LANE_CONTACTS.filter((c) => c.sectorIds && c.sectorIds.includes(IO));
  assert.equal(pool.length, 1, 'exactly one authored Io lane contact keeps the pick deterministic');
  const io = pool[0];
  assert.equal(io.id, 'lane_maro_keelwright');
  assert.equal(io.role, 'courier');
  assert.equal(io.callsign, 'REACH-MAIL');
  assert.equal(io.ship, 'ship_kestrel');
  assert.ok(LANE_GIMMICK_LABELS[io.gimmick], 'the target panel has a gimmick label');

  for (const seed of [1, 47, 4242, 99999]) {
    const picked = pickNamedLaneContact(IO, seed);
    assert.ok(picked, `pickNamedLaneContact must return an Io id for seed ${seed}`);
    assert.equal(picked.id, 'lane_maro_keelwright');
  }
});

test('WORLD-11: traffic stamps the Io courier identity onto an ambient freighter', () => {
  const bus = createBus();
  const spawned = [];
  const entities = new Map();
  const sys = Object.create(trafficBase);
  sys.bus = bus;
  sys.state = {
    meta: { seed: 4242 },
    entities,
    traffic: { freighters: [] },
  };
  sys._active = [];
  sys._rng = () => 0.5;
  sys.helpers = {
    spawnEntity: (spec) => {
      const ent = { id: `freighter_${spawned.length + 1}`, ...spec, data: { ...(spec.data || {}) } };
      entities.set(ent.id, ent);
      spawned.push(ent);
      return ent;
    },
  };

  const stations = [{ id: 'station_reach', pos: { x: 100, z: 200 } }];
  const sector = { id: IO, factionId: 'faction_free' };

  sys._ensureNamedLaneContact(IO, sector, stations);

  assert.equal(spawned.length, 1, 'one freighter should be spawned for the Io contact');
  const stamped = spawned[0];
  assert.equal(stamped.data.namedLaneContactId, 'lane_maro_keelwright');
  assert.equal(stamped.data.callsign, 'REACH-MAIL');
  assert.equal(stamped.data.name, 'Maro Keelwright');
  assert.equal(stamped.data.gimmick, 'frontier-mail');
  assert.equal(stamped.data.trafficLabel, 'REACH-MAIL');
  assert.equal(stamped.data.scanLabel, 'REACH-MAIL');
});
