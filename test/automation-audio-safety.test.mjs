import test from 'node:test';
import assert from 'node:assert/strict';

import { withMutedAutomationLaunches } from '../scripts/lib/load-playwright.mjs';

test('standard Chromium and Electron automation launches are hard-muted without mutating callers', async () => {
  const calls = [];
  const playwright = {
    chromium: {
      launch(options) { calls.push(['chromium', options]); return Promise.resolve('browser'); },
      launchPersistentContext(profile, options) {
        calls.push(['persistent', profile, options]);
        return Promise.resolve('context');
      },
    },
    _electron: {
      launch(options) { calls.push(['electron', options]); return Promise.resolve('app'); },
    },
    marker: 'preserved',
  };
  const browserOptions = { headless: false, args: ['--ignore-gpu-blocklist'] };
  const electronOptions = { args: ['.'], cwd: 'C:\\repo' };
  const safe = withMutedAutomationLaunches(playwright);

  await safe.chromium.launch(browserOptions);
  await safe.chromium.launchPersistentContext('C:\\profile', { args: ['--mute-audio'] });
  await safe._electron.launch(electronOptions);

  assert.deepEqual(calls[0][1].args, ['--mute-audio', '--ignore-gpu-blocklist']);
  assert.deepEqual(calls[1][2].args, ['--mute-audio'], 'an existing mute switch must not duplicate');
  assert.deepEqual(calls[2][1].args, ['--mute-audio', '.']);
  assert.deepEqual(browserOptions.args, ['--ignore-gpu-blocklist'], 'browser options remain caller-owned');
  assert.deepEqual(electronOptions.args, ['.'], 'Electron options remain caller-owned');
  assert.equal(safe.marker, 'preserved');
});
