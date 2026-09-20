/** Exact source/candidate promotion map. No writes to asset sources or release metadata. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Matrix4, Vector3, Quaternion, Box3 } from '../../../vendor/three.module.js';

const root=process.cwd();
const out=path.join(root,'.devshots/helios-remaster/hero-fleet');
const registry=JSON.parse(fs.readFileSync(path.join(root,'tools/blender/helios_remaster/hero_fleet_sources.json'),'utf8').replace(/^\uFEFF/,''));
const parts=JSON.parse(fs.readFileSync(path.join(root,'assets/ships/parts/parts_manifest.json'),'utf8')).parts;
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function read(file){const b=fs.readFileSync(file);if(b.readUInt32LE(0)!==0x46546c67||b.readUInt32LE(8)!==b.length)throw new Error(`Invalid GLB ${file}`);return {bytes:b.length,sha256:hash(b),doc:JSON.parse(b.subarray(20,20+b.readUInt32LE(12)))};}
function lodStats(doc){
  const result={};
  for(const node of doc.nodes||[]){
    if(node.mesh===undefined||/COLLISION/i.test(node.name||''))continue;
    const lod=node.name?.match(/^LOD([012])_/i)?.[1]||'0';
    const row=result[`lod${lod}`]??={triangles:0,rawPrimitiveDraws:0,meshes:0};
    row.meshes++;
    for(const p of doc.meshes[node.mesh].primitives){row.rawPrimitiveDraws++;row.triangles+=(p.indices===undefined?doc.accessors[p.attributes.POSITION].count:doc.accessors[p.indices].count)/3;}
  }
  return result;
}
function sockets(doc){
  const found={};
  function visit(i,parent){
    const n=doc.nodes[i],local=new Matrix4();
    if(n.matrix)local.fromArray(n.matrix);else local.compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));
    local.premultiply(parent);
    if(/SOCKET_|MOUNT_/i.test(n.name||''))found[n.name]=local.toArray();
    for(const child of n.children||[])visit(child,local);
  }
  for(const i of doc.scenes[doc.scene||0].nodes)visit(i,new Matrix4());
  return found;
}
function renderBounds(doc){
  const result=new Box3();
  function visit(i,parent,hidden=false){
    const n=doc.nodes[i],local=new Matrix4();
    if(n.matrix)local.fromArray(n.matrix);else local.compose(new Vector3(...(n.translation||[0,0,0])),new Quaternion(...(n.rotation||[0,0,0,1])),new Vector3(...(n.scale||[1,1,1])));
    local.premultiply(parent);
    hidden ||= /COLLISION|^LOD[12]_/i.test(n.name||'')||Boolean(n.extras?.nonRender);
    if(!hidden&&n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){const a=doc.accessors[p.attributes.POSITION];if(a.min&&a.max)result.union(new Box3(new Vector3(...a.min),new Vector3(...a.max)).applyMatrix4(local));}
    for(const child of n.children||[])visit(child,local,hidden);
  }
  for(const i of doc.scenes[doc.scene||0].nodes)visit(i,new Matrix4());
  return result.isEmpty()?null:{min:result.min.toArray(),max:result.max.toArray(),size:result.getSize(new Vector3()).toArray()};
}
const map=[];
for(const [name,pinned] of Object.entries(registry)){
  const source=path.join(root,pinned.sourcePath),candidate=path.join(out,name,`${name}.glb`);
  if(!fs.existsSync(candidate))throw new Error(`Missing candidate ${name}`);
  const a=read(source),b=read(candidate);
  if(a.sha256!==pinned.sha256)throw new Error(`Foreign or already promoted source: ${name}`);
  const existingMeta=a.doc.asset.extras?.spacefaceAsset||a.doc.scenes?.find(s=>s.extras?.spacefaceAsset)?.extras.spacefaceAsset;
  const sourceFile=`wholeships/${name}.glb`,entry=parts.find(p=>p.file===sourceFile||Object.values(p.lodFamily||{}).includes(sourceFile));
  const am=existingMeta||{assetId:entry.assetId,slot:'hull',forward:'+X',up:'+Y',starboard:'+Z',unit:'metre'},bm=b.doc.asset.extras.spacefaceAsset;
  if(am.assetId!==bm.assetId)throw new Error(`Asset identity mismatch ${name}`);
  for(const key of ['slot','forward','up','starboard','unit'])if(am[key]!==bm[key])throw new Error(`Contract mismatch ${name}:${key}`);
  const oldSockets=sockets(a.doc),newSockets=sockets(b.doc);
  if(JSON.stringify(Object.keys(oldSockets).sort())!==JSON.stringify(Object.keys(newSockets).sort()))throw new Error(`Socket names changed ${name}`);
  let maxSocketDelta=0;
  for(const [key,matrix] of Object.entries(oldSockets))for(let i=0;i<16;i++)maxSocketDelta=Math.max(maxSocketDelta,Math.abs(matrix[i]-newSockets[key][i]));
  if(maxSocketDelta>1e-4)throw new Error(`Socket transform changed ${name}: ${maxSocketDelta}`);
  const before=lodStats(a.doc),after=lodStats(b.doc),deltas={};
  for(const lod of new Set([...Object.keys(before),...Object.keys(after)]))deltas[lod]={
    source:before[lod],candidate:after[lod],trianglesDelta:(after[lod]?.triangles||0)-(before[lod]?.triangles||0),rawPrimitiveDrawsDelta:(after[lod]?.rawPrimitiveDraws||0)-(before[lod]?.rawPrimitiveDraws||0)};
  map.push({asset:name,assetId:am.assetId,sourcePath:pinned.sourcePath,sourceBlob:pinned.sourceBlob,
    sourceSha256:a.sha256,candidatePath:path.relative(root,candidate).replaceAll('\\','/'),candidateSha256:b.sha256,
    sourceBytes:a.bytes,candidateBytes:b.bytes,sourceMaterialCount:a.doc.materials.length,candidateMaterialCount:b.doc.materials.length,
    sourceIdentityMetadata:existingMeta?'preserved':'missing in source; recovered from exact manifest mapping',
    sourceVisibleBounds:renderBounds(a.doc),candidateVisibleBounds:renderBounds(b.doc),
    socketCount:Object.keys(oldSockets).length,maxSocketTransformDelta:maxSocketDelta,lods:deltas});
}
fs.writeFileSync(path.join(out,'promotion.json'),JSON.stringify({schema:'helios.hero-fleet-promotion.v1',note:'Raw source draw counts; final release package batching/cost owned by controller. No source or release files changed by this report.',models:map},null,2));
console.log(JSON.stringify({models:map.length,files:'promotion.json',newTriangles:map.reduce((s,m)=>s+Object.values(m.lods).reduce((n,l)=>n+l.trianglesDelta,0),0),newRawPrimitives:map.reduce((s,m)=>s+Object.values(m.lods).reduce((n,l)=>n+l.rawPrimitiveDrawsDelta,0),0),maxSocketTransformDelta:Math.max(...map.map(m=>m.maxSocketTransformDelta))}));
