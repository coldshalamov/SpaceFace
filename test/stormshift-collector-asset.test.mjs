/** Candidate-only asset proof. Run after its Forge builder; no fleet registration needed.
 * STORMSHIFT_COLLECTOR_GLB selects a candidate. Missing local candidates are explicitly skipped.
 * These checks do not certify live renderer materials, collision gameplay, or target GPU cost.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidate = process.env.STORMSHIFT_COLLECTOR_GLB || path.join(root,
  '.devshots/stormshift-collector/ship_stormshift_collector_v01.glb');
const bytes = fs.existsSync(candidate) ? fs.readFileSync(candidate) : null;
const json = bytes ? JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12))) : null;
const convert = ([x,y,z]) => [x,z,-y];
const near = (a,b) => a.length === b.length && a.every((x,i) => Math.abs(x-b[i]) < 1e-4);
const options = { skip: !bytes && 'Build tools/blender/forge/ships/stormshift_collector.py first' };

function contracts(doc) {
  const nodes = doc.nodes;
  const rig = doc.asset.extras.stormshiftRig;
  assert.equal(doc.asset.extras.spacefaceAsset.assetId, 'SF_STORMSHIFT_COLLECTOR_V01');
  assert.equal(rig.restState, 'harvest');
  assert.equal(rig.sourceSha256, createHash('sha256').update(fs.readFileSync(path.join(root,
    'tools/blender/forge/ships/stormshift_collector.py'))).digest('hex'), 'Candidate matches authoring source');
  assert.equal(doc.animations?.length || 0, 0, 'Runtime GLB cannot carry baked glTF actions');
  assert.equal(rig.groups.length, 8);
  assert.equal(new Set(rig.groups.map(g=>g.id)).size, 8);
  const scene = doc.scenes[doc.scene || 0];
  assert.equal(nodes[scene.nodes[0]].name, 'STORMSHIFT_COLLECTOR_ROOT');
  for (const group of rig.groups) {
    const pivot = nodes.find(n=>n.name===`MOTION_${group.id.toUpperCase()}`);
    assert.ok(pivot, group.id);
    assert.ok(near(pivot.translation,convert(group.pivotBlender)), `XZ pivot ${group.id}`);
    assert.ok(Math.abs(group.stowedRotationZ) > .1, 'Every rigid group changes silhouette');
    for (let lod=0;lod<3;lod++) {
      assert.ok(pivot.children.some(i=>nodes[i].name.startsWith(`LOD${lod}_MOTION_`)),
        `Rigid group must survive LOD${lod}`);
    }
  }
  assert.equal(rig.loadPositions.length,4);
  for (const load of rig.loadPositions) {
    const socket = nodes.find(n=>n.name===load.socket);
    assert.ok(near(socket.translation,convert(load.positionBlender)), 'Load socket matches its saddle');
    assert.ok(near(socket.extras.spaceface.forward,[0,1,0]), 'Dorsal transfer uses Y-up');
    for (let lod=0;lod<3;lod++) assert.ok(nodes.some(n=>n.name.startsWith(`LOD${lod}_${load.hook}_`)),
      'Each finite load must remain individually removable at every LOD');
  }
  for (const side of ['Port','Starboard']) {
    const socket = nodes.find(n=>n.name===`SOCKET_Nozzle_${side}`);
    assert.ok(socket.translation[0]<-6);
    assert.ok(near(socket.extras.spaceface.forward,[-1,0,0]));
    assert.equal(Math.sign(socket.translation[2]),side==='Port'?-1:1);
  }
  assert.equal(doc.images.length,6,'Use shared Forge texture set');
  for (const material of doc.materials) assert.equal(material.extras.spacefaceFinish,'forge-v1');
}

test('collector exported hierarchy, finite load, axes and shared Forge finish contracts',options,()=>contracts(json));
test('contract rejects detached motion parts and moved load sockets',options,()=>{
  const detached=structuredClone(json);
  detached.nodes.find(n=>n.name==='MOTION_STORMSHIFT_FAN_PORT_0').children=[];
  assert.throws(()=>contracts(detached),/survive LOD0/);
  const displaced=structuredClone(json);
  displaced.nodes.find(n=>n.name==='SOCKET_Load_0').translation=[0,0,0];
  assert.throws(()=>contracts(displaced),/matches its saddle/);
});
test('NodeIO parses real triangles, all LODs reduce, and open collector mouth is empty',options,async()=>{
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  const counts=[0,0,0], bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
  let mouthVertices=0;
  for (const node of doc.getRoot().listNodes()) {
    const match=/^LOD([012])_/.exec(node.getName());
    if (!match || !node.getMesh())continue;
    const lod=+match[1],m=node.getWorldMatrix();
    for (const primitive of node.getMesh().listPrimitives()) {
      const positions=primitive.getAttribute('POSITION');
      counts[lod]+=(primitive.getIndices()?.getCount() || positions.getCount())/3;
      if(lod!==0)continue;
      for(let i=0;i<positions.getCount();i++) {
        const p=positions.getElement(i,[]);
        const v=[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],
          m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],
          m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
        for(let a=0;a<3;a++){bounds[0][a]=Math.min(bounds[0][a],v[a]);bounds[1][a]=Math.max(bounds[1][a],v[a]);}
        if(v[0]>3.5 && v[0]<8 && Math.abs(v[2])<2.0)mouthVertices++;
      }
    }
  }
  assert.ok(counts[0]>10000 && counts[0]<45000);
  assert.ok(counts[1]<counts[0]*.55 && counts[2]<counts[0]*.3);
  assert.equal(mouthVertices,0,'No false black infill in intake mouth');
  const size=bounds[1].map((v,i)=>v-bounds[0][i]);
  assert.ok(size[2]>16 && size[1]<3.5,'Broad low hull in game XZ frame');
});

test('stowing narrows the silhouette and stacked fan leaves retain physical clearance',options,async()=>{
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).readBinary(new Uint8Array(bytes));
  function meshBounds(nodes) {
    const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
    for(const n of nodes) {
      if(!n.getName().startsWith('LOD0_') || !n.getMesh())continue;
      const m=n.getWorldMatrix();
      for(const primitive of n.getMesh().listPrimitives()) {
        const position=primitive.getAttribute('POSITION');
        for(let i=0;i<position.getCount();i++) {
          const p=position.getElement(i,[]);
          for(let a=0;a<3;a++) {
            const v=m[a]*p[0]+m[a+4]*p[1]+m[a+8]*p[2]+m[a+12];
            lo[a]=Math.min(lo[a],v);hi[a]=Math.max(hi[a],v);
          }
        }
      }
    }
    return {lo,hi,width:hi[2]-lo[2]};
  }
  const nodes=doc.getRoot().listNodes(),open=meshBounds(nodes);
  for(const group of json.asset.extras.stormshiftRig.groups) {
    const pivot=nodes.find(n=>n.getName()===`MOTION_${group.id.toUpperCase()}`);
    const half=group.stowedRotationZ/2;
    pivot.setRotation([0,Math.sin(half),0,Math.cos(half)]);
  }
  const stowed=meshBounds(nodes);
  assert.ok(stowed.width<open.width*.65,`Working ${open.width}, stowed ${stowed.width}`);
  for(const side of ['PORT','STARBOARD']) {
    let previous;
    for(let leaf=0;leaf<3;leaf++) {
      const pivot=nodes.find(n=>n.getName()===`MOTION_STORMSHIFT_FAN_${side}_${leaf}`);
      const bounds=meshBounds(pivot.listChildren());
      if(previous)assert.ok(bounds.lo[1]>previous.hi[1]+.04,'Folded blades cannot intersect');
      previous=bounds;
    }
  }
});
