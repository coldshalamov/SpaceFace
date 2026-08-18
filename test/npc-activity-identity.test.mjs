// PQ-045.npc-identity — the four occupational NPC families must resolve to four DISTINCT
// whole-ship hulls and four DISTINCT labels, and the assets those resolutions name must actually
// exist on the runtime path.
//
// The trap this pins shut: WHOLE_SHIP_FILE_BY_TRAFFIC_ROLE is keyed by `presentationRole`, and
// `hauler` is the accepted helios_span. An ore barge wired under `hauler` — or under a new role
// with no TRAFFIC_ROLES entry — silently inherits hauler's ship, team, speed and the
// "Cargo Hauler" label, and NOTHING reports it: the label fallback reads
// `TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler` and the renderer falls back to procedural
// geometry while the ship stays visible. So this test asserts the wiring AND the presence of
// every artifact the runtime resolution chain needs, failing loudly instead of letting a
// missing GLB/manifest row/render package masquerade as an art problem.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { TRAFFIC_ROLES } from '../src/systems/traffic.js';
import { wholeShipVisualForEntity } from '../src/render/partsLibrary.js';

const ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));

// The four occupational families and the presentationRole each resolves through.
// ore_carrier is the NEW role (ore barge); the other three predate this unit but had no
// whole-ship binding — they rendered as shared modular hulls until now.
const FAMILIES = Object.freeze([
  Object.freeze({ role: 'ore_carrier', label: 'Ore Barge', file: 'wholeships/ore_barge.glb', assetId: 'SF_WHOLESHIP_ORE_BARGE', ship: 'ship_ironback' }),
  Object.freeze({ role: 'tender', label: 'Repair Tender', file: 'wholeships/repair_tender.glb', assetId: 'SF_WHOLESHIP_REPAIR_TENDER', ship: 'ship_drifter' }),
  Object.freeze({ role: 'salvor', label: 'Salvage Cutter', file: 'wholeships/salvage_cutter.glb', assetId: 'SF_WHOLESHIP_SALVAGE_CUTTER', ship: 'ship_pelican' }),
  Object.freeze({ role: 'surveyor', label: 'Survey Rig', file: 'wholeships/survey_pin.glb', assetId: 'SF_WHOLESHIP_SURVEY_PIN', ship: 'ship_ranger' }),
  Object.freeze({ role: 'rescue', label: 'Rescue Craft', file: 'wholeships/rescue_lifter.glb', assetId: 'SF_WHOLESHIP_RESCUE_LIFTER', ship: 'ship_drifter' }),
  Object.freeze({ role: 'tanker', label: 'Volatiles Tanker', file: 'wholeships/volatiles_tanker.glb', assetId: 'SF_WHOLESHIP_VOLATILES_TANKER', ship: 'ship_atlas' }),
  Object.freeze({ role: 'prospector', label: 'Prospector Skiff', file: 'wholeships/prospector_skiff.glb', assetId: 'SF_WHOLESHIP_PROSPECTOR_SKIFF', ship: 'ship_pelican' }),
  Object.freeze({ role: 'sweeper', label: 'Scrap Sweeper', file: 'wholeships/scrap_sweeper.glb', assetId: 'SF_WHOLESHIP_SCRAP_SWEEPER', ship: 'ship_pelican' }),
  Object.freeze({ role: 'tug', label: 'Yard Tug', file: 'wholeships/yard_tug.glb', assetId: 'SF_WHOLESHIP_YARD_TUG', ship: 'ship_mule' }),
  Object.freeze({ role: 'shuttle', label: 'Apron Shuttle', file: 'wholeships/apron_shuttle.glb', assetId: 'SF_WHOLESHIP_APRON_SHUTTLE', ship: 'ship_drifter' }),
]);

function readGlbAssetId(path) {
  const buf = readFileSync(path);
  if (buf.toString('utf8', 0, 4) !== 'glTF') throw new Error(`not a GLB: ${path}`);
  let off = 12;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    off += 8;
    if (type === 0x4e4f534a) {
      const doc = JSON.parse(buf.subarray(off, off + len).toString('utf8').replace(/\0+$/, '').trim());
      return doc?.asset?.extras?.spacefaceAsset?.assetId || null;
    }
    off += len;
  }
  return null;
}

test('every occupational role has its own TRAFFIC_ROLES entry with a distinct label', () => {
  const labels = new Set();
  for (const family of FAMILIES) {
    const def = TRAFFIC_ROLES[family.role];
    assert.ok(def, `${family.role} must exist in TRAFFIC_ROLES — without it the spawn path `
      + 'silently inherits hauler ship/team/speed and the "Cargo Hauler" label');
    assert.equal(def.label, family.label, `${family.role} label drifted`);
    assert.equal(def.ship, family.ship, `${family.role} should fly its dossier hull class`);
    assert.equal(def.team, 2, `${family.role} is neutral civilian traffic`);
    assert.ok(!labels.has(def.label), `label "${def.label}" is shared with another role`);
    labels.add(def.label);
  }
});

test('the ore barge does not inherit anything from hauler', () => {
  const barge = TRAFFIC_ROLES.ore_carrier;
  const hauler = TRAFFIC_ROLES.hauler;
  assert.ok(barge, 'ore_carrier must exist');
  assert.notEqual(barge.ship, hauler.ship, 'barge must not fly the hauler hull class');
  assert.notEqual(barge.label, hauler.label, 'barge must not read "Cargo Hauler"');
  assert.notEqual(barge.speed, hauler.speed, 'a loaded barge does not move at hauler pace');
});

test('each role resolves through the real selector to a DISTINCT whole-ship file and assetId', () => {
  const seenFiles = new Set();
  const seenAssetIds = new Set();
  // The pre-existing civilian bindings must not be clobbered by the new rows.
  const preExisting = {
    courier: 'wholeships/helios_lark.glb',
    miner: 'wholeships/helios_cradle.glb',
    hauler: 'wholeships/helios_span.glb',
  };
  for (const [role, file] of Object.entries(preExisting)) {
    seenFiles.add(file);
    seenAssetIds.add(wholeShipVisualForEntity({ data: { trafficRole: role } }).assetId);
    assert.equal(wholeShipVisualForEntity({ data: { trafficRole: role } }).file, file,
      `accepted ${role} binding must not be replaced`);
  }
  for (const family of FAMILIES) {
    const selection = wholeShipVisualForEntity({ data: { trafficRole: family.role } });
    assert.ok(selection, `${family.role} must bind a whole-ship, not fall through to modular hulls`);
    assert.equal(selection.file, family.file, `${family.role} bound the wrong hull`);
    assert.equal(selection.assetId, family.assetId, `${family.role} bound the wrong assetId`);
    assert.equal(selection.roleId, family.role);
    assert.ok(!seenFiles.has(selection.file),
      `${family.role} shares ${selection.file} with another role — the families must not share a hull`);
    assert.ok(!seenAssetIds.has(selection.assetId),
      `${family.role} shares assetId ${selection.assetId} with another role`);
    seenFiles.add(selection.file);
    seenAssetIds.add(selection.assetId);
  }
});

test('the label an entity actually wears resolves per role, never through the hauler fallback', () => {
  // Mirrors traffic.js _stampTrafficDurableIdentity / _rehydrateCeresActivityEntity:
  // (TRAFFIC_ROLES[role] || TRAFFIC_ROLES.hauler).label
  for (const family of FAMILIES) {
    const worn = (TRAFFIC_ROLES[family.role] || TRAFFIC_ROLES.hauler).label;
    assert.equal(worn, family.label,
      `${family.role} would wear "${worn}" — the hauler fallback fired`);
  }
});

test('every artifact the runtime resolution chain needs exists and is internally consistent', () => {
  const partsManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/parts/parts_manifest.json'), 'utf8'));
  const releaseManifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/release/release_manifest.json'), 'utf8'));
  const pilots = JSON.parse(readFileSync(resolve(ROOT, 'assets/ships/render-packages/pilots.json'), 'utf8'));
  for (const family of FAMILIES) {
    const stem = family.file.split('/').pop().replace(/\.glb$/, '');
    const partId = `wholeship_${stem}`;

    const sourceAbs = resolve(ROOT, 'assets/ships/parts', family.file);
    const releaseAbs = resolve(ROOT, 'assets/ships/release/parts', family.file);
    assert.ok(existsSync(sourceAbs), `missing source GLB ${family.file} — the release build cannot see it`);
    assert.ok(existsSync(releaseAbs),
      `missing release GLB ${family.file} — release mode fetches this path and a 404 here is the `
      + 'silent procedural-fallback trap');

    const partRow = (partsManifest.parts || []).find((part) => part.id === partId);
    assert.ok(partRow, `parts_manifest.json has no ${partId} row`);
    assert.equal(partRow.file, family.file);
    assert.ok(Array.isArray(partRow.sockets) && partRow.sockets.length > 0,
      `${partId} declares no sockets`);

    const releaseRow = (releaseManifest.assets || []).find((row) => row.id === partId);
    assert.ok(releaseRow, `release_manifest.json has no ${partId} row — run the release build`);
    assert.ok(releaseRow.release.endsWith(family.file));
    assert.ok(releaseRow.ktx2Textures > 0, `${partId} release must carry KTX2 textures`);

    // The runtime matches on BOTH url suffix and assetId; a drifted assetId throws at admission.
    assert.equal(readGlbAssetId(sourceAbs), family.assetId,
      `source GLB spacefaceAsset.assetId must equal the partsLibrary assetId for ${family.role}`);
    assert.equal(readGlbAssetId(releaseAbs), family.assetId,
      `release GLB spacefaceAsset.assetId must equal the partsLibrary assetId for ${family.role}`);

    const pilot = (pilots.pilots || []).find((row) => row.sourceUrl === releaseRow.release);
    assert.ok(pilot, `no render-package pilot for ${releaseRow.release} — release mode throws `
      + '"released part has no render package" without it');
    assert.equal(pilot.runtimeAssetId, family.assetId,
      `pilot runtimeAssetId must equal the partsLibrary assetId for ${family.role}`);
    assert.ok(existsSync(resolve(ROOT, pilot.metadataUrl)),
      `missing built render package ${pilot.metadataUrl} — run build-render-package-pilots.mjs`);
  }
});

test('the new roles did not disturb the accepted mix contract', () => {
  // ore_carrier must NOT fire on the contents-derived rule (a sector that merely HAS rocks is
  // not bulk-carrier territory); it boosts only on declared mining/refinery industries.
  // This keeps the traffic-role-mix-reads-contents contract ("only the miner weight moves")
  // honest by construction.
  assert.ok(TRAFFIC_ROLES.ore_carrier.weight > 0, 'ore_carrier must be drawable in the ambient mix');
  assert.ok(TRAFFIC_ROLES.ore_carrier.weight < TRAFFIC_ROLES.miner.weight,
    'a bulk carrier is rarer than the barge that feeds it');
});

test('an ore barge actually spawns through the live ambient path and wears its own hull', async () => {
  // Not a map lookup: the real traffic system, real sector:enter, real spawn + durable-identity
  // stamp. The industrial sector context is what boosts ore_carrier into the draw.
  const { createSimulation } = await import('../src/core/sim.js');
  const { traffic, trafficRoleMixForSector } = await import('../src/systems/traffic.js');
  const SECTOR = 'sector_ore_identity_probe';
  const SECTOR_DATA = {
    id: SECTOR, security: 0.5, trafficPerMin: 24,
    industries: { mining: true, refinery: true },
  };

  const mix = trafficRoleMixForSector(SECTOR_DATA);
  assert.ok(mix.ore_carrier > TRAFFIC_ROLES.ore_carrier.weight,
    'declared extraction industries must lift the ore barge into the draw');

  // Scan a bounded seed band (deterministic: each seed's stream is fixed) until the weighted
  // draw produces the barge. If a future mix change moves the stream, this test must say so.
  let barges = 0;
  let scanned = 0;
  let firstBarge = null;
  for (let seed = 1; seed <= 200 && barges === 0; seed++) {
    scanned++;
    const sim = createSimulation({ seed, systems: [traffic] });
    const { state, bus } = sim;
    state.mode = 'flight';
    state.world = state.world || {};
    state.world.currentSectorId = SECTOR;
    for (const p of [{ x: 0, z: 0 }, { x: 950, z: 220 }, { x: -640, z: 760 }]) {
      sim.spawn({ type: 'station', team: 2, pos: p, vel: { x: 0, z: 0 }, radius: 34, hull: 1000, hullMax: 1000 });
    }
    bus.emit('sector:enter', { sectorId: SECTOR, sector: SECTOR_DATA });
    for (const rec of state.traffic.freighters || []) {
      if (rec.role !== 'ore_carrier') continue;
      barges++;
      if (!firstBarge) {
        firstBarge = (state.entityList || []).find((entity) => entity && entity.id === rec.id) || null;
      }
    }
    sim.dispose();
  }
  assert.ok(barges > 0,
    `no ore_carrier spawned across ${scanned} seeded sector entries — the role is in the mix `
    + 'but unreachable through the live draw');

  const data = firstBarge.data || {};
  assert.equal(data.trafficRole, 'ore_carrier', 'the spawned hull must carry the ore_carrier role');
  assert.equal(data.trafficLabel, 'Ore Barge', 'the spawned hull must wear the Ore Barge label');
  assert.equal(data.role, 'ore_carrier');
  // Faction fleet substitution may swap the gameplay hull class inside the barge group
  // (pelican/ironback/atlas); the presentation identity is pinned by trafficRole regardless.
  assert.ok(String(data.defId || '').startsWith('ship_'),
    `expected a ship def, got ${data.defId}`);
  const selection = wholeShipVisualForEntity(firstBarge);
  assert.ok(selection, 'the spawned barge must resolve a whole-ship');
  assert.equal(selection.file, 'wholeships/ore_barge.glb',
    'whatever hull class the faction fleet substituted, the barge wears the barge');
  assert.equal(selection.assetId, 'SF_WHOLESHIP_ORE_BARGE');
});
