/**
 * Focused coverage for uniqueWrecks public earn* carrier APIs + equipSurveySuiteIfNeeded.
 * Primary matrix must use these (not surfaceAuthoredPrimaryCarrier).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';
import { cargo } from '../src/systems/cargo.js';
import { ships } from '../src/systems/ships.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import {
  earnPrimaryCarrier,
  equipSurveySuiteIfNeeded,
  earnMethodForWreck,
} from '../scripts/lib/earnUniqueWreckCarrier.mjs';
import {
  BAR_STATION_BY_WRECK,
  PRIMARY_CARRIER_PLAN,
} from '../scripts/lib/primaryNaturalRouteContract.mjs';

function boot({ seed = 48200, sectorId = 'sector_helios_prime' } = {}) {
  const sim = createSimulation({
    seed,
    systems: [uniqueWrecks, cargo, ships],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.player.cargo.capVolume = 200;
  state.player.cargo.capMass = 1e9;
  // ships.newGame so grantModule / owned fittings work.
  const shipsSys = sim.registry.get('ships');
  if (shipsSys && typeof shipsSys.newGame === 'function') shipsSys.newGame();
  const system = sim.registry.get('uniqueWrecks');
  if (system && typeof system.newGame === 'function') system.newGame();
  return { sim, state, bus, system, shipsSys };
}

function bearing(state, wreckId) {
  return state.player.uniqueWrecks && state.player.uniqueWrecks.bearings[wreckId] || null;
}

test('PRIMARY_CARRIER_PLAN methods exist on uniqueWrecks (except game:started)', () => {
  const { system } = boot();
  for (const [wreckId, plan] of Object.entries(PRIMARY_CARRIER_PLAN)) {
    if (plan.method === 'game:started') continue;
    assert.equal(typeof system[plan.method], 'function',
      `${wreckId} plan method ${plan.method} must be a public uniqueWrecks method`);
  }
  assert.equal(typeof system.equipSurveySuiteIfNeeded, 'function');
  assert.equal(typeof system.surfaceAuthoredPrimaryCarrier, 'function',
    'supporting-only surface remains for capture/supporting harnesses');
});

test('earnSectorEnter records D2 Ironsong and D6 Tideline', () => {
  const cases = [
    ['wreck_dmc_ironsong', 'sector_nyx_march', 'comms_intercept'],
    ['wreck_gravhand_tideline', 'sector_eunomia_gulf', 'news'],
  ];
  for (const [wreckId, sectorId, channelId] of cases) {
    const t = boot({ sectorId });
    const def = uniqueWreckById(wreckId);
    const rec = earnPrimaryCarrier(t.system, def, t);
    assert.ok(rec, `${wreckId} must earn a bearing`);
    assert.equal(rec.phase, 'rumored');
    assert.equal(rec.channelId, channelId);
    assert.equal(rec.sourceRef, def.bearingSourceRef);
    assert.equal(earnMethodForWreck(wreckId), 'earnSectorEnter');
  }
});

test('earnBarRumor uses production adapter for four bar stations', () => {
  for (const [wreckId, stationId] of Object.entries(BAR_STATION_BY_WRECK)) {
    const t = boot();
    const def = uniqueWreckById(wreckId);
    const rec = t.system.earnBarRumor(stationId);
    assert.ok(rec, `${stationId} → ${wreckId}`);
    assert.equal(rec.wreckId, wreckId);
    assert.equal(rec.channelId, 'bar');
    assert.equal(rec.sourceRef, def.bearingSourceRef);
    // Idempotent: second ask returns existing / adapter nulls when already known.
    const again = t.system.earnBarRumor(stationId);
    assert.ok(again == null || again.wreckId === wreckId);
  }
  const t = boot();
  assert.equal(t.system.earnBarRumor('station_unknown'), null);
});

test('earnLostCoilsMission offers Helios dock path and records Pale-Coil', () => {
  const t = boot({ sectorId: 'sector_helios_prime' });
  const def = uniqueWreckById('wreck_lanebreaker_pale_coil');
  const rec = t.system.earnLostCoilsMission();
  assert.ok(rec);
  assert.equal(rec.wreckId, def.id);
  assert.equal(rec.channelId, 'mission');
  assert.equal(rec.sourceRef, 'mission.the_lost_coils');
  assert.equal(t.state.player.uniqueWrecks.offers['unique-wreck:the-lost-coils:v1'], true);
});

test('earnLossInvestigation surfaces Vigilant', () => {
  const t = boot({ sectorId: 'sector_veil_nebula' });
  const rec = t.system.earnLossInvestigation();
  assert.ok(rec);
  assert.equal(rec.wreckId, 'wreck_isc_vigilant');
  assert.equal(rec.channelId, 'loss_investigation');
});

test('earnCampaignBeat accepts wreckId for lighthouse and cassandra', () => {
  for (const wreckId of ['wreck_isc_lighthouse', 'wreck_choir_cassandra']) {
    const t = boot();
    const def = uniqueWreckById(wreckId);
    const rec = t.system.earnCampaignBeat(wreckId);
    assert.ok(rec, wreckId);
    assert.equal(rec.wreckId, wreckId);
    assert.equal(rec.channelId, 'campaign');
    assert.equal(rec.sourceRef, def.bearingSourceRef);
  }
  const t = boot();
  assert.equal(t.system.earnCampaignBeat('wreck_choir_tender'), null);
});

test('earnBarkPatrol surfaces Singing Bell', () => {
  const t = boot({ sectorId: 'sector_triton_wake' });
  const rec = t.system.earnBarkPatrol();
  assert.ok(rec);
  assert.equal(rec.wreckId, 'wreck_choir_bell_aegis');
  assert.equal(rec.channelId, 'bark');
});

test('equipSurveySuiteIfNeeded uses ships.grantModule not harness push', () => {
  const t = boot();
  assert.equal(
    (t.state.player.moduleInventory || []).some((m) => m && m.defId === 'mod_survey_suite'),
    false,
  );
  const before = (t.state.player.moduleInventory || []).length;
  const result = equipSurveySuiteIfNeeded(t.system);
  assert.equal(result.ok, true);
  assert.equal(result.defId, 'mod_survey_suite');
  assert.ok(result.via === 'ships.grantModule' || result.via === 'owned.fittings');
  // hasModule sees inventory or fittings
  const invHas = (t.state.player.moduleInventory || []).some((m) => m && m.defId === 'mod_survey_suite');
  const fitHas = (t.state.player.ownedShips?.[0]?.fittings || []).includes('mod_survey_suite');
  assert.ok(invHas || fitHas, 'survey suite must land in inventory or fittings');
  if (result.via === 'ships.grantModule') {
    assert.ok((t.state.player.moduleInventory || []).length > before);
  }
  const again = t.system.equipSurveySuiteIfNeeded();
  assert.equal(again.already, true);
  assert.equal(again.ok, true);
});

test('earnPrimaryCarrier dispatch covers all 12 plan entries', () => {
  for (const wreckId of Object.keys(PRIMARY_CARRIER_PLAN)) {
    const def = uniqueWreckById(wreckId);
    const t = boot({ sectorId: def.sectorId });
    if (def.scanRequirement) equipSurveySuiteIfNeeded(t.system, def.scanRequirement);
    const rec = earnPrimaryCarrier(t.system, def, t);
    assert.ok(rec, `${wreckId} earnPrimaryCarrier must record bearing`);
    assert.equal(rec.phase, 'rumored');
    assert.equal(rec.sourceRef, def.bearingSourceRef);
    assert.equal(bearing(t.state, wreckId).wreckId, wreckId);
  }
});
