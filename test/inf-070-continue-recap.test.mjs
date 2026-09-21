// INF-070 — Continue restores the player's intention. The recap reads restored state only:
// the tracked active objective in the one shared wording, the current sector, and one
// unresolved risk (blocking term, then clock, then hull). It emits nothing, so it can never
// replay a reward; the single comms popup is dismissible, non-modal, and leaves controls free.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { continueRecap } from '../src/ui/screens/missionLog.js';
import { SECTORS } from '../src/data/sectors.js';

const sectorId = SECTORS[0].id;
const sectorName = SECTORS[0].name;

function stateWith({ missions = [], trackedId = null, simTime = 1000, hull = 100, hullMax = 100 } = {}) {
  return {
    simTime,
    playerId: 1,
    entities: new Map([[1, { id: 1, hull, hullMax }]]),
    world: { currentSectorId: sectorId },
    ui: { trackedMissionId: trackedId },
    missions: { active: missions },
  };
}

const escort = {
  id: 'm_1',
  type: 'escort',
  status: 'active',
  title: 'Convoy screen',
  destStationId: 'station_helios',
  objectiveProgress: 0,
  objectiveTarget: 1,
  params: {},
};

test('the recap names the tracked objective and the current sector', () => {
  const recap = continueRecap(stateWith({ missions: [escort], trackedId: 'm_1' }));
  assert.match(recap.objective, /Convoy screen/, 'the active objective leads');
  assert.match(recap.objective, /Escort to/, 'the shared wording, not a copy');
  assert.equal(recap.location, sectorName, 'the restored sector, not the last run');
  assert.equal(recap.risk, null, 'no risk invented when the state is clean');
});

test('one unresolved risk surfaces: blocking term, then clock, then hull', () => {
  const held = {
    ...escort,
    type: 'cargo_delivery',
    clauses: [{ conditionId: 'soft_berth' }],
  };
  const heldRecap = continueRecap(stateWith({ missions: [held], trackedId: 'm_1' }));
  assert.match(heldRecap.risk, /^Held:/, 'a blocking term is the risk');
  assert.match(heldRecap.risk, /alongside/i, 'the live pending text, not a generic warning');

  const timed = { ...escort, title: 'Rush job', deadline_s: 1090 };
  const timedRecap = continueRecap(stateWith({ missions: [timed], trackedId: 'm_1', simTime: 1000 }));
  assert.match(timedRecap.risk, /^Clock:/, 'a tight clock is the risk when nothing blocks');

  const hurtRecap = continueRecap(stateWith({ hull: 20, hullMax: 100 }));
  assert.match(hurtRecap.risk, /Hull critical/, 'a critical hull is the risk with no mission');
});

test('silence when there is nothing to restore, and no completed missions leak in', () => {
  assert.equal(continueRecap(stateWith({})), null, 'empty state says nothing');
  const done = { ...escort, status: 'completed' };
  const recap = continueRecap(stateWith({ missions: [done], trackedId: 'm_1' }));
  assert.equal(recap && recap.objective, null, 'settled missions never recap as intention');
});

test('the recap speaks once on load through the dismissible comms surface', () => {
  const source = readFileSync(new URL('../src/systems/onboarding.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /this\._speakContinueRecap\(p\);/,
    'the returning-pilot path speaks the recap',
  );
  const method = source.slice(source.indexOf('_speakContinueRecap(payload)'));
  assert.match(method, /continueRecap\(this\.state\)/, 'the recap reads restored state');
  assert.match(method, /comms:popup/, 'it rides the existing dismissible comms surface');
  assert.ok(!method.includes('economy:') && !method.includes('faction:'), 'no reward or rep intent can replay');
  assert.ok(!method.includes("mode:changed") && !method.includes("state.mode"), 'no mode change — controls stay free');
});
