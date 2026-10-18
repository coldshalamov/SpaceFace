import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRunTransitionGuard } from '../../src/core/runTransitionGuard.js';
import { createTimeEffects } from '../../src/core/timeEffects.js';
import { resetCombatInputMode } from '../../src/core/newGameBoot.js';
import { laneCommandSink, laneSetMode } from '../../src/core/simLaneCommands.js';
import { GameStartReadinessError, describeGameStartFailure } from '../../src/core/newGameStartTransition.js';
import { holdOpeningPresentationUntilPaint } from '../../src/render/pipelineReadiness.js';
import { createAuthoritativeRuntime } from '../../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../../src/systems/ships.js';
import { encodeSavePayload } from '../../src/save/saveWorker.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../../src/data/featureFlags.js';

// Same source-execution seam as worker-continue-finalizer/continue-gpu-handover.
// The save owner, main's routing/finalizer/mode functions, native physics and all
// Node-safe production systems are real. Storage, paint and graphics verdicts
// are test ports. Nothing here is installed in production or proves a GPU frame.
const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
function section(first, next) {
  const a = main.indexOf(first), b = main.indexOf(next, a);
  assert.ok(a >= 0 && b > a, `current main owner contains ${first}`);
  return main.slice(a, b);
}
const finalizerSource = section('async function finalizeLoadedGame(', '\n\nconst _loadingClearColor');
const modeSource = section('function enterLoadingMode(', '\nasync function waitForAuthoredPartLibrary');
const routingSource = section('    helpers.deferLoadedGameRestore =', '    helpers.finalizeLoadedGame =');
export const nextHostTurn = () => new Promise(resolve => setImmediate(resolve));
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

export async function productionContinueFixture({ picture = async () => true, inputEnvelope = null } = {}) {
  const priorStorage = globalThis.localStorage;
  const priorFeatures = snapshotFeatureMaps();
  const values = new Map();
  globalThis.localStorage = {
    get length() { return values.size; }, key: i => [...values.keys()][i] ?? null,
    getItem: k => values.get(String(k)) ?? null,
    setItem: (k, v) => { values.set(String(k), String(v)); },
    removeItem: k => { values.delete(String(k)); },
  };
  const helpers = {}, guard = createRunTransitionGuard();
  let runtime;
  const errors = [], events = [], loadCalls = [];
  const testConsole = { ...console, error: (...args) => errors.push(args) };
  const deps = {
    resetCombatInputMode, createTimeEffects, laneCommandSink, laneSetMode,
    GameStartReadinessError, describeGameStartFailure, holdOpeningPresentationUntilPaint,
    // Presentation ports, deliberately outside the Node manifest.
    releaseUiStage() {}, _loadingClearColor: {}, nextFrame: nextHostTurn,
    nextPaintSliced: nextHostTurn, nowMs: () => performance.now(),
    startLoadingGatePulse: () => () => {}, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS: 20000,
    waitForAuthoredPartLibrary: async () => true,
    authoredCriticalVisualReadiness: () => ({ openingPending: [] }),
    waitForInitialAuthoredVisualsWithRetry: async () => true,
    waitForRequiredOpeningPicture: picture, SF_DEBUG: false, console: testConsole,
    // Keep main's actual20-second deadline; its losing timer must not retain Node.
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref?.(); return timer; },
  };
  const finalize = new Function(...Object.keys(deps),
    `${modeSource}\n${finalizerSource}\nreturn finalizeLoadedGame;`)(...Object.values(deps));
  const close = () => {
    guard.begin('headless-fixture-close');
    runtime?.state.render?.cancelOpeningPresentationHold?.();
    runtime?.dispose();
    restoreFeatureMaps(priorFeatures);
    if (priorStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = priorStorage;
  };
  try {
    runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 424214, helpers });
    // Match the shipping dedicated Node sim realm (simWorkerHost.handleInitProduction):
    // save callbacks also run between steps, outside runtime's restore-on-step wrapper.
    applyFeatureConfigToMaps(runtime.config.features);
    const { state, bus } = runtime;
    const registry = { get: name => runtime.getSystem(name) };
    new Function('helpers', 'bus', 'state', 'runTransitionGuard', 'nextFrame', 'ruckusWarmReady', 'console', routingSource)(
      helpers, bus, state, guard, nextHostTurn, Promise.resolve(), testConsole,
    );
    let finalizerPromise = null, finalizerCalls = 0;
    helpers.finalizeLoadedGame = payload => {
      finalizerCalls++;
      assert.equal(state.mode, 'loading');
      assert.equal(registry.get('physics')._nativeRestorePending, false,
        'all save listeners and native adoption precede main finalization');
      finalizerPromise = finalize(state, bus, registry, guard, payload);
      return finalizerPromise;
    };
    for (const name of ['save:loaded', 'save:error', 'game:startFailed', 'ui:closeAll', 'game:loadingProgress']) {
      bus.on(name, payload => events.push({ name, tick: state.tick, mode: state.mode,
        payload: Object.fromEntries(['slot', 'reason', 'error', 'code', 'stage', 'region', 'id', 'visualGatePending']
          .filter(k => payload?.[k] !== undefined).map(k => [k, payload[k]])) }));
    }
    // Separate production-authored test setup. It does not modify or continue an
    // accepted runtime checkpoint, and makes no earning/refill/navigation claim.
    const saves = registry.get('save');
    let envelope = inputEnvelope;
    if (!envelope) {
      state.mode = 'flight';
      const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', {
        isPlayer: true, player: state.player, pos: { x: 0, z: 0 }, fittings: [],
      }));
      state.playerId = player.id;
      const world = registry.get('world');
      world.enterSector('sector_tethys_junction');
      world.relocatePlayerInSector({ x: 15700, z: 6500 }, { reason: 'test:production-continue' });
      assert.equal(await registry.get('physics').prepareBackend(state), true);
      runtime.step(); // one setup tick, not an accepted checkpoint or route segment
      envelope = saves.serialize('production-continue');
      assert.equal(envelope.data.chronicler.schemaVersion, 1);
      assert.ok(envelope.data.sites.anvilOrchard);
    }
    const loadStarted = deferred();
    let loadPromise;
    const originalLoad = saves.load;
    saves.load = function (...args) {
      loadCalls.push(args);
      loadPromise = Promise.resolve(originalLoad.apply(this, args));
      loadStarted.resolve();
      return loadPromise;
    };
    return {
      runtime, state, bus, registry, saves, envelope, events, errors, loadCalls, close,
      finalizerCalls: () => finalizerCalls,
      finalization: () => finalizerPromise,
      async load(data = envelope) {
        const { data: body, checksum: _checksum, ...descriptor } = data;
        values.set('sf.save.quick', encodeSavePayload({ descriptor, data: body }).json);
        // The title's Continue action emits this same public event and selected slot.
        // The real main defer hook makes save.load choose its paced Continue path.
        bus.emit('game:load', { slot: 'quick' });
        await loadStarted.promise;
        return loadPromise;
      },
    };
  } catch (error) { close(); throw error; }
}
