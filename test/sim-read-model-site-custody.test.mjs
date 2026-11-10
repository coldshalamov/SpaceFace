import test from 'node:test';
import assert from 'node:assert/strict';
import { createDomainDiffer, applyDomainPathUpdate, configureDomainMirroring } from '../scripts/lib/simReadModel.mjs';
import { projectCargoCustody } from '../src/ui/sim/custodyProjection.js';
import { worldSiteMapMarkers } from '../src/ui/worldSiteMapLayer.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';

function transport() {
  configureDomainMirroring({});
  const differ = createDomainDiffer();
  const domains = new Map(), touched = new Set();
  const facade = { sites: { presentationLocal: 'keep' }, automation: { presentationLocal: 'keep' } };
  domains.set('sites', facade.sites); domains.set('automation', facade.automation);
  return { facade, land(state, tick) {
    for (const update of differ.diff(state, tick).updates) {
      const segs = update.segs.length === 1 && update.segs[0].includes('.') ? update.segs[0].split('.') : update.segs;
      applyDomainPathUpdate(domains, { ...update, segs }, touched);
      facade[segs[0]] = domains.get(segs[0]);
    }
  } };
}

test('worker site state reaches the map and cargo projection without replacing local siblings', () => {
  const manifest = worldSiteManifestById('world_site_helios_relay');
  const record = createWorldSiteRecord(manifest, { tick: 0 });
  const state = { sites: { byId: {
    mine: { id: 'mine', shipment: { owner: 'mine', items: { cmdty_ore_iron: 7 } } },
  }, worldById: { [manifest.id]: record }, worldOrder: [manifest.id] }, automation: { drones: [] } };
  const { facade, land } = transport();
  land(state, 0);
  assert.deepEqual(worldSiteMapMarkers(facade, manifest.sectorId), worldSiteMapMarkers(state, manifest.sectorId));
  assert.equal(worldSiteMapMarkers(facade, manifest.sectorId).length, 1);
  assert.equal(projectCargoCustody(facade).byCommodity.cmdty_ore_iron.operation, 7);
  const siteBag = facade.sites;
  state.sites.byId.mine.shipment.items.cmdty_ore_iron = 2;
  record.revision++; record.completionCount = 3;
  for (let tick = 1; tick <= 60; tick++) land(state, tick);
  assert.equal(facade.sites, siteBag);
  assert.equal(facade.sites.presentationLocal, 'keep');
  assert.equal(projectCargoCustody(facade).byCommodity.cmdty_ore_iron.operation, 2);
  assert.deepEqual(worldSiteMapMarkers(facade, manifest.sectorId), worldSiteMapMarkers(state, manifest.sectorId));
  state.sites.byId = {}; state.sites.worldById = {}; state.sites.worldOrder = [];
  for (let tick = 61; tick <= 120; tick++) land(state, tick);
  assert.deepEqual(worldSiteMapMarkers(facade, manifest.sectorId), []);
  assert.equal(projectCargoCustody(facade).lots.length, 0);
});

test('worker drone shipments update and retire in the cargo transfer projection', () => {
  const state = { sites: { byId: {}, worldById: {}, worldOrder: [] }, automation: { drones: [
    { id: 'courier', shipment: { owner: 'courier', items: { cmdty_ore_iron: 4 } } },
  ] } };
  const { facade, land } = transport();
  land(state, 0);
  assert.equal(projectCargoCustody(facade).byCommodity.cmdty_ore_iron.operation, 4);
  const drones = facade.automation.drones;
  state.automation.drones[0].shipment.items.cmdty_ore_iron = 9;
  for (let tick = 1; tick <= 60; tick++) land(state, tick);
  assert.equal(facade.automation.drones, drones);
  assert.equal(facade.automation.presentationLocal, 'keep');
  assert.equal(projectCargoCustody(facade).byCommodity.cmdty_ore_iron.operation, 9);
  state.automation.drones.length = 0;
  for (let tick = 61; tick <= 120; tick++) land(state, tick);
  assert.equal(projectCargoCustody(facade).lots.length, 0);
});
