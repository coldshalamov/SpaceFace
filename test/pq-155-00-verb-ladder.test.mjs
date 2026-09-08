// PQ-155.00 — hour → verb → cost → gate. Stat-only leftovers stay ≤ 12 and justified.
import assert from 'node:assert/strict';
import test from 'node:test';

import { NEW_GAME } from '../src/data/newGameDefaults.js';
import {
  TECH_NODES,
  TECH_STAT_ONLY_IDS,
  TECH_STAT_ONLY_JUSTIFICATION,
  VERB_LADDER,
  techNodeKind,
  techUnlocksVerb,
} from '../src/data/tech.js';

test('PQ-155.00 every tech node is a verb or a justified stat-only leftover', () => {
  assert.equal(TECH_NODES.length, 32);
  const stat = TECH_NODES.filter((node) => techNodeKind(node) === 'stat');
  const verb = TECH_NODES.filter((node) => techNodeKind(node) === 'verb');
  assert.equal(stat.length + verb.length, 32);
  assert.ok(stat.length <= 12, `stat-only ${stat.length} > 12`);
  assert.deepEqual(stat.map((node) => node.id).sort(), [...TECH_STAT_ONLY_IDS].sort());
  for (const id of TECH_STAT_ONLY_IDS) {
    assert.ok(TECH_STAT_ONLY_JUSTIFICATION[id], `${id} needs a justification`);
    const node = TECH_NODES.find((row) => row.id === id);
    assert.equal(techUnlocksVerb(node), false, `${id} must not unlock a module/ship/flag`);
  }
  console.log(JSON.stringify({
    nodes: TECH_NODES.length,
    verb: verb.length,
    stat: stat.length,
    statIds: stat.map((node) => node.id),
  }));
});

test('PQ-155.00 verb ladder maps ten hours and shows the 15-minute first-upgrade gap', () => {
  const ids = new Set(TECH_NODES.map((node) => node.id));
  assert.ok(VERB_LADDER.length >= 11, 'gap row plus hours 1–10');
  const first = VERB_LADDER[0];
  assert.equal(first.hour, 0.25);
  assert.equal(first.reachable, false);
  assert.equal(first.nodeId, 'tech_combat_basics');
  assert.ok(first.cost.credits > NEW_GAME.credits);
  assert.ok(first.cost.rp > (NEW_GAME.researchPoints || 0));
  assert.match(first.gate, /15 min/i);

  const hours = VERB_LADDER.filter((row) => row.reachable);
  assert.deepEqual(hours.map((row) => row.hour), [1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(hours[0].nodeId, 'tech_combat_basics');
  for (const row of VERB_LADDER) {
    assert.ok(ids.has(row.nodeId), `${row.nodeId} must be a live tech node`);
    assert.ok(Number.isFinite(row.cost.credits) && Number.isFinite(row.cost.rp));
    assert.ok(typeof row.gate === 'string' && row.gate.length > 0);
    if (row.reachable) assert.ok(typeof row.verb === 'string' && row.verb.length > 0);
  }
  console.log('PQ-155.00 ladder', JSON.stringify(VERB_LADDER.map((row) => ({
    hour: row.hour, verb: row.verb, nodeId: row.nodeId, reachable: row.reachable,
  }))));
});
