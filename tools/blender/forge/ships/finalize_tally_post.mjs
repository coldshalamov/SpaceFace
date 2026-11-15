// Tally Post reviewed amber index finalizer. Run from the repository root.
// Recover the reviewed pre-change base into .devshots with:
// node -e "require('node:fs').writeFileSync(process.argv[1],require('node:child_process').execFileSync('git',['cat-file','blob','b3377e546b20028109f023f02f525c82ce310abf']))" <scratch-base.glb>
// Forge export must match the pinned reviewed candidate SHA below. A normal full
// export drifts other LOD/collision meshes; do not install that export directly.
// Intentional future export or baseline changes require a new review and repin.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Explicit, reviewed SHA guards keep this selective finalizer from silently accepting drift.
import path from 'node:path';
const [basePath,candidatePath,outputPath,baseHash,candidateHash,recipePath]=process.argv.slice(2);
assert.equal(process.argv.length,8,'usage: node finalizer.mjs BASE CANDIDATE OUTPUT BASE_SHA256 CANDIDATE_SHA256 RECIPE');
const scratch=fs.realpathSync('.devshots');
function inside(p){const rel=path.relative(scratch,p);return rel && !rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel)}
const base=fs.realpathSync(basePath),candidate=fs.realpathSync(candidatePath),parent=fs.realpathSync(path.dirname(outputPath));
assert(inside(base)&&inside(candidate)&&(parent===scratch||inside(parent)),'inputs and output must be inside .devshots');
const output=path.join(parent,path.basename(outputPath));
assert.equal(baseHash,'a5ca9490bafccf82a1de8178790a0417a8bc77087c4a6139936eaf8b9e59e337','unreviewed base hash');
assert.equal(candidateHash,'c179d2aab6d7df399a4fde48cf6e1702fcabd67bcaa68a30ac904beef75ab436','unreviewed export hash');
const baseBytes=fs.readFileSync(base),candidateBytes=fs.readFileSync(candidate);
assert.equal(sha(baseBytes),baseHash,'base changed');
assert.equal(sha(candidateBytes),candidateHash,'candidate changed');
assert.equal(sha(fs.readFileSync(recipePath)),'336ee2c6b01e8dc0f7bf54216754787a5107ae7a877350961e4dcc8f8bea6fdb','unreviewed recipe');
const parse=bytes=>{let j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),at=20+bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(at+4),0x004e4942);return {j,bin:bytes.subarray(at+8,at+8+bytes.readUInt32LE(at))}};
const a=parse(baseBytes),b=parse(candidateBytes);
const chunks=[a.bin];let length=a.bin.length;const viewMap=new Map(),accessorMap=new Map();
function copyAccessor(i){if(accessorMap.has(i))return accessorMap.get(i);const src=b.j.accessors[i];assert(src&&!src.sparse&&src.bufferView!==undefined);let vi=src.bufferView;if(!viewMap.has(vi)){let v=b.j.bufferViews[vi];assert.equal(v.buffer,0);let pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}let data=b.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),newView={...v,buffer:0,byteOffset:length};chunks.push(data);length+=data.length;viewMap.set(vi,a.j.bufferViews.push(newView)-1)}const copy={...src,bufferView:viewMap.get(vi)},out=a.j.accessors.push(copy)-1;accessorMap.set(i,out);return out}
for(let lod=0;lod<3;lod++){const name=`LOD${lod}_Beacon_Amber`,old=a.j.meshes.find(x=>x.name===name),neu=b.j.meshes.find(x=>x.name===name);assert(old&&neu&&old.primitives.length===1&&neu.primitives.length===1);const prim=neu.primitives[0],newPrim=old.primitives[0];assert.equal(a.j.materials[newPrim.material].name,b.j.materials[prim.material].name);newPrim.attributes=Object.fromEntries(Object.entries(prim.attributes).map(([k,v])=>[k,copyAccessor(v)]));newPrim.indices=copyAccessor(prim.indices);}
const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}a.j.buffers[0].byteLength=length;
const jb=Buffer.from(JSON.stringify(a.j)),jp=Buffer.alloc((jb.length+3)&~3,32);jb.copy(jp);const bh=Buffer.alloc(8);bh.writeUInt32LE(length,0);bh.writeUInt32LE(0x004e4942,4);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+jp.length+8+length,8);h.writeUInt32LE(jp.length,12);h.writeUInt32LE(0x4e4f534a,16);
fs.writeFileSync(output,Buffer.concat([h,jp,bh,...chunks]),{flag:'wx'});console.log('replaced three amber primitives');
