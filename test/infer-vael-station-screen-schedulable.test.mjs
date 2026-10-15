// INFERENCE unit — VAEL STATION SCREEN was authored dead content: a fully-written warden-pair
// checkpoint interdiction whose gates (minSectorTier 2 AND minSecurity 0.6) no host sector
// could satisfy — every tier-2+ border_checkpoint/civilian_core host runs 0.30-0.35 security,
// every 0.6+ host is tier 0-1 — so the planner's candidate list was empty in every sector and
// no player could ever see it. The security floor is the authored intent ("policed space where
// ambushes rarely go") and stays; the tier floor drops to 1 so the policed core hosts it.
// Pinned through the real planner on the real sector/zone data.
import test from 'node:test';
import assert from 'node:assert/strict';

import { planEncountersDay } from '../src/systems/encounterDirector.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import { ENCOUNTERS } from '../src/data/encounters.js';

const ID = 'vael_station_screen';

function scheduleCount(catalog, seed, days = 40) {
  const hosts = new Map();
  for (const sec of SECTORS) {
    const zones = zonesForSector(sec.id);
    if (!zones || !zones.length) continue;
    for (let day = 0; day < days; day++) {
      for (const item of planEncountersDay(seed, sec.id, day, zones, null, catalog, null, null)) {
        if (item.shapeId === ID) hosts.set(sec.id, (hosts.get(sec.id) || 0) + 1);
      }
    }
  }
  return hosts;
}

test('the shipped catalog schedules the warden screen in the policed core', () => {
  const hosts = scheduleCount(ENCOUNTERS, 4242);
  assert.ok(hosts.size >= 1, `scheduled somewhere (hosts: ${[...hosts.keys()].join(',') || 'none'})`);
  for (const host of hosts.keys()) {
    const sec = SECTORS.find((s) => s.id === host);
    assert.ok(sec, `host ${host} is a real sector`);
    assert.ok(sec.security >= 0.6, `${host} honors the authored 0.6 security floor`);
    assert.ok((sec.tier | 0) >= 1, `${host} clears the tier floor`);
  }
});

test('the screen never schedules in low-security frontier hosts, even at high tier', () => {
  for (const seed of [4242, 7, 99, 2026]) {
    const hosts = scheduleCount(ENCOUNTERS, seed);
    for (const host of hosts.keys()) {
      const sec = SECTORS.find((s) => s.id === host);
      assert.ok(sec.security >= 0.6,
        `${host} (security ${sec.security}) cannot host under seed ${seed}`);
    }
  }
});

test('the pre-fix gates schedule nothing — the defect this fix removes, pinned', () => {
  const enc = ENCOUNTERS[ID];
  const before = { ...ENCOUNTERS, [ID]: { ...enc, gates: { ...enc.gates, minSectorTier: 2 } } };
  const hosts = scheduleCount(before, 4242);
  assert.equal(hosts.size, 0, 'tier 2 AND security 0.6 had no satisfying host — dead content');
});

test('the authored security floor is intact in the shipped module', () => {
  assert.equal(ENCOUNTERS[ID].gates.minSecurity, 0.6,
    'policed-space intent preserved — the fix widens hosts, not the law floor');
  assert.equal(ENCOUNTERS[ID].gates.minSectorTier, 1);
});
