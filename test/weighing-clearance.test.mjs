// Portable owner/event fixtures, not a native gameplay continuation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { missionObjectiveOps } from '../src/systems/missionObjectiveOps.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { stableRecordId, RECORD_KIND } from '../src/world/worldRecords.js';
import { weighingSpawnPosition, stampWeighingTarget } from '../src/missions/weighingWorksite.js';
function fixture() {
  const m = { id:'weighing-clear',status:'active',type:'patrol_clear',storyTag:'campaign47a:b4:operation',storyBranch:'patrol',
    destSectorId:'sector_charon_expanse',destStationId:'station_expanse',objectiveProgress:0,objectiveTarget:3,
    targetEntityIds:[],completedTargetSlots:[],params:{weighingVersion:1,bookScene:'too_perfect_pack',packUnmask:true,clearCount:3} };
  const state={meta:{seed:88},playerId:1,entities:new Map(),missions:{active:[m]},world:{currentSectorId:m.destSectorId}};
  let completions=0;const events=[];
  const owner={...missionObjectiveOps,state,bus:{emit:(n,e)=>events.push({n,e})},_bookExtrasSatisfied:()=>true,
    _refreshTrackedMissionNav(){},_announceBookExtrasPending(){},_failMission(){throw Error('unexpected generic void');},
    _completeMission(x){x.status='completed';completions++;}};
  const bodies=[];
  for(let slot=0;slot<3;slot++){
    const key=`mission:${m.id}:${slot}`;
    const e={...makeEnemySpawnSpec('wasp_swarmer',5,weighingSpawnPosition(m,slot)),id:10+slot,type:'ship',alive:true,homeSectorId:m.destSectorId};
    Object.assign(e.data,{missionId:m.id,missionTag:m.id,missionTargetSlot:slot,identityKey:key,homeSectorId:m.destSectorId,sectorId:m.destSectorId,worldRecordId:stableRecordId(88,m.destSectorId,RECORD_KIND.MISSION_TARGET,key)});
    state.entities.set(e.id,e);m.targetEntityIds.push(e.id);stampWeighingTarget(state,m,e,slot);bodies.push(e);
  }
  return {m,state,owner,bodies,events,get completions(){return completions;}};
}
test('authenticated terrain/NPC death events clear finite slots once without forging kill rewards',()=>{
  const h=fixture();for(const [slot,b] of h.bodies.entries()){
    b.alive=false;const event={id:b.id,killerId:slot===0?null:80+slot,type:'ship',entity:b,presentation:{cause:'terrain_collision'}};
    h.owner._voidLostBountyTargets(event);assert.equal(h.m.objectiveProgress,slot+1);
    h.owner._voidLostBountyTargets(event);assert.equal(h.m.objectiveProgress,slot+1);
    assert.equal(event.killerId,slot===0?null:80+slot);
  }
  assert.equal(h.completions,1);assert.deepEqual(h.m.completedTargetSlots,[0,1,2]);assert.deepEqual(h.m.targetEntityIds,[]);
  assert.equal(h.events.some(e=>/economy|credits|combat:kill|faction:repDelta/.test(e.n)),false);
});
test('player settlement uses the same authenticated dead-body gate',()=>{
  const h=fixture(),b=h.bodies[0];const p={id:b.id,killerId:1,entity:b};
  h.owner._settleBountyTargetKill(h.m,0,p);assert.equal(h.m.objectiveProgress,0);
  b.alive=false;h.owner._settleBountyTargetKill(h.m,0,p);assert.equal(h.m.objectiveProgress,1);
  h.owner._settleBountyTargetKill(h.m,0,p);assert.equal(h.m.objectiveProgress,1);
});
test('unload, stale occupant, foreign identity and finished events do not settle',()=>{
  for(const mode of ['missing','stale','foreign','live','finished']){
    const h=fixture(),b=h.bodies[0];b.alive=false;const p={id:b.id,entity:b,killerId:null};
    if(mode==='missing')h.state.entities.delete(b.id);
    if(mode==='stale')p.entity={...b};
    if(mode==='foreign')b.data.worldRecordId='foreign';
    if(mode==='live')b.alive=true;
    if(mode==='finished')h.m.status='completed';
    h.owner._voidLostBountyTargets(p);assert.equal(h.m.objectiveProgress,0,mode);assert.equal(h.completions,0);
  }
});
