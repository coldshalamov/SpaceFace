// Decode exact existing source meshes/maps into candidate-only Blender inputs.
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {dequantize} from '@gltf-transform/functions';
import {MeshoptDecoder} from 'meshoptimizer';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync,execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const SOURCE_REVISION='463d9383855d99fce87e5ee6e59974fe5f2653c4';
const root=process.cwd(),out=resolve(root,'.devshots/helios-remaster/sector-places/input');
mkdirSync(out,{recursive:true});
const source=readFileSync(resolve(root,'tools/blender/helios_remaster/sector_places.py'),'utf8');
const names=[...new Set([...source.matchAll(/'(place_[a-z0-9_]+|var_station_trade_hub_scn_overlay_v01|pod_[a-z0-9_]+|weapon_[a-z0-9_]+)'/g)].map(m=>m[1]))];
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const manifest={sourceRevision:SOURCE_REVISION,assets:[]};
for(const name of names){
  const family=name.startsWith('weapon_')?'weapons':name.startsWith('pod_')?'pods':'places';
  let input=join(root,'assets/ships/parts',family,name+'.glb');
  if(name.startsWith('place_aftermath_'))input=join(root,'assets/incubator/wreck_aftermath_pack/source',name.replace('place_aftermath_','')+'.glb');
  if(!existsSync(input)){console.error('MISSING',name,input);continue;}
  // The parent assets will themselves be promoted. Pin the donor commit so this
  // authoring recipe remains repeatable instead of cutting the remaster twice.
  const relative=input.slice(root.length+1).replaceAll('\\','/');
  const sourceBytes=execFileSync('git',['show',`${SOURCE_REVISION}:${relative}`],{cwd:root,maxBuffer:256*1024*1024,windowsHide:true});
  const doc=await io.readBinary(new Uint8Array(sourceBytes));
  manifest.assets.push({id:name,source:relative,sha256:createHash('sha256').update(sourceBytes).digest('hex')});
  await doc.transform(dequantize());
  for(const ext of doc.getRoot().listExtensionsUsed())if(['EXT_meshopt_compression','KHR_mesh_quantization'].includes(ext.extensionName))ext.dispose();
  let index=0;
  for(const tex of doc.getRoot().listTextures()){
    if(tex.getMimeType()!=='image/ktx2')continue;
    const ktx=join(out,`${name}-${index}.ktx2`),png=join(out,`${name}-${index++}.png`);
    writeFileSync(ktx,tex.getImage());
    const r=spawnSync('ktx',['extract','--transcode','rgba8',ktx,png],{windowsHide:true,encoding:'utf8'});
    if(r.status!==0)throw new Error(`${name}: ${r.stderr}`);
    tex.setImage(readFileSync(png)).setMimeType('image/png').setURI('');
  }
  for(const ext of doc.getRoot().listExtensionsUsed())if(ext.extensionName==='KHR_texture_basisu')ext.dispose();
  await io.write(join(out,name+'.glb'),doc);
  console.log('PREPARED',name);
}
writeFileSync(join(out,'source-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
