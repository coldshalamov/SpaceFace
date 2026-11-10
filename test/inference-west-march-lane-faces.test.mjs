// West-march lane faces — the first frontier sectors a player reaches from the core
// (Ceres -> Hyperion Cut, Pallas -> Nyx March) each carry one named lane contact with a
// working reason, and the live traffic owner stamps that identity onto a real hull.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  LANE_GIMMICK_LABELS,
  NAMED_LANE_CONTACTS,
  pickNamedLaneContact,
} from '../src/data/laneContacts.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';

const CASES = [
  { sectorId: 'sector_hyperion_cut', id: 'lane_ossa_cutrun', name: 'Ossa of the Cut Run', callsign: 'CUT-RUN', role: 'hauler', gimmick: 'cut-run', ship: 'ship_mule' },
  { sectorId: 'sector_nyx_march', id: 'lane_nineola_hush', name: 'Nineola Hush', callsign: 'HUSH-CARGO', role: 'courier', gimmick: 'quiet-run', ship: 'ship_kestrel' },
];

test('west march: each sector has exactly one authored lane contact and a deterministic pick', () => {
  for (const c of CASES) {
    const pool = NAMED_LANE_CONTACTS.filter((x) => x.sectorIds && x.sectorIds.includes(c.sectorId));
    assert.equal(pool.length, 1, `${c.sectorId} keeps exactly one named contact so the pick stays deterministic`);
    const contact = pool[0];
    assert.equal(contact.id, c.id);
    assert.equal(contact.role, c.role);
    assert.equal(contact.callsign, c.callsign);
    assert.equal(contact.ship, c.ship);
    assert.ok(LANE_GIMMICK_LABELS[contact.gimmick], 'the target panel has a gimmick label');
    for (const seed of [1, 47, 4242, 99999]) {
      const picked = pickNamedLaneContact(c.sectorId, seed);
      assert.ok(picked, `pickNamedLaneContact must return the contact for ${c.sectorId} seed ${seed}`);
      assert.equal(picked.id, c.id);
    }
  }
});

test('west march: traffic stamps each contact onto a live ambient hull', () => {
  for (const c of CASES) {
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

    const stations = [{ id: `station_${c.sectorId}`, pos: { x: 100, z: 200 } }];
    const sector = { id: c.sectorId, factionId: 'faction_dmc' };

    sys._ensureNamedLaneContact(c.sectorId, sector, stations);

    assert.equal(spawned.length, 1, `${c.sectorId}: one hull spawned for the named contact`);
    const stamped = spawned[0];
    assert.equal(stamped.data.namedLaneContactId, c.id);
    assert.equal(stamped.data.name, c.name);
    assert.equal(stamped.data.callsign, c.callsign);
    assert.equal(stamped.data.gimmick, c.gimmick);
    assert.equal(stamped.data.trafficLabel, c.callsign);
    assert.equal(stamped.data.scanLabel, c.callsign);
  }
});
