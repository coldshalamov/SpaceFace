// Boot sequence (ARCHITECTURE §1.3). Builds state + bus + registry, inits all systems, starts a
// flight scene, and runs the loop. The skeleton bootstraps a playable scene directly; once the
// save system is implemented it owns newGame() and this delegates to it.
import * as THREE from 'three';
import { createGameState } from './core/gameState.js';
import { createBus } from './core/eventBus.js';
import { createRegistry } from './core/registry.js';
import { startLoop } from './core/loop.js';
import { canonicalStringify } from './core/simSnapshot.js';
import { makeShipEntitySpec } from './systems/ships.js';
import { makeEnemySpawnSpec } from './systems/combat.js';
import { NEW_GAME } from './data/newGameDefaults.js';
import { createTelemetry } from './systems/telemetry.js';
import { createDeterministicEventTrace } from './core/eventTrace.js';
import { applyAccessibility } from './ui/accessibility.js';
import { getAuthoredUpgradeQueueStats } from './render/partsLibrary.js';
import {
  SCENARIO_47A_CONTRACT_PATH,
  mark47aPlayerActor,
  spawn47aOpeningScene,
} from './data/scenarios/47aLiveScene.js';

// Debug surfaces (the mutable window.SF handle + boot logs) are exposed outside production bundles.
// Launcher URLs stay identical for browser/Electron; release/debug behavior must not fork gameplay.
const SF_DEBUG = debugRuntimeEnabled();
const INITIAL_AUTHORED_VISUAL_TIMEOUT_MS = 45000;

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
    const seed = (Date.now() & 0x7fffffff) >>> 0;
    const state = createGameState(seed);
    const bus = createBus();
    const contract = await loadScenarioContract(new URL('./data/scenarios/47a.scenario.json', import.meta.url), SCENARIO_47A_CONTRACT_PATH);
    const helpers = {
      scenarioContract: contract.document,
      scenarioContractPath: contract.path,
      scenarioContractHash: contract.sha256,
    };
    const ctx = { state, bus, three: THREE, registry: null, helpers };
    helpers.finalizeLoadedGame = (payload) => finalizeLoadedGame(state, bus, payload || {});

    const registry = createRegistry(ctx);
    ctx.registry = registry;
    registry.init();

    // Local telemetry sink (privacy-safe, no network): onboarding funnel, balance/career stats,
    // death heatmap. Subscribes to the live bus; mirrored to window.__SF_TELEMETRY__ for dev.
    const telemetry = createTelemetry(bus, state);
    const eventTrace = createDeterministicEventTrace(bus, state);
    // Apply accessibility settings (colorblind palette, motion/flash, UI scale) on boot + on change/load.
    applyAccessibility(state.settings);
    bus.on('settings:changed', () => applyAccessibility(state.settings));
    bus.on('save:loaded', () => applyAccessibility(state.settings));

    // If the save system implements newGame(), let it own world setup; else use the skeleton bootstrap.
    // Boot to the MAIN MENU. uiRoot shows it automatically because state.mode === 'menu' (the
    // gameState default). The world is created on New Game (game:new) and restored on Continue
    // (the save system handles game:load and emits save:loaded).
    bus.on('game:new', (opts) => {
      startNewGame(state, helpers, bus, registry, opts || {}).catch((error) => {
        console.error('[SpaceFace] new game startup failed', error);
        failGameStart(state, bus, error, 'Game assets failed to load. See console.');
      });
    });

    startLoop(state, registry);
    hideBootOverlay();

    // expose for debugging and the dev observe loop (dev/browser only — stripped from packaged builds)
    if (SF_DEBUG) {
      window.SF = { state, bus, registry, ctx, helpers, THREE, telemetry, eventTrace };
      console.log('[SpaceFace] booted -> main menu. seed=%d', seed);
    }

    // Dev-only ship turntable preview: ?dev=shippreview renders every hull × tier into .devshots/
    // for visual verification. Requires the render system to be initialized, so we wait a frame.
    if (SF_DEBUG && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'shippreview') {
      const { runShipPreview } = await import('./render/shipPreview.js');
      // ensure the render system has registered its scene/renderer handles on state.render
      setTimeout(() => { runShipPreview({ state, registry, THREE }).catch((e) => console.error('[shipPreview]', e)); }, 500);
    }
    // Dev-only single-frame Kestrel hero capture: ?dev=shipshot renders the player Kestrel once (no
    // rAF loop, so it's robust under headless Chrome) and POSTs kestrel_hero_live.jpg to /__shot.
    if (SF_DEBUG && typeof location !== 'undefined' && new URLSearchParams(location.search).get('dev') === 'shipshot') {
      const { runShipShot } = await import('./render/shipShot.js');
      setTimeout(() => { runShipShot({ state, registry, THREE }).catch((e) => console.error('[shipShot]', e)); }, 500);
    }
  } catch (err) {
    showBootError(err);
    throw err;
  }
}

// Minimal playable scene so the engine is verifiable before subsystems exist:
// player ship + a station + an asteroid ring.
function bootstrapScene(state, helpers, bus, registry) {
  const owned = state.player.ownedShips[state.player.activeShipIndex] || null;
  const shipId = (owned && owned.defId) || NEW_GAME.shipId || 'ship_kestrel';
  const fittings = (owned && owned.fittings) || [];
  const playerSpec = makeShipEntitySpec(shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player, fittings, pos: { x: 0, z: 0 },
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
  spawn47aOpeningScene({ state, helpers });
}

// Start a fresh game from the main menu: clear any prior world, build the new one, enter flight.
async function startNewGame(state, helpers, bus, registry, opts) {
  for (const e of [...state.entityList]) {
    bus.emit('entity:destroyed', { id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId });
  }
  state.entities.clear(); state.entityList.length = 0; state.freeIds.length = 0; state.nextEntityId = 1; state.playerId = 0;

  resetRunState(state, opts || {});
  enterLoadingMode(state, bus);

  for (const name of ['world', 'factions', 'economy', 'automation', 'intervention', 'sectorSim', 'missions', 'aiEncounter', 'crafting', 'traffic', 'drill', 'claims']) {
    const sys = registry.get(name);
    if (sys && typeof sys.newGame === 'function') sys.newGame();
  }

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

  const libraryReady = await waitForAuthoredPartLibrary(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS);
  if (!libraryReady) {
    throw new Error('Authored ship asset library did not preload; refusing to start flight with procedural fallback ships.');
  }
  bootstrapScene(state, helpers, bus, registry);
  if (opts.name) state.player.name = opts.name;
  if (opts.difficulty) state.settings.gameplay.difficulty = opts.difficulty;
  const visualsReady = await waitForInitialAuthoredVisuals(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS);
  if (!visualsReady) {
    throw new Error('Initial authored ship visuals did not become ready; refusing to enter flight with procedural fallback ships.');
  }
  enterFlightMode(state, bus);
  bus.emit('game:started', {});
  if (SF_DEBUG) console.log('[SpaceFace] new game started. entities=%d', state.entityList.length);
}

async function finalizeLoadedGame(state, bus, payload = {}) {
  enterLoadingMode(state, bus);
  try {
    const libraryReady = await waitForAuthoredPartLibrary(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS);
    if (!libraryReady) {
      throw new Error('Authored ship asset library did not preload after save load; refusing to enter flight with procedural fallback ships.');
    }
    const visualsReady = await waitForInitialAuthoredVisuals(state, INITIAL_AUTHORED_VISUAL_TIMEOUT_MS);
    if (!visualsReady) {
      throw new Error('Loaded authored ship visuals did not become ready; refusing to enter flight with procedural fallback ships.');
    }
    enterFlightMode(state, bus);
    bus.emit('ui:closeAll', {});
    if (SF_DEBUG) console.log('[SpaceFace] loaded game entered flight. slot=%s', payload.slot || 'unknown');
  } catch (error) {
    console.error('[SpaceFace] loaded game startup failed', error);
    failGameStart(state, bus, error, 'Loaded game assets failed to load. See console.');
  }
}

function enterLoadingMode(state, bus) {
  const previousMode = state.mode;
  state.mode = 'loading';
  state.timeScale = 0;
  if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
}

function enterFlightMode(state, bus) {
  const previousMode = state.mode;
  state.mode = 'flight';
  state.timeScale = 1;
  if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
}

function failGameStart(state, bus, error, text) {
  state.timeScale = 0;
  const previousMode = state.mode;
  state.mode = 'menu';
  if (previousMode !== state.mode) bus.emit('mode:changed', { mode: state.mode, previousMode });
  bus.emit('game:startFailed', { error: error && error.message ? error.message : String(error) });
  bus.emit('toast', { text, kind: 'error', ttl: 8 });
}

async function waitForAuthoredPartLibrary(state, timeoutMs = 20000) {
  const ready = state && state.render && state.render.authoredPartLibraryReady;
  if (!ready || typeof ready.then !== 'function') return false;
  const result = await Promise.race([
    ready.then(() => true, () => false),
    delay(timeoutMs).then(() => false),
  ]);
  if (!result) console.warn('[SpaceFace] authored part library was not preloaded before world spawn');
  return result;
}

async function waitForInitialAuthoredVisuals(state, timeoutMs = 20000) {
  const started = nowMs();
  while (nowMs() - started < timeoutMs) {
    const readiness = authoredVisualReadiness(state);
    if (readiness.ready) return true;
    await nextFrame();
  }
  const last = authoredVisualReadiness(state);
  console.warn('[SpaceFace] initial authored visuals were not ready before flight start', last);
  return false;
}

function authoredVisualReadiness(state) {
  const scene = state.render && state.render.scene;
  const queue = getAuthoredUpgradeQueueStats(scene);
  const ships = (state.entityList || []).filter((entity) => entity && entity.type === 'ship' && entity.alive !== false);
  let authored = 0;
  let loading = 0;
  let fallback = 0;
  for (const ship of ships) {
    const status = ship.mesh && ship.mesh.userData && ship.mesh.userData.authoredAssetState;
    if (status === 'authored') authored++;
    else if (status === 'loading' || status === 'procedural-fallback') loading++;
    else fallback++;
  }
  const allLiveShipsAuthored = ships.length > 0 && authored === ships.length && loading === 0 && fallback === 0;
  return {
    ready: allLiveShipsAuthored,
    shipCount: ships.length,
    authored,
    loading,
    fallback,
    queue,
  };
}

function nextFrame() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 16);
  });
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
  state.timeScale = 1;
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

function hideBootOverlay() {
  const o = document.getElementById('boot-overlay');
  if (!o) return;
  o.classList.add('hidden');
  setTimeout(() => {
    if (o.classList.contains('hidden')) o.style.display = 'none';
  }, 600);
}
function showBootError(err) {
  const o = document.getElementById('boot-overlay');
  if (o) o.innerHTML = '<div class="boot-error">BOOT ERROR\n\n' + ((err && err.stack) || err) + '</div>';
  console.error('[boot]', err);
}

async function loadScenarioContract(url, path) {
  const response = await fetch(url, { cache: 'no-cache' });
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
