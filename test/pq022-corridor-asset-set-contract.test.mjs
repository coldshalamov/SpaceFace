// PQ-022.gold-corridor-required-assets — contracts for the required-set data module and its gate.
//
// These prove the set is well-formed and, more importantly, that the gate's anti-rot properties
// actually hold: the live re-derivation catches drift in both directions, and the expected-gaps
// allowlist cannot silently become a graveyard.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CORRIDOR_ASSET_SET, CORRIDOR_SECTOR_IDS, CORRIDOR_CAREER_IDS,
  ACCEPTANCE_STATUSES, DERIVATION_KINDS, EXCLUDED_WITH_REASON,
  derivePlaceAssets, deriveModularSlots, machineDerivedAssetIds,
  MODULAR_TRANSCRIPTION, assetRow, familyBreakdown,
} from '../scripts/lib/pq022CorridorAssetSet.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = join(ROOT, 'scripts/check-pq022-corridor-assets.mjs');
const ALLOWLIST = 'scripts/lib/pq022CorridorExpectedGaps.json';

function runGate(args = [], { expectFail = false } = {}) {
  try {
    const out = execFileSync(process.execPath, [GATE, ...args], { cwd: ROOT, encoding: 'utf8' });
    assert.equal(expectFail, false, `gate unexpectedly passed:\n${out}`);
    return { code: 0, out };
  } catch (error) {
    assert.equal(expectFail, true, `gate unexpectedly failed:\n${error.stdout || ''}${error.stderr || ''}`);
    return { code: error.status, out: `${error.stdout || ''}${error.stderr || ''}` };
  }
}

test('the corridor is the three Gold Corridor sectors and the three careers', () => {
  assert.deepEqual([...CORRIDOR_SECTOR_IDS],
    ['sector_helios_prime', 'sector_ceres_belt', 'sector_tethys_junction']);
  assert.deepEqual([...CORRIDOR_CAREER_IDS], ['hauler', 'hunter', 'prospector']);
});

test('every row is well-formed and carries at least one derivation', () => {
  assert.ok(CORRIDOR_ASSET_SET.length > 0, 'set is non-empty');
  for (const entry of CORRIDOR_ASSET_SET) {
    assert.ok(entry.assetId && typeof entry.assetId === 'string', `assetId on ${JSON.stringify(entry)}`);
    assert.ok(entry.family && typeof entry.family === 'string', `family on ${entry.assetId}`);
    assert.ok(ACCEPTANCE_STATUSES.includes(entry.status), `${entry.assetId} status '${entry.status}' is a known status`);
    assert.ok([30, 90].includes(entry.horizon), `${entry.assetId} horizon is 30 or 90`);
    assert.ok(entry.derivations.length > 0, `${entry.assetId} has derivation evidence`);
    for (const derivation of entry.derivations) {
      assert.ok(DERIVATION_KINDS[derivation.kind], `${entry.assetId} derivation kind '${derivation.kind}' is known`);
      assert.ok(derivation.source, `${entry.assetId} derivation names a source`);
      assert.ok(derivation.detail, `${entry.assetId} derivation names a detail`);
    }
  }
});

test('asset ids are unique', () => {
  const seen = new Set();
  for (const entry of CORRIDOR_ASSET_SET) {
    assert.ok(!seen.has(entry.assetId), `duplicate asset id ${entry.assetId}`);
    seen.add(entry.assetId);
  }
});

test('an asset is either required or explicitly excluded, never both', () => {
  const required = new Set(CORRIDOR_ASSET_SET.map((e) => e.assetId));
  for (const excluded of EXCLUDED_WITH_REASON) {
    assert.ok(!required.has(excluded.assetId),
      `${excluded.assetId} is both required and excluded`);
    assert.ok(excluded.reason && excluded.reason.length > 20,
      `${excluded.assetId} exclusion carries a substantive reason`);
  }
});

test('rows with an open issue name an owner lane', () => {
  for (const entry of CORRIDOR_ASSET_SET) {
    if (entry.openIssues.length === 0) continue;
    assert.ok(entry.ownerLane, `${entry.assetId} has open issues ${JSON.stringify(entry.openIssues)} but no owner lane`);
  }
});

test('the machine-derived membership round-trips against live data in both directions', async () => {
  const [sectorAnchors, sectors, mining, claimable, heist, worldSites, bindings] = await Promise.all([
    import('../src/data/sectorAnchors.js'),
    import('../src/data/sectors.js'),
    import('../src/data/mining.js'),
    import('../src/data/claimableBodies.js'),
    import('../src/data/heistFacilities.js'),
    import('../src/data/worldSiteManifests.js'),
    import('../src/data/worldSiteAssetBindings.js'),
  ]);
  const derived = derivePlaceAssets({
    SECTOR_ANCHORS: sectorAnchors.SECTOR_ANCHORS,
    SECTORS: sectors.SECTORS,
    ASTEROIDS: mining.ASTEROIDS,
    CLAIMABLE_BODY_SITES: claimable.CLAIMABLE_BODY_SITES,
    PQ019_FACILITIES: heist.PQ019_FACILITIES,
    PQ019_CAPSULE: heist.PQ019_CAPSULE,
    WORLD_SITE_MANIFESTS: worldSites.WORLD_SITE_MANIFESTS,
    WORLD_SITE_ASSET_BINDINGS: bindings.WORLD_SITE_ASSET_BINDINGS,
  });
  assert.deepEqual([...derived.keys()].sort(), machineDerivedAssetIds().sort());
});

test('a new corridor POI is caught as drift rather than silently ignored', async () => {
  // The whole point of the standing gate: adding content must invalidate the set.
  const [sectorAnchors, sectors, mining, claimable, heist, worldSites, bindings] = await Promise.all([
    import('../src/data/sectorAnchors.js'),
    import('../src/data/sectors.js'),
    import('../src/data/mining.js'),
    import('../src/data/claimableBodies.js'),
    import('../src/data/heistFacilities.js'),
    import('../src/data/worldSiteManifests.js'),
    import('../src/data/worldSiteAssetBindings.js'),
  ]);
  const mutated = {
    ...sectorAnchors.SECTOR_ANCHORS,
    sector_helios_prime: {
      ...sectorAnchors.SECTOR_ANCHORS.sector_helios_prime,
      pois: [
        ...sectorAnchors.SECTOR_ANCHORS.sector_helios_prime.pois,
        { id: 'poi_synthetic_probe', landmarkGlb: 'place_conveyor_barge' },
      ],
    },
  };
  const derived = derivePlaceAssets({
    SECTOR_ANCHORS: mutated,
    SECTORS: sectors.SECTORS,
    ASTEROIDS: mining.ASTEROIDS,
    CLAIMABLE_BODY_SITES: claimable.CLAIMABLE_BODY_SITES,
    PQ019_FACILITIES: heist.PQ019_FACILITIES,
    PQ019_CAPSULE: heist.PQ019_CAPSULE,
    WORLD_SITE_MANIFESTS: worldSites.WORLD_SITE_MANIFESTS,
    WORLD_SITE_ASSET_BINDINGS: bindings.WORLD_SITE_ASSET_BINDINGS,
  });
  assert.ok(derived.has('place_conveyor_barge'),
    'the injected POI is derived, so the gate would report derivation-drift against the static set');
  assert.ok(!machineDerivedAssetIds().includes('place_conveyor_barge'),
    'and the static set does not contain it, which is exactly the drift condition');
});

test('the modular transcription matches the live part-library contract', async () => {
  const partsLibrary = await import('../src/render/partsLibrary.js');
  const derived = deriveModularSlots(partsLibrary.PART_LIBRARY_CONTRACT);
  assert.deepEqual(derived.hulls, [...MODULAR_TRANSCRIPTION.hulls]);
  for (const [slot, ids] of Object.entries(MODULAR_TRANSCRIPTION.slots)) {
    assert.deepEqual(derived.slots[slot], [...ids], `modular slot ${slot}`);
  }
});

test('the player hull is required at the 30-minute horizon for all three careers', () => {
  // All three careers share NEW_GAME.shipId, so the Kestrel is the single most-seen corridor asset.
  const kestrel = assetRow('kestrel');
  assert.ok(kestrel, 'kestrel is in the required set');
  assert.equal(kestrel.horizon, 30);
  assert.equal(kestrel.family, 'wholeship-player');
});

test('the gate passes with the recorded allowlist', () => {
  const { out } = runGate([`--expected-gaps=${ALLOWLIST}`]);
  assert.match(out, /PASS/);
});

test('the gate fails when gaps are not allowlisted', () => {
  const { out } = runGate([], { expectFail: true });
  assert.match(out, /FAIL/);
  assert.match(out, /UNEXPECTED/);
});

test('a stale allowlist entry fails the gate and asks to be removed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pq022-gate-'));
  try {
    const path = join(dir, 'stale.json');
    writeFileSync(path, JSON.stringify({
      gaps: [{
        assetId: 'place_lane_beacon',
        gap: 'release-artifact-missing',
        reason: 'a gap that does not reproduce',
      }],
    }));
    const { out } = runGate([`--expected-gaps=${path}`], { expectFail: true });
    assert.match(out, /STALE allowlist/);
    assert.match(out, /place_lane_beacon/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the allowlist rejects wildcards', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pq022-gate-'));
  try {
    const path = join(dir, 'wildcard.json');
    writeFileSync(path, JSON.stringify({
      gaps: [{ assetId: 'place_*', gap: 'source-hash-mismatch', reason: 'too broad' }],
    }));
    const { out } = runGate([`--expected-gaps=${path}`], { expectFail: true });
    assert.match(out, /wildcards are not permitted/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the allowlist rejects an unknown gap kind', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pq022-gate-'));
  try {
    const path = join(dir, 'unknown.json');
    writeFileSync(path, JSON.stringify({
      gaps: [{ assetId: 'place_lane_beacon', gap: 'vibes-are-off', reason: 'not a gap kind' }],
    }));
    const { out } = runGate([`--expected-gaps=${path}`], { expectFail: true });
    assert.match(out, /unknown gap kind/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('family breakdown covers place, wholeship, and modular families', () => {
  const families = [...familyBreakdown().keys()];
  assert.ok(families.some((f) => f.startsWith('place-')), 'has place families');
  assert.ok(families.some((f) => f.startsWith('wholeship-')), 'has wholeship families');
  assert.ok(families.some((f) => f.startsWith('modular-')), 'has modular families');
});
