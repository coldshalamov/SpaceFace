import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBank, bankFraction, bossWasCleared, emptyHangar } from '../src/data/swarmHangar.js';
import { SWARM_BOSS_FIRST, isSwarmBossWave } from '../src/data/swarmMode.js';
import { swarmCheckpointStartWave } from '../src/data/swarmLadder.js';
import { canExtract, partialBankOffer } from '../src/systems/survivalExtraction.js';
import { emptyCrucibleProfile, settleCrucibleRun } from '../src/systems/survivalRecords.js';

test('the earned first champion unlocks full banking at the authored round-five boundary', () => {
  assert.equal(SWARM_BOSS_FIRST, 5);
  for (const cleared of [0, 1, 4, 5, 6, 7, 9, 10, 14, 15, 20, 25]) {
    const clearedBoss = Array.from({ length: cleared }, (_, index) => index + 1)
      .some(isSwarmBossWave);
    assert.equal(bossWasCleared({ wavesCleared: cleared }), clearedBoss, `cleared ${cleared}`);
    assert.equal(bankFraction({ outcome: 'extracted', wavesCleared: cleared }),
      clearedBoss ? 1 : 0.5, `cash-out after ${cleared}`);
  }
});

test('a boss encountered or killed before its round clears does not count as a cleared round', () => {
  assert.equal(bossWasCleared({ wave: 5, wavesCleared: 4 }), false);
  assert.equal(bankFraction({ outcome: 'extracted', wave: 5, wavesCleared: 4 }), 0.5);
  assert.equal(bossWasCleared({ wave: 5 }), true, 'legacy completed-wave field still works');
  assert.equal(bossWasCleared({ wave: 5, wavesCleared: 0 }), false);
});

test('death still banks half and retirement still pays no unbanked purse after the first boss', () => {
  for (const outcome of ['dead', 'died', 'death']) {
    assert.equal(bankFraction({ outcome, cashOut: true, wavesCleared: 5 }), 0.5);
  }
  assert.equal(bankFraction({ outcome: 'aborted', wavesCleared: 5 }), 0);
});

test('post-boss settlement preserves secured credits and settles the run only once', () => {
  const result = { runId: 'foundry-five', outcome: 'extracted', wavesCleared: 5,
    credits: 101, securedCredits: 40 };
  const first = applyBank(emptyHangar(), result);
  assert.equal(first.banked, 141);
  assert.equal(first.cashOut, true);
  const duplicate = applyBank(first.hangar, result);
  assert.equal(duplicate.banked, 0);
  assert.equal(duplicate.hangarBounty, 141);
  assert.equal(duplicate.duplicate, true);
  const early = applyBank(emptyHangar(), { ...result, wavesCleared: 4 });
  assert.equal(early.banked, 90, 'only the unbanked remainder is halved and rounded down');
});

test('the existing round-ten extraction settles the earned first boss through the real record owner', () => {
  const result = { runId: 'foundry-ten-extraction', seed: 4242, arenaId: 'helios_core',
    outcome: 'extracted', cashOut: true, wave: 10, wavesCleared: 10,
    credits: 137, score: 900, kills: 50, xp: 0, picks: [] };
  const run = { kind: 'survival', ruleset: 'swarm', seed: 4242, wave: 10,
    telemetry: { securedBounty: 63 } };
  const settled = settleCrucibleRun({ result, run, profile: emptyCrucibleProfile(), storage: null });
  assert.equal(settled.result.bankedBounty, 200);
  assert.equal(settled.result.hangarBounty, 200);
  assert.equal(settled.result.cashOut, true);
  assert.equal(settled.result.score, 900, 'banking does not spend performance score');
});

test('bank eligibility does not invent extraction or checkpoint access at round six', () => {
  for (const wave of [5, 6, 7]) {
    for (const phase of ['active', 'cleanup', 'draft', 'refit']) {
      const run = { kind: 'survival', ruleset: 'swarm', wave, phase, credits: 200 };
      assert.equal(canExtract(run), false, `${wave}/${phase}`);
      assert.equal(partialBankOffer(run), null);
    }
  }
  assert.equal(canExtract({ kind: 'survival', ruleset: 'swarm', wave: 10, phase: 'refit' }), true);
  assert.equal(swarmCheckpointStartWave(1), 11);
});
