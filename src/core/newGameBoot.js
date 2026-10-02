// Lane-neutral new-game sim boot: the entity clear, run-state reset, system resets, starter
// pick, NG+ restoration, and scene bootstrap that prepareRun performs. Extracted so the spike
// worker can replay the identical mutation sequence through the 'newGameBoot' rpc under the
// lane sink while SIM_LANE=main keeps the same function on its own lane.
//
// Presentation affordances arrive injected — `nextPaint`/`nextFrame` resolve immediately under
// the worker (no compositor to pace against) and guard cancellation folds into `isCurrent`.
// The surrounding transition choreography (loading veil, readiness gates, enterFlight, discard)
// stays on the main lane; only the sim-mutation sequence moves.

import { clearEntityRuntime } from './entity.js';
import { createGameState } from './gameState.js';
import { createTimeEffects } from './timeEffects.js';
import { resetFreshRunSystems } from './runReset.js';
import { makeShipEntitySpec } from '../systems/ships.js';
import { NEW_GAME, resolveNewGameStarter } from '../data/newGameDefaults.js';
import { defaultShipAppearance } from './shipAppearance.js';
import { mark47aPlayerActor, spawn47aOpeningScene } from '../data/scenarios/47aLiveScene.js';
import { GameStartReadinessError } from './newGameStartTransition.js';
import { laneInputWrite } from './simLaneCommands.js';

// Minimal playable scene so the engine is verifiable before subsystems exist:
// player ship + a station + an asteroid ring.
export async function runBootstrapScene(state, helpers, bus, registry, options = {}) {
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

// PQ-156.00 — apply a New Game starter pick to the run's first owned ship. Runs inside
// runNewGameSimBoot after ships.newGame() and before the scene bootstrap, so the spawned
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

export function resolveNewGamePlusOverlay(registry, opts = {}) {
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

export function resetCombatInputMode(state, registry) {
  if (!state || !state.input) return;
  laneInputWrite(state, 'input.autoFire', false);
  if (state.input.pursuitSlot) {
    laneInputWrite(state, 'input.pursuitSlot', {
      ...state.input.pursuitSlot,
      active: false,
      reason: 'runtime-reset',
      releasedTick: Number.isFinite(state.tick) ? state.tick : null,
    });
  }
  const assist = registry && typeof registry.get === 'function' ? registry.get('autoTargetAssist') : null;
  if (assist && assist._runtime) {
    assist._runtime.lastActive = false;
    assist._runtime.lastReason = 'runtime-reset';
  }
}

// The whole sim-side mutation sequence of a new game, in the order prepareRun ran it.
// Returns { ok: true } on success, { aborted: true } if the transition guard cancelled it,
// and reports the kicked physics-prep promise through onPhysicsPrep (or awaits it when
// awaitPhysicsPrep is set — the rpc handler uses that so its ack implies the backend is ready).
export async function runNewGameSimBoot({
  state, helpers, bus, registry, opts = {}, newGamePlus = null,
  isCurrent = () => true, nextPaint = async () => {}, nextFrameTick = async () => {},
  onPhysicsPrep = null, awaitPhysicsPrep = false,
}) {
  // The veil goes up before the roster clear: a populated sector's entity:destroyed fan-out
  // is a multi-hundred-ms stretch, and it must not brick on the previous screen.
  let cleared = 0;
  for (const e of [...state.entityList]) {
    clearEntityRuntime(e);
    bus.emit('entity:destroyed', { id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId });
    if (!isCurrent()) return { aborted: true };
    if (++cleared % 16 === 0) {
      await nextPaint();
      if (!isCurrent()) return { aborted: true };
    }
  }
  state.entities.clear(); state.entityList.length = 0; state.freeIds.length = 0; state.nextEntityId = 1; state.playerId = 0;

  resetRunState(state, opts || {});
  // The run reset clears every time-effects request, including the veil the loading shell
  // raised above — re-assert it or a frame landing on the paints below steps the sim while
  // state.combat is still the fresh, pre-newGame shape.
  createTimeEffects(state).set('runtime:loading', { scale: 0 });
  resetCombatInputMode(state, registry);
  if (!isCurrent()) return { aborted: true };
  // Let the loading shell paint the "preparing" stage between the synchronous chunks —
  // the bar's smoothing loop only moves when the compositor gets a frame.
  await nextPaint();
  if (!isCurrent()) return { aborted: true };

  const resetCompleted = resetFreshRunSystems(registry, {
    afterEach: () => isCurrent(),
  });
  if (!resetCompleted || !isCurrent()) return { aborted: true };
  // Many systems/VFX listen only to the legacy `game:newGame` alias. The public route emits
  // `game:new`; without this alias, titles, fragile cargo, cloak, and presentation caches
  // keep the previous run's instance state.
  bus.emit('game:newGame', { seed: state.meta && state.meta.seed, ...(opts || {}) });
  if (!isCurrent()) return { aborted: true };

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
  if (!isCurrent()) return { aborted: true };

  // PQ-156.00 — a starter pick rides game:new as opts.starter. ships.newGame() always
  // installs the legacy NEW_GAME ship, so the pick rewrites the active owned ship here,
  // before the scene bootstrap spawns the player entity. Absent/unknown ids keep the legacy
  // defaults byte-for-byte; nothing about the pick is saved as a class or lock.
  applyStarterPick(state, ships, opts);
  if (!isCurrent()) return { aborted: true };
  // Single-frame breath: a committed paint is reserved for the boundary just
  // before the scene bootstrap — this one only needs to yield.
  await nextFrameTick();
  if (!isCurrent()) return { aborted: true };

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
  if (!isCurrent()) return { aborted: true };
  await nextPaint();
  if (!isCurrent()) return { aborted: true };

  // Create the canonical player and starting sector before readiness waits. This gives the
  // renderer real entity boundaries to upgrade while the route remains frozen in loading.
  await runBootstrapScene(state, helpers, bus, registry, { yield: () => nextFrameTick() });
  if (!isCurrent()) return { aborted: true };
  // Run-specific loadouts and arena placement must exist before visual/GPU admission.
  // Installing them on game:started prepares the wrong hull, then replaces it in flight.
  bus.emit('game:scenePrepared', {});
  if (!isCurrent()) return { aborted: true };
  const physicsSystem = registry.get('physics');
  if (physicsSystem && typeof physicsSystem.prepareBackend === 'function') {
    // Fresh-run entities were just spawned while timeScale was 0; reset so no record
    // from a prior run's entity objects survives into the new world. The catch marker
    // only suppresses the unhandled-rejection window before the physics gate awaits it.
    const physicsPrep = Promise.resolve()
      .then(() => physicsSystem.prepareBackend(state, { reset: true }));
    physicsPrep.catch(() => {});
    if (onPhysicsPrep) onPhysicsPrep(physicsPrep);
    if (awaitPhysicsPrep) await physicsPrep;
  }
  const saveSystem = registry.get('save');
  if (saveSystem && typeof saveSystem.primeAutosaveCapture === 'function') {
    saveSystem.primeAutosaveCapture();
  }
  if (opts.name) state.player.name = opts.name;
  if (opts.difficulty) state.settings.gameplay.difficulty = opts.difficulty;
  return { ok: true };
}

// Reset the mutable run state in place (preserves camera/renderer handles the presentation
// layer parked on state.camera). Exposed for the worker-side rpc replay.
export function resetRunState(state, opts = {}) {
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
