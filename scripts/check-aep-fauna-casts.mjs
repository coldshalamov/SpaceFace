// scripts/check-aep-fauna-casts.mjs — C12 / ID-FA rim fauna cast contract.
// Proves the four rim ALIEN_SITES exist with real sector/zone/poi anchors, every cast
// species exists in FAUNA_SPECIES, planFaunaCast is deterministic and honors authored
// counts, arrival bands are sane, and each site reaches the contamination map.

import assert from 'node:assert/strict';
import {
  ALIEN_SITES,
  alienSitesForSector,
  contaminationBand,
  CONTAMINATION_SITE_BASE,
  planFaunaCast,
} from '../src/data/alienEcology.js';
import { FAUNA_SPECIES } from '../src/data/alienFauna.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { mulberry32 } from '../src/core/rng.js';

const EXPECTED = Object.freeze({
  triton_wake_eel_run: Object.freeze({
    sectorId: 'sector_triton_wake', zoneId: 'zone_triton_anomaly', poiId: 'poi_triton_anomaly',
    signatureSpecies: 'wake_eel',
  }),
  rhea_furnace_maw_gulch: Object.freeze({
    sectorId: 'sector_rhea_cinder', zoneId: 'zone_rhea_slag', poiId: 'poi_rhea_slag',
    signatureSpecies: 'furnace_maw',
  }),
  haumea_glassback_shelf: Object.freeze({
    sectorId: 'sector_haumea_rift', zoneId: 'zone_haumea_ice', poiId: 'poi_haumea_fissure',
    signatureSpecies: 'glassback',
  }),
  sedna_cold_bell_field: Object.freeze({
    sectorId: 'sector_sedna_dark', zoneId: 'zone_sedna_glow', poiId: 'poi_sedna_cadence',
    signatureSpecies: 'cold_bell',
  }),
});

for (const [siteId, want] of Object.entries(EXPECTED)) {
  const site = ALIEN_SITES[siteId];
  assert.ok(site, `missing ALIEN_SITES.${siteId}`);
  assert.equal(site.sectorId, want.sectorId, `${siteId} sectorId`);
  assert.equal(site.zoneId, want.zoneId, `${siteId} zoneId`);
  assert.equal(site.poiId, want.poiId, `${siteId} poiId`);

  // Real anchors: the zone must resolve from SECTOR_ZONES by id.
  const zone = zonesForSector(site.sectorId).find((z) => z && z.id === site.zoneId);
  assert.ok(zone, `${siteId} zone ${site.zoneId} not found in ${site.sectorId}`);

  // The signature species is cast, every cast species exists, counts are positive.
  assert.ok(site.faunaCast && site.faunaCast[want.signatureSpecies] > 0, `${siteId} must cast ${want.signatureSpecies}`);
  for (const [speciesId, count] of Object.entries(site.faunaCast)) {
    assert.ok(FAUNA_SPECIES[speciesId], `${siteId} cast species ${speciesId} not in FAUNA_SPECIES`);
    assert.ok(Number.isInteger(count) && count > 0, `${siteId}.${speciesId} count must be a positive int`);
  }

  // Arrival bands descend and carry scan language.
  const b = site.arrivalBands;
  assert.ok(b && b.long > b.mid && b.mid > b.close && b.close > 0, `${siteId} arrivalBands must descend long>mid>close`);
  for (const band of ['long', 'mid', 'close']) {
    assert.ok(site.arrivalLines && site.arrivalLines[band] && site.arrivalLines[band].length > 10, `${siteId} missing ${band} arrival line`);
  }

  // Contamination + growth dressing present and in-band.
  assert.ok(site.baseContamination > 0 && site.baseContamination <= 1, `${siteId} baseContamination out of range`);
  assert.ok(contaminationBand(site.baseContamination), `${siteId} contamination must map to a band`);
  assert.ok(CONTAMINATION_SITE_BASE[siteId], `${siteId} missing CONTAMINATION_SITE_BASE entry`);
  const gr = site.growthRing;
  assert.ok(gr && gr.inner > 0 && gr.outer > gr.inner && gr.count > 0, `${siteId} growthRing malformed`);

  // Cast planning is deterministic and honors every authored member.
  const castA = planFaunaCast(site, mulberry32(12345));
  const castB = planFaunaCast(site, mulberry32(12345));
  assert.deepEqual(castA, castB, `${siteId} planFaunaCast must be deterministic`);
  for (const [speciesId, count] of Object.entries(site.faunaCast)) {
    assert.equal(
      castA.filter((m) => m.speciesId === speciesId).length, count,
      `${siteId} cast ${speciesId} x${count} but plan produced ${castA.filter((m) => m.speciesId === speciesId).length}`,
    );
  }
}

// Sector wiring: each site is reachable via alienSitesForSector.
for (const siteId of Object.keys(EXPECTED)) {
  const site = ALIEN_SITES[siteId];
  assert.ok(
    alienSitesForSector(site.sectorId).some((s) => s.siteId === siteId),
    `${siteId} not reachable via alienSitesForSector`,
  );
}

console.log(`check:aep-fauna-casts OK — ${Object.keys(EXPECTED).length} rim sites verified (wake_eel@Triton, furnace_maw@Rhea, glassback@Haumea, cold_bell@Sedna)`);
