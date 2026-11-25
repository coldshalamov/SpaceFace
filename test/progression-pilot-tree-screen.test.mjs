// The Pilot Tree screen's reading (progression lead 2026-11-20): what the dial shows per door, the
// tier chains and evolution bridges it draws, and the one verb the reading offers.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pilotTreeIntro, readPilotTree, pilotNodeReading } from '../src/ui/screens/pilotTree.js';

const adventure = (nodes, banked, points) => ({
  run: { kind: 'adventure', phase: 'inactive' },
  player: { pilot: { schema: 1, xp: 900, level: 5, points, nodes, banked, respecs: 0 } },
});

test('Adventure: every branch with live skills, capstones at depth 3, evolutions bridged across two branches', () => {
  const view = readPilotTree(adventure([], 2, {}));
  assert.equal(view.door, 'adventure');
  assert.ok(view.branches.some((b) => b.id === 'prospector'), 'Mining shows in Adventure');
  assert.ok(view.branches.some((b) => b.id === 'trader') && view.branches.some((b) => b.id === 'builder'), 'Trading and Building show in Adventure');
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
  assert.equal(drum.stateLabel, 'Available');
  assert.equal(drum.cost, '1 point');
  assert.equal(drum.prerequisite, 'Opened with 2 points in Guns');
  assert.equal(drum.doorLine, 'Your pilot. It stays');
  const ricochet = pilotNodeReading(view, 'gunner_ricochet');
  assert.equal(ricochet.action.enabled, false);
  assert.equal(ricochet.action.label, 'Locked');
  assert.equal(ricochet.stateLabel, 'Locked');
  assert.equal(ricochet.prerequisite, 'Needs 2 more points in Guns');
  assert.equal(ricochet.cost, '1 point');
  assert.match(ricochet.effect, /bounce/);
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
  assert.match(pilotTreeIntro(view), /Swarm run/);
  assert.doesNotMatch(pilotTreeIntro(view), /Adventure/);
  assert.equal(pilotNodeReading(view, 'bruiser_heavy_slugs').stateLabel, 'Yours');
  assert.equal(pilotNodeReading(view, 'bruiser_billiards').stateLabel, 'Not taken');
  assert.equal(pilotNodeReading(view, 'bruiser_heavy_slugs').doorLine, 'This run only. Cards spend the points');
});

test('a fresh Adventure pilot is an honest start: no fake progress and no empty not-yet rows', () => {
  const view = readPilotTree({ run: { kind: 'adventure', phase: 'inactive' }, player: {} });
  const intro = pilotTreeIntro(view);
  assert.match(intro, /Adventure/);
  assert.match(intro, /No skills yet/);
  assert.match(intro, /100 XP/);
  assert.doesNotMatch(intro, /not yet/i);
  assert.doesNotMatch(intro, /\b0 XP/);
  assert.equal(view.taken, 0);
  assert.equal(view.banked, 0);
  assert.equal(view.level, 1);
  const first = pilotNodeReading(view, view.nodes[0].id);
  assert.equal(first.stateLabel, 'Available');
  assert.equal(first.cost, '1 point');
  assert.equal(first.prerequisite, 'No earlier skill');
  assert.equal(first.doorLine, 'Your pilot. It stays');
  assert.ok(first.effect.length > 8);
});

test('every visible node states a real effect, cost, prerequisite and state, with no internal ids', () => {
  const doors = [
    readPilotTree(adventure([], 0, {})),
    readPilotTree({
      run: { kind: 'survival', phase: 'active', level: 1, xp: 0, pilot: { points: {}, nodes: [], banked: 0, offer: null } },
      player: { pilot: { nodes: ['gunner_drum'], points: { gunner: 1 }, banked: 3, level: 4, xp: 400 } },
    }),
  ];
  const swarmFresh = doors[1];
  assert.match(pilotTreeIntro(swarmFresh), /No skills yet/);
  assert.match(pilotTreeIntro(swarmFresh), /level-up cards/);
  assert.doesNotMatch(pilotTreeIntro(swarmFresh), /Adventure/);
  assert.notEqual(pilotNodeReading(swarmFresh, 'gunner_drum').stateLabel, 'Yours');
  for (const view of doors) {
    for (const node of view.nodes) {
      const reading = pilotNodeReading(view, node.id);
      assert.ok(reading.effect && reading.effect.length > 8, node.id);
      assert.match(reading.cost, /point/, node.id);
      assert.ok(reading.prerequisite && reading.prerequisite.length > 3, node.id);
      assert.ok(['Yours', 'Available', 'Locked', 'Not taken'].includes(reading.stateLabel), node.id);
      const blob = [reading.name, reading.kicker, reading.effect, reading.cost, reading.prerequisite, reading.stateLabel, reading.doorLine, reading.action.label, reading.build || ''].join(' ');
      assert.doesNotMatch(blob, /not yet/i, node.id);
      assert.doesNotMatch(blob, /\b[a-z]+_[a-z0-9_]+\b/, node.id);
    }
  }
});
