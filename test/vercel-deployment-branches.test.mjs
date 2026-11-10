import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const ignoreScript = fileURLToPath(new URL('../scripts/vercel-ignore-build.mjs', import.meta.url));
const ignoreSource = readFileSync(ignoreScript, 'utf8');
const allow = Array.from(runInNewContext(ignoreSource.match(/const allow = new Set\((\[[\s\S]*?\])\)/)[1]));
const expected = ['master', 'main', 'codex/iphone14-mobile', 'codex/oct15-maturity-checkpoint', 'codex/mobile-release-pinning', 'codex/mobile-startup-cause', 'codex/phone-startup-recovery',
  'devin/1791331347-gyre-snare', 'devin/1791416174-gyre-snare-polish'];

test('manual-only policy disables all Git deployment creation, without branch exceptions', () => {
  // October 19 policy: the fallback allowlist must not re-enable Git-triggered deploys.
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.deepEqual(allow, expected, 'retain the existing branch policy, including the checkpoint');
  assert.equal(config.git.deploymentEnabled, false, 'boolean false disables Git builds even for fallback-allowlisted branches');
});

test('secondary build-step fallback keeps its exact allowlist and rejects other or absent refs', () => {
  const blocked = ['codex/other-agent', 'codex/nested/cleanup', 'devin/new-lane', 'vm-drop', 'feature',
    'codex/oct15-maturity-checkpoint-extra', 'master-extra', 'MASTER', '', undefined];
  for (const branch of [...allow, ...blocked]) {
    const allowed = allow.includes(branch);
    const env = { ...process.env };
    if (branch === undefined) delete env.VERCEL_GIT_COMMIT_REF;
    else env.VERCEL_GIT_COMMIT_REF = branch;
    const result = spawnSync(process.execPath, [ignoreScript], {
      env, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, allowed ? 1 : 0, `${branch}: ${result.stderr}`);
    assert.equal(result.error, undefined);
    assert.equal(result.stdout.trim(), allowed ? `[vercel] building ${branch}`
      : `[vercel] skipping ${branch ?? ''}; not an allowlisted branch`);
  }
});

test('deployment filtering retains retail build settings and worker cache headers', () => {
  assert.equal(config.framework, null);
  assert.equal(config.ignoreCommand, 'node scripts/vercel-ignore-build.mjs');
  assert.equal(config.installCommand, 'node scripts/vercel-install.mjs');
  assert.equal(config.buildCommand, 'npm run build:bundle');
  assert.equal(config.outputDirectory, 'build/web');
  const headers = Object.fromEntries(config.headers.map(row => [row.source,
    Object.fromEntries(row.headers.map(header => [header.key, header.value]))]));
  assert.equal(headers['/workers/:path*']['Cache-Control'], 'public, max-age=0, must-revalidate');
  assert.equal(headers['/workers/:path*']['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['/main.js']['Cache-Control'], 'public, max-age=0, must-revalidate');
});

// Execute the real installer control flow with only its process boundary replaced.
// Never download packages or binaries during this contract test.
test('cross-platform installer preserves npm ci, skip flags, environment and failure status', () => {
  const source = readFileSync(new URL('../scripts/vercel-install.mjs', import.meta.url), 'utf8');
  const importLine = /import \{ spawnSync \} from 'node:child_process';/;
  assert.match(source, importLine);
  const executable = source.replace(importLine, '');
  for (const status of [0, 7, null, undefined]) {
    const env = { KEEP_ME: 'existing', ELECTRON_SKIP_BINARY_DOWNLOAD: '0', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0' };
    const calls = [], exits = [];
    runInNewContext(executable, {
      spawnSync(command, args, options) { calls.push({ command, args, options }); return { status }; },
      process: { env, exit(code) { exits.push(code); } },
    }, { timeout: 1000 });
    assert.equal(calls.length, 1);
    const call = JSON.parse(JSON.stringify(calls[0]));
    assert.deepEqual(call, { command: 'npm', args: ['ci'], options: {
      stdio: 'inherit', shell: true,
      env: { KEEP_ME: 'existing', ELECTRON_SKIP_BINARY_DOWNLOAD: '1', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1' },
    } });
    assert.deepEqual(exits, [status ?? 1], 'failed or unstarted installs must not report success');
    assert.deepEqual(env, { KEEP_ME: 'existing', ELECTRON_SKIP_BINARY_DOWNLOAD: '0', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '0' });
  }
});
