import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

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
