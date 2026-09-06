import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

import { resolvePackagedStartupReportPath } from '../scripts/lib/electronPackagedStartup.mjs';

test('packaged-startup report override stays inside the repository', () => {
  const root = path.resolve('C:/repo/spaceface');
  assert.equal(
    resolvePackagedStartupReportPath({ root }),
    path.join(root, '.devshots', 'electron-packaged-startup', 'report.json'),
  );
  assert.equal(
    resolvePackagedStartupReportPath({ root, requested: '.devshots/perf/electron/report.json' }),
    path.join(root, '.devshots', 'perf', 'electron', 'report.json'),
  );
  assert.throws(
    () => resolvePackagedStartupReportPath({ root, requested: '../outside.json' }),
    /inside the repository/i,
  );
  assert.throws(
    () => resolvePackagedStartupReportPath({ root, requested: '.devshots/perf/electron/report.txt' }),
    /\.json/i,
  );
});

test('packaged-startup observation rejects stale or missing Electron runtime identity', async () => {
  for (const identity of [
    { versions: { electron: '31.7.7' } },
    { versions: { electron: '43.1.0' } },
    { versions: {} },
    {},
  ]) {
    await assert.rejects(
      observePackagedRuntime(identity, { devDependencies: { electron: '43.2.0' } }),
      /packaged Electron runtime must match the candidate package\.json target/,
      `must reject runtime identity ${JSON.stringify(identity)}`,
    );
  }
});

test('packaged-startup observation rejects missing or non-exact source Electron pins', async () => {
  for (const electron of [undefined, null, '', '^43.2.0', 'latest', 43]) {
    await assert.rejects(
      observePackagedRuntime({ versions: { electron } }, { devDependencies: { electron } }),
      /packaged startup requires an exact Electron version/,
      `must reject source pin ${JSON.stringify(electron)}`,
    );
  }
  await assert.rejects(
    observePackagedRuntime({}, {}),
    /packaged startup requires an exact Electron version/,
  );
});

test('packaged-startup observation follows the source pin rather than a hard-coded version', async () => {
  for (const electron of ['43.2.0', '43.2.1']) {
    const identity = { versions: { electron } };
    const observed = await observePackagedRuntime(identity, { devDependencies: { electron } });
    assert.equal(observed, identity);
  }
});

async function observePackagedRuntime(identity, packageJson) {
  // Execute the actual observation/assertion boundary, not a duplicate validator.
  // Stub only main-process observation and source package reads; never launch Electron.
  const source = readFileSync(new URL('../scripts/check-electron-packaged-startup.mjs', import.meta.url), 'utf8');
  const start = source.indexOf('  mainIdentity = await app.evaluate(');
  const end = source.indexOf('  pageSnapshot = await page.evaluate(', start);
  assert.ok(start >= 0 && end > start, 'packaged runtime observation must precede page proof');
  const root = path.resolve('packaged-startup-contract-fixture');
  return runInNewContext(`(async () => {
    let mainIdentity;
    ${source.slice(start, end)}
    return mainIdentity;
  })()`, {
    assert,
    path,
    ROOT: root,
    app: { evaluate: async () => identity },
    readFileSync(filePath, encoding) {
      assert.equal(filePath, path.join(root, 'package.json'));
      assert.equal(encoding, 'utf8');
      return JSON.stringify(packageJson);
    },
  });
}
