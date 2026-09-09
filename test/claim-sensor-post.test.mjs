import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import {
  BODY_MODULE_BY_ID,
  claimSensorPostActive,
} from '../src/data/claimableBodies.js';
import {
  frontierRumorOwned,
  sensorPostRumorOffer,
} from '../src/data/frontierRumors.js';
import { TECH_NODES } from '../src/data/tech.js';
import { claims } from '../src/systems/claims.js';
import {
  scanner,
  scannerProfileForState,
  SENSOR_POST_POI_RANGE,
} from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { frontierRumorMapReadouts } from '../src/ui/frontierRumorMapLayer.js';
import { recommendBaseBuildPlan } from '../src/ui/screens/base.js';

const CLAIM_SECTOR = 'sector_io_reach';

function makeBody(overrides = {}) {
  return {
    id: 'claim_sensor_post_test',
    sectorId: CLAIM_SECTOR,
    poiId: 'poi_claim_pallas',
    name: 'Pallas Industrial Moon',
    owned: true,
    slots: 4,
    modules: ['mod_sensor_post'],
    ...overrides,
  };
}

function makeState(seed = 4708) {
  const state = createGameState(seed);
  state.simTime = 0;
  state.world.currentSectorId = CLAIM_SECTOR;
  state.world.discovery = {};
  state.claims = { bodies: [makeBody()] };
  return state;
}

test('Sensor Post is a reachable one-slot Long-Range Survey base module', () => {
  const mod = BODY_MODULE_BY_ID.get('mod_sensor_post');
  assert.ok(mod);
  assert.equal(mod.effect, 'sensor_post');
  assert.equal(mod.slots, 1);
  assert.equal(mod.techReq, 'tech_long_range_survey');
  assert.equal(mod.cost, 11_000);

  const tech = TECH_NODES.find((row) => row.id === mod.techReq);
  assert.ok(tech);
  assert.ok(tech.unlocks.modules.includes(mod.id));

  const plan = recommendBaseBuildPlan(
    { credits: 50_000, researchedNodes: [mod.techReq] },
    makeBody({ modules: ['mod_depot', 'mod_refinery'] }),
  );
  assert.equal(plan.state, 'available');
  assert.equal(plan.moduleId, mod.id, 'base screen recommends the post after core cargo infrastructure');
});

test('Sensor Post expands authored hidden-POI pulses without widening ordinary contact range', () => {
  const state = makeState();
  const body = state.claims.bodies[0];
  body.modules = [];
  const baseline = scannerProfileForState(state);
  assert.equal(baseline.sensorPostActive, false);
  assert.equal(baseline.poiRadius, baseline.hiddenPoiRadius);

  body.modules.push('mod_sensor_post');
  const boosted = scannerProfileForState(state);
  assert.equal(claimSensorPostActive(state), true);
  assert.equal(boosted.sensorPostActive, true);
  assert.equal(boosted.nearRadius, baseline.nearRadius, 'ship, asteroid, and ghost contacts do not widen');
  assert.equal(boosted.hiddenPoiRadius, baseline.hiddenPoiRadius, 'combat and living signal range does not widen');
  assert.equal(boosted.poiRadius, SENSOR_POST_POI_RANGE);

  state.world.activeSector = {
    stations: [], fields: [], hazards: [], gates: [],
    pois: [{ id: 'poi_sensor_post_cache', type: 'cache', hidden: true, pos: { x: 4500, z: 0 } }],
  };
  scanner.bus = { emit() {} };
  body.modules = [];
  assert.deepEqual(
    scanner._scanSignals(state, CLAIM_SECTOR, { x: -4500, z: 0 }, 1, [], scannerProfileForState(state)),
    [],
    'the same distant POI is outside an ordinary pulse',
  );
  body.modules.push('mod_sensor_post');
  const rows = scanner._scanSignals(state, CLAIM_SECTOR, { x: -4500, z: 0 }, 2, [], scannerProfileForState(state));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sourceId, 'poi_sensor_post_cache');
  assert.equal(rows[0].distance, 9000, 'the post covers a full authored-sector diameter');

  state.world.currentSectorId = 'sector_helios_prime';
  const elsewhere = scannerProfileForState(state);
  assert.equal(elsewhere.sensorPostActive, false, 'a post never scans remotely from another sector');
  assert.equal(elsewhere.poiRadius, elsewhere.hiddenPoiRadius);
});

test('claim owner files at most one Sensor Post rumor per sector-day and saves the cadence', () => {
  const state = makeState();
  const events = [];
  const sys = Object.create(claims);
  sys.state = state;
  sys.bus = { emit: (name, payload) => events.push({ name, payload }) };
  const body = state.claims.bodies[0];

  assert.equal(sys._tickSensorPost(body, state), true);
  assert.equal(sys._tickSensorPost(body, state), false);
  state.simTime = 599.99;
  assert.equal(sys._tickSensorPost(body, state), false);
  state.simTime = 600;
  assert.equal(sys._tickSensorPost(body, state), true);
  assert.deepEqual(events.map((row) => row.name), ['claim:sensorPostRumor', 'claim:sensorPostRumor']);
  assert.deepEqual(events.map((row) => row.payload.dayIndex), [0, 1]);
  assert.equal(sys.serialize().bodies[0].sensorPostLastRumorDay, 1);
});

test('Sensor Post grants free local fuzzy intel through the existing world rumor owner', () => {
  const state = makeState(9192);
  const body = state.claims.bodies[0];
  const offer = sensorPostRumorOffer(state, body);
  assert.ok(offer, 'Io Reach has a local frontier lead for the post to file');
  assert.equal(offer.source, 'sensor_post');
  assert.equal(offer.sourceBodyId, body.id);
  assert.equal(offer.sourceSectorId, CLAIM_SECTOR);
  assert.equal(offer.sectorId, CLAIM_SECTOR, 'post intel is strictly local');
  assert.equal(offer.price, 0);
  assert.equal(Object.hasOwn(offer, 'targetPos'), false);

  const emitted = [];
  const priorState = world.state;
  const priorBus = world.bus;
  try {
    world.state = state;
    world.bus = { emit: (name, payload) => emitted.push({ name, payload }) };
    assert.equal(world._onSensorPostRumor({ bodyId: body.id }), true);
    assert.equal(frontierRumorOwned(state, offer.id), true);
    assert.equal(emitted.some((row) => row.name === 'economy:chargeCredits'), false);
    assert.equal(state.world.frontierRumors.receipts.at(-1).type, 'generated');

    const readout = frontierRumorMapReadouts(state, CLAIM_SECTOR);
    assert.equal(readout.length, 1);
    assert.equal(readout[0].courseTarget, null);
    assert.equal(readout[0].fixedPos, null);

    state.world.currentSectorId = null;
    const saved = world.serialize();
    assert.equal(saved.frontierRumors.byId[offer.id].sourceBodyId, body.id);
    assert.equal(saved.frontierRumors.byId[offer.id].phase, 'rumored');
  } finally {
    world.state = priorState;
    world.bus = priorBus;
  }
});
