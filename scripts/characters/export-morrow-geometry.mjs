// Review interchange: dump the exact production topology in an authored pose.
// Node uses the repo's normal `three` dependency; no renderer/GPU is required.
import { writeFileSync } from 'node:fs';
import { buildMorrowVisual } from '../../src/render/characters/morrowModel.js';
import { morrowEntitySpec } from '../../src/systems/morrow.js';
const out=process.argv[2];if(!out)throw new Error('Usage: node scripts/characters/export-morrow-geometry.mjs output.json [idle|shy|sleep|dance]');
const phase=process.argv[3]||'idle',e=morrowEntitySpec(),p=e.data.morrowPose;
p.awake=phase!=='sleep';p.phase=phase==='dance'?'idle':phase;p.gaze=.5;p.gesture=phase==='dance'?'dance':'';p.gestureAt=7;
const root=buildMorrowVisual(e);root.userData.updateAuthoredMotion(e,8,{});root.updateMatrixWorld(true);
const meshes=[];
root.traverseVisible(o=>{if(!o.isMesh||o.material.isShaderMaterial)return;
 const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);const m=o.material;
 meshes.push({name:o.name,positions:Array.from(g.attributes.position.array),normals:Array.from(g.attributes.normal.array),
  indices:g.index?Array.from(g.index.array):null,material:{color:m.color?.toArray()||[.5,.5,.5],
   emissive:m.emissive?.toArray()||[0,0,0],emissiveIntensity:m.emissiveIntensity??0,metalness:m.metalness??0,roughness:m.roughness??.5}});g.dispose();});
writeFileSync(out,JSON.stringify({generator:'SpaceFace production Morrow geometry',pose:phase,time:8,meshes}));root.userData.disposeMorrow();
