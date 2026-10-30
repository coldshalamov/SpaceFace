import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createRegistry } from '../src/core/registry.js';
import { createPresentationRegistry } from '../src/runtime/presentationRegistry.js';
import { getSystemCapability, isNodeSafeSystemId } from '../src/runtime/authoritativeSystemManifest.js';

const context = lane => ({ state: createGameState(), bus: createBus(), helpers: {}, simLane: lane,
  applyRuntimeFeatures: false });

// Replace init/destroy hooks only inside this isolated process; the registry still owns order,
// async initialization and teardown. This keeps the check independent of a browser/GPU.
async function captureLifecycle(registry) {
  const seen = [], destroyed = [], originals = [];
  for (const system of new Set(registry.systems)) {
    originals.push([system, Object.getOwnPropertyDescriptor(system, 'init'),
      Object.getOwnPropertyDescriptor(system, 'destroy')]);
    system.init = () => seen.push(system.name);
    system.destroy = () => destroyed.push(system.name);
  }
  try {
    await registry.initAsync();
    registry.destroy(); registry.destroy();
    return { seen, destroyed };
  } finally {
    for (const [system, init, destroy] of originals) {
      if (init) Object.defineProperty(system, 'init', init); else delete system.init;
      if (destroy) Object.defineProperty(system, 'destroy', destroy); else delete system.destroy;
    }
  }
}

test('worker main initializes only manifest presentation owners and retains its facades', async () => {
  const ctx = context('worker'), registry = createPresentationRegistry(ctx);
  const expected = registry.runtimeManifest.authoritativeSystemIds.filter(id =>
    !isNodeSafeSystemId(id) || getSystemCapability(id).phase === 'platform'
    || getSystemCapability(id).domGuarded === true);
  assert.deepEqual(registry.systems.map(s => s.name), expected);
  const result = await captureLifecycle(registry);
  assert.deepEqual(result.seen, expected);
  for (const name of ['tacticalAI', 'flight', 'v2Flavor', 'securityReadout', 'priceForecast', 'contractClauses', 'moralTrap']) {
    assert.ok(!result.seen.includes(name), `${name} belongs to the worker`);
  }
  for (const name of ['save', 'physics', 'input', 'economy', 'cargo', 'claims', 'crafting',
    'asteroidSites', 'careerLadders', 'careerOrigins', 'drill', 'missions', 'world']) {
    assert.equal(registry.get(name)?.name, name);
  }
  assert.equal(registry.get('input').gamepad, ctx.gamepad);
  assert.equal(new Set(result.destroyed).size, result.destroyed.length);
});

test('full browser registry remains the ordered single-init path for main and fallback', async () => {
  for (const lane of ['main', 'main']) {
    const registry = createRegistry(context(lane));
    const result = await captureLifecycle(registry);
    assert.deepEqual(result.seen, registry.systems.map(s => s.name));
    assert.equal(new Set(result.destroyed).size, result.destroyed.length);
    for (const name of ['tacticalAI', 'flight', 'v2Flavor', 'securityReadout', 'priceForecast', 'contractClauses', 'moralTrap']) {
      assert.equal(result.seen.filter(value => value === name).length, 1, name);
    }
  }
});
import { installSimCommandSink } from '../src/core/simLaneCommands.js';

test('direct worker registry uses the presentation factory and matches full manifest identities', () => {
  for (const physicsBackend of ['rapier-dynamic', 'legacy']) {
    const main = context('main'), worker = context('worker');
    for (const ctx of [main, worker]) Object.assign(ctx.state.settings.gameplay, {
      physicsBackend, aiBackend: 'sg06-tactical', flightBackend: 'v3',
    });
    const full = createRegistry(main), presentation = createRegistry(worker);
    assert.deepEqual(presentation.runtimeManifest.selectedSlots, full.runtimeManifest.selectedSlots);
    assert.equal(presentation.runtimeManifest.profileHash, full.runtimeManifest.profileHash);
    assert.equal(presentation.runtimeManifest.manifestHash, full.runtimeManifest.manifestHash);
    assert.equal(presentation.runtimeManifest.selectedSlots.flightBackend,
      physicsBackend === 'rapier-dynamic' ? 'v3' : 'legacy');
    assert.equal(presentation.runtimeManifest.selectedSlots.aiBackend,
      physicsBackend === 'rapier-dynamic' ? 'sg06-tactical' : 'legacy');
    assert.equal(presentation.get('input').gamepad, worker.gamepad);
    assert.equal(presentation.systems.some(s => s.name === 'tacticalAI'), false);
  }
});

test('worker presentation returns frame acknowledgement despite HUD errors and forwards keepalive', () => {
  const ctx = context('worker');
  ctx.state.mode = 'loading';
  const registry = createPresentationRegistry(ctx);
  const overrides = [];
  function replace(object, name, value) {
    overrides.push([object, name, Object.getOwnPropertyDescriptor(object, name)]);
    object[name] = value;
  }
  const frame = { journal: 'sentinel' }, calls = [];
  const render = registry.get('render'), vfx = registry.get('vfx');
  const feel = registry.get('feel'), ui = registry.get('ui');
  replace(render, 'prepareFrame', (_alpha, _dt, input) => { calls.push(input); return true; });
  replace(render, 'drawPreparedFrame', () => false);
  replace(vfx, 'update', () => {});
  replace(feel, 'frame', () => {});
  replace(ui, 'frame', () => {});
  const hud = registry.systems.filter(s => getSystemCapability(s.name).domGuarded && typeof s.update === 'function');
  assert.ok(hud.length >= 2);
  for (const system of hud) replace(system, 'update', () => calls.push(system.name));
  replace(hud[0], 'update', () => { throw new Error('expected HUD failure'); });
  const oldError = console.error;
  const logs = [], commands = [];
  console.error = (...args) => logs.push(args);
  const uninstall = installSimCommandSink(command => commands.push(command));
  try {
    assert.equal(registry.renderUpdate(0.5, 0.016, frame), true);
    assert.equal(calls[0], frame);
    assert.ok(calls.includes(hud[1].name), 'a failed HUD cannot strand the next HUD');
    assert.ok(logs.some(args => String(args[0]).includes(hud[0].name)));
    ctx.state.mode = 'flight';
    ctx.state.ui.docked = true;
    assert.equal(registry.renderUpdate(0.5, 0.016, frame), false,
      'a frozen world frame must not acknowledge the journal');
    registry.keepalive(0, 0.25);
    assert.deepEqual(commands, [{ kind: 'keepalive', wallDt: 0.25 }]);
  } finally {
    uninstall(); console.error = oldError;
    for (const [object, name, descriptor] of overrides.reverse()) {
      if (descriptor) Object.defineProperty(object, name, descriptor); else delete object[name];
    }
  }
});
