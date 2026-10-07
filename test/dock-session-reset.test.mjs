// Dock session flags must not survive a quit-while-docked → New Game.
//
// The defect: `resetRunState` rebuilds `state.ui` by `Object.assign(ui, fresh.ui)`, and the
// gameState defaults carried `docked` but NOT `dockedStationId`/`dockInRange`. Quit to menu
// while docked, start a new run, and the last berth's station id stayed latched for the whole
// session — `ui.docked` was false so every `docked === true` guard passed, but
// `capitalBossRuntime.observe` reads `dockedStationId != null` as a docked signal and parked a
// live capital fight until the player happened to dock and undock once.
//
// The fix declares both fields in the createGameState ui defaults, so the same Object.assign
// that resets `docked` clears them too — no special-case in the reset path.
//
// Harness note: `resetRunState` is module-private in src/main.js (boot-only imports make the
// module unimportable under node), so the real function body is sliced and driven here — the
// same seam crucible-run-state.test.mjs uses to pin its shape.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createBus } from '../src/core/eventBus.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { economy } from '../src/systems/economy.js';

const DT = 1 / 60;

function loadResetRunState() {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function resetRunState');
  assert.ok(start >= 0, 'resetRunState is declared in src/main.js');
  const nextFn = source.indexOf('\nfunction ', start + 1);
  const body = source.slice(start, nextFn === -1 ? undefined : nextFn);
  // eslint-disable-next-line no-new-func
  return new Function('createGameState', 'createTimeEffects', `${body}\nreturn resetRunState;`)(
    createGameState, createTimeEffects,
  );
}

test('a fresh GameState declares the dock session fields', () => {
  const ui = createGameState(1).ui;
  assert.equal(ui.docked, false);
  assert.equal(ui.dockedStationId, null, 'dockedStationId is declared so reset-by-assign can clear it');
  assert.equal(ui.dockInRange, false, 'dockInRange is declared so reset-by-assign can clear it');
});

test('resetRunState clears the quit-while-docked session flags', () => {
  const resetRunState = loadResetRunState();
  const state = createGameState(1234);
  // The menu-exit edge: docked at a berth, every dock session field live.
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.ui.dockInRange = true;
  resetRunState(state, { seed: 77 });
  assert.equal(state.ui.docked, false, 'docked clears');
  assert.equal(state.ui.dockedStationId, null, 'the last berth id must not leak into the new run');
  assert.equal(state.ui.dockInRange, false, 'the range latch must not leak into the new run');
});

test('economy.newGame() drops the session berth latches', () => {
  // Same boundary, system-instance side: `dock:undocked` clears _lastDockedStation /
  // _stationServiceBerth, but quit-while-docked → New Game skips the undock. Without the
  // newGame() clear, dockedStationId() keeps answering the old berth and the "fail closed
  // unless at a live berth" service gate fails open while the player is flying.
  const state = createGameState(5);
  const sys = Object.create(economy);
  sys.state = state;
  sys._lastDockedStation = 'station_helios';
  sys._stationServiceBerth = 'station_helios';
  sys.newGame();
  assert.equal(sys.dockedStationId(), null, 'no berth survives into the fresh run');
  assert.equal(sys._stationServicesDocked(), false, 'service gate must fail closed while flying');
  assert.equal(sys._lastDockedStation, null);
  assert.equal(sys._stationServiceBerth, null);
});

test('the undocked shape engages a live capital fight (no stale-dock suppression)', () => {
  const state = createGameState(4242);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(packet) { return packet; },
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const boss = {
    id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1,
  };
  state.entities.set(boss.id, boss);
  state.entityList.push(boss);
  const fightId = 'contract:capital_boss_hulk';
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  // The post-reset shape the fix produces: flying, and the session dock id is null.
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  const capSys = createProductionCapitalBossEncounters();
  capSys.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', {
    encounterId: 'capital_boss_hulk', fightId, bossId: boss.id, targetId: player.id,
  });
  for (let i = 0; i < 30; i++) { state.tick += 1; state.simTime += DT; capSys.update(DT); }
  const fight = state.capitalBossEncounters.fights[fightId];
  assert.equal(fight.started, true,
    'a live capital fight must engage while flying — a null dockedStationId is not a dock');
  assert.equal(fight.suspended, false);
  capSys.destroy();
});
