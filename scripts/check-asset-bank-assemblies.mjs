import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Matrix4, Quaternion, Vector3, Box3 } from 'three';
import { OBB } from 'three/addons/math/OBB.js';
const vec=v=>new Vector3(...v);
const finite=(v,n)=>Array.isArray(v)&&v.length===n&&v.every(Number.isFinite);
function check(c,m){if(!c)throw new Error(m);}
const sha256=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function lodMap(rows,label){
 check(Array.isArray(rows)&&rows.length===3,`${label}: missing or malformed LOD bindings`);
 const levels=new Map();
 for(const row of rows){
  check(row&&Number.isInteger(row.level)&&row.level>=0&&row.level<=2,`${label}: malformed LOD level`);
  check(!levels.has(row.level),`${label}: duplicate LOD level ${row.level}`);
  check(sha256(row.sha256),`${label}: malformed SHA256 for LOD${row.level}`);
  levels.set(row.level,row);
 }
 return levels;
}
// CLI supplies only referenced IDs: unrelated bank exports need not be present or valid.
// Without a selection, callers explicitly request verification of the entire bank.
export async function readBank(root,{referencedAssets}={}){
 const bank=new Map(), files=new Map();
 async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){
  const p=path.join(dir,e.name);if(e.isDirectory())await walk(p);
  else if(e.name.endsWith('.json')){const a=JSON.parse(await readFile(p,'utf8'));if(a.assetId){check(!bank.has(a.assetId),`Duplicate ${a.assetId}`);bank.set(a.assetId,a);files.set(a.assetId,p);}}
 }}await walk(root);
 for(const id of new Set(referencedAssets??bank.keys())){
  const a=bank.get(id);check(a,`unknown asset ${id}`);
  for(const lod of lodMap(a.lods,id).values()){
   check(typeof lod.file==='string'&&lod.file.length>0&&path.basename(lod.file)===lod.file&&!lod.file.includes('\\'),`${id}: invalid LOD file`);
   check(Number.isSafeInteger(lod.bytes)&&lod.bytes>0,`${id}: invalid LOD${lod.level} bytes`);
   const bytes=await readFile(path.join(path.dirname(files.get(id)),lod.file));
   check(bytes.length===lod.bytes,`${id}: LOD${lod.level} file bytes differ`);
   check(createHash('sha256').update(bytes).digest('hex')===lod.sha256,`${id}: LOD${lod.level} file SHA256 differs`);
  }
 }
 return bank;
}
export function validateAssembly(r,bank){
 const fail=(c,m)=>check(c,`${r.id}: ${m}`);
 fail(Array.isArray(r.instances)&&r.instances.length>0,'no instances');
 const members=new Map(), bounds=new Box3(), solids=[];
 for(const i of r.instances){
  fail(!members.has(i.id),'duplicate instance');const a=bank.get(i.assetId);fail(a,`unknown asset ${i.assetId}`);
  fail(finite(i.translation,3)&&finite(i.rotation,4)&&finite(i.scale,3),'invalid transform');
  fail(i.scale.every(x=>x===1),'authored unit scale required');fail(Math.abs(Math.hypot(...i.rotation)-1)<1e-5,'invalid rotation');
  const matrix=new Matrix4().compose(vec(i.translation),new Quaternion(...i.rotation),vec(i.scale));members.set(i.id,{a,matrix});
  bounds.union(new Box3(vec(a.bounds.min),vec(a.bounds.max)).applyMatrix4(matrix));
  for(const s of a.collision.solids){const local=new Matrix4().compose(vec(s.center),new Quaternion(...s.rotation),new Vector3(1,1,1));
   solids.push({id:i.id,box:new OBB(new Vector3(),vec(s.size).multiplyScalar(.5)).applyMatrix4(matrix.clone().multiply(local))});}
 }
 fail(Array.isArray(r.dependencies),'missing dependencies');
 fail(JSON.stringify([...r.dependencies].sort())===JSON.stringify([...new Set(r.instances.map(i=>i.assetId))].sort()),'dependency list differs');
 const locks=r.dependencyLocks;
 fail(locks&&typeof locks==='object'&&!Array.isArray(locks),'missing or malformed dependencyLocks');
 fail(JSON.stringify(Object.keys(locks).sort())===JSON.stringify([...r.dependencies].sort()),'dependencyLocks keys differ');
 for(const id of r.dependencies){
  const expected=lodMap(bank.get(id).lods,`${r.id}: ${id} sidecar`);
  const bound=lodMap(locks[id],`${r.id}: ${id} binding`);
  for(const [level,lod] of expected)fail(bound.get(level)?.sha256===lod.sha256,`${id}: stale dependency hash for LOD${level}`);
 }
 function socket(ref){const m=members.get(ref.instance);fail(m,`unknown instance ${ref.instance}`);const s=m.a.sockets.find(s=>s.name===ref.socket);fail(s,`unknown socket ${ref.socket}`);
  return {p:vec(s.position).applyMatrix4(m.matrix),f:vec(s.forward).transformDirection(m.matrix),u:vec(s.up).transformDirection(m.matrix)};}
 for(const j of r.joins||[]){const a=socket(j.parent),b=socket(j.child);fail(a.p.distanceTo(b.p)<2e-4,'join gap');fail(a.f.dot(b.f)<-.9999,'join forwards');fail(a.u.dot(b.u)>.9999,'join rolls');}
 fail(finite(r.bounds?.min,3)&&finite(r.bounds?.max,3),'missing bounds');
 fail(vec(r.bounds.min).distanceTo(bounds.min)<.002&&vec(r.bounds.max).distanceTo(bounds.max)<.002,'bounds differ');
 for(const name of ['approach','exit']){const e=r[name];fail(finite(e?.min,3)&&finite(e?.max,3),`missing ${name}`);const box=new Box3(vec(e.min),vec(e.max));fail(!box.isEmpty(),`empty ${name}`);
  const region=new OBB().fromBox3(box);for(const s of solids)fail(!region.intersectsOBB(s.box,1e-8),`${name} intersects ${s.id}`);}
 return {id:r.id,instances:members.size,joins:(r.joins||[]).length,collisionSolids:solids.length,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()}};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1])){
 try{const d=JSON.parse(await readFile(process.argv[2]||'design/asset-bank/assemblies.json','utf8'));check(Array.isArray(d.recipes)&&d.recipes.length>0,'No recipes');const referencedAssets=d.recipes.flatMap(r=>(r.instances||[]).map(i=>i.assetId));const bank=await readBank(process.argv[3]||'assets/models/asset-bank',{referencedAssets});console.log(JSON.stringify(d.recipes.map(r=>validateAssembly(r,bank)),null,2));}
 catch(e){console.error(e.message);process.exitCode=1;}
}
