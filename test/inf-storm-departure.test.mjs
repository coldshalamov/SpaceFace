// inf-storm-departure — leaving the storm reads: the grip lets go with a shed.
//
// The player story: crossing into the Ashfall Roaming Burn plays the charge beat at the
// line and the static crawls the hull while I ride it (inf-storm-crossing). But when I
// cross OUT, the picture went silent — the sim publishes hazard:exit with { entityId,
// zoneType, intensity } and the only response was to stop the static mid-tick. Now the
// departure sheds: one last discharge flicker of the zone's own hue drifting off the hull,
// thinner and slower than the entry charge — a release, not a bite. The exit receipt's own
// intensity keys the shed, so slipping a dying storm sheds fainter than punching out of a
// live one.
//
// These tests pin the pure decision layer (resolveStormDepartureBeat in
// src/render/stormDepartureRead.js); the vfx exit branch spawns exactly what it names.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  resolveStormDepartureBeat,
  STORM_DEPARTURE_BASE_COUNT,
  STORM_DEPARTURE_INTENSITY_COUNT,
  STORM_DEPARTURE_REDUCED_MUL,
} from '../src/render/stormDepartureRead.js';
import {
  resolveStormCrossingBeat,
  STORM_CROSSING_BASE_COUNT,
  STORM_CROSSING_INTENSITY_COUNT,
} from '../src/render/hazardStormRead.js';
import { STORM_ZONE_COLORS } from '../src/render/hazardStormRead.js';

const RECEIPT = { entityId: 'player-1', zoneType: 'radiation', intensity: 0.7 };

test('a hazard:exit receipt sheds the zone hue off the hull', () => {
  const shed = resolveStormDepartureBeat(RECEIPT, 122.4, false);
  assert.ok(shed, 'the exit receipt answers');
  assert.equal(shed.colorHex, STORM_ZONE_COLORS.radiation,
    'the shed is the zone family\'s own hue');
  assert.equal(shed.intensity, 0.7);
  assert.ok(shed.count >= 2 && shed.count <= STORM_DEPARTURE_BASE_COUNT + STORM_DEPARTURE_INTENSITY_COUNT + 1);
  assert.equal(shed.angles.length, shed.count, 'one shed direction per particle');
});

test('the shed is thinner and slower than the entry charge — a release, not a bite', () => {
  const entry = resolveStormCrossingBeat(RECEIPT, 122.4, false);
  const shed = resolveStormDepartureBeat(RECEIPT, 122.4, false);
  assert.ok(shed.count < entry.count,
    `fewer particles leave than arrive (${shed.count} vs ${entry.count})`);
  assert.ok(shed.shedSpeed < 13 + 0.7 * 15,
    'the shed drifts slower than the entry charge at the same intensity');
  assert.ok(shed.lifeS > entry.count * 0 + 0.5, 'the flicker lingers a breath');
});

test('the release light never reaches detonation grade — the storm is not biting on the way out', () => {
  const heavy = resolveStormDepartureBeat({ ...RECEIPT, intensity: 0.9 }, 5, false);
  assert.equal(heavy.lightSeverity, 'contact', 'a heavy zone flickers, it does not detonate');
  const light = resolveStormDepartureBeat({ ...RECEIPT, intensity: 0.2 }, 5, false);
  assert.equal(light.lightSeverity, 'graze');
  // Contrast: the ENTRY beat keys its light to the bite — detonation at heavy intensity.
  const heavyEntry = resolveStormCrossingBeat({ ...RECEIPT, intensity: 0.9 }, 5, false);
  assert.equal(heavyEntry.lightSeverity, 'detonation');
});

test('no hull or no zone stays silent — the machinery emitters without a hull stay unhurried', () => {
  assert.equal(resolveStormDepartureBeat(null, 5, false), null);
  assert.equal(resolveStormDepartureBeat({ zoneType: 'radiation' }, 5, false), null,
    'no entityId — no shed');
  assert.equal(resolveStormDepartureBeat({ entityId: 'player-1' }, 5, false), null,
    'no zoneType — no shed');
  assert.equal(resolveStormDepartureBeat({ entityId: 'player-1', zoneType: '' }, 5, false), null);
});

test('reduced motion thins the shed, never silences it, and holds the colour', () => {
  const full = resolveStormDepartureBeat(RECEIPT, 40, false);
  const still = resolveStormDepartureBeat(RECEIPT, 40, true);
  assert.ok(still.count < full.count, 'reduced motion thins the shed');
  assert.ok(still.count >= 2, 'the shed never drops to zero');
  assert.equal(still.colorHex, full.colorHex, 'the hue never changes');
  assert.ok(Math.abs((full.count / still.count) - 1 / STORM_DEPARTURE_REDUCED_MUL) < 1.5,
    'the thinning rides the authored multiplier');
});

test('the shed is deterministic per receipt and time — no rng, no wall clock', () => {
  const a = resolveStormDepartureBeat(RECEIPT, 66.2, false);
  const b = resolveStormDepartureBeat(RECEIPT, 66.2, false);
  assert.deepEqual(
    { c: a.count, s: a.shedSpeed, l: a.lifeS, angles: a.angles, seed: a.seed },
    { c: b.count, s: b.shedSpeed, l: b.lifeS, angles: b.angles, seed: b.seed },
  );
  const later = resolveStormDepartureBeat(RECEIPT, 66.4, false); // the next 1/8 s bucket
  assert.notEqual(a.seed, later.seed, 'a different moment builds its own shed');
});

test('a broken clock degrades to a deterministic shed, not a crash', () => {
  const badTime = resolveStormDepartureBeat(RECEIPT, Number.NaN, false);
  assert.ok(badTime && badTime.count >= 2 && Number.isFinite(badTime.shedSpeed));
  const badIntensity = resolveStormDepartureBeat(
    { entityId: 'p', zoneType: 'nebula', intensity: Number.NaN }, 5, false);
  assert.ok(badIntensity && badIntensity.intensity === 0, 'a broken intensity clamps to calm');
  assert.equal(badIntensity.colorHex, STORM_ZONE_COLORS.nebula);
});

test('the constants keep the departure thinner than the crossing at every intensity', () => {
  for (const intensity of [0, 0.25, 0.5, 0.75, 1]) {
    const r = { entityId: 'p', zoneType: 'debris', intensity };
    const shed = resolveStormDepartureBeat(r, 9, false);
    const entry = resolveStormCrossingBeat(r, 9, false);
    assert.ok(shed.count < entry.count, `intensity ${intensity}: shed < entry`);
  }
  assert.ok(STORM_CROSSING_BASE_COUNT > STORM_DEPARTURE_BASE_COUNT);
  assert.ok(STORM_CROSSING_INTENSITY_COUNT > STORM_DEPARTURE_INTENSITY_COUNT);
});
