import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

test('worker presentation loads its real registry without importing the native physics initialization owner', () => {
  // A fresh CPU process observes the real import graph. No module or initializer is mocked;
  // constructing this registry does not initialize render/UI and creates no GPU context.
  const root = new URL('../', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { registerHooks } from 'node:module';
    const root = ${JSON.stringify(root)};
    const forbidden = new Set(['src/core/sg02DynamicBodyOwner.js', 'src/core/rapierCompatRuntime.js']
      .map(path => new URL(path, root).href));
    const loaded = new Set();
    const hook = registerHooks({ load(url, context, next) {
      if (forbidden.has(url)) loaded.add(url);
      return next(url, context);
    } });
    const { createPresentationRegistry } = await import(new URL('src/runtime/presentationRegistry.js', root));
    const { createGameState } = await import(new URL('src/core/gameState.js', root));
    const { createBus } = await import(new URL('src/core/eventBus.js', root));
    const { installSimCommandSink } = await import(new URL('src/core/simLaneCommands.js', root));
    const ctx = { state: createGameState(47), bus: createBus(), helpers: {}, simLane: 'worker', applyRuntimeFeatures: false };
    const registry = createPresentationRegistry(ctx);
    assert.equal(registry.systems.some(system => system.name === 'physics'), false);
    const commands = [];
    const release = installSimCommandSink(command => { commands.push(command); return Promise.resolve({ ok: true }); });
    try { await registry.get('physics').prepareBackend(ctx.state); } finally { release(); }
    assert.equal(commands.length, 1);
    assert.equal(commands[0].op, 'physicsPrep');
    assert.equal(commands[0].args.backend, 'rapier-dynamic');
    hook.deregister();
    assert.deepEqual([...loaded], [], 'a presentation read must not load the native initialization graph');
  `], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.error?.stack || child.stderr || child.stdout);
});

test('native public proportions exports retain the same pure lookup and frozen table identities', async () => {
  const pure = await import('../src/core/craftProportions.js');
  const native = await import('../src/core/sg02DynamicBodyOwner.js');
  assert.equal(native.resolveCraftProportions, pure.resolveCraftProportions);
  for (const key of ['ENEMY_SILHOUETTE_PROPORTIONS', 'TRAFFIC_ROLE_PROPORTIONS',
    'FACTION_HULL_PROPORTIONS', 'CRAFT_COLLISION_PROPORTIONS']) {
    assert.equal(native[key], pure[key], key);
    assert(Object.isFrozen(pure[key]), key);
    assert(Object.values(pure[key]).every(Object.isFrozen), key);
  }
});

test('pure hull lookup retains authored overrides, catalog precedence and capsule fallbacks', async () => {
  const { resolveCraftProportions: resolve, ENEMY_SILHOUETTE_PROPORTIONS: enemy,
    TRAFFIC_ROLE_PROPORTIONS: traffic, CRAFT_COLLISION_PROPORTIONS: hull } = await import('../src/core/craftProportions.js');
  const override = { length: 2, halfWidth: 1, height: 0.5 };
  assert.equal(resolve({ data: { proportions: override, silhouette: 'sniper_lance', defId: 'ship_kestrel' } }), override);
  assert.equal(resolve({ data: { silhouette: 'sniper_lance', defId: 'ship_kestrel' } }), enemy.sniper_lance);
  assert.equal(resolve({ data: { defId: 'ship_kestrel', trafficRole: 'tug' } }), hull.ship_kestrel);
  assert.equal(resolve({ data: { trafficRole: 'tug' } }), traffic.tug);
  assert.equal(resolve({ id: 'traffic:tug', data: {} }), traffic.tug);
  assert.equal(resolve({ data: { proportions: { length: NaN, halfWidth: 1 }, defId: 'ship_kestrel' } }), hull.ship_kestrel);
  assert.deepEqual(resolve({ type: 'drone', data: {} }), { length: 1, halfWidth: 0.45, height: 0.30 });
  assert.deepEqual(resolve(null), { length: 1.35, halfWidth: 0.42, height: 0.30 });
});
