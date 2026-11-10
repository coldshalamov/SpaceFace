import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import {
  pirateRumor,
  routeDangerFeedbackForZone,
  routeAdjustedTrafficMix,
  rumorKey,
} from '../src/systems/pirateRumor.js';

function boot(seed = 5001, sectorId = 'sector_ceres_belt') {
  const sim = createSimulation({ seed, systems: [pirateRumor] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  state.encounterDirector = {
    plannedKey: 'counter-intel-plan',
    pending: [
      { encounterId: 'ceres-pirate-a', shapeId: 'ambush_snare', zoneId: 'zone_ceres_ambush', dueAt: 100 },
      { encounterId: 'ceres-pirate-b', shapeId: 'pirate_toll', zoneId: 'zone_ceres_ambush', dueAt: 140 },
      { encounterId: 'ceres-other-pirate', shapeId: 'ambush_snare', zoneId: 'zone_ceres_derelict', dueAt: 160 },
      { encounterId: 'ceres-civilian', shapeId: 'convoy', zoneId: 'zone_ceres_ambush', dueAt: 180 },
    ],
  };
  const applied = [];
  bus.on('pirateRumor:counterIntelApplied', (payload) => applied.push(structuredClone(payload)));
  return { sim, state, bus, applied };
}

function intel(t, overrides = {}) {
  t.bus.emit('pirateRumor:counterIntel', {
    profileId: 'faction_reach:reaver_pirate',
    networkName: 'Red Latch Network',
    factionId: 'faction_reach',
    authorityFactionId: 'faction_scn',
    sectorId: t.state.world.currentSectorId,
    stationId: 'station_custody_test',
    offenderType: 'reaver_pirate',
    archetype: 'pirate_raider',
    captureCount: 2,
    milestone: 2,
    day: 1,
    ...overrides,
  });
}

test('counter-intelligence chooses the hottest pirate zone and removes at most one local ambush', () => {
  const t = boot();
  t.bus.emit('encounter:spawned', {
    encounterId: 'actual-ambush',
    kind: 'ambush_snare',
    sectorId: 'sector_ceres_belt',
    zoneId: 'zone_ceres_ambush',
    count: 3,
  });
  intel(t);

  assert.equal(t.applied.length, 1);
  assert.equal(t.applied[0].zoneId, 'zone_ceres_ambush');
  assert.equal(t.applied[0].milestone, 2);
  assert.equal(t.applied[0].networkName, 'Red Latch Network');
  const ids = t.state.encounterDirector.pending.map((item) => item.encounterId);
  assert.equal(ids.filter((id) => id.startsWith('ceres-pirate-')).length, 1,
    'one of two selected-zone pirate opportunities remains as challenge');
  assert.ok(ids.includes('ceres-other-pirate'), 'pirate encounter in another zone remains');
  assert.ok(ids.includes('ceres-civilian'), 'civilian route life remains');

  const feedback = routeDangerFeedbackForZone(t.state, 'sector_ceres_belt', 'zone_ceres_ambush');
  assert.equal(feedback.active, true);
  assert.ok(feedback.danger < 0);
  assert.equal(feedback.reason, 'counter_intelligence');
});

test('selected-zone traffic becomes cautious but pirates never collapse to zero', () => {
  const t = boot(5002);
  intel(t);
  const zoneId = t.applied[0].zoneId;
  const adjusted = routeAdjustedTrafficMix(t.state, 'sector_ceres_belt', zoneId, {
    pirate: 1,
    hauler: 1,
    escort: 1,
  });
  assert.ok(adjusted.pirate < 1 && adjusted.pirate >= 0.4);
  assert.ok(adjusted.hauler > 1);
  assert.ok(adjusted.escort > 1);
  const otherZoneId = zoneId === 'zone_ceres_ambush' ? 'zone_ceres_derelict' : 'zone_ceres_ambush';
  assert.deepEqual(routeAdjustedTrafficMix(t.state, 'sector_ceres_belt', otherZoneId, {
    pirate: 1, hauler: 1, escort: 1,
  }), { pirate: 1, hauler: 1, escort: 1 }, 'other zones retain their authored challenge');
});

test('same profile milestone is idempotent while later milestones strengthen boundedly', () => {
  const t = boot(5003);
  intel(t);
  const zoneId = t.applied[0].zoneId;
  const key = rumorKey('sector_ceres_belt', zoneId);
  const firstDanger = t.state.pirateRumor.zones[key].routeDanger;
  const firstPlan = t.state.encounterDirector.pending.map((item) => item.encounterId);
  intel(t);
  assert.equal(t.applied.length, 1);
  assert.equal(t.state.pirateRumor.zones[key].routeDanger, firstDanger);
  assert.deepEqual(t.state.encounterDirector.pending.map((item) => item.encounterId), firstPlan);

  intel(t, { milestone: 4, captureCount: 4, day: 3 });
  assert.equal(t.applied.length, 2);
  assert.equal(t.applied[1].zoneId, zoneId);
  assert.ok(t.state.pirateRumor.zones[key].routeDanger < firstDanger);
  assert.ok(t.state.pirateRumor.zones[key].routeDanger >= -0.6);
});

test('same seed and profile choose the same fallback pirate zone', () => {
  const run = () => {
    const t = boot(5004);
    intel(t);
    return {
      applied: t.applied,
      pending: t.state.encounterDirector.pending.map((item) => item.encounterId),
    };
  };
  assert.deepEqual(run(), run());
});

test('counter-intelligence expires back to authored traffic weights', () => {
  const t = boot(5005);
  intel(t);
  const zoneId = t.applied[0].zoneId;
  const feedback = routeDangerFeedbackForZone(t.state, 'sector_ceres_belt', zoneId);
  t.state.simTime = feedback.until + 0.01;
  t.sim.registry.get('pirateRumor').update(0.01, t.state);
  assert.equal(routeDangerFeedbackForZone(t.state, 'sector_ceres_belt', zoneId).active, false);
  assert.deepEqual(routeAdjustedTrafficMix(t.state, 'sector_ceres_belt', zoneId, {
    pirate: 1, hauler: 1, escort: 1,
  }), { pirate: 1, hauler: 1, escort: 1 });
});

test('a sector without a pirate-capable zone ignores counter-intelligence safely', () => {
  const t = boot(5006, 'sector_helios_prime');
  intel(t);
  assert.equal(t.applied.length, 0);
  assert.equal(Object.keys(t.state.pirateRumor.zones).length, 0);
});

test('counter-intelligence save receipts and remembered routes stay bounded', () => {
  const t = boot(5007);
  for (let i = 0; i < 70; i++) {
    intel(t, { profileId: `faction_reach:network_${i}`, milestone: 2 });
  }
  assert.equal(t.state.pirateRumor.counterIntelReceipts.length, 64);
  assert.equal(Object.keys(t.state.pirateRumor.counterIntelProfileZones).length, 64);

  const appliedBefore = t.applied.length;
  intel(t, { profileId: 'faction_reach:network_69', milestone: 2 });
  assert.equal(t.applied.length, appliedBefore, 'a retained receipt remains exactly-once');
});
