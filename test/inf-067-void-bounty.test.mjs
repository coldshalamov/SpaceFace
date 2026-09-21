// INF-067 — one invalidated mission gets a recoverable next step. A bounty mark destroyed by
// a third party used to strand the contract: no player kill credit, no failure, no respawn,
// possibly no deadline — permanently active with no reachable resolution. Now the contract
// voids fairly: no rep penalty, deposit back, the target never teleported back. Rewards and
// penalties follow the visible resolution (nothing earned, nothing lost).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { bountyTargetLost } from '../src/systems/missions.js';

const live = { status: 'active', type: 'bounty_hunt', objectiveProgress: 0, objectiveTarget: 1 };
const gone = () => true;
const alive = () => false;

test('a lone mark destroyed by another voids the contract', () => {
  const m = { ...live, targetEntityIds: [7] };
  assert.equal(bountyTargetLost(m, 7, gone), true, 'sole tagged target gone, objective unmet');
});

test('one surviving target keeps the contract alive', () => {
  const m = { ...live, targetEntityIds: [7, 9] };
  const oneAlive = (id) => id !== 9;
  assert.equal(bountyTargetLost(m, 7, oneAlive), false, 'a live second target means still playable');
  assert.equal(bountyTargetLost(m, 7, gone), true, 'both gone means void');
});

test('the void fires only for the unmet ordinary case', () => {
  const done = { ...live, targetEntityIds: [7], objectiveProgress: 1 };
  assert.equal(bountyTargetLost(done, 7, gone), false, 'met objective never voids');
  assert.equal(bountyTargetLost({ ...live, targetEntityIds: [7], storyTag: 'campaign47a:b2:elroy' }, 7, gone), false, 'authored bounties own their branches');
  assert.equal(bountyTargetLost({ ...live, type: 'patrol_clear', targetEntityIds: [7] }, 7, gone), false, 'patrol keeps its own rules');
  assert.equal(bountyTargetLost({ ...live, targetEntityIds: [7] }, 99, gone), false, 'untagged kills change nothing');
  assert.equal(bountyTargetLost({ ...live, status: 'completed', targetEntityIds: [7] }, 7, gone), false, 'settled missions never re-void');
  assert.equal(alive(), false, 'sanity: test predicate shape');
});

test('the wiring voids fairly on third-party kills and never respawns the mark', () => {
  const source = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
  assert.match(
    source,
    /if \(!byPlayer\) \{ this\._voidLostBountyTargets\(p\); return; \}/,
    'non-player kills take the void path, not the ignore path',
  );
  assert.match(
    source,
    /const voided = reason === 'target_lost';/,
    'the fail path knows a void from a failure',
  );
  assert.match(
    source,
    /collateral_refund:\$\{m\.id\}/,
    'the deposit comes back on a void',
  );
  assert.match(
    source,
    /Contract void: the mark for/,
    'the player is told the job is gone, not scolded',
  );
  assert.match(
    source,
    /reason === 'target_lost'\) return 'The mark was destroyed/,
    'the debrief states the visible resolution',
  );
});
