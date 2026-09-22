import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  NAMED_LANE_CONTACTS,
  pickNamedLaneContact,
} from '../src/data/laneContacts.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

test('WORLD-02: Vesta traffic includes one named hauler in NAMED_LANE_CONTACTS', () => {
  const vestaContact = NAMED_LANE_CONTACTS.find((c) => c.sectorIds && c.sectorIds.includes('sector_vesta_forge'));
  assert.ok(vestaContact, 'a named lane contact for sector_vesta_forge must exist');
  assert.equal(vestaContact.role, 'hauler', 'contact role must be hauler');
  assert.equal(vestaContact.id, 'lane_tann_slag_carrier');
  assert.equal(vestaContact.callsign, 'SLAG-RUN');
  assert.equal(vestaContact.name, 'Tann of the Slag Run');
  assert.equal(vestaContact.gimmick, 'bulk-haul');

  // Deterministic pick
  const picked = pickNamedLaneContact('sector_vesta_forge', 4242);
  assert.ok(picked, 'pickNamedLaneContact must return the contact for seed 4242');
  assert.equal(picked.id, 'lane_tann_slag_carrier');
});

test('WORLD-02: sector_vesta_forge stamps namedLaneContactId on traffic hauler', () => {
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

  const stations = [{ id: 'station_forge', pos: { x: 100, z: 200 } }];
  const sector = { id: 'sector_vesta_forge', factionId: 'faction_choir' };

  sys._ensureNamedLaneContact('sector_vesta_forge', sector, stations);

  assert.equal(spawned.length, 1, 'one freighter should be spawned for the contact');
  const stamped = spawned[0];
  assert.equal(stamped.data.namedLaneContactId, 'lane_tann_slag_carrier');
  assert.equal(stamped.data.callsign, 'SLAG-RUN');
  assert.equal(stamped.data.name, 'Tann of the Slag Run');
  assert.equal(stamped.data.gimmick, 'bulk-haul');
  assert.equal(stamped.data.trafficLabel, 'SLAG-RUN');
  assert.equal(stamped.data.scanLabel, 'SLAG-RUN');
});
