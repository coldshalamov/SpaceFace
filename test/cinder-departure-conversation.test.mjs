import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { buildMissionBoardContract } from '../src/story/campaign47a/embodiedMissions.js';
import { FURNACE_MITE_KEYS } from '../src/missions/furnaceWorksite.js';
import { furnaceDetailRead } from '../src/missions/furnaceArrivalScene.js';
import { cinderDepartureChoices, cinderDepartureReply, cinderDepartureRead } from '../src/ui/station/cinderDepartureConversation.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { storyActionForBeat } from '../src/ui/screens/missionLog.js';

export function setupState(s, received = 3) {
  s.mode = 'flight'; s.run = { kind: 'adventure' }; s.simTime = 100;
  s.ui.docked = true; s.ui.dockedStationId = 'station_ceres'; s.world.currentSectorId = 'sector_ceres_belt';
  s.story = { beatIndex: 2, flags: { contract_47a_payment_withheld: true }, campaign47a: createCampaign47aState() };
  s.story.campaign47a.stepProgress['2'] = { completed: [], updatedAtS: 100 };
  s.missions = { nextId: 1, completedLog: [], active: [], boards: {}, receipts: [{ id: 'furnace:completed', missionId: 'furnace',
    outcome: 'completed', type: 'patrol_clear', factionId: 'faction_dmc', destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt', at_s: 100, rewardCr: received * 160 }], furnaceWorksiteAftermath: {
    version: 1, missionId: 'furnace', lots: [0, 1, 2].map(slot => ({ slot, pos: { x: 1, z: 1 }, hull: 220,
      received: slot < received, lost: slot >= received })) } };
  const deadFauna = Object.fromEntries(FURNACE_MITE_KEYS.map(key => [key, true]));
  for (let i = 0; i < 3; i++) deadFauna[`closed_refinery:casket_worm:${i}`] = true;
  s.world.alienEcology = { sites: { closed_refinery: { deadFauna } } };
  const key = 'warrant:wanted:station_ceres:scan';
  s.lawSecurity = { composed: { [key]: { key, kind: 'warrant', causeId: 'wanted:station_ceres:scan', status: 'open', remainingCr: 250 } } };
  s.player.heat = 0.2; s.player.credits = 1223;
  assert.equal(furnaceDetailRead(s)?.settled, true);
}
function fixture(n) { const state = createGameState(6008); setupState(state, n); const bus = createBus(); return { state, bus }; }
const host = { id: 'contact_station_ceres_0', role: 'barkeep' };
function answer(f, action, contact = host, station = f.state.ui.dockedStationId) {
  const choice = cinderDepartureChoices(f.state, station, contact).find(c => c.id.startsWith('cinder_departure:' + action + ':'));
  assert.ok(choice, action); return cinderDepartureReply(f, station, contact, choice.id);
}
function tethys(f) {
  f.state.ui.dockedStationId = 'station_tethys'; f.state.world.currentSectorId = 'sector_tethys_junction';
  const offer = buildMissionBoardContract(2, { seed: 6008, epoch: 0, state: f.state }); assert.ok(offer);
  f.state.missions.boards.station_tethys = { slots: [offer] };
  const rook = generateContacts('station_tethys', f.state).find(c => c.id === 'contact_station_tethys_rook'); assert.ok(rook);
  return { rook, offer };
}
test('full, partial and zero Furnace receipts drive the actual Ceres next scene without granting or clearing anything', () => {
  for (const n of [0, 1, 2, 3]) {
    const f = fixture(n), before = JSON.stringify([f.state.missions, f.state.lawSecurity, f.state.player]);
    const text = answer(f, 'next').text;
    assert.match(text, new RegExp(`${n}/3 pods received, ${3-n} lost; ${n*160} cr recorded`));
    assert.match(text, /3 Casket worm losses.*does not identify whose blast/);
    assert.match(text, /250 cr unpaid.*still withheld/); assert.match(text, /Tethys.*Charon.*Expanse/);
    assert.match(text, /WANTED status/);
    assert.equal(JSON.stringify([f.state.missions, f.state.lawSecurity, f.state.player]), before);
  }
});
test('Ceres course has a verified global Tethys berth, not the receiving ring, and does not accept', () => {
  const f = fixture(2), events = []; f.bus.on('ui:setCourse', e => events.push(e)); f.bus.on('ui:acceptMission', e => events.push(e));
  const contact = generateContacts('station_ceres', f.state).find(c => c.id === host.id);
  assert.ok(contact.choices.some(c => c.id === 'rumors')); const reply = answer(f, 'desk', contact);
  assert.match(reply.text, /two different stops/); assert.equal(events.length, 1);
  assert.equal(events[0].stationId, 'station_tethys'); assert.equal(events[0].sectorId, 'sector_tethys_junction');
  assert.ok(Number.isFinite(events[0].pos.x)); assert.equal(events[0].autopilot, false);
});
test('Tethys Rook desk relay presents only the genuine current Cinder posting and physical tradeoff', () => {
  const f = fixture(3), { rook, offer } = tethys(f); const before = JSON.stringify(f.state.missions);
  assert.match(rook.roleLabel, /relay/); assert.match(answer(f, 'read', rook).text, /Cinder One, Two and Three/);
  const reply = answer(f, 'offer', rook); assert.deepEqual(reply.missionOffer, offer);
  assert.match(reply.text, /700 cr contract pay.*booth prices the hull separately/);
  assert.match(answer(f, 'proof', rook).text, /One name, two payers.*Quiet Line.*no Rook receipt/);
  assert.equal(JSON.stringify(f.state.missions), before);
});
test('missing, ambiguous, replaced or malformed documents fail closed; old fine choices cannot survive payment', () => {
  for (const change of [s=>s.ui.docked=false, s=>s.save={restoring:true}, s=>s.story.beatIndex=3,
    s=>s.missions.receipts.push({...s.missions.receipts[0]}), s=>s.missions.furnaceWorksiteAftermath.lots[0].received=false,
    s=>s.missions.receipts[0].at_s=101, s=>s.story.campaign47a.stepProgress['2'].completed=['cinder_board']]) {
    const f=fixture(3), id=cinderDepartureChoices(f.state,'station_ceres',host)[1].id, events=[];
    f.bus.on('ui:setCourse',e=>events.push(e));change(f.state);
    assert.equal(cinderDepartureRead(f.state,'station_ceres',host),null);
    cinderDepartureReply(f,'station_ceres',host,id);assert.equal(events.length,0);
  }
  const f=fixture(3), id=cinderDepartureChoices(f.state,'station_ceres',host)[1].id;
  f.state.lawSecurity.composed['warrant:wanted:station_ceres:scan'].status='paid';
  assert.match(cinderDepartureReply(f,'station_ceres',host,id).text,/current slip is different/);
  f.state.player.heat=0;
  assert.match(answer(f,'next').text,/not refusing.*not a promise/); assert.doesNotMatch(answer(f,'next').text,/250 cr unpaid/);
  const {rook,offer}=tethys(f); f.state.missions.boards.station_tethys.slots.push({...offer});
  assert.deepEqual(cinderDepartureChoices(f.state,'station_tethys',rook),[]);
});
test('ordinary Journal describes three-clear-plus-proof and stops when Compost owns the next step', () => {
  const f=fixture(1);let action=storyActionForBeat({beat:2},f.state);assert.match(action.body,/Cinder One, Two and Three.*100-WU.*8 WU\/s/);
  assert.doesNotMatch(action.body,/first kill|low-risk/);f.state.story.campaign47a.stepProgress['2'].completed.push('cinder_board');
  assert.equal(storyActionForBeat({beat:2},f.state).label,'COMPOST');assert.deepEqual(cinderDepartureChoices(f.state,'station_ceres',host),[]);
});
