#!/usr/bin/env node

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import {
  buildPoiCausalOffer,
  validatePoiCausalOffer,
} from '../src/missions/poiCausalOffers.js';
import { SECTORS } from '../src/data/sectors.js';

const sectorById = new Map(SECTORS.map((sector) => [sector.id, sector]));
const station = SECTORS.flatMap((sector) => (sector.stations || []).map((row) => ({ ...row, sector })))
  .find((row) => row.sector.neighbors && row.sector.neighbors.length);
assert.ok(station, 'fixture station has a connected region');

const identities = new Set();
for (let seed = 1; seed <= 16; seed++) {
  for (let index = 0; index < 4; index++) {
    const aftermath = {
      behaviorId: `poib:${station.sector.id}:derelict_salvage:check-${index}`,
      familyId: index % 2 ? 'anomaly_research' : 'derelict_salvage',
      sectorId: station.sector.id,
      zoneId: `check-${index}`,
      outcome: 'resolved',
      cause: 'A physical site retained a connected lead.',
      fingerprint: `pb_check_${seed}_${index}`,
      resolvedDay: index,
    };
    const input = {
      seed, aftermath, stationId: station.id,
      factionId: station.factionId || station.sector.factionId,
      zoneName: 'Check Site',
    };
    const offer = buildPoiCausalOffer(input);
    assert.deepEqual(offer, buildPoiCausalOffer(input), 'offer identity is deterministic');
    assert.deepEqual(validatePoiCausalOffer(offer), { ok: true });
    assert.ok(station.sector.neighbors.includes(offer.destSectorId), 'destination is one connected region away');
    assert.ok(sectorById.has(offer.destSectorId));
    assert.equal(offer.params.poiSignalFollowup.team, 2, 'target is neutral');
    assert.equal(identities.has(offer.id), false, 'distinct aftermaths do not collide');
    identities.add(offer.id);
  }
}

for (const path of [
  'src/missions/poiCausalOffers.js',
  'src/systems/livingPoiBehaviors.js',
]) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Math\.random\s*\(/, `${path} must remain deterministic`);
  assert.doesNotMatch(source, /Date\.now\s*\(|performance\.now\s*\(/, `${path} cannot use wall time`);
}

const child = spawnSync(process.execPath, [
  '--test',
  'test/poi-causal-contracts.test.mjs',
  'test/scanner-signal-investigation.test.mjs',
], {
  cwd: new URL('..', import.meta.url),
  encoding: 'utf8',
});
if (child.stdout) process.stdout.write(child.stdout);
if (child.stderr) process.stderr.write(child.stderr);
assert.equal(child.status, 0, 'focused causal-contract/scanner tests pass');

console.log(`M4 causal contracts PASS (${identities.size} deterministic offer identities)`);
