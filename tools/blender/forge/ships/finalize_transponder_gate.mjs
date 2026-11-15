// Transponder gate reviewed cyan-only finalizer. Run from the repository root.
// Recover the reviewed pre-change base into .devshots with:
// git cat-file blob ebaf20c3211af2715048638f37e9bb187c1c5868 > <scratch-base.glb>
// Forge export must match the pinned reviewed candidate SHA below. A normal full
// export drifts other LOD/collision meshes; do not install that export directly.
// Intentional future export or baseline changes require a new review and repin.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Explicit, reviewed SHA guards keep this selective finalizer from silently accepting drift.
import path from 'node:path';
const [basePath,candidatePath,outputPath,baseHash,candidateHash]=process.argv.slice(2);
assert.equal(process.argv.length,7,'usage: node finalizer.mjs BASE CANDIDATE OUTPUT BASE_SHA256 CANDIDATE_SHA256');
const scratch=fs.realpathSync('.devshots');
function inside(p){const rel=path.relative(scratch,p);return rel && !rel.startsWith('..'+path.sep) && rel!=='..' && !path.isAbsolute(rel)}
const base=fs.realpathSync(basePath),candidate=fs.realpathSync(candidatePath),parent=fs.realpathSync(path.dirname(outputPath));
assert(inside(base)&&inside(candidate)&&inside(parent),'inputs and output must be inside .devshots');
const output=path.join(parent,path.basename(outputPath));assert(!fs.existsSync(output),'output already exists');
assert.equal(baseHash,'dc0439a8eae0b90705c60b9e091ee2074c06a4ecaac37fb992514e4ddcdbc09f','unreviewed base hash');
assert.equal(candidateHash,'3baa84669b93b05f2627c5266b2fda268b851688794ab5c396e547bef543403d','unreviewed export hash');
assert.equal(sha(fs.readFileSync(base)),baseHash,'base changed');
assert.equal(sha(fs.readFileSync(candidate)),candidateHash,'candidate changed');
const parse=p=>{let b=fs.readFileSync(p),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12))),at=20+b.readUInt32LE(12);assert.equal(b.readUInt32LE(at+4),0x004e4942);return {j,bin:b.subarray(at+8,at+8+b.readUInt32LE(at))}};
const a=parse(base),b=parse(candidate);
const chunks=[a.bin];let length=a.bin.length;const viewMap=new Map(),accessorMap=new Map();
function copyAccessor(i){if(accessorMap.has(i))return accessorMap.get(i);const src=b.j.accessors[i];assert(src&&!src.sparse&&src.bufferView!==undefined);let vi=src.bufferView;if(!viewMap.has(vi)){let v=b.j.bufferViews[vi];assert.equal(v.buffer,0);let pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}let data=b.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),newView={...v,buffer:0,byteOffset:length};chunks.push(data);length+=data.length;viewMap.set(vi,a.j.bufferViews.push(newView)-1)}const copy={...src,bufferView:viewMap.get(vi)},out=a.j.accessors.push(copy)-1;accessorMap.set(i,out);return out}
for(let lod=0;lod<3;lod++){const name=`LOD${lod}_Lights_Cyan`,old=a.j.meshes.find(x=>x.name===name),neu=b.j.meshes.find(x=>x.name===name);assert(old&&neu&&old.primitives.length===1&&neu.primitives.length===1);const prim=neu.primitives[0],newPrim=old.primitives[0];assert.equal(a.j.materials[newPrim.material].name,b.j.materials[prim.material].name);newPrim.attributes=Object.fromEntries(Object.entries(prim.attributes).map(([k,v])=>[k,copyAccessor(v)]));newPrim.indices=copyAccessor(prim.indices);}
const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}a.j.buffers[0].byteLength=length;
const jb=Buffer.from(JSON.stringify(a.j)),jp=Buffer.alloc((jb.length+3)&~3,32);jb.copy(jp);const bh=Buffer.alloc(8);bh.writeUInt32LE(length,0);bh.writeUInt32LE(0x004e4942,4);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+jp.length+8+length,8);h.writeUInt32LE(jp.length,12);h.writeUInt32LE(0x4e4f534a,16);
fs.writeFileSync(output,Buffer.concat([h,jp,bh,...chunks]));console.log('replaced three cyan primitives');
