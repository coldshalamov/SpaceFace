import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const HELPER_URL = new URL('../scripts/lib/pythonProcessEnv.mjs', import.meta.url);
const EXPORTER_URL = new URL('../scripts/check-exporter.mjs', import.meta.url);
const RUNNER_URL = new URL('../scripts/check-asset-pipeline-contract.mjs', import.meta.url);

let PYTHON;
let resolvePythonCommand;
let withPythonNoBytecodeEnv;
try {
  ({ PYTHON, resolvePythonCommand, withPythonNoBytecodeEnv } = await import(HELPER_URL));
} catch (error) {
  assert.fail(`asset-pipeline Python environment helper must exist: ${error?.message || error}`);
}

const env = withPythonNoBytecodeEnv({ SF_SENTINEL: 'preserved', PYTHONDONTWRITEBYTECODE: '0' });
assert.equal(env.SF_SENTINEL, 'preserved', 'Python environment helper preserves caller variables');
assert.equal(env.PYTHONDONTWRITEBYTECODE, '1', 'Python environment helper always disables bytecode writes');
assert.equal(resolvePythonCommand({ PYTHON: 'C:/fixture/custom-python.exe' }), 'C:/fixture/custom-python.exe',
  'shared Python resolution honors an explicit PYTHON command');
assert.equal(resolvePythonCommand({}), 'python', 'shared Python resolution has one portable fallback');
assert.equal(PYTHON, process.env.PYTHON || 'python', 'exported Python command uses the shared resolver');

const exporterSource = await readFile(EXPORTER_URL, 'utf8');
assert.match(exporterSource, /withPythonNoBytecodeEnv/, 'check-exporter uses the shared no-bytecode helper');
assert.equal(count(exporterSource, /spawn\(PYTHON,/g), 2,
  'check-exporter launches both Python subprocesses through the shared resolved command');
assert.doesNotMatch(exporterSource, /spawn\(['"]python['"]/, 'check-exporter does not bypass PYTHON resolution');
assert.equal(count(exporterSource, /env:\s*PYTHON_ENV/g), 2,
  'both check-exporter Python subprocesses receive the no-bytecode environment');

const runnerSource = await readFile(RUNNER_URL, 'utf8');
assert.match(runnerSource, /withPythonNoBytecodeEnv/, 'asset-pipeline runner uses the shared no-bytecode helper');
assert.match(runnerSource, /import\s*\{[^}]*PYTHON[^}]*withPythonNoBytecodeEnv[^}]*\}/s,
  'asset-pipeline runner imports the same resolved Python command');
assert.doesNotMatch(runnerSource, /const\s+PYTHON\s*=/,
  'asset-pipeline runner does not define a second Python resolver');
assert.match(runnerSource, /env:\s*PROCESS_ENV/, 'asset-pipeline runner passes the merged environment to every child');
assert.doesNotMatch(runnerSource, /PYTHONDONTWRITEBYTECODE\s*=\s*1\s+(?:python|node)/,
  'asset-pipeline gate does not rely on shell-specific environment syntax');

console.log(`PASS Python bytecode hygiene: merged env, exporter coverage, and runner coverage (${ROOT})`);

function count(source, pattern) {
  return [...source.matchAll(pattern)].length;
}
