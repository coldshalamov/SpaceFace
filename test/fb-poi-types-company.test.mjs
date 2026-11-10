// FB-125 — the singleton place types have company, and each new place resolves a family verb.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import {
  authoredPlacePlansForSector,
  resolveAuthoredPlacePlan,
} from '../src/data/poiBehaviorFamilies.js';

const SEED = 4242;

function countTypes() {
  const counts = new Map();
  for (const sector of SECTORS) {
    for (const list of [sector.stations, sector.pois, sector.hazards]) {
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        if (!row || !row.type) continue;
        counts.set(row.type, (counts.get(row.type) || 0) + 1);
      }
    }
  }
  return counts;
}

test('fab, wormhole, debris and research each exist more than once on seed 4242', () => {
  const counts = countTypes();
  const singles = [...counts.entries()].filter(([, n]) => n === 1).map(([type]) => type);
  for (const type of ['fab', 'wormhole', 'debris', 'research']) {
    assert.ok((counts.get(type) || 0) >= 2, `${type} count ${counts.get(type) || 0}`);
  }
  assert.deepEqual(singles.filter((type) => ['fab', 'wormhole', 'debris', 'research'].includes(type)), []);
});

test('the four new places resolve family verbs without a new poi type', () => {
  const expected = [
    ['poi_triton_field_lab', 'anomaly_research', 'triangulate'],
    ['station_vesta_outlying_yard', 'lawful_station_yard', 'dock'],
    ['hazard_ashfall_slag_yard', 'derelict_salvage', 'salvage'],
    ['poi_veil_far_sounding', 'gravity_well_sounding', 'sound'],
  ];
  for (const [id, familyId, verb] of expected) {
    const plan = resolveAuthoredPlacePlan(id, SEED);
    assert.equal(plan.familyId, familyId);
    assert.equal(plan.verb, verb);
    assert.equal(plan.seed, SEED);
  }
  const veil = SECTORS.find((sector) => sector.id === 'sector_veil_nebula');
  const far = veil.pois.find((poi) => poi.id === 'poi_veil_far_sounding');
  assert.equal(far.machineGate, undefined);
  assert.equal(far.gatedBy, undefined);
  const wormhole = veil.pois.find((poi) => poi.id === 'poi_wormhole');
  assert.equal(wormhole.machineGate, 'route_veil_ashfall');
  const vesta = SECTORS.find((sector) => sector.stations.some((station) => station.id === 'station_vesta_outlying_yard'));
  const plans = authoredPlacePlansForSector(vesta, SEED);
  assert.ok(plans.some((plan) => plan.placeId === 'station_vesta_outlying_yard'));
});
