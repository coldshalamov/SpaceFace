// REPRO: cargo._pendingSpillAnnounce survives a quit-while-docked → New Game.
//
// `dock:docked` at speed sets `_pendingSpillAnnounce`; `dock:undocked` consumes it
// (toast + alert). But quit-to-menu while docked skips the undock event, and cargo
// is not on FRESH_RUN_SYSTEMS and has no game:new/newGame/save:loaded clear for the
// latch — so the FIRST undock of the next run fires a phantom "Came in hot" toast
// for pods that do not exist beside the new dock. Same path on save:loaded.
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { cargo } from '../src/systems/cargo.js';
import { FRESH_RUN_SYSTEMS } from '../src/core/runReset.js';

const state = createGameState(41);
const bus = createBus();
const player = {
  id: 1, type: 'ship', team: 0, alive: true, collides: true,
  pos: { x: 100, z: 50 }, vel: { x: 25, z: 0 }, rot: 0,
  radius: 8, combatSpeed: 100, hull: 100, hullMax: 100,
  factionId: 'player', flags: {}, data: {},
};
state.entities.set(player.id, player);
state.entityList.push(player);
state.playerId = player.id;
state.nextEntityId = 2;

const sys = Object.create(cargo);
sys.init({ state, bus, helpers: { spawnEntity: (s) => ({ ...s, id: 99 }), removeEntity: () => {} } });
sys.addCargo('cmdty_food', 4);

const toasts = [];
bus.on('toast', (t) => toasts.push(t));

// 1) Hot dock arrival → spill → receipt latched for the undock beat.
bus.emit('dock:docked', { stationId: 'station_helios' });
console.log('after hot dock: _pendingSpillAnnounce =', sys._pendingSpillAnnounce ? 'SET' : 'null');

// 2) Player quits to menu while docked → New Game. The real transition emits
//    game:new + game:newGame and resets FRESH_RUN_SYSTEMS — cargo is absent from
//    that list, and it holds no subscription that would clear the latch.
console.log('cargo on FRESH_RUN_SYSTEMS:', FRESH_RUN_SYSTEMS.includes('cargo'));
bus.emit('game:new', {});
bus.emit('game:newGame', {});
bus.emit('save:loaded', {});
console.log('after run-boundary events: _pendingSpillAnnounce =', sys._pendingSpillAnnounce ? 'SET' : 'null');

// 3) First undock of the fresh run → the stale receipt announces.
bus.emit('dock:undocked', { stationId: 'station_vesta' });
const phantom = toasts.filter((t) => /Came in hot/.test(t.text || ''));
console.log('phantom "Came in hot" toasts in the fresh run:', phantom.length);

if (sys._pendingSpillAnnounce !== null && phantom.length === 0) {
  console.log('INCONCLUSIVE: latch still set but announce consumed elsewhere');
}
if (phantom.length > 0) {
  console.log('DEFECT REPRODUCED: stale spill announce fired across a run boundary');
  process.exitCode = 1;
} else {
  console.log('CLEAN: no stale spill announce');
}
