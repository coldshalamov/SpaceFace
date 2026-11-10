// Scratch repro: quit-while-docked -> New Game leaves session dock fields stale.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createBus } from '../src/core/eventBus.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';

function loadResetRunState() {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function resetRunState');
  assert.ok(start >= 0, 'resetRunState exists in main.js');
  const nextFn = source.indexOf('\nfunction ', start + 1);
  const body = source.slice(start, nextFn === -1 ? undefined : nextFn);
  // eslint-disable-next-line no-new-func
  return new Function('createGameState', 'createTimeEffects', `${body}\nreturn resetRunState;`)(
    createGameState, createTimeEffects,
  );
}

test('repro: resetRunState leaves dock session fields stale', () => {
  const resetRunState = loadResetRunState();
  const state = createGameState(1234);
  // Quit-to-menu while docked at a station: ui.docked + dockedStationId + dockInRange live.
  state.ui.docked = true;
  state.ui.dockedStationId = 'station_helios';
  state.ui.dockInRange = true;
  resetRunState(state, { seed: 77 });
  console.log('after reset: docked=%j dockedStationId=%j dockInRange=%j',
    state.ui.docked, state.ui.dockedStationId, state.ui.dockInRange);
  assert.equal(state.ui.docked, false);
  assert.equal(state.ui.dockedStationId, null, 'dockedStationId must not leak into the new run');
  assert.equal(state.ui.dockInRange, false, 'dockInRange must not leak into the new run');
});

const DT = 1 / 60;
test('repro: stale dockedStationId suppresses a live capital fight', () => {
  const state = createGameState(4242);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw), off: raw.off.bind(raw), once: raw.once.bind(raw),
    emit(e, p) { emitted.push({ event: e, payload: p }); raw.emit(e, p); },
  };
  const helpers = {
    spawnBudget: makeBudgetApi(state),
    routeCombatDamage(p) { return p; },
    getCombatCapabilities() { return null; },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 0, z: 0 }, type: 'ship', team: 0 };
  state.entities.set(player.id, player); state.entityList.push(player); state.playerId = player.id;
  const boss = { id: state.nextEntityId++, alive: true, pos: { x: 300, z: 0 }, rot: 0, hull: 100, hullMax: 100, radius: 20, type: 'ship', team: 1 };
  state.entities.set(boss.id, boss); state.entityList.push(boss);
  const fightId = 'contract:capital_boss_hulk';
  state.missions.active.push({ id: fightId, status: 'active', destSectorId: 'contract_room' });
  state.world.currentSectorId = 'contract_room';
  // The post-fix shape: flying (ui.docked false) and the session dock id is cleared.
  state.ui.docked = false;
  state.ui.dockedStationId = null;
  const capSys = createProductionCapitalBossEncounters();
  capSys.init({ state, bus, helpers });
  bus.emit('capitalBoss:start', { encounterId: 'capital_boss_hulk', fightId, bossId: boss.id, targetId: player.id });
  for (let i = 0; i < 30; i++) { state.tick += 1; state.simTime += DT; capSys.update(DT); }
  const fight = state.capitalBossEncounters.fights[fightId];
  console.log('fight started=%j suspended=%j phase=%j', fight.started, fight.suspended, fight.phase);
  assert.equal(fight.started, true, 'capital fight should start while flying, not be parked by a stale dock id');
  capSys.destroy();
});
