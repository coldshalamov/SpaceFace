import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { buildMissionBoardContract, getDeepReachOperation } from '../src/story/campaign47a/embodiedMissions.js';
import { deepReachBriefing } from '../src/story/campaign47a/deepReachBriefing.js';
import { generateContacts, getChoices, buildReply, emitBarContactChoice } from '../src/ui/station/barContacts.js';
const clone=x=>JSON.parse(JSON.stringify(x));
function state(branch='patrol') { const s=createGameState(8008); s.story={beatIndex:7,branch,flags:{elroy_outcome:'custody',empire_seed_asset_id:'au_1',weighing_receipt:{outcome:'cleared_unverified'}},campaign47a:{flags:{spine:{v:1,solved:{1:{verb:'burn',stepId:'infested'},3:{method:'sling_in',stepId:'foreman'},6:{asset:'trader'}}}}}}; return s; }
test('Hauler-only offer keeps the operation identity and real terms on every branch',()=>{
 for(const branch of ['patrol','traders','free']) { const s=state(branch),before=clone(s.story),offer=buildMissionBoardContract(7,{state:s,branch,assetId:'au_1',elroyOutcome:'custody',seed:8008,epoch:9});
 assert.ok(offer);assert.match(offer.title,new RegExp(getDeepReachOperation('custody',branch).label,'i'));assert.match(offer.title,/TRADER BALLAST/);assert.ok(offer.title.split(/\s+/).length<=12);assert.match(offer.brief,/Ash Cache in Ashfall Reach/);assert.match(offer.brief,/optional/);assert.match(offer.brief,/marked mission target settles/);assert.doesNotMatch(offer.brief,/Tethys|slung core|recovered core|research|Autonomous/);
 assert.equal(offer.params.assetId,'au_1');assert.equal(offer.reward_cr,2200);assert.equal(offer.collateral_cr,0);assert.equal(offer.time_limit_s,0);assert.deepEqual(s.story,before);
 }
});
test('blockade teaches its target rather than claiming any callback body completes it',()=>{
 const op=getDeepReachOperation('custody','patrol'),p=deepReachBriefing(op,[{id:'b6_trader'}]);assert.match(p.brief,/dead frigate/);assert.match(p.brief,/dock.*Line/i);assert.match(p.brief,/throw it into the berth/);assert.match(p.brief,/swing that hulk through the patrol wedge/);assert.doesNotMatch(p.brief,/kill both|destroy both/);
});
test('each one-fact title remains identifiable without a callback list replacing the job',()=>{
 const op=getDeepReachOperation('force','traders');const titles=['b1_cut','b2_crew','b3_tow_in','b6_trader'].map(id=>deepReachBriefing(op,[{id}]).title);assert.equal(new Set(titles).size,4);assert.ok(titles.every(x=>x.startsWith('Deep Reach Siege')));
});
test('Ash Cache contact exposes a read-only operation question and an explicit cargo choice',()=>{
 const s=state(),contact=generateContacts('station_ashcache',s).find(c=>c.canonicalKey==='kurtz');assert.ok(contact);const choices=getChoices(contact.role,contact);assert.ok(choices.some(c=>c.id==='deepReach'));assert.match(choices.find(c=>c.id==='takeLedger').label,/Take.*1 unit/);assert.equal(choices.some(c=>c.id==='openLedger'),false);
 const before=clone(s.story),cargo=clone(s.player.cargo),events=[],ctx={state:s,bus:{emit:(n,p)=>events.push({n,p})}};const reply=buildReply(contact.role,'deepReach',ctx,'station_ashcache',contact);assert.match(reply.text,/Accept Deep Reach Blockade on Ash Cache Missions/);assert.match(reply.text,/trader ballast/);assert.deepEqual(s.story,before);assert.deepEqual(s.player.cargo,cargo);assert.equal(events.length,0);
 emitBarContactChoice(ctx.bus,{stationId:'station_ashcache',contactId:contact.id,canonicalKey:'kurtz',choiceId:'deepReach'});assert.deepEqual(events.map(x=>x.n),['ui:talkContact']);
});
test('completed or unearned operation question does not advertise a new acceptance',()=>{
 const s=state(),c=generateContacts('station_ashcache',s).find(c=>c.canonicalKey==='kurtz'),ctx={state:s,bus:{emit(){throw Error('read must not send gameplay');}}};s.story.flags.deep_reach_operation_complete=true;assert.match(buildReply(c.role,'deepReach',ctx,'station_ashcache',c).text,/operation is recorded/);delete s.story.flags.deep_reach_operation_complete;delete s.story.flags.empire_seed_asset_id;assert.match(buildReply(c.role,'deepReach',ctx,'station_ashcache',c).text,/No Deep Reach operation/);
});

test('active contact uses accepted callbacks and does not ask for acceptance again',()=>{
 const s=state(),c=generateContacts('station_ashcache',s).find(c=>c.canonicalKey==='kurtz');
 s.missions.active=[{id:'accepted',status:'active',storyOperation:'ashfall_blockade',params:{assetId:'au_1',reckoning:{rows:[{id:'b1_cut'},{id:'b6_trader'}],bodies:{b1_cut:{destroyed:true}}}}}];
 const before=clone(s),reply=buildReply(c.role,'deepReach',{state:s,bus:{emit(){throw Error('read-only');}}},'station_ashcache',c);
 assert.match(reply.text,/contract is active/);assert.match(reply.text,/Retained working pieces: trader ballast/);assert.doesNotMatch(reply.text,/Accept |plate|On acceptance/);assert.deepEqual(clone(s),before);
 s.story.endgameResolved=true;assert.match(buildReply(c.role,'deepReach',{state:s},'station_ashcache',c).text,/final disposition is recorded/);
});

test('explicit legacy charter keeps its Journal requirement',()=>{
 const s=state();s.story.flags.elroy_outcome_legacy=true;
 const c=generateContacts('station_ashcache',s).find(c=>c.canonicalKey==='kurtz');
 const reply=buildReply(c.role,'deepReach',{state:s},'station_ashcache',c);
 assert.match(reply.text,/older charter/);assert.doesNotMatch(reply.text,/Accept |Deep Reach Blockade/);
});

test('lost rescued tug is not advertised while its ballast survives',()=>{
 const s=state(),c=generateContacts('station_ashcache',s).find(c=>c.canonicalKey==='kurtz');
 s.missions.active=[{status:'active',storyOperation:'ashfall_blockade',params:{assetId:'au_1',reckoning:{rows:[{id:'b2_crew'}],bodies:{b2_crew_tug:{destroyed:true}}}}}];
 const reply=buildReply(c.role,'deepReach',{state:s},'station_ashcache',c);
 assert.match(reply.text,/contract is active/);assert.doesNotMatch(reply.text,/rescued tug/);
});

test('limited berth clearance is announced only when actually earned',()=>{
 const s=state(),c=generateContacts('station_ashcache',s).find(c=>c.canonicalKey==='kurtz');
 const read=()=>buildReply(c.role,'deepReach',{state:s},'station_ashcache',c).text;
 assert.doesNotMatch(read(),/limited Deep Reach clearance/);
 Object.assign(s.story.flags,{beat_6_done:true,empire_seed_complete:true,empire_seed_variant:'trader'});
 s.story.campaign47a.stepProgress={2:{completed:['elroy']}};
 s.automation.traders=[{id:'au_1',route:{from:'station_coalition',to:'station_helios',good:'cmdty_ore_iron'}}];
 assert.match(read(),/limited Deep Reach clearance/);assert.match(read(),/Vael standing, debts and conduct restrictions remain/);
 s.automation.traders=[];assert.doesNotMatch(read(),/limited Deep Reach clearance/);
});
