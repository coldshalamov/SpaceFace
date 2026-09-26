// Sker Haven lane identity — the Reach market apron shows one named tithe-runner.
// The done check: sector_sker_haven has positive traffic and a station so the pick is live,
// pickNamedLaneContact returns Vey Senna deterministically, and the live traffic owner stamps
// her identity onto a real ambient freighter.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  LANE_GIMMICK_LABELS,
  NAMED_LANE_CONTACTS,
  pickNamedLaneContact,
} from '../src/data/laneContacts.js';
import { SECTORS } from '../src/data/sectors.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

const SKER = 'sector_sker_haven';

test('Sker Haven runs enough traffic for a lane identity to be live', () => {
  const sector = SECTORS.find((row) => row.id === SKER);
  assert.ok(sector, 'sector_sker_haven exists');
  assert.ok(sector.trafficPerMin > 0, 'the bazaar apron carries traffic for the pick to land on');
  assert.ok(
    sector.stations.some((row) => row.id === 'station_sker'),
    'the tithe-runner works a station apron',
  );
});

test('a Sker-only named tithe-runner exists and is the only Sker pick', () => {
  const pool = NAMED_LANE_CONTACTS.filter((c) => c.sectorIds && c.sectorIds.includes(SKER));
  assert.equal(pool.length, 1, 'exactly one authored Sker lane contact keeps the pick deterministic');
  const sker = pool[0];
  assert.equal(sker.id, 'lane_vey_tithe');
  assert.equal(sker.name, 'Vey Senna');
  assert.equal(sker.callsign, 'TITHE-RUN');
  assert.equal(sker.role, 'hauler');
  assert.equal(sker.ship, 'ship_mule');
  assert.equal(sker.gimmick, 'tithe-run');
  assert.equal(LANE_GIMMICK_LABELS[sker.gimmick], 'TITHE RUN', 'the target panel has a gimmick label');

  for (const seed of [1, 47, 4242, 99999]) {
    const picked = pickNamedLaneContact(SKER, seed);
    assert.ok(picked, `pickNamedLaneContact must return a Sker id for seed ${seed}`);
    assert.equal(picked.id, 'lane_vey_tithe');
  }
});

test('traffic stamps the tithe-runner identity onto an ambient freighter', () => {
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

  const stations = [{ id: 'station_sker', pos: { x: 100, z: 200 } }];
  const sector = { id: SKER, factionId: 'faction_reach' };

  sys._ensureNamedLaneContact(SKER, sector, stations);

  assert.equal(spawned.length, 1, 'one freighter should be spawned for the Sker contact');
  const stamped = spawned[0];
  assert.equal(stamped.data.namedLaneContactId, 'lane_vey_tithe');
  assert.equal(stamped.data.callsign, 'TITHE-RUN');
  assert.equal(stamped.data.name, 'Vey Senna');
  assert.equal(stamped.data.gimmick, 'tithe-run');
  assert.equal(stamped.data.trafficLabel, 'TITHE-RUN');
  assert.equal(stamped.data.scanLabel, 'TITHE-RUN');
});
