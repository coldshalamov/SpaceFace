import * as THREE from 'three';
import { SABLE_VENN, sableVennPresentation } from '../data/sableVenn.js';

export const SABLE_PATCHWORK_ASSET_ID='SF_SHIP_SABLE_PATCHWORK';
export const SABLE_PATCHWORK_FILE='wholeships/sable_patchwork.glb';
export const SABLE_PATCHWORK_MOTION_NODES=Object.freeze([
  'MOTION_SABLE_ARM_BASE','MOTION_SABLE_ARM_ELBOW','MOTION_SABLE_CLAMP_PORT','MOTION_SABLE_CLAMP_STARBOARD',
]);
export function isSableVennWorkshop(entity){return entity?.data?.worldRecordId===SABLE_VENN.worldRecordId&&entity.data.role==='shipwright';}
function sourceMatches(root){const source=root?.userData?.sableVennAuthoredSource;return source?.assetId===SABLE_PATCHWORK_ASSET_ID
  &&typeof source.file==='string'&&source.file.replace(/^.*assets\/ships\/(?:release\/)?parts\//,'')===SABLE_PATCHWORK_FILE;}
function inside(node,ancestor){for(let current=node;current;current=current.parent){if(current.visible===false)return false;if(current===ancestor)return true;}return false;}
const radians=angle=>angle*Math.PI/180;
const smooth=value=>{const t=Math.min(1,Math.max(0,value));return t*t*(3-2*t);};

// A measured trial can unfold the workshop; only an accepted purchase can work its jaws.
// These cosmetic groups never apply a force, fit an item, or own a service transaction.
export function createSableVennVisualDriver(root,entity){
  if(!isSableVennWorkshop(entity)||!sourceMatches(root))return null;
  const nodes=new Map();root.traverse(node=>{if(SABLE_PATCHWORK_MOTION_NODES.includes(node.name))nodes.set(node.name,node);});
  if(nodes.size!==4)throw new Error('Patchwork source lacks its four nested service pivots');
  const [base,elbow,port,starboard]=SABLE_PATCHWORK_MOTION_NODES.map(name=>nodes.get(name));
  const rests=[base,elbow,port,starboard].map(node=>node.quaternion.clone());
  const id=entity.id,life=entity.occupantGeneration,yaw=new THREE.Vector3(0,1,0),hinge=new THREE.Vector3(1,0,0),turn=new THREE.Quaternion();
  let retired=false,initialized=false,lastKey=null,lastReceipt=null,lastNow=null,parked=false,reducedLast=false;
  let current=[0,0],from=[0,0],target=[0,0],transitionStart=0,transitionDuration=1.6,parkAt=null,receiptStart=null;
  const sample=now=>{const t=smooth((now-transitionStart)/transitionDuration);current=from.map((angle,i)=>angle+(target[i]-angle)*t);};
  const transition=(angles,now,duration)=>{sample(now);from=current.slice();target=angles;transitionStart=now;transitionDuration=duration;};
  const rotate=(node,rest,axis,angle)=>{node.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis,angle));node.updateMatrix();};
  const draw=now=>{
    sample(now);rotate(base,rests[0],yaw,current[0]);rotate(elbow,rests[1],yaw,current[1]);
    let grip=0;if(receiptStart!=null){const t=(now-receiptStart)/.6;if(t>=1)receiptStart=null;else grip=radians(25)*Math.sin(Math.PI*Math.max(0,t))**2;}
    rotate(port,rests[2],hinge,grip);rotate(starboard,rests[3],hinge,-grip);
  };
  const park=now=>{if(!parked){transition([0,0],now,1.6);parked=true;}parkAt=receiptStart=null;};
  return {
    update(live,now,a11y,state){
      if(retired||!Number.isFinite(now))return;
      const valid=live?.id===id&&live.occupantGeneration===life&&live.alive!==false&&isSableVennWorkshop(live)
        &&state?.entities?.get(id)===live&&inside(root,live.mesh)&&!!state.render?.scene&&inside(root,state.render.scene);
      const frame=valid?sableVennPresentation(state,live):null;
      if(!frame){park(now);draw(now);if(!valid)initialized=false;lastNow=now;return;}
      const key=`${frame.phase}:${frame.tick}:${frame.moduleId||''}:${frame.receiptId||''}`;
      const reduced=a11y?.reducedMotion===true;
      if(!initialized||now<lastNow){
        if(now<lastNow){from=current.slice();target=[0,0];transitionStart=now;transitionDuration=1.6;parked=true;parkAt=receiptStart=null;}
        initialized=true;lastKey=key;lastReceipt=frame.phase==='receipt'?frame.receiptId:null;
        park(now);reducedLast=reduced;
      }else{
        if(key!==lastKey){
          lastKey=key;
          if(frame.phase==='demonstrate'&&!reduced){transition([radians(-60),radians(85)],now,1.8);parked=false;parkAt=now+2.4;}
          else park(now);
          if(frame.phase==='receipt'&&frame.receiptId!==lastReceipt){lastReceipt=frame.receiptId;if(!reduced)receiptStart=now;}
        }
        if(reduced&&!reducedLast)park(now);
        if(parkAt!=null&&now>=parkAt)park(now);
      }
      reducedLast=reduced;draw(now);lastNow=now;
    },
    dispose(){if(retired)return;retired=true;for(const [i,node] of [base,elbow,port,starboard].entries()){node.quaternion.copy(rests[i]);node.updateMatrix();}},
  };
}
