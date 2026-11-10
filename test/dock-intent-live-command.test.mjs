import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDockIntent, dockIntentStatus } from '../src/core/dockIntent.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
function setup(via) {
  const actor = { id: 1, occupantGeneration: 4, alive: true, hull: 10 };
  const station = { id: 2, occupantGeneration: 7, type: 'station', alive: true, data: { stationId: 'station_tethys' } };
  const state = { mode: 'flight', playerId: 1, entities: new Map([[1, actor], [2, station]]),
    entityList: [actor, station], world: { currentSectorId: 'sector_tethys_junction', enterSerial: 5 }, ui: {} };
  const receipt = createDockIntent(state, { stationId: 'station_tethys', ...(via ? { via } : {}) });
  const events = [], bus = { emit: (name, payload) => events.push([name, payload]) };
  return { actor, state, receipt, bus, events };
}
test('current live flight intent commits and remains valid for the post-commit observer', () => {
  const f = setup();
  assert.equal(dockIntentStatus(f.state, f.receipt), 'current');
  assert.equal(commitDockedUiState(f.state, f.receipt, f.bus), true);
  assert.equal(f.state.ui.docked, true);
  assert.equal(dockIntentStatus(f.state, f.receipt), 'current');
  assert.equal(f.events.length, 1);
});
const fences = {
  dead: f => { f.actor.alive = false; },
  depletedHull: f => { f.actor.hull = 0; },
  gameover: f => { f.state.mode = 'gameover'; },
  menu: f => { f.state.mode = 'menu'; },
  paused: f => { f.state.mode = 'paused'; },
  loading: f => { f.state.mode = 'loading'; },
  openMap: f => { f.state.ui.screenStack = ['map']; },
  blackout: f => { f.state.ui.fulfillmentBlackoutActive = true; },
  charging: f => { f.state.jump = { state: 'CHARGING' }; },
  jumping: f => { f.state.jump = { state: 'JUMPING' }; },
  sectorShell: f => { f.state.render = { sectorShellAdmission: true }; },
};
for (const [name, mutate] of Object.entries(fences)) test(`issued intent loses permission at the current ${name} fence`, () => {
  const f = setup();
  assert.equal(dockIntentStatus(f.state, f.receipt), 'current');
  mutate(f);
  const before = structuredClone(f.state.ui);
  assert.equal(dockIntentStatus(f.state, f.receipt), 'stale');
  assert.equal(commitDockedUiState(f.state, f.receipt, f.bus), false);
  assert.deepEqual(f.state.ui, before);
  assert.equal(f.events.length, 0);
});
test('root reproducer: same exact actor dies and reaches gameover before UI commit', () => {
  const f = setup();
  f.actor.alive = false; f.state.mode = 'gameover';
  assert.equal(commitDockedUiState(f.state, f.receipt, f.bus), false);
  assert.notEqual(f.state.ui.docked, true);
});
test('existing fresh-destination tow can finish through its presentation cook, but cannot revive a dead pilot', () => {
  const f = setup('tow');
  f.state.render = { sectorShellAdmission: true };
  assert.equal(commitDockedUiState(f.state, f.receipt, f.bus), true);
  const dead = setup('tow'); dead.actor.alive = false;
  assert.equal(commitDockedUiState(dead.state, dead.receipt, dead.bus), false);
});
test('legacy unbound compatibility does not upgrade into a current recognition receipt', () => {
  const f = setup(); f.state.mode = 'menu';
  const legacy = { stationId: 'station_tethys' };
  assert.equal(commitDockedUiState(f.state, legacy, f.bus), true);
  assert.equal(dockIntentStatus(f.state, legacy), 'unbound');
});
