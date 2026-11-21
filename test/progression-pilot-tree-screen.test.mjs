// The Pilot Tree screen's reading (progression lead 2026-11-20): what the dial shows per door, the
// tier chains and evolution bridges it draws, and the one verb the reading offers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { readPilotTree, pilotNodeReading } from '../src/ui/screens/pilotTree.js';

const adventure = (nodes, banked, points) => ({
  run: { kind: 'adventure', phase: 'inactive' },
  player: { pilot: { schema: 1, xp: 900, level: 5, points, nodes, banked, respecs: 0 } },
});

test('Adventure: every branch with live skills, capstones at depth 3, evolutions bridged across two branches', () => {
  const view = readPilotTree(adventure([], 2, {}));
  assert.equal(view.door, 'adventure');
  assert.ok(view.branches.some((b) => b.id === 'prospector'), 'Mining shows in Adventure');
  assert.ok(!view.branches.some((b) => b.id === 'trader'), 'a branch with no live skill is not drawn');
  const gold = view.nodes.find((n) => n.id === 'gunner_gold_thread');
  const execution = view.nodes.find((n) => n.id === gold.prereqs[0]);
  assert.equal(execution.card.tier, 3, 'the capstone hangs off tier 3');
  const saw = view.nodes.find((n) => n.id === 'evolution_orbital_saw');
  assert.deepEqual(saw.prereqs.map((id) => view.nodes.find((n) => n.id === id).branch), ['gunner', 'rigger'], 'a bridge between two sectors');
});

test('the reading: one line, what it needs, and Take it only when a point can buy it', () => {
  const view = readPilotTree(adventure(['gunner_steady_hands'], 1, { gunner: 1 }));
  const drum = pilotNodeReading(view, 'gunner_drum');
  assert.equal(drum.action.enabled, true);
  assert.equal(drum.action.label, 'Take it');
  assert.equal(drum.kicker, 'Guns · tier II');
  const ricochet = pilotNodeReading(view, 'gunner_ricochet');
  assert.equal(ricochet.action.enabled, false);
  assert.equal(ricochet.action.label, 'Needs 2 more points in Guns');
  const broke = readPilotTree(adventure(['gunner_steady_hands'], 0, { gunner: 1 }));
  assert.equal(pilotNodeReading(broke, 'gunner_drum').action.label, 'Earn a level to take it');
  assert.equal(pilotNodeReading(view, 'gunner_steady_hands').action.label, 'Yours');
});

test('Swarm: the run\'s own record, read-only, and Run Over says what the run did not take', () => {
  const state = {
    run: { kind: 'survival', phase: 'active', level: 3, xp: 80, pilot: { points: { bruiser: 2 }, nodes: ['bruiser_heavy_slugs', 'bruiser_stagger'], banked: 1, offer: null } },
    player: { pilot: { nodes: ['gunner_drum'], points: { gunner: 1 }, banked: 3 } },
  };
  const view = readPilotTree(state);
  assert.equal(view.door, 'swarm');
  assert.ok(!view.branches.some((b) => b.id === 'prospector'), 'no work branches in a run');
  assert.equal(view.standing.gunner_drum.state, 'locked', 'the Adventure record never shows in a run');
  assert.equal(pilotNodeReading(view, 'bruiser_billiards').action.label, 'Pick it from the level-up cards');
  state.run.phase = 'ended';
  assert.equal(pilotNodeReading(readPilotTree(state), 'bruiser_billiards').action.label, 'Not taken this run');
});
