// The Pilot Tree can be climbed to the top: every live node, every capstone and every evolution is
// reachable by taking picks, in both doors, and a banked pick always has a card to spend on.
// (Progression lead 2026-11-20: cutting the dead nodes must never strand a capstone.)
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PILOT_LIVE_NODE_IDS } from '../src/data/pilotLive.js';
import {
  PILOT_BRANCHES,
  PILOT_EVOLUTIONS,
  PILOT_NODES,
  eligiblePilotCards,
  pilotNodeStanding,
  pilotPicksRemaining,
} from '../src/data/pilotTree.js';

function climb(door, order) {
  const pilot = { points: {}, nodes: [], banked: 0, offer: null };
  for (let guard = 0; guard < 500; guard++) {
    const remaining = pilotPicksRemaining(pilot, door);
    const open = eligiblePilotCards(pilot, door);
    if (remaining > 0) assert.ok(open.length > 0, `${door}: ${remaining} picks left but nothing to take (${pilot.nodes.join(', ')})`);
    if (!open.length) break;
    const card = order(open);
    pilot.nodes.push(card.id);
    if (card.kind !== 'evolution') pilot.points[card.branch] = (pilot.points[card.branch] || 0) + 1;
  }
  return pilot;
}

for (const door of ['swarm', 'adventure']) {
  test(`${door}: greedy climbs (first card, last card) reach every live node and evolution`, () => {
    const inDoor = (node) => door === 'adventure'
      || !PILOT_BRANCHES.find((b) => b.id === node.branch).adventureOnly;
    const want = [
      ...PILOT_NODES.filter((n) => PILOT_LIVE_NODE_IDS.has(n.id) && inDoor(n)).map((n) => n.id),
      ...PILOT_EVOLUTIONS.filter((e) => PILOT_LIVE_NODE_IDS.has(e.id)).map((e) => e.id),
    ].sort();
    for (const order of [(cards) => cards[0], (cards) => cards[cards.length - 1]]) {
      const pilot = climb(door, order);
      assert.deepEqual([...pilot.nodes].sort(), want, `${door}: the whole live tree is reachable`);
    }
  });
}

test('every live id is a real node or evolution, and every combat capstone is live', () => {
  const ids = new Set([...PILOT_NODES.map((n) => n.id), ...PILOT_EVOLUTIONS.map((e) => e.id)]);
  for (const id of PILOT_LIVE_NODE_IDS) assert.ok(ids.has(id), `${id} is in the tree`);
  for (const branch of PILOT_BRANCHES.filter((b) => !b.adventureOnly)) {
    const cap = PILOT_NODES.find((n) => n.branch === branch.id && n.tier === 'capstone');
    assert.ok(cap && PILOT_LIVE_NODE_IDS.has(cap.id), `${branch.name}: a live capstone`);
  }
});

test('the tree screen standing names what a locked node needs, in words', () => {
  const pilot = { points: { gunner: 1 }, nodes: ['gunner_steady_hands'], banked: 0, offer: null };
  const find = (id) => [...PILOT_NODES, ...PILOT_EVOLUTIONS].find((n) => n.id === id);
  assert.deepEqual(pilotNodeStanding(find('gunner_steady_hands'), pilot, 'swarm'), { state: 'taken', needs: '' });
  assert.equal(pilotNodeStanding(find('gunner_drum'), pilot, 'swarm').state, 'open');
  assert.deepEqual(pilotNodeStanding(find('gunner_ricochet'), pilot, 'swarm'), { state: 'locked', needs: 'Needs 2 more points in Guns' });
  assert.deepEqual(pilotNodeStanding(find('ghost_ambush'), pilot, 'swarm'), { state: 'locked', needs: 'Needs Cloak first' });
  assert.equal(pilotNodeStanding(find('evolution_orbital_saw'), pilot, 'swarm').needs, 'Needs 4 points in Guns and in Line');
});
