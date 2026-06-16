// Boot sequence (ARCHITECTURE §1.3). Builds state + bus + registry, inits all systems, starts a
// flight scene, and runs the loop. The skeleton bootstraps a playable scene directly; once the
// save system is implemented it owns newGame() and this delegates to it.
import * as THREE from 'three';
import { createGameState } from './core/gameState.js';
import { createBus } from './core/eventBus.js';
import { createRegistry } from './core/registry.js';
import { startLoop } from './core/loop.js';
import { makeShipEntitySpec } from './systems/ships.js';
import { makeEnemySpawnSpec } from './systems/combat.js';
import { NEW_GAME } from './data/newGameDefaults.js';

async function boot() {
  try {
    const seed = (Date.now() & 0x7fffffff) >>> 0;
    const state = createGameState(seed);
    const bus = createBus();
    const helpers = {};
    const ctx = { state, bus, three: THREE, registry: null, helpers };

    const registry = createRegistry(ctx);
    ctx.registry = registry;
    registry.init();

    // If the save system implements newGame(), let it own world setup; else use the skeleton bootstrap.
    // Boot to the MAIN MENU. uiRoot shows it automatically because state.mode === 'menu' (the
    // gameState default). The world is created on New Game (game:new) and restored on Continue
    // (the save system handles game:load and emits save:loaded).
    bus.on('game:new', (opts) => startNewGame(state, helpers, bus, registry, opts || {}));
    bus.on('save:loaded', () => { state.mode = 'flight'; bus.emit('ui:closeAll'); });

    startLoop(state, registry);
    hideBootOverlay();

    // expose for debugging and the dev observe loop
    window.SF = { state, bus, registry, ctx, THREE };
    console.log('[SpaceFace] booted -> main menu. seed=%d', seed);
  } catch (err) {
    showBootError(err);
    throw err;
  }
}

// Minimal playable scene so the engine is verifiable before subsystems exist:
// player ship + a station + an asteroid ring.
function bootstrapScene(state, helpers, bus, registry) {
  const playerSpec = makeShipEntitySpec(NEW_GAME.shipId || 'ship_kestrel', {
    team: 0, factionId: 'faction_free', isPlayer: true, player: state.player, pos: { x: 0, z: 0 },
  });
  const player = helpers.spawnEntity(playerSpec);
  state.playerId = player.id;
  state.player.credits = NEW_GAME.credits || 5000;

  // World owns sector contents: it spawns stations, asteroid fields, enemies, and POIs from data.
  const world = registry.get('world');
  if (world && typeof world.enterSector === 'function') {
    world.enterSector(NEW_GAME.startSectorId || 'sector_helios_prime');
  } else {
    // fallback: a single station + asteroid ring so the build is still playable
    helpers.spawnEntity({ type: 'station', factionId: 'faction_scn', pos: { x: 280, z: -140 }, radius: 42, mass: 1e6, hull: 1e6, hullMax: 1e6, data: { stationId: 'station_helios', dockRadius: 72, services: ['market', 'shipyard', 'missions'] } });
    for (let i = 0; i < 12; i++) { const a = (Math.PI * 2 * i) / 12; const r = 360 + state.rng() * 200; helpers.spawnEntity({ type: 'asteroid', pos: { x: Math.cos(a) * r, z: Math.sin(a) * r }, radius: 12, mass: 500, hull: 240, hullMax: 240, data: { typeId: 'ast_rock', oreHP: 240, oreHPMax: 240 } }); }
  }
}

// Start a fresh game from the main menu: clear any prior world, build the new one, enter flight.
function startNewGame(state, helpers, bus, registry, opts) {
  for (const e of [...state.entityList]) {
    bus.emit('entity:destroyed', { id: e.id, type: e.type, pos: { x: e.pos.x, z: e.pos.z }, radius: e.radius, factionId: e.factionId });
  }
  state.entities.clear(); state.entityList.length = 0; state.freeIds.length = 0; state.nextEntityId = 1; state.playerId = 0;

  bootstrapScene(state, helpers, bus, registry);
  if (opts.name) state.player.name = opts.name;
  if (opts.difficulty) state.settings.gameplay.difficulty = opts.difficulty;
  state.mode = 'flight';
  bus.emit('game:started', {});
  console.log('[SpaceFace] new game started. entities=%d', state.entityList.length);
}

function hideBootOverlay() {
  const o = document.getElementById('boot-overlay');
  if (o) o.classList.add('hidden');
}
function showBootError(err) {
  const o = document.getElementById('boot-overlay');
  if (o) o.innerHTML = '<div class="boot-error">BOOT ERROR\n\n' + ((err && err.stack) || err) + '</div>';
  console.error('[boot]', err);
}

boot();
