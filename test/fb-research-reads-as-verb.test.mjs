import assert from 'node:assert/strict';
import test from 'node:test';

import { TECH_NODES } from '../src/data/tech.js';
import {
  TECH_VERB_LADDER,
  STRICT_STAT_ONLY_IDS,
  VERB_UNLOCK_KEYS,
  classifyTechNode,
  countVerbVsStatOnly,
  nodeUnlocksVerb,
  verbForNodeId,
} from '../src/data/techVerbLadder.js';
import { techNodeReading } from '../src/ui/screens/techTree.js';

test('all 32 research nodes read as a verb', () => {
  assert.equal(TECH_NODES.length, 32, 'the authored tree holds 32 nodes');
  assert.equal(TECH_VERB_LADDER.length, 32);
  for (const node of TECH_NODES) {
    const verb = verbForNodeId(node.id);
    assert.equal(typeof verb, 'string', `${node.id} has a verb`);
    assert.ok(verb.length > 4, `${node.id} verb is a sentence, not an id`);
    assert.ok(!/^tech_/.test(verb), `${node.id} does not fall back to its own id`);
  }
});

test('strict classification is 32 verb / 0 stat-only', () => {
  const counts = countVerbVsStatOnly(TECH_NODES, 'strict');
  assert.equal(counts.verb, 32);
  assert.equal(counts.statOnly, 0);
  assert.deepEqual(counts.statOnlyIds, []);
  assert.deepEqual([...STRICT_STAT_ONLY_IDS], []);
});

test('the three logistics nodes classify by their live verb unlock keys', () => {
  for (const id of ['tech_drone_swarm', 'tech_autonomous_fleets', 'tech_outpost_charter']) {
    const node = TECH_NODES.find((n) => n.id === id);
    assert.ok(node, id);
    assert.equal(classifyTechNode(node, 'strict'), 'verb', id);
    assert.equal(nodeUnlocksVerb(node), true, id);
    const keys = Object.keys(node.unlocks || {});
    assert.ok(keys.some((k) => VERB_UNLOCK_KEYS.includes(k)),
      `${id} carries a verb unlock key, not only stats`);
  }
  // A hypothetical node carrying only a tier cap is still stat-only — caps are not verbs.
  assert.equal(nodeUnlocksVerb({ id: 'x', unlocks: { droneTierCap: 5 } }), false);
  assert.equal(nodeUnlocksVerb({ id: 'x', unlocks: { extraDronePerBay: 1 } }), true);
  assert.equal(nodeUnlocksVerb({ id: 'x', unlocks: { npcTraderHiring: false } }), false);
});

test('the screen reading prints the verb, with the efficiency rider as a second line', () => {
  for (const node of TECH_NODES) {
    const reading = techNodeReading(node);
    assert.equal(reading.verb, verbForNodeId(node.id), `${node.id} reads its ladder verb`);
    const hasEfficiency = !!(node.unlocks && node.unlocks.efficiency);
    assert.equal(reading.rider !== '', hasEfficiency,
      `${node.id} rider present exactly when efficiency is folded`);
    if (hasEfficiency) assert.match(reading.rider, /Bonuses: .+%/, `${node.id} rider is a % line`);
  }
  // Spot-check: hardened deflectors folds shieldRegenMult; drone swarm has no rider.
  const deflectors = techNodeReading(TECH_NODES.find((n) => n.id === 'tech_hardened_deflectors'));
  assert.match(deflectors.rider, /shieldRegenMult \+5%/);
  const swarm = techNodeReading(TECH_NODES.find((n) => n.id === 'tech_drone_swarm'));
  assert.equal(swarm.verb, 'Fly a second drone off one bay');
  assert.equal(swarm.rider, '');
});
