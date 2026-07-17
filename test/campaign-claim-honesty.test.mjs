/**
 * Unit tests for campaign claim dual-platform honesty helpers.
 * Driven against scripts/lib/campaignClaimHonesty.mjs (shipped claim path).
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBrowserElectronRoutesLog,
  evaluateDualPlatformPrimaryAcceptance,
  hasElectronDualPlatformRealResidual,
  mergeGt1Residuals,
} from '../scripts/lib/campaignClaimHonesty.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- mergeGt1Residuals: empty residuals:[] must not hide productResiduals ---
{
  const merged = mergeGt1Residuals({
    residuals: [],
    productResiduals: [
      {
        mark: 'electron-dual-platform',
        failureClass: 'REAL',
        reason: 'not dual-platform primary',
      },
    ],
  });
  assert.equal(merged.length, 1, 'empty residuals:[] must not drop productResiduals');
  assert.equal(merged[0].mark, 'electron-dual-platform');
}

{
  const merged = mergeGt1Residuals({
    residuals: [{ mark: 'route-x', failureClass: 'HARNESS' }],
    productResiduals: [{ mark: 'electron-dual-platform', failureClass: 'REAL' }],
  });
  assert.equal(merged.length, 2);
}

{
  assert.deepEqual(mergeGt1Residuals(null), []);
  assert.deepEqual(mergeGt1Residuals({}), []);
}

// --- evaluateDualPlatformPrimaryAcceptance: live gt1-continuous shape must be RESIDUAL ---
{
  const livePath = resolve(ROOT, '.devshots/depth-program/gt1-continuous.json');
  const live = JSON.parse(readFileSync(livePath, 'utf8'));
  // Live product truth (as of honesty fix): full spine green but not unassisted dual-platform primary
  assert.equal(live.fullSpinePass, true);
  assert.equal(live.supporting, false);
  assert.equal(live.productReadyUnassisted, false);
  assert.equal(live.primary, false);
  assert.ok(Array.isArray(live.productResiduals) && live.productResiduals.length > 0);

  const evalLive = evaluateDualPlatformPrimaryAcceptance({
    electronExit: 0,
    gt1c: live,
  });
  assert.equal(
    evalLive.claim,
    'RESIDUAL',
    'electron green + fullSpinePass must NOT stamp dual-platform DONE when productReadyUnassisted=false',
  );
  assert.ok(
    evalLive.reasons.some((r) => /productReadyUnassisted/i.test(r)),
    `expected productReadyUnassisted reason, got ${JSON.stringify(evalLive.reasons)}`,
  );
  assert.ok(
    evalLive.mergedResiduals.some((r) => r?.mark === 'electron-dual-platform'),
    'merged residuals must include electron-dual-platform product residual',
  );
  assert.ok(hasElectronDualPlatformRealResidual(evalLive.mergedResiduals));
}

// --- DONE only when all product flags green ---
{
  const ready = evaluateDualPlatformPrimaryAcceptance({
    electronExit: 0,
    gt1c: {
      fullSpinePass: true,
      supporting: false,
      productReadyUnassisted: true,
      primary: true,
      residuals: [],
      productResiduals: [],
    },
  });
  assert.equal(ready.claim, 'DONE');
  assert.deepEqual(ready.reasons, []);
}

// --- REAL residual blocks DONE even if flags look green ---
{
  const blocked = evaluateDualPlatformPrimaryAcceptance({
    electronExit: 0,
    gt1c: {
      fullSpinePass: true,
      supporting: false,
      productReadyUnassisted: true,
      primary: true,
      residuals: [],
      productResiduals: [
        { mark: 'electron-dual-platform', failureClass: 'REAL', reason: 'still open' },
      ],
    },
  });
  assert.equal(blocked.claim, 'RESIDUAL');
}

// --- electron red → residual ---
{
  const red = evaluateDualPlatformPrimaryAcceptance({
    electronExit: 1,
    gt1c: {
      fullSpinePass: true,
      supporting: false,
      productReadyUnassisted: true,
      primary: true,
      residuals: [],
      productResiduals: [],
    },
  });
  assert.equal(red.claim, 'RESIDUAL');
}

// --- browser-electron-routes must not silently equal electron-new-game ---
{
  const body = buildBrowserElectronRoutesLog({
    tip: 'deadbeef',
    dualPlatformClaim: 'RESIDUAL',
    dualReasons: ['productReadyUnassisted=false', 'primary=false'],
    electronExit: 0,
    electronLogExcerpt: 'Electron New Game launch OK',
    gt1c: {
      primary: false,
      productReadyUnassisted: false,
      fullSpinePass: true,
      supporting: false,
    },
    gallery: { shotCount: 42, supporting: true, platform: 'browser' },
  });
  assert.match(body, /dualPlatformPrimaryAcceptance=RESIDUAL/);
  assert.match(body, /NOT a dual-platform golden-thread multi-seed sample/);
  assert.match(body, /productReadyUnassisted=false/);
  assert.match(body, /Electron New Game launch OK/);
  assert.notEqual(body.trim(), 'Electron New Game launch OK');
}

// --- compiler source must import honesty helpers (shipped path wiring) ---
{
  const compiler = readFileSync(resolve(ROOT, 'scripts/compile-campaign-claim.mjs'), 'utf8');
  assert.match(compiler, /evaluateDualPlatformPrimaryAcceptance/);
  assert.match(compiler, /mergeGt1Residuals/);
  assert.match(compiler, /buildBrowserElectronRoutesLog/);
  // Forbidden: empty-array truthy drop of productResiduals
  assert.doesNotMatch(
    compiler,
    /gt1c\?\.residuals\s*\|\|\s*gt1c\?\.productResiduals/,
    'compiler must not use residuals||productResiduals',
  );
  // Forbidden: silent dual DONE from electron+fullSpine alone without product flags
  assert.doesNotMatch(
    compiler,
    /dualPlatformPrimaryDone\s*=\s*electronExit\s*===\s*0\s*&&\s*gt1Full\s*===\s*true\s*&&\s*gt1Supporting\s*===\s*false\s*;/,
  );
}

console.log('campaign-claim-honesty.test.mjs: PASS');
