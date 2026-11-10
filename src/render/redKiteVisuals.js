import * as THREE from 'three';
import { RED_KITE, RED_KITE_GATES } from '../data/redKite.js';
import { redKitePresentation } from '../systems/redKite.js';

export const RED_KITE_FILE = 'wholeships/red_kite.glb';
export const RED_KITE_MOTION_NODES = Object.freeze([
  'MOTION_RED_KITE_FLAP', 'MOTION_RED_KITE_CLAMP_PORT', 'MOTION_RED_KITE_CLAMP_STARBOARD',
]);
export function isRedKiteCourier(entity) {
  return entity?.data?.redKiteActorId === RED_KITE.actorId && entity.data.authoredCharacter === 'red_kite';
}
function sourceMatches(root) {
  const source = root?.userData?.redKiteAuthoredSource;
  return source?.assetId === RED_KITE.assetId && typeof source.file === 'string'
    && source.file.replace(/^.*assets\/ships\/(?:release\/)?parts\//, '') === RED_KITE_FILE;
}
function inside(node, ancestor) {
  for (let current=node;current;current=current.parent) {
    if (current.visible === false) return false;
    if (current === ancestor) return true;
  }
  return false;
}
function handoffId(receipt, state, life) {
  return receipt?.life === life && typeof receipt.id === 'string' && receipt.id.length > 0
    && Number.isInteger(receipt.gateIndex) && receipt.gateIndex >= 0 && receipt.gateIndex < RED_KITE_GATES.length
    && Number.isInteger(receipt.atTick) && receipt.atTick <= state.tick && state.tick-receipt.atTick <= 42
    ? receipt.id : null;
}
const radians = degrees => degrees*Math.PI/180;

// Cosmetic trim and one finite handoff. Native telemetry/accepted swept gates own the facts.
// The sealed source_rest_pose bank preserves compiler bindings; this driver owns the deltas.
export function createRedKiteVisualDriver(root, entity) {
  if (!isRedKiteCourier(entity) || !sourceMatches(root)) return null;
  const nodes=new Map();root.traverse(node=>{if(RED_KITE_MOTION_NODES.includes(node.name))nodes.set(node.name,node);});
  if(nodes.size!==RED_KITE_MOTION_NODES.length)throw new Error('Red Kite source lacks its three authored control pivots');
  const [flap,port,starboard]=RED_KITE_MOTION_NODES.map(name=>nodes.get(name));
  const rests=[flap,port,starboard].map(node=>node.quaternion.clone());
  const id=entity.id,life=entity.occupantGeneration,axis=new THREE.Vector3(1,0,0),turn=new THREE.Quaternion();
  let retired=false,initialized=false,lastReceipt=null,lastNow=null,handoffStart=null,flapAngle=0;
  const rotate=(node,rest,angle)=>{node.quaternion.copy(rest).multiply(turn.setFromAxisAngle(axis,angle));node.updateMatrix();};
  const reset=()=>{flapAngle=0;handoffStart=null;for(const [i,node] of [flap,port,starboard].entries()){node.quaternion.copy(rests[i]);node.updateMatrix();}};
  return {
    update(live,now,a11y,state) {
      if(retired)return;
      const valid=Number.isFinite(now)&&live?.id===id&&live.occupantGeneration===life&&live.alive!==false
        &&isRedKiteCourier(live)&&state?.entities?.get(id)===live&&inside(root,live.mesh)
        &&!!state.render?.scene&&inside(root,state.render.scene);
      if(!valid){reset();initialized=false;lastNow=null;return;}
      const frame=redKitePresentation(state,live);
      if(!frame){reset();lastNow=now;return;}
      const receipt=handoffId(frame.handoffReceipt,state,life);
      if(!initialized||now<lastNow){initialized=true;lastReceipt=receipt;handoffStart=null;flapAngle=0;}
      else if(receipt&&receipt!==lastReceipt){lastReceipt=receipt;handoffStart=now;}
      const reduced=a11y?.reducedMotion===true;
      const acceleration=Number.isFinite(frame.angularAcceleration)?frame.angularAcceleration:0;
      const throttle=Number.isFinite(frame.throttle)?Math.max(0,Math.min(1,frame.throttle)):0;
      const target=(radians(12)*Math.max(-1,Math.min(1,acceleration/RED_KITE.yawAccel))-radians(3)*throttle)*(reduced?.35:1);
      const dt=lastNow==null?0:Math.min(.1,Math.max(0,now-lastNow));
      flapAngle+=(target-flapAngle)*(1-Math.exp(-dt/.16));
      rotate(flap,rests[0],flapAngle);
      if(reduced)handoffStart=null;
      let opening=0;
      if(handoffStart!=null){
        const progress=(now-handoffStart)/.7;
        if(progress>=1)handoffStart=null;
        else opening=radians(35)*Math.pow(Math.sin(Math.PI*Math.max(0,progress)),2);
      }
      rotate(port,rests[1],-opening);rotate(starboard,rests[2],opening);
      lastNow=now;
    },
    dispose(){if(!retired){retired=true;reset();}},
  };
}
