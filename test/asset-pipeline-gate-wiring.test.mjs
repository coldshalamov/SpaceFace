import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageUrl = new URL('../package.json', import.meta.url);
const runnerUrl = new URL('../scripts/check-asset-pipeline-contract.mjs', import.meta.url);
const pkg = JSON.parse(await readFile(packageUrl, 'utf8'));
const runnerSource = await readFile(runnerUrl, 'utf8');
const exporterSource = await readFile(new URL('../scripts/check-exporter.mjs', import.meta.url), 'utf8');

const gateCommand = 'node scripts/check-asset-pipeline-contract.mjs';
const aggregateCommand = 'npm run check:asset-pipeline-contract';
assert.equal(pkg.scripts['check:asset-pipeline-contract'], gateCommand,
  'named asset-pipeline gate runs its Node orchestrator');
assert.equal(countCommand(pkg.scripts['check:art'], aggregateCommand), 1,
  'check:art reaches the asset-pipeline contract exactly once');
assert.equal(countCommand(pkg.scripts['check:art'], 'node scripts/check-exporter.mjs'), 0,
  'check:art does not duplicate check-exporter outside the asset-pipeline gate');
for (const aggregate of ['check', 'check:ci']) {
  assert.equal(countCommand(pkg.scripts[aggregate], 'npm run check:art'), 1,
    `${aggregate} reaches the asset-pipeline contract through check:art exactly once`);
  assert.equal(countCommand(pkg.scripts[aggregate], aggregateCommand), 0,
    `${aggregate} must not duplicate the asset-pipeline gate outside check:art`);
  assert.equal(countCommand(pkg.scripts[aggregate], gateCommand), 0,
    `${aggregate} must not invoke the asset-pipeline runner directly`);
}
for (const [scriptName, command] of Object.entries(pkg.scripts)) {
  if (scriptName === 'check:asset-pipeline-contract') continue;
  assert.equal(countCommand(command, gateCommand), 0,
    `${scriptName} must not duplicate the asset-pipeline runner command`);
}

const requiredJobs = [
  'scripts/check-exporter.mjs',
  'test/two-file-transaction.test.mjs',
  'test/part-provenance.test.mjs',
  'test/source-texture-role-validation.test.mjs',
  'test/finalizer-texture-contract.test.mjs',
  'test/export-texture-role-mode.test.py',
  'test/generic-blender-authoring-contract.test.mjs',
  'test/engine-drive-surface-validation.test.mjs',
  'test/part-output-path-containment.test.mjs',
  'test/strict-glb-validation.test.mjs',
  'test/blender-fixture-evidence-contract.test.mjs',
  'test/python-bytecode-hygiene.test.mjs',
  'test/asset-pipeline-gate-wiring.test.mjs',
  'test/authored-assets-probe-evidence.test.mjs',
];
for (const job of requiredJobs) {
  assert.equal(countCommand(runnerSource, job), 1, `asset-pipeline runner owns ${job} exactly once`);
}
assert.equal(countCommand(runnerSource, 'test/spaceface-export-state.test.py'), 0,
  'aggregate does not duplicate exporter-state coverage already owned by check-exporter');
assert.equal(countCommand(exporterSource, 'test/spaceface-export-state.test.py'), 1,
  'check-exporter owns exporter-state coverage exactly once');
assert.doesNotMatch(pkg.scripts['check:asset-pipeline-contract'], /(?:^|\s)(?:set\s+|\$env:|export\s+|PYTHONDONTWRITEBYTECODE=)/,
  'package gate uses portable Node orchestration rather than shell-specific environment syntax');

console.log(`PASS asset-pipeline gate wiring: ${requiredJobs.length} owned checks, one check:art path`);

function countCommand(command, needle) {
  return String(command || '').split(needle).length - 1;
}
