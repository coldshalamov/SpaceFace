import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import path from 'node:path';
const sha=b=>createHash('sha256').update(b).digest('hex');
// Reviewed one-time Pallet Jack clamp finalizer; inputs/outputs must be in .devshots.
// Recover each original source safely in PowerShell (replace the blob ID for the desired LOD):
// node -e "require('node:fs').writeFileSync(process.argv[1],require('node:child_process').execFileSync('git',['cat-file','blob','74a285d6f7914bc923aa3a629f7d2c50546b9f50']))" <scratch-base.glb>
// Original source blobs: LOD0 74a285d6f7914bc923aa3a629f7d2c50546b9f50,
// LOD1 055e551a791017e626a847fb015bcafcfd961654, LOD2 f9ae3cde8db2e04183f0af6c71800a49e53ad329.
// Full Forge exports drift unrelated meshes; use them only as the pinned candidate input.
const [lod,basePath,candidatePath,recipePath,outputPath]=process.argv.slice(2);assert.equal(process.argv.length,7);assert(['0','1','2'].includes(lod));
const baseHashes=['6c8306b9494145ce9a6688cc52dbd4871b9daeaf7b007b7ecb574d0ff84645eb','d90386002c52e02b456a94d531fa7c09c5139bc4ae736e62a3dccaab93f70d99','5df03beaf515c9442c80cb98804fd7fb1a1af3c3a0ea1dfcb9064b4de28f29b0'];
const candidateHashes=['fbec8cd1716baf7c019c54a8ac733aebf12ed5d6992db2dd2e397ac6704fbcca','ba2834c1915eb579198ba922b1f173a7c528b3b4156eb69bdbb24653530bbe92','83698c5508d8f9f0654092ec9dece9392d06514ed38908f3b1e949d957249bf6'];
const recipeHash='a4c55129372631488c6a838f38d4525ad7d1bf0b031aa19b0281387fe0262fa5';
const scratch=fs.realpathSync('.devshots'),inside=p=>{const r=path.relative(scratch,p);return !!r&&r!=='..'&&!r.startsWith('..'+path.sep)&&!path.isAbsolute(r)};
const base=fs.realpathSync(basePath),candidate=fs.realpathSync(candidatePath),parent=fs.realpathSync(path.dirname(outputPath));assert(inside(base)&&inside(candidate)&&(parent===scratch||inside(parent)),'GLB paths must be under .devshots');const output=path.join(parent,path.basename(outputPath));
const baseBytes=fs.readFileSync(base),candidateBytes=fs.readFileSync(candidate);
assert.equal(sha(baseBytes),baseHashes[+lod],'unreviewed base');assert.equal(sha(candidateBytes),candidateHashes[+lod],'unreviewed Forge export');assert.equal(sha(fs.readFileSync(recipePath)),recipeHash,'unreviewed recipe');
const parse=bytes=>{let j=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12))),at=20+bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(at+4),0x004e4942);return {j,bin:bytes.subarray(at+8,at+8+bytes.readUInt32LE(at))}};
const a=parse(baseBytes),b=parse(candidateBytes);const name=`LOD${lod}_MOTION_PALLET_JACK_CLAMP_MechanicalDark`;
assert.equal(a.j.asset.extras.conceptGeometry.recipeSha256,'aeab75aaad0745984af9feabf372347b4fc742843cef649ac19ffc3dbce240c2');a.j.asset.extras.conceptGeometry.recipeSha256=recipeHash;
const chunks=[a.bin];let length=a.bin.length;const viewMap=new Map(),accessorMap=new Map();
function copyAccessor(i){if(accessorMap.has(i))return accessorMap.get(i);const src=b.j.accessors[i];assert(src&&!src.sparse&&src.bufferView!==undefined);let vi=src.bufferView;if(!viewMap.has(vi)){let v=b.j.bufferViews[vi];assert.equal(v.buffer,0);let pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}let data=b.bin.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength),newView={...v,buffer:0,byteOffset:length};chunks.push(data);length+=data.length;viewMap.set(vi,a.j.bufferViews.push(newView)-1)}const copy={...src,bufferView:viewMap.get(vi)},out=a.j.accessors.push(copy)-1;accessorMap.set(i,out);return out}
{const old=a.j.meshes.find(x=>x.name===name),neu=b.j.meshes.find(x=>x.name===name);assert(old&&neu&&old.primitives.length===1&&neu.primitives.length===1);const prim=neu.primitives[0],newPrim=old.primitives[0];assert.equal(a.j.materials[newPrim.material].name,b.j.materials[prim.material].name);newPrim.attributes=Object.fromEntries(Object.entries(prim.attributes).map(([k,v])=>[k,copyAccessor(v)]));newPrim.indices=copyAccessor(prim.indices);}
const pad=(4-length%4)%4;if(pad){chunks.push(Buffer.alloc(pad));length+=pad}a.j.buffers[0].byteLength=length;
const jb=Buffer.from(JSON.stringify(a.j)),jp=Buffer.alloc((jb.length+3)&~3,32);jb.copy(jp);const bh=Buffer.alloc(8);bh.writeUInt32LE(length,0);bh.writeUInt32LE(0x004e4942,4);const h=Buffer.alloc(20);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(20+jp.length+8+length,8);h.writeUInt32LE(jp.length,12);h.writeUInt32LE(0x4e4f534a,16);
fs.writeFileSync(output,Buffer.concat([h,jp,bh,...chunks]),{flag:'wx'});console.log('replaced guarded clamp primitive');
