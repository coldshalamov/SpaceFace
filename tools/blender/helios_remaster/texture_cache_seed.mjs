/** Reuse immutable SG04 image encodes for this remaster's exact unchanged source images. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile, link, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import JPEG from 'jpeg-js';
import { PNG } from 'pngjs';
import { read as readKtx, KHR_DF_MODEL_UASTC, KHR_DF_TRANSFER_SRGB, KHR_DF_TRANSFER_LINEAR,
  KHR_SUPERCOMPRESSION_ZSTD } from 'ktx-parse';
import { textureEncodingKey } from '../../../scripts/lib/cachedKtx2.mjs';

export const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
export const CACHE=resolve(ROOT,'.devshots/ktx2-cache');
const BUILDER='scripts/build-sg04-release-assets.mjs';
const MANIFEST='assets/ships/release/release_manifest.json';
export const sha=b=>createHash('sha256').update(b).digest('hex');
const norm=s=>s.replaceAll('\r\n','\n');
function git(args){return execFileSync('git',args,{cwd:ROOT,maxBuffer:128*1024*1024,windowsHide:true});}
function gitFile(revision,file){return git(['show',`${revision}:${file}`]);}
function namedFunction(source,name){
  const text=source.match(new RegExp(`^function ${name}\\([^]*?^\\}`,'m'))?.[0];
  if(!text)throw new Error(`Missing exact SG04 function ${name}`);
  return text;
}

export function encodingRecipe(source){
  const decodePngText=namedFunction(source,'decodePng');
  const decodeImageText=namedFunction(source,'decodeImage');
  // Evaluate only these two local decoder declarations and literal option objects, never the builder.
  const decodePng=Function('PNG',`return (${decodePngText});`)(PNG);
  const decodeImage=Function('decodePng','JPEG',`return (${decodeImageText});`)(decodePng,JPEG);
  if(decodeImage.toString()!==decodeImageText)throw new Error('Decoder source text changed during extraction');
  const blocks=[...source.matchAll(/\bktx2\(\s*(\{[^]*?^ {8}\})\s*\)/gm)];
  if(blocks.length!==3)throw new Error(`Expected the three SG04 encoding profiles, found ${blocks.length}`);
  const profiles=blocks.map(match=>Function('decodeImage',`return (${match[1]});`)(decodeImage));
  for(const p of profiles)if(!(p.slots instanceof RegExp)||!p.isUASTC||p.uastcLDRQualityLevel!==2
    ||!p.generateMipmap||!p.needSupercompression)throw new Error('Unsupported SG04 quality contract');
  return {profiles,decodeImage,decodeImageText,decodePngText};
}
function optionSignature(options){
  return JSON.stringify(Object.fromEntries(Object.entries(options).filter(([k])=>k!=='slots'&&k!=='pattern')
    .sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,typeof v==='function'?norm(v.toString()):v])));
}
function profileFor(slot,profiles){return profiles.find(p=>p.slots.test(slot));}

export function parseGlb(bytes){
  if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB envelope');
  let doc,bin;
  for(let offset=12;offset<bytes.length;){
    const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);offset+=8;
    if(offset+length>bytes.length)throw new Error('GLB chunk exceeds buffer');
    if(type===0x4e4f534a)doc=JSON.parse(bytes.subarray(offset,offset+length));
    if(type===0x004e4942)bin=bytes.subarray(offset,offset+length);
    offset+=length;
  }
  if(!doc||!bin)throw new Error('GLB must embed JSON and binary data');
  return {doc,bin};
}
function embeddedImage(glb,textureIndex){
  const texture=glb.doc.textures?.[textureIndex];
  const imageIndex=texture?.extensions?.KHR_texture_basisu?.source??texture?.source;
  const image=glb.doc.images?.[imageIndex],view=glb.doc.bufferViews?.[image?.bufferView];
  if(!image||!view||view.buffer!==0||image.uri)return null;
  const start=view.byteOffset||0,end=start+view.byteLength;
  if(end>glb.bin.length)throw new Error('Image exceeds GLB binary');
  return {imageIndex,mime:image.mimeType,bytes:glb.bin.subarray(start,end)};
}
function materialParameters(material){
  const p=material.pbrMetallicRoughness||{};
  return [p.baseColorFactor||[1,1,1,1],p.metallicFactor??1,p.roughnessFactor??1,
    material.emissiveFactor||[0,0,0],material.alphaMode||'OPAQUE',material.alphaCutoff??0.5,
    material.doubleSided||false,material.normalTexture?.scale??1,material.occlusionTexture?.strength??1];
}
function textureSlots(object,path='',out=[]){
  for(const [key,value]of Object.entries(object||{})){
    if(!value||typeof value!=='object')continue;
    const next=path?`${path}.${key}`:key;
    if(key.endsWith('Texture')&&Number.isInteger(value.index))out.push({slot:key,path:next,index:value.index});
    else textureSlots(value,next,out);
  }
  return out;
}
export function bindings(glb,profiles){
  const usage=new Map();
  const names=new Set(),ambiguous=new Set();
  for(const node of glb.doc.nodes||[]){
    if(node.mesh===undefined)continue;
    if(!node.name||names.has(node.name))ambiguous.add(node.name);
    names.add(node.name);
    (glb.doc.meshes[node.mesh].primitives||[]).forEach((p,i)=>{
      if(p.material===undefined)return;
      const list=usage.get(p.material)||[];list.push([node.name,i]);usage.set(p.material,list);
    });
  }
  const result=[];
  for(const [index,uses]of usage){
    if(uses.some(([name])=>ambiguous.has(name)))continue;
    const material=glb.doc.materials[index];
    const identity=JSON.stringify([material.name||'',uses.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),materialParameters(material)]);
    for(const slot of textureSlots(material)){
      const options=profileFor(slot.slot,profiles),image=embeddedImage(glb,slot.index);
      if(options&&image)result.push({...slot,...image,identity,key:`${identity}:${slot.path}`,options});
    }
  }
  return result;
}

export function eligibleImage(candidate,original,compressed,options,decodeImage){
  if(!candidate.equals(original))return {ok:false,reason:'source image bytes changed'};
  let ktx,pixels;
  try{
    ktx=readKtx(compressed);
    // The old manifest binds these exact already-encoded source bytes. Only dimensions are
    // needed here; inflating every unchanged multi-megapixel PNG would repeat needless work.
    pixels=original.length>=33&&original.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      &&original.toString('ascii',12,16)==='IHDR'
      ? {width:original.readUInt32BE(16),height:original.readUInt32BE(20)}:decodeImage(original);
  }catch{return {ok:false,reason:'invalid image/container'};}
  const dfd=ktx.dataFormatDescriptor;
  const transfer=options.isSetKTX2SRGBTransferFunc?KHR_DF_TRANSFER_SRGB:KHR_DF_TRANSFER_LINEAR;
  const levels=Math.floor(Math.log2(Math.max(pixels.width,pixels.height)))+1;
  if(ktx.vkFormat!==0||ktx.typeSize!==1||ktx.pixelWidth!==pixels.width||ktx.pixelHeight!==pixels.height
    ||ktx.pixelDepth!==0||ktx.layerCount!==0||ktx.faceCount!==1||ktx.levels.length!==levels
    ||ktx.supercompressionScheme!==KHR_SUPERCOMPRESSION_ZSTD||dfd.length!==1
    ||dfd[0].colorModel!==KHR_DF_MODEL_UASTC||dfd[0].transferFunction!==transfer)
    return {ok:false,reason:'compression, color-space, dimensions or mip contract differs'};
  for(let i=0;i<levels;i++){
    const width=Math.max(1,pixels.width>>i),height=Math.max(1,pixels.height>>i);
    if(!ktx.levels[i].levelData.length||ktx.levels[i].uncompressedByteLength!==Math.ceil(width/4)*Math.ceil(height/4)*16)
      return {ok:false,reason:'invalid UASTC mip payload'};
  }
  return {ok:true,width:pixels.width,height:pixels.height,levels};
}

export async function seedEntry(key,bytes,cache=CACHE){
  if(!/^[0-9a-f]{64}$/.test(key))throw new Error('Invalid cache key');
  await mkdir(cache,{recursive:true});
  const target=resolve(cache,`${key}.ktx2`),checksum=`${target}.sha256`;
  if(existsSync(target)||existsSync(checksum)){
    try{const [current,digest]=await Promise.all([readFile(target),readFile(checksum,'utf8')]);
      return sha(current)===digest?'already-cached':'occupied-cache-miss';
    }catch{return 'occupied-cache-miss';}
  }
  const temporary=`${target}.seed-${process.pid}.tmp`;
  await writeFile(temporary,bytes,{flag:'wx'});
  try{
    // Hard-link creation is atomic and refuses an existing entry; no active encoder output is replaced.
    await link(temporary,target);
    await writeFile(checksum,sha(bytes),{flag:'wx'});
    return 'seeded';
  }catch(error){if(error.code==='EEXIST')return 'concurrent-cache-entry';throw error;}
  finally{await unlink(temporary);}
}

export function context(revision=null){
  revision=revision||git(['log','-1','--format=%H','--',MANIFEST]).toString().trim();
  revision=git(['rev-parse',`${revision}^{commit}`]).toString().trim();
  const manifestBytes=gitFile(revision,MANIFEST),manifest=JSON.parse(manifestBytes);
  if(manifest.generatedBy!==BUILDER)throw new Error('Donor manifest is not an SG04 release');
  const currentText=readFileSync(resolve(ROOT,BUILDER),'utf8'),oldText=gitFile(revision,BUILDER).toString();
  const current=encodingRecipe(currentText),previous=encodingRecipe(oldText);
  if(norm(current.decodePngText)!==norm(previous.decodePngText)||norm(current.decodeImageText)!==norm(previous.decodeImageText))
    throw new Error('Historical decoder differs from current SG04');
  const oldLock=JSON.parse(gitFile(revision,'package-lock.json'));
  for(const name of ['ktx2-encoder','pngjs','jpeg-js']){
    const locked=oldLock.packages?.[`node_modules/${name}`],installed=JSON.parse(readFileSync(resolve(ROOT,`node_modules/${name}/package.json`),'utf8'));
    const currentLock=JSON.parse(readFileSync(resolve(ROOT,'package-lock.json'),'utf8')).packages?.[`node_modules/${name}`];
    if(!locked||locked.version!==installed.version||locked.version!==currentLock?.version||locked.integrity!==currentLock.integrity)
      throw new Error(`Historical encoding dependency differs: ${name}`);
  }
  const registry={};
  for(const [file,group]of [['hero_fleet_sources.json','hero-fleet'],['additional_fleet_sources.json','additional-fleet']]){
    const rows=JSON.parse(readFileSync(resolve(ROOT,`tools/blender/helios_remaster/${file}`),'utf8'));
    for(const [name,row]of Object.entries(rows))registry[name]={...row,
      candidatePath:`.devshots/helios-remaster/${group}/${name}/${name}.glb`};
  }
  const placeIds=new Set(readFileSync(resolve(ROOT,'.devshots/helios-remaster/places-release-ids.txt'),'utf8').trim().split(','));
  const places=JSON.parse(readFileSync(resolve(ROOT,'tools/blender/helios_remaster/sector_places.contract.json'),'utf8'));
  for(const row of places.assets)if(placeIds.has(row.id)){
    const sourcePath=row.source.replaceAll('\\','/');
    registry[row.id]={sourcePath,sha256:row.sourceSha256,candidatePath:sourcePath};
    placeIds.delete(row.id);
  }
  if(placeIds.size)throw new Error(`Place IDs missing from owned contract: ${[...placeIds].join(',')}`);
  return {revision,manifest,manifestSha256:sha(manifestBytes),current,previous,registry,
    currentBuilderSha256:sha(currentText),previousBuilderSha256:sha(oldText)};
}

export function assetMatches(ctx,name){
  const pinned=ctx.registry[name];
  if(!pinned)throw new Error('Asset is outside the owned fleet');
  const manifestEntries=ctx.manifest.assets.filter(a=>a.source===pinned.sourcePath);
  if(manifestEntries.length!==1)return {name,reason:'no unique committed release pair',matches:[]};
  const entry=manifestEntries[0];
  const oldSource=gitFile(ctx.revision,entry.source),release=gitFile(ctx.revision,entry.release);
  if(sha(oldSource)!==entry.sourceSha256||sha(release)!==entry.releaseSha256)
    return {name,reason:'committed pair does not match manifest hashes',matches:[]};
  const candidatePath=resolve(ROOT,pinned.candidatePath);
  const candidateBytes=readFileSync(candidatePath);
  const oldBindings=bindings(parseGlb(oldSource),ctx.previous.profiles);
  const releaseBindings=bindings(parseGlb(release),ctx.previous.profiles);
  const candidates=bindings(parseGlb(candidateBytes),ctx.current.profiles);
  const matches=[],rejected=[];
  const seen=new Set();
  for(const old of oldBindings){
    if(!['image/png','image/jpeg'].includes(old.mime))continue;
    const compressed=releaseBindings.filter(b=>b.key===old.key&&b.mime==='image/ktx2');
    if(compressed.length!==1){rejected.push('ambiguous or changed material/node/slot binding');continue;}
    for(const candidate of candidates){
      if(!['image/png','image/jpeg'].includes(candidate.mime)||!candidate.bytes.equals(old.bytes))continue;
      if(optionSignature(old.options)!==optionSignature(candidate.options))continue;
      const key=textureEncodingKey(candidate.bytes,candidate.options);
      if(seen.has(key))continue;
      const check=eligibleImage(candidate.bytes,old.bytes,compressed[0].bytes,candidate.options,ctx.current.decodeImage);
      if(!check.ok){rejected.push(check.reason);continue;}
      seen.add(key);
      matches.push({key,bytes:compressed[0].bytes,original:old.bytes,candidate:candidate.bytes,options:candidate.options,
        sourceImageSha256:sha(old.bytes),compressedSha256:sha(compressed[0].bytes),slot:candidate.slot,
        originalSlot:old.slot,materialBinding:old.key,width:check.width,height:check.height,mips:check.levels});
    }
  }
  return {name,sourcePath:pinned.sourcePath,candidatePath,candidateSha256:sha(candidateBytes),
    sourceSha256:entry.sourceSha256,releasePath:entry.release,releaseSha256:entry.releaseSha256,
    originalPngBindings:oldBindings.filter(b=>b.mime==='image/png').length,
    originalNativeKtxBindings:oldBindings.filter(b=>b.mime==='image/ktx2').length,
    matches,rejected:[...new Set(rejected)],reason:matches.length?null:'no exact eligible image bytes'};
}

export async function run({seed=false,revision=null,only=null}={}){
  const started=performance.now(),ctx=context(revision),rows=[],seen=new Map();
  for(const name of only||Object.keys(ctx.registry)){
    let result;
    try{result=assetMatches(ctx,name);}catch(error){result={name,reason:error.message,matches:[]};}
    const records=[];
    for(const match of result.matches){
      let status=seen.get(match.key);
      if(!status){status=seed?await seedEntry(match.key,match.bytes):'eligible';seen.set(match.key,status);}
      const {bytes,original,candidate,options,...record}=match;
      records.push({...record,status,compressedBytes:bytes.length});
    }
    const {matches,...row}=result;rows.push({...row,matches:records});
    console.log(`[fleet-cache] ${name}: ${records.length} exact images${result.reason?` (${result.reason})`:''}`);
  }
  const report={revision:ctx.revision,manifestSha256:ctx.manifestSha256,currentBuilderSha256:ctx.currentBuilderSha256,
    previousBuilderSha256:ctx.previousBuilderSha256,elapsedMs:performance.now()-started,seed,
    scope:'hero26, additional12 and explicit owned27 place release IDs; offline encoding reuse, not runtime performance',
    uniqueEligibleKeys:seen.size,statusCounts:Object.fromEntries([...new Set(seen.values())].map(s=>[s,[...seen.values()].filter(v=>v===s).length])),assets:rows};
  const output=resolve(ROOT,only?'.devshots/helios-remaster/texture-cache-seed-selected.json':'.devshots/helios-remaster/texture-cache-seed.json');
  await writeFile(output,JSON.stringify(report,null,2));
  console.log(JSON.stringify({report:output,elapsedMs:report.elapsedMs,uniqueEligibleKeys:seen.size,statusCounts:report.statusCounts}));
  return report;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await run({seed:process.argv.includes('--seed'),revision:process.argv.find(a=>a.startsWith('--revision='))?.slice(11)||null,
    only:process.argv.find(a=>a.startsWith('--only='))?.slice(7).split(',')||null});
}
