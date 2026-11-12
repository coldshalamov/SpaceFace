import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { borrowedSun, ensureSunBook } from '../src/systems/borrowedSun.js';
import { save } from '../src/save/saveSystem.js';

test('the canonical save payload captures and restores the Borrowed Sun owner envelope', () => {
  const sim = createSimulation({ seed: 92, systems: [borrowedSun, save] });
  try {
    const owner = sim.registry.get('borrowedSun');
    const saveOwner = sim.registry.get('save');
    const book = ensureSunBook(sim.state);
    book.deeds = 3;
    book.leases.push({ id: 'lease-save-check', visitId: 1, costCr: 650, beatsTotal: 8,
      beatsPaid: 2, beatsMissed: 0, nextBeatAt: 123, state: 'open', openedAt: 45 });

    const data = saveOwner.serializeData();
    assert.equal(data.borrowedSun.book.deeds, 3);
    assert.equal(data.borrowedSun.book.leases[0].id, 'lease-save-check');
    const capture = saveOwner._saveCapturePlan().find(([key]) => key === 'borrowedSun');
    assert.ok(capture, 'the paced save plan includes the owner envelope');
    assert.deepEqual(capture[1](), data.borrowedSun);
    owner.newGame();
    saveOwner._callDeserialize('borrowedSun', data.borrowedSun);
    owner.afterContinue();
    assert.equal(owner._book().deeds, 3);
    assert.equal(owner._book().leases[0].beatsPaid, 2);
  } finally {
    sim.dispose();
  }
});
