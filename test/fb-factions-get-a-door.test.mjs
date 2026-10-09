// FB-043 — Archive, Understory, and Helix each have a dock. Helix's door is Sedna, not Orcus.
import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { FACTION_META } from '../src/data/factions.js';

function meta(id) {
  return FACTION_META.find((row) => row.id === id);
}
import { zonesForSector } from '../src/data/sectorZones.js';

function station(id) {
  for (const sector of SECTORS) {
    const row = (sector.stations || []).find((item) => item && item.id === id);
    if (row) return { sector, station: row };
  }
  return null;
}

test('three placeless factions own a dockable station and a home sector', () => {
  const doors = [
    ['faction_archive', 'station_orcus_shadow', 'sector_orcus_shadow'],
    ['faction_understory', 'station_eunomia', 'sector_eunomia_gulf'],
    ['faction_helix', 'station_sedna', 'sector_sedna_dark'],
  ];
  for (const [factionId, stationId, sectorId] of doors) {
    const found = station(stationId);
    assert.ok(found, stationId);
    assert.equal(found.station.factionId, factionId);
    assert.equal(found.sector.id, sectorId);
    assert.ok((found.station.services || []).length > 0, `${stationId} can be docked for a service`);
    assert.ok(meta(factionId).homeSectors.includes(sectorId));
  }
  assert.deepEqual(meta('faction_helix').homeSectors, ['sector_sedna_dark']);
  assert.deepEqual(meta('faction_fulfillment').homeSectors, []);
});

test('Orcus stays a Vael threshold around an Archive dock', () => {
  const zones = zonesForSector('sector_orcus_shadow');
  const shadow = zones.find((zone) => zone.id === 'zone_orcus_shadow');
  const research = zones.find((zone) => zone.id === 'zone_orcus_research');
  assert.equal(shadow.factionId, 'faction_vael');
  assert.equal(research.factionId, 'faction_archive');
  const orcus = SECTORS.find((sector) => sector.id === 'sector_orcus_shadow');
  const plinth = orcus.pois.find((poi) => poi.id === 'poi_orcus_plinth');
  assert.equal(plinth.factionId, 'faction_vael');
});
