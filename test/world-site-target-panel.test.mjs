import test from 'node:test';
import assert from 'node:assert/strict';
import { CERES_SHIPBREAK_MANIFEST as manifest } from '../src/data/ceresShipbreak.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import { createWorldSiteRecord } from '../src/systems/worldSiteKernel.js';
import { objectInfoLine, targetDisplayName, targetInteractionClass } from '../src/ui/targetPanel.js';

function fixture() {
  const record = createWorldSiteRecord(manifest);
  const clamp = { id: 1045, type: 'wreck', alive: true, radius: 6, pos: { x: 0, z: 0 },
    data: { role: 'world_site_component', worldSiteId: manifest.id, worldSiteComponentId: 'long_plate_clamp',
      worldSiteTargetable: true, name: 'LONG PLATE — SUPPORT CLAMP', salvagePool: { cmdty_scrap_metal: 4 } } };
  const section = { id: 1053, type: 'wreck', alive: true, radius: 60, mass: 1800, pos: { x: 0, z: 0 },
    data: { role: 'world_site_payload', worldSiteId: manifest.id, worldSiteComponentId: 'long_plate',
      worldSitePayloadId: 'long_plate', worldSiteStructural: true, worldSiteTargetable: true,
      name: 'Second Measure Long Plate', salvagePool: {} } };
  const player = { data: { miningBeam: { range: 200 } } };
  const state = { sites: { worldById: { [manifest.id]: record } }, entities: new Map([[clamp.id, clamp], [section.id, section]]),
    settings: { controls: { bindings: { siteBeam: ['KeyJ'] } } } };
  return { record, clamp, section, player, state };
}

test('Ceres component and section show live work and physical mass, not generic wreck loot', () => {
  const { record, clamp, section, player, state } = fixture();
  assert.equal(targetDisplayName(clamp), 'LONG PLATE — SUPPORT CLAMP');
  assert.equal(targetInteractionClass(clamp), 'Work site');
  assert.match(objectInfoLine(clamp, state, player, 20), /unbraced.*Hold J · brace.*Second Measure Long Plate.*1,800 T/i);
  assert.doesNotMatch(objectInfoLine(clamp, state, player, 20), /scrap|holds|salvage/i);
  state.settings.controls.bindings.siteBeam = ['KeyB'];
  record.components.long_plate_clamp.progress.brace_long_plate = 12;
  assert.match(objectInfoLine(clamp, state, player, 20), /Hold B · brace 50%/);
  assert.match(objectInfoLine(clamp, state, player, 500), /Out of beam range/);
  state.settings.controls.bindings.siteBeam = ['KeyJ'];
  record.components.long_plate_clamp.status = 'braced';
  record.completedOperations.brace_long_plate = {};
  assert.match(objectInfoLine(clamp, state, player, 20), /braced.*LONG PLATE — CUT SEAM first/i);
  assert.equal(targetDisplayName(section), 'Second Measure Long Plate');
  assert.equal(targetInteractionClass(section), 'Structural section');
  assert.match(objectInfoLine(section, state, player, 20), /intact.*Hold J · cut.*Mass · 1,800 T/i);
  record.components.long_plate.status = 'cut';
  record.completedOperations.cut_long_plate_seam = {};
  record.payloads.long_plate.status = 'released';
  assert.match(objectInfoLine(clamp, state, player, 20), /braced.*Hold J · release.*Supported/i);
  assert.doesNotMatch(objectInfoLine(section, state, player, 20), /picked clean|scrap|holds/i);
});

test('ordinary scanned wreck retains its salvage inventory', () => {
  const wreck = { id: 7, type: 'wreck', alive: true, radius: 8, data: { scanned: true, salvagePool: { cmdty_scrap_metal: 4 } } };
  assert.match(objectInfoLine(wreck, { player: {}, ui: {} }, { data: { miningBeam: { range: 200 } } }, 20), /Holds Scrap Metal ×4/);
});

test('site payload materials come from the site record and honor an empty remainder', () => {
  const site = worldSiteManifestById('world_site_helios_relay');
  const record = createWorldSiteRecord(site);
  const target = { id: 11, type: 'wreck', alive: true, radius: 8, data: {
    role: 'world_site_component', worldSiteId: site.id, worldSiteComponentId: 'payload_cradle',
    worldSiteTargetable: true, name: 'FIELD COIL CRADLE', salvagePool: { cmdty_scrap_metal: 4 },
  } };
  const state = { sites: { worldById: { [site.id]: record } }, entities: new Map([[11, target]]) };
  const player = { data: { miningBeam: { range: 200 } } };
  assert.match(objectInfoLine(target, state, player, 20), /Payload: Scrap Metal ×6, Electronics ×2/);
  record.payloads.relay_field_coil.remainingPool = {};
  assert.doesNotMatch(objectInfoLine(target, state, player, 20), /Scrap|Electronics/);
});
