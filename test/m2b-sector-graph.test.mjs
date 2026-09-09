// M2b 24-region graph acceptance gate — unit + fixture tests.
//
// Authority: design/production/01_BUILD_PROGRAM.md M2b
//   * 10 authored story-region identities preserved
//   * 14 stable frontier regions added
//   * 24 total sectors, reciprocal edges, one connected component from Helios,
//     unique 4096-lattice origins with minimum spacing, deterministic ordering
//
// Touch contract: this file and scripts/check-m2b-sector-graph.mjs only.
// No shared production edits, no golden rewrites.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  checkM2bSectorGraph,
  EXPECTED_FRONTIER_COUNT,
  EXPECTED_STORY_COUNT,
  EXPECTED_TOTAL_SECTORS,
  exitCodeForResult,
  FRONTIER_SECTOR_IDS,
  HELIOS_SECTOR_ID,
  LATTICE_WU,
  MIN_ORIGIN_SPACING_WU,
  ORIGINAL_STORY_IDS,
} from '../scripts/check-m2b-sector-graph.mjs';
import { SECTORS } from '../src/data/sectors.js';
import { SECTOR_GLOBAL_ORIGINS } from '../src/data/sectorCoordinates.js';
import {
  NORTH_ORIGINS,
  NORTH_SECTORS,
} from '../src/data/frontierRegions/north.js';
import {
  EAST_ORIGINS,
  EAST_SECTORS,
} from '../src/data/frontierRegions/east.js';
import {
  SOUTH_ORIGINS,
  SOUTH_SECTORS,
} from '../src/data/frontierRegions/south.js';
import {
  westGlobalOrigins,
  westSectorCards,
} from '../src/data/frontierRegions/west.js';

const ALL_24_IDS = [...ORIGINAL_STORY_IDS, ...FRONTIER_SECTOR_IDS].sort();

function makeOrigin(id, cellX, cellY) {
  return { id, x: cellX * LATTICE_WU, z: cellY * LATTICE_WU };
}

function makeSectors(ids, neighborsById) {
  return ids
    .map((id) => ({ id, neighbors: neighborsById[id] ? [...neighborsById[id]] : [] }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function makeOrigins(records) {
  const out = {};
  for (const r of records) out[r.id] = { x: r.x, z: r.z };
  return out;
}

/** A minimal connected, reciprocal 24-sector graph on the canonical lattice. */
function makePassingFixture() {
  // Build a spanning tree from Helios through all 24 IDs, then make it reciprocal.
  const ordered = [...ALL_24_IDS];
  const neighbors = {};
  for (let i = 0; i < ordered.length; i += 1) {
    neighbors[ordered[i]] = [];
  }
  for (let i = 1; i < ordered.length; i += 1) {
    const parent = ordered[Math.floor((i - 1) / 2)];
    const child = ordered[i];
    neighbors[parent].push(child);
    neighbors[child].push(parent);
  }

  // Place origins on a clean lattice strip so spacing is unambiguous.
  const origins = ALL_24_IDS.map((id, idx) => makeOrigin(id, idx, 0));
  return {
    sectors: makeSectors(ALL_24_IDS, neighbors),
    origins: makeOrigins(origins),
  };
}

/** Fixture matching current live state: 10 story sectors only. */
function makeLiveStateFixture() {
  const neighbors = {};
  for (const s of SECTORS) neighbors[s.id] = [...(s.neighbors || [])];
  const sectors = makeSectors(ORIGINAL_STORY_IDS, neighbors);
  const origins = makeOrigins(
    ORIGINAL_STORY_IDS.map((id) => {
      const o = SECTOR_GLOBAL_ORIGINS[id];
      return { id, x: o.x, z: o.z };
    }),
  );
  return { sectors, origins };
}

function checkNames(result) {
  return result.checks.map((c) => c.name);
}

function findCheck(result, name) {
  return result.checks.find((c) => c.name === name);
}

// ── contract constants ──────────────────────────────────────────────────────────────────────

test('canonical counts and ID lists are stable', () => {
  assert.equal(EXPECTED_TOTAL_SECTORS, 24);
  assert.equal(EXPECTED_STORY_COUNT, 10);
  assert.equal(EXPECTED_FRONTIER_COUNT, 14);
  assert.equal(ORIGINAL_STORY_IDS.length, 10);
  assert.equal(FRONTIER_SECTOR_IDS.length, 14);
  assert.equal(new Set(ALL_24_IDS).size, 24);
});

// ── passing fixture ─────────────────────────────────────────────────────────────────────────

test('passing 24-sector fixture accepts all checks', () => {
  const { sectors, origins } = makePassingFixture();
  const result = checkM2bSectorGraph({ sectors, origins });

  assert.equal(result.pass, true, result.summary);
  assert.equal(exitCodeForResult(result), 0);
  assert.equal(result.checks.length, 9);
  assert.deepEqual(checkNames(result), [
    'uniqueSectorIds',
    'original10Preserved',
    'frontier14Required',
    'reciprocalNeighbors',
    'connectedFromHelios',
    'latticeOrigins',
    'uniqueOrigins',
    'minimumOriginSpacing',
    'deterministicOrdering',
  ]);

  for (const c of result.checks) {
    assert.equal(c.pass, true, `${c.name} should pass`);
  }
});

// ── incomplete live-state fixture ───────────────────────────────────────────────────────

test('incomplete 10-sector fixture fails closed', () => {
  const { sectors, origins } = makeLiveStateFixture();
  const result = checkM2bSectorGraph({ sectors, origins });

  assert.equal(result.pass, false);
  assert.equal(exitCodeForResult(result), 1);

  const unique = findCheck(result, 'uniqueSectorIds');
  assert.equal(unique.pass, false);
  assert.equal(unique.actual, 10);

  const frontier = findCheck(result, 'frontier14Required');
  assert.equal(frontier.pass, false);
  assert.equal(frontier.actual, 0);

  const connected = findCheck(result, 'connectedFromHelios');
  assert.equal(connected.pass, true, '10 story sectors are connected from Helios');
});

// ── individual failure modes ────────────────────────────────────────────────────────────────

test('missing one frontier sector fails frontier14Required', () => {
  const { sectors: baseSectors, origins: baseOrigins } = makePassingFixture();
  const missing = FRONTIER_SECTOR_IDS[0];
  const sectors = baseSectors.filter((s) => s.id !== missing);
  const origins = { ...baseOrigins };
  delete origins[missing];

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const frontier = findCheck(result, 'frontier14Required');
  assert.equal(frontier.pass, false);
  assert.deepEqual(frontier.details, [missing]);
});

test('missing one story sector fails original10Preserved', () => {
  const { sectors: baseSectors, origins: baseOrigins } = makePassingFixture();
  const missing = ORIGINAL_STORY_IDS[0];
  const sectors = baseSectors.filter((s) => s.id !== missing);
  const origins = { ...baseOrigins };
  delete origins[missing];

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const story = findCheck(result, 'original10Preserved');
  assert.equal(story.pass, false);
  assert.deepEqual(story.details, [missing]);
});

test('non-reciprocal neighbor edge fails reciprocalNeighbors', () => {
  const { sectors: baseSectors, origins } = makePassingFixture();
  const sectors = baseSectors.map((s) => ({ ...s, neighbors: [...s.neighbors] }));
  const helios = sectors.find((s) => s.id === HELIOS_SECTOR_ID);
  const target = helios.neighbors[0];

  // Break reciprocity by removing the reverse edge.
  const other = sectors.find((s) => s.id === target);
  other.neighbors = other.neighbors.filter((id) => id !== HELIOS_SECTOR_ID);

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const reciprocal = findCheck(result, 'reciprocalNeighbors');
  assert.equal(reciprocal.pass, false);
  assert.ok(
    reciprocal.details.some((d) => d.includes(HELIOS_SECTOR_ID) && d.includes(target)),
    reciprocal.details,
  );
});

test('disconnected sector fails connectedFromHelios', () => {
  const { sectors: baseSectors, origins } = makePassingFixture();
  const sectors = baseSectors.map((s) => ({ ...s, neighbors: [...s.neighbors] }));
  const orphan = sectors.find((s) => s.id !== HELIOS_SECTOR_ID);
  orphan.neighbors = [];

  // Also remove any edges pointing at the orphan to keep reciprocity passing on other edges.
  for (const s of sectors) {
    if (s.id !== orphan.id) {
      s.neighbors = s.neighbors.filter((id) => id !== orphan.id);
    }
  }

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const connected = findCheck(result, 'connectedFromHelios');
  assert.equal(connected.pass, false);
  assert.ok(connected.details.includes(orphan.id), connected.details);
});

test('non-lattice origin fails latticeOrigins', () => {
  const { sectors, origins: baseOrigins } = makePassingFixture();
  const origins = { ...baseOrigins };
  const victim = ORIGINAL_STORY_IDS[0];
  origins[victim] = { x: origins[victim].x + 1, z: origins[victim].z };

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const lattice = findCheck(result, 'latticeOrigins');
  assert.equal(lattice.pass, false);
  assert.ok(lattice.details.some((d) => d.includes(victim)), lattice.details);
});

test('duplicate origin fails uniqueOrigins', () => {
  const { sectors, origins: baseOrigins } = makePassingFixture();
  const origins = { ...baseOrigins };
  origins[FRONTIER_SECTOR_IDS[0]] = { x: origins[ORIGINAL_STORY_IDS[0]].x, z: origins[ORIGINAL_STORY_IDS[0]].z };

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const unique = findCheck(result, 'uniqueOrigins');
  assert.equal(unique.pass, false);
  assert.ok(unique.details.length > 0, unique.details);
});

test('origin spacing below 4096 fails minimumOriginSpacing', () => {
  const { sectors } = makePassingFixture();
  const origins = makeOrigins(ALL_24_IDS.map((id, idx) => makeOrigin(id, idx, 0)));
  // Overlap two origins to half the lattice distance.
  origins[FRONTIER_SECTOR_IDS[0]] = {
    x: origins[ORIGINAL_STORY_IDS[0]].x + LATTICE_WU / 2,
    z: origins[ORIGINAL_STORY_IDS[0]].z,
  };

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const spacing = findCheck(result, 'minimumOriginSpacing');
  assert.equal(spacing.pass, false);
  assert.ok(spacing.actual < MIN_ORIGIN_SPACING_WU, String(spacing.actual));
});

test('unsorted sector array fails deterministicOrdering', () => {
  const { sectors: sortedSectors, origins } = makePassingFixture();
  const sectors = [...sortedSectors];
  // Swap first two entries.
  [sectors[0], sectors[1]] = [sectors[1], sectors[0]];

  const result = checkM2bSectorGraph({ sectors, origins });
  assert.equal(result.pass, false);
  const ordering = findCheck(result, 'deterministicOrdering');
  assert.equal(ordering.pass, false);
});

// ── live synthesized candidate (canonical integration present in working tree) ───────────────

test('live synthesized candidate passes (canonical integration present in working tree)', () => {
  // Deduplicate by id so the test works whether frontier sectors are already
  // merged into SECTORS or still only present in the frontier packs.
  const sectorById = new Map();
  for (const list of [
    SECTORS,
    NORTH_SECTORS,
    westSectorCards(),
    EAST_SECTORS,
    SOUTH_SECTORS,
  ]) {
    for (const s of list) {
      if (s && typeof s.id === 'string' && !sectorById.has(s.id)) sectorById.set(s.id, s);
    }
  }
  const candidateSectors = [...sectorById.values()].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  const origins = {
    ...SECTOR_GLOBAL_ORIGINS,
    ...NORTH_ORIGINS,
    ...westGlobalOrigins(),
    ...EAST_ORIGINS,
    ...SOUTH_ORIGINS,
  };

  const result = checkM2bSectorGraph({ sectors: candidateSectors, origins });

  assert.equal(result.pass, true, result.summary);
  assert.equal(exitCodeForResult(result), 0);

  const unique = findCheck(result, 'uniqueSectorIds');
  assert.equal(unique.pass, true);
  assert.equal(unique.actual, EXPECTED_TOTAL_SECTORS);

  const story = findCheck(result, 'original10Preserved');
  assert.equal(story.pass, true);

  const frontier = findCheck(result, 'frontier14Required');
  assert.equal(frontier.pass, true);

  const reciprocal = findCheck(result, 'reciprocalNeighbors');
  assert.equal(reciprocal.pass, true);

  const connected = findCheck(result, 'connectedFromHelios');
  assert.equal(connected.pass, true);

  const lattice = findCheck(result, 'latticeOrigins');
  assert.equal(lattice.pass, true);

  const uniqueOrigins = findCheck(result, 'uniqueOrigins');
  assert.equal(uniqueOrigins.pass, true);

  const spacing = findCheck(result, 'minimumOriginSpacing');
  assert.equal(spacing.pass, true);
  assert.ok(spacing.actual >= MIN_ORIGIN_SPACING_WU, String(spacing.actual));

  const ordering = findCheck(result, 'deterministicOrdering');
  assert.equal(ordering.pass, true);
});

// ── error handling ──────────────────────────────────────────────────────────────────────────

test('rejects non-array sectors', () => {
  assert.throws(() => checkM2bSectorGraph({ sectors: null, origins: {} }), TypeError);
  assert.throws(() => checkM2bSectorGraph({ sectors: {}, origins: {} }), TypeError);
});

test('rejects non-object origins', () => {
  assert.throws(
    () => checkM2bSectorGraph({ sectors: [], origins: null }),
    TypeError,
  );
});
