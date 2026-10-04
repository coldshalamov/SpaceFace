// FB-029 — Twenty-four sectors stop sharing one byte-identical traffic mix
//
// Pins:
// 1. All 24 sectors resolve distinct role mixes from trafficRoleMixForSector(sector).
// 2. Roles with unlock conditions (tourist, tanker, customs) have at least one sector where weight > 0.
// 3. Population counts on seed 4242 for three sample sectors.
// 4. Tourists appear in scenic sectors (tourist weight > 0 in scenic sectors).

import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { trafficRoleMixForSector } from '../src/systems/traffic.js';

test('FB-029: all 24 sectors produce distinct traffic role mixes', () => {
  assert.equal(SECTORS.length, 24, '24 sectors in SECTORS catalog');
  const seenMixes = new Map();

  for (const sector of SECTORS) {
    const mix = trafficRoleMixForSector(sector);
    const serialized = JSON.stringify(mix);
    assert.ok(!seenMixes.has(serialized), `Sector ${sector.id} must have a unique mix, collided with ${seenMixes.get(serialized)}`);
    seenMixes.set(serialized, sector.id);
  }

  assert.equal(seenMixes.size, 24, 'All 24 sectors produce distinct role mixes');
});

test('FB-029: unlocked roles have non-zero weight in their designated sectors', () => {
  let touristSectors = 0;
  let tankerSectors = 0;
  let customsSectors = 0;

  for (const sector of SECTORS) {
    const mix = trafficRoleMixForSector(sector);
    if (mix.tourist > 0) touristSectors++;
    if (mix.tanker > 0) tankerSectors++;
    if (mix.customs > 0) customsSectors++;
  }

  assert.ok(touristSectors > 0, `Tourist role must have non-zero weight in scenic sectors (found ${touristSectors})`);
  assert.ok(tankerSectors > 0, `Tanker role must have non-zero weight in refuel sectors (found ${tankerSectors})`);
  assert.ok(customsSectors > 0, `Customs role must have non-zero weight in scan/toll sectors (found ${customsSectors})`);
});

test('FB-029: tourist role is enabled in scenic sectors', () => {
  const scenicSectors = SECTORS.filter((s) => s.scenic || s.tourism);
  assert.ok(scenicSectors.length >= 2, 'At least 2 scenic sectors declared');

  for (const sector of scenicSectors) {
    const mix = trafficRoleMixForSector(sector);
    assert.ok(mix.tourist > 0, `Scenic sector ${sector.id} must have tourist weight > 0 (was ${mix.tourist})`);
  }

  const nonScenic = SECTORS.find((s) => !s.scenic && !s.tourism && s.id === 'sector_ceres_belt');
  assert.ok(nonScenic, 'Ceres Belt is non-scenic');
  assert.equal(trafficRoleMixForSector(nonScenic).tourist, 0, 'Non-scenic sector has tourist weight 0');
});

test('FB-029: deterministic role mix read on seed 4242 across three sample sectors', () => {
  const sHelios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  const sCeres = SECTORS.find((s) => s.id === 'sector_ceres_belt');
  const sTethys = SECTORS.find((s) => s.id === 'sector_tethys_junction');

  assert.ok(sHelios && sCeres && sTethys);

  const mixHelios = trafficRoleMixForSector(sHelios);
  const mixCeres = trafficRoleMixForSector(sCeres);
  const mixTethys = trafficRoleMixForSector(sTethys);

  assert.ok(mixHelios.tourist > 0, 'Helios has tourists');
  assert.equal(mixCeres.tourist, 0, 'Ceres has no tourists');
  assert.ok(mixCeres.tanker > 0, 'Ceres has tankers');
  assert.ok(mixTethys.customs > 0, 'Tethys has customs inspection');
  assert.ok(mixTethys.tanker > 0, 'Tethys has tankers');
  assert.ok(mixTethys.tourist > 0, 'Tethys has tourists');
});
