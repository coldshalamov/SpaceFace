import test from 'node:test';
import assert from 'node:assert/strict';
import {readBank,validateAssembly} from '../scripts/check-asset-bank-assemblies.mjs';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
const digest=b=>createHash('sha256').update(b).digest('hex');
function fixture(){
 const lods=[0,1,2].map(level=>({level,file:`span_lod${level}.glb`,bytes:4,sha256:digest(Buffer.from('mesh'))}));
 const sockets=[{name:'left',position:[-1,0,0],forward:[-1,0,0],up:[0,1,0]},{name:'right',position:[1,0,0],forward:[1,0,0],up:[0,1,0]}];
 const bank=new Map([['span',{assetId:'span',lods,bounds:{min:[-1,-.1,-.1],max:[1,.1,.1]},sockets,collision:{solids:[{type:'box',center:[0,0,0],size:[2,.2,.2],rotation:[0,0,0,1]}]}}]]);
 const instance=(id,x)=>({id,assetId:'span',translation:[x,0,0],rotation:[0,0,0,1],scale:[1,1,1]});
 const r={id:'join',dependencies:['span'],dependencyLocks:{span:lods.map(({level,sha256})=>({level,sha256}))},instances:[instance('a',0),instance('b',2)],joins:[{parent:{instance:'a',socket:'right'},child:{instance:'b',socket:'left'}}],bounds:{min:[-1,-.1,-.1],max:[3,.1,.1]},approach:{min:[-2,1,-1],max:[4,2,1]},exit:{min:[-2,-2,-1],max:[4,-1,1]}};
 return {bank,r};
}
test('actual joins and clear envelopes pass',()=>{const {bank,r}=fixture();assert.equal(validateAssembly(r,bank).joins,1);});
for(const [name,mutate,error] of [
 ['gap',r=>r.instances[1].translation[0]+=.1,/join gap/],
 ['wrong mating face',r=>r.joins[0].child.socket='right',/join gap/],
 ['rescale',r=>r.instances[1].scale[0]=2,/unit scale/],
 ['missing member',r=>r.instances[1].assetId='absent',/unknown asset/],
 ['false bounds',r=>r.bounds.max[0]=50,/bounds differ/],
 ['missing dependency',r=>r.dependencies=[],/dependency list differs/],
 ['blocked approach',r=>r.approach={min:[-.5,-.5,-.5],max:[.5,.5,.5]},/approach intersects/],
 ['blocked exit',r=>r.exit={min:[-.5,-.5,-.5],max:[.5,.5,.5]},/exit intersects/],
 ['duplicate',r=>r.instances[1].id='a',/duplicate instance/]
])test(`rejects ${name}`,()=>{const {bank,r}=fixture();mutate(r);assert.throws(()=>validateAssembly(r,bank),error);});

for(const [name,mutate,error] of [
 ['missing locks',r=>delete r.dependencyLocks,/dependencyLocks/],
 ['missing asset binding',r=>delete r.dependencyLocks.span,/keys differ/],
 ['extra asset binding',r=>r.dependencyLocks.unused=[],/keys differ/],
 ['missing LOD',r=>r.dependencyLocks.span.pop(),/missing or malformed LOD/],
 ['duplicate LOD',r=>r.dependencyLocks.span[2].level=1,/duplicate LOD/],
 ['malformed level',r=>r.dependencyLocks.span[2].level='2',/malformed LOD level/],
 ['malformed hash',r=>r.dependencyLocks.span[1].sha256='bad',/malformed SHA256/],
 ['stale hash',r=>r.dependencyLocks.span[1].sha256='0'.repeat(64),/stale dependency hash/]
])test(`rejects ${name}`,()=>{const {bank,r}=fixture();mutate(r);assert.throws(()=>validateAssembly(r,bank),error);});
test('corrected binding passes; repeated instances bind asset only once',()=>{
 const {bank,r}=fixture();r.dependencyLocks.span[0].sha256='0'.repeat(64);
 assert.throws(()=>validateAssembly(r,bank),/stale dependency hash/);
 r.dependencyLocks.span[0].sha256=bank.get('span').lods[0].sha256;
 bank.set('unused',{assetId:'unused'});assert.equal(validateAssembly(r,bank).instances,2);
});
test('rejects malformed sidecar LOD hashes',()=>{
 const {bank,r}=fixture();bank.get('span').lods[0].sha256='bad';
 assert.throws(()=>validateAssembly(r,bank),/sidecar: malformed SHA256/);
});
async function diskFixture(t){
 const root=await mkdtemp(path.join(tmpdir(),'assembly-hashes-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const {bank,r}=fixture();const a=bank.get('span');
 await writeFile(path.join(root,'span.json'),JSON.stringify(a));
 for(const l of a.lods)await writeFile(path.join(root,l.file),'mesh');
 await writeFile(path.join(root,'unused.json'),JSON.stringify({assetId:'unused'}));
 return {root,r,a};
}
test('readBank verifies selected files; repeated IDs and unused bank assets unaffected',async t=>{
 const {root,r}=await diskFixture(t);const bank=await readBank(root,{referencedAssets:['span','span']});
 assert.equal(validateAssembly(r,bank).instances,2);
});
test('readBank rejects changed same-length file content',async t=>{
 const {root}=await diskFixture(t);await writeFile(path.join(root,'span_lod1.glb'),'edit');
 await assert.rejects(readBank(root,{referencedAssets:['span']}),/file SHA256 differs/);
});
test('readBank rejects changed file byte count',async t=>{
 const {root}=await diskFixture(t);await writeFile(path.join(root,'span_lod2.glb'),'longer');
 await assert.rejects(readBank(root,{referencedAssets:['span']}),/file bytes differ/);
});
test('readBank rejects missing referenced export',async t=>{
 const {root}=await diskFixture(t);await rm(path.join(root,'span_lod0.glb'));
 await assert.rejects(readBank(root,{referencedAssets:['span']}),/ENOENT/);
});
test('readBank rejects invalid declared byte count',async t=>{
 const {root,a}=await diskFixture(t);a.lods[0].bytes=-1;
 await writeFile(path.join(root,'span.json'),JSON.stringify(a));
 await assert.rejects(readBank(root,{referencedAssets:['span']}),/invalid LOD0 bytes/);
});
test('readBank rejects export path traversal',async t=>{
 const {root,a}=await diskFixture(t);a.lods[0].file='../outside.glb';
 await writeFile(path.join(root,'span.json'),JSON.stringify(a));
 await assert.rejects(readBank(root,{referencedAssets:['span']}),/invalid LOD file/);
});
test('rejects duplicate sidecar LOD level',()=>{
 const {bank,r}=fixture();bank.get('span').lods[2].level=1;
 assert.throws(()=>validateAssembly(r,bank),/sidecar: duplicate LOD/);
});
