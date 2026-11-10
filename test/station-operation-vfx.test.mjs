import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { StationOperationVfx } from '../src/render/vfx/stationOperationVfx.js';
import { STATION_SIDE_EVENT_VFX_PROFILES } from '../src/render/stationSideEventVfx.js';

function setup(){
  const scene=new THREE.Scene(),root=new THREE.Mesh(new THREE.BoxGeometry(20,8,14),new THREE.MeshBasicMaterial());
  const station={id:2,pos:{x:0,z:0},rot:0,radius:4,alive:true,view:{root}};
  const ship={id:1,pos:{x:45,z:0},rot:Math.PI,radius:6,alive:true};
  const state={simTime:10,playerId:1,entities:new Map([[1,ship],[2,station]]),settings:{video:{}}};
  const owner=new StationOperationVfx(scene);
  return{owner,state,station,ship,scene,close(){owner.dispose();root.geometry.dispose();root.material.dispose();}};
}
function native(kind,id=kind){return{alive:true,eventId:id,kind,profile:STATION_SIDE_EVENT_VFX_PROFILES[kind],
  age:0,duration:3.8,stationId:2,entityId:null,fromX:28,fromZ:0,toX:-14,toZ:0,centerX:0,centerZ:0,bearing:0};}

test('native station operations retain bounded distinct geometry, measured faces and actual duration',()=>{
  const h=setup(),signatures=new Set();
  try{
    for(const kind of Object.keys(STATION_SIDE_EVENT_VFX_PROFILES)){
      h.owner.clear();h.state.simTime=10;h.owner.update(h.state);const n=native(kind);h.owner.acceptStation(n,h.state);
      h.state.simTime=10.4;h.owner.update(h.state);
      assert.ok(h.owner.batch.count>=3,kind);assert.equal(h.owner.inspect().instances[0].life,3.8);
      assert.ok(h.owner.batch.attributes.every(a=>a.array.every(Number.isFinite)));
      signatures.add(Array.from({length:h.owner.batch.count},(_,i)=>h.owner.batch.attributes[1].getX(i)).join(','));
      if(kind==='repair_drone'||kind==='sensor_sweep'){
        assert.equal(h.owner.slots[0].station.measured,true);
        assert.ok(h.owner.slots[0].station.hx>h.station.radius,'drawn hull bounds override smaller physics sphere');
      }
      h.state.simTime=13.9;h.owner.update(h.state);assert.equal(h.owner.batch.count,0,'actual duration releases the operation');
    }
    assert.ok(signatures.size>=5,'different operational constructions exist before tint');
  }finally{h.close();}
});

test('station motion is continuous between native cadence ticks, pauses, and clears on rewind',()=>{
  const h=setup();try{
    const n=native('hauler_dock');h.owner.acceptStation(n,h.state);
    h.state.simTime=10.3;h.owner.update(h.state);const x=h.owner.slots[0].x;
    h.state.simTime+=1/60;h.owner.update(h.state);assert.notEqual(h.owner.slots[0].x,x);
    assert.equal(n.age,0,'presentation never advances native/simulation records');
    const values=h.owner.batch.attributes.map(a=>Array.from(a.array));h.owner.update(h.state);
    assert.deepEqual(h.owner.batch.attributes.map(a=>Array.from(a.array)),values);
    h.state.simTime=1;h.owner.update(h.state);assert.equal(h.owner.live,0);assert.equal(h.owner.mesh.visible,false);
  }finally{h.close();}
});

test('validated job endpoints are snapshot surfaces and survive removed or recycled entity identities',()=>{
  const h=setup();try{
    const n={alive:true,receiptId:'job-a',profileIndex:0,age:0,pulse:1,
      sourceX:45,sourceZ:0,targetX:0,targetZ:0,routeX:0,routeZ:0};
    assert.ok(h.owner.acceptJob(n,{receiptId:'job-a',actorId:1,targetId:2},h.state));
    const s=h.owner.slots[6];assert.ok(s.x>=10,'receiver contact is outside drawn opaque face');assert.ok(s.sx<45);
    const endpoint=[s.x,s.z,s.sx,s.sz];h.state.entities.delete(2);h.ship.pos.x=200;
    h.state.simTime=10.15;h.owner.update(h.state);
    assert.deepEqual([s.x,s.z,s.sx,s.sz],endpoint);assert.ok(h.owner.batch.count>=5);
    n.alive=false;h.state.simTime+=.1;h.owner.update(h.state);assert.equal(h.owner.batch.count,0);
  }finally{h.close();}
});

test('operation capacity, idle sleep, reduced motion and owned disposal stay bounded',()=>{
  const h=setup();try{
    h.owner.update(h.state);const versions=h.owner.batch.attributes.map(a=>a.version);
    h.state.simTime+=1;h.owner.update(h.state);assert.deepEqual(h.owner.batch.attributes.map(a=>a.version),versions);
    for(let i=0;i<20;i++)h.owner.acceptStation(native('cargo_tractor','station-'+i),h.state);
    assert.equal(h.owner.live,6);h.state.simTime+=.3;h.owner.update(h.state);assert.ok(h.owner.batch.count<=36);
    h.state.settings.video.motionReduce=true;h.state.settings.video.flashReduce=true;h.owner.update(h.state);
    assert.equal(h.owner.particles.live,0);assert.ok(h.owner.batch.count>0);
    const x=h.owner.batch.attributes[0].getX(0);h.owner.reproject(100,20);
    assert.ok(Math.abs(h.owner.batch.attributes[0].getX(0)-(x+100))<1e-4);
    h.owner.dispose();h.owner.dispose();assert.equal(h.scene.children.length,0);
  }finally{h.close();}
});
