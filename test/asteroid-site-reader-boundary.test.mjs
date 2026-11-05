import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('the pure asteroid-site reader does not import native simulation owners', () => {
  // Observe real imports in a fresh process so the parent module cache cannot hide an edge.
  const root = new URL('../', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const root = ${JSON.stringify(root)};
    const owners = ['asteroidSites', 'drill', 'worldSiteRuntime', 'economy', 'ceresWorkfleet', 'alienEcology'];
    const loaded = new Set();
    const hook = registerHooks({ load(url, context, next) {
      loaded.add(url);
      return next(url, context);
    } });
    try {
      await import(new URL('src/systems/asteroidSiteReadModel.js', root));
      for (const owner of owners) {
        assert.ok(!loaded.has(new URL('src/systems/' + owner + '.js', root).href),
          'pure site reader must not import native ' + owner);
      }
    } finally {
      hook.deregister();
    }
  `], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.error?.stack || child.stderr || child.stdout);
});
