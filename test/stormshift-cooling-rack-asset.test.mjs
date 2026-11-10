/** Candidate geometry contract; no claim about runtime physics, Look, or GPU cost. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=process.env.STORMSHIFT_RACK_DIR||path.join(root,'.devshots/stormshift-cooling-rack');
const sourceHash=createHash('sha256').update(fs.readFileSync(path.join(root,'tools/blender/forge/ships/stormshift_cooling_rack.py'))).digest('hex');
const states=['intact','damaged','repaired'];
const read=state=>fs.readFileSync(path.join(directory,`place_stormshift_cooling_rack_${state}_v01.glb`));
const exists=states.every(state=>fs.existsSync(path.join(directory,`place_stormshift_cooling_rack_${state}_v01.glb`)));
const options={skip:!exists&&'Build stormshift_cooling_rack.py first'};
const raw=bytes=>JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
const convert=([x,y,z])=>[x,z,-y];
const near=(a,b)=>a.length===b.length&&a.every((x,i)=>Math.abs(x-b[i])<1e-4);
function verify(doc,state){
  const contract=doc.asset.extras.stormshiftRack;
  assert.equal(contract.state,state);assert.equal(contract.sourceSha256,sourceHash);
  assert.equal(doc.asset.extras.spacefaceAsset.category,'places');
  assert.equal(doc.asset.extras.spacefaceAsset.assetId,`SF_STORMSHIFT_COOLING_RACK_${state.toUpperCase()}_V01`);
  assert.equal(doc.animations?.length||0,0);
  assert.ok(!doc.nodes.some(n=>n.name==='COLLISION_HULL'),'No false convex infill closes yoke');
  assert.equal(contract.loadPositions.length,4);
  for(const load of contract.loadPositions){
    const socket=doc.nodes.find(n=>n.name===load.socket);
    assert.ok(near(socket.translation,convert(load.positionBlender)),'Load socket on saddle');
    assert.ok(near(socket.extras.spaceface.forward,[0,1,0]));
    for(let lod=0;lod<3;lod++)assert.ok(doc.nodes.some(n=>n.name.startsWith(`LOD${lod}_${load.hook}_`)),'Finite canisters independently removable at every LOD');
  }
  const tow=doc.nodes.find(n=>n.name==='SOCKET_Tow');
  assert.ok(near(tow.translation,[7.02,.12,1.5]));
  assert.ok(near(tow.extras.spaceface.forward,[1,0,0]));
  for(const key of ['SOCKET_Berth_A','SOCKET_Berth_B'])assert.ok(near(doc.nodes.find(n=>n.name===key).extras.spaceface.forward,[0,-1,0]));
  const boxes=contract.collision.boxes;
  assert.equal(boxes.filter(b=>b.name.startsWith('panel-')).length,state==='damaged'?5:6);
  // Every suggested solid leaves a useful opening in the actual tow fork.
  for(const box of boxes){
    const [x,y]=box.centerBlender,[w,d]=box.sizeBlender;
    assert.ok(!(Math.abs(5.9-x)<w/2&&Math.abs(-1.5-y)<d/2),'Compound must not fill yoke');
  }
  assert.equal(doc.images.length,6);
  for(const material of doc.materials)assert.equal(material.extras.spacefaceFinish,'forge-v1');
}
test('all rack states preserve exact sockets, finite cargo and open compound proposals',options,()=>{
  for(const state of states)verify(raw(read(state)),state);
});
test('reject stale source, false collision infill and lost removable cargo',options,()=>{
  const doc=raw(read('intact'));
  const bad=structuredClone(doc);bad.asset.extras.stormshiftRack.collision.boxes.push({name:'bad',centerBlender:[5.9,-1.5,0],sizeBlender:[3,3,1]});
  assert.throws(()=>verify(bad,'intact'),/must not fill yoke/);
  const lost=structuredClone(doc);lost.nodes=lost.nodes.filter(n=>!n.name.startsWith('LOD2_HOOK_SECONDARY_CANISTER_2_'));
  assert.throws(()=>verify(lost,'intact'),/independently removable/);
  const stale=structuredClone(doc);stale.asset.extras.stormshiftRack.sourceSha256='old';assert.throws(()=>verify(stale,'intact'));
});
test('real geometry has broad asymmetry, empty yoke and readable missing leaf at all LODs',options,async()=>{
  const metrics=[];
  for(const state of states){
    const bytes=read(state),json=raw(bytes);
    const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
    const counts=[0,0,0],vertices=[0,0,0],primitives=[0,0,0],bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
    let yokeVertices=0,missingVertices=0;
    const covers=(p,a,b,c)=>{const cross=(u,v,w)=>(v[0]-u[0])*(w[2]-u[2])-(v[2]-u[2])*(w[0]-u[0]);if(Math.abs(cross(a,b,c))<1e-8)return false;const signs=[cross(a,b,p),cross(b,c,p),cross(c,a,p)];return signs.every(v=>v>=-1e-8)||signs.every(v=>v<=1e-8);};
    for(const node of doc.getRoot().listNodes()){
      const match=/^LOD([012])_/.exec(node.getName());if(!match||!node.getMesh())continue;
      const lod=+match[1],m=node.getWorldMatrix();
      for(const primitive of node.getMesh().listPrimitives()){
        primitives[lod]++;const positions=primitive.getAttribute('POSITION');vertices[lod]+=positions.getCount();counts[lod]+=(primitive.getIndices()?.getCount()||positions.getCount())/3;
        const world=[];
        for(let i=0;i<positions.getCount();i++){
          const p=positions.getElement(i,[]),v=[0,1,2].map(a=>m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12]);
          world.push(v);
          if(lod===0)for(let a=0;a<3;a++){bounds[0][a]=Math.min(bounds[0][a],v[a]);bounds[1][a]=Math.max(bounds[1][a],v[a]);}
          if(v[0]>5.3&&v[0]<6.5&&v[2]>1&&v[2]<2)yokeVertices++;
          if(state==='damaged'&&v[0]>-4.6&&v[0]<-2.1&&v[2]<-3.7&&v[2]>-5.0)missingVertices++;
        }
        const indices=primitive.getIndices()?.getArray()||Array.from({length:positions.getCount()},(_,i)=>i);
        for(let i=0;i<indices.length;i+=3){
          const triangle=[world[indices[i]],world[indices[i+1]],world[indices[i+2]]];
          assert.ok(!covers([5.9,0,1.5],...triangle),'No triangle bridges yoke opening');
          if(state==='damaged')assert.ok(!covers([-3.3,0,-4.3],...triangle),'No triangle bridges missing leaf');
        }
      }
    }
    assert.equal(yokeVertices,0,'Honest yoke opening in all LODs');assert.equal(missingVertices,0,'Damaged leaf is visibly absent');
    assert.ok(counts[0]>10000&&counts[0]<30000);assert.ok(counts[1]<counts[0]*.55&&counts[2]<counts[0]*.3);
    assert.ok(bounds[0][2]<-5.2&&bounds[1][2]<2.5,'Large radiator area lives on one side');
    assert.ok(primitives[0]<24,'Fixed panels batch by finish, removable cargo remains separate');
    const textureBytes=json.images.reduce((sum,image)=>sum+(json.bufferViews[image.bufferView]?.byteLength||0),0);
    metrics.push({state,glbBytes:bytes.length,triangles:counts,vertices,primitives,materials:json.materials.length,images:json.images.length,embeddedTextureBytes:textureBytes,boundsGltf:bounds});
  }
  fs.writeFileSync(path.join(directory,'asset-metrics.json'),JSON.stringify(metrics,null,2)+'\n');
});
