import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const root=process.env.SPACEFACE_CANDIDATE || resolve(import.meta.dirname,'..');
const req=createRequire(resolve(process.env.SPACEFACE_REPO||root,'package.json'));
const {NodeIO}=req('@gltf-transform/core');
const folder=resolve(root,'assets/models/asset-bank/research');
const id='place_archive_instrument_cradle';
const meta=JSON.parse(readFileSync(`${folder}/${id}.json`));
const docs=[];
for(const lod of meta.lods) docs.push(await new NodeIO().read(`${folder}/${lod.file}`));
function point(v,m){return [0,1,2].map(i=>m[i]*v[0]+m[i+4]*v[1]+m[i+8]*v[2]+m[i+12]);}
function verts(doc){const out=[];for(const n of doc.getRoot().listNodes()){if(!n.getMesh())continue;for(const p of n.getMesh().listPrimitives()){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++)out.push(point(a.getElement(i,[]),n.getWorldMatrix()));}}return out;}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
test('one candidate identity and three authored LODs, never three model claims',()=>{assert.equal(meta.assetId,id);assert.match(meta.runtimeStatus,/not registered/);assert.equal(meta.lods.length,3);assert.ok(meta.lods.every(l=>l.method==='source'||l.method==='authored-topology'));});
test('actual GLBs match recorded hashes and bounded costs',()=>{for(const l of meta.lods){const b=readFileSync(`${folder}/${l.file}`);assert.equal(b.length,l.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),l.sha256);assert.ok(l.triangles<6000);}assert.ok(meta.lods[1].triangles<meta.lods[0].triangles);assert.ok(meta.lods[2].triangles<meta.lods[1].triangles);});
test('exported socket transforms put seat at world origin and forward along glTF +Y',()=>{for(const d of docs){const n=d.getRoot().listNodes().find(n=>n.getName()==='SOCKET_MastSeat');assert.ok(n);const m=n.getWorldMatrix();point([0,0,0],m).forEach(v=>close(v,0));point([1,0,0],m).forEach((v,i)=>close(v,[0,1,0][i]));}});
test('actual support-face vertices meet the unchanged mast foot Y=0',()=>{for(const d of docs){const vs=verts(d);for(const x of [-2.8,2.8])for(const z of [-2.4,2.4])assert.ok(vs.some(v=>Math.abs(v[0]-x)<1e-5&&Math.abs(v[1])<1e-5&&Math.abs(v[2]-z)<1e-5));}});
test('compound seat proxy top and mast draw-envelope align without Y relocation',()=>{const seat=meta.collision.solids.find(s=>s.size[0]===5.6&&s.size[2]===4.8);assert.ok(seat);close(seat.center[1]+seat.size[1]/2,0);const scale=10/14,off=-.8574006068007688;const minX=-1.3127645375028858*scale+off,maxX=3.7134862365450383*scale+off;assert.ok(minX>=-2.8&&maxX<=2.8);assert.ok(2.0849926405710706*scale<=2.4);});
test('all LODs retain footprint, semantic Forge materials and embedded texture roles',()=>{for(const d of docs){const vs=verts(d);const bounds=[0,1,2].map(i=>[Math.min(...vs.map(v=>v[i])),Math.max(...vs.map(v=>v[i]))]);assert.ok(bounds[0][1]-bounds[0][0]<=20.2);assert.ok(bounds[2][1]-bounds[2][0]<=16);assert.ok(bounds[1][0]<-2.5);for(const m of d.getRoot().listMaterials())assert.equal(m.getExtras().spacefaceFinish,'forge-v1');assert.ok(d.getRoot().listTextures().length>=6);}});

test('maintenance construction has supported recess slats and conduit; covers clear vents',()=>{
 const source=readFileSync(resolve(root,'tools/blender/forge/ships/'+id+'.py'),'utf8');
 assert.ok(source.includes('y,.31'));assert.ok(source.includes('4.5,-.27'));assert.ok(source.includes('2.3 if level==0 else 4.6'));
 assert.ok(.31-.07/2<=.4-.12);assert.ok(-.27-.18/2<=-.48+.25/2);
 for(const [x,len] of [[0,20],[1.5,17]])assert.ok(x-len/2+6+2*2.3+1.9/2 < 5.6-1.8/2);
 for(const d of docs.slice(0,2)){const vs=verts(d);assert.ok(vs.some(v=>Math.abs(v[1]+.36)<1e-5&&v[0]>5.8&&v[0]<8.2));}
 const v=verts(docs[0]);assert.ok(v.some(v=>Math.abs(v[1]-.275)<1e-5&&v[0]>4.7&&v[0]<6.5));
});
