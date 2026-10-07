// PB-287 (SF-246) — the mission log's Next line derives from missionNextActionRow's phase,
// not the static per-type switch. A short carry names its shortfall, a blocking clause names
// its term, a berth in another sector names the travel, and a bounty whose marks are all dead
// stops pointing at them. Authored set-piece lines keep their wording; every ordinary phase
// keeps the legacy line. Proven through missionCommandBrief().how — the string the log and the
// TRACKED command card print — on a fixed seed.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { missionCommandBrief } from '../src/ui/screens/missionLog.js';

const SEED = 4242;
const ROOT = join(import.meta.dirname, '..');

function makeState({ simTime = 420 } = {}) {
  return {
    meta: { seed: SEED },
    simTime,
    playerId: 1,
    player: {
      credits: 5000,
      cargo: { items: {}, capVolume: 40, capMass: 60 },
      stats: {},
      tradeLedger: [],
      tradeLots: {},
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { trackedMissionId: null },
    missions: { active: [] },
  };
}

function mission(overrides = {}) {
  return {
    id: 'm_delivery',
    status: 'active',
    title: 'Iron for Ceres',
    type: 'cargo_delivery',
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres',
    reward_cr: 900,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 10 },
    ...overrides,
  };
}

/** The line the log's Next slot and the command brief's "how" share, prefix stripped. */
function nextLine(state, m) {
  const brief = missionCommandBrief(m, state);
  return brief && brief.how;
}

test('PB-287: a short carry names the shortfall and the settle-short branch', () => {
  const state = makeState();
  const m = mission();
  state.missions.active = [m];
  state.player.cargo.items.cmdty_ore_iron = 3;

  const how = nextLine(state, m);
  assert.match(how, /\b7\b/, 'the shortfall is counted, not just flagged');
  assert.match(how, /short/i, 'the hold being short is said plainly');
  assert.match(how, /settle 3/, 'the partial-manifest branch names what could settle now');
  // The legacy line never learned any of this — it would promise a simple handover.
  assert.doesNotMatch(how, /dock, and hand over/);
});

test('PB-287: a blocking contract term names its own text before anything else', () => {
  const state = makeState();
  const m = mission({ clauses: [{ conditionId: 'soft_berth' }] });
  state.missions.active = [m];
  state.player.cargo.items.cmdty_ore_iron = 12; // cargo satisfied — the clause still leads

  const how = nextLine(state, m);
  // soft_berth's authored pending text IS the instruction; the line names the term itself.
  assert.match(how, /Hold alongside/i);
  assert.doesNotMatch(how, /dock, and hand over/);
});

test('PB-287: a berth in another sector names the travel first', () => {
  const state = makeState();
  const m = mission({ type: 'passenger_transport', params: {} });
  state.missions.active = [m];

  const how = nextLine(state, m);
  assert.match(how, /^travel to /i, 'the first act is the crossing, not the handover');
  assert.match(how, /sector over/i);
  // Once the pilot stands in the destination sector the berth line returns.
  state.world.currentSectorId = 'sector_ceres';
  assert.match(nextLine(state, m), /dock, and hand over/);
});

test('PB-287: a bounty whose named targets are all dead stops pointing at them', () => {
  const state = makeState();
  const m = mission({
    id: 'm_bounty',
    type: 'bounty_hunt',
    destStationId: null,
    destSectorId: null,
    params: {},
    objectiveTarget: 2,
    objectiveProgress: 0,
    targetEntityIds: ['e1', 'e2'],
  });
  state.missions.active = [m];
  state.entities = new Map([
    ['e1', { id: 'e1', alive: false }],
    ['e2', { id: 'e2', alive: false }],
  ]);

  const how = nextLine(state, m);
  assert.match(how, /no marked target remains/i);
  assert.match(how, /report/i);
  // The legacy bounty line would still send the pilot after corpses.
  assert.doesNotMatch(how, /take down the target/i);

  // A live target puts the hunt back on the legacy line.
  state.entities.get('e2').alive = true;
  assert.match(nextLine(state, m), /take down the target/i);
});

test('PB-287: authored set-piece lines keep their wording untouched', () => {
  const state = makeState();
  const m = mission({
    id: 'm_wreck',
    type: 'salvage_retrieval',
    params: {
      setPieceObjective: 'long_read_fence',
      wreckChoiceId: 'scrap_sale',
      wreckName: 'the Hulk of the Verity',
    },
  });
  state.missions.active = [m];

  const how = nextLine(state, m);
  assert.match(how, /confirm .* for the Hulk of the Verity/i);
  assert.match(how, /disposition receipt, not a freight handoff/i);
});

test('PB-287: an ordinary satisfied carry keeps the legacy handover line', () => {
  const state = makeState();
  const m = mission({ destStationId: 'station_helios', destSectorId: 'sector_helios_prime' });
  state.missions.active = [m];
  state.player.cargo.items.cmdty_ore_iron = 10;

  const how = nextLine(state, m);
  assert.match(how, /follow tracked nav/i);
  assert.match(how, /dock, and hand over the cargo\./);
});

test('PB-287: the live route consumes the shared row — every Next call passes state', () => {
  const src = readFileSync(join(ROOT, 'src/ui/screens/missionLog.js'), 'utf8');
  assert.ok(src.includes("from '../sim/missionNextAction.js'"),
    'the log derives through the sim read model, not a reimplementation');
  const calls = src.match(/nextStepText\([^)]*\)/g) || [];
  assert.equal(calls.length, 4, 'three consumers plus the signature');
  for (const call of calls) {
    assert.ok(call.includes('state'), `every Next line derives with live state: ${call}`);
  }
});
