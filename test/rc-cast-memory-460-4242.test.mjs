import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { stationContacts } from '../src/systems/stationContacts.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { contactDeedMemory } from '../src/data/contactDeedMemory.js';
import { DEPTH_PROGRAM_CONTACTS, depthContactsForStation } from '../src/story/campaign47a/embodiedDialogue.js';
import { readLifeLedger } from '../src/story/endings/lifeLedger.js';
import { createWrittenFinale, normalizeWrittenFinale } from '../src/story/endings/finaleRuntime.js';

function fixture(player) {
  const state = createGameState(4242), bus = createBus();
  if (player) state.player = structuredClone(player);
  state.story = { beatIndex: 7, flags: {} };
  state.player.flags = { uniqueWrecksVisited: ['a', 'b', 'c'] };
  state.factions = { faction_quiet: { rep: 80 } };
  state.player.cargo = { items: { cmdty_47a_assay_sample: 1, cmdty_personal_ledger: 1, cmdty_navigational_data: 1 } };
  const owner = Object.create(stationContacts); owner.init({ state, bus });
  return { state, bus, owner };
}

test('twelve formerly dormant cast counters observe their real owner receipts', () => {
  const f = fixture(), { state: s, bus } = f;
  const illegal = COMMODITIES.find(c => ['illegal', 'contraband'].includes(c.legality));
  s.traffic = { heliosFreightTallies: [{ manifestId: 'clean', disposition: 'counted' }] };
  s.story.flags.volsBlackBoxRecovered = true;
  const receipts = [
    ['freight:arrival', { stationId: 'station_helios', manifestId: 'clean' }],
    ['captain:remembered', { captainId: 'captain:coldburn-rey', outcome: 'robbed', t: 10 }],
    ['machine:appealAccepted', { incidentId: 'appeal-1' }],
    ['orrinWitness:submitted', { sourceId: 'original-1' }],
    ['economy:tradeCompleted', { side: 'sell', qty: 1, stationId: 'station_sker', commodityId: illegal.id, receiptId: 'sale-1' }],
    ['uniqueWreck:resolved', { wreckId: 'named-wreck' }],
    ['economy:tradeCompleted', { side: 'sell', qty: 1, commodityId: 'cmdty_scrap_metal', receiptId: 'sale-2' }],
    ['ui:talkContact', { contactId: 'contact_question', choiceId: 'sample' }],
    ['ui:talkContact', { contactId: 'contact_lira_vonn', choiceId: 'interview' }],
    ['module:purchased', { defId: 'mod_smuggler_hold', instanceId: 1 }],
    ['survivorPod:rescued', { id: 7, reason: 'station_delivery', stationId: 'station_drift' }],
    ['encounter:resolved', {}],
  ];
  for (const [event, payload] of receipts) bus.emit(event, payload);
  for (const id of ['yune.trust','coldburn.grudge','suhl.clauses','orrin.case','vane.favor','senna.names','latch.child','question.answers','vonn.interviews','zell.work','mara.debt','vols.business']) {
    assert.equal(s.player.stationContactCounters[id], 1, id);
  }
  f.owner.destroy();
  const restored = fixture(s.player);
  for (const [event, payload] of receipts.filter(([e]) => ['orrinWitness:submitted','captain:remembered','economy:tradeCompleted','ui:talkContact'].includes(e))) restored.bus.emit(event, payload);
  for (const id of ['coldburn.grudge','orrin.case','vane.favor','latch.child','question.answers','vonn.interviews']) assert.equal(restored.state.player.stationContactCounters[id], 1, `${id} once after reload`);
  restored.owner.destroy();
});

test('six single-deed save differences change reachable bar openers and sealed Last Call lines', () => {
  for (const trackerId of ['yune.trust','suhl.clauses','senna.names','zell.work','mara.debt','vols.business']) {
    const a = fixture(), b = fixture();
    b.state.player.stationContactCounters[trackerId] = 1;
    const card = DEPTH_PROGRAM_CONTACTS.find(c => c.trackerId === trackerId);
    const opener = f => depthContactsForStation(card.stationHints[0], f.state).find(c => c.id === card.id).blurb;
    assert.notEqual(opener(a), opener(b), trackerId);
    const before = createWrittenFinale('D', readLifeLedger(a.state), `before:${trackerId}`);
    const after = createWrittenFinale('D', readLifeLedger(b.state), `after:${trackerId}`);
    const sender = `LAST CALL — ${contactDeedMemory(card.id).name}`;
    assert.notEqual(before.beats.find(c => c.sender === sender).text, after.beats.find(c => c.sender === sender).text);
    const restored = normalizeWrittenFinale(JSON.parse(JSON.stringify(after)));
    assert.ok(restored, 'expanded finale stays within the saved manuscript bound');
    assert.equal(restored.basis.contactCounters[trackerId], 1);
    assert.equal(restored.beats.find(c => c.sender === sender).text, after.beats.find(c => c.sender === sender).text);
    a.owner.destroy(); b.owner.destroy();
  }
});

test('Question accepts three carried answers once, and empty talk cannot invent a deed', () => {
  const f = fixture();
  f.state.player.cargo.items = {};
  f.bus.emit('ui:talkContact', { contactId: 'contact_question', choiceId: 'sample' });
  assert.equal(f.state.player.stationContactCounters['question.answers'], 0);
  for (const [choiceId, item] of Object.entries({ sample: 'cmdty_47a_assay_sample', ledger: 'cmdty_personal_ledger', navigation: 'cmdty_navigational_data' })) {
    f.state.player.cargo.items[item] = 1;
    for (let i = 0; i < 2; i++) f.bus.emit('ui:talkContact', { contactId: 'contact_question', choiceId });
  }
  assert.equal(f.state.player.stationContactCounters['question.answers'], 3);
  f.bus.emit('economy:tradeCompleted', { side: 'buy', qty: 10, commodityId: 'cmdty_scrap_metal', receiptId: 'buy-1' });
  assert.equal(f.state.player.stationContactCounters['latch.child'], 0);
  f.owner.destroy();
});
