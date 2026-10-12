// W125 popin F1 — bySectorId membership lane + post-append re-home funnel.
//
// entityIndex.bySectorId buckets every indexed entity under its canonical claim
// (homeSectorId || data.homeSectorId || data.sectorId, or null = global). A post-append
// restamp that bypasses syncEntitySectorMembership strands the entity in its old bucket —
// sector-scoped rosters and (laneVersion, sectorId) caches then answer stale membership.
// The source-pin guard (scripts/lib/sectorMembershipGuard.mjs) keeps every writer funneled.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { syncEntitySectorMembership } from '../src/core/coreSystem.js';
import {
  ALLOWED_SECTOR_RESTAMP_FILES,
  sectorMembershipViolations,
} from '../scripts/lib/sectorMembershipGuard.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

test('the real tree has zero unfunneled sector restamps', () => {
  assert.deepEqual(sectorMembershipViolations(ROOT), []);
});

test('a planted post-append restamp is flagged', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sf-sectorlane-'));
  try {
    mkdirSync(join(tmp, 'src/systems'), { recursive: true });
    writeFileSync(
      join(tmp, 'src/systems/planted.js'),
      'export function move(e, s) { e.homeSectorId = s; return e; }\n',
    );
    const sites = sectorMembershipViolations(tmp, ['src/systems']);
    assert.ok(
      sites.some((s) => s.rel === 'src/systems/planted.js'),
      `planted restamp should be flagged, got: ${JSON.stringify(sites)}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('an allowlisted file that drops the funnel call is flagged', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sf-sectorlane-'));
  try {
    mkdirSync(join(tmp, 'src/systems'), { recursive: true });
    writeFileSync(
      join(tmp, 'src/systems/npcJobsRuntime.js'),
      'export function adopt(e, s) { e.data.sectorId = s; return e; }\n',
    );
    const sites = sectorMembershipViolations(tmp, ['src/systems']);
    assert.ok(
      sites.some((s) => s.rel === 'src/systems/npcJobsRuntime.js' && /funnel/.test(s.reason)),
      `dropped funnel should be flagged, got: ${JSON.stringify(sites)}`,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('spec builders are not restamps — spec.data.sectorId stays clean', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'sf-sectorlane-'));
  try {
    mkdirSync(join(tmp, 'src/systems'), { recursive: true });
    writeFileSync(
      join(tmp, 'src/systems/planted.js'),
      'export function spec(s) { const spec = { data: {} }; spec.data.sectorId = s; spec.data.homeSectorId = s; return spec; }\n',
    );
    const sites = sectorMembershipViolations(tmp, ['src/systems']);
    assert.deepEqual(sites, []);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// Hand-rolled V1 index — createEntityIndex is internal; repairEntityIndex mints any lane
// this sparse shape lacks. The bySectorId lane is what the sync under test reads/writes.
function makeIndex() {
  return {
    __spacefaceEntityIndexV1: true,
    ready: true,
    version: 0,
    laneEpoch: 0,
    laneVersions: {},
    _indexedIds: new Set(),
    _sourceList: null,
    _sourceLength: -1,
    bySectorId: new Map(),
  };
}

function indexed(index, e, key) {
  index._indexedIds.add(e.id);
  e._indexSectorKey = key;
  let bucket = index.bySectorId.get(key);
  if (!bucket) { bucket = new Set(); index.bySectorId.set(key, bucket); }
  bucket.add(e);
}

test('a post-append re-home moves the entity to the new sector bucket', () => {
  const index = makeIndex();
  const e = { id: 7, type: 'ship', alive: true, data: {} };
  indexed(index, e, 'sector_a');
  e.homeSectorId = 'sector_b';
  syncEntitySectorMembership(index, e);
  assert.equal(e._indexSectorKey, 'sector_b');
  assert.ok(index.bySectorId.get('sector_b').has(e), 'entity must land in the new bucket');
  assert.ok(!index.bySectorId.has('sector_a'), 'vacated bucket must be dropped');
  assert.equal(index.laneVersions.sectorMemberships, 1);
});

test('a stamp matching the indexed key is a no-op — no lane bump', () => {
  const index = makeIndex();
  const e = { id: 8, type: 'ship', alive: true, data: {}, homeSectorId: 'sector_a' };
  indexed(index, e, 'sector_a');
  syncEntitySectorMembership(index, e);
  assert.equal(index.laneVersions.sectorMemberships, undefined);
  assert.ok(index.bySectorId.get('sector_a').has(e));
});

test('the canonical chain ranks homeSectorId over data.* — clearing it globalizes', () => {
  const index = makeIndex();
  const e = { id: 9, type: 'ship', alive: true, data: { sectorId: 'sector_a' } };
  indexed(index, e, 'sector_a');
  // data.sectorId is only the claim when nothing earlier in the chain answers.
  e.homeSectorId = 'sector_b';
  syncEntitySectorMembership(index, e);
  assert.equal(e._indexSectorKey, 'sector_b');
  delete e.homeSectorId;
  delete e.data.sectorId;
  delete e.data.homeSectorId;
  syncEntitySectorMembership(index, e);
  assert.equal(e._indexSectorKey, null);
  assert.ok(index.bySectorId.get(null).has(e), 'unstamped entities ride the global bucket');
  assert.ok(!index.bySectorId.has('sector_b'));
  assert.equal(index.laneVersions.sectorMemberships, 2);
});

test('unindexed entities are ignored — no phantom bucket membership', () => {
  const index = makeIndex();
  const e = { id: 11, type: 'ship', alive: true, data: {}, homeSectorId: 'sector_a' };
  syncEntitySectorMembership(index, e);
  assert.equal(index.bySectorId.size, 0);
  assert.equal(index.laneVersions.sectorMemberships, undefined);
});

test('every allowlisted restamp file is still present', () => {
  for (const rel of ALLOWED_SECTOR_RESTAMP_FILES.keys()) {
    assert.ok(
      sectorMembershipViolations(ROOT).every((v) => v.rel !== rel),
      `${rel} must remain violation-free`,
    );
  }
});
