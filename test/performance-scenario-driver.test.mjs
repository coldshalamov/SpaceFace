import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  preparePerformanceScenario,
  performanceScenarioExecutionOrder,
  performanceScenarioHoldsMeasuredPose,
  performanceScenarioPipelineSettleTimeoutMs,
  restorePerformanceScenario,
  validateScenarioRestoration,
} from '../scripts/lib/performanceScenarioDriver.mjs';
import { PERFORMANCE_SCENARIOS } from '../scripts/lib/performanceClosureContracts.mjs';

test('scenario execution order keeps comparable route states together and context recovery last', () => {
  const order = performanceScenarioExecutionOrder([
    'context_recover_steady',
    'fleet_full_render_50',
    'docked_market_ui',
    'flight_steady',
    'autosave_under_load',
  ]);
  assert.deepEqual(order, [
    'docked_market_ui',
    'flight_steady',
    'fleet_full_render_50',
    'autosave_under_load',
    'context_recover_steady',
  ]);
});

test('restoration receipt fails closed on any leaked state or injected entity', () => {
  assert.deepEqual(validateScenarioRestoration({
    restored: true,
    checks: { timeScale: true, injectedEntitiesRemoved: true },
    remainingInjectedIds: [],
  }), { pass: true, failures: [] });
  const failed = validateScenarioRestoration({
    restored: false,
    checks: { timeScale: false, injectedEntitiesRemoved: true },
    remainingInjectedIds: [42],
  });
  assert.equal(failed.pass, false);
  assert.match(failed.failures.join(' | '), /timeScale/);
  assert.match(failed.failures.join(' | '), /injected entities remain/);
});

test('browser restoration resolves the live SF authority in every evaluation scope', async () => {
  const source = await readFile(new URL('../scripts/lib/performanceScenarioDriver.mjs', import.meta.url), 'utf8');
  const restoreSource = source.slice(source.indexOf('export async function restorePerformanceScenario'));
  assert.match(restoreSource, /const receipt = await page\.evaluate\([\s\S]*const sf = window\.SF;[\s\S]*sf\.registry/);
});

test('only injected non-transition workloads hold the measured pose', async () => {
  const held = PERFORMANCE_SCENARIOS
    .filter(performanceScenarioHoldsMeasuredPose)
    .map((definition) => definition.id);
  assert.deepEqual(held, [
    'mining_tether_active',
    'fleet_full_render_10',
    'fleet_full_render_25',
    'fleet_full_render_50',
    'fleet_transparent_heavy',
    'station_visible_steady',
    'combat_vfx_burst',
    'autosave_under_load',
  ]);

  for (const definition of PERFORMANCE_SCENARIOS.filter((entry) => entry.primaryCapable || entry.transitionWindow)) {
    if (definition.injectedState && !definition.transitionWindow) continue;
    assert.equal(performanceScenarioHoldsMeasuredPose(definition), false, `${definition.id} must preserve its public motion truth`);
  }

  const source = await readFile(new URL('../scripts/lib/performanceScenarioDriver.mjs', import.meta.url), 'utf8');
  assert.match(source, /if \(holdsMeasuredPose\) \{[\s\S]*player\.vel\.set\(0, 0, 0\);[\s\S]*syncPlayerPhysics/);
  assert.match(source, /player\.vel\.set\(snapshot\.player\.vel\.x, snapshot\.player\.vel\.y, snapshot\.player\.vel\.z\)/);
  assert.match(source, /id\.startsWith\('station_'\)[\s\S]*flybyFocus:[\s\S]*performance-station-scenario/,
    'station scenarios journal and isolate unrelated Flyby Focus slow-time');
  assert.match(source, /performance-station-restore[\s\S]*Object\.assign\(state\.player\.flybyFocus, snapshot\.flybyFocus\)/,
    'station scenarios restore the exact Flyby Focus journal after measurement');
  assert.match(source, /flybyFocus: !snapshot\.isolatesFlybyFocus[\s\S]*sameFlybyFocus/,
    'restoration fails closed when the Flyby Focus journal does not round-trip');
});

test('terminal jump warmup preserves five-second stability inside a bounded longer envelope', async () => {
  assert.equal(performanceScenarioPipelineSettleTimeoutMs('flight_steady'), 20_000);
  assert.equal(performanceScenarioPipelineSettleTimeoutMs('context_recover_steady'), 20_000);
  assert.equal(performanceScenarioPipelineSettleTimeoutMs('jump_asset_admission'), 30_000);

  const source = await readFile(new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url), 'utf8');
  assert.match(source,
    /pipelineSettleTimeoutMs:\s*performanceScenarioPipelineSettleTimeoutMs\(routeTag\)/,
    'the live sampler must consume the scenario-specific bounded envelope');
  assert.match(source, /pipelineStableMs\s*=\s*5_000/,
    'the repair may not shorten the required stable interval');
  assert.match(source, /pipelineSettleTimeoutMs\s*<=\s*30_000/,
    'the extended terminal envelope must remain fail-closed and bounded');
});

test('mining diagnostic stress is armed and stopped by one scenario journal', async () => {
  const priorWindow = globalThis.window;
  const events = [];
  const vector = (x = 0, y = 0, z = 0) => ({
    x, y, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; },
    copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; },
  });
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: vector(),
    prevPos: vector(),
    vel: vector(),
    rot: 0,
    prevRot: 0,
    flags: {},
  };
  const asteroid = { id: 2, type: 'asteroid', alive: true, data: { typeId: 'ast_metallic' } };
  const entities = new Map([[1, player], [2, asteroid]]);
  const vfxSystem = { _miningBeam: { active: false } };
  const state = {
    playerId: 1,
    player: { targetId: null },
    entities,
    entityList: [player, asteroid],
    timeScale: 1,
    world: { currentSectorId: 'sector_helios_prime' },
  };
  const sf = {
    state,
    helpers: { removeEntity: (id) => entities.delete(id) },
    registry: { get: (name) => (name === 'vfx' ? vfxSystem : null) },
    bus: {
      emit(name, payload) {
        events.push({ name, payload });
        if (name === 'mining:start') vfxSystem._miningBeam.active = true;
        if (name === 'mining:stop') vfxSystem._miningBeam.active = false;
      },
    },
  };
  const page = {
    evaluate: async (fn, arg) => fn(arg),
    waitForFunction: async (fn, arg) => {
      assert.equal(await fn(arg), true);
    },
  };
  globalThis.window = { SF: sf };
  try {
    const prepared = await preparePerformanceScenario(page, 'mining_tether_active');
    assert.equal(prepared.miningDiagnosticArmed, true);
    assert.equal(prepared.stateInjected, true);
    assert.equal(vfxSystem._miningBeam.active, true);

    const restored = await restorePerformanceScenario(page, 'mining_tether_active');
    assert.equal(restored.restored, true);
    assert.equal(restored.checks.miningDiagnosticStopped, true);
    assert.equal(vfxSystem._miningBeam.active, false);
    assert.deepEqual(events.map((event) => event.name), ['mining:start', 'mining:tick', 'mining:stop']);
  } finally {
    if (priorWindow === undefined) delete globalThis.window;
    else globalThis.window = priorWindow;
  }
});
