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
import { SWARM_RULESET } from '../data/swarmMode.js';
import { applyRacingLoadout } from '../data/racingLoadouts.js';
import { configureRacingCorridorSession, isRacingCorridorSession } from '../world/racingCorridor.js';
import { defaultShipAppearance } from './shipAppearance.js';
import { mark47aPlayerActor, spawn47aOpeningScene } from '../data/scenarios/47aLiveScene.js';
import { promoteAsteroidFieldRock } from '../world/asteroidField.js';
import { markFieldRockAtRest } from '../systems/spawnClearance.js';
import { NOCTURNE_LAYOUTS, NOCTURNE_LIGHT_PROFILES } from '../data/nocturneLighting.js';
import { GameStartReadinessError } from './newGameStartTransition.js';
import { shouldGrantKeepsake } from './newGamePlus.js';
import { laneInputWrite } from './simLaneCommands.js';

// Minimal playable scene so the engine is verifiable before subsystems exist:
// player ship + a station + an asteroid ring.
export async function runBootstrapScene(state, helpers, bus, registry, options = {}) {
  const racingSession = isRacingCorridorSession(state);
  const owned = state.player.ownedShips[state.player.activeShipIndex] || null;
  const shipId = (owned && owned.defId) || NEW_GAME.shipId || 'ship_kestrel';
  const fittings = (owned && owned.fittings) || [];
  const playerSpec = makeShipEntitySpec(shipId, {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player, fittings,
    appearance: owned && owned.appearance,
    livingHull: owned && owned.livingHull,
    legacyWeaponFallback: !options.swarmBoot,
    pos: { x: 0, z: 0 },
  });
  const player = helpers.spawnEntity(playerSpec);
  state.playerId = player.id;
  if (!racingSession && !options.swarmBoot) mark47aPlayerActor(player);
  state.player.credits = NEW_GAME.credits || 5000;
  const ships = registry.get('ships');
  if (ships && typeof ships.recomputeActiveShip === 'function') ships.recomputeActiveShip();

  // Swarm enters its backdrop in the prepared arena setup, after runSession owns the run.
  // Campaign bootstrap would materialize Helios and its neighbors before that handoff.
  const world = options.swarmBoot ? null : registry.get('world');
  if (world && typeof world.enterSector === 'function') {
    world.enterSector(NEW_GAME.startingSectorId || NEW_GAME.startSectorId || 'sector_helios_prime');
    if (!state.physicsVenueSession && !racingSession) seatOpeningPilot(state, world, player);
  } else if (!options.swarmBoot) {
    // fallback: a single station + asteroid ring so the build is still playable
    helpers.spawnEntity({ type: 'station', factionId: 'faction_scn', pos: { x: 280, z: -140 }, radius: 42, mass: 1e6, hull: 1e6, hullMax: 1e6, data: { stationId: 'station_helios', dockRadius: 72, services: ['market', 'shipyard', 'missions'] } });
    for (let i = 0; i < 12; i++) { const a = (Math.PI * 2 * i) / 12; const r = 360 + state.rng() * 200; markFieldRockAtRest(helpers.spawnEntity({ type: 'asteroid', pos: { x: Math.cos(a) * r, z: Math.sin(a) * r }, radius: 12, mass: 500, hull: 240, hullMax: 240, data: { typeId: 'ast_rock', oreHP: 240, oreHPMax: 240 } }), { simTime: state.simTime }); }
  }
  // Split the two heaviest scene-build halves so the 'preparing' stage gets a paint between
  // world regen and opening composition instead of one frozen monolith.
  if (typeof options.yield === 'function') await options.yield();
  if (!state.physicsVenueSession && !racingSession && !options.swarmBoot) {
    const scene = spawn47aOpeningScene({ state, helpers, liveColdStartSafe: true });
    light47aOpeningLandmarks(scene);
    wake47aMarkedBoulder(state, helpers);
    // FIRST HOUR (2026-11-21): no scripted drift. R23 — the ship moves for the player's input,
    // physics the player can see, or a moment the player started; the opening is calm and the
    // first move is the player's own (the dock, or anything they choose to fly to).
  }
}

// FIRST HOUR (world lead, 2026-11-21; director ruling + R16): a new Adventure game opens in sight of
// the harbour. The pilot is seated at rest on the start sector's authored opening seat (Helios
// Station ~340 WU ahead, up-screen), and the camera is asked for one establishing shot: it opens
// pulled back far enough to show the harbour, then eases in to the ship (render/trailerStaging.js
// consumes `state.nav.openingEstablishing` once, through the camera gate as cause `establishing`).
// The flight camera shows ~95 WU ahead at rest (measured 2026-11-21); ×5 shows the station's ~350.
export const OPENING_ESTABLISHING = Object.freeze({ zoom: 4.5, seconds: 3, holdS: 1.8 });
export function seatOpeningPilot(state, world, player) {
  if (!state || !world || !player || !player.pos) return false;
  const sectorId = state.world && state.world.currentSectorId;
  const sector = sectorId && state.world.sectors && state.world.sectors[sectorId];
  const seat = sector && sector.openingSeat;
  if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.z)) return false;
  const origin = typeof world._sectorOrigin === 'function' ? world._sectorOrigin(sectorId) : { x: 0, z: 0 };
  const entry = { x: origin.x + seat.x, z: origin.z + seat.z, heading: Number.isFinite(seat.heading) ? seat.heading : 0 };
  if (typeof world.relocatePlayerInSector === 'function') world.relocatePlayerInSector(entry, { reason: 'opening_seat' });
  else { player.pos.x = entry.x; player.pos.z = entry.z; }
  if (player.vel) { player.vel.x = 0; player.vel.z = 0; }
  player.angVel = 0;
  // Rides state.nav: a whole-root mirror, so the presenting thread sees it in the worker lane too.
  state.nav = state.nav || {};
  state.nav.openingEstablishing = { sectorId, atSimTime: Number(state.simTime) || 0,
    zoom: OPENING_ESTABLISHING.zoom, seconds: OPENING_ESTABLISHING.seconds, holdS: OPENING_ESTABLISHING.holdS };
  return true;
}

// The 47-A contract is bound to the authored rim boulder (its marked rock): wake that shelf row so
// it is a live, lit body the contract and its recovery marker can name from the first frame.
export function wake47aMarkedBoulder(state, helpers) {
  const field = state && state.world && state.world.asteroidField;
  if (!field || !field.byId || !helpers) return null;
  for (const row of field.byId.values()) {
    if (row && row.alive !== false && row.data && row.data.authoredBoulderId === 'helios_boulder_rim') {
      return promoteAsteroidFieldRock(state, row.id, helpers, '47a-opening');
    }
  }
  return null;
}

// OPENING-1b (design/game/20 beat 1): the ship is already drifting toward the marked rock when the
// first frame draws, so the field is alive and the eye has somewhere to go. Live route only (the
// deterministic 47-A harness never calls this); gentle, below the old thrust-drill speed.
export const OPENING_DRIFT_WU_S = 26;
export const OPENING_DRIFT_GRACE_S = 7;
export function drift47aOpeningTowardMark(state, player, helpers = null) {
  if (!state || !player || !player.pos || !player.vel) return false;
  // The marked boulder is a shelf record until something approaches it: wake the nearest authored
  // one now so it is a live, lit, on-screen body at the first frame (and a legal first 47-A pick).
  const field = state.world && state.world.asteroidField;
  if (field && field.byId && helpers) {
    let rec = null; let recD2 = Infinity;
    for (const row of field.byId.values()) {
      if (!row || row.alive === false || !row.pos || !(row.data && row.data.authoredBoulderId)) continue;
      if (!String(row.data.authoredBoulderId).startsWith('helios_boulder_')) continue;
      const dx = row.pos.x - player.pos.x; const dz = row.pos.z - player.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < recD2) { recD2 = d2; rec = row; }
    }
    if (rec && rec.id != null) promoteAsteroidFieldRock(state, rec.id, helpers, '47a-opening');
  }
  let best = null; let bestD2 = Infinity;
  for (const e of state.entityList || []) {
    if (!e || e.alive === false || e.type !== 'asteroid' || !e.pos || !String(e.data && e.data.authoredBoulderId || '').startsWith('helios_boulder_')) continue;
    const dx = e.pos.x - player.pos.x; const dz = e.pos.z - player.pos.z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) { bestD2 = d2; best = e; }
  }
  if (!best || bestD2 < 1) return false;
  const d = Math.sqrt(bestD2);
  player.vel.x = ((best.pos.x - player.pos.x) / d) * OPENING_DRIFT_WU_S;
  player.vel.z = ((best.pos.z - player.pos.z) / d) * OPENING_DRIFT_WU_S;
  // Flight-assist owner (flightV3) keeps the drift until the first drive input or this many seconds.
  state.openingDriftGrace = { untilSimTime: (Number(state.simTime) || 0) + OPENING_DRIFT_GRACE_S };
  return true;
}

// LOOK-05A — light the two things the eye must find in the first minute (design/game/20 beats 1 and 4).
// Live route only: the deterministic 47-A harness never calls this, so its snapshot is untouched.
// The tow can the objective marks gets a small warm lamp (a halo that says "this one", over a dark
// field); the Bourse carrier hulk gets its emergency strobes and a thin haze, so the derelict reads
// as a lit target. Both are Nocturne descriptors (src/render/nocturne/content.js): Nocturne owns the
// budget, skips phones, and an absent Nocturne leaves the bodies exactly as they were.
export function light47aOpeningLandmarks(scene) {
  if (!scene) return;
  const can = scene.spindle;
  if (can && can.data) {
    can.data.luminous = true;
    can.data.nocturne = {
      profile: 'ore',
      lights: [{ id: 'mark', profile: 'ore', color: 0xffc27a, intensity: 2600, range: 150, offset: [0, 7, 0] }],
    };
  }
  const hulk = scene.carrier;
  if (hulk && hulk.data) {
    hulk.data.emergencyLight = true;
    hulk.data.smoke = true;
    // The stock warning fixtures, hotter and wider: the hulk's strobes are the beat-4 target, so they must
    // pull the eye across the dark (a red pulse that throws light onto the plating, not a pinprick).
    hulk.data.nocturne = {
      lights: NOCTURNE_LAYOUTS.derelict.filter((f) => f.condition === 'emergency').map((f) => ({
        id: f.id, profile: f.profile, offset: f.offset, phase: f.phase, condition: f.condition,
        intensity: Math.round(NOCTURNE_LIGHT_PROFILES[f.profile].intensity * 2.8), range: 240,
      })),
    };
  }
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

export async function resolveNewGamePlusOverlay(registry, opts = {}) {
  const request = opts && opts.newGamePlus;
  if (!request) return null;
  const saveSystem = registry && typeof registry.get === 'function' ? registry.get('save') : null;
  const overlay = saveSystem && typeof saveSystem.prepareNewGamePlusAsync === 'function'
    ? await saveSystem.prepareNewGamePlusAsync(request)
    : (saveSystem && typeof saveSystem.prepareNewGamePlus === 'function'
      ? saveSystem.prepareNewGamePlus(request) : null);
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
  // The worker owns this system during the worker lane and its new-game boot already resets the
  // native owner. Do not ask the presentation registry for a missing facade (which would emit a
  // facade-miss warning); main-lane/test registries still use the real public seam when present.
  const workerLane = !!(registry && registry.ctx && registry.ctx.simLane === 'worker');
  const assist = workerLane || !registry || typeof registry.get !== 'function'
    ? null : registry.get('autoTargetAssist');
  if (assist && typeof assist.reset === 'function') {
    assist.reset();
  } else if (assist && assist._runtime) {
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
  onPhysicsPrep = null, awaitPhysicsPrep = false, beforeScenePrepared = null,
}) {
  // The veil goes up before the roster clear: a populated sector's entity:destroyed fan-out
  // is a multi-hundred-ms stretch, and it must not brick on the previous screen.
  let cleared = 0;
  for (const e of [...state.entityList]) {
    clearEntityRuntime(e);
    bus.emit('entity:destroyed', { id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId, reason: 'run_reset' });
    if (!isCurrent()) return { aborted: true };
    if (++cleared % 16 === 0) {
      await nextPaint();
      if (!isCurrent()) return { aborted: true };
    }
  }
  state.entities.clear(); state.entityList.length = 0; state.freeIds.length = 0; state.nextEntityId = 1; state.playerId = 0;

  resetRunState(state, opts || {});
  state.physicsVenueSession = opts?.physicsVenueSession === true;
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

  const swarmBoot = opts?.crucibleLaunch === true && opts.crucibleSetup?.survivalRuleset === SWARM_RULESET;
  const resetCompleted = resetFreshRunSystems(registry, {
    swarmBoot,
    afterEach: name => {
      if (!isCurrent()) return false;
      // Register the fresh sector objects before Adventure missions seed their opening.
      if (name === 'world') configureRacingCorridorSession(state, opts?.racingSession === true);
      return true;
    },
  });
  if (!resetCompleted || !isCurrent()) return { aborted: true };
  // Many systems/VFX listen only to the legacy `game:newGame` alias. The public route emits
  // `game:new`; without this alias, titles, fragile cargo, cloak, and presentation caches
  // keep the previous run's instance state.
  bus.emit('game:newGame', { seed: state.meta && state.meta.seed, ...(opts || {}) });
  if (!isCurrent()) return { aborted: true };

  const ships = registry.get('ships');
  const swarmHullId = swarmBoot ? opts.crucibleSetup.survivalSetup?.hullId : null;
  if (ships && typeof ships.newGame === 'function') {
    ships.newGame({ unfittedHullId: swarmHullId });
  } else {
    state.player.ownedShips = [{ defId: swarmHullId || NEW_GAME.shipId || 'ship_kestrel', fittings: [] }];
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
  if (!swarmHullId) applyStarterPick(state, ships, opts);
  applyRacingLoadout(state, ships, opts);
  if (!isCurrent()) return { aborted: true };
  // Single-frame breath: a committed paint is reserved for the boundary just
  // before the scene bootstrap — this one only needs to yield.
  await nextFrameTick();
  if (!isCurrent()) return { aborted: true };

  if (newGamePlus) {
    const keepsakeId = newGamePlus.keepsake && newGamePlus.keepsake.defId;
    const grantKeepsake = shouldGrantKeepsake(state.player, keepsakeId);
    if (grantKeepsake && (!ships || typeof ships.grantModule !== 'function'
        || !ships.grantModule({
          defId: keepsakeId,
          reason: `new-game-plus:${newGamePlus.sourceEnding}`,
        }))) {
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
  await runBootstrapScene(state, helpers, bus, registry, { yield: () => nextFrameTick(), swarmBoot });
  if (!isCurrent()) return { aborted: true };
  // Run-specific loadouts and arena placement must exist before visual/GPU admission.
  // Installing them on game:started prepares the wrong hull, then replaces it in flight.
  const scenePrepared = opts?.crucibleLaunch === true ? { crucibleLaunch: true } : {};
  if (typeof beforeScenePrepared === 'function') {
    const setupApplied = await beforeScenePrepared();
    if (!isCurrent()) return { aborted: true };
    if (setupApplied === true) scenePrepared.sandboxSetupApplied = true;
  }
  bus.emit('game:scenePrepared', scenePrepared);
  if (!isCurrent()) return { aborted: true };
  const physicsSystem = registry.get('physics');
  if (physicsSystem && typeof physicsSystem.prepareBackend === 'function') {
    // Fresh-run entities were just spawned while timeScale was 0; reset so no record
    // from a prior run's entity objects survives into the new world. The catch marker
    // only suppresses the unhandled-rejection window before the physics gate awaits it.
    const physicsPrep = Promise.resolve()
      .then(() => physicsSystem.prepareBackend(state, { reset: true, initTimeoutMs: 20000 }));
    physicsPrep.catch(() => {});
    if (onPhysicsPrep) onPhysicsPrep(physicsPrep);
    if (awaitPhysicsPrep && (await physicsPrep) === false) {
      throw new GameStartReadinessError('PHYSICS_BACKEND_UNAVAILABLE', 'physics-authority',
        'The dynamic physics backend did not initialize.');
    }
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
  // The lane's displayed-camera transport (worker realm) describes the world
  // that just died — a reset run has no displayed envelope until the next
  // camera frame lands, so the projector must fall back to its derivation
  // rather than read a stale zoom/focus. Harmless on the main lane: follow()
  // restamps displayedZoom/speedZoomFactor on its next frame regardless.
  delete state.camera.displayedZoom;
  delete state.camera.speedZoomFactor;
  delete state.camera.focusX;
  delete state.camera.focusZ;
  delete state.camera.aspect;
  delete state.camera.frameOriginX;
  delete state.camera.frameOriginZ;
  delete state.camera.viewKind;
  delete state.camera.viewMix;
  delete state.camera.eyeX;
  delete state.camera.eyeY;
  delete state.camera.eyeZ;
  delete state.camera.quatX;
  delete state.camera.quatY;
  delete state.camera.quatZ;
  delete state.camera.quatW;
  delete state.camera.displayFov;
  delete state.camera.displayNear;
  delete state.camera.displayFar;
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
  // GOLD-LEDGER: the case board is run-scoped and lazy — a new run starts with no board key.
  delete state.shipLedger;
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
  state.longBerth = fresh.longBerth;
  state.crew = fresh.crew;
  state.traffic = fresh.traffic;
  // Mark the fresh world's epoch newer than any pending emit tail: a sector:enter slice
  // deferred across this reset drains inside the next emit or pump frame, and without an
  // epoch here its stale payload would pass the live-or-inert guard on an un-serialed world.
  state.enterSerialSeq = (Number(state.enterSerialSeq) || 0) + 1;
  state.world.enterSerial = state.enterSerialSeq;
  resetRunUiState(state, fresh.ui);
  state.save = fresh.save;
  // The ironman latch is run-scoped but lives in session settings: a new game may still
  // choose it. It re-stamps itself once the new run accrues playtime.
  if (state.settings && state.settings.gameplay) delete state.settings.gameplay.ironmanChoiceLocked;
}

// The ui reset step of resetRunState — exported separately because the main
// realm owns state.ui: under the worker lane this body runs on the worker's
// throwaway ui, and the main-side call site must replay the same write for the
// mirrored facade to match a main-lane boot.
export function resetRunUiState(state, freshUi = null) {
  const ui = state.ui || (state.ui = {});
  const screenStack = Array.isArray(ui.screenStack) ? ui.screenStack : [];
  screenStack.length = 0;
  Object.assign(ui, freshUi || createGameState(0).ui, { screenStack });
}
