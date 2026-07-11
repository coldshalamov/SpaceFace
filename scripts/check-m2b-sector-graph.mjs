// M2b 24-region graph acceptance gate.
//
// Authority: design/production/01_BUILD_PROGRAM.md M2b
//   - 10 authored story-region identities preserved
//   - 14 stable frontier regions added
//   - All 24 regions traversable, persistent, mapped, and accepted
//
// This script validates the canonically integrated live graph exported by
// src/data/sectors.js and src/data/sectorCoordinates.js.
//
// Exit codes:
//   0 — all graph checks passed
//   1 — a graph check failed or the gate hit an internal error

import { SECTORS } from '../src/data/sectors.js';
import {
  SECTOR_GLOBAL_ORIGINS,
  SECTOR_ORIGIN_LATTICE_WU,
} from '../src/data/sectorCoordinates.js';
import { FRONTIER_SECTOR_IDS } from '../src/data/frontierRegions/index.js';

export { FRONTIER_SECTOR_IDS };

export const EXPECTED_TOTAL_SECTORS = 24;
export const EXPECTED_STORY_COUNT = 10;
export const EXPECTED_FRONTIER_COUNT = 14;
export const HELIOS_SECTOR_ID = 'sector_helios_prime';
export const LATTICE_WU = SECTOR_ORIGIN_LATTICE_WU;
export const MIN_ORIGIN_SPACING_WU = LATTICE_WU;

/** Canonical original 10 authored story-region IDs (order is deterministic). */
export const ORIGINAL_STORY_IDS = Object.freeze([
  'sector_helios_prime',
  'sector_ceres_belt',
  'sector_tethys_junction',
  'sector_vesta_forge',
  'sector_pallas_drift',
  'sector_io_reach',
  'sector_charon_expanse',
  'sector_sker_haven',
  'sector_veil_nebula',
  'sector_ashfall_reach',
]);

function isString(value) {
  return typeof value === 'string';
}

function isLatticeMultiple(n) {
  if (!Number.isFinite(n)) return false;
  return n / LATTICE_WU === Math.trunc(n / LATTICE_WU);
}

function hasXZ(p) {
  return p && Number.isFinite(p.x) && Number.isFinite(p.z);
}

/**
 * Build a deterministic sector index from an array of sector records.
 * @param {{id:string}[]} sectors
 * @returns {Map<string, {id:string, neighbors?:string[], wormholeTo?:{sectorId:string}}>}
 */
function buildSectorById(sectors) {
  const map = new Map();
  for (const s of sectors) {
    if (s && isString(s.id)) map.set(s.id, s);
  }
  return map;
}

/**
 * Return sector IDs that are unreachable from Helios traveling along directed
 * neighbor edges and directed wormholeTo edges.
 * @param {{id:string, neighbors?:string[], wormholeTo?:{sectorId:string}}[]} sectors
 * @returns {string[]}
 */
function computeUnreachableFromHelios(sectors) {
  const byId = buildSectorById(sectors);
  const reachable = new Set();
  const queue = [];

  if (!byId.has(HELIOS_SECTOR_ID)) {
    return sectors.map((s) => s.id).filter(Boolean).sort();
  }

  reachable.add(HELIOS_SECTOR_ID);
  queue.push(HELIOS_SECTOR_ID);

  for (let head = 0; head < queue.length; head += 1) {
    const id = queue[head];
    const s = byId.get(id);
    if (!s) continue;

    for (const n of s.neighbors || []) {
      if (!reachable.has(n)) {
        reachable.add(n);
        queue.push(n);
      }
    }

    if (s.wormholeTo && s.wormholeTo.sectorId && !reachable.has(s.wormholeTo.sectorId)) {
      reachable.add(s.wormholeTo.sectorId);
      queue.push(s.wormholeTo.sectorId);
    }
  }

  const all = [];
  for (const s of sectors) {
    if (s && isString(s.id)) all.push(s.id);
  }
  return all.filter((id) => !reachable.has(id)).sort();
}

/**
 * Validate the synthesized M2b 24-region sector graph.
 *
 * @param {Object} params
 * @param {{id:string, neighbors?:string[], wormholeTo?:{sectorId:string}}[]} params.sectors
 * @param {Record<string, {x:number,z:number}>} params.origins
 * @returns {{
 *   pass: boolean,
 *   checks: {name:string, pass:boolean, actual?:any, expected?:any, details?:any}[],
 *   summary: string,
 * }}
 */
export function checkM2bSectorGraph({ sectors, origins }) {
  if (!Array.isArray(sectors)) {
    throw new TypeError('checkM2bSectorGraph: sectors must be an array');
  }
  if (!origins || typeof origins !== 'object') {
    throw new TypeError('checkM2bSectorGraph: origins must be an object');
  }

  const byId = buildSectorById(sectors);
  const ids = sectors.map((s) => s && s.id).filter(isString);
  const uniqueIds = [...new Set(ids)].sort();
  const uniqueIdSet = new Set(uniqueIds);

  const checks = [];

  // 1. Exactly 24 unique sector IDs.
  const uniqueCount = uniqueIds.length;
  const uniqueOk = uniqueCount === EXPECTED_TOTAL_SECTORS;
  checks.push({
    name: 'uniqueSectorIds',
    pass: uniqueOk,
    actual: uniqueCount,
    expected: EXPECTED_TOTAL_SECTORS,
  });

  // 2. Original 10 story IDs preserved.
  const missingStory = ORIGINAL_STORY_IDS.filter((id) => !uniqueIdSet.has(id));
  const storyOk = missingStory.length === 0;
  checks.push({
    name: 'original10Preserved',
    pass: storyOk,
    actual: EXPECTED_STORY_COUNT - missingStory.length,
    expected: EXPECTED_STORY_COUNT,
    details: missingStory.length ? missingStory : undefined,
  });

  // 3. Named 14 frontier IDs present.
  const missingFrontier = FRONTIER_SECTOR_IDS.filter((id) => !uniqueIdSet.has(id));
  const frontierOk = missingFrontier.length === 0;
  checks.push({
    name: 'frontier14Required',
    pass: frontierOk,
    actual: EXPECTED_FRONTIER_COUNT - missingFrontier.length,
    expected: EXPECTED_FRONTIER_COUNT,
    details: missingFrontier.length ? missingFrontier : undefined,
  });

  // 4. Reciprocal neighbor edges.
  const missingReverse = [];
  for (const s of sectors) {
    if (!s || !isString(s.id)) continue;
    const neighbors = Array.isArray(s.neighbors) ? s.neighbors : [];
    for (const n of neighbors) {
      const other = byId.get(n);
      if (!other) {
        missingReverse.push(`${s.id} -> ${n} (unknown target)`);
      } else {
        const otherNeighbors = Array.isArray(other.neighbors) ? other.neighbors : [];
        if (!otherNeighbors.includes(s.id)) {
          missingReverse.push(`${s.id} -> ${n} (missing reverse edge)`);
        }
      }
    }
  }
  const reciprocalOk = missingReverse.length === 0;
  checks.push({
    name: 'reciprocalNeighbors',
    pass: reciprocalOk,
    details: missingReverse.length ? missingReverse : undefined,
  });

  // 5. One connected component from Helios.
  const unreachable = computeUnreachableFromHelios(sectors);
  const connectedOk = unreachable.length === 0;
  checks.push({
    name: 'connectedFromHelios',
    pass: connectedOk,
    actual: uniqueCount - unreachable.length,
    expected: uniqueCount,
    details: unreachable.length ? unreachable : undefined,
  });

  // 6. Unique 4096-lattice origins.
  const nonLattice = [];
  for (const id of uniqueIds) {
    const o = origins[id];
    if (!hasXZ(o)) {
      nonLattice.push(`${id}: missing origin`);
    } else {
      if (!isLatticeMultiple(o.x)) nonLattice.push(`${id}: x=${o.x} not a 4096 multiple`);
      if (!isLatticeMultiple(o.z)) nonLattice.push(`${id}: z=${o.z} not a 4096 multiple`);
    }
  }
  const latticeOk = nonLattice.length === 0;
  checks.push({
    name: 'latticeOrigins',
    pass: latticeOk,
    details: nonLattice.length ? nonLattice : undefined,
  });

  // 7. Origin uniqueness.
  const seen = new Map(); // key -> first id
  const duplicateDetails = [];
  for (const id of uniqueIds) {
    const o = origins[id];
    if (!hasXZ(o)) continue;
    const key = `${o.x},${o.z}`;
    if (seen.has(key)) {
      duplicateDetails.push(`${seen.get(key)} and ${id} share origin ${key}`);
    } else {
      seen.set(key, id);
    }
  }
  const uniqueOriginsOk = duplicateDetails.length === 0;
  checks.push({
    name: 'uniqueOrigins',
    pass: uniqueOriginsOk,
    details: duplicateDetails.length ? duplicateDetails : undefined,
  });

  // 8. Minimum origin spacing.
  let minSpacing = Infinity;
  const originList = uniqueIds
    .map((id) => ({ id, o: origins[id] }))
    .filter((item) => hasXZ(item.o));
  for (let i = 0; i < originList.length; i += 1) {
    const a = originList[i].o;
    for (let j = i + 1; j < originList.length; j += 1) {
      const b = originList[j].o;
      const dx = a.x - b.x;
      const dz = a.z - b.z;
      const d = Math.hypot(dx, dz);
      if (d < minSpacing) minSpacing = d;
    }
  }
  if (!Number.isFinite(minSpacing)) minSpacing = 0;
  const spacingOk = minSpacing >= MIN_ORIGIN_SPACING_WU;
  checks.push({
    name: 'minimumOriginSpacing',
    pass: spacingOk,
    actual: minSpacing,
    expected: `>= ${MIN_ORIGIN_SPACING_WU}`,
  });

  // 9. Deterministic ordering: sector array must be sorted by id.
  const sortedIds = [...ids].sort();
  const orderedOk = ids.every((id, idx) => id === sortedIds[idx]);
  checks.push({
    name: 'deterministicOrdering',
    pass: orderedOk,
  });

  const pass = checks.every((c) => c.pass);

  const summary = pass
    ? 'PASS — M2b 24-region graph accepted'
    : 'FAIL — M2b graph violates a hard gate';

  return { pass, checks, summary };
}

/** Read the canonically integrated live 24-region graph. */
function assembleCandidate() {
  const sectors = [...SECTORS].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
  return { sectors, origins: SECTOR_GLOBAL_ORIGINS };
}

export function exitCodeForResult(result) {
  return result.pass ? 0 : 1;
}

function formatCheck(check) {
  const status = check.pass ? 'PASS' : 'FAIL';
  let line = `  ${check.name}: ${status}`;
  if ('actual' in check && 'expected' in check) {
    line += ` (actual=${JSON.stringify(check.actual)}, expected=${JSON.stringify(check.expected)})`;
  } else if ('actual' in check) {
    line += ` (actual=${JSON.stringify(check.actual)})`;
  }
  if (check.details && Array.isArray(check.details) && check.details.length) {
    const first = check.details.slice(0, 3).join('; ');
    const more = check.details.length > 3 ? ` … (+${check.details.length - 3} more)` : '';
    line += ` — ${first}${more}`;
  }
  return line;
}

function run() {
  try {
    const { sectors, origins } = assembleCandidate();
    const result = checkM2bSectorGraph({ sectors, origins });

    const storyIds = new Set(ORIGINAL_STORY_IDS);
    const frontierIds = new Set(FRONTIER_SECTOR_IDS);
    const storyCount = sectors.filter((s) => storyIds.has(s.id)).length;
    const frontierCount = sectors.filter((s) => frontierIds.has(s.id)).length;

    console.log('M2b 24-region graph acceptance gate');
    console.log('=====================================');
    console.log(`Live story sectors: ${storyCount}`);
    console.log(`Live frontier pack sectors: ${frontierCount}`);
    console.log(`Candidate sector count: ${sectors.length}`);
    console.log('');
    console.log('Checks:');
    for (const c of result.checks) {
      console.log(formatCheck(c));
    }
    console.log('');
    console.log(`Result: ${result.summary}`);

    process.exitCode = exitCodeForResult(result);
  } catch (err) {
    console.error('M2b gate internal error:', err && err.message ? err.message : err);
    process.exit(1);
  }
}

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

function isMainModule() {
  try {
    const modulePath = fileURLToPath(import.meta.url);
    const argPath = process.argv[1] ? resolve(process.argv[1]) : '';
    return modulePath === argPath;
  } catch {
    return false;
  }
}

if (isMainModule()) {
  run();
}
