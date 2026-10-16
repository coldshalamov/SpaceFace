import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';
import { pinVercelReleaseHtml, vercelReleaseBase, VERCEL_RELEASE_HOST_PATTERN } from '../scripts/lib/vercelReleaseBase.mjs';
import { runtimeWorkerUrl, RUNTIME_WORKERS } from '../src/render/runtimeWorkers.js';

const oldHost = 'spaceface-play-demo-md1aaeje0-robin-gattis-projects.vercel.app';
const newHost = 'spaceface-play-demo-n6l6lzzcq-robin-gattis-projects.vercel.app';
const canonical = 'https://spaceface-play-demo.vercel.app/';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
  .replace('<script type="module" src="./src/ui/bootEntry.js"></script>',
    '<script type="module" src="./main.js"></script>');
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const invalidHosts = [
  'spaceface-play-demo.vercel.app',
  'spaceface-play-demo-robin-gattis-projects.vercel.app',
  'spaceface-play-demo-git-master-robin-gattis-projects.vercel.app',
  'spaceface-play-demo-md1aaeje0-robin-gattis-projects.vercel.app.evil.test',
  'other-project-md1aaeje0-robin-gattis-projects.vercel.app',
  `https://${oldHost}`, `${oldHost}/main.js`, `${oldHost}?x=1`, `${oldHost}#x`,
  `${oldHost}:443`, `user@${oldHost}`, oldHost.replace('.', '%2e'),
  `${oldHost}\n`, `${oldHost}\r\n`, ` ${oldHost}`, `${oldHost} `,
];

test('local web and Electron HTML remain byte-identical without a deployment hostname', () => {
  for (const hostname of [undefined, null, '']) assert.equal(pinVercelReleaseHtml(html, hostname), html);
  const existingBase = '<head><base href="/local/"></head>';
  assert.equal(pinVercelReleaseHtml(existingBase), existingBase);
});

test('the actual HTML transform pins only the bundled entry and preserves SVG/hash semantics', () => {
  const fragments = '<svg><path id="route"/><textPath href="#route"/><use href="#route"/></svg><a href="#details">Details</a>';
  const input = html.replace('</body>', `${fragments}</body>`);
  const output = pinVercelReleaseHtml(input, oldHost);
  assert.equal(output, input.replace('src="./main.js"', `src="/_releases/${oldHost}/main.js"`));
  assert.equal(output.includes('<base'), false);
  assert.ok(output.includes(fragments));
  assert.equal(new URL('#route', canonical).href, `${canonical}#route`);
  assert.throws(() => pinVercelReleaseHtml(`<head><base href="/"/></head>${html}`, oldHost), /already contains a base/);
  assert.throws(() => pinVercelReleaseHtml('<head></head>', oldHost), /no bundled main/);
});

test('only generated project deployment hosts enter the release prefix or external rewrite', () => {
  const rewrite = config.rewrites.find(row => row.source.startsWith('/_releases/'));
  assert.deepEqual(rewrite, {
    source: `/_releases/:deployment(${VERCEL_RELEASE_HOST_PATTERN})/:path*`,
    destination: 'https://:deployment/:path*',
  });
  const allowed = new RegExp(`^${VERCEL_RELEASE_HOST_PATTERN}$`);
  for (const hostname of [oldHost, newHost]) {
    assert.equal(allowed.test(hostname), true);
    assert.ok(pinVercelReleaseHtml(html, hostname).includes(`/_releases/${hostname}/main.js`));
  }
  for (const hostname of invalidHosts) {
    assert.notEqual(allowed.exec(hostname)?.[0], hostname, hostname);
    assert.throws(() => pinVercelReleaseHtml(html, hostname), /generated .* deployment hostname/, hostname);
  }
  assert.throws(() => pinVercelReleaseHtml(html, 123), /deployment hostname/);
});

test('old-page lazy modules and real worker entries stay pinned across an alias rollout', () => {
  const mainSrc = pinVercelReleaseHtml(html, oldHost).match(/<script type="module" src="([^"]+)"/)[1];
  const documentBase = canonical;
  const releaseBase = vercelReleaseBase(oldHost);
  const main = new URL(mainSrc, documentBase);
  const lazy = new URL('./physicsVenues-V2O5SUE4.js', main);
  assert.equal(lazy.href, `${canonical}_releases/${oldHost}/physicsVenues-V2O5SUE4.js`);
  assert.equal(lazy.origin, new URL(canonical).origin);
  for (const spec of RUNTIME_WORKERS) {
    const worker = new URL(runtimeWorkerUrl(spec.id, main.href, { production: true, documentBase, releaseBase }));
    assert.equal(worker.href, `${canonical}_releases/${oldHost}/${spec.output}`);
    assert.equal(worker.origin, new URL(canonical).origin);
    if (spec.type === 'module') {
      assert.equal(new URL('../chunk-old.js', worker).href,
        `${canonical}_releases/${oldHost}/chunk-old.js`);
    }
  }
  // Neither the canonical document base nor location.origin (localStorage) changes.
  assert.equal(new URL(canonical).origin, main.origin);
  assert.equal(new URL('/__spaceface_player_store', documentBase).href,
    `${canonical}__spaceface_player_store`);
  const nextBase = new URL(`/_releases/${newHost}/`, canonical);
  assert.notEqual(new URL('./main.js', nextBase).pathname, main.pathname);
  assert.equal(new URL('./physicsVenues-V2O5SUE4.js', main).href, lazy.href);
});

test('the real worker helper consumes the compiled release identity and keeps local builds unchanged', async () => {
  const source = readFileSync(new URL('../src/render/runtimeWorkers.js', import.meta.url), 'utf8');
  for (const hostname of [undefined, oldHost]) {
    const releaseBase = vercelReleaseBase(hostname);
    const { code } = await transform(source, { format: 'esm', define: {
      __SPACEFACE_PRODUCTION__: 'true', __SPACEFACE_RELEASE_BASE__: JSON.stringify(releaseBase),
    } });
    const compiled = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    for (const spec of RUNTIME_WORKERS) {
      assert.equal(compiled.runtimeWorkerUrl(spec.id, `${canonical}chunk.js`, { documentBase: canonical }),
        new URL(`${releaseBase}${spec.output}`, canonical).href);
    }
    if (!hostname) {
      assert.equal(compiled.runtimeWorkerUrl('simLane', 'file:///app/chunk.js', {
        documentBase: 'file:///app/index.html',
      }), 'file:///app/workers/wholeSimBrowserWorker.js');
    }
  }
});


test('the owned preview branch is enabled by both existing deployment filters', () => {
  const expected = ["codex/iphone14-mobile","codex/mobile-release-pinning","codex/mobile-startup-cause","codex/oct15-maturity-checkpoint","devin/1791331347-gyre-snare","devin/1791416174-gyre-snare-polish","main","master"];
  assert.equal(config.git.deploymentEnabled['**'], false);
  assert.deepEqual(Object.entries(config.git.deploymentEnabled).filter(([,v]) => v === true).map(([k]) => k).sort(), expected);
  for (const ref of [...expected, 'codex/unrelated-agent', '', 'feature/foreign']) {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/vercel-ignore-build.mjs', import.meta.url))], { env: { ...process.env, VERCEL_GIT_COMMIT_REF: ref }, encoding: 'utf8' });
    assert.equal(result.status, expected.includes(ref) ? 1 : 0, ref + ': ' + result.stderr);
  }
});
