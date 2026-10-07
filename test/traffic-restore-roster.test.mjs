import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/core/gameState.js';
import {createBus} from '../src/core/eventBus.js';
import {traffic as base} from '../src/systems/traffic.js';
import {save as saveDefinition} from '../src/save/saveSystem.js';

function harness(withHelper=true){
  const state=createGameState(48),bus=createBus(),removed=[];
  const owner=Object.create(base),helpers={spawnEntity(){throw new Error('unexpected traffic spawn');}};
  if(withHelper)helpers.removeEntity=id=>{removed.push(id);const e=state.entities.get(id);if(e)e.alive=false;};
  owner.init({state,bus,helpers});
  const entity=(id,life)=>({id,occupantGeneration:life,alive:true,type:'ship',pos:{x:0,z:0},data:{}});
  const put=e=>{state.entities.set(e.id,e);state.entityList.push(e);return e;};
  return {state,bus,owner,removed,entity,put};
}
for(const withHelper of [true,false])test(`restore invalidates outgoing traffic IDs before fresh bodies enter (${withHelper?'helper':'fallback'})`,()=>{
  const h=harness(withHelper),{state,bus,owner,put,entity}=h;
  for(let run=0;run<3;run++){
    const old=put(entity(108,run*2+1));owner._active=[old.id];state.traffic.freighters=[{id:old.id,role:'freighter'}];
    bus.emit('save:restoring',{});
    assert.equal(old.alive,true,'restore reset does not despawn the outgoing owner');
    state.entities.clear();state.entityList.length=0;
    const fresh=put(entity(108,run*2+2));
    const sector={id:`restore-roster-${run}`,trafficPerMin:0};state.world.currentSectorId=sector.id;
    owner._onSectorEnter({sector});
    assert.equal(fresh.alive,true,'fresh reused numeric ID is not the outgoing traffic actor');
    assert.equal(state.entities.get(fresh.id),fresh);
    assert.deepEqual(owner._active,[]);assert.deepEqual(h.removed,[]);
    bus.emit('save:loaded',{});
    assert.equal(owner._restoreEpochPending,false);
    state.entities.clear();state.entityList.length=0;
  }
});
test('ordinary hard cleanup still removes its current roster and preserves untracked bodies',()=>{
  const {owner,put,entity,removed}=harness();const own=put(entity(10,1)),other=put(entity(11,2));
  owner._active=[own.id];owner._cleanup();assert.equal(own.alive,false);assert.equal(other.alive,true);assert.deepEqual(removed,[10]);
});
test('failed restore does not re-arm outgoing IDs against a later occupant',()=>{
  const {state,bus,owner,put,entity}=harness();const old=put(entity(12,1));owner._active=[old.id];
  bus.emit('save:restoring',{});bus.emit('save:error',{reason:'load_failed'});
  state.entities.clear();state.entityList.length=0;const fresh=put(entity(12,2));
  owner._cleanup();assert.equal(fresh.alive,true);assert.equal(owner._restoreEpochPending,false);
});

test('save rejection before the destructive boundary preserves live traffic ownership',t=>{
  const {state,bus,owner,put,entity}=harness(),old=put(entity(20,1));owner._active=[old.id];
  const save=Object.create(saveDefinition);save.state=state;save.bus=bus;
  let restores=0;bus.on('save:restoring',()=>restores++);
  assert.equal(save.loadEnvelope({fmt:'invalid'},'invalid-import'),false);
  assert.equal(restores,0);assert.deepEqual(owner._active,[old.id]);assert.equal(old.alive,true);
  save._hasPlayerEntity=()=>true;
  save._captureRollbackSnapshot=()=>{throw new Error('outgoing snapshot cannot serialize');};
  t.mock.method(console,'error',()=>{});
  assert.equal(save._restorePreparedEnvelope({data:{}},'unavailable-rollback'),false);
  assert.equal(restores,0);assert.deepEqual(owner._active,[old.id]);assert.equal(old.alive,true);
  owner._cleanup();assert.equal(old.alive,false,'preserved outgoing world retains ordinary cleanup ownership');
});
