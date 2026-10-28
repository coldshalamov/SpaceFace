import test from 'node:test';
import assert from 'node:assert/strict';
import { soriComparisonMemory, soriComparisonContact, soriComparisonReply } from '../src/data/soriComparisonReturn.js';
const CONTRACT = 'prospector_veil_volatiles';
const STATION = 'station_veil';
function fixture() {
  return { simTime: 10, missions: { config: { refreshSec: 600 }, active: [], boards: { [STATION]: { slots: [] } }, careerContracts: {
    runs: { [CONTRACT]: { contractId: CONTRACT, cycle: 0, status: 'completed', stageIndex: 3, attempt: 0,
      completedStages: ['calibrate_the_veil', 'draw_helium_envelope', 'deliver_to_triton'] } },
    settledMissionIds: ['mission0'], receipts: [{ id: 'fp:completed:mission0', contractId: CONTRACT,
      careerId: 'prospector', cycle: 0, stageId: 'deliver_to_triton', stageIndex: 2, attempt: 0,
      outcome: 'completed', missionId: 'mission0', sectorId: 'sector_triton_wake' }],
  } } };
}
function next(state, stageIndex = 0, cycle = 1) {
  const run = state.missions.careerContracts.runs[CONTRACT];
  Object.assign(run, { cycle, stageIndex, status: 'offered', offerId: 'next', fingerprint: 'next-fp', completedStages: [], attempt: 0 });
  const offer = { id: 'next', source: 'careerContract', stationId: STATION,
    type: ['recon_scan', 'mining_quota', 'bulk_trade'][stageIndex],
    params: stageIndex ? { qty: Math.round(8 * (1 + (cycle % 3) * .15)) } : { scanTargets: 4 },
    cause: { contractId: CONTRACT, careerId: 'prospector', actorId: 'actor_sori_ven', cycle, attempt: 0,
      stageIndex, stageId: ['calibrate_the_veil', 'draw_helium_envelope', 'deliver_to_triton'][stageIndex], fingerprint: 'next-fp' } };
  state.missions.boards[STATION].slots.push(offer);
  return offer;
}
test('current settled envelope is an optional DMC contact only at its issuer', () => {
  const s = fixture(); const c = soriComparisonContact(s, STATION);
  assert.equal(c.name, 'Dr. Sori Ven'); assert.equal(c.factionId, 'faction_dmc');
  assert.equal(c.choices.length, 3); assert.match(c.line, /Triton accepted/);
  for (const id of ['station_triton', 'poi_triton_field_lab', undefined]) assert.equal(soriComparisonContact(s,id),null);
});
test('distinctive independence reply does not invent a result or cosmic explanation', () => {
  const r = soriComparisonReply(fixture(), STATION, 'comparison');
  assert.match(r.text, /another lab that can tell me I am wrong/);
  assert.match(r.text, /does not settle what made the Veil/);
  assert.equal(r.missionOffer, undefined);
});
for (const [field, value] of [['contractId','other'],['careerId','hunter'],['stageId','draw_helium_envelope'],['stageIndex',1],['sectorId','sector_veil_nebula'],['cycle',-1],['cycle',1],['attempt',-1],['missionId','unknown'],['id',''],['outcome','failed']]) {
  test(`invalid ${field}:${value} cannot admit a successful return`, () => {
    const s=fixture();s.missions.careerContracts.receipts[0][field]=value;
    assert.equal(soriComparisonContact(s,STATION),null);
  });
}
test('missing/retired receipt and conflicting same-cycle records fail closed',()=>{
  for(const mode of ['missing','retired','duplicate','conflict']) {
    const s=fixture(), own=s.missions.careerContracts;
    if(mode==='missing') delete own.receipts;
    if(mode==='retired') own.settledMissionIds=[];
    if(mode==='duplicate') own.receipts.push({...own.receipts[0]});
    if(mode==='conflict') own.receipts.push({...own.receipts[0],missionId:'mission1',id:'other'}),own.settledMissionIds.push('mission1');
    assert.equal(soriComparisonMemory(s,STATION),null);
  }
});
test('an old successful cycle does not complete the current delivery',()=>{
  const s=fixture(); next(s,2);const before=JSON.stringify(s);
  assert.equal(soriComparisonMemory(s,STATION).current,false);
  assert.match(soriComparisonContact(s,STATION).line,/last envelope/);
  assert.equal(s.missions.careerContracts.runs[CONTRACT].status,'offered');
  assert.equal(JSON.stringify(s),before);
});
test('live scan, mining and delivery offers preserve exact owner identity and scaled terms',()=>{
  for(const [stage,cycle] of [[0,1],[1,1],[2,2],[2,3]]) {
    const s=fixture(), offer=next(s,stage,cycle);
    assert.strictEqual(soriComparisonReply(s,STATION,'work').missionOffer,offer);
    assert.doesNotMatch(soriComparisonContact(s,STATION).line,/8u|9u|10u/);
    assert.doesNotMatch(soriComparisonReply(s,STATION,'work').text,/8u|9u|10u/);
  }
});
test('no offer, removed offer and expired offer do not manufacture work',()=>{
  const s=fixture(); assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
  const o=next(s);o.expiresAtEpoch=0;
  assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
  s.missions.boards[STATION].slots=[];
  assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
  assert.match(soriComparisonReply(s,STATION,'work').text,/previous envelope is not a new assignment/);
});
for (const [target,field,value] of [['offer','source','random'],['offer','stationId','station_triton'],['offer','type','cargo_delivery'],['cause','actorId','other'],['cause','cycle',0],['cause','stageId','deliver_to_triton'],['cause','fingerprint','old'],['cause','contractId','other'],['cause','attempt',2]]) {
  test(`spoofed offer ${target}.${field} is rejected`,()=>{
    const s=fixture(),o=next(s); (target==='offer'?o:o.cause)[field]=value;
    assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
  });
}
test('active work must still exist in actual active missions',()=>{
  const s=fixture(),o=next(s),run=s.missions.careerContracts.runs[CONTRACT];
  run.status='active';run.missionId='active';
  assert.doesNotMatch(soriComparisonReply(s,STATION,'work').text,/still open/);
  s.missions.active.push({id:'active',status:'active',cause:o.cause});
  assert.match(soriComparisonReply(s,STATION,'work').text,/last envelope does not finish this one/);
  assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
});
test('same-cycle incomplete state cannot borrow a success receipt',()=>{
  for(const field of ['status','stageIndex','completedStages']){
    const s=fixture();s.missions.careerContracts.runs[CONTRACT][field]={status:'active',stageIndex:2,completedStages:[]}[field];
    assert.equal(soriComparisonContact(s,STATION),null);
  }
});
test('repeat visits and JSON Continue keep the exact result without writes',()=>{
  const s=fixture();next(s);const before=JSON.stringify(s);
  const expected=soriComparisonContact(s,STATION);
  for(let i=0;i<3;i++) {
    assert.deepEqual(soriComparisonContact(s,STATION),expected);
    for(const choice of ['comparison','work','leave','unknown']) soriComparisonReply(s,STATION,choice);
  }
  assert.equal(JSON.stringify(s),before);
  assert.deepEqual(soriComparisonContact(JSON.parse(before),STATION),expected);
});

test('mission offer window uses pinned deferred-enter clock and initialized cadence',()=>{
 const s=fixture(),o=next(s);o.expiresAtEpoch=1;s.simTime=600;
 assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
 s.render={_deferredEnterClock:599};assert.strictEqual(soriComparisonReply(s,STATION,'work').missionOffer,o);
 s.missions.config.refreshSec=300;assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
 s.render._deferredEnterClock=299;assert.strictEqual(soriComparisonReply(s,STATION,'work').missionOffer,o);
 for(const refreshSec of [0,-1,NaN,'300']) {s.missions.config={refreshSec};assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);}
 delete s.missions.config;assert.equal(soriComparisonReply(s,STATION,'work').missionOffer,undefined);
});

test('malformed completed-stage collections fail closed without throwing',()=>{for(const value of ['calibrate_the_veil draw_helium_envelope deliver_to_triton',{},null]) {const s=fixture();s.missions.careerContracts.runs[CONTRACT].completedStages=value;assert.equal(soriComparisonContact(s,STATION),null);}});
