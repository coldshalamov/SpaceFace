// INF-8 (WF-03): a hazard-flagged zone label must sit on the hazard it names. Entering the label
// triggers the hazard language ("shields and cargo cook inside"); a label parked on ore while the
// real burn sits elsewhere says it where nothing burns and stays silent where something does.
import assert from 'node:assert/strict';
import test from 'node:test';

import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_ZONES, ZONE_TYPES } from '../src/data/sectorZones.js';
import { ADVENTURE_ARENA_SITE_BY_ARENA } from '../src/data/adventureArenaSites.js';

// zone type -> the sector hazard kind it labels. planetary_mass labels an atmosphere band that is
// not a sector hazard disc, so it is not part of this contract.
const HAZARD_KIND_BY_ZONE_TYPE = Object.freeze({ radiation_field: 'radiation', nebula_fog: 'nebula' });
const RADIUS_RATIO_MAX = 2.5;
// Authored on purpose: the chart's own words say it is not radiation ("The chart calls it
// radiation. It is not."), and the Bolus has no hazard disc to move onto.
const AUTHORED_MISLABELS = Object.freeze(new Set(['zone_bolus_lumen']));

const sectorById = new Map(SECTORS.map((sector) => [sector.id, sector]));

function overlapProblems() {
  const problems = [];
  let checked = 0;
  for (const [sectorId, zones] of Object.entries(SECTOR_ZONES)) {
    const sector = sectorById.get(sectorId);
    if (!sector) continue;
    for (const zone of zones) {
      const kind = HAZARD_KIND_BY_ZONE_TYPE[zone.type];
      if (!kind || !(ZONE_TYPES[zone.type] || {}).hazard || AUTHORED_MISLABELS.has(zone.id)) continue;
      checked += 1;
      const hazards = (sector.hazards || []).filter((hazard) => hazard.type === kind);
      const ok = hazards.some((hazard) => {
        const d = Math.hypot(zone.center.x - hazard.center.x, zone.center.z - hazard.center.z);
        const ratio = Math.max(zone.radius, hazard.radius) / Math.max(1, Math.min(zone.radius, hazard.radius));
        // A label may be a dense part of a larger hazard (fully inside it); one that sticks out of
        // the hazard must be comparable in size to it.
        const inside = d + zone.radius <= hazard.radius;
        return d <= hazard.radius && (inside || ratio <= RADIUS_RATIO_MAX);
      });
      if (!ok) problems.push(`${sectorId}/${zone.id}`);
    }
  }
  return { problems, checked };
}

test('the check is not vacuous: hazard zones exist and are compared with real hazards', () => {
  assert.ok(overlapProblems().checked >= 3, `checked ${overlapProblems().checked} hazard zones`);
});

test('every hazard-flagged zone has its centre on a same-kind hazard of comparable size', () => {
  assert.deepEqual(overlapProblems().problems, [], 'a hazard label must sit on the hazard it names');
});

test('the Slag Radiation Field sits on Vesta\'s real radiation, not on its ore field', () => {
  const zone = SECTOR_ZONES.sector_vesta_forge.find((z) => z.id === 'zone_vesta_slag');
  const hazard = sectorById.get('sector_vesta_forge').hazards.find((h) => h.type === 'radiation');
  assert.ok(Math.hypot(zone.center.x - hazard.center.x, zone.center.z - hazard.center.z) <= hazard.radius);
});

test('the Cryo Drift arena still sits on the zone it is named for', () => {
  const zone = SECTOR_ZONES.sector_vesta_forge.find((z) => z.id === 'zone_vesta_slag');
  assert.deepEqual(ADVENTURE_ARENA_SITE_BY_ARENA.cryo_drift.center, zone.center);
});
