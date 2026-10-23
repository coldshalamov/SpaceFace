// The player's authored hull is the replay silhouette. No dummy sim entity, collision body,
// target identity, draft source, fallback cone, or new asset admission is created here.
import * as THREE from 'three';
import { getRacingGhostPlayback, sampleRacingGhost, sampleRacingGhostLine, resetRacingGhostSession } from '../systems/racingGhosts.js';
import { readFrameOrigin } from './frameCoordinates.js';
import { cloneMaterialPreservingShaderHooks } from './materialClone.js';

export const RACING_GHOST_OPACITY = 0.3;

// The line is a child of the hull, and the hull is turned by -heading. A world
// offset stored raw swings off the hook on any real turn. This is the offset in
// the hull's own frame, so the parent rotation puts the end back on the hook.
export function racingGhostHookLocal(pose, hook) {
  const dx = hook.x - pose.x;
  const dz = hook.z - pose.z;
  const h = pose.heading || 0;
  const cos = Math.cos(h);
  const sin = Math.sin(h);
  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
}
const noRaycast = () => {};
function sameChildren(a,b){
  if(!a||a.length!==b.length)return false;
  for(let i=0;i<a.length;i++)if(a[i]!==b[i])return false;
  return true;
}

function cloneHull(source,materials) {
  // Object3D.copy serializes userData. Live render-package receipts contain object graphs,
  // identities and disposal callbacks; none belong to a presentation-only replay.
  const originals=[];
  source.traverse(object=>{originals.push([object,object.userData]);object.userData={};});
  let clone;
  try{clone=source.clone(true);}finally{for(const [object,data] of originals)object.userData=data;}
  const cache=new Map();
  function material(base){
    if(!base)return base;
    if(cache.has(base))return cache.get(base);
    const data=base.userData;let next;
    try{base.userData={};next=cloneMaterialPreservingShaderHooks(base);}finally{base.userData=data;}
    next.transparent=true;next.opacity=Math.min(1,base.opacity??1)*RACING_GHOST_OPACITY;
    next.depthWrite=false;next.color?.lerp?.({r:0.36,g:0.84,b:1},0.35);
    cache.set(base,next);materials.push(next);return next;
  }
  clone.traverse(object=>{
    object.castShadow=false;object.receiveShadow=false;object.raycast=noRaycast;
    if(object.material)object.material=Array.isArray(object.material)?object.material.map(material):material(object.material);
  });
  clone.name='Personal racing ghost';clone.userData={racingGhost:true,presentationOnly:true};
  clone.matrixAutoUpdate=true;clone.visible=false;return clone;
}

export function createRacingGhostView(scene,state,{storage}={}) {
  let root=null,source=null,children=null,owner=null,line=null,disposed=false;
  const materials=[],geometries=[],origin={},pose={},lineOut={};
  const linePositions=new Float32Array(6);
  function release(){
    root?.removeFromParent();
    for(const material of materials)material.dispose();
    for(const geometry of geometries)geometry.dispose();
    materials.length=0;geometries.length=0;
    root=source=children=line=null;
  }
  function ensureLine(){
    if(line||!root)return line;
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.BufferAttribute(linePositions,3));
    const material=new THREE.LineBasicMaterial({color:0x39d0ff,transparent:true,opacity:0.9});
    line=new THREE.Line(geometry,material);
    line.name='Quarry Hook line';
    line.frustumCulled=false;
    line.raycast=noRaycast;
    line.userData={racingGhostLine:true,hook:'quarry_hook',presentationOnly:true};
    materials.push(material);geometries.push(geometry);root.add(line);
    return line;
  }
  return {
    get root(){return root;},
    frame(race){
      if(disposed)return;
      if(!race||state.mode!=='flight'||state.ui?.docked||state.world?.currentSectorId!==race.params?.courseSectorId){
        release();if(owner)resetRacingGhostSession(state);owner=null;return;
      }
      const params=race.params;
      if(owner!==params){release();owner=params;}
      const visible=params.raceGhostEnabled!==false&&state.settings?.gameplay?.racingGhost!==false
        &&!params.raceFitChanged&&!params.resetCount;
      const tape=visible?getRacingGhostPlayback(state,params,storage):null;
      const alpha=state.render?.interpolationAlpha;
      const elapsed=state.simTime-params.raceStartSimS-(Number.isFinite(alpha)?(1-Math.max(0,Math.min(1,alpha)))/60:0);
      if(!tape||!Number.isFinite(params.raceStartSimS)||!sampleRacingGhost(tape,elapsed,pose)){
        if(line)line.visible=false;if(root)root.visible=false;return;
      }
      const player=state.entities?.get?.(state.playerId),mesh=player?.mesh||player?.view?.root;
      // Admission can replace a mesh in place; wait for its authored generation to arrive.
      const admission=mesh?.userData?.authoredAssetState;
      if(!mesh||!['authored','authored-prepared'].includes(admission)||mesh.userData.admissionStandInPending){
        release();return;
      }
      const kids=mesh.children;
      if(source!==mesh||!sameChildren(children,kids)){
        release();root=cloneHull(mesh,materials);source=mesh;children=kids.slice();scene.add(root);
        try{state.render?.touchSubjectExactTarget?.(root);}catch{/* optional prewarm */}
      }
      readFrameOrigin(state,origin);root.position.set(pose.x-origin.x,pose.y,pose.z-origin.z);
      root.rotation.set(0,-pose.heading,0);root.visible=true;
      const hook=sampleRacingGhostLine(tape,elapsed,lineOut);
      if(hook){
        const drawn=ensureLine();
        const attr=drawn.geometry.attributes.position;
        const local=racingGhostHookLocal(pose,hook);
        attr.array[0]=0;attr.array[1]=0;attr.array[2]=0;
        attr.array[3]=local.x;attr.array[4]=0;attr.array[5]=local.z;
        attr.needsUpdate=true;drawn.visible=true;
      }else if(line)line.visible=false;
    },
    dispose(){if(disposed)return;disposed=true;release();owner=null;resetRacingGhostSession(state);},
  };
}
