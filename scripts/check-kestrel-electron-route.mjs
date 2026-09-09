#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT = resolve(ROOT, '.devshots/k0-kestrel/electron-route.json');
const { _electron: electron } = await loadPlaywright();

let app;
try {
  app = await electron.launch({ args: ['.'], cwd: ROOT, timeout: 90_000 });
  const page = await app.firstWindow({ timeout: 90_000 });
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 90_000 });
  assert.equal(new URL(page.url()).search, '', 'Electron must use the canonical root without query flags');

  await page.getByRole('button', { name: 'New Game', exact: true }).click({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Launch', exact: true }).click({ timeout: 30_000 });
  try {
    const readiness = await page.waitForFunction(() => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      const data = player?.mesh?.userData || {};
      const ready = state?.mode === 'flight'
        && player?.isPlayer === true
        && player?.alive !== false
        && data.authoredAssetState === 'authored'
        && data.authoredVisualRoot === 'authored-root'
        && data.authoredReadableFallbackRetained === false
        && Object.values(data.authoredSlots || {}).flat()
          .some((url) => String(url).includes('/wholeships/kestrel.glb'));
      if (ready) return 'ready';
      if (data.authoredAssetState === 'fallback-after-error') return 'asset-error';
      return false;
    }, null, { timeout: 120_000 });
    const readinessState = await readiness.jsonValue();
    if (readinessState !== 'ready') throw new Error(`Electron authored readiness stopped at ${readinessState}`);
  } catch (error) {
    const snapshot = await page.evaluate(async () => {
      const state = window.SF?.state;
      const player = state?.entities?.get(state.playerId);
      let assetDiagnostic = null;
      try {
        const { getAuthoredAssetDiagnostic } = await import('/src/render/assetLoader.js');
        const diagnostic = await getAuthoredAssetDiagnostic(
          state?.render?.renderer,
          'assets/ships/release/parts/wholeships/kestrel.glb',
          'hull',
        );
        assetDiagnostic = diagnostic ? {
          name: diagnostic.name,
          message: diagnostic.message,
          errors: diagnostic.errors,
          warnings: diagnostic.warnings,
          stack: diagnostic.stack,
        } : null;
      } catch (diagnosticError) {
        assetDiagnostic = { name: diagnosticError.name, message: diagnosticError.message };
      }
      return {
        mode: state?.mode,
        playerId: state?.playerId,
        player: player ? { isPlayer: player.isPlayer, alive: player.alive, hull: player.hull } : null,
        authored: player?.mesh?.userData ? {
          state: player.mesh.userData.authoredAssetState,
          root: player.mesh.userData.authoredVisualRoot,
          fallback: player.mesh.userData.authoredReadableFallbackRetained,
          slots: player.mesh.userData.authoredSlots,
        } : null,
        loader: state?.render?.loaderDiagnostics || null,
        gpu: state?.render?.gpu || null,
        assetDiagnostic,
      };
    }).catch(() => null);
    throw new Error(`Electron Kestrel route timed out: ${JSON.stringify(snapshot)}`, { cause: error });
  }

  const result = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return {
      url: location.href,
      mode: state.mode,
      isPlayer: player.isPlayer,
      alive: player.alive !== false,
      authoredState: player.mesh.userData.authoredAssetState,
      authoredRoot: player.mesh.userData.authoredVisualRoot,
      fallbackRetained: player.mesh.userData.authoredReadableFallbackRetained,
      wholeShip: Object.values(player.mesh.userData.authoredSlots || {}).flat()
        .some((url) => String(url).includes('/wholeships/kestrel.glb')),
      gpu: state.render.gpu,
      pixelProof: state.render.renderer.domElement.toDataURL('image/png').length,
    };
  });
  const errors = issues.errorIssues();
  assert.ok(result.pixelProof > 1000, 'Electron renderer must produce a non-empty frame');
  assert.deepEqual(errors, [], `Electron route page errors: ${JSON.stringify(summarizeIssues(errors))}`);
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, `${JSON.stringify({ schema: 'spaceface.k0KestrelElectronRoute.v1', ...result }, null, 2)}\n`);
  console.log('Kestrel canonical Electron new-game route: PASS');
  console.log(JSON.stringify(result, null, 2));
} finally {
  if (app) await app.close().catch(() => {});
}
