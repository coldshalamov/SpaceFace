// WORLD-40 — a busy lane carries two named contacts. Seed 4242. Never two names on one hull.
import test from 'node:test';
import assert from 'node:assert/strict';

import { pickNamedLaneContact } from '../src/data/laneContacts.js';
import { traffic } from '../src/systems/traffic.js';

const SEED = 4242;

function stage(sectorId, rows) {
  const entities = new Map();
  const freighters = [];
  for (const row of rows) {
    const entity = {
      id: row.id,
      alive: true,
      pos: { x: 0, z: 0 },
      data: { ai: {}, ...(row.data || {}) },
    };
    entities.set(row.id, entity);
    freighters.push({ id: row.id, role: row.role });
  }
  return {
    meta: { seed: SEED },
    simTime: 0,
    world: { currentSectorId: sectorId },
    entities,
    traffic: { freighters },
  };
}

function names(state) {
  const stamped = [];
  for (const entity of state.entities.values()) {
    if (!entity.data || !entity.data.namedLaneContactId) continue;
    stamped.push({
      id: entity.id,
      contactId: entity.data.namedLaneContactId,
      name: entity.data.name,
    });
  }
  return stamped;
}

test('seed 4242 stamps Rell and Jorah on two Ceres hulls, and two Helios faces on two others', () => {
  assert.equal(pickNamedLaneContact('sector_ceres_belt', SEED).id, 'lane_rell_moisture');
  assert.equal(pickNamedLaneContact('sector_helios_prime', SEED).id, 'lane_warden_keel');

  const previousState = traffic.state;
  const previousBus = traffic.bus;
  const previousHelpers = traffic.helpers;
  try {
    traffic.bus = { emit() {} };
    traffic.helpers = null;

    const ceres = stage('sector_ceres_belt', [
      { id: 'miner', role: 'miner', data: { activityActorSlotId: 'ceres_seam_miner' } },
      { id: 'hauler', role: 'hauler', data: { activityActorSlotId: 'ceres_refinery_hauler' } },
    ]);
    traffic.state = ceres;
    traffic._ensureNamedLaneContact('sector_ceres_belt', { factionId: 'faction_dmc' }, []);
    const ceresNames = names(ceres);
    assert.deepEqual(
      ceresNames.map((row) => [row.id, row.contactId]).sort(),
      [['hauler', 'lane_jorah_seam_haul'], ['miner', 'lane_rell_moisture']],
    );
    assert.equal(new Set(ceresNames.map((row) => row.id)).size, 2);
    assert.equal(ceres.entities.get('miner').data.name, 'Rell of the Moisture Column');
    assert.equal(ceres.entities.get('hauler').data.name, 'Jorah of the Seam Haul');

    const helios = stage('sector_helios_prime', [
      { id: 'express', role: 'express' },
      { id: 'patrol', role: 'patrol' },
    ]);
    traffic.state = helios;
    traffic._ensureNamedLaneContact('sector_helios_prime', { factionId: 'faction_scn' }, []);
    const heliosNames = names(helios);
    assert.equal(heliosNames.length, 2);
    const byId = Object.fromEntries(heliosNames.map((row) => [row.id, row.contactId]));
    assert.equal(byId.express, 'lane_cinder_run_courier');
    assert.equal(byId.patrol, 'lane_warden_keel');
    assert.notEqual(byId.express, byId.patrol);
  } finally {
    traffic.state = previousState;
    traffic.bus = previousBus;
    traffic.helpers = previousHelpers;
  }
});
