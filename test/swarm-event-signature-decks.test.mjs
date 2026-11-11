// Iter 41: the two thin signature decks fill out.
//
// lagrange_crucible and cryo_drift tabled only two signature cards each — with the 70/30
// own-vs-shared draw their event rounds repeated the same trick run after run. Each room
// now deals four: pylon_flip (the swing's chord, inverted to a shove), sling_tide (the
// sling as a cross-room river), thaw_burst (the freeze letting go from the middle) and
// cold_snap (a snare that lands where the player is at the fire line). All four spend
// through the shipped pulse machinery — no new mechanism.
//
// Deterministic: seeded picks, simTime windows, no wall clock.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWARM_EVENT_BY_ID,
  SWARM_EVENT_TABLES,
  swarmMinorEventPool,
  validateSwarmEvents,
} from '../src/data/swarmEvents.js';

test('the tables validate and both thin decks now deal four signatures', () => {
  assert.deepEqual(validateSwarmEvents(), []);
  assert.deepEqual(SWARM_EVENT_TABLES.lagrange_crucible,
    ['well_swing', 'sling_gust', 'pylon_flip', 'sling_tide']);
  assert.deepEqual(SWARM_EVENT_TABLES.cryo_drift,
    ['freeze_front', 'plate_shatter', 'thaw_burst', 'cold_snap']);
  for (const [arenaId, table] of Object.entries(SWARM_EVENT_TABLES)) {
    assert.ok(table.length >= 3, `${arenaId} deals at least three signature tricks`);
  }
  // The quiet band is untouched: neither new card is minor-tagged.
  assert.deepEqual(swarmMinorEventPool('lagrange_crucible').slice().sort(),
    ['mine_drift', 'sling_gust', 'supply_drop']);
  assert.deepEqual(swarmMinorEventPool('cryo_drift').slice().sort(),
    ['mine_drift', 'supply_drop']);
});

test('existing decks are unchanged — untouched tables and the four older signatures hold', () => {
  assert.deepEqual(SWARM_EVENT_TABLES.helios_core,
    ['shutter_storm', 'furnace_flare', 'plate_drift', 'sprocket_crate']);
  assert.deepEqual(SWARM_EVENT_TABLES.cinder_sluice,
    ['sluice_surge', 'undertow_snap', 'slag_spill']);
  assert.deepEqual(SWARM_EVENT_TABLES.storm_lattice,
    ['relay_arc', 'grid_surge', 'reef_surge']);
  assert.deepEqual(SWARM_EVENT_TABLES.asteroid_mill,
    ['mill_surge', 'seam_burst', 'rock_rain']);
  assert.deepEqual(SWARM_EVENT_TABLES.the_hive,
    ['spore_breath', 'wall_bloom', 'egg_drift', 'lantern_drift', 'shepherd_pulse']);

  const swing = SWARM_EVENT_BY_ID.well_swing;
  assert.equal(swing.kind, 'pulse');
  assert.equal(swing.field.bearing, 'across');
  assert.equal(swing.telegraph, 'WELL SWING — a pull is walking the room');
  const gust = SWARM_EVENT_BY_ID.sling_gust;
  assert.equal(gust.kind, 'surge');
  assert.equal(gust.factor, 1.8);
  assert.equal(gust.minor, true);
  const front = SWARM_EVENT_BY_ID.freeze_front;
  assert.equal(front.kind, 'pulse');
  assert.equal(front.field.kind, 'cone');
  assert.equal(front.field.bearing, 'lane');
  const shatter = SWARM_EVENT_BY_ID.plate_shatter;
  assert.equal(shatter.kind, 'surge');
  assert.equal(shatter.install.cover, true);
  assert.equal(shatter.wager.timeout, 'accept');
});

// Retired with C01-01 — the four new signature cards are major-band draws and no major
// round exists inside the thirty-round course. Deleted cases (see
// test/RETIRED_SWARM_ENDLESS.md):
//   - every signature in both decks is drawable through the real seeded path
//   - each new card spends its field spec — no dead authored params
//   - pylon_flip shoves where well_swing would gather — same chord, opposite sign
//   - sling_tide pours THROUGH the fight — apex up-current, dir down-tide
//   - thaw_burst lets go from the middle; cold_snap lands where the player is at fire time
//   - the wager honors telegraph and verdict — accept pays, refuse stands the room down
//   - an unanswered new card resolves to its authored accept — opt-out pressure holds
