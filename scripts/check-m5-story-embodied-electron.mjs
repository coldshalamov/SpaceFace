#!/usr/bin/env node
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

import { collectPageIssues } from './lib/browser-issues.mjs';
import {
  closeOwnedElectronRuntime,
  createElectronCanonicalUrlTracker,
  createElectronProcessMonitor,
} from './lib/alphaLiveBaselineElectronContracts.mjs';
import {
  assertIsolatedElectronRootUrl,
  createIsolatedElectronLaunch,
} from './lib/electronTestIsolation.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';
import { runEmbodiedStoryRoute } from './check-m5-story-embodied-runtime.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const { _electron: electron } = await loadPlaywright();
let app;
let page;
let childProcess;
let processMonitor;
let canonicalUrlTracker;
let rootUrl;
const isolatedLaunch = createIsolatedElectronLaunch({ root: ROOT, taskId: 'm5-story-embodied' });

try {
  app = await electron.launch(isolatedLaunch.options);
  processMonitor = createElectronProcessMonitor({ electronApp: app, childProcess: app.process() });
  childProcess = processMonitor.childProcess;
  page = await app.firstWindow({ timeout: 90_000 });
  canonicalUrlTracker = createElectronCanonicalUrlTracker(page, {
    bootstrapTimeoutMs: 10_000,
    pollIntervalMs: 75,
    allowAnyLoopbackPort: true,
  });
  rootUrl = await canonicalUrlTracker.waitForCanonicalRoot(10_000);
  assertIsolatedElectronRootUrl(rootUrl);
  const issues = collectPageIssues(page, { ignoreProbeWarnings: true });
  await page.waitForLoadState('domcontentloaded', { timeout: 90_000 });
  assert.equal(new URL(page.url()).pathname, '/', 'Electron must boot the canonical root route');
  const report = await runEmbodiedStoryRoute(page, { root: ROOT, routeName: 'electron' });
  assert.deepEqual(issues.errorIssues(), [], 'embodied Electron route emitted page errors');
  console.log('M5 embodied story Electron PASS');
  console.log(JSON.stringify({ ...report, route: page.url() }, null, 2));
} finally {
  if (app) {
    const cleanupReport = await closeOwnedElectronRuntime({
      page,
      electronApp: app,
      childProcess,
      canonicalUrlTracker,
      processMonitor,
      rootUrl,
    });
    assert.equal(cleanupReport?.pass, true, `M5 Electron cleanup failed: ${(cleanupReport?.failures || []).join('; ')}`);
    isolatedLaunch.cleanup({ runtimeClosed: cleanupReport.pass === true });
  }
}
