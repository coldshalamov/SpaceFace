// PRI-06 commit-1 proof: moving CANONICAL_CONTACTS from src/ui/station/barContacts.js into
// src/data/stationResidents.js is a pure move. The dock's generated contacts are byte-identical
// before (git show HEAD:) and after the move for the same state on three stations.
import { execFileSync } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateContacts } from '../src/ui/station/barContacts.js';

const HEAD_MODULE = path.resolve('src/ui/station/.head-parity-barContacts.mjs');
const STATIONS = ['station_helios', 'station_ashcache', 'station_tethys'];

function minimalState() {
  // No entities, no missions, no memory: exercises the canonical-catalog path both files share.
  return {};
}

test('station resident catalog move leaves dock contact generation identical', async () => {
  const headSource = execFileSync('git', ['show', 'HEAD:src/ui/station/barContacts.js'], {
    encoding: 'utf8',
  });
  writeFileSync(HEAD_MODULE, headSource);
  try {
    const before = await import(pathToFileURL(HEAD_MODULE).href);
    assert.equal(typeof before.generateContacts, 'function');
    for (const stationId of STATIONS) {
      const prior = before.generateContacts(stationId, minimalState());
      const current = generateContacts(stationId, minimalState());
      assert.ok(prior.length > 0, `${stationId} should still generate dock contacts`);
      assert.ok(prior.some((c) => c.canonicalKey), `${stationId} fixture must cover canonical contacts`);
      assert.deepEqual(current, prior, `generateContacts('${stationId}') diverged after the catalog move`);
    }
  } finally {
    rmSync(HEAD_MODULE, { force: true });
  }
});
