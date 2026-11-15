import test from 'node:test';
import assert from 'node:assert/strict';
import { isReportInRestitution } from '../src/missions/restitutionReadout.js';
import { missionNavReason, campaign47aRouteKind } from '../src/systems/missionShared.js';
import { objectiveText } from '../src/ui/sim/missionRecap.js';
import { missionNextActionRow } from '../src/ui/sim/missionNextAction.js';
import { book4ChoiceAction, book4MissionChips } from '../src/ui/book4Choice.js';
import { missionCommandBrief, recommendedActions } from '../src/ui/screens/missionLog.js';
import { missionDossierHtml } from '../src/ui/station/screens/contracts.js';
// Portable reconstruction of canonical earned m_10 -> m_11 records. These are fixtures,
// not claimed as a native flight or branch completion.
const report=()=>({id:'m_11',type:'cargo_delivery',stationId:'station_helios',factionId:null,
 status:'active',source:'missionMutation',mutationTag:'restitution',mutatedFromMissionId:'m_10',
 params:{brokenClause:null,replacesMissionId:'m_10'},destStationId:'station_coalition',destSectorId:'sector_helios_prime',
 objectiveProgress:0,objectiveTarget:1,reward_cr:6095,riskTier:4,storyTag:'mutation:m_10',
 title:'Make restitution — report to Coalition HQ',brief:'The clause is broken and the client keeps the book open. Report to Coalition HQ.'});
const failed=()=>({missionId:'m_10',title:'Concord Patrol Trial',type:'patrol_clear',outcome:'expired',reason:'deadline',
 at_s:4733.5,factionId:'faction_scn',sourceOfferId:'mo_station_helios_13_patrol_intro',rewardCr:0,repDelta:-8,
 mutatedToMissionId:'m_11',mutationTag:'restitution'});
const offer=(branch='patrol')=>({id:'offer-'+branch,type:branch==='patrol'?'patrol_clear':branch==='traders'?'bulk_trade':'smuggling_run',
 factionId:branch==='patrol'?'faction_scn':branch==='traders'?'faction_mts':'faction_free',storyBranch:branch,
 storyTag:'story.branch_intro',status:'offered',campaign47aBeat:4,stationId:'station_coalition',params:{},
 title:branch==='patrol'?'Concord Patrol Trial':'Another introduction',destStationId:'station_ceres',destSectorId:'sector_ceres_belt',reward_cr:14150});
const state=()=>({story:{beatIndex:4,branch:null,flags:{embodied_route:'book',elroy_outcome:'custody',pick_a_side_pending:'patrol'},campaign47a:{stepProgress:{'2':{completed:['elroy']}}}},
 missions:{active:[report()],receipts:[failed()]},world:{currentSectorId:'sector_ceres_belt'},simTime:4733.7,
 player:{credits:1950,debt:2056,cargo:{items:{},capMass:100,capVolume:100}},factions:{},entities:new Map(),entityList:[]});

test('cargo-free restitution reads as a real dock report in both route and objectives',()=>{
 const m=report();assert.equal(isReportInRestitution(m),true);
 assert.equal(missionNavReason(m,{name:'Coalition HQ'},{name:'Helios Prime'}),'Dock at Coalition HQ to report in');
 assert.equal(objectiveText(m),'Report in at Coalition HQ — no cargo required');
 const s=state();assert.equal(missionNextActionRow(s,m).phase,'travel');s.world.currentSectorId='sector_helios_prime';
 const row=missionNextActionRow(s,m);assert.equal(row.phase,'turn_in');assert.equal(row.action.kind,'dock');assert.equal(row.action.stationId,'station_coalition');assert.equal(row.carry,null);
 const brief=missionCommandBrief(m,s);assert.match(brief.how,/dock at Coalition HQ.*No cargo/);assert.doesNotMatch(JSON.stringify(brief),/clause is broken|hand over the cargo/);
});
test('report-in keeps held clauses ahead of docking and does not invent commodity-free ordinary jobs',()=>{
 const s=state();s.world.currentSectorId='sector_helios_prime';const m=report();
 for(const patch of [{source:'other'},{mutationTag:'salvage'},{mutatedFromMissionId:'other'},{type:'passenger_transport'},{params:{cmdtyId:'cmdty_alloys',qty:2,replacesMissionId:'m_10'}}])assert.equal(isReportInRestitution({...m,...patch}),false);
 const held={...m,clauses:[{id:'soft_berth',conditionId:'soft_berth',kind:'require'}]};assert.equal(missionNextActionRow(s,held).phase,'blocked');assert.doesNotMatch(missionCommandBrief(held,s).how,/dock at Coalition HQ to report/);
 const cargo={...m,params:{cmdtyId:'cmdty_alloys',qty:2,replacesMissionId:'m_10'}};
 assert.match(missionNavReason(cargo,{name:'Coalition HQ'},{}),/Deliver 2u/);assert.equal(missionNextActionRow(s,cargo).phase,'acquire');
 assert.equal(isReportInRestitution(null),false);assert.equal(isReportInRestitution({}),false);
});
test('failed introduction points at its actual open report-in without claiming branch settlement',()=>{
 const s=state();const a=book4ChoiceAction(s);assert.equal(a.missionId,'m_11');assert.equal(a.title,'Report to Coalition HQ');assert.match(a.body,/expired.*separate report-in.*branch remains unset/);
 const actions=recommendedActions(s,s.missions.active,'m_11');assert.ok(actions.length);assert.doesNotMatch(JSON.stringify(actions),/Deliver u cargo|hand over the cargo|clause is broken/);
});
test('reported outcome names fresh choices and keeps the earlier loss',()=>{
 const s=state();s.missions.active=[];s.missions.receipts.push({missionId:'m_11',outcome:'completed',rewardCr:6095});
 assert.equal(campaign47aRouteKind(s),'live');const a=book4ChoiceAction(s);assert.equal(a.title,'Choose a fresh introduction');assert.match(a.body,/Trial expired.*follow-up is complete.*branch remains unset/);assert.match(a.body,/Helios or Coalition.*Tethys Junction.*Reach or Veil/);
 const chips=book4MissionChips(offer(),s);assert.match(chips[0].text,/No active introduction.*fresh introduction.*\+15.*-10/);assert.equal(chips[1].label,'Choices');assert.match(missionDossierHtml(offer(),s),/Earlier outcomes stay recorded/);
});
test('actual reaccepted introduction replaces recovery advice, not the failed receipt',()=>{
 const s=state();s.missions.active=[{...offer(),status:'active',id:'m_12'}];const before=JSON.stringify(s);assert.equal(book4ChoiceAction(s).missionId,'m_12');assert.match(book4ChoiceAction(s).title,/Complete/);
 assert.match(book4MissionChips(offer('traders'),s)[0].text,/active Journal contract/);assert.equal(JSON.stringify(s),before);
});
test('pinned custody and live register custody have different available doors',()=>{
 const s=state();s.missions.active=[];delete s.story.campaign47a;assert.equal(campaign47aRouteKind(s),'pinned');const body=book4ChoiceAction(s).body;assert.match(body,/Concord/);assert.doesNotMatch(body,/Meridian trade|Free Captains/);
});
test('missing provenance is unknown, unrelated mutation is not claimed, and reads stay pure after Continue-shaped clone',()=>{
 const s=state();s.missions.receipts[0].sourceOfferId='ordinary-patrol';assert.equal(book4ChoiceAction(s).title,'Introduction not complete');
 const known=state();known.missions.active[0].mutatedFromMissionId='someone-else';assert.equal(book4ChoiceAction(known).missionId,null);
 const live=state(),before=JSON.stringify(live);for(let i=0;i<10;i++){book4ChoiceAction(live);objectiveText(live.missions.active[0]);missionCommandBrief(live.missions.active[0],live);}assert.equal(JSON.stringify(live),before);assert.deepEqual(book4ChoiceAction(JSON.parse(before)),book4ChoiceAction(live));
});
test('settled branch outranks old loss and legacy no-pending acceptance remains unchanged',()=>{
 const s=state();s.story.branch='patrol';assert.equal(book4ChoiceAction(s).label,'OPERATION');assert.match(book4MissionChips(offer(),s)[0].text,/already settled/);
 const legacy=state();legacy.story={beatIndex:4,branch:null,flags:{elroy_outcome_legacy:true}};legacy.missions.active=[];assert.match(book4ChoiceAction(legacy).body,/Acceptance settles/);legacy.story.flags.pick_a_side_pending='patrol';assert.match(book4MissionChips(offer(),legacy)[0].text,/Acceptance settles/);
});

 test('malformed collections and unbound receipt IDs cannot fabricate a recovery settlement',()=>{
  const s=state();s.missions.active={};assert.doesNotThrow(()=>book4ChoiceAction(s));assert.doesNotThrow(()=>book4MissionChips(offer(),s));
  s.missions.receipts={};assert.equal(book4ChoiceAction(s).title,'Introduction not complete');
  const unbound=state();unbound.missions.active=[];delete unbound.missions.receipts[0].mutatedToMissionId;unbound.missions.receipts.push({outcome:'completed'});assert.doesNotMatch(book4ChoiceAction(unbound).body,/follow-up is complete/);
  const legacy=state();legacy.story.flags.elroy_outcome_legacy=true;legacy.missions.active=[];assert.match(book4ChoiceAction(legacy).body,/Accept a fresh introduction/);assert.doesNotMatch(book4ChoiceAction(legacy).body,/Complete a fresh introduction/);
 });
