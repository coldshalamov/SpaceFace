// Focused contracts for M4 living-galaxy held-out player-route acceptance.
// Run: node --test test/m4-living-galaxy-player-route-contract.test.mjs
//      npm run check:m4:living-galaxy-player-route:contracts

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  LIVING_GALAXY_ROUTE_SCHEMA,
  TASK_ID,
  EVIDENCE_DIR_REL,
  MIN_DISTINCT_FAMILIES,
  ROUTE_MATRIX,
  REQUIRED_SOURCE_FILES,
  assertMatrixCoverage,
  buildAlphaEvidenceSkeleton,
  classifySurfaceText,
  evaluateLivingGalaxyRouteReport,
  evaluatePrivateStateDelta,
  evaluateVisualProof,
  expectedFamilyKeysFromMatrix,
  validateLivingGalaxyRouteSources,
} from '../scripts/lib/m4LivingGalaxyPlayerRoute.mjs';
import {
  REGIONAL_ECOLOGY_FAMILY_IDS,
  getRegionalEcologyProfile,
} from '../src/data/regionalEcology.js';
import { POI_FAMILY_IDS } from '../src/data/poiBehaviorFamilies.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ROUTE_LIB = path.join(ROOT, 'scripts', 'lib', 'm4LivingGalaxyPlayerRoute.mjs');
const CHECKER = path.join(ROOT, 'scripts', 'check-m4-living-galaxy-player-route.mjs');
const TEST_FILE = path.join(ROOT, 'test', 'm4-living-galaxy-player-route-contract.test.mjs');
const PACKAGE = path.join(ROOT, 'package.json');

test('required harness files exist', () => {
  for (const rel of REQUIRED_SOURCE_FILES) {
    assert.equal(existsSync(path.join(ROOT, rel)), true, rel);
  }
  assert.equal(existsSync(ROUTE_LIB), true);
  assert.equal(existsSync(CHECKER), true);
  assert.equal(existsSync(TEST_FILE), true);
});

test('package wires contracts and live gates once', async () => {
  const pkg = JSON.parse(await readFile(PACKAGE, 'utf8'));
  assert.equal(
    pkg.scripts['check:m4:living-galaxy-player-route:contracts'],
    'node --test test/m4-living-galaxy-player-route-contract.test.mjs',
  );
  assert.equal(
    pkg.scripts['check:m4:living-galaxy-player-route'],
    'npm run check:m4:living-galaxy-player-route:contracts && node scripts/check-m4-living-galaxy-player-route.mjs',
  );
  // Headed live route must not be duplicated into unrelated aggregate scripts.
  for (const [name, cmd] of Object.entries(pkg.scripts)) {
    if (name === 'check:m4:living-galaxy-player-route') continue;
    assert.equal(
      String(cmd || '').split('check-m4-living-galaxy-player-route.mjs').length - 1,
      0,
      `${name} must not duplicate the headed M4 living-galaxy route`,
    );
  }
});

test('matrix covers three distinct regional+POI ecology families from production catalogs', () => {
  assert.equal(MIN_DISTINCT_FAMILIES, 3);
  assert.equal(TASK_ID, 'm4-living-galaxy-player-route');
  assert.equal(EVIDENCE_DIR_REL, '.devshots/alpha/m4-living-galaxy-player-route');
  const coverage = assertMatrixCoverage(ROUTE_MATRIX);
  assert.ok(coverage.regional.length >= 2);
  assert.ok(coverage.poi.length >= 3);
  for (const cell of ROUTE_MATRIX) {
    assert.ok(REGIONAL_ECOLOGY_FAMILY_IDS.includes(cell.regionalFamilyId), cell.regionalFamilyId);
    assert.ok(POI_FAMILY_IDS.includes(cell.poiFamilyId), cell.poiFamilyId);
    const profile = getRegionalEcologyProfile(cell.sectorId);
    assert.ok(profile, cell.sectorId);
    assert.equal(profile.familyId, cell.regionalFamilyId,
      `${cell.sectorId} must map to ${cell.regionalFamilyId}, got ${profile.familyId}`);
  }
  const keys = expectedFamilyKeysFromMatrix();
  assert.ok(keys.includes('regional:civic_core'));
  assert.ok(keys.includes('regional:industrial_belt'));
  assert.ok(keys.includes('regional:trade_corridor'));
  assert.ok(keys.includes('poi:lawful_station_yard'));
  assert.ok(keys.includes('poi:mining_field'));
  assert.ok(keys.includes('poi:convoy_industrial_route'));
});

test('source validator fails closed on injection patterns and requires public seams', async () => {
  const [routeSrc, checkerSrc, testSrc] = await Promise.all([
    readFile(ROUTE_LIB, 'utf8'),
    readFile(CHECKER, 'utf8'),
    readFile(TEST_FILE, 'utf8'),
  ]);
  const ok = validateLivingGalaxyRouteSources({ routeSrc, checkerSrc, testSrc });
  assert.deepEqual(ok.failures, [], ok.failures.join('; '));

  const poisoned = validateLivingGalaxyRouteSources({
    routeSrc,
    checkerSrc: `${checkerSrc}\nplayer.pos.x = 12;\nbus.emit('mining:yield', {});\n`,
    testSrc,
  });
  assert.equal(poisoned.pass, false);
  assert.ok(poisoned.failures.some((f) => /teleport|mining:yield/.test(f)));

  const matrixProseOnly = validateLivingGalaxyRouteSources({
    routeSrc,
    checkerSrc: `
      const primaryAcceptance = true;
      const injectedState = false;
      collectPageIssues();
      acquireVisualProbeServer();
      const labels = 'New Game Launch KeyN KeyM Set Waypoint Set Course & Jump F5 Continue';
    `,
    testSrc,
  });
  assert.equal(matrixProseOnly.pass, false);
  assert.ok(matrixProseOnly.failures.some((f) => /public New Game/.test(f)));
  assert.ok(matrixProseOnly.failures.some((f) => /public Launch/.test(f)));
  assert.ok(matrixProseOnly.failures.some((f) => /public map/.test(f)));
  assert.ok(matrixProseOnly.failures.some((f) => /public map controls/.test(f)));
  assert.ok(matrixProseOnly.failures.some((f) => /save\/Continue durability/.test(f)));
});

test('checker clears foreign saves once per route page and invalidates primary pass artifacts', async () => {
  const checkerSrc = await readFile(CHECKER, 'utf8');
  assert.match(checkerSrc, /sessionStorage\.getItem\(['"]sf\.m4LivingRoute\.savesCleared['"]\)/);
  assert.match(checkerSrc, /sessionStorage\.setItem\(['"]sf\.m4LivingRoute\.savesCleared['"],\s*['"]1['"]\)/);
  assert.match(checkerSrc, /async function invalidatePrimaryPassArtifacts\s*\(/);
  assert.match(checkerSrc, /async function invalidateStaleRouteArtifacts\s*\(/);
  assert.match(checkerSrc, /rm\(FAILURE,\s*\{\s*force:\s*true\s*\}\)/);
  assert.match(checkerSrc, /ROUTE_MATRIX\.flatMap\(\(cell\)\s*=>\s*Object\.values\(cell\.screenshots\)\)/);
  assert.ok(
    checkerSrc.match(/await invalidatePrimaryPassArtifacts\(\)/g)?.length >= 2,
    'must invalidate stale route-report/evidence at run start and again on failure',
  );
});

test('report evaluator accepts a complete uninjected three-family matrix', () => {
  const report = {
    schema: LIVING_GALAXY_ROUTE_SCHEMA,
    pass: true,
    injectedState: false,
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    pageIssues: [],
    routes: ROUTE_MATRIX.map((cell, index) => ({
      id: cell.id,
      seed: 47 + index,
      sectorId: cell.sectorId,
      regionalFamilyId: cell.regionalFamilyId,
      poiFamilyId: cell.poiFamilyId,
      injectedState: false,
      playerFacing: {
        joined: `${cell.poiFamilyId} · ${cell.regionalFamilyId} · risk → reward · surface-${index}`,
        surfaces: [{
          selector: '#alerts .sf-alert',
          text: [
            'YARD CONTROL · CLEARED MANIFEST · LOCAL TRUST',
            'WORKING SEAM · ACTIVE CUTTING LANE → LOCAL ORE DEMAND',
            'FREIGHT ROUTE · CONVOY EXPOSURE → ROUTE LIQUIDITY',
          ][index],
          visible: true,
          capturedIn: `shot-${index}.png`,
        }],
        placeholder: false,
      },
      causal: {
        readable: true,
        risk: 'risk',
        reward: 'reward',
        visibleSurfaceSelectors: [`#alerts .sf-alert@shot-${index}.png`],
      },
      aftermath: { persisted: index === 0, via: index === 0 ? 'save-continue' : null },
      pageIssues: [],
      privateStateMutations: [],
      screenshots: [`shot-${index}.png`],
    })),
  };
  // Seed player-facing text so needles can match for realism in classification helper.
  report.routes[0].playerFacing.joined = 'YARD CONTROL · CLEARED MANIFEST · LOCAL TRUST';
  report.routes[1].playerFacing.joined = 'WORKING SEAM · MINE 3/3 · ACTIVE CUTTING LANE → LOCAL ORE DEMAND';
  report.routes[2].playerFacing.joined = 'FREIGHT ROUTE · CONVOY EXPOSURE → ROUTE LIQUIDITY';

  const result = evaluateLivingGalaxyRouteReport(report);
  assert.equal(result.pass, true, result.failures.join('; '));
  assert.ok(result.summary.familyKeys.length >= MIN_DISTINCT_FAMILIES);
  assert.equal(result.summary.aftermathCount, 1);
});

test('report evaluator rejects seeds missing from the live route and supporting-only causal prose', () => {
  const routes = ROUTE_MATRIX.map((cell, index) => ({
    id: cell.id,
    seed: index === 0 ? null : 80 + index,
    sectorId: cell.sectorId,
    regionalFamilyId: cell.regionalFamilyId,
    poiFamilyId: cell.poiFamilyId,
    injectedState: false,
    playerFacing: {
      joined: `${cell.approachNeedle} ${cell.causalNeedle}`,
      surfaces: [{
        selector: 'composed:ecology+plan+inspector',
        text: 'WORKING SEAM · ACTIVE CUTTING LANE → LOCAL ORE DEMAND',
      }],
      placeholder: false,
    },
    supporting: {
      observerEvents: [{ event: 'poi:behavior', familyId: cell.poiFamilyId }],
      planned: [{ familyId: cell.poiFamilyId, riskLabel: 'risk', rewardLabel: 'reward' }],
    },
    causal: { readable: true, risk: 'risk', reward: 'reward' },
    aftermath: { persisted: true },
    pageIssues: [],
    privateStateMutations: [],
    screenshots: [`supporting-${index}.png`],
  }));
  const result = evaluateLivingGalaxyRouteReport({
    schema: LIVING_GALAXY_ROUTE_SCHEMA,
    pass: true,
    injectedState: false,
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    pageIssues: [],
    routes,
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => /missing route seed/.test(f)));
  assert.ok(result.failures.some((f) => /captured visible surface/.test(f)));
  assert.ok(result.failures.some((f) => /visible causal surface/.test(f)));
});

test('report evaluator rejects placeholder, injection, thin family sets, and missing visual proof', () => {
  const thin = evaluateLivingGalaxyRouteReport({
    schema: LIVING_GALAXY_ROUTE_SCHEMA,
    pass: true,
    injectedState: false,
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    routes: [{
      id: 'only-one',
      sectorId: 'sector_helios_prime',
      regionalFamilyId: 'civic_core',
      poiFamilyId: 'lawful_station_yard',
      playerFacing: { joined: 'YARD', surfaces: [{ text: 'YARD' }] },
      causal: { readable: true },
      aftermath: { persisted: true },
      pageIssues: [],
      screenshots: ['a.png'],
    }],
  });
  assert.equal(thin.pass, false);
  assert.ok(thin.failures.some((f) => /≥3|need ≥3/.test(f)));

  const injected = evaluateLivingGalaxyRouteReport({
    schema: LIVING_GALAXY_ROUTE_SCHEMA,
    pass: true,
    injectedState: true,
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    routes: [],
  });
  assert.equal(injected.pass, false);
  assert.ok(injected.failures.some((f) => /injectedState/.test(f)));

  const pageErr = evaluateLivingGalaxyRouteReport({
    schema: LIVING_GALAXY_ROUTE_SCHEMA,
    pass: true,
    injectedState: false,
    primaryAcceptance: true,
    inputSource: 'keyboard-mouse',
    pageIssues: [{ type: 'pageerror', text: 'boom' }],
    routes: ROUTE_MATRIX.map((cell) => ({
      id: cell.id,
      sectorId: cell.sectorId,
      regionalFamilyId: cell.regionalFamilyId,
      poiFamilyId: cell.poiFamilyId,
      playerFacing: { joined: 'ok', surfaces: [{ text: 'ok' }] },
      causal: { readable: true },
      aftermath: { persisted: true },
      pageIssues: [],
      screenshots: ['x.png'],
    })),
  });
  assert.equal(pageErr.pass, false);
  assert.ok(pageErr.failures.some((f) => /page issues/.test(f)));
});

test('private-state delta detector flags harness writes and silent sector swaps', () => {
  const clean = evaluatePrivateStateDelta(
    { seed: 1, sectorId: 'sector_helios_prime', entityIds: [1, 2] },
    { seed: 1, sectorId: 'sector_helios_prime', entityIds: [1, 2, 3] },
  );
  assert.equal(clean.pass, true);

  const swap = evaluatePrivateStateDelta(
    { seed: 1, sectorId: 'sector_helios_prime' },
    { seed: 1, sectorId: 'sector_ceres_belt' },
    { allowedSectorChange: false },
  );
  assert.equal(swap.pass, false);

  const travelOk = evaluatePrivateStateDelta(
    { seed: 1, sectorId: 'sector_helios_prime' },
    { seed: 1, sectorId: 'sector_ceres_belt' },
    { allowedSectorChange: true },
  );
  assert.equal(travelOk.pass, true);

  const harnessWrite = evaluatePrivateStateDelta(
    { seed: 1 },
    { seed: 1, harnessWroteState: true },
  );
  assert.equal(harnessWrite.pass, false);
});

test('surface classifier matches family needles', () => {
  const yard = ROUTE_MATRIX[0];
  const mining = ROUTE_MATRIX[1];
  assert.equal(classifySurfaceText('YARD CONTROL · CLEARED MANIFEST · LOCAL TRUST', yard).causal, true);
  assert.equal(classifySurfaceText('WORKING SEAM · ACTIVE CUTTING LANE → LOCAL ORE DEMAND', mining).approach, true);
  assert.equal(classifySurfaceText('unrelated toast', yard).approach, false);
});

test('visual proof evaluator rejects missing and non-image paths', async () => {
  const missing = await evaluateVisualProof([
    { path: `${EVIDENCE_DIR_REL}/nope.png` },
    { path: `${EVIDENCE_DIR_REL}/nope2.png` },
    { path: `${EVIDENCE_DIR_REL}/nope3.png` },
  ], ROOT);
  assert.equal(missing.pass, false);
  assert.ok(missing.failures.some((f) => /missing media/.test(f)));

  const badPath = await evaluateVisualProof([
    { path: '../secrets.png' },
    { path: `${EVIDENCE_DIR_REL}/a.png` },
    { path: `${EVIDENCE_DIR_REL}/b.png` },
  ], ROOT);
  assert.equal(badPath.pass, false);
  assert.ok(badPath.failures.some((f) => /unsafe media path|must live under/.test(f)));
});

test('alpha evidence skeleton stays primary-uninjected', () => {
  const passDoc = buildAlphaEvidenceSkeleton({ worktreeId: 'master@deadbeef+dirty', pass: true });
  assert.equal(passDoc.schema, 'spaceface.alphaEvidence.v1');
  assert.equal(passDoc.taskId, TASK_ID);
  assert.equal(passDoc.injectedState, false);
  assert.equal(passDoc.primaryAcceptance, true);
  assert.equal(passDoc.captureKind, 'browser');
  assert.equal(passDoc.inputSource, 'keyboard-mouse');

  const failDoc = buildAlphaEvidenceSkeleton({ worktreeId: 'x', pass: false });
  assert.equal(failDoc.primaryAcceptance, false);
  assert.ok(failDoc.checks.every((c) => c.status === 'fail'));
});

test('schema constant is stable', () => {
  assert.equal(LIVING_GALAXY_ROUTE_SCHEMA, 'spaceface.m4LivingGalaxyPlayerRoute.v1');
});
