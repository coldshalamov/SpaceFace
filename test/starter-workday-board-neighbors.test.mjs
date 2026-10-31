// Current-production board composition. Not native flight or a full bar import.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STARTER_JOBS,activeOwnedShip,nextStarterStep} from '../src/data/starterJobs.js';
import {kesslerStarterWorkReply} from '../src/ui/station/starterWorkdayConversation.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const workCode=read('src/missions/starterWorkday.js').replace(/^import[^;]*;\r?\n/gm,'').replace(/^export /gm,'');
// occupantGenerationOf is unused by starterWorkSite; no physical owner is claimed here.
const work=Function(workCode+';return {starterWorkSite,STARTER_WORKDAY_VERSION};')();
const boardCode=read('src/systems/missionBoardOps.js').replace(/^import[\s\S]*?;\r?\n/gm,'').replace('export const missionBoardOps','const missionBoardOps');
const ops=Function('activeOwnedShip','nextStarterStep','starterWorkSite','STARTER_WORKDAY_VERSION',boardCode+';return missionBoardOps;')(activeOwnedShip,nextStarterStep,work.starterWorkSite,work.STARTER_WORKDAY_VERSION);
for(const job of STARTER_JOBS) for(let done=0;done<job.steps.length;done++) test(`${job.id} step ${done+1}: actual board author routes its title and brief through Kessler`,()=>{
 const state={ui:{docked:true,dockedStationId:'station_helios'},player:{ownedShips:[{defId:job.shipId,fittings:[job.requiredModule]}]},missions:{starterJobStep:{[job.id]:done},active:[],boards:{station_helios:{slots:[]}}}};
 const slots=state.missions.boards.station_helios.slots;
 // Ordinary _rollOffer creates the envelope; authored board method supplies the real fields under test.
 ops._injectStarterJob.call({state,_rollOffer:type=>({type,params:{}})},{id:'station_helios',sectorId:'sector_helios_prime'},slots,9);
 assert.equal(slots.length,1);
 const offer=slots[0], reply=kesslerStarterWorkReply(state,'station_helios','helios_local_work');
 assert.equal(reply.missionOffer,offer);assert.ok(reply.text.includes(offer.title));assert.ok(reply.text.includes(offer.brief));
 assert.equal(offer.reward_cr,job.steps[done].rewardCr);
 state.missions.active.push({...offer,status:'active'});
 assert.equal(kesslerStarterWorkReply(state,'station_helios','helios_local_work').missionOffer,undefined);
});
