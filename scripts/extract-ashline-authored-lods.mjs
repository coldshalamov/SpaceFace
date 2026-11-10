import { NodeIO, PropertyType, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
const dir='assets/ships/parts/wholeships';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder,'meshopt.encoder':MeshoptEncoder});
const hash = async f => createHash('sha256').update(await readFile(f)).digest('hex');
const result=[];
for (const ship of ['ashline_dart','ashline_rig']) for (const tier of [1,2]) {
 const input=`assets/ships/parts/wholeships/${ship}.glb`, output=`${dir}/${ship}_lod${tier}.glb`;
 const d=await io.read(input), root=d.getRoot(), scene=root.getDefaultScene()||root.listScenes()[0];
 const nodes=root.listNodes(), tierNodes=nodes.filter(n=>n.getName().startsWith(`LOD${tier}_`));
 const present=new Set(tierNodes.map(n=>n.getName().replace(/^LOD[12]_/,'')));
 const original=nodes.filter(n=>n.getName().startsWith('LOD0_'));
 // Keep unique original parts when authored simplification dropped them entirely; keep Dart's
 // warning livery, whose authored far version shrank from 84 triangles to 3/1.
 const keepBase=new Set(original.filter(n=>!present.has(n.getName().slice(5)) || (ship==='ashline_dart' && /_Warning$/.test(n.getName()))).map(n=>n.getName().slice(5)));
 const kept=[];
 for(const n of nodes){const match=/^LOD([012])_(.+)/.exec(n.getName());if(!match)continue;if(n.listChildren().length)throw new Error(`non-leaf LOD node ${n.getName()}`);const keep=(+match[1]===tier && !keepBase.has(match[2]))||(+match[1]===0&&keepBase.has(match[2]));if(!keep){n.dispose();continue;}const name=`LOD0_${match[2]}`;n.setName(name);n.getMesh()?.setName(name);kept.push(name);}
 const asset=root.getAsset(); asset.extras.spacefaceAsset={...asset.extras.spacefaceAsset,lod:`lod${tier}`,lodSource:'extract-authored-tier-preserve-missing-base'};
 try { await stat(output); throw new Error(`Refusing to overwrite ${output}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
 await d.transform(prune({propertyTypes:[PropertyType.MESH,PropertyType.PRIMITIVE,PropertyType.PRIMITIVE_TARGET]}), prune({propertyTypes:[PropertyType.ACCESSOR], keepAttributes:true}));
 await io.write(output,d);
 const check=await io.read(output); const all=check.getRoot().listNodes();
 const triangles=all.filter(n=>n.getName().startsWith('LOD0_')).reduce((s,n)=>s+(n.getMesh()?.listPrimitives()||[]).reduce((x,p)=>x+(p.getIndices()?.getCount()||p.getAttribute('POSITION')?.getCount()||0)/3,0),0);
 result.push({ship,tier,input,inputSha256:await hash(input),inputBytes:(await stat(input)).size,output,outputSha256:await hash(output),outputBytes:(await stat(output)).size,triangles,keptBase:[...keepBase],nodes:kept.length,sceneBounds:getBounds(check.getRoot().getDefaultScene())});
}
console.log(JSON.stringify(result,null,2));
