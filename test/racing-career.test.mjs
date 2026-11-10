import test from 'node:test';
import assert from 'node:assert/strict';
import { CUP_HEATS, normalizeRaceOptions, stageRacingCupHeat, currentRacingCup,
  finishRacingCupHeat, releaseRacingCupHeat, abandonRacingCup, readRacingCareer,
  stageRacingMeeting, recordRaceMeeting, RACING_RIVALS } from '../src/systems/racingCareer.js';
import { renderRacingRecognition } from '../src/ui/racingRecognition.js';
import { fakeDom, textLines } from './helpers/fake-dom.mjs';

const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
const options={starter:'starter_wasp',raceDifficulty:'club'};
test('cup requires all three heats in order and retains hull and selected difficulty',()=>{
  abandonRacingCup();const s=storage();
  assert.equal(stageRacingCupHeat(CUP_HEATS[1].contractId,options),null);
  for(let i=0;i<3;i++){
    const ticket=stageRacingCupHeat(CUP_HEATS[i].contractId,options);
    assert.ok(ticket);
    assert.equal(stageRacingCupHeat(CUP_HEATS[i].contractId,options),null);
    const receipt={...ticket,racingContractId:CUP_HEATS[i].contractId,raceElapsedS:50+i,racePosition:i===1?2:1};
    assert.ok(finishRacingCupHeat(receipt,s));
    assert.equal(finishRacingCupHeat(receipt,s),null);
  }
  assert.equal(currentRacingCup().points,15);assert.equal(currentRacingCup().medal,'Gold');
  assert.deepEqual(readRacingCareer(s).cups.club,{points:15,finishes:1,medal:'Gold'});
  abandonRacingCup();
});
test('failed heat retries without scoring or accepting an old attempt receipt',()=>{
  abandonRacingCup();const first=stageRacingCupHeat(CUP_HEATS[0].contractId,options);
  assert.equal(releaseRacingCupHeat({...first,raceCupId:99}),false);
  assert.equal(releaseRacingCupHeat(first),true);
  assert.equal(stageRacingCupHeat(CUP_HEATS[0].contractId,{...options,starter:'starter_hitch'}),null);
  const retry=stageRacingCupHeat(CUP_HEATS[0].contractId,options);
  assert.ok(retry.raceCupTicket>first.raceCupTicket);
  assert.equal(finishRacingCupHeat({...first,racingContractId:CUP_HEATS[0].contractId,raceElapsedS:40,racePosition:1},storage()),null);
  assert.equal(currentRacingCup().points,0);abandonRacingCup();
});
test('a completed cup survives unavailable storage and declares that its best was not saved',()=>{
  abandonRacingCup();const s={getItem:()=>null,setItem(){throw new Error('quota');}};
  for(const heat of CUP_HEATS){const ticket=stageRacingCupHeat(heat.contractId,options);
    finishRacingCupHeat({...ticket,racingContractId:heat.contractId,raceElapsedS:50,racePosition:3},s);}
  assert.equal(currentRacingCup().status,'complete');assert.equal(currentRacingCup().saved,false);
  assert.equal(currentRacingCup().points,3);abandonRacingCup();
});
test('options fail closed to solo and malformed career rows cannot award a medal',()=>{
  assert.deepEqual(normalizeRaceOptions({raceMode:'forged',raceDifficulty:'impossible'}),
    {raceMode:'time-trial',raceDifficulty:'club',raceGhostEnabled:true,raceOpponents:0});
  const s=storage();s.setItem('spaceface.racingCareer.v1',JSON.stringify({version:1,cups:{club:{points:99,finishes:2}}}));
  assert.deepEqual(readRacingCareer(s),{cups:{}});
});

function meeting(s, overrides = {}) {
  return { ...stageRacingMeeting(s), type: 'race', missionId: 'reused_temporary_mission',
    racingContractId: CUP_HEATS[0].contractId, levelId: CUP_HEATS[0].levelId,
    raceMode: 'race', raceDifficulty: 'club', raceElapsedS: 50, racePosition: 2, raceEntrants: 4,
    raceStandings: [
      { id: 'mira', position: 1, status: 'finished', elapsedS: 48 },
      { id: 'player', player: true, position: 2, status: 'finished', elapsedS: 50 },
      { id: 'rook', position: 3, status: 'racing', elapsedS: null },
      { id: 'sable', position: 4, status: 'dnf', elapsedS: null },
    ], ...overrides };
}
test('final meetings persist known rivals, preserve v1 cup honors and reject old or duplicate completions',()=>{
  const s=storage();s.setItem('spaceface.racingCareer.v1',JSON.stringify({version:1,cups:{club:{points:15,finishes:2}}}));
  const first=meeting(s);
  assert.equal(recordRaceMeeting(first,s).reason,'recorded');
  const recorded=s.getItem('spaceface.racingCareer.v1');
  assert.equal(recordRaceMeeting({...first},s).reason,'duplicate_or_stale');
  assert.equal(s.getItem('spaceface.racingCareer.v1'),recorded);
  const career=readRacingCareer(s);
  assert.deepEqual(career.cups.club,{points:15,finishes:2,medal:'Gold'});
  assert.equal(career.rivals.mira.meetings,1);assert.equal(career.rivals.mira.wins,0);
  assert.equal(career.rivals.mira.lastGapS,2);assert.equal(career.rivals.mira.lastOutcome,'behind');
  assert.equal(career.rivals.rook.wins,1);assert.equal(career.rivals.rook.lastGapS,undefined);
  assert.equal(career.rivals.sable.lastOutcome,'retired');
  const abandoned=meeting(s),next=meeting(s);
  assert.equal(recordRaceMeeting(next,s).reason,'recorded');
  assert.equal(recordRaceMeeting(abandoned,s).reason,'duplicate_or_stale');
  assert.equal(recordRaceMeeting(first,s).reason,'duplicate_or_stale');
  assert.equal(readRacingCareer(s).rivals.rook.meetings,2);
  // A freshly loaded storage facade retains the high-water mark; it isn't a process-only Set.
  const reloaded={getItem:key=>s.getItem(key),setItem:(key,value)=>s.setItem(key,value)};
  assert.equal(recordRaceMeeting(next,reloaded).reason,'duplicate_or_stale');
  assert.equal(recordRaceMeeting(meeting(reloaded),reloaded).reason,'recorded');
  assert.equal(readRacingCareer(s).rivals.mira.meetings,3);
});
test('unfinished, unknown and unreserved results cannot add meetings; denied writes retain the old history',()=>{
  const s=storage(),receipt=meeting(s),original=s.getItem('spaceface.racingCareer.v1');
  const badRows=receipt.raceStandings.map(row=>({...row}));badRows[0].id='invented_pilot';
  for(const bad of [
    {...receipt,raceMode:'time-trial'}, {...receipt,type:'salvage'},
    {...receipt,raceMeetingId:receipt.raceMeetingId+1}, {...receipt,raceStandings:badRows},
    {...receipt,raceStandings:receipt.raceStandings.map(row=>row.player?{...row,status:'racing'}:row)},
  ])assert.equal(recordRaceMeeting(bad,s).reason,'invalid_result');
  assert.equal(s.getItem('spaceface.racingCareer.v1'),original);
  const denied={getItem:key=>s.getItem(key),setItem(){throw new Error('quota');}};
  assert.equal(recordRaceMeeting(receipt,denied).reason,'storage_failed');
  assert.equal(stageRacingMeeting(denied),null);
  assert.equal(readRacingCareer(s).rivals,undefined);
  assert.equal(recordRaceMeeting(receipt,{getItem(){throw new Error('denied');}}).reason,'storage_unavailable');
  assert.equal(recordRaceMeeting(receipt,s).reason,'recorded','a genuinely unstored result may retry once storage recovers');
  // Cup settlement after a meeting cannot discard the new rows or permit the same receipt again.
  abandonRacingCup();
  for(const heat of CUP_HEATS){const ticket=stageRacingCupHeat(heat.contractId,options);
    finishRacingCupHeat({...ticket,racingContractId:heat.contractId,raceElapsedS:50,racePosition:2},s);}
  assert.equal(readRacingCareer(s).rivals.rook.meetings,1);
  assert.equal(recordRaceMeeting(receipt,s).reason,'duplicate_or_stale');
  abandonRacingCup();
});
test('recognition mounts named rival notes and earned host-course honors without a live campaign',t=>{
  const previous=globalThis.document;globalThis.document=fakeDom();
  t.after(()=>{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;});
  const s=storage();s.setItem('spaceface.racingCareer.v1',JSON.stringify({version:1,cups:{club:{points:15,finishes:2}}}));
  recordRaceMeeting(meeting(s),s);
  const node=renderRacingRecognition(s),copy=textLines(node).join('\n');
  assert.equal(node.getAttribute('aria-label'),'Local circuit recognition');
  for(const rival of RACING_RIVALS){assert.ok(copy.includes(rival.name));assert.ok(copy.includes(rival.style));}
  for(const heat of CUP_HEATS)assert.ok(copy.includes(heat.name));
  assert.match(copy,/1 meeting · 1 win/);assert.match(copy,/2\.00s behind/);
  assert.match(copy,/Rival retired/);assert.match(copy,/Gold · Club cup · best 15\/18/);
  const failed={getItem:key=>s.getItem(key),setItem(){throw new Error('quota');}};
  recordRaceMeeting(meeting(s),failed);
  const failure=textLines(renderRacingRecognition(failed)).join('\n');
  assert.match(failure,/latest result was not stored/);assert.match(failure,/1 meeting · 1 win/);
  const unavailable=textLines(renderRacingRecognition(null)).join('\n');
  assert.match(unavailable,/Results are not stored/);assert.doesNotMatch(unavailable,/Gold|1 meeting/);
});

let reloadSerial = 0;
const reloadCareer = () => import(`../src/systems/racingCareer.js?cup-reload=${++reloadSerial}`);
const cupReceipt = (ticket, heat = 0, position = 1) => ({ ...ticket,
  racingContractId: CUP_HEATS[heat].contractId, raceElapsedS: 50 + heat, racePosition: position });

test('reloading an interrupted heat retries it with a new ticket and rejects the previous finish', async () => {
  const s = storage(), firstApp = await reloadCareer();
  const first = firstApp.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  const reloaded = await reloadCareer(), restored = reloaded.restoreRacingCup(s);
  assert.equal(restored.status, 'ready'); assert.equal(restored.nextHeat, 0);
  assert.equal(restored.starter, options.starter); assert.equal(restored.difficulty, 'club');
  assert.equal(reloaded.finishRacingCupHeat(cupReceipt(first), s), null);
  assert.equal(reloaded.stageRacingCupHeat(CUP_HEATS[1].contractId, options, s), null);
  const retry = reloaded.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  assert.equal(retry.raceCupId, first.raceCupId);
  assert.ok(retry.raceCupTicket > first.raceCupTicket);
  assert.equal(reloaded.restoreRacingCup(s).status, 'racing', 'board remount cannot reset an active heat');
  assert.equal(reloaded.finishRacingCupHeat(cupReceipt(first), s), null);
  assert.equal(reloaded.finishRacingCupHeat(cupReceipt(retry), s).points, 6);
  assert.equal(reloaded.finishRacingCupHeat(cupReceipt(retry), s), null);
});

test('completed heats resume in order while rival history, honors and meeting identities survive', async () => {
  const s = storage();
  s.setItem('spaceface.racingCareer.v1', JSON.stringify({ version: 1, cups: { expert: { points: 9, finishes: 2 } } }));
  const race = meeting(s); recordRaceMeeting(race, s);
  const firstApp = await reloadCareer();
  const first = firstApp.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  firstApp.finishRacingCupHeat(cupReceipt(first, 0, 2), s);
  const reloaded = await reloadCareer(), restored = reloaded.restoreRacingCup(s);
  assert.equal(restored.status, 'ready'); assert.equal(restored.nextHeat, 1);
  assert.equal(restored.points, 3); assert.equal(restored.results.length, 1);
  assert.equal(reloaded.stageRacingCupHeat(CUP_HEATS[1].contractId, { ...options, starter: 'starter_hitch' }, s), null);
  assert.equal(reloaded.stageRacingCupHeat(CUP_HEATS[1].contractId, { ...options, raceDifficulty: 'expert' }, s), null);
  assert.equal(reloaded.finishRacingCupHeat(cupReceipt(first), s), null);
  for (let heat = 1; heat < CUP_HEATS.length; heat++) {
    const ticket = reloaded.stageRacingCupHeat(CUP_HEATS[heat].contractId, options, s);
    reloaded.finishRacingCupHeat(cupReceipt(ticket, heat), s);
  }
  const career = reloaded.readRacingCareer(s);
  assert.equal(career.continuation, undefined); assert.equal(career.cups.club.points, 15);
  assert.equal(career.cups.expert.finishes, 2); assert.equal(career.rivals.mira.meetings, 1);
  assert.equal(career.lastMeeting, race.raceMeetingId);
  assert.ok(reloaded.stageRacingMeeting(s).raceMeetingId > race.raceMeetingId);
  const finalApp = await reloadCareer(); assert.equal(finalApp.restoreRacingCup(s), null);
  const next = finalApp.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  assert.ok(next.raceCupId > first.raceCupId);
  assert.equal(finalApp.finishRacingCupHeat(cupReceipt(first), s), null);
});

test('abandon clears continuation without losing career and never revives during the current app session', async () => {
  const s = storage(), app = await reloadCareer();
  const first = app.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  assert.equal(app.abandonRacingCup(s), true);
  assert.equal(app.readRacingCareer(s).continuation, undefined);
  assert.equal(app.restoreRacingCup(s), null);
  const reloaded = await reloadCareer(); assert.equal(reloaded.restoreRacingCup(s), null);
  const next = reloaded.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  assert.ok(next.raceCupId > first.raceCupId);
  const denied = { getItem: key => s.getItem(key), setItem() { throw new Error('quota'); } };
  assert.equal(reloaded.abandonRacingCup(denied), false);
  assert.equal(reloaded.restoreRacingCup(denied), null);
  assert.equal(reloaded.racingRecognitionStatus(denied), 'not_stored');
});

test('denied continuation storage never blocks heat progression and reports its persistence failure', async () => {
  const s = { getItem: () => null, setItem() { throw new Error('denied'); } }, app = await reloadCareer();
  for (let heat = 0; heat < CUP_HEATS.length; heat++) {
    let ticket = app.stageRacingCupHeat(CUP_HEATS[heat].contractId, options, s);
    assert.ok(ticket); assert.equal(app.currentRacingCup().saved, false);
    if (!heat) {
      assert.equal(app.releaseRacingCupHeat(ticket, s), true);
      const stale = ticket; ticket = app.stageRacingCupHeat(CUP_HEATS[heat].contractId, options, s);
      assert.equal(app.finishRacingCupHeat(cupReceipt(stale), s), null);
    }
    assert.ok(app.finishRacingCupHeat(cupReceipt(ticket, heat), s));
    assert.equal(app.racingRecognitionStatus(s), 'not_stored');
  }
  assert.equal(app.currentRacingCup().status, 'complete'); assert.equal(app.currentRacingCup().saved, false);
});

test('incoherent or unknown continuations cannot restore skipped heats or invented points', async () => {
  const s = storage(), app = await reloadCareer();
  const ticket = app.stageRacingCupHeat(CUP_HEATS[0].contractId, options, s);
  app.finishRacingCupHeat(cupReceipt(ticket), s);
  const valid = JSON.parse(s.getItem('spaceface.racingCareer.v1'));
  for (const patch of [ { nextHeat: 2 }, { points: 18 }, { starter: 'invented' }, { ticket: 0 },
    { id: valid.cupSerial + 1 }, { status: 'complete' }, { results: [{ ...valid.continuation.results[0], elapsedS: Infinity }] } ]) {
    const invalid = storage();
    invalid.setItem('spaceface.racingCareer.v1', JSON.stringify({ ...valid, continuation: { ...valid.continuation, ...patch } }));
    const reloaded = await reloadCareer(); assert.equal(reloaded.restoreRacingCup(invalid), null);
  }
});
