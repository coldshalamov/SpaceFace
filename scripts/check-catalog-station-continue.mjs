#!/usr/bin/env node
// Read an intact external save; exercise cold file Continue and repeated native reconstruction.
// No fixtures, player teleports, receipt edits, or writes to the input save.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { SECTORS } from '../src/data/sectors.js';

const [source, output, startup] = process.argv.slice(2);
assert(source && output && (!startup || startup === '--cold-backend'),
  'usage: node scripts/check-catalog-station-continue.mjs SAVE_JSON OUTPUT_DIRECTORY [--cold-backend]');
const coldBackend = startup === '--cold-backend';
const bytes = fs.readFileSync(source), sha256 = value => createHash('sha256').update(value).digest('hex');
const initial = JSON.parse(bytes), beforeFeatures = snapshotFeatureMaps();
const runtime = createAuthoritativeRuntime({ profileId: 'production', seed: 804, nodeSafeOnly: true });
applyFeatureConfigToMaps(runtime.config.features);
const state = runtime.state, saver = runtime.getSystem('save'), physics = runtime.getSystem('physics');
const evidence = { source: path.resolve(source), sourceSha256: sha256(bytes),
  startup: coldBackend ? 'load-before-physics-preparation' : 'physics-prepared-before-load',
  scope: 'production-manifest file Continue with live Rapier bodies; not rendered browser acceptance', cycles: [] };
fs.mkdirSync(output, { recursive: true });
let envelope = initial;
try {
  if (!coldBackend) assert(await physics.prepareBackend(state));
  for (let cycle = 0; cycle < 3; cycle++) {
    const savedStations = envelope.data.entities.persistent.filter(e => e.type === 'station' && e.data?.stationId);
    assert(savedStations.length, 'input must contain the real persistent-station reproduction');
    assert(await saver.loadEnvelope(envelope), 'whole file must restore successfully');
    assert(await physics.prepareBackend(state));
    assert.equal(physics._nativeRestorePending, false);
    assert.equal(state.restoreEnvelopeStations, undefined, 'ephemeral restore ownership is released');
    const stations = [];
    for (const saved of savedStations) {
      const live = state.entityList.filter(e => e.alive !== false && e.type === 'station'
        && e.data?.stationId === saved.data.stationId);
      assert.equal(live.length, 1, saved.data.stationId + ' has one live carrier');
      const entity = live[0], sector = SECTORS.find(s => s.stations.some(st => st.id === saved.data.stationId));
      assert(sector);
      assert.equal(entity.id, saved.id, 'the available saved numeric identity is retained');
      assert.equal(entity.hull, saved.hull, 'no station repair/reset');
      assert.deepEqual({ x: entity.pos.x, z: entity.pos.z }, saved.pos, 'saved recoiled pose is exact before stepping');
      const bag = state.world.sectorContents[sector.id];
      if (bag) assert.equal(bag.stations.find(row => row.stationId === saved.data.stationId)?.id, entity.id);
      if (saved.physicsBody?.anchorRecoil) {
        assert.deepEqual(entity.physicsBody.anchorRecoil.rest, saved.physicsBody.anchorRecoil.rest,
          'Continue must not move the recoil rest anchor');
      }
      stations.push({ stationId: saved.data.stationId, id: entity.id,
        nativeBody: physics._sg02.records.has(entity.id),
        rest: entity.physicsBody?.anchorRecoil?.rest || null });
    }
    assert.deepEqual(state.ilexArk?.settlement, initial.data.ilexArk?.settlement);
    assert.equal(state.player.credits, envelope.data.player.credits);
    runtime.runTicks(3);
    const file = path.join(output, `continue-${cycle + 1}.save.json`);
    fs.writeFileSync(file, JSON.stringify(saver.serialize('catalog-station-continue')));
    const nextBytes = fs.readFileSync(file);
    evidence.cycles.push({ cycle: cycle + 1, stations,
      physicsRestore: state.physicsRuntime.nativeRestore,
      file: path.resolve(file), sha256: sha256(nextBytes) });
    envelope = JSON.parse(nextBytes);
  }
  assert.equal(sha256(fs.readFileSync(source)), evidence.sourceSha256, 'the source file remains untouched');
  evidence.ok = true;
  fs.writeFileSync(path.join(output, 'RESULT.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  runtime.dispose();
  restoreFeatureMaps(beforeFeatures);
}
