// INF-076 — one rival escape earned, not teleported. The retreat branch flies a real
// egress (away-shaped helm, weapons cold, 6s + 1800 WU of genuine distance), the rival
// stays stoppable the whole way, and only the confirmed escape schedules the grudge
// return. The last gap was in the encounter host: on 'rival_escaped' the living boss
// hull was queued for the same retirement sweep as every other ending, so sector
// cleanup despawned the flight it had just verified. Now the escaped hull stays in
// the sector while its reservation bookkeeping is released.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createNemesisEncounterHost } from '../src/nemesis/encounterHost.js';

const BOSS_ID = 101;
const CREW_ID = 102;
const ENCOUNTER_ID = 'enc-escape-1';

function hull(id) {
  return {
    id, type: 'ship', alive: true, hull: 40, hullMax: 100, radius: 8, team: 1,
    pos: { x: 1900, y: 0, z: 0 }, vel: { x: 60, y: 0, z: 0 }, rot: 0,
    data: { nemesis: { encounterId: ENCOUNTER_ID } },
  };
}

function boot() {
  const state = createGameState(76);
  state.mode = 'flight';
  state.simTime = 500;
  state.playerId = 1;
  state.entities.set(1, {
    id: 1, type: 'ship', alive: true, pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 6, team: 0, flags: {}, data: {},
  });
  const removed = [];
  const released = [];
  const bus = createBus();
  const host = createNemesisEncounterHost({});
  host.init({
    state,
    bus,
    helpers: {
      removeEntity: (id) => { removed.push(id); state.entities.delete(id); },
      spawnBudget: {
        releaseSome: (requestId) => { released.push(['some', requestId]); },
        release: (requestId) => { released.push(['all', requestId]); },
      },
    },
  });
  state.nemesisDeployment.reservation = { requestId: ENCOUNTER_ID, ids: [BOSS_ID, CREW_ID] };
  state.entities.set(BOSS_ID, hull(BOSS_ID));
  state.entities.set(CREW_ID, hull(CREW_ID));
  return { state, bus, host, removed, released };
}

function endEncounter(harness, outcome) {
  harness.bus.emit('nemesis:encounterEnded', { encounterId: ENCOUNTER_ID, id: ENCOUNTER_ID, outcome });
  harness.host.update(0.016, harness.state);
}

test('a confirmed escape keeps the flown hull in the sector', () => {
  const again = boot();
  endEncounter(again, 'rival_escaped');
  const boss = again.state.entities.get(BOSS_ID);
  assert.ok(boss && boss.alive, 'the escaped rival hull stays live, not cleanup-despawned');
  assert.equal(again.state.entities.get(CREW_ID), undefined, 'the spent crew still retires');
  assert.ok(!again.removed.includes(BOSS_ID), 'cleanup never touched the escaped hull');
  const reservation = again.state.nemesisDeployment.reservation;
  assert.ok(!reservation || !reservation.ids.includes(BOSS_ID), 'the hull is freed from encounter bookkeeping');
});

test('a non-escape ending still retires the boss hull', () => {
  const harness = boot();
  endEncounter(harness, 'spared');
  assert.equal(harness.state.entities.get(BOSS_ID), undefined, 'spared boss still retires');
  assert.equal(harness.state.entities.get(CREW_ID), undefined, 'spared crew still retires');
});
