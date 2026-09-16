// PQ-193.01 — Helios / Kessler opening NPCs are packaged complete bodies in Hitch's world.
//
// Imports the shipped opening-flyby catalog. Every slot must resolve a packaged hull
// (not accessory-only, not missing sockets, not factory Hornet). Chase stills vs Hitch
// close the same-game bar; GPU live capture is not required when the legal chase camera
// stills of the live GLBs already exist.
//
//   node --test test/pq-193-01-opening-npcs.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  authoredPreloadPlanForEntity,
  isPackagedLiveWholeShipFile,
  OPENING_FLYBY_NPC_SLOTS,
  openingFlybyNpcBody,
  openingFlybyNpcCatalog,
  openingFlybyNpcEntity,
  requiresProductionWholeShipForEntity,
} from '../src/render/partsLibrary.js';
import { renderPackagePilotForSourceUrl } from '../src/render/renderPackageManifest.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEED = 47;
const ACCESSORY_SLOTS = new Set([
  'fin', 'engine', 'gear', 'greeble', 'weapon', 'cockpit', 'utility',
]);
const HITCH_WORLD_OPENING_FILES = Object.freeze(new Set([
  'wholeships/drifter_production_v1.glb',
  'wholeships/wasp_production_v1.glb',
  'wholeships/helios_lark.glb',
  'wholeships/helios_span.glb',
  'wholeships/helios_cradle.glb',
  'wholeships/yard_tug.glb',
]));
const FACTORY_HORNET = 'wholeships/hornet_production_v1.glb';
const HITCH_FILE = 'wholeships/kestrel.glb';

function packageJsonFor(file) {
  const pilot = renderPackagePilotForSourceUrl(`assets/ships/release/parts/${file}`);
  assert.ok(pilot, `${file} must have a render-package pilot`);
  const pkg = JSON.parse(readFileSync(resolve(ROOT, pilot.metadataUrl), 'utf8'));
  return { pilot, pkg };
}

function socketNames(pkg) {
  const names = new Set();
  const anchors = Array.isArray(pkg.anchors) ? pkg.anchors : [];
  for (const anchor of anchors) {
    const name = String(anchor && (anchor.nodeName || anchor.name) || '');
    if (name.startsWith('SOCKET_')) names.add(name);
  }
  return names;
}

test('every opening-flyby NPC slot resolves a packaged complete body (seed 47)', () => {
  assert.equal(SEED, 47);
  assert.ok(OPENING_FLYBY_NPC_SLOTS.length >= 7, 'opening flyby must name the live Helios/Kessler slots');
  const catalog = openingFlybyNpcCatalog();
  assert.equal(catalog.length, OPENING_FLYBY_NPC_SLOTS.length);
  const rows = [];
  for (const slot of OPENING_FLYBY_NPC_SLOTS) {
    const entity = openingFlybyNpcEntity(slot);
    assert.equal(requiresProductionWholeShipForEntity(entity)
      || slot.id === 'courier' || slot.id === 'hauler' || slot.id === 'miner' || slot.id === 'tug',
    true, `${slot.id} must not fall back to modular kit`);
    const visual = openingFlybyNpcBody(slot);
    assert.ok(visual && visual.file, `${slot.id} must resolve a body`);
    assert.equal(isPackagedLiveWholeShipFile(visual.file), true, `${slot.id} ${visual.file} packaged live`);
    const plan = authoredPreloadPlanForEntity(entity, { requiredWholeShip: true });
    const files = Object.values(plan || {}).flat().filter(Boolean);
    assert.deepEqual(files, [visual.file], `${slot.id} must not request accessory kit`);
    const { pilot, pkg } = packageJsonFor(visual.file);
    assert.equal(pilot.slot, 'hull', `${slot.id} must be a complete hull, not ${pilot.slot}`);
    assert.equal(ACCESSORY_SLOTS.has(pilot.slot), false, `${slot.id} accessory-only is forbidden`);
    const sockets = socketNames(pkg);
    assert.ok(sockets.size > 0, `${slot.id} must publish sockets`);
    assert.ok(
      sockets.has('SOCKET_Engine_Main') || sockets.has('SOCKET_Trail_Main') || sockets.has('SOCKET_Camera_Focus'),
      `${slot.id} missing meeting sockets: ${[...sockets].join(',')}`,
    );
    assert.notEqual(visual.file, FACTORY_HORNET, `${slot.id} must not publish factory Hornet on the flyby`);
    assert.notEqual(visual.file, HITCH_FILE, `${slot.id} must not dump Hitch onto an NPC`);
    assert.equal(HITCH_WORLD_OPENING_FILES.has(visual.file), true, `${slot.id} ${visual.file} is not a Hitch-world opening body`);
    rows.push({ id: slot.id, file: visual.file, slot: pilot.slot, sockets: sockets.size });
  }
  console.log('pq-193.01 opening flyby NPC bodies (seed 47):');
  for (const row of rows) console.log('  ', JSON.stringify(row));
  assert.equal(rows.length, OPENING_FLYBY_NPC_SLOTS.length);
});

test('opening smuggler, pirate, and recovery tug are complete hulls not modular scraps', () => {
  const catalog = openingFlybyNpcCatalog();
  const byId = Object.fromEntries(catalog.map((row) => [row.id, row]));
  assert.equal(byId.smuggler.file, 'wholeships/drifter_production_v1.glb');
  assert.equal(byId.pirate.file, 'wholeships/wasp_production_v1.glb');
  assert.equal(byId.pirate.assetId, 'SF_WASP_PRODUCTION_V1');
  assert.equal(byId.recovery_tug.file, 'wholeships/yard_tug.glb');
  assert.equal(byId.recovery_tug.assetId, 'SF_WHOLESHIP_YARD_TUG');
});

test('opening civilians stay Helios Lark/Span/Cradle; pirate is accepted Wasp not factory Hornet', () => {
  const catalog = openingFlybyNpcCatalog();
  const byId = Object.fromEntries(catalog.map((row) => [row.id, row]));
  assert.equal(byId.courier.file, 'wholeships/helios_lark.glb');
  assert.equal(byId.hauler.file, 'wholeships/helios_span.glb');
  assert.equal(byId.miner.file, 'wholeships/helios_cradle.glb');
  assert.equal(byId.tug.file, 'wholeships/yard_tug.glb');
  assert.notEqual(byId.pirate.file, FACTORY_HORNET);
  assert.equal(catalog.some((row) => row.file === HITCH_FILE), false);
});
