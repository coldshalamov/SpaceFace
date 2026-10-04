// Frontier lane faces — every traffic-bearing frontier sector carries one named lane
// contact with a working reason, and the live traffic owner stamps that identity onto a
// real hull. The rim sectors that used to have no face now have one each.
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
  { sectorId: 'sector_dione_lane', id: 'lane_sable_cleared_run', name: 'Sable of the Cleared Run', callsign: 'CLEARED-RUN', role: 'hauler', gimmick: 'cleared-run', ship: 'ship_mule' },
  { sectorId: 'sector_nereid_shoal', id: 'lane_iva_ice_cut', name: 'Iva of the Ice Cut', callsign: 'ICE-CUT', role: 'ore_carrier', gimmick: 'ice-cut', ship: 'ship_ironback' },
  { sectorId: 'sector_haumea_rift', id: 'lane_quill_fractureline', name: 'Quill Fractureline', callsign: 'RIFT-SURVEY', role: 'surveyor', gimmick: 'survey-mail', ship: 'ship_ranger' },
  { sectorId: 'sector_rhea_cinder', id: 'lane_brand_scorched_seam', name: 'Brand of the Scorched Seam', callsign: 'CINDER-ORE', role: 'hauler', gimmick: 'scorched-ore', ship: 'ship_mule' },
  { sectorId: 'sector_proteus_well', id: 'lane_low_well_sound', name: 'Low of the Well Sound', callsign: 'WELL-SOUND', role: 'surveyor', gimmick: 'well-sound', ship: 'ship_ranger' },
  { sectorId: 'sector_kepler_scar', id: 'lane_ferr_surplus_gate', name: 'Ferr of the Surplus Gate', callsign: 'SURPLUS-OUT', role: 'smuggler', gimmick: 'surplus-run', ship: 'ship_drifter' },
  { sectorId: 'sector_eunomia_gulf', id: 'lane_wray_license_board', name: 'Wray of the License Board', callsign: 'GULF-SALVAGE', role: 'salvor', gimmick: 'license-salvage', ship: 'ship_pelican' },
  { sectorId: 'sector_eris_margin', id: 'lane_ash_margin_cross', name: 'Ash of the Unmanifested', callsign: 'MARGIN-CROSS', role: 'courier', gimmick: 'margin-cross', ship: 'ship_kestrel' },
];

const HOLLOW_RIM_SECTORS = [
  { sectorId: 'sector_ashfall_reach', id: 'lane_ashfall_cache_voice' },
  { sectorId: 'sector_triton_wake', id: 'lane_triton_wake_courier' },
  { sectorId: 'sector_sedna_dark', id: 'lane_sedna_dark_tanker' },
  { sectorId: 'sector_orcus_shadow', id: 'lane_orcus_shadow_courier' },
  { sectorId: 'sector_phoebe_echo', id: 'lane_phoebe_echo_courier' },
];

test('frontier faces: each traffic-bearing rim sector has exactly one authored contact and a deterministic pick', () => {
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

test('frontier faces: the hollow rim sectors each have one deterministic face', () => {
  for (const c of HOLLOW_RIM_SECTORS) {
    const pool = NAMED_LANE_CONTACTS.filter((x) => x.sectorIds && x.sectorIds.includes(c.sectorId));
    assert.equal(pool.length, 1, `${c.sectorId} has one named face`);
    assert.equal(pickNamedLaneContact(c.sectorId, 4242).id, c.id);
    assert.equal(pickNamedLaneContact(c.sectorId, 4242).id, pickNamedLaneContact(c.sectorId, 4242).id);
  }
});

test('frontier faces: traffic stamps each contact onto a live ambient hull', () => {
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
    const sector = { id: c.sectorId, factionId: 'faction_free' };

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
