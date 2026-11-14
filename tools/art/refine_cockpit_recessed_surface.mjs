/** Prepare the reviewed recessed cockpit surface without regenerating its geometry.
 * node tools/art/refine_cockpit_recessed_surface.mjs --source INPUT.glb --out OUTPUT.glb
 * Writes a new authoring candidate and provenance; never publishes release assets.
 */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {basename,dirname,join,resolve} from 'node:path';
import {lstat,open,readFile,realpath,unlink} from 'node:fs/promises';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import sharp from 'sharp';

const options={};
for(let i=2;i<process.argv.length;i+=2){
  const key=process.argv[i];
  if(!['--source','--out'].includes(key)||!process.argv[i+1]||options[key])throw Error('Expected unique --source INPUT --out OUTPUT arguments');
  options[key]=process.argv[i+1];
}
if(!options['--source']||!options['--out'])throw Error('Required: --source INPUT --out OUTPUT');
const sourcePath=await realpath(options['--source']);
const out=join(await realpath(dirname(resolve(options['--out']))),basename(options['--out'])),sidecar=`${out}.provenance.json`;
const key=value=>process.platform==='win32'?value.toLowerCase():value;
for(const path of [out,sidecar]){
  if(key(path)===key(sourcePath))throw Error('Output or sidecar collides with source');
  try{await lstat(path);throw Error(`Refusing to overwrite existing path: ${path}`);}catch(error){if(error.code!=='ENOENT')throw error;}
}
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const reviewedHash='41eb2d5af548c057908140d29ebcb322bda9e526fc845d49b0c1b66d9cfa5962';
const invalidNormalHash='6b7713530ae6da9021d96bcbfcbc17a1f4ccbf8f18f54b1c6c4f53b150ffd799';
const original=await readFile(sourcePath);
if(hash(original)!==reviewedHash)throw Error('Unsupported input: use the reviewed recessed cockpit source');
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.readBinary(original),root=doc.getRoot();
assert.equal(root.listScenes()[0].getExtras().spacefaceAsset.assetId,'SF_COCKPIT_RECESSED');
const materials=['Material_Accent','Material_Hull','Material_Mechanical'].map(name=>{
  const matches=root.listMaterials().filter(m=>m.getName()===name);assert.equal(matches.length,1,`Expected one ${name}`);return matches[0];
});
const normal=materials[0].getNormalTexture();
assert(normal && materials.every(material=>material.getNormalTexture()===normal),'Expected shared cockpit normal');
assert.equal(hash(normal.getImage()),invalidNormalHash,'Unexpected normal image');
const usages=normal.getGraph().listParentEdges(normal).filter(edge=>edge.getParent()!==root);
assert.equal(usages.length,3);assert(usages.every(edge=>edge.getName()==='normalTexture'));
const rgba=Buffer.alloc(4*4*4);
for(let i=0;i<rgba.length;i+=4){rgba[i]=128;rgba[i+1]=128;rgba[i+2]=255;rgba[i+3]=255;}
const neutral=await sharp(rgba,{raw:{width:4,height:4,channels:4}}).png().toBuffer();
normal.setImage(new Uint8Array(neutral)).setMimeType('image/png').setName('cockpit_recessed_neutral_normal_4x4')
  .setExtras({...normal.getExtras(),spacefaceTexturePolicy:['neutral-normal-no-authored-height']});
const glass=root.listMaterials().filter(m=>m.getName()==='Material_Glass');assert.equal(glass.length,1);
glass[0].setBaseColorFactor([0.07,0.2,0.28,1]).setEmissiveFactor([0.01,0.03,0.05]).setRoughnessFactor(0.13);
const strength=glass[0].getExtension('KHR_materials_emissive_strength');
assert(strength,'Expected existing glass emissive-strength extension');strength.setEmissiveStrength(1);
if(hash(await readFile(sourcePath))!==reviewedHash)throw Error('Source changed during preparation');
const output=await io.writeBinary(doc);
let outputHandle,provenanceHandle;
try{
  outputHandle=await open(out,'wx');await outputHandle.writeFile(output);await outputHandle.close();
  provenanceHandle=await open(sidecar,'wx');
  await provenanceHandle.writeFile(`${JSON.stringify({recipe:'cockpit-recessed-surface-v1',sourcePath,sourceSha256:reviewedHash,
    outputSha256:hash(output),
    scope:'Replace the incorrectly bound grayscale illustration with a neutral 4px normal; calibrate Material_Glass tint, emission and roughness. Preserve geometry, other maps, texture transforms and motion.'},null,2)}\n`);
  await provenanceHandle.close();
}catch(error){
  if(provenanceHandle){await provenanceHandle.close().catch(()=>{});await unlink(sidecar);}
  if(outputHandle){await outputHandle.close().catch(()=>{});await unlink(out);}
  throw error;
}
console.log(JSON.stringify({output:out,sha256:hash(output)}));
