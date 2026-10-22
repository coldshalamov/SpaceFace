import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const stats={};
for(const n of ['dead-hulk','drill-platform','drill-platform-cold','seamed-asteroid']){
const p=(process.env.INSPECTION_DIR || './inspection-input')+'/'+n,doc=await io.read(p+'.glb');
stats[n]=doc.getRoot().listMaterials().map(m=>({name:m.getName(),baseColor:m.getBaseColorFactor(),metal:m.getMetallicFactor(),rough:m.getRoughnessFactor(),emissive:m.getEmissiveFactor(),textures:!!m.getBaseColorTexture()}));
// Inspection-only compatibility copy: exact decoded geometry, material scalar values, no basis textures.
for(const t of doc.getRoot().listTextures())t.dispose();
for(const e of doc.getRoot().listExtensionsUsed())if(['EXT_meshopt_compression','KHR_texture_basisu'].includes(e.extensionName))e.dispose();
await io.write(p+'-decoded.glb',doc);
}
fs.writeFileSync((process.env.INSPECTION_DIR || './inspection-input')+'/materials.json',JSON.stringify(stats,null,2));
