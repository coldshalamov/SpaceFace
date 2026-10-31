import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { firstWaspRouteFocus } from '../src/missions/starterWaspRoute.js';
import { STARTER_JOBS, starterRamSentence, starterRamKill, shipCarriesModule } from '../src/data/starterJobs.js';
const source = readFileSync(new URL('../src/systems/missions.js', import.meta.url), 'utf8');
// Execute the actual complete waypoint method. First-writ routing must return before
// unrelated mission-family owners; missing dependencies make accidental fallthrough fail.
const start = source.indexOf('  _missionWaypoint(m) {');
const end = source.indexOf('\n  _firstLiveMissionTarget(m)', start);
const method = source.slice(start, end).trim().replace(/,$/, '');
const waypoint = Function('firstWaspRouteFocus','SECTOR_BY_ID','STATION_INFO','missionNavReason',
  'return ({'+method+'})._missionWaypoint;')(firstWaspRouteFocus,
  new Map([['sector_helios_prime',{name:'Helios Prime'}]]),
  new Map([['station_helios',{name:'Helios Station'}]]),m=>starterRamSentence(m.params));
const mission = () => ({id:'starter-starter_wasp-1',status:'active',source:'starterJob',type:'bounty_hunt',
  title:'Ram the gate runner',destSectorId:'sector_helios_prime',destStationId:'station_helios',
  params:{starterJobId:'starter_wasp',starterStep:1,requiredModule:'mod_ram_plate',markName:'Nim Gatecut'},
  storyTarget:{id:'mark:rolled-id',role:'board_writ',name:'Nim Gatecut'},targetEntityIds:[7]});
const body = () => ({id:7,type:'enemy',alive:true,pos:{x:1450,z:-430},
  data:{missionTag:'starter-starter_wasp-1',storyTargetId:'mark:rolled-id',name:'Nim Gatecut'}});
const state = (e=body()) => ({world:{currentSectorId:'sector_helios_prime'},entities:new Map(e?[[e.id,e]]:[])});
const nav = (m,s) => waypoint.call({state:s},m);

test('actual first-writ waypoint names and follows the actual moving runner, not Helios station',()=>{
  const m=mission(),e=body(),s=state(e),before=JSON.stringify(m);
  const wp=nav(m,s);
  assert.equal(wp.label,'Nim Gatecut — gate runner');assert.equal(wp.stationId,null);
  assert.equal(wp.kind,'mission');assert.equal(wp.missionId,m.id);assert.equal(wp.missionTitle,m.title);
  assert.equal(wp.targetEntityId,e.id);assert.deepEqual(wp.pos,e.pos);assert.notEqual(wp.pos,e.pos);
  assert.equal(wp.reason,'Ram Nim Gatecut — guns do not count');
  e.pos.x+=91;assert.equal(nav(m,s).pos.x,1541);assert.equal(JSON.stringify(m),before);
});
test('sector return is a sector route, never a stale runner position or receiving dock',()=>{
  const s=state();s.world.currentSectorId='sector_ceres_belt';const wp=nav(mission(),s);
  assert.equal(wp.stationId,null);assert.equal(wp.sectorId,'sector_helios_prime');
  assert.equal(wp.pos,undefined);assert.equal(wp.targetEntityId,undefined);
  assert.match(wp.reason,/Return to Helios Prime/);assert.match(wp.reason,/guns do not count/);
});
test('deferred, dead, recycled and malformed contacts cannot impersonate Nim or complete the ticket',()=>{
  for(const change of [e=>e.alive=false,e=>delete e.alive,e=>e.data.missionTag='other',
    e=>e.data.storyTargetId='other',e=>e.pos.x=NaN,e=>e.pos.z=Infinity,
    e=>e.sectorId='sector_ceres_belt',e=>e.data.homeSectorId='sector_ceres_belt']) {
    const m=mission(),e=body();change(e);const s=state(e),before=JSON.stringify(m);const wp=nav(m,s);
    assert.equal(wp.targetEntityId,undefined);assert.equal(wp.pos,undefined);assert.equal(wp.stationId,null);
    assert.match(wp.reason,/missing contact is not a completed job/);assert.equal(JSON.stringify(m),before);
  }
  const m=mission();assert.match(nav(m,state(null)).reason,/No live Nim Gatecut/);
  assert.equal(m.status,'active');
});
test('Continue can reattach a different runtime id without changing the named route',()=>{
  const m=mission(),e=body();e.id=42;m.targetEntityIds=[42];
  assert.equal(nav(m,state(e)).targetEntityId,42);
});
test('only an exact authored Wasp contract opts in; no invented Wasp site/version or mismatched tickets',()=>{
  for(const change of [m=>m.source='board',m=>m.status='completed',m=>m.type='patrol_clear',
    m=>m.destStationId='station_coalition',m=>m.destSectorId='sector_ceres_belt',
    m=>m.params.starterJobId='starter_hitch',m=>m.params.starterJobId='starter_pelican',
    m=>m.params.starterStep=2,m=>m.params.starterStep='1',m=>m.params.requiredModule='mod_winch_hd',
    m=>m.params.markName='Joss Wire',m=>m.storyTarget.role='other',m=>m.storyTarget.name='other']) {
    const m=mission();change(m);assert.equal(firstWaspRouteFocus(m,state()),null);
  }
  assert.equal(firstWaspRouteFocus(null,state()),null);
  assert.equal(mission().params.starterWorkdayVersion,undefined);
});
test('ordinary bounty navigation branch is byte-preserved and still follows its existing target',()=>{
  const token="    if (m.type === 'bounty_hunt' || m.type === 'patrol_clear') {";
  const start=source.indexOf(token,source.indexOf('  _missionWaypoint(m) {'));
  const end=source.indexOf("    if (m.params?.workingBattlefield)",start);
  const ordinary=Function('starterRamSentence','return function(m){const base={label:"Helios Station",stationId:"station_helios"};'+source.slice(start,end)+'}')(starterRamSentence);
  const e=body();const m={type:'bounty_hunt',params:{markName:'Other mark'}};
  const wp=ordinary.call({_firstLiveMissionTarget:()=>e},m);
  assert.equal(wp.label,'Helios Station');assert.equal(wp.targetEntityId,7);assert.equal(wp.reason,'Intercept Other mark');
});
test('existing fit and lethal ram receipt semantics are not weakened by navigation',()=>{
  assert.equal(shipCarriesModule({fittings:['mod_ram_plate_scarred']},'mod_ram_plate'),true);
  assert.equal(starterRamKill({presentation:{impactLink:{tag:'ram_plate'}}}),true);
  assert.equal(starterRamKill({weaponId:'wpn_pulse_laser_s'}),false);
  assert.equal(starterRamKill({tag:'tow_flail'}),false);
});

test('actual HUD consumer aims at every authored runner instead of station-first override',()=>{
  // Default to real repository owners. Explicit paths support the bounded sparse
  // proof bundle without making nonshipping evidence a repository dependency.
  const evidence=readFileSync(process.env.WASP_ROUTE_HUD_SOURCE || new URL('../src/ui/hud.js',import.meta.url),'utf8');
  const arrow=evidence.indexOf('  function updateObjectiveArrow(p, slow) {');
  assert.ok(arrow>=0,'actual objective-arrow owner must exist');
  const a=evidence.indexOf('    if (state.nav && state.nav.waypoint) {',arrow);
  const b=evidence.indexOf('    if (!wp && m)',a);
  assert.ok(a>arrow && b>a,'actual navigation consumer block must exist');
  const ns=readFileSync(process.env.WASP_ROUTE_NAV_SOURCE || new URL('../src/ui/navigationWaypoint.js',import.meta.url),'utf8');
  const resolve=Function('resolveEntitySelection','SECTORS',ns.replace(/^import[^;]+;\n/gm,'').replace(/export /g,'')+';return resolveWaypointPresentationPosition;')(
    (s,stable)=>s.entities.get(stable.id),[]);
  const consume=Function('resolveNavStation','resolveWaypointPresentationPosition',
    'return function(state){let wp=null,wpLabel=null,navMeta=null;'+evidence.slice(a,b)+';return {wp,wpLabel};}')(
    ()=>({pos:{x:1280,z:-420}}),resolve);
  for (const step of STARTER_JOBS.find(job => job.id === 'starter_wasp').steps) {
    const m=mission(),e=body(),s=state(e);
    m.id=`starter-starter_wasp-${step.step}`;
    Object.assign(m.params,{starterStep:step.step,markName:step.runnerName});
    Object.assign(m.storyTarget,{id:`mark:${m.id}`,name:step.runnerName});
    Object.assign(e.data,{missionTag:m.id,storyTargetId:m.storyTarget.id,name:step.runnerName});
    s.nav={waypoint:nav(m,s)};
    assert.deepEqual(consume(s),{wp:e.pos,wpLabel:`${step.runnerName} — gate runner`});
    // Demonstrate the old bug at the actual consumer: station wins over target position.
    s.nav.waypoint={...s.nav.waypoint,stationId:'station_helios',label:'Helios Station'};
    assert.deepEqual(consume(s).wp,{x:1280,z:-420});
    s.nav.waypoint={...nav(m,s),stable:{id:7}};e.pos.x=1555;
    assert.equal(consume(s).wp.x,1555);
  }
});
test('completed or failed first writ retains canonical no-waypoint behavior',()=>{
  for(const status of ['completed','failed','expired','abandoned']) {
    const m=mission();m.status=status;assert.equal(nav(m,state()),null);
  }
});
test('Continue record without storyTargetId uses only exact owned durable named slot zero',()=>{
  const m=mission(),e=body();delete e.data.storyTargetId;e.id=42;m.targetEntityIds=[42];
  Object.assign(e.data,{missionId:m.id,missionTargetSlot:0,identityKey:`mission:${m.id}:0`,worldRecordId:'record-42'});
  assert.equal(nav(m,state(e)).targetEntityId,42);
  for(const [field,value] of [['missionId','other'],['missionTargetSlot',1],['identityKey',`mission:${m.id}:1`],['worldRecordId',null],['storyTargetId','foreign']]) {
    const bad=structuredClone(e);bad.data[field]=value;
    assert.equal(nav(m,state(bad)).targetEntityId,undefined,field);
  }
});


// The next tickets are offered by the same board immediately after settlement.
// Follow the existing authored runner rather than falling back to the receiving station.
for (const step of STARTER_JOBS.find(job => job.id === 'starter_wasp').steps.slice(1)) {
  const laterMission = () => {
    const m = mission();
    m.id = `starter-starter_wasp-${step.step}`;
    m.title = step.title;
    Object.assign(m.params, { starterStep: step.step, markName: step.runnerName });
    Object.assign(m.storyTarget, { id: `mark:${m.id}`, name: step.runnerName });
    return m;
  };
  const laterBody = m => {
    const e = body();
    Object.assign(e.data, { missionTag: m.id, storyTargetId: m.storyTarget.id, name: step.runnerName });
    return e;
  };
  test(`ticket ${step.step}: actual waypoint follows ${step.runnerName}, preserves ram terms and removes dock override`, () => {
    const m = laterMission(), e = laterBody(m), s = state(e);
    const before = JSON.stringify(m);
    const wp = nav(m, s);
    assert.equal(wp.label, `${step.runnerName} — gate runner`);
    assert.equal(wp.stationId, null);
    assert.equal(wp.targetEntityId, e.id);
    assert.equal(wp.reason, `Ram ${step.runnerName} — guns do not count`);
    assert.equal(wp.missionTitle, step.title);
    assert.deepEqual(wp.pos, e.pos);
    e.pos.z += 200;
    assert.equal(nav(m, s).pos.z, e.pos.z);
    assert.equal(JSON.stringify(m), before);
  });
  test(`ticket ${step.step}: missing, foreign and recycled contacts never inherit ${step.runnerName}'s name`, () => {
    for (const mutate of [e => e.alive = false, e => e.data.missionTag = 'starter-starter_wasp-1',
      e => e.data.storyTargetId = 'mark:other', e => e.pos.x = NaN,
      e => e.data.homeSectorId = 'sector_ceres_belt']) {
      const m = laterMission(), e = laterBody(m); mutate(e);
      const wp = nav(m, state(e));
      assert.equal(wp.targetEntityId, undefined);
      assert.equal(wp.pos, undefined);
      assert.equal(wp.stationId, null);
      assert.match(wp.reason, /missing contact is not a completed job/);
    }
    const m = laterMission();
    assert.ok(nav(m, state(null)).reason.includes(`No live ${step.runnerName}`));
    for (const status of ['completed', 'failed', 'expired', 'abandoned']) {
      m.status = status; assert.equal(nav(m, state()), null);
    }
  });
  test(`ticket ${step.step}: restored slot zero and sector return preserve exact writ identity`, () => {
    const m = laterMission(), e = laterBody(m);
    e.id = 42; m.targetEntityIds = [42]; delete e.data.storyTargetId;
    Object.assign(e.data, { missionId: m.id, missionTargetSlot: 0,
      identityKey: `mission:${m.id}:0`, worldRecordId: 'record-later' });
    const s = state(e);
    assert.equal(nav(m, s).targetEntityId, 42);
    for (const [field, value] of [['missionId', 'other'], ['missionTargetSlot', 1],
      ['identityKey', 'mission:starter-starter_wasp-1:0'], ['worldRecordId', null]]) {
      const bad = structuredClone(e); bad.data[field] = value;
      assert.equal(nav(m, state(bad)).targetEntityId, undefined);
    }
    s.world.currentSectorId = 'sector_ceres_belt';
    const wp = nav(m, s);
    assert.equal(wp.stationId, null); assert.equal(wp.pos, undefined);
    assert.equal(wp.targetEntityId, undefined);
    assert.ok(wp.reason.includes(`Return to Helios Prime to find ${step.runnerName}`));
    assert.ok(wp.reason.includes(`Ram ${step.runnerName} — guns do not count`));
  });
}

test('unknown, coerced and cross-writ step/name combinations stay outside starter routing', () => {
  for (const step of [0, 4, -1, '2', 2.5, NaN, undefined]) {
    const m = mission(); m.params.starterStep = step;
    assert.equal(firstWaspRouteFocus(m, state()), null);
  }
  for (const step of [2, 3]) {
    const m = mission(); m.params.starterStep = step;
    assert.equal(firstWaspRouteFocus(m, state()), null, 'Nim cannot impersonate a later mark');
  }
});
