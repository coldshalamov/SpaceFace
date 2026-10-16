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

test('Git deployment creation defaults off and mirrors every existing allowed branch', () => {
  // Official schema permits an object of boolean branch rules. Vercel uses minimatch;
  // any matching true takes precedence, so literal exceptions override the ** catchall.
  // https://vercel.com/docs/project-configuration/git-configuration
  assert.equal(config.$schema, 'https://openapi.vercel.sh/vercel.json');
  assert.deepEqual(allow, expected, 'retain the existing branch policy, including the checkpoint');
  assert.deepEqual(config.git.deploymentEnabled, { '**': false,
    ...Object.fromEntries(allow.map(branch => [branch, true])) });
  for (const enabled of Object.values(config.git.deploymentEnabled)) assert.equal(typeof enabled, 'boolean');
});

test('branch creation rules agree with the unchanged build-step fallback', () => {
  const blocked = ['codex/other-agent', 'codex/nested/cleanup', 'devin/new-lane', 'vm-drop', 'feature',
    'codex/oct15-maturity-checkpoint-extra'];
  for (const branch of [...allow, ...blocked]) {
    const allowed = allow.includes(branch);
    const result = spawnSync(process.execPath, [ignoreScript], {
      env: { ...process.env, VERCEL_GIT_COMMIT_REF: branch }, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(result.status, allowed ? 1 : 0, `${branch}: ${result.stderr}`);
    assert.equal(config.git.deploymentEnabled[branch] ?? config.git.deploymentEnabled['**'], allowed);
  }
});

test('deployment filtering retains retail build settings and worker cache headers', () => {
  assert.equal(config.framework, null);
  assert.equal(config.ignoreCommand, 'node scripts/vercel-ignore-build.mjs');
  assert.equal(config.installCommand, 'ELECTRON_SKIP_BINARY_DOWNLOAD=1 PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci');
  assert.equal(config.buildCommand, 'npm run build:bundle');
  assert.equal(config.outputDirectory, 'build/web');
  const headers = Object.fromEntries(config.headers.map(row => [row.source,
    Object.fromEntries(row.headers.map(header => [header.key, header.value]))]));
  assert.equal(headers['/workers/:path*']['Cache-Control'], 'public, max-age=0, must-revalidate');
  assert.equal(headers['/workers/:path*']['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['/main.js']['Cache-Control'], 'public, max-age=0, must-revalidate');
});
