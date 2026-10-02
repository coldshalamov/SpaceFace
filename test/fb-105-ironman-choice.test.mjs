import assert from 'node:assert/strict';
import test from 'node:test';

import { ironmanChoiceChange, stampIronmanLatch } from '../src/save/ironmanChoice.js';

function run(difficulty, simTime, locked = false) {
  return {
    simTime,
    settings: {
      gameplay: {
        difficulty,
        ...(locked ? { ironmanChoiceLocked: true } : {}),
      },
    },
  };
}

test('a new game can still choose Ironman, and a started run cannot cross that line', () => {
  const fresh = run('standard', 0);
  const into = ironmanChoiceChange(fresh, 'ironman');
  assert.equal(into.ok, true);
  assert.equal(into.needsConfirm, true);

  const veteran = ironmanChoiceChange(fresh, 'veteran');
  assert.equal(veteran.ok, true);
  assert.equal(veteran.needsConfirm, false);

  const started = run('standard', 30);
  const closed = ironmanChoiceChange(started, 'ironman');
  assert.equal(closed.ok, false);
  assert.equal(closed.reason, 'ironman_closed');

  const iron = run('ironman', 30);
  const locked = ironmanChoiceChange(iron, 'standard');
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, 'ironman_locked');

  const sameBand = ironmanChoiceChange(started, 'casual');
  assert.equal(sameBand.ok, true);
  assert.equal(sameBand.needsConfirm, false);
});

test('a save with playtime stamps the latch and does not stamp a brand-new game', () => {
  const played = { gameplay: { difficulty: 'standard' } };
  stampIronmanLatch(played, 12);
  assert.equal(played.gameplay.ironmanChoiceLocked, true);

  const fresh = { gameplay: { difficulty: 'ironman' } };
  stampIronmanLatch(fresh, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(fresh.gameplay, 'ironmanChoiceLocked'), false);
});
