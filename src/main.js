// Boot sequence (ARCHITECTURE §1.3). Builds state + bus + registry, inits all systems, starts a
// flight scene, and runs the loop. The skeleton bootstraps a playable scene directly; once the
// save system is implemented it owns newGame() and this delegates to it.
import * as THREE from 'three';
import { createGameState } from './core/gameState.js';
import { clearEntityRuntime } from './core/entity.js';
import { bootstrapProfileSettingsBeforeRegistry } from './core/graphicsProfileBootstrap.js';
import { createBus } from './core/eventBus.js';
import { createRegistry } from './core/registry.js';
import { startLoop } from './core/loop.js';
import { createPresentationJournal } from './core/presentationJournal.js';
import { createPresentationRuntimeCloser } from './core/presentationRunner.js';
import { canonicalStringify } from './core/simSnapshot.js';
import { installLiveClipDirector } from './ui/screens/clips.js';
import { makeShipEntitySpec } from './systems/ships.js';
import { makeEnemySpawnSpec } from './systems/combat.js';
import { NEW_GAME, resolveNewGameStarter } from './data/newGameDefaults.js';
import { listUserMods, hasUserContent, userContentDirLabel } from './data/userContent.js';
import { createTelemetry } from './systems/telemetry.js';
import { installAchievements } from './systems/achievements.js';
import { createDeterministicEventTrace } from './core/eventTrace.js';
import { createTimeEffects } from './core/timeEffects.js';
import { resetFreshRunSystems } from './core/runReset.js';
import { createRunTransitionGuard } from './core/runTransitionGuard.js';
import {
  describeGameStartFailure,
  GameStartReadinessError,
  runNewGameStartTransition,
} from './core/newGameStartTransition.js';
import { applyAccessibility } from './ui/accessibility.js';
import { ensureStylesheet as ensureStationStylesheet } from './ui/station/stationStyles.js';
import { createLoadingPresenter } from './ui/loadingPresenter.js';
import { createRuntimeFailurePresenter } from './ui/runtimeFailurePresenter.js';
import { authoredCriticalVisualReadiness, isAuthoredPartLibraryUsable } from './render/partsLibrary.js';
import { settleOpeningCompositionTail } from './render/precompile.js';
import {
  settleRequiredPackageAdmission,
  waitForCurrentRenderPipelines as waitForRenderPipelineWarmup,
  waitForOpeningGpuResources,
} from './render/pipelineReadiness.js';
import { shouldAwaitOpeningGpuCook } from './render/renderCapabilityProfile.js';
import { releaseUiStage } from './render/uiStage.js';
import {
  SCENARIO_47A_CONTRACT_PATH,
  mark47aPlayerActor,
  spawn47aOpeningScene,
} from './data/scenarios/47aLiveScene.js';
import { defaultShipAppearance } from './core/shipAppearance.js';

// Debug surfaces (the mutable window.SF handle + boot logs) are exposed outside production bundles.
// Launcher URLs stay identical for browser/Electron; release/debug behavior must not fork gameplay.
const SF_DEBUG = typeof __SPACEFACE_PRODUCTION__ !== 'undefined'
  ? !__SPACEFACE_PRODUCTION__
  : debugRuntimeEnabled();
const INITIAL_AUTHORED_VISUAL_TIMEOUT_MS = 180000;
// One bounded second window before declaring startup failure. Staging pipelines keep
// running between waits, so a transient stall (host contention, driver-variant compile
// burst) resolves inside a short retry; a persistent stall still fails quickly. Kept
// short so the app-side worst case stays inside the route's own load bound.
const AUTHORED_VISUAL_RETRY_TIMEOUT_MS = 30000;

function debugRuntimeEnabled() {
  const env = typeof process !== 'undefined' && process.env ? process.env : null;
  if (env && env.NODE_ENV === 'production') return false;
  return true;
}

// Global error boundary. Without this, an uncaught runtime exception or an unhandled promise
// rejection dies silently to the console — invisible to the player (who sees a frozen game) and
// easy to miss in dev. This surfaces BOTH as a console error (preserved for devtools) AND as a
// player-visible toast via the bus once the game is running, so a failure is never silent.
// Idempotent + defensive: the boundary itself must never throw (it guards everything else).
function installGlobalErrorBoundary() {
  if (typeof window === 'undefined' || window.__sfErrorBoundary) return;
  window.__sfErrorBoundary = true;
  let lastToastAt = 0;
  let toastCount = 0;
  const surface = (label, err) => {
    // Console always gets the full error (devtools is the source of truth).
    try { console.error('[SpaceFace]', label, err); } catch (_) {}
    // Debounce the toast: at most one per second, and collapse a burst into a count.
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    if (now - lastToastAt < 1000) { toastCount++; return; }
    const burst = toastCount > 0 ? ` (${toastCount + 1} errors)` : '';
    toastCount = 0; lastToastAt = now;
    try {
      const sf = window.SF;
      if (sf && sf.bus && typeof sf.bus.emit === 'function') {
        sf.bus.emit('toast', { text: 'Something went wrong — see console.' + burst, kind: 'warn', ttl: 5 });
      }
    } catch (_) { /* game may not be up yet; the console log is enough */ }
  };
  try {
    window.addEventListener('error', (ev) => {
      // ev.error is the thrown value for uncaught exceptions; ev.message is the fallback.
      surface('uncaught error', ev && (ev.error || ev.message));
    });
    window.addEventListener('unhandledrejection', (ev) => {
      // ev.reason is the rejection value (an Error, a string, or anything thrown).
      surface('unhandled rejection', ev && (ev.reason && ev.reason.message ? ev.reason : (ev.reason || ev)));
    });
  } catch (_) { /* if addEventListener is unavailable, the console path above still runs */ }
}

async function boot() {
  installGlobalErrorBoundary();
  try {
    // Kick the scenario-contract fetch+hash at boot top: it is consumed only at helpers
    // construction below, so the fetch RTT overlaps everything in between instead of
    // serializing ahead of registry init.
    const contractPromise = loadScenarioContract(
      new URL('./data/scenarios/47a.scenario.json', import.meta.url), SCENARIO_47A_CONTRACT_PATH);
    // Belt: a rejection surfacing before the real await below still counts as handled (a boot
    // error thrown earlier would otherwise leave it as an unhandled rejection).
    contractPromise.catch(() => {});
    const seed = (Date.now() & 0x7fffffff) >>> 0;
    const state = createGameState(seed);
    // Renderer/VFX are initialized before the save system in registry order. Consume the persisted
    // profile first so their boot resources match the player's settings on the very first frame.
    // This is read-only and therefore leaves the raw profile byte-identical.
    bootstrapProfileSettingsBeforeRegistry(state);
    // Phase 2: seed gameplay feature MAPS from the explicit production runtime profile (not
    // typeof window). createRegistry also re-applies from state.settings.gameplay.runtimeProfile.
    if (!state.settings.gameplay) state.settings.gameplay = {};
    if (!state.settings.gameplay.runtimeProfile) state.settings.gameplay.runtimeProfile = 'production';
    const timeEffects = createTimeEffects(state);
    const runTransitionGuard = createRunTransitionGuard();
    timeEffects.set('runtime:boot-menu', { scale: 0 });
    const bus = createBus();
    // PQ-160.01: rated moments mark clip windows on the live bus so Pause → Clips lists them.
    // Production entity:killed has no tick; stamp sim tick + world seed onto the receipt.
    installLiveClipDirector(bus, {
      seedOf: () => state && state.meta && state.meta.seed,
      tickOf: () => state && state.tick,
    });
    const presentationJournal = createPresentationJournal();
    const loadingPresenter = createLoadingPresenter({ document, bus, state });
    const failurePresenter = createRuntimeFailurePresenter({ document });
    bus.emit('game:loadingProgress', { id: 'boot-contract', progress: .18, ceiling: .20,
      label: 'Preparing flight systems', detail: 'Reading the opening scenario' });
    const contract = await contractPromise;
    const helpers = {
      scenarioContract: contract.document,
      scenarioContractPath: contract.path,
      scenarioContractHash: contract.sha256,
    };
    const ctx = {
      state,
      bus,
      three: THREE,
      registry: null,
      helpers,
      timeEffects,
      presentationJournal,
    };

    const registry = createRegistry(ctx);
    ctx.registry = registry;
    const bootInitMetrics = await registry.initAsync({
      budgetMs: 4,
      onProgress({ completed, total }) {
        bus.emit('game:loadingProgress', {
          id: 'boot-systems', progress: .20 + .72 * (total ? completed / total : 1), ceiling: .94,
          label: 'Initializing flight systems', detail: `${completed} of ${total} systems initialized`,
        });
      },
    });
    SF_DEBUG_ONLY: if (SF_DEBUG) window.__SF_BOOT_INIT__ = bootInitMetrics;
    // Kick SG-02 backend bring-up the moment the saved envelope decodes: the whole chunked
    // restore then overlaps WASM boot instead of the D26 gate waiting on a cold start.
    // Boot-time only — a mid-flight restore keeps the finalize-time kick so the live
    // authority is never re-armed under the running sim. finalizeLoadedGame adopts the
    // promise below (and kicks itself if this lane never ran).
    let earlyContinuePhysicsPrep = null;
    bus.on('save:envelopePrepared', () => {
      if (state.mode === 'flight') return;
      const physicsSystem = registry.get('physics');
      if (!physicsSystem || typeof physicsSystem.prepareBackend !== 'function') return;
      // Only a cold authority may prep early: with an owner already resolved, prepareBackend
      // would sync+step the outgoing run's entities before the restore swaps them. Module
      // init is the whole point of the early kick, and it already runs whenever no owner
      // exists. The finalize-time non-reset prep then does the first real sync against the
      // restored world exactly as before.
      if (typeof physicsSystem.hasResolvedSg02Owner === 'function'
          && physicsSystem.hasResolvedSg02Owner()) return;
      earlyContinuePhysicsPrep = Promise.resolve()
        .then(() => physicsSystem.prepareBackend(state));
      earlyContinuePhysicsPrep.catch(() => {});
    });
    helpers.deferLoadedGameRestore = (restore) => {
      bus.emit('game:loadingProgress', {
        id: 'restoring-save',
        progress: 0.05,
        label: 'Restoring flight state',
        detail: 'Rebuilding the saved sector',
        transition: 'continue',
      });
      // One rAF boundary: the 0.05 emit rides the presenter's own paint loop, so the
      // restore only needs to leave this task — the double-rAF paint commit added ~16-33 ms
      // of dead time before the slot scans and worker dispatch could even start.
      nextFrame().then(restore).catch((error) => {
        console.error('[SpaceFace] deferred save restore failed', error);
        bus.emit('save:error', { slot: 'latest', reason: 'load_failed' });
      });
      return true;
    };
    helpers.beginLoadedGameTransition = () => {
      // Reserve the load token BEFORE any reentrant lifecycle event. bus.emit is synchronous, so a
      // listener on game:loadingProgress that starts a new-game transition would otherwise take the
      // generation first and the save restore would proceed under a token it no longer owns.
      const token = runTransitionGuard.begin('load');
      bus.emit('game:loadingProgress', {
        id: 'restoring-save',
        progress: 0.05,
        label: 'Restoring flight state',
        detail: 'Rebuilding the saved sector',
      });
      return token;
    };
    helpers.finalizeLoadedGame = (payload) => {
      const inherited = earlyContinuePhysicsPrep;
      earlyContinuePhysicsPrep = null;
      return finalizeLoadedGame(
        state,
        bus,
        registry,
        runTransitionGuard,
        { ...(payload || {}), physicsPrep: inherited },
      );
    };
    let loopController = null;
    const closeRuntime = createPresentationRuntimeCloser({
      stopPresentation() {
        const errors = [];
        try { loadingPresenter.destroy(); } catch (error) { errors.push(error); }
        try { loopController?.stop?.(); } catch (error) { errors.push(error); }
        if (errors.length > 0) {
          throw new AggregateError(errors, 'Presentation listener teardown failed');
        }
      },
      detachProducers: () => registry.destroy(),
      closeSimulation: () => loopController?.close?.(),
      closeJournal: () => presentationJournal.close(),
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        const receipt = closeRuntime();
        if (receipt.errorCount > 0) {
          console.error('[SpaceFace] runtime teardown completed with errors:', receipt.errors);
        }
        failurePresenter.destroy();
      });
    }

    // Local telemetry sink (privacy-safe, no network): onboarding funnel, balance/career stats,
    // death heatmap. Subscribes to the live bus; mirrored to window.__SF_TELEMETRY__ for dev.
    const telemetry = createTelemetry(bus, state);
    ctx.telemetry = telemetry;
    // PQ-033.03 achievements: a META ledger on the same live bus — never a registry system and never
    // a GameState write, so the deterministic sim cannot see it. It unlocks from real gameplay events
    // and the settled Crucible records, speaks through the one-voice arbiter, and mirrors unlocks to
    // Steam when the desktop shell exposes it.
    ctx.achievements = installAchievements({ bus, state, telemetry });
    const eventTrace = createDeterministicEventTrace(bus, state);
    // Apply accessibility settings (colorblind palette, motion/flash, UI scale) on boot + on change/load.
    applyAccessibility(state.settings);
    bus.on('settings:changed', () => applyAccessibility(state.settings));
    bus.on('save:loaded', () => applyAccessibility(state.settings));
    // Ledger D15: the station sheet set used to arrive at first dock, so every screen rendered
    // differently before vs after docking once. Loading it at boot keeps the cascade identical
    // regardless of dock history; stationStyles positions it after the Deckplate sheet, matching
    // the order dock-time injection produced.
    ensureStationStylesheet();
    // PQ-210.07: the one-time motion ask lives on the boot route as the motionAsk screen
    // (uiRoot routes the first screen through firstBootScreenId). Reconciled over INF-007's
    // boot-time DOM prompt so the ask is a real screen, not an unstyled overlay — exactly one
    // ask surface, settled by the same motionAsked/motionPrompted markers.

    // If the save system implements newGame(), let it own world setup; else use the skeleton bootstrap.
    // Boot to the MAIN MENU. uiRoot shows it automatically because state.mode === 'menu' (the
    // gameState default). The world is created on New Game (game:new) and restored on Continue
    // (the save system handles game:load and emits save:loaded).
    bus.on('game:new', (opts) => {
      const startNewGameTransition = () => {
        const transitionToken = runTransitionGuard.begin('new-game');
        if (state.render) state.render.admissionRunGeneration = transitionToken.generation;
        startNewGame(
          state, helpers, bus, registry, runTransitionGuard, transitionToken, opts || {},
        ).catch((error) => {
          if (!runTransitionGuard.isCurrent(transitionToken)) return;
          console.error('[SpaceFace] new game startup failed', error);
          const failure = describeGameStartFailure(error);
          failGameStart(
            state, bus, error, failure.text,
            runTransitionGuard, transitionToken, failure,
          );
        });
      };
      const saveSystem = registry.get('save');
      if (saveSystem && typeof saveSystem.deferRunTransition === 'function'
        && saveSystem.deferRunTransition(startNewGameTransition)) return;
      startNewGameTransition();
    });

    bus.on('game:exitToMenu', () => {
      const previousMode = state.mode;
      state.mode = 'menu';
      if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
    });

    loopController = startLoop(state, registry, {
      presentationJournal,
      onSimulationFailure(failure) {
        const receipt = closeRuntime();
        if (receipt.errorCount > 0) {
          console.error('[SpaceFace] runtime teardown completed with errors:', receipt.errors);
        }
        failurePresenter.show(failure);
      },
    });
    ctx.simStep = () => loopController.stepOnce();
    const loopDebug = {
      getDiagnostics: () => loopController.getDiagnostics(),
      getLifecycleState: () => loopController.getLifecycleState(),
      isSuspended: () => loopController.isSuspended(),
      simStep: () => loopController.stepOnce(),
    };
    SF_DEBUG_ONLY: if (SF_DEBUG) window.SF = Object.assign(window.SF || {}, {
      state, bus, registry, ctx, helpers, timeEffects, THREE, telemetry, eventTrace, loop: loopDebug,
    });
    // The title route must become usable promptly. Heavy shader/asset warmup is sector-scoped in
    // renderer.js once a run exists; running the all-archetype precompile here competes with the
    // New Game authored-visual queue and can strand Launch in loading on software WebGL.
    state.render.pipelinePrecompileReady = Promise.resolve({ skipped: true, reason: 'deferred until first sector' });
    // Route through the presenter, not a direct DOM toggle: it owns the overlay's lifecycle —
    // on hide it also stops and destroys the boot artwork's worker/WebGL2 context, which
    // otherwise kept rendering into the hidden canvas for the rest of the session.
    bus.emit('game:loadingProgress', { id: 'boot-menu', progress: .96, ceiling: .997,
      label: 'Opening the command deck', detail: 'Flight systems initialized' });
    await nextPaint();
    loadingPresenter.hide();

    // expose for debugging and the dev observe loop (dev/browser only — stripped from packaged builds)
    SF_DEBUG_ONLY: if (SF_DEBUG) {
      window.SF = Object.assign(window.SF || {}, {
        state, bus, registry, ctx, helpers, timeEffects, THREE, telemetry, eventTrace, loop: loopDebug,
      });
      // Expose the game's OWN authored-visual readiness contract to acceptance harnesses.
      // Without this a harness cannot ask "are the visuals that matter ready?" and is forced to
      // reinvent the check from entity internals — which is exactly how the professional-travel
      // route came to demand `ships.every(authoredAssetState === 'authored')`, a condition the
      // engine deliberately never satisfies (distant NPCs stay dormant by design, pinned by
      // test/asset-npc-authored-binding.test.mjs). Publishing the real contract is what stops
      // that divergence recurring: harnesses consume this, they do not re-derive it.
      window.SF.authoredVisualReadiness = () => authoredVisualReadiness(state);
      // PQ-172.00: user content packs validated+merged at module-eval time — the settings
      // Gameplay tab is the player-facing list; this is the probe/diagnostic surface.
      window.SF.userMods = { list: listUserMods, dir: userContentDirLabel() };
      // Phase 4 test-only live-route stepping bridge. Dynamic import lives inside SF_DEBUG_ONLY so
      // production dropLabels strips the call and the bridge module never enters build/web.
      import('./testing/lab/liveRouteBridge.js').then((mod) => {
        try {
          window.SF.labBridge = mod.installLiveRouteBridge(window.SF);
        } catch (err) {
          console.error('[SpaceFace] labBridge install failed', err);
        }
      }).catch((err) => console.error('[SpaceFace] labBridge import failed', err));
      // Comprehensive performance tools bootstrap (stats-gl, spector.js, renderer.info).
      import('./testing/perf/perfToolsBootstrap.js').then((mod) => {
        try {
          mod.bootstrapPerfTools(window.SF);
        } catch (err) {
          console.error('[SpaceFace] perfToolsBootstrap install failed', err);
        }
      }).catch((err) => console.error('[SpaceFace] perfToolsBootstrap import failed', err));
      console.log('[SpaceFace] booted -> main menu. seed=%d', seed);
      if (hasUserContent()) {
        const mods = listUserMods();
        const loaded = mods.filter((m) => m.status !== 'rejected' && m.status !== 'invalid').length;
        const refused = mods.length - loaded;
        console.log('[SpaceFace] user content: %d pack(s) from %s%s', mods.length,
          userContentDirLabel() || '(mounted dir)', refused ? ` (${refused} with refusals)` : '');
      }
    }

    // Dev-only ship turntable preview: ?dev=shippreview renders every hull × tier into .devshots/
    // for visual verification. Requires the render system to be initialized, so we wait a frame.
    SF_DEBUG_ONLY: if (SF_DEBUG && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'shippreview') {
      const { runShipPreview } = await import('./render/shipPreview.js');
      // ensure the render system has registered its scene/renderer handles on state.render
      setTimeout(() => { runShipPreview({ state, registry, THREE }).catch((e) => console.error('[shipPreview]', e)); }, 500);
    }
    // Dev-only fleet look harness: ?dev=fleetlook exposes window.SF_fleetLook (scripts/fleet-look.mjs).
    SF_DEBUG_ONLY: if (SF_DEBUG && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'fleetlook') {
      const { installFleetLook } = await import('./render/fleetLook.js');
      setTimeout(() => { try { installFleetLook({ state, registry, THREE }); } catch (e) { console.error('[fleetLook]', e); } }, 500);
    }
    // Dev-only single-frame Kestrel hero capture: ?dev=shipshot renders the player Kestrel once (no
    // rAF loop, so it's robust under headless Chrome) and POSTs kestrel_hero_live.jpg to /__shot.
    SF_DEBUG_ONLY: if (SF_DEBUG && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'shipshot') {
      const { runShipShot } = await import('./render/shipShot.js');
      setTimeout(() => { runShipShot({ state, registry, THREE }).catch((e) => console.error('[shipShot]', e)); }, 500);
    }
    // Dev-only asteroid-interior LOOK LAB: renders the drill/works cutaway in the real 3D engine to
    // judge congruence vs the flat Canvas2D playfield. Exposed as a callable so a capture harness can
    // start a run first (for the baked nebula env), and auto-run on ?dev=astlab for hand inspection.
    SF_DEBUG_ONLY: if (SF_DEBUG) {
      window.SF = Object.assign(window.SF || {}, {
        runAsteroidLab: () => import('./render/asteroidInteriorPreview.js')
          .then((m) => m.runAsteroidInteriorLab({ state })).catch((e) => { console.error('[astlab]', e); return null; }),
      });
      if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'astlab') {
        setTimeout(() => { window.SF.runAsteroidLab(); }, 800);
      }
    }
    // Dev-only DIRECT SCREEN ROUTE, for the look-first UI loop (docs/UI_VISUAL_ITERATION.md):
    //   ?dev=screen:pause              boot a deterministic session, open the pause screen
    //   ?dev=screen:settings,saveLoad  open a stack, in order
    //   ?dev=screen:pause&devseed=47   pin the run seed (the repo's canonical fixture seed)
    //   ?dev=screen:mainMenu           no session at all; just raise the meta screen
    // Reloading re-runs it, so "open it, click every control, look, fix, reload" costs one page
    // load instead of a scripted capture boot. That cheapness is the point: a screen should be as
    // easy to look at as a web page, because the failure this route exists to prevent is an agent
    // restyling a screen it never actually looked at.
    SF_DEBUG_ONLY: if (SF_DEBUG && typeof location !== 'undefined') {
      const devQuery = new URLSearchParams(location.search);
      const devRoute = devQuery.get('dev') || '';
      if (devRoute.startsWith('screen:')) {
        console.log('[SpaceFace] dev screen route armed:', devRoute);
        const wantedScreens = devRoute.slice('screen:'.length)
          .split(',').map((value) => value.trim()).filter(Boolean);
        const devSeed = Number(devQuery.get('devseed'));
        const wantsWorld = wantedScreens.some((id) => id !== 'mainMenu' && id !== 'title');
        const opened = new Set();
        const logFailure = () => {
          const ui = registry.get('ui');
          console.error('[SpaceFace] dev screen route could not open:',
            wantedScreens.filter((id) => !opened.has(id)).join(', '),
            '| ui entry keys:', ui ? Object.keys(ui).slice(0, 12).join(',') : 'none');
        };
        // uiRoot owns screen navigation (`ui:pushScreen` → screenManager.pushScreen), and the
        // fixtures use exactly this event. The manager is only a fallback for a boot that lands
        // before uiRoot has bound its listeners.
        const attemptOpen = (attempt = 0) => {
          if (attempt === 0) console.log('[SpaceFace] dev screen route: opening', wantedScreens.join(', '));
          for (const id of wantedScreens) {
            if (!opened.has(id)) bus.emit('ui:pushScreen', { id, source: 'dev-screen-route' });
          }
          setTimeout(() => {
            for (const id of wantedScreens) {
              if (document.querySelector(`[data-screen="${id}"]`)) opened.add(id);
            }
            if (wantedScreens.every((id) => opened.has(id))) { console.log('[SpaceFace] dev screen route: open', [...opened].join(', ')); return; }
            if (attempt === 0) {
              const ui = registry.get('ui');
              const manager = ui && (ui.screenManager || ui.manager);
              if (manager && typeof manager.pushScreen === 'function') {
                for (const id of wantedScreens) {
                  if (opened.has(id)) continue;
                  try { manager.pushScreen(id); } catch (error) { console.error('[SpaceFace] dev screen open failed:', id, error); }
                }
              }
            }
            if (attempt >= 3) { logFailure(); return; }
            attemptOpen(attempt + 1);
          }, 1100);
        };
        let devTicks = 0;
        const reachWantedScreen = () => {
          devTicks += 1;
          if (!wantsWorld) { attemptOpen(); return; }
          if (state.mode === 'flight' || state.mode === 'paused') {
            // One presented frame of the held world before the screen stands on it.
            setTimeout(() => attemptOpen(), 700);
            return;
          }
          if (devTicks < 2400) setTimeout(reachWantedScreen, 100); // ~4 min, then the log speaks
          else console.error('[SpaceFace] dev screen route gave up waiting for a run: mode =', state.mode);
        };
        setTimeout(() => {
          if (wantsWorld) {
            bus.emit('game:new', Number.isFinite(devSeed) && devSeed > 0 ? { seed: devSeed } : {});
          }
          reachWantedScreen();
        }, 300);
      }
    }
  } catch (err) {
    showBootError(err);
    throw err;
  }
}

// Minimal playable scene so the engine is verifiable before subsystems exist:
// player ship + a station + an asteroid ring.
async function bootstrapScene(state, helpers, bus, registry, options = {}) {
  const owned = state.player.ownedShips[state.player.activeShipIndex] || null;
  const shipId = (owned && owned.defId) || NEW_GAME.shipId || 'ship_kestrel';
  const fittings = (owned && owned.fittings) || [];
  const playerSpec = makeShipEntitySpec(shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player, fittings,
    appearance: owned && owned.appearance,
    livingHull: owned && owned.livingHull,
    pos: { x: 0, z: 0 },
  });
  const player = helpers.spawnEntity(playerSpec);
  state.playerId = player.id;
  mark47aPlayerActor(player);
  state.player.credits = NEW_GAME.credits || 5000;
  const ships = registry.get('ships');
  if (ships && typeof ships.recomputeActiveShip === 'function') ships.recomputeActiveShip();

  // World owns sector contents: it spawns stations, asteroid fields, enemies, and POIs from data.
  const world = registry.get('world');
  if (world && typeof world.enterSector === 'function') {
    world.enterSector(NEW_GAME.startingSectorId || NEW_GAME.startSectorId || 'sector_helios_prime');
  } else {
    // fallback: a single station + asteroid ring so the build is still playable
    helpers.spawnEntity({ type: 'station', factionId: 'faction_scn', pos: { x: 280, z: -140 }, radius: 42, mass: 1e6, hull: 1e6, hullMax: 1e6, data: { stationId: 'station_helios', dockRadius: 72, services: ['market', 'shipyard', 'missions'] } });
    for (let i = 0; i < 12; i++) { const a = (Math.PI * 2 * i) / 12; const r = 360 + state.rng() * 200; helpers.spawnEntity({ type: 'asteroid', pos: { x: Math.cos(a) * r, z: Math.sin(a) * r }, radius: 12, mass: 500, hull: 240, hullMax: 240, data: { typeId: 'ast_rock', oreHP: 240, oreHPMax: 240 } }); }
  }
  // Split the two heaviest scene-build halves so the 'preparing' stage gets a paint between
  // world regen and opening composition instead of one frozen monolith.
  if (typeof options.yield === 'function') await options.yield();
  spawn47aOpeningScene({ state, helpers, liveColdStartSafe: true });
}

// Start a fresh game from the main menu: clear any prior world, build the new one, enter flight.
async function startNewGame(state, helpers, bus, registry, runTransitionGuard, transitionToken, opts) {
  const newGamePlus = resolveNewGamePlusOverlay(registry, opts);
  // The dynamic authority's bring-up (Rapier WASM compile + world construction) is pure CPU
  // work with no dependency on authored assets or the GPU cook. Kicked at scenePrepared it
  // overlaps the whole readiness chain instead of sitting as a serial stage at the end;
  // waitForPhysics below still gates flight on the same promise.
  let physicsPrep = null;
  return runNewGameStartTransition({
    guard: runTransitionGuard,
    token: transitionToken,
    async prepareRun() {
      for (const e of [...state.entityList]) {
        clearEntityRuntime(e);
        bus.emit('entity:destroyed', { id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId });
        if (!runTransitionGuard.isCurrent(transitionToken)) return;
      }
      state.entities.clear(); state.entityList.length = 0; state.freeIds.length = 0; state.nextEntityId = 1; state.playerId = 0;

      resetRunState(state, opts || {});
      resetCombatInputMode(state, registry);
      enterLoadingMode(state, bus);
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      // Let the loading shell paint the "preparing" stage between the synchronous chunks —
      // the bar's smoothing loop only moves when the compositor gets a frame.
      await nextPaintSliced();
      if (!runTransitionGuard.isCurrent(transitionToken)) return;

      const resetCompleted = resetFreshRunSystems(registry, {
        afterEach: () => runTransitionGuard.isCurrent(transitionToken),
      });
      if (!resetCompleted || !runTransitionGuard.isCurrent(transitionToken)) return;
      // Many systems/VFX listen only to the legacy `game:newGame` alias. The public route emits
      // `game:new`; without this alias, titles, fragile cargo, cloak, and presentation caches
      // keep the previous run's instance state.
      bus.emit('game:newGame', { seed: state.meta && state.meta.seed, ...(opts || {}) });
      if (!runTransitionGuard.isCurrent(transitionToken)) return;

      const ships = registry.get('ships');
      if (ships && typeof ships.newGame === 'function') {
        ships.newGame();
      } else {
        state.player.ownedShips = [{ defId: NEW_GAME.shipId || 'ship_kestrel', fittings: [] }];
        state.player.activeShipIndex = 0;
        state.player.moduleInventory = [];
        state.player.researchedNodes = (NEW_GAME.researchedNodes || []).slice();
        state.player.researchPoints = NEW_GAME.researchPoints || 0;
      }
      if (!runTransitionGuard.isCurrent(transitionToken)) return;

      // PQ-156.00 — a starter pick rides game:new as opts.starter. ships.newGame() always
      // installs the legacy NEW_GAME ship, so the pick rewrites the active owned ship here,
      // before bootstrapScene spawns the player entity. Absent/unknown ids keep the legacy
      // defaults byte-for-byte; nothing about the pick is saved as a class or lock.
      applyStarterPick(state, ships, opts);
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      // Single-frame breath: a committed paint is reserved for the boundary just
      // before bootstrapScene — this one only needs to yield.
      await nextFrame();
      if (!runTransitionGuard.isCurrent(transitionToken)) return;

      if (newGamePlus) {
        if (!ships || typeof ships.grantModule !== 'function'
            || !ships.grantModule({
              defId: newGamePlus.keepsake.defId,
              reason: `new-game-plus:${newGamePlus.sourceEnding}`,
            })) {
          throw new GameStartReadinessError(
            'NEW_GAME_PLUS_UNAVAILABLE',
            'new-game-plus',
            'The selected New Run+ keepsake is no longer available.',
          );
        }
        const grudges = Array.isArray(newGamePlus.grudges) ? newGamePlus.grudges : [];
        if (grudges.length) {
          const aceMemory = registry.get('aceMemory');
          const applied = aceMemory && typeof aceMemory.applyNewGamePlusGrudges === 'function'
            ? aceMemory.applyNewGamePlusGrudges(grudges)
            : 0;
          if (applied !== grudges.length) {
            throw new GameStartReadinessError(
              'NEW_GAME_PLUS_UNAVAILABLE',
              'new-game-plus',
              'The selected New Run+ hunter history could not be restored.',
            );
          }
        }
      }
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      await nextPaintSliced();
      if (!runTransitionGuard.isCurrent(transitionToken)) return;

      // Create the canonical player and starting sector before readiness waits. This gives the
      // renderer real entity boundaries to upgrade while the route remains frozen in loading.
      await bootstrapScene(state, helpers, bus, registry, { yield: () => nextFrame() });
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      // Run-specific loadouts and arena placement must exist before visual/GPU admission.
      // Installing them on game:started prepares the wrong hull, then replaces it in flight.
      bus.emit('game:scenePrepared', {});
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      const physicsSystem = registry.get('physics');
      if (physicsSystem && typeof physicsSystem.prepareBackend === 'function') {
        // Fresh-run entities were just spawned while timeScale was 0; reset so no record
        // from a prior run's entity objects survives into the new world. The catch marker
        // only suppresses the unhandled-rejection window before waitForPhysics awaits it.
        physicsPrep = Promise.resolve()
          .then(() => physicsSystem.prepareBackend(state, { reset: true }));
        physicsPrep.catch(() => {});
      }
      const saveSystem = registry.get('save');
      if (saveSystem && typeof saveSystem.primeAutosaveCapture === 'function') {
        saveSystem.primeAutosaveCapture();
      }
      if (opts.name) state.player.name = opts.name;
      if (opts.difficulty) state.settings.gameplay.difficulty = opts.difficulty;
    },
    discardRun: () => discardPreparedNewGameScene(
      state, bus, runTransitionGuard, transitionToken,
    ),
    waitForLibrary: () => withLoadingGatePulse(
      bus, runTransitionGuard, transitionToken, 'new-game',
      'authored-library', 0.25, 'Loading the ships',
      (elapsed) => (elapsed > 8000 ? 'Still loading the ships' : 'Bringing the ships in for the first flight'),
      () => waitForAuthoredPartLibrary(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS),
    ),
    waitForVisuals: () => withLoadingGatePulse(
      bus, runTransitionGuard, transitionToken, 'new-game',
      'authored-visuals', 0.5, 'Building the opening scene',
      () => {
        const readiness = authoredCriticalVisualReadiness(state);
        const pending = readiness && Array.isArray(readiness.openingPending)
          ? readiness.openingPending.length
          : 0;
        return pending > 0
          ? `Placing ships and stations — ${pending} still staging`
          : 'Placing ships and stations before you arrive';
      },
      () => waitForInitialAuthoredVisualsWithRetry(
        state,
        INITIAL_AUTHORED_VISUAL_TIMEOUT_MS,
        () => runTransitionGuard.isCurrent(transitionToken),
        bus,
        'new-game',
      ),
    ),
    waitForWarmup: () => withLoadingGatePulse(
      bus, runTransitionGuard, transitionToken, 'new-game',
      'render-pipelines', 0.78, 'Preparing the visuals',
      (elapsed) => (elapsed > 8000 ? 'Still preparing the visuals' : 'Linking the first-flight render pipelines'),
      async () => {
        // Hardware+KHR awaits the 20s live-sector cook next. Do not also start
        // the 180s first-picture warmup on the same Intel context.
        if (shouldAwaitOpeningGpuCook({
          gpu: state.render && state.render.gpu,
          renderer: state.render && state.render.renderer,
        })) {
          return true;
        }
        // Software WebGL links programs on the main thread. Awaiting warmup here
        // keeps Launch on render-pipelines until the playable gate expires.
        void waitForRenderPipelineWarmup(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS).catch((error) => {
          console.warn('[startup] render pipeline warmup failed', error);
        });
        return true;
      },
    ),
    waitForGpuResources: () => withLoadingGatePulse(
      bus, runTransitionGuard, transitionToken, 'new-game',
      'gpu-resources', 0.9, 'Preparing the opening route',
      () => {
        const ledger = state.render && state.render.openingCookLedger;
        const rows = Array.isArray(ledger) ? ledger.filter((row) => row && row.step && row.step !== 'lane') : [];
        const done = rows.filter((row) => row.outcome === 'resolved' || row.outcome === 'skipped').length;
        return done > 0
          ? `Loading the opening stretch smoothly — ${done} warmup steps finished`
          : 'Loading the opening stretch smoothly';
      },
      async () => {
        // Hardware with KHR_parallel_shader_compile can link behind the loading
        // shell. Software WebGL links one program per bloomScene (1.3s+) with no
        // parallel compile, so an awaited cook holds Launch past the playable gate.
        const awaitCook = shouldAwaitOpeningGpuCook({
          gpu: state.render && state.render.gpu,
          renderer: state.render && state.render.renderer,
        });
        // PQ-210.02 — the composition-tail settle rides inside the cook now (both
        // transition paths get it), finishing the serial lane's open composes/
        // compiles/uploads while the shell still owns the picture.
        const cook = waitForOpeningGpuResources(state, 20000, { settleTail: awaitCook });
        if (!awaitCook) {
          void cook.catch((error) => {
            console.warn('[startup] opening GPU cook failed', error);
          });
          return true;
        }
        try {
          return await cook;
        } catch (error) {
          console.warn('[startup] opening GPU cook failed', error);
          return false;
        }
      },
    ),
    waitForPhysics: () => withLoadingGatePulse(
      bus, runTransitionGuard, transitionToken, 'new-game',
      'physics-authority', 0.94, 'Preparing flight dynamics',
      (elapsed) => (elapsed > 8000 ? 'Still preparing flight dynamics' : 'Waking the flight authority'),
      async () => {
        if (!physicsPrep) {
          const physicsSystem = registry.get('physics');
          if (!physicsSystem || typeof physicsSystem.prepareBackend !== 'function') return true;
          physicsPrep = Promise.resolve()
            .then(() => physicsSystem.prepareBackend(state, { reset: true }));
        }
        try {
          return await physicsPrep;
        } catch (error) {
          console.warn('[startup] physics backend preparation failed', error);
          return false;
        }
      },
    ),
    readPackageAdmission: () => (state.render && state.render.requiredPackageAdmission) || null,
    awaitSettledPackageAdmission: () => settleRequiredPackageAdmission(state),
    reportProgress: (stage) => bus.emit('game:loadingProgress', {
      ...stage,
      detail: loadingDetailForStage(stage),
      transition: 'new-game',
    }),
    yieldForPresentation: nextPaintSliced,
    enterFlight() {
      enterFlightMode(state, bus);
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      bus.emit('game:started', { newGamePlus });
      SF_DEBUG_ONLY: if (SF_DEBUG) console.log('[SpaceFace] new game started. entities=%d', state.entityList.length);
    },
  });
}

// PQ-156.00 — apply a New Game starter pick to the run's first owned ship. Runs inside
// startNewGame's prepareRun after ships.newGame() and before bootstrapScene, so the spawned
// player entity is the hull the player picked rather than a quick swap of it after spawn.
// The Hitch starter (or no pick) resolves to the legacy NEW_GAME hull and is left untouched.
function applyStarterPick(state, ships, opts) {
  const starter = resolveNewGameStarter(opts);
  if (!starter || starter.shipId === NEW_GAME.shipId) return;
  const p = state.player;
  const owned = p && Array.isArray(p.ownedShips) && p.ownedShips[p.activeShipIndex || 0];
  if (!owned) return;
  owned.defId = starter.shipId;
  owned.fittings = ships && typeof ships.fittingsFromDefaults === 'function'
    ? ships.fittingsFromDefaults(starter.shipId, starter.fittedModules || [])
    : [];
  owned.appearance = defaultShipAppearance(starter.shipId);
  // ships.newGame() already published a role packet for the legacy hull while the run is in
  // loading; the held briefing is replaced by this republish naming the hull actually picked.
  if (ships && typeof ships.publishActiveRoleContext === 'function') {
    ships.publishActiveRoleContext({ source: 'new_game', announce: true });
  }
}

function resolveNewGamePlusOverlay(registry, opts = {}) {
  const request = opts && opts.newGamePlus;
  if (!request) return null;
  const saveSystem = registry && typeof registry.get === 'function' ? registry.get('save') : null;
  const overlay = saveSystem && typeof saveSystem.prepareNewGamePlus === 'function'
    ? saveSystem.prepareNewGamePlus(request)
    : null;
  if (overlay) return overlay;
  throw new GameStartReadinessError(
    'NEW_GAME_PLUS_UNAVAILABLE',
    'new-game-plus',
    'The selected completed-run save is no longer available for New Run+.',
  );
}

function discardPreparedNewGameScene(state, bus, runTransitionGuard, transitionToken) {
  if (!runTransitionGuard.isCurrent(transitionToken)) return false;
  for (const entity of [...state.entityList]) {
    clearEntityRuntime(entity);
    bus.emit('entity:destroyed', {
      id: entity.id,
      type: entity.type,
      pos: { x: entity.pos.x, z: entity.pos.z },
      radius: entity.radius,
      factionId: entity.factionId,
    });
    if (!runTransitionGuard.isCurrent(transitionToken)) return false;
  }
  state.entities.clear();
  state.entityList.length = 0;
  state.freeIds.length = 0;
  state.nextEntityId = 1;
  state.playerId = 0;
  if (state.world) state.world.currentSectorId = null;
  return true;
}

// The long loading gates used to publish one stage event then stay silent for their whole
// bound — the shell read as frozen behind real work. This pulse re-emits a bounded detail
// heartbeat (≤1 update / 500 ms, only when the text actually changes) so the loading
// presenter keeps moving with honest, non-duplicated stage detail.
function startLoadingGatePulse(bus, runTransitionGuard, transitionToken, transition, id, progress, label, detailOf) {
  let lastText = null;
  const emit = () => {
    try {
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      const detail = detailOf();
      if (detail == null || detail === lastText) return;
      lastText = detail;
      bus.emit('game:loadingProgress', { id, progress, label, detail, transition });
    } catch (_) { /* the pulse is presentation-only; never let it break the gate */ }
  };
  const timer = setInterval(emit, 500);
  if (timer && typeof timer.unref === 'function') timer.unref();
  return () => clearInterval(timer);
}

function withLoadingGatePulse(bus, runTransitionGuard, transitionToken, transition, id, progress, label, detailOf, gate) {
  const startedMs = nowMs();
  const stop = startLoadingGatePulse(
    bus, runTransitionGuard, transitionToken, transition, id, progress, label,
    () => detailOf(nowMs() - startedMs),
  );
  let result;
  try {
    result = gate();
  } catch (error) {
    stop();
    throw error;
  }
  return Promise.resolve(result).finally(stop);
}

async function finalizeLoadedGame(state, bus, registry, runTransitionGuard, payload = {}) {
  const transitionToken = payload.transitionToken || runTransitionGuard.begin('load');
  if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
  resetCombatInputMode(state, registry);
  enterLoadingMode(state, bus);
  if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
  const startGatePulse = (id, progress, label, detailOf) => startLoadingGatePulse(
    bus, runTransitionGuard, transitionToken, 'continue', id, progress, label, detailOf,
  );
  // Kick the backend prepare so WASM/world bring-up overlaps the whole library/
  // visuals/GPU chain below — the same overlap New Game gets from its scenePrepared
  // kick. save:loaded already rebound the player record before this function ran,
  // so the non-reset prepare only needs to resolve before the D26 gate at the end.
  // save:envelopePrepared may already have started it at envelope decode (payload.physicsPrep)
  // — adopt that promise so a restore-time bring-up is never paid twice.
  let continuePhysicsPrep = payload.physicsPrep || null;
  if (!continuePhysicsPrep) {
    const physicsSystem = registry.get('physics');
    if (physicsSystem && typeof physicsSystem.prepareBackend === 'function') {
      continuePhysicsPrep = Promise.resolve()
        .then(() => physicsSystem.prepareBackend(state));
      continuePhysicsPrep.catch(() => {});
    }
  }
  try {
    bus.emit('game:loadingProgress', {
      id: 'authored-library',
      progress: 0.25,
      label: 'Loading the ships',
      detail: 'Bringing the saved sector back with its ships intact',
      transition: 'continue',
    });
    // Paint the stage boundary before the wait's synchronous prefix — the loader's easing
    // loop only moves when the compositor gets a frame.
    await nextPaintSliced();
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    const stopLibraryPulse = startGatePulse('authored-library', 0.25, 'Loading the ships', () => {
      const elapsed = nowMs() - gateStartedMs;
      return elapsed > 8000 ? 'Still loading the saved sector' : 'Bringing the saved sector back with its ships intact';
    });
    const gateStartedMs = nowMs();
    const libraryReady = await waitForAuthoredPartLibrary(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS);
    stopLibraryPulse();
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    if (!libraryReady) {
      throw new Error('Authored ship asset library did not preload after save load; refusing to enter flight with procedural fallback ships.');
    }
    bus.emit('game:loadingProgress', {
      id: 'authored-visuals',
      progress: 0.5,
      label: 'Building the opening scene',
      detail: 'Placing ships and stations before you arrive',
      transition: 'continue',
    });
    await nextPaintSliced();
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    const stopVisualsPulse = startGatePulse('authored-visuals', 0.5, 'Building the opening scene', () => {
      const readiness = authoredCriticalVisualReadiness(state);
      const pending = readiness && Array.isArray(readiness.openingPending)
        ? readiness.openingPending.length
        : 0;
      return pending > 0
        ? `Placing ships and stations — ${pending} still staging`
        : 'Placing ships and stations before you arrive';
    });
    const visualsReady = await waitForInitialAuthoredVisualsWithRetry(
      state,
      INITIAL_AUTHORED_VISUAL_TIMEOUT_MS,
      () => runTransitionGuard.isCurrent(transitionToken),
      bus,
    );
    stopVisualsPulse();
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    if (!visualsReady) {
      throw new Error('Loaded authored ship visuals did not become ready; refusing to enter flight with procedural fallback ships.');
    }
    bus.emit('game:loadingProgress', {
      id: 'render-pipelines',
      progress: 0.78,
      label: 'Preparing the visuals',
      detail: 'Warming up so the opening runs smooth',
      transition: 'continue',
    });
    // Single-frame breath: the gpu-resources boundary below still pays the full
    // paint before the cook — this one only needs to yield.
    await nextFrame();
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    if (!shouldAwaitOpeningGpuCook({
      gpu: state.render && state.render.gpu,
      renderer: state.render && state.render.renderer,
    })) {
      void waitForRenderPipelineWarmup(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS).catch((error) => {
        console.warn('[startup] continue pipeline warmup failed', error);
      });
    }
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    bus.emit('game:loadingProgress', {
      id: 'gpu-resources',
      progress: 0.9,
      label: 'Preparing the opening route',
      detail: 'Loading the opening stretch smoothly',
      transition: 'continue',
    });
    await nextPaintSliced();
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    {
      const awaitCook = shouldAwaitOpeningGpuCook({
        gpu: state.render && state.render.gpu,
        renderer: state.render && state.render.renderer,
      });
      const stopCookPulse = startGatePulse('gpu-resources', 0.9, 'Preparing the opening route', () => {
        const ledger = state.render && state.render.openingCookLedger;
        const rows = Array.isArray(ledger) ? ledger.filter((row) => row && row.step && row.step !== 'lane') : [];
        const done = rows.filter((row) => row.outcome === 'resolved' || row.outcome === 'skipped').length;
        return done > 0
          ? `Loading the opening stretch smoothly — ${done} warmup steps finished`
          : 'Loading the opening stretch smoothly';
      });
      const cook = waitForOpeningGpuResources(state, 20000, { settleTail: awaitCook });
      try {
        if (!awaitCook) {
          void cook.catch((error) => {
            console.warn('[startup] continue GPU cook failed', error);
          });
        } else {
          try {
            await cook;
          } catch (error) {
            console.warn('[startup] continue GPU cook failed', error);
          }
        }
      } finally {
        stopCookPulse();
      }
    }
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    {
      // Same D26 gate as New Game: the loaded world must enter flight only after the
      // SG-02 authority exists. No reset — save:loaded already rebound the retained
      // player record; the promise kicked at function top just resolves here.
      if (continuePhysicsPrep) {
        const physicsReady = await continuePhysicsPrep;
        if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
        if (physicsReady === false) {
          throw new Error('The dynamic physics backend did not initialize after save load; refusing to enter flight frozen in place.');
        }
      }
    }
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    bus.emit('game:loadingProgress', {
      id: 'entering-flight',
      progress: 0.96,
      label: 'Handing over flight control',
      detail: 'Final checks before handover',
      transition: 'continue',
    });
    runTransitionGuard.commit(transitionToken, () => {
      enterFlightMode(state, bus);
      if (!runTransitionGuard.isCurrent(transitionToken)) return;
      bus.emit('ui:closeAll', {});
      SF_DEBUG_ONLY: if (SF_DEBUG) console.log('[SpaceFace] loaded game entered flight. slot=%s', payload.slot || 'unknown');
    });
    return { stale: false };
  } catch (error) {
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    console.error('[SpaceFace] loaded game startup failed', error);
    failGameStart(
      state, bus, error, 'Loaded game assets failed to load. See console.',
      runTransitionGuard, transitionToken,
    );
    if (!runTransitionGuard.isCurrent(transitionToken)) return { stale: true };
    throw error;
  }
}

function resetCombatInputMode(state, registry) {
  if (!state || !state.input) return;
  state.input.autoFire = false;
  if (state.input.pursuitSlot) {
    state.input.pursuitSlot = {
      ...state.input.pursuitSlot,
      active: false,
      reason: 'runtime-reset',
      releasedTick: Number.isFinite(state.tick) ? state.tick : null,
    };
  }
  const assist = registry && typeof registry.get === 'function' ? registry.get('autoTargetAssist') : null;
  if (assist && assist._runtime) {
    assist._runtime.lastActive = false;
    assist._runtime.lastReason = 'runtime-reset';
  }
}

const _loadingClearColor = new THREE.Color();

function enterLoadingMode(state, bus) {
  const timeEffects = createTimeEffects(state);
  timeEffects.set('runtime:loading', { scale: 0 });
  const previousMode = state.mode;
  state.mode = 'loading';
  try { releaseUiStage('loading-started'); } catch (_) { /* stage may not be mounted */ }
  // The frozen canvas holds its last presented frame for the whole load. If any cover lifts a
  // beat before the first flight present, that frame is what shows — so make the held frame a
  // deliberate black, matching the veil, instead of whatever the menu era last drew.
  try {
    const renderer = state.render && state.render.renderer;
    if (renderer && typeof renderer.clear === 'function'
        && typeof renderer.getClearColor === 'function') {
      const prevAlpha = renderer.getClearAlpha();
      renderer.getClearColor(_loadingClearColor);
      renderer.setRenderTarget(null);
      renderer.setClearColor(0x000000, 1);
      renderer.clear(true, true, false);
      renderer.setClearColor(_loadingClearColor, prevAlpha);
    }
  } catch (_) { /* best effort — the shell still covers the handoff */ }
  if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
}

function enterFlightMode(state, bus) {
  const timeEffects = createTimeEffects(state);
  const previousMode = state.mode;
  state.mode = 'flight';
  timeEffects.clear('runtime:boot-menu');
  timeEffects.clear('runtime:loading');
  timeEffects.clear('runtime:start-failed');
  if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
}

function failGameStart(state, bus, error, text, runTransitionGuard = null, transitionToken = null, failure = null) {
  if (runTransitionGuard && !runTransitionGuard.isCurrent(transitionToken)) return false;
  const timeEffects = createTimeEffects(state);
  timeEffects.set('runtime:start-failed', { scale: 0 });
  timeEffects.clear('runtime:boot-menu');
  timeEffects.clear('runtime:loading');
  const previousMode = state.mode;
  state.mode = 'menu';
  if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
  if (runTransitionGuard && !runTransitionGuard.isCurrent(transitionToken)) return false;
  bus.emit('game:startFailed', {
    error: error && error.message ? error.message : String(error),
    ...(failure || {}),
  });
  bus.emit('toast', { text, kind: 'error', ttl: 8 });
  return true;
}

async function waitForAuthoredPartLibrary(state, timeoutMs = 20000) {
  const ready = state && state.render && state.render.authoredPartLibraryReady;
  if (!ready || typeof ready.then !== 'function') return false;
  const settlement = await Promise.race([
    ready.then(
      (value) => ({ settled: true, usable: isAuthoredPartLibraryUsable(value) }),
      () => ({ settled: true, usable: false }),
    ),
    delay(timeoutMs).then(() => ({ settled: false, usable: false })),
  ]);
  if (settlement.usable) return true;
  if (!settlement.settled) {
    console.warn('[SpaceFace] authored part library was not preloaded before world spawn');
    return false;
  }

  const retry = state && state.render && state.render.retryAuthoredPartLibrary;
  if (typeof retry !== 'function') return false;
  const retried = retry();
  const retryResult = await Promise.race([
    Promise.resolve(retried).then(
      (value) => isAuthoredPartLibraryUsable(value),
      () => false,
    ),
    delay(timeoutMs).then(() => false),
  ]);
  if (!retryResult) console.warn('[SpaceFace] authored part library retry did not produce a usable library');
  return retryResult;
}

// One bounded second window before declaring startup failure. Staging pipelines keep
// running between waits, so a transient stall (host contention, driver-variant compile
// burst) resolves inside the retry while a persistent stall still fails closed. Without
// this a one-shot timeout lands the player on a frozen menu with a valid save (D31).
async function waitForInitialAuthoredVisualsWithRetry(state, timeoutMs, isCurrent = null, bus = null, transition = 'continue') {
  let ready = await waitForInitialAuthoredVisuals(state, timeoutMs, isCurrent);
  if (ready || (isCurrent && !isCurrent())) return ready;
  console.warn('[SpaceFace] authored visuals staging stalled; retrying once before declaring startup failure', authoredVisualReadiness(state));
  if (bus && typeof bus.emit === 'function') {
    bus.emit('game:loadingProgress', {
      id: 'authored-visuals',
      progress: 0.5,
      label: 'Building the opening scene',
      detail: 'Still placing ships and stations — giving it another moment',
      transition,
    });
  }
  ready = await waitForInitialAuthoredVisuals(state, AUTHORED_VISUAL_RETRY_TIMEOUT_MS, isCurrent);
  return ready;
}

async function waitForInitialAuthoredVisuals(state, timeoutMs = 20000, isCurrent = null) {
  const started = nowMs();
  let readiness = authoredVisualReadiness(state);
  let heartbeatLogged = false;
  // The readiness scan is O(entityList) with per-entity status derives; on a contended host the
  // old every-frame poll ran it thousands of times inside its own bound. Full-rate early (the
  // first ~0.5s where a fast boot flips ready), then one scan per four presented frames — a
  // ~66ms granularity far tighter than any link/compile leg underneath it.
  let frames = 0;
  while (!readiness.pipelineReady && nowMs() - started < timeoutMs) {
    frames += 1;
    await nextFrame();
    if (isCurrent && !isCurrent()) return false;
    if (frames > 30 && frames % 4 !== 0) continue;
    readiness = authoredVisualReadiness(state);
    // A same-session restore re-stages every required pipeline; on a contended host the gate
    // can sit inside its own bound long enough that probes and players both wonder what is
    // stuck. Name the blocking entries once mid-wait instead of only at the timeout warn.
    if (!heartbeatLogged && nowMs() - started > 25000) {
      heartbeatLogged = true;
      console.warn('[SpaceFace] authored visuals still staging after 25s', readiness);
    }
  }
  if (readiness.pipelineReady) return true;
  console.warn('[SpaceFace] initial authored visuals were not staged before pipeline preparation', readiness);
  return false;
}

function authoredVisualReadiness(state) {
  return authoredCriticalVisualReadiness(state);
}

function loadingDetailForStage(stageOrId) {
  const stage = stageOrId && typeof stageOrId === 'object' ? stageOrId : null;
  if (stage && typeof stage.detail === 'string' && stage.detail) return stage.detail;
  const stageId = stage ? stage.id : stageOrId;
  if (stageId === 'preparing-run') return 'Creating the pilot, ship, and starting sector';
  if (stageId === 'authored-library') return 'Loading only what the opening scene needs';
  if (stageId === 'authored-visuals') return 'Placing ships and stations before you arrive';
  if (stageId === 'render-pipelines') return 'Warming up so the opening runs smooth';
  if (stageId === 'gpu-resources') return 'Loading the opening stretch smoothly';
  if (stageId === 'physics-authority') return 'Waking the flight dynamics';
  if (stageId === 'entering-flight') return 'Final checks before handover';
  return 'Preparing the flight';
}

// D35/D36: rAF can starve entirely on an occluded or compositor-blocked host while timers keep
// running. A startup wait that only listens to rAF then never settles, and load finalization
// holds the session at mode:'loading' with time frozen. Every frame-wait below therefore pairs
// its rAF with a timer fallback — when frames present normally the timer is a no-op, and under
// starvation the waits resolve at the fallback cadence so their callers' own wall-clock bounds
// still apply instead of the load hanging open.
function nextFrame() {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(finish);
    setTimeout(finish, 48);
  });
}

let lastPaintAt = -Infinity;

function nextPaint() {
  if (typeof requestAnimationFrame !== 'function') return delay(0);
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      lastPaintAt = nowMs();
      resolve();
    };
    requestAnimationFrame(() => requestAnimationFrame(finish));
    // 250 ms ≈ 4 fps: a merely slow compositor still wins the race and gets its real paint;
    // only a starved one gives the boundary up to the timer.
    setTimeout(finish, 250);
  });
}

// A gate that resolves within a frame slice of the last real paint does not need its own
// double-rAF — the compositor is demonstrably alive, so the progress emit runs synchronously
// and only a genuinely un-painted stretch pays the boundary. ~2 frames each otherwise.
function nextPaintSliced() {
  if (lastPaintAt !== -Infinity && nowMs() - lastPaintAt < 16) return Promise.resolve();
  return nextPaint();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nowMs() {
  return (typeof performance !== 'undefined' && performance && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();
}

function resetRunState(state, opts = {}) {
  const requestedSeed = Number(opts.seed);
  const seed = Number.isFinite(requestedSeed) && requestedSeed > 0
    ? (requestedSeed >>> 0)
    : (((Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0) || 1);
  const fresh = createGameState(seed);
  const cameraObj = state.camera && state.camera.obj;
  const cameraFocus = state.camera && state.camera.focus;
  const cameraShake = state.camera && state.camera.shakeOffset;

  state.meta = fresh.meta;
  createTimeEffects(state).reset();
  state.accumulator = 0;
  state.simTime = 0;
  state.tick = 0;
  state.days = 0;
  state.rng = fresh.rng;
  state.input = fresh.input;
  Object.assign(state.camera, fresh.camera, {
    obj: cameraObj || null,
    focus: cameraFocus || fresh.camera.focus,
    shakeOffset: cameraShake || fresh.camera.shakeOffset,
  });
  if (state.camera.focus && typeof state.camera.focus.set === 'function') state.camera.focus.set(0, 0, 0);
  if (state.camera.shakeOffset && typeof state.camera.shakeOffset.set === 'function') state.camera.shakeOffset.set(0, 0, 0);
  state.bounds = fresh.bounds;
  state.spatialHash = fresh.spatialHash;
  state.player = fresh.player;
  state.run = fresh.run;
  state.combat = fresh.combat;
  state.economy = fresh.economy;
  state.factions = fresh.factions;
  state.conflicts = fresh.conflicts;
  state.missions = fresh.missions;
  state.scenario = fresh.scenario;
  state.story = fresh.story;
  state.world = fresh.world;
  state.jump = fresh.jump;
  state.fuel = fresh.fuel;
  state.nav = fresh.nav;
  state.automation = fresh.automation;
  state.crafting = fresh.crafting;
  state.sectorSim = fresh.sectorSim;
  state.aiEncounter = fresh.aiEncounter;
  state.interventions = fresh.interventions;
  state.interventionMeta = fresh.interventionMeta;
  state.drill = fresh.drill;
  state.claims = fresh.claims;
  state.traffic = fresh.traffic;
  const ui = state.ui || (state.ui = {});
  const screenStack = Array.isArray(ui.screenStack) ? ui.screenStack : [];
  screenStack.length = 0;
  Object.assign(ui, fresh.ui, { screenStack });
  state.save = fresh.save;
}

function showBootError(err) {
  const o = document.getElementById('boot-overlay');
  if (o) o.innerHTML = '<div class="boot-error">BOOT ERROR\n\n' + ((err && err.stack) || err) + '</div>';
  console.error('[boot]', err);
}

async function loadScenarioContract(url, path) {
  // This await sits at main.js:108, upstream of startLoop and hideBootOverlay. With no timeout, a
  // response that never settles freezes the loading screen forever and prints nothing. Failing
  // loudly after 15s is strictly better than hanging silently: the caller already handles a throw.
  const response = await fetch(url, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Unable to load scenario contract ${path}: HTTP ${response.status}`);
  const document = await response.json();
  return {
    document,
    path,
    sha256: await sha256Hex(canonicalStringify(document)),
  };
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

boot();
