import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { lanternWardHardwareSpec, lanternWardCanonicalAnchor, LANTERN_WARD_RECORD_IDS as IDS,
  LANTERN_WARD_LAMP_SERIAL as SERIAL } from '../src/data/lanternWardHardware.js';
import { lanternWardActorSpec } from '../src/world/lanternWardActors.js';
import { restoreLanternWard, serializeLanternWard, stepLanternWard, lanternWardStatus } from '../src/systems/lanternWardWork.js';
import { lanternWardWorkGuidance } from '../src/data/lanternWardGuidance.js';
import { lanternWardDialogueFacts } from '../src/data/lanternWardHail.js';
import { selectLanternWardDialogue } from '../src/missions/lanternWardStory.js';
import { projectLanternWard } from '../scripts/lib/npcJobsMirror.mjs';

// Restored historical service is fixture input, not a newly performed service. This
// checks that missing live hardware cannot borrow that history as current success.
function restoredService({ missingReceiver = true, missingLamp = false } = {}) {
  const state = createGameState(7411);
  state.mode = 'flight'; state.world.currentSectorId = 'sector_helios_prime'; state.tick = 1;
  const events = [];
  const owner = { state, bus: { emit: (...event) => events.push(event) } };
  const lamp = { ...lanternWardHardwareSpec('lamp'), id: 2, occupantGeneration: 1 };
  const receiver = { ...lanternWardHardwareSpec('receiver'), id: 3, occupantGeneration: 1 };
  const tug = { ...lanternWardActorSpec('tug', lanternWardCanonicalAnchor()), id: 4, occupantGeneration: 1 };
  lamp.data.lanternWardLit = true; receiver.data.lanternWardLit = true;
  const actors = [tug, ...(!missingLamp ? [lamp] : []), ...(!missingReceiver ? [receiver] : [])];
  state.entities = new Map(actors.map(entity => [entity.id, entity])); state.entityList = actors;
  restoreLanternWard(owner, {
    version: 1, phase: 'installed', history: { installations: 1, playerCleared: true },
    objects: Object.fromEntries(Object.entries(IDS).map(([role, recordId]) => [role, { recordId, spawned: true, lost: false }])),
    firstCompletionReceipt: {
      receiptId: 'lantern-ward:venn-family-lamp:service:01', storyId: 'lw_helios_empty_plinth',
      lampRecordId: IDS.lamp, lampSerial: SERIAL, receiverRecordId: IDS.receiver,
      committed: true, count: 1, committedTick: 0, committedAtS: 0, playerHelped: true,
    },
  });
  return { owner, state, lamp, receiver, events };
}

test('an unavailable receiving cup withdraws live circuit success without erasing the completed service', () => {
  const h = restoredService();
  const receipt = structuredClone(h.state.npcJobs.lanternWard.firstCompletionReceipt);
  stepLanternWard(h.owner, 1 / 60);
  const w = h.state.npcJobs.lanternWard, status = lanternWardStatus(h.owner);
  assert.equal(w.phase, 'missing');
  assert.equal(status.installed, false);
  assert.equal(status.missingReceiver, true);
  assert.equal(w.objects.receiver.lost, false, 'unavailable does not mean destroyed');
  assert.equal(h.lamp.data.lanternWardLit, false, 'the surviving lamp cannot show an unproven live circuit');
  assert.equal(w.workS, 0);
  assert.deepEqual(w.firstCompletionReceipt, receipt);
  assert.equal(w.history.installations, 1);
  assert.equal(h.events.length, 0, 'availability cannot pay or remint the historical service');

  const guidance = lanternWardWorkGuidance(h.state), facts = lanternWardDialogueFacts(h.state);
  assert.equal(guidance.step, 'find_receiver');
  assert.equal(facts.installed, false);
  assert.equal(facts.missingReceiver, true);
  assert.match(guidance.lines[0], /same cup must return/);
  assert.doesNotMatch(selectLanternWardDialogue(facts).text, /circuit is live|connected|still here/);
  const mirrored = { npcJobs: { lanternWard: projectLanternWard(w) } };
  assert.deepEqual(lanternWardWorkGuidance(mirrored), guidance);
  const mirroredFacts = lanternWardDialogueFacts(mirrored);
  assert.equal(mirroredFacts.missingReceiver, facts.missingReceiver);
  assert.equal(mirroredFacts.installed, facts.installed);
  assert.deepEqual(selectLanternWardDialogue(mirroredFacts), selectLanternWardDialogue(facts));
  assert.equal(mirrored.npcJobs.lanternWard.firstCompletionReceipt, undefined);

  const saved = serializeLanternWard(h.owner);
  restoreLanternWard(h.owner, JSON.parse(JSON.stringify(saved)));
  assert.equal(lanternWardWorkGuidance(h.state).step, 'find_receiver', 'Continue cannot briefly advertise historic success');
  assert.equal(lanternWardStatus(h.owner).installed, false);
});

test('a missing original lamp also clears the surviving receiver without settling again', () => {
  const h = restoredService({ missingReceiver: false, missingLamp: true });
  stepLanternWard(h.owner, 1 / 60);
  const status = lanternWardStatus(h.owner);
  assert.equal(status.phase, 'missing');
  assert.equal(status.installed, false);
  assert.equal(status.missingLamp, true);
  assert.equal(status.missingReceiver, false);
  assert.equal(h.receiver.data.lanternWardLit, false);
  assert.equal(lanternWardWorkGuidance(h.state).step, 'find_original');
  assert.equal(h.state.npcJobs.lanternWard.history.installations, 1);
  assert.equal(h.events.length, 0);
});

test('destroyed receiving hardware remains a permanent loss, not a return instruction', () => {
  const h = restoredService();
  h.state.npcJobs.lanternWard.objects.receiver.lost = true;
  stepLanternWard(h.owner, 1 / 60);
  assert.equal(lanternWardWorkGuidance(h.state).step, 'receiver_lost');
  assert.equal(lanternWardWorkGuidance({ npcJobs: { lanternWard: projectLanternWard(h.state.npcJobs.lanternWard) } }).step, 'receiver_lost');
});
