// M4 held-out living-galaxy player-route contract.
//
// Fail-closed acceptance for ≥3 observably distinct regional/POI ecology families
// via public New Game / Continue keyboard-mouse routes. No parallel world director,
// no entity/state injection, no synthetic sidecar proof.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const LIVING_GALAXY_ROUTE_SCHEMA = 'spaceface.m4LivingGalaxyPlayerRoute.v1';
export const TASK_ID = 'm4-living-galaxy-player-route';
export const EVIDENCE_DIR_REL = '.devshots/alpha/m4-living-galaxy-player-route';
export const MIN_DISTINCT_FAMILIES = 3;
export const MIN_SCREENSHOT_BYTES = 4_096;

/** Independent public matrix cells. Each begins from authored New Game (or Continue after F5). */
export const ROUTE_MATRIX = Object.freeze([
  Object.freeze({
    id: 'helios-civic-yard',
    familyKind: 'poi+regional',
    regionalFamilyId: 'civic_core',
    poiFamilyId: 'lawful_station_yard',
    sectorId: 'sector_helios_prime',
    sectorName: 'Helios Prime',
    mapSearch: 'Helios Station',
    publicActions: Object.freeze([
      'New Game', 'Launch', 'N', '/', 'Search', 'Set Waypoint', 'E dock', 'F5', 'Continue',
    ]),
    approachNeedle: /YARD CONTROL|LICENSED YARD|LAWFUL/i,
    causalNeedle: /LOCAL TRUST|CLEARED MANIFEST|licensed traffic|clean arrival/i,
    aftermathNeedle: /CLEARED MANIFEST|REMAINS|LOCAL TRUST/i,
    requiresAftermathContinue: true,
    screenshots: Object.freeze({
      flight: '01-helios-civic-flight.png',
      approach: '02-helios-yard-approach.png',
      outcome: '03-helios-yard-outcome.png',
      continued: '04-helios-yard-continued-aftermath.png',
    }),
  }),
  Object.freeze({
    id: 'ceres-industrial-seam',
    familyKind: 'poi+regional',
    regionalFamilyId: 'industrial_belt',
    poiFamilyId: 'mining_field',
    sectorId: 'sector_ceres_belt',
    sectorName: 'Ceres Belt',
    gateSearch: 'Gate → Ceres',
    sectorSearch: 'Ceres Belt',
    publicActions: Object.freeze([
      'New Game', 'Launch', 'N', '/', 'Search gate', 'Set Waypoint', 'V/autopilot approach',
      'M', 'Set Course & Jump', 'F5', 'Continue',
    ]),
    approachNeedle: /WORKING SEAM|MINE|CUTTING LANE|Industrial Belt|metallic|ore/i,
    causalNeedle: /LOCAL ORE DEMAND|ACTIVE CUTTING LANE|fresh ore|worked seam/i,
    aftermathNeedle: /WORKED SEAM|REMAINS|WORKING SEAM/i,
    requiresAftermathContinue: true,
    screenshots: Object.freeze({
      arrival: '05-ceres-industrial-arrival.png',
      ecology: '06-ceres-industrial-ecology.png',
      approach: '07-ceres-mining-approach.png',
      continued: '08-ceres-continued-aftermath.png',
    }),
  }),
  Object.freeze({
    id: 'tethys-trade-corridor',
    familyKind: 'poi+regional',
    regionalFamilyId: 'trade_corridor',
    poiFamilyId: 'convoy_industrial_route',
    sectorId: 'sector_tethys_junction',
    sectorName: 'Tethys Junction',
    gateSearch: 'Gate → Tethys',
    sectorSearch: 'Tethys Junction',
    publicActions: Object.freeze([
      'New Game', 'Launch', 'N', '/', 'Search gate', 'Set Waypoint', 'autopilot approach',
      'M', 'Set Course & Jump', 'F5', 'Continue',
    ]),
    approachNeedle: /FREIGHT ROUTE|Trade Corridor|CONVOY|Meridian|trade lane/i,
    causalNeedle: /ROUTE LIQUIDITY|CONVOY EXPOSURE|scheduled freight|freight wake/i,
    aftermathNeedle: /FREIGHT WAKE|REMAINS|FREIGHT ROUTE|Trade Corridor/i,
    requiresAftermathContinue: false,
    screenshots: Object.freeze({
      arrival: '09-tethys-trade-arrival.png',
      ecology: '10-tethys-trade-ecology.png',
      approach: '11-tethys-freight-approach.png',
      continued: '12-tethys-continued.png',
    }),
  }),
]);

export const REQUIRED_SOURCE_FILES = Object.freeze([
  'scripts/lib/m4LivingGalaxyPlayerRoute.mjs',
  'scripts/check-m4-living-galaxy-player-route.mjs',
  'test/m4-living-galaxy-player-route-contract.test.mjs',
]);

const FORBIDDEN_INJECTION = Object.freeze([
  [/bus\.emit\(\s*['"]mining:yield/, 'must not inject mining:yield'],
  [/bus\.emit\(\s*['"]poi:interact/, 'must not inject poi:interact'],
  [/bus\.emit\(\s*['"]world:zoneEntered/, 'must not inject world:zoneEntered'],
  [/bus\.emit\(\s*['"]sector:(?:enter|exit)/, 'must not inject sector membership'],
  [/bus\.emit\(\s*['"]jump:/, 'must not inject jump events'],
  [/bus\.emit\(\s*['"]dock:docked/, 'must not inject dock:docked'],
  [/\benterSector\s*\(/, 'must not call enterSector'],
  [/\b_onRequestJump\s*\(/, 'must not call internal jump transition'],
  [/\bplayer\.pos\.(?:x|z)\s*=(?!=)/, 'must not teleport via player.pos assignment'],
  [/\bstate\.mode\s*=(?!=)/, 'must not assign mode directly'],
  [/\b(?:state\.)?world\.currentSectorId\s*=(?!=)/, 'must not assign currentSectorId'],
  [/\bdebugFlight\b/, 'must not use debug-flight'],
  [/[?&]debug=/, 'must not use query debug flags'],
  [/\bforceJump\b|\bfakeJump\b|\bteleportPlayer\b/, 'must not name teleport helpers'],
  [/activateSector\s*\(/, 'must not use private activateSector helpers'],
  [/enterFamily\s*\(/, 'must not use private enterFamily teleport helpers'],
]);

const REQUIRED_PUBLIC_SEAMS = Object.freeze([
  [/New Game/, 'must use public New Game'],
  [/Launch/, 'must use public Launch'],
  [/KeyN|KeyM/, 'must open map via public N/M'],
  [/Set Waypoint|Set Course & Jump/, 'must arm navigation via public map controls'],
  [/F5|Continue/, 'must exercise save/Continue durability'],
  [/injectedState:\s*false|injectedState\s*=\s*false/, 'must claim uninjected primary route'],
  [/primaryAcceptance/, 'must declare primaryAcceptance'],
  [/collectPageIssues|pageerror|errorIssues/, 'must collect runtime/page errors'],
  [/acquireVisualProbeServer|listen\(0|127\.0\.0\.1:0|OS-assigned|ephemeral/, 'must own isolated loopback server'],
]);

/**
 * Static fail-closed scan of harness sources.
 * @param {{ routeSrc?: string, checkerSrc?: string, testSrc?: string }} sources
 */
export function validateLivingGalaxyRouteSources(sources = {}) {
  const failures = [];
  const stripComments = (value) => String(value || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[\n\r])\s*\/\/.*$/gm, '$1');

  const routeSrc = stripComments(sources.routeSrc || '');
  const checkerSrc = stripComments(sources.checkerSrc || '');
  const testSrc = stripComments(sources.testSrc || '');
  const harness = [routeSrc, checkerSrc].join('\n');
  const all = [harness, testSrc].join('\n');
  if (!all.trim()) failures.push('no sources provided');

  for (const [re, msg] of FORBIDDEN_INJECTION) {
    if (re.test(harness)) failures.push(msg);
  }
  for (const [re, msg] of REQUIRED_PUBLIC_SEAMS) {
    if (!re.test(harness)) failures.push(msg);
  }

  // Contract lib must not soft-pass empty family sets.
  if (routeSrc && !/MIN_DISTINCT_FAMILIES\s*=\s*3/.test(routeSrc) && !/MIN_DISTINCT_FAMILIES/.test(routeSrc)) {
    failures.push('contract must define MIN_DISTINCT_FAMILIES');
  }
  if (routeSrc && !/ROUTE_MATRIX/.test(routeSrc)) {
    failures.push('contract must define ROUTE_MATRIX');
  }
  if (checkerSrc && /primaryAcceptance:\s*true/.test(checkerSrc) && /injectedState:\s*true/.test(checkerSrc)) {
    // Only fail if both appear as simultaneous evidence claim shape.
    if (/injectedState:\s*true[\s\S]{0,200}primaryAcceptance:\s*true|primaryAcceptance:\s*true[\s\S]{0,200}injectedState:\s*true/.test(checkerSrc)) {
      failures.push('primary acceptance cannot claim injected state');
    }
  }

  return { pass: failures.length === 0, failures: [...new Set(failures)] };
}

/**
 * Evaluate a completed (or partial) route report for acceptance.
 * Never invents missing families; fail-closed.
 */
export function evaluateLivingGalaxyRouteReport(report = {}) {
  const failures = [];
  if (!report || typeof report !== 'object') {
    return { pass: false, failures: ['report missing'], summary: null };
  }
  if (report.schema !== LIVING_GALAXY_ROUTE_SCHEMA) {
    failures.push(`schema must be ${LIVING_GALAXY_ROUTE_SCHEMA}`);
  }
  if (report.injectedState !== false) failures.push('injectedState must be false');
  if (report.primaryAcceptance !== true && report.primaryAcceptance !== false) {
    failures.push('primaryAcceptance must be boolean');
  }
  if (report.inputSource !== 'keyboard-mouse') failures.push('inputSource must be keyboard-mouse');
  if (!Array.isArray(report.routes) || report.routes.length < MIN_DISTINCT_FAMILIES) {
    failures.push(`need ≥${MIN_DISTINCT_FAMILIES} route cells, got ${report.routes?.length ?? 0}`);
  }

  const familyKeys = new Set();
  const regionalIds = new Set();
  const poiIds = new Set();
  let aftermathCount = 0;
  let causalCount = 0;

  for (const cell of report.routes || []) {
    if (!cell || typeof cell !== 'object') {
      failures.push('route cell is not an object');
      continue;
    }
    if (cell.injectedState === true) failures.push(`${cell.id || '?'}: cell injectedState true`);
    if (!cell.id) failures.push('route cell missing id');
    if (!cell.sectorId) failures.push(`${cell.id || '?'}: missing sectorId`);
    if (!cell.regionalFamilyId && !cell.poiFamilyId) {
      failures.push(`${cell.id || '?'}: missing family identity`);
    }
    if (cell.regionalFamilyId) {
      regionalIds.add(cell.regionalFamilyId);
      familyKeys.add(`regional:${cell.regionalFamilyId}`);
    }
    if (cell.poiFamilyId) {
      poiIds.add(cell.poiFamilyId);
      familyKeys.add(`poi:${cell.poiFamilyId}`);
    }
    if (!cell.playerFacing?.joined && !cell.playerFacing?.surfaces?.length) {
      failures.push(`${cell.id || '?'}: missing player-facing surface evidence`);
    }
    if (cell.playerFacing?.placeholder === true) {
      failures.push(`${cell.id || '?'}: player-facing surface marked placeholder`);
    }
    if (cell.causal?.readable !== true) {
      failures.push(`${cell.id || '?'}: causal behavior not marked readable`);
    } else {
      causalCount += 1;
    }
    if (cell.aftermath?.persisted === true) aftermathCount += 1;
    if (Array.isArray(cell.pageIssues) && cell.pageIssues.length) {
      failures.push(`${cell.id || '?'}: page issues present (${cell.pageIssues.length})`);
    }
    if (cell.privateStateMutations?.length) {
      failures.push(`${cell.id || '?'}: accidental private-state mutation detected`);
    }
    if (!Array.isArray(cell.screenshots) || cell.screenshots.length < 1) {
      failures.push(`${cell.id || '?'}: missing screenshots`);
    }
  }

  if (familyKeys.size < MIN_DISTINCT_FAMILIES) {
    failures.push(
      `need ≥${MIN_DISTINCT_FAMILIES} distinct regional/POI family keys, got ${familyKeys.size}: ${[...familyKeys].join(', ')}`,
    );
  }
  if (regionalIds.size < 2 && poiIds.size < MIN_DISTINCT_FAMILIES) {
    failures.push('families must span ≥2 regional macro-families or ≥3 POI families');
  }
  if (causalCount < MIN_DISTINCT_FAMILIES) {
    failures.push(`need readable causal behavior on ≥${MIN_DISTINCT_FAMILIES} cells, got ${causalCount}`);
  }
  if (aftermathCount < 1) {
    failures.push('need ≥1 cell with aftermath surviving leave/return or save/Continue');
  }
  if (Array.isArray(report.pageIssues) && report.pageIssues.length) {
    failures.push(`top-level page issues: ${report.pageIssues.length}`);
  }
  if (report.pass === true && failures.length) {
    failures.push('report.pass true but evaluation failures exist');
  }

  // Primary acceptance requires explicit pass + no failures.
  if (report.primaryAcceptance === true && (report.pass !== true || failures.length)) {
    failures.push('primaryAcceptance true requires pass and zero evaluation failures');
  }

  return {
    pass: failures.length === 0 && report.pass === true,
    failures,
    summary: {
      familyKeys: [...familyKeys].sort(),
      regionalIds: [...regionalIds].sort(),
      poiIds: [...poiIds].sort(),
      causalCount,
      aftermathCount,
      routeIds: (report.routes || []).map((r) => r.id),
    },
  };
}

/**
 * Reject placeholder / missing / non-image "visual proof".
 * @param {Array<{ path: string, absPath?: string, sha256?: string, bytes?: number }>} media
 * @param {string} repoRoot
 */
export async function evaluateVisualProof(media = [], repoRoot) {
  const failures = [];
  if (!Array.isArray(media) || media.length < MIN_DISTINCT_FAMILIES) {
    failures.push(`need ≥${MIN_DISTINCT_FAMILIES} media artifacts, got ${media?.length ?? 0}`);
    return { pass: false, failures };
  }
  for (const item of media) {
    const rel = String(item?.path || '').replace(/\\/g, '/');
    if (!rel || rel.includes('..') || path.isAbsolute(rel)) {
      failures.push(`unsafe media path: ${rel}`);
      continue;
    }
    if (!rel.startsWith(`${EVIDENCE_DIR_REL}/`)) {
      failures.push(`media must live under ${EVIDENCE_DIR_REL}: ${rel}`);
    }
    const abs = item.absPath || path.join(repoRoot, rel);
    if (!existsSync(abs)) {
      failures.push(`missing media file: ${rel}`);
      continue;
    }
    let metadata;
    try {
      metadata = await stat(abs);
    } catch (error) {
      failures.push(`unreadable media ${rel}: ${error.message}`);
      continue;
    }
    if (!metadata.isFile()) failures.push(`media is not a regular file: ${rel}`);
    if (metadata.size < MIN_SCREENSHOT_BYTES) {
      failures.push(`media too small (placeholder?): ${rel} (${metadata.size} bytes)`);
    }
    const magic = await readMagic(abs);
    if (!isPngMagic(magic) && !isJpegMagic(magic) && !isWebpMagic(magic)) {
      failures.push(`media lacks image signature: ${rel}`);
    }
    // Reject all-zero / near-empty buffers that sometimes pass size via padding.
    if (await looksLikeSolidPlaceholder(abs, metadata.size)) {
      failures.push(`media looks like solid placeholder: ${rel}`);
    }
    if (item.sha256) {
      const digest = createHash('sha256').update(await readFile(abs)).digest('hex');
      if (digest !== item.sha256) failures.push(`sha256 mismatch: ${rel}`);
    }
  }
  return { pass: failures.length === 0, failures };
}

/**
 * Detect private-state mutation patterns in an observation delta.
 * Allowed: natural sim progression fields (tick, simTime, positions from flight, etc.).
 * Forbidden: direct writes to livingPoiBehaviors.aftermath without matching public verbs,
 * forced sector swaps, entity injects, cargo without mining events.
 */
export function evaluatePrivateStateDelta(before = {}, after = {}, { allowedSectorChange = false } = {}) {
  const failures = [];
  if (!before || !after) return { pass: true, failures: [], mutations: [] };
  const mutations = [];

  if (before.seed != null && after.seed != null && before.seed !== after.seed) {
    mutations.push('meta.seed changed mid-route');
  }
  if (!allowedSectorChange
    && before.sectorId
    && after.sectorId
    && before.sectorId !== after.sectorId) {
    mutations.push(`currentSectorId changed without public travel (${before.sectorId}→${after.sectorId})`);
  }
  if (Array.isArray(before.entityIds) && Array.isArray(after.entityIds)) {
    const beforeSet = new Set(before.entityIds);
    const injected = after.entityIds.filter((id) => !beforeSet.has(id) && Number(id) < 0);
    if (injected.length) mutations.push(`negative-id entities appeared: ${injected.join(',')}`);
  }
  if (before.livingPoiFingerprint && after.livingPoiFingerprint
    && before.livingPoiFingerprint !== after.livingPoiFingerprint
    && after.livingPoiWriteSource === 'harness') {
    mutations.push('livingPoiBehaviors mutated by harness write source');
  }
  if (after.harnessWroteState === true) {
    mutations.push('harness flagged private state write');
  }

  for (const m of mutations) failures.push(m);
  return { pass: failures.length === 0, failures, mutations };
}

/** Pure: build the required family set from ROUTE_MATRIX. */
export function expectedFamilyKeysFromMatrix(matrix = ROUTE_MATRIX) {
  const keys = new Set();
  for (const cell of matrix) {
    if (cell.regionalFamilyId) keys.add(`regional:${cell.regionalFamilyId}`);
    if (cell.poiFamilyId) keys.add(`poi:${cell.poiFamilyId}`);
  }
  return [...keys].sort();
}

export function classifySurfaceText(text, cell) {
  const joined = String(text || '');
  return {
    approach: cell.approachNeedle ? cell.approachNeedle.test(joined) : false,
    causal: cell.causalNeedle ? cell.causalNeedle.test(joined) : false,
    aftermath: cell.aftermathNeedle ? cell.aftermathNeedle.test(joined) : false,
  };
}

export function buildAlphaEvidenceSkeleton({
  worktreeId,
  gpu = null,
  checks = [],
  artifacts = [],
  notes = [],
  route = '',
  viewport = { width: 1440, height: 900 },
  pass = false,
}) {
  return {
    schema: 'spaceface.alphaEvidence.v1',
    taskId: TASK_ID,
    worktreeId: worktreeId || 'unknown',
    route: route || 'M4 living-galaxy public route matrix',
    viewport,
    runtime: { kind: 'browser', gpu },
    captureKind: 'browser',
    inputSource: 'keyboard-mouse',
    injectedState: false,
    primaryAcceptance: pass === true,
    checks: checks.length
      ? checks
      : [
        { name: '≥3 distinct regional/POI ecology families via public routes', status: pass ? 'pass' : 'fail' },
        { name: 'readable causal behavior per family cell', status: pass ? 'pass' : 'fail' },
        { name: 'aftermath survives leave/return or save/Continue', status: pass ? 'pass' : 'fail' },
        { name: 'no injection / private-state mutation / page errors', status: pass ? 'pass' : 'fail' },
        { name: 'visual proof present (non-placeholder screenshots)', status: pass ? 'pass' : 'fail' },
      ],
    artifacts,
    notes,
  };
}

export function assertMatrixCoverage(matrix = ROUTE_MATRIX) {
  assert.ok(matrix.length >= MIN_DISTINCT_FAMILIES, 'matrix too small');
  const regional = new Set(matrix.map((c) => c.regionalFamilyId).filter(Boolean));
  const poi = new Set(matrix.map((c) => c.poiFamilyId).filter(Boolean));
  assert.ok(regional.size >= 2, 'matrix must cover ≥2 regional families');
  assert.ok(poi.size >= MIN_DISTINCT_FAMILIES, 'matrix must cover ≥3 POI families');
  const keys = expectedFamilyKeysFromMatrix(matrix);
  assert.ok(keys.length >= MIN_DISTINCT_FAMILIES, 'matrix family keys insufficient');
  return { regional: [...regional], poi: [...poi], keys };
}

async function readMagic(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

function isPngMagic(buffer) {
  return buffer.length >= 8
    && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}

function isJpegMagic(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
}

function isWebpMagic(buffer) {
  return buffer.length >= 12
    && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
}

async function looksLikeSolidPlaceholder(filePath, size) {
  // Sample up to 2 KiB after the header; if nearly all bytes equal, treat as placeholder.
  const handle = await open(filePath, 'r');
  try {
    const sampleSize = Math.min(2048, Math.max(0, size - 32));
    if (sampleSize < 64) return true;
    const buffer = Buffer.alloc(sampleSize);
    await handle.read(buffer, 0, sampleSize, 32);
    const first = buffer[0];
    let same = 0;
    for (let i = 0; i < buffer.length; i++) if (buffer[i] === first) same += 1;
    return same / buffer.length > 0.995;
  } finally {
    await handle.close();
  }
}

export function repoRel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}
