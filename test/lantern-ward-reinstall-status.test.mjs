import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { LANTERN_WARD_RECORD_IDS as IDS, LANTERN_WARD_LAMP_SERIAL as SERIAL } from '../src/data/lanternWardHardware.js';
import { restoreLanternWard, serializeLanternWard, lanternWardStatus } from '../src/systems/lanternWardWork.js';
import { lanternWardDialogueFacts } from '../src/data/lanternWardHail.js';
import { lanternWardWorkGuidance } from '../src/data/lanternWardGuidance.js';
import { projectLanternWard } from '../scripts/lib/npcJobsMirror.mjs';

test('Continue keeps a historically paid but disconnected lamp uninstalled before the first work tick', () => {
  const state = createGameState(7411), owner = { state };
  restoreLanternWard(owner, {
    version: 1, needsReinstall: true, lampMissing: false, receiverMissing: false,
    history: { installations: 1, playerCarried: true },
    objects: Object.fromEntries(Object.entries(IDS).map(([role, recordId]) => [role, { recordId, spawned: true, lost: false }])),
    firstCompletionReceipt: {
      receiptId: 'lantern-ward:venn-family-lamp:service:01', storyId: 'lw_helios_empty_plinth',
      lampRecordId: IDS.lamp, lampSerial: SERIAL, receiverRecordId: IDS.receiver,
      committed: true, count: 1, committedTick: 10, committedAtS: 1, playerHelped: true,
    },
  });
  const receipt = structuredClone(state.npcJobs.lanternWard.firstCompletionReceipt);
  for (const projection of [state, { npcJobs: { lanternWard: projectLanternWard(state.npcJobs.lanternWard) } }]) {
    assert.equal(lanternWardDialogueFacts(projection).installed, false);
    assert.equal(lanternWardWorkGuidance(projection).step, 'reconnect');
  }
  assert.equal(lanternWardStatus(owner).installed, false, 'the owner status must agree with the worker-facing dialogue');
  const saved = serializeLanternWard(owner);
  restoreLanternWard(owner, JSON.parse(JSON.stringify(saved)));
  assert.equal(lanternWardStatus(owner).installed, false, 'another Continue cannot turn paid history into current installation');
  assert.deepEqual(state.npcJobs.lanternWard.firstCompletionReceipt, receipt);
  assert.equal(state.npcJobs.lanternWard.history.installations, 1);
});
