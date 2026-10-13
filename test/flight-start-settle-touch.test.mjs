import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import { load } from './flight-start-support.mjs';
const { admitOpeningUnitsAcrossSlices,uniqueAdmissionUnits,drawableHideSession,touchSubjectOnExactTarget } = await load('01-touch-visible-only','src/render/openingGpuAdmission.js');
const { revealSubjectWithAncestors } = await load('01-touch-visible-only','src/render/compilePresentSlice.js');
const source=fs.readFileSync('src/render/renderer.js','utf8');
const anchor=source.indexOf('            materialSettle = await admitOpeningUnitsAcrossSlices({');
const start=source.lastIndexOf('            const settleDrawableSession =',anchor);
const end=source.indexOf('            if (cookStale()) return cookSuperseded;',anchor);
const body=source.slice(start<0?anchor:start,end);
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const names=['admitOpeningUnitsAcrossSlices','uniqueAdmissionUnits','mintTouchDrawableSession','cookStale','remainingMs','renderer','staleSubjects','beginScenePipelineReadinessBatch','stampSubjectEnvAsync','revealSubjectWithAncestors','touchExactTargetSubject','touchExactTargetSubjects','cam','scene','state','createSlicedYield','yieldAndFlushLiveSectorGpu','pacedFrameSpend','PACED_FRAME_BUDGET_MS','notePacedFrameSpend','cookSuperseded'];
const run=new AsyncFunction(...names,'let materialSettle;\n'+body+'\nreturn materialSettle;');
for(const mode of ['loading','flight'])for(const throws of [false,true])test(`settle preserves mode cadence and hidden chains (mode=${mode}, throw=${throws})`,async()=>{
 const scene=new THREE.Scene(),holder=new THREE.Group();holder.visible=false;scene.add(holder);
 const subjects=[];for(let i=0;i<8;i++){const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());mesh.visible=false;holder.add(mesh);subjects.push(mesh);}
 let target=null,draws=0,seen=new Set(),censuses=0;
 const renderer={getRenderTarget:()=>target,setRenderTarget:v=>target=v,render(){draws++;scene.traverseVisible(o=>{if(o.isMesh)seen.add(o);});}};
 const touch=group=>{if(throws)throw new Error('touch-failed');return touchSubjectOnExactTarget(renderer,null,group,new THREE.PerspectiveCamera(),scene);};
 const grouped=async(group,session)=>{assert.ok(session);if(throws)throw new Error('touch-failed');return touchSubjectOnExactTarget(renderer,null,group,new THREE.PerspectiveCamera(),scene,{drawableSession:session});};
 const out=await run.call({_selectPostRoute:()=> 'bloom',_compilePostRoute:async()=>({ready:true})},
  admitOpeningUnitsAcrossSlices,uniqueAdmissionUnits,async()=>{censuses++;return drawableHideSession(scene);},()=>false,()=>6000,renderer,subjects,
  ()=>({drain:async()=>({}),close(){},restoreEntryTarget(){}}),async()=>{},revealSubjectWithAncestors,touch,grouped,{obj:new THREE.PerspectiveCamera()},scene,{mode},fn=>fn,async()=>{},()=>0,4,()=>{},{});
 assert.equal(censuses,mode==='loading'?1:0,'only loading uses the reusable session');
 assert.equal(out.touched,8);assert.equal(holder.visible,false);assert.ok(subjects.every(s=>s.visible===false));assert.equal(target,null);
 if(!throws){assert.equal(draws,mode==='loading'?2:8,'loading groups four; flight keeps one-subject draws');assert.equal(seen.size,8,'every old touch still issues its draw');}
 else assert.ok(out.results.every(r=>r.touchError?.message==='touch-failed'));
});
