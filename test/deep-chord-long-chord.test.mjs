// WF-10 deep-space find: the Privateer Long Chord (D17) is the first authored unique wreck whose
// physical site sits OUT in the transit gap between two charted sector discs. These proofs pin the
// three claims that make it a find rather than a row:
//   1. the site is genuinely deep space — outside Helios' charted disc, off the travel-lane
//      corridor, for every placement seed, and the deep-space transit readout addresses it;
//   2. the site still plays — Helios owns the Voronoi cell there, so the rumor mints, the pulse
//      scan fixes, and the hull materializes while the player stands in the gap;
//   3. the toll stays dangerous — the seeded chord toll-warden complication arms with the rumor.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { FLAVOR_SOURCE_BY_REF } from '../src/data/flavor/index.generated.js';
import { ENCOUNTERS } from '../src/data/encounters/index.generated.js';
import {
  SECTOR_GLOBAL_ORIGINS,
  sectorGlobalOrigin,
  sectorMembershipAtGlobal,
} from '../src/data/sectorCoordinates.js';
import { LANE_HELIOS_TETHYS, buildLaneGeometry, LANE_CORRIDOR_RADIUS_WU } from '../src/data/travelLaneRoutes.js';
import { SECTORS } from '../src/data/sectors.js';
import { resolveDeepSpaceAddress } from '../src/core/deepSpaceAddress.js';
import {
  UNIQUE_WRECKS,
  placementForUniqueWreck,
  programSeedFor,
  uniqueWreckById,
  validateUniqueWreckRegistry,
} from '../src/data/uniqueWrecks.js';
import { salvageActions } from '../src/systems/salvageActions.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { ENCOUNTER_SCRIPTS } from '../src/systems/encounterScripts.js';
import { uniqueWreckBarRumor } from '../src/ui/uniqueWreckRumorSurface.js';

const META_SEED = 4242;
const WRECK_ID = 'wreck_long_chord';
const HOME_SECTOR = 'sector_helios_prime';
const HELIOS_WORLD_RADIUS_WU = SECTORS.find((sector) => sector.id === HOME_SECTOR).worldRadius;

function dist(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.z || 0) - (b.z || 0));
}

/** Perpendicular distance from the lane chord — how far off the beacon line the site sits. */
function offAxisDistance(point) {
  const lane = buildLaneGeometry(LANE_HELIOS_TETHYS);
  const rx = point.x - lane.from.x;
  const rz = point.z - lane.from.z;
  return Math.abs(rx * lane.axis.z - rz * lane.axis.x);
}

function boot({ sectorId = HOME_SECTOR } = {}) {
  const sim = createSimulation({
    seed: META_SEED,
    systems: [salvageActions, uniqueWrecks],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = sectorId;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' },
  });
  state.playerId = player.id;
  return {
    sim, state, bus,
    system: sim.registry.get('uniqueWrecks'),
    dispose() { sim.dispose(); },
  };
}

test('seed 4242: D17 registers as a valid authored wreck with the deep-chord placement rule', () => {
  const def = uniqueWreckById(WRECK_ID);
  assert.ok(def, 'the Long Chord is registered');
  assert.equal(def.programSlot, 'D17');
  assert.equal(def.sectorId, HOME_SECTOR);
  assert.equal(def.hazardContext.placementRule, 'deep_chord_off_lane');
  assert.equal(def.bearingSourceRef, 'bar.tethys_chord.long_chord');
  assert.deepEqual(validateUniqueWreckRegistry(), { ok: true, errors: [] });
  assert.equal(UNIQUE_WRECKS.length, 17);
});

test('seed 4242: the Long Chord site is deep space — off-disc, off-lane, transit-addressed', () => {
  const programSeed = programSeedFor(META_SEED);
  const site = placementForUniqueWreck(programSeed, WRECK_ID, HOME_SECTOR);

  // Outside the charted disc: this is a find in the gap, not another disc landmark.
  const origin = sectorGlobalOrigin(HOME_SECTOR);
  const fromOrigin = dist(site.exactGlobal, origin);
  assert.equal(SECTOR_GLOBAL_ORIGINS[HOME_SECTOR].x, 0);
  assert.ok(fromOrigin > HELIOS_WORLD_RADIUS_WU,
    `site sits ${Math.round(fromOrigin)} WU out — past the ${HELIOS_WORLD_RADIUS_WU} WU charted disc`);

  // Off the beacon line: not on the travel lane the convoys boost.
  const offLane = offAxisDistance(site.exactGlobal);
  assert.ok(offLane > LANE_CORRIDOR_RADIUS_WU,
    `site sits ${Math.round(offLane)} WU off the chord axis — outside the ${LANE_CORRIDOR_RADIUS_WU} WU lane corridor`);

  // The deep-space readout addresses the site exactly the way the rumor teaches it.
  const address = resolveDeepSpaceAddress(site.exactGlobal);
  assert.equal(address.kind, 'transit');
  assert.match(address.label, /HELIOS <-> TETHYS TRANSIT/);
  assert.ok(address.transit.offAxisWU > 900 && address.transit.offAxisWU < 1600,
    `readout off-axis ${address.transit.offAxisWU} WU matches the rumor's "a thousand south"`);
  assert.ok(address.transit.progress > 0.25 && address.transit.progress < 0.5,
    `readout progress ${(address.transit.progress * 100).toFixed(0)}% puts the grave before the Tethys midline`);
});

test('every placement seed keeps the site deep: off-disc, in the Helios cell, off the lane', () => {
  for (let metaSeed = 1; metaSeed <= 60; metaSeed += 1) {
    const programSeed = programSeedFor(metaSeed);
    const site = placementForUniqueWreck(programSeed, WRECK_ID, HOME_SECTOR);
    const origin = sectorGlobalOrigin(HOME_SECTOR);
    assert.ok(dist(site.exactGlobal, origin) > HELIOS_WORLD_RADIUS_WU,
      `seed ${metaSeed}: exact site leaves the charted disc`);
    assert.ok(dist(site.bearingCenterGlobal, origin) > HELIOS_WORLD_RADIUS_WU,
      `seed ${metaSeed}: bearing ring leaves the charted disc`);
    assert.equal(sectorMembershipAtGlobal(site.exactGlobal), HOME_SECTOR,
      `seed ${metaSeed}: the gap site answers to Helios, so the find materializes and scan-fixes there`);
    assert.ok(offAxisDistance(site.exactGlobal) > LANE_CORRIDOR_RADIUS_WU,
      `seed ${metaSeed}: exact site is off the beacon corridor`);
    assert.ok(offAxisDistance(site.bearingCenterGlobal) > 0,
      `seed ${metaSeed}: bearing ring is a real search ring`);
  }
});

test('seed 4242: the Tethys barkeep carries the authored rumor and the chord mints its bearing', () => {
  const rumor = uniqueWreckBarRumor({}, 'station_tethys', 'rumors');
  assert.ok(rumor, 'the Tethys bar rumors the Long Chord');
  assert.equal(rumor.wreckId, WRECK_ID);
  assert.equal(rumor.channelId, 'bar');
  assert.match(rumor.text, /Long Chord/);
  assert.match(rumor.text, /dead/);
  const source = FLAVOR_SOURCE_BY_REF['bar.tethys_chord.long_chord'];
  assert.ok(source, 'the rumor source is authored in the flavor corpus');
  assert.equal(source.wreckId, WRECK_ID);

  const t = boot();
  try {
    t.bus.emit('uniqueWreck:rumorHeard', rumor);
    const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
    assert.ok(record, 'the heard rumor mints a durable bearing');
    assert.equal(record.phase, 'rumored');
    assert.equal(record.channelId, 'bar');
    const placement = placementForUniqueWreck(programSeedFor(META_SEED), WRECK_ID, HOME_SECTOR);
    assert.deepEqual(record.exactPos, placement.exactGlobal);
    assert.deepEqual(record.bearingCenter, placement.bearingCenterGlobal);
  } finally {
    t.dispose();
  }
});

test('seed 4242: a pulse in the gap fixes the bearing and materializes the hull off-disc', () => {
  const t = boot();
  try {
    t.bus.emit('uniqueWreck:rumorHeard', uniqueWreckBarRumor({}, 'station_tethys', 'rumors'));
    const record = t.state.player.uniqueWrecks.bearings[WRECK_ID];
    assert.equal(record.phase, 'rumored');

    // The player stands IN the transit gap, inside Helios' Voronoi cell, and pulses the dark.
    assert.equal(sectorMembershipAtGlobal(record.exactPos), HOME_SECTOR);
    t.bus.emit('scan:pulse', { pos: { ...record.exactPos } });

    assert.equal(record.phase, 'fixed', 'the pulse fixes the deep-space bearing');
    assert.deepEqual(record.fixedPos, record.exactPos);
    const wreck = t.state.entityList.find((entity) => entity.alive !== false
      && entity.data && entity.data.uniqueWreckId === WRECK_ID);
    assert.ok(wreck, 'the physical wreck materializes at the deep site');
    assert.equal(wreck.data.scanLabel, 'LONG CHORD · UNFILED TOLL-HAULER GRAVE');
    assert.equal(wreck.data.scanned, true);
    assert.equal(wreck.data.interactionPrompt, 'SALVAGE TO OPEN RECOVERY CLAIM');
  } finally {
    t.dispose();
  }
});

test('seed 4242: hearing the rumor arms the chord toll-warden complication', () => {
  const t = boot();
  try {
    const before = t.state.simTime;
    t.bus.emit('uniqueWreck:rumorHeard', uniqueWreckBarRumor({}, 'station_tethys', 'rumors'));
    const complications = t.state.player.uniqueWrecks.complications;
    const timer = complications[`${WRECK_ID}:timer:long_chord_warden`];
    assert.ok(timer, 'the warden timer is scheduled with the rumor');
    assert.equal(timer.status, 'scheduled');
    assert.equal(timer.encounterId, 'unique_wreck_long_chord_warden');
    assert.ok(timer.dueAt > before && timer.dueAt <= before + 260,
      'the deadline is seeded inside the authored 150-260 s band');

    const encounter = ENCOUNTERS.unique_wreck_long_chord_warden;
    assert.ok(encounter, 'the warden encounter is authored');
    assert.equal(encounter.weight, 0, 'the warden is direct-only — it never ambient-spawns');
    assert.equal(encounter.gates && encounter.gates.uniqueWreckId, WRECK_ID);
    assert.ok(ENCOUNTER_SCRIPTS.uniqueWreckLongChordWarden, 'the warden script is registered');
  } finally {
    t.dispose();
  }
});
