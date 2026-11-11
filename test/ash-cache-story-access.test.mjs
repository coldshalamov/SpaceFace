import assert from 'node:assert/strict';
import {resolveDockDeny} from '../src/core/dockAccess.js';
import {stationBerthAdmits,stationBerthRefusal} from '../src/data/frontierRumors.js';
import {hasAshCacheStoryClearance} from '../src/story/campaign47a/ashCacheAccess.js';
import {buildMissionBoardContract} from '../src/story/campaign47a/embodiedMissions.js';
const data = {missions:{story:{beatIndex:7,branch:'patrol',flags:{beat_6_done:true,empire_seed_complete:true,empire_seed_asset_id:'au_1',empire_seed_variant:'trader'},campaign47a:{stepProgress:{2:{completed:['elroy']}}}}},automation:{traders:[{id:'au_1',status:'enroute',route:{from:'station_coalition',to:'station_helios',good:'cmdty_ore_iron'}}]},factions:{factions:{faction_vael:{rep:-214},faction_scn:{rep:291}}},player:{debt:2056}};
const rec={id:'station_ashcache',stationId:'station_ashcache',name:'Ruined Cache Station',factionId:'faction_vael',repGated:true,minRep:1};
const base={story:data.missions.story,automation:data.automation,factions:data.factions.factions,player:data.player,economy:{},simTime:8211};
const fresh=()=>structuredClone(base);
function check(s,allowed,station=rec){const copy=JSON.stringify(s);const stationCopy=JSON.stringify(station);const entity={id:77,type:'station',alive:true,factionId:station.factionId,data:{...station}};const x={...s,entityList:[entity]};assert.equal(resolveDockDeny(x,station.stationId)===null,allowed);assert.deepEqual(resolveDockDeny(x,entity),resolveDockDeny(x,station.stationId));assert.equal(stationBerthAdmits(station,-214,s),allowed);assert.equal(stationBerthRefusal(station,-214,s)===null,allowed);assert.equal(JSON.stringify(s),copy);assert.equal(JSON.stringify(station),stationCopy);}
check(fresh(),true);
for(const mutate of [s=>s.story.beatIndex=6,s=>s.story.flags.elroy_outcome_legacy='custody',s=>delete s.story.campaign47a,s=>s.story.flags.empire_seed_complete=false,s=>delete s.story.flags.empire_seed_asset_id,s=>s.automation.traders=[],s=>s.story.flags.deep_reach_asset_lost=true,s=>s.story.flags.empire_seed_pending_id='new',s=>s.story.endgameResolved=true,s=>s.automation.traders[0].status='destroyed']){let s=fresh();mutate(s);check(s,false);}
for(const fields of [{quarantine:true},{abandoned:true},{hostile:true},{private:true},{militaryOnly:true},{underConstruction:true},{dockDeny:'hostile_rep'}])check(fresh(),false,{...rec,...fields});
let s=fresh();s.economy.stationConditions={station_ashcache:{grudge:{untilPaidCr:0}}};check(s,false);
s=fresh();s.story.flags.deep_reach_operation_complete=true;check(s,true);
check(fresh(),false,{...rec,id:'station_other',stationId:'station_other'});
// JSON reload preserves the canonical owner fields used by the permit.
check(JSON.parse(JSON.stringify(fresh())),true);
assert.equal(base.factions.faction_vael.rep,-214);
let offer=buildMissionBoardContract(7,{state:base,branch:'patrol',assetId:'au_1',seed:8008,epoch:0,elroyOutcome:'custody'});assert.equal(offer.factionId,'faction_scn');assert.ok(base.factions[offer.factionId].rep>=offer.minRep);
assert.equal(hasAshCacheStoryClearance(fresh(),'station_ashcache'),true);
console.log('PASS: synthetic-fixture admission, 10 negative eligibility cases, 7 structural denials, grudge, return, unrelated station, JSON Continue projection, issuer floor, purity and ID/entity parity');

for (const mutate of [s=>s.story.endgameChoice='A',s=>s.story.flags.sandboxContinued=true]) { const s=fresh();mutate(s);check(s,false); }
for (const [branch,variant,collection,program] of [
  ['patrol','trader','traders',null], ['traders','outpost','outposts',null],
  ['patrol','custody_watch','drones','patrol_guard'], ['traders','force_logistics','drones','mine_to_depot'],
  ['free','force_logistics','drones','mine_to_depot']]) {
  const s=fresh();s.story.branch=branch;s.story.flags.empire_seed_variant=variant;
  const row={id:'au_1',status:'active',route:{from:'a',to:'b',good:'ore'},program:{templateId:program}};
  s.automation={traders:[],outposts:[],drones:[],[collection]:[row]};check(s,true);
  for (const status of ['lost','destroyed','dead']) {const t=structuredClone(s);t.automation[collection][0].status=status;check(t,false);}
  {const t=structuredClone(s);t.automation[collection][0].alive=false;check(t,false);}
  if(program)for(const value of [undefined,{}, {templateId:'wrong'}]){const t=structuredClone(s);t.automation[collection][0].program=value;check(t,false);}
  // A damaged but extant asset remains a working seed; damage is not a lost-asset receipt.
  row.status='damaged';check(s,true);
}
assert.equal(hasAshCacheStoryClearance(fresh(),null),false);
assert.equal(hasAshCacheStoryClearance(fresh(),{}),false);
console.log('PASS: disposition guards; all seed kinds and branch programs; lost/dead/missing-program negatives; extant damaged asset; state and station purity; null station references');
