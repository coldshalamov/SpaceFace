import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { authoredBarContactsForStation, buildReply, getChoices } from '../src/ui/station/barContacts.js';
import { CONTACT_VOICE_REGISTERS } from '../src/data/barks.js';
import { initCampaignSidecar, recordBeatStep } from '../src/story/campaign47a/campaignTransitions.js';
import { migrateCampaign47aState, serializeCampaign47aState } from '../src/story/campaign47a/campaignSchema.js';
import { normalizeStationContactRecord } from '../src/data/stationContacts.js';
import { missionPreflight, missionConsequenceSummary } from '../src/ui/missionPreflight.js';
import { makeCampaignState, liveBranchIntroPayload } from './story-campaign47a-fixtures.mjs';
const ID='contact_coldburn_rey', STATION='station_reach';
function fresh(branch=null) {
 const s=makeCampaignState(); s.story.beatIndex=4;
 s.player.stationContactCounters={'coldburn.grudge':2};
 s.player.stationContacts={ [ID]: { talkCount:3, met:true, stationId:STATION } };
 s.missions={boards:{[STATION]:{slots:[]}},active:[]}; initCampaignSidecar(s,0);
 if(branch) recordBeatStep(s,'mission:accepted',liveBranchIntroPayload(branch),40);
 return s;
}
function cold(s) { return authoredBarContactsForStation(STATION,s).find(c=>c.id===ID); }
function reply(s,choice='lane',contact=cold(s),station=STATION) {
 return buildReply('pilot',choice,{state:s,bus:{emit(){assert.fail('conversation emitted progression');}}},station,contact);
}
const lines={free:'You took the free lane. I was already there.',traders:'You took the grain lane. I kept mine.',patrol:'You took the patrol lane. I kept mine.'};
for(const [branch,line] of Object.entries(lines)) test(`Coldburn names the actual ${branch} lane, not a stamp awarded by talking`,()=>{
 const s=fresh(branch), before=JSON.stringify(s); assert.equal(reply(s).text,line);
 s.player.stationContacts[ID].talkCount=99; assert.equal(reply(s).text,line);
 s.player.stationContacts[ID].talkCount=3; assert.equal(JSON.stringify(s),before);
});
test('absent campaign evidence invents no shared lane or awarded stamp',()=>{
 const s=fresh(); delete s.story.campaign47a; const c=cold(s); delete s.story;
 assert.equal(reply(s,'lane',c).text,'No shared lane on the record yet. I still hauled mine first.');
});
test('reply rereads durable choice rather than stale rendered contact',()=>{
 const s=fresh(), stale=cold(s); recordBeatStep(s,'mission:accepted',liveBranchIntroPayload('traders'),40);
 assert.equal(reply(s,'lane',stale).text,lines.traders);
});
test('work keeps choice IDs and delegates the actual Reach board object without reward',()=>{
 const s=fresh('free'), offer={id:'reach-freight',type:'cargo_delivery',title:'Sealed freight',reward:123,originStationId:STATION,destStationId:'station_veil'};
 s.missions.boards[STATION].slots.push(offer);
 const c=cold(s), choices=getChoices('pilot',c);
 assert.deepEqual(choices.map(c=>c.id),['lane','settle','intercept']);
 assert.equal(choices.find(c=>c.id==='settle').label,'Any work left for me?');
 const before=JSON.stringify(s), result=reply(s,'settle',c);
 assert.equal(result.missionOffer,offer); assert.ok(result.text.startsWith(lines.free));
 assert.ok(result.text.endsWith(buildReply('pilot','work',{state:s},STATION).text));
 assert.match(result.text,/Accept \+ Track/);
 for(let i=0;i<4;i++) assert.equal(reply(s,'settle').missionOffer,offer);
 assert.equal(JSON.stringify(s),before);
});
test('empty Reach board never borrows another station offer or promises payout',()=>{
 const s=fresh('patrol'); s.missions.boards.station_helios={slots:[{id:'elsewhere',reward:900}]};
 const result=reply(s,'settle'); assert.equal(result.missionOffer,undefined);
 assert.match(result.text,/Board's empty/); assert.equal(s.player.credits,5000);
});
test('existing campaign serialization and contact normalization retain return without new state',()=>{
 const s=fresh('traders'), expected=reply(s).text, continued=JSON.parse(JSON.stringify(s));
 continued.story.campaign47a=migrateCampaign47aState(serializeCampaign47aState(s.story.campaign47a));
 continued.player.stationContacts[ID]=normalizeStationContactRecord(s.player.stationContacts[ID]);
 assert.equal(reply(continued).text,expected); assert.equal(continued.player.stationContactCounters['coldburn.grudge'],2);
});
test('other speakers and Coldburn intercept retain original reply paths',()=>{
 const s=fresh('free'); assert.match(buildReply('pilot','work',{state:s},STATION).text,/^Board's empty/);
 const c=cold(s), voice=CONTACT_VOICE_REGISTERS[ID], ix=c.choices.find(c=>c.id==='intercept').lineIndexes;
 assert.ok(ix.map(i=>voice.lines[i]).includes(reply(s,'intercept').text));
 const outsider={...c,id:'contact_other',canonicalKey:'contact_other'};
 assert.ok(voice.lines.includes(reply(s,'lane',outsider).text));
 assert.ok(voice.lines.includes(reply(s,'lane',c,'station_helios').text));
 assert.equal(voice.firstContact.choices.find(c=>c.id==='settle').label,'Settle the contract');
});
// Bounded execution of unchanged production offer renderer; not browser acceptance.
function renderOffer(offer,state) {
 const src=readFileSync(new URL('../src/ui/station/screens/bar.js',import.meta.url),'utf8');
 const start=src.indexOf('  function missionOfferAvailable(state, missionId)'), end=src.indexOf('  function frontierRumorOfferHtml()',start);
 assert.ok(start>=0 && end>start);
 return new Function('pendingMissionOffer','acceptedMissionId','missionPreflight','missionConsequenceSummary','escapeHtml','offerWord','state',src.slice(start,end)+'\nreturn missionOfferHtml(state);')(
 offer,null,missionPreflight,missionConsequenceSummary,String,(attrs,label)=>`<button ${attrs}>${label}</button>`,state);
}
test('board offer retains actual readiness rejection and vanishes when removed',()=>{
 const s=fresh('free'); s.player.credits=0;
 const offer={id:'reach-deposit',type:'recon_scan',title:'Route survey',reward:125,collateral:100,originStationId:STATION};
 s.missions.boards[STATION].slots=[offer]; const shown=reply(s,'settle').missionOffer;
 assert.equal(shown,offer); assert.ok(missionPreflight(shown,s).blocker);
 assert.match(renderOffer(shown,s),/data-accept-mission="reach-deposit" disabled/);
 s.missions.boards[STATION].slots=[]; assert.equal(renderOffer(shown,s),''); assert.equal(s.player.credits,0);
});
test('ready pilot receives the ordinary enabled Accept + track button',()=>{
 const s=fresh('traders'), offer={id:'ready-reach',type:'recon_scan',reward:125,collateral:100,originStationId:STATION};
 s.missions.boards[STATION].slots=[offer];
 const result=reply(s,'settle'); assert.equal(result.missionOffer,offer);
 assert.equal(missionPreflight(offer,s).blocker,null);
 assert.match(renderOffer(result.missionOffer,s),/data-accept-mission="ready-reach">Accept \+ track/);
 assert.equal(s.player.credits,5000);
});
