import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createBus} from '../src/core/eventBus.js';
import {fields} from '../src/systems/fields.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {save} from '../src/save/saveSystem.js';
import {observeAppliedImpulse,journalFor} from '../src/combat/stuntEvidence.js';
import {FIELD_FLAGS} from '../src/data/fields.js';

function boot(){
  const sim=createSimulation({seed:146,systems:[fields,stuntGrammar],bus:createBus()});
  sim.state.mode='flight';
  const player=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},mass:18,radius:6,hull:100,hullMax:100,data:{defId:'ship_kestrel'}});
  sim.state.playerId=player.id;
  const store=Object.create(save);store.state=sim.state;store.registry=sim.registry;
  return {sim,state:sim.state,player,store,field:sim.registry.get('fields'),grammar:sim.registry.get('stuntGrammar')};
}
test('shipping save captures nonpersistent pending body and field emitter, restores identities and finite field lifetime',()=>{
  const flag=FIELD_FLAGS.enabled;FIELD_FLAGS.enabled=true;const a=boot(),b=boot();
  try{
    // Rebind the active physical observer to the runtime supplying this observation.
    a.grammar.init({state:a.state,bus:a.sim.bus});
    const body=a.sim.spawn({type:'ship',team:1,pos:{x:200,z:80},vel:{x:20,z:-35},radius:6,mass:18,hull:100,hullMax:100,data:{encounter:{id:'save-pending'}}});
    const planted=a.field.plantField(a.state,{kind:'well',center:{x:300,z:0},ownerId:a.player.id,durationS:8});
    a.state.tick=30;a.state.simTime=.5;
    observeAppliedImpulse(body,{x:20,z:0},body.vel,{actorId:a.player.id},30,'weapon_hit',a.state);
    const snapshot=JSON.parse(JSON.stringify(a.store.serializeData()));
    assert.ok(snapshot.entities.persistent.some(e=>e.id===body.id));
    assert.ok(snapshot.entities.persistent.some(e=>e.id===planted.emitterId));
    assert.equal(snapshot.fields.fields.length,1);assert.equal(snapshot.stunts.evidence.roots.length,1);
    const remap=new Map([[String(a.player.id),b.player.id]]);
    for(const entity of snapshot.entities.persistent){const clone={...entity};delete clone.id;const live=b.sim.spawn(clone);remap.set(String(entity.id),live.id);}
    b.state.tick=snapshot.entities.tick;b.state.simTime=snapshot.entities.simTime;
    b.field.deserialize(snapshot.fields,remap);b.grammar.deserialize(snapshot.stunts,remap);b.sim.bus.emit('save:loaded',{});
    assert.equal(b.field._kernel.size,1);assert.equal(b.field._kernel.list()[0].expireAt,8);
    assert.equal(journalFor(b.state).roots.size,1);assert.equal(journalFor(b.state).roots.values().next().value.sourceId,remap.get(String(body.id)));
    b.state.simTime=8.1;b.sim.step();assert.equal(b.field._kernel.size,0);
  }finally{a.grammar.destroy();b.grammar.destroy();FIELD_FLAGS.enabled=flag;}
});
test('missing pending body cannot restore provenance; old saves do not acquire a made-up setup',()=>{
  const a=boot();try{a.grammar.deserialize(null);assert.equal(journalFor(a.state).roots.size,0);
    a.grammar.deserialize({revision:2,mode:'adventure',state:{},evidence:{revision:2,sequence:10,lives:[],roots:[['root:1',{sourceLife:'missing',tick:0,nodes:[]}]],bodies:[]}});
    assert.equal(journalFor(a.state).roots.size,0);
  }finally{a.grammar.destroy();}
});
