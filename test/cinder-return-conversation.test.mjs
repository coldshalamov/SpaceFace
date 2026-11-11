import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { generateContacts, buildReply } from '../src/ui/station/barContacts.js';
import { cinderDepartureChoices, cinderDepartureReply } from '../src/ui/station/cinderDepartureConversation.js';
import { cinderReturnRead } from '../src/ui/station/cinderReturnConversation.js';
import { receiverApproach } from '../src/data/understoryReceiver.js';

export function returnState(s=createGameState(8008), method='clear_and_tow') {
 s.simTime=1500;s.mode='flight';s.run={kind:'adventure'};s.ui.docked=true;s.ui.dockedStationId='station_expanse';s.world.currentSectorId='sector_charon_expanse';
 s.player.credits=method==='clearance_only'?0:1415;
 s.story.beatIndex=2;s.story.campaign47a={stepProgress:{'2':{completed:['cinder_board']}},receipts:[{id:'step-1',kind:'step_progress',beatIndex:2,stepId:'cinder_board',signal:'mission:completed',atSimTime:1456,completionMethod:method}]};
 s.missions.active=[];s.missions.receipts=[{id:'m_5:completed',missionId:'m_5',at_s:1456,type:'patrol_clear',source:'campaign47a.embodied',stationId:'station_tethys',destStationId:'station_expanse',destSectorId:'sector_charon_expanse',outcome:'completed',rewardCr:method==='clearance_only'?0:700}];
 return s;
}
const contact=(s)=>generateContacts(s.ui.dockedStationId,s).find(c=>c.id===`contact_${s.ui.dockedStationId}_rook`);
const pick=(s,c,action)=>cinderDepartureChoices(s,s.ui.dockedStationId,c).find(c=>c.id.startsWith(`cinder_departure:${action}:`));
function reply(s,action,events=[]) {const c=contact(s);assert.ok(c);const p=pick(s,c,action);assert.ok(p,action);return buildReply(c.role,p.id,{state:s,bus:{emit:(n,e)=>events.push({n,e})}},s.ui.dockedStationId,c);}
test('paid and lost returns name only the corresponding canonical consequence',()=>{
 for(const method of ['clear_and_tow','tow_under_fire','clearance_only']){const s=returnState(undefined,method),before=JSON.stringify({story:s.story,missions:s.missions,player:s.player});
 const text=reply(s,'return_account').text;assert.match(text,method==='clearance_only'?/zero contract pay/:/700 cr in contract pay/);
 assert.equal(JSON.stringify({story:s.story,missions:s.missions,player:s.player}),before);}
});
test('return exists at the two Rook relays, not an arbitrary desk',()=>{
 const s=returnState();assert.ok(contact(s));s.ui.dockedStationId='station_tethys';s.world.currentSectorId='sector_tethys_junction';assert.ok(contact(s));
 s.ui.dockedStationId='station_ceres';s.world.currentSectorId='sector_ceres_belt';assert.equal(contact(s),undefined);
});
for(const defect of ['duplicate_step','duplicate_receipt','future','missing','wrong_source','wrong_destination','unpaid_success','active','retry','legacy','restore','swarm'])test(`uncertain return fails closed: ${defect}`,()=>{
 const s=returnState();
 if(defect==='duplicate_step')s.story.campaign47a.receipts.push({...s.story.campaign47a.receipts[0]});
 if(defect==='duplicate_receipt')s.missions.receipts.push({...s.missions.receipts[0]});
 if(defect==='future')s.simTime=1400;
 if(defect==='missing')s.missions.receipts=[];
 if(defect==='wrong_source')s.missions.receipts[0].source='generic';
 if(defect==='wrong_destination')s.missions.receipts[0].destStationId='station_ceres';
 if(defect==='unpaid_success'){s.story.campaign47a.receipts[0].completionMethod='clearance_only';}
 if(defect==='active')s.missions.active=[{storyTag:'campaign47a:b2:cinder',status:'active'}];
 if(defect==='retry')s.missions.cinderRetry={storyTag:'campaign47a:b2:cinder'};
 if(defect==='legacy')s.story.campaign47a.receipts[0].completionMethod='legacy';
 if(defect==='restore')s.save={restoring:true};
 if(defect==='swarm')s.run.kind='survival';
 assert.equal(contact(s),undefined);
});
test('course is outside the mouth, explicit and non-automatic; reads grant no material',()=>{
 const s=returnState(),events=[],before=JSON.stringify(s.missions);reply(s,'return_garden',events);
 assert.deepEqual(events.map(x=>x.n),['ui:setCourse']);assert.deepEqual(events[0].e.pos,receiverApproach());assert.equal(events[0].e.autopilot,false);
 assert.equal(JSON.stringify(s.missions),before);assert.equal(s.player.credits,1415);
 assert.match(reply(s,'return_compost').text,/0\/240t.*12 cr/);
});
test('unavailable receiver has no routing promise, destroyed receiver describes regrowth',()=>{
 const s=returnState();s.understory={authoredReceiver:{status:'unavailable'}};assert.equal(pick(s,contact(s),'return_garden'),undefined);assert.match(reply(s,'return_compost').text,/not available/);
 s.understory.authoredReceiver.status='destroyed';assert.ok(pick(s,contact(s),'return_garden'));assert.match(reply(s,'return_compost').text,/destroyed.*regrow/);
});
test('garden return acknowledges growth without promising the optional payout twice',()=>{
 const s=returnState();s.story.campaign47a.stepProgress['2'].completed.push('compost');s.understory={authoredReceiver:{status:'destroyed',terminalGardenData:{compostFedMass:240,compostRunComplete:true}}};
 assert.match(reply(s,'return_compost').text,/fed it, and it grew.*240t run is already paid/);
 assert.equal(pick(s,contact(s),'return_garden'),undefined);
});
test('old choices cannot navigate after payment, location or progress changes',()=>{
 for(const mutate of [s=>s.missions.receipts[0].rewardCr++,s=>s.ui.docked=false,s=>s.story.campaign47a.stepProgress['2'].completed.push('compost')]){
 const s=returnState(),c=contact(s),p=pick(s,c,'return_garden'),events=[];mutate(s);
 assert.match(cinderDepartureReply({state:s,bus:{emit:(...e)=>events.push(e)}},'station_expanse',c,p.id).text,/current slip is different/);assert.equal(events.length,0);
 }
});
test('serialized receipts retain the distinct return account without a new ledger',()=>{
 const s=returnState(undefined,'clearance_only'),c=contact(s);const before=cinderReturnRead(s,'station_expanse',c);
 const restored=returnState();restored.story=JSON.parse(JSON.stringify(s.story));restored.missions=JSON.parse(JSON.stringify(s.missions));
 assert.deepEqual(cinderReturnRead(restored,'station_expanse',contact(restored)),before);
});

test('canonical clearance-only normalization remains a readable zero-pay account', async()=>{
 const { recordBeatStep } = await import('../src/story/campaign47a/index.js');
 const { createCampaign47aState } = await import('../src/story/campaign47a/campaignSchema.js');
 const s=returnState();s.story.campaign47a=createCampaign47aState();
 const result=recordBeatStep(s,'mission:completed',{missionId:'m_5',storyTag:'campaign47a:b2:cinder',physicalVerb:'hunt',completionMethod:'clearance_only'},1456);
 assert.equal(result.ok,true);assert.equal(s.story.campaign47a.receipts.at(-1).completionMethod,null);
 s.missions.receipts[0].rewardCr=0;const c=contact(s);assert.ok(c);
 assert.equal(cinderReturnRead(s,'station_expanse',c).delivered,null);
 assert.match(reply(s,'return_account').text,/zero contract pay.*does not say what happened to each hull/);
 assert.doesNotMatch(reply(s,'return_account').text,/matching hull receipt|No marked hull reached/);
 assert.ok(pick(s,c,'return_garden'));
 s.missions.receipts[0].rewardCr=700;assert.equal(contact(s),undefined);
});
