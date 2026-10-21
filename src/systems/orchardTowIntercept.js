import { previewBrakeStop } from '../core/flight/propulsionKernel.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
/** Intent only. The existing job/lease and attachment owners retain every mutation. */
export function orchardTowIntercept(hull,target,destination,profile,reach){
 const hold={moveX:0,moveZ:0,boost:false,aimAngle:Number.isFinite(hull?.rot)?hull.rot:0,brake:true,ready:false};
 if(!hull?.pos||!target?.pos||!destination||!profile
  || ![reach,profile.mainAccel,profile.reverseAccel,profile.strafeAccel,profile.combatSpeed].every(v=>Number.isFinite(v)&&v>0)
  || reach<=hull.radius+target.radius+20
  || ![hull.pos.x,hull.pos.z,target.pos.x,target.pos.z,destination.x,destination.z,hull.rot??0,
    hull.vel?.x??0,hull.vel?.z??0,target.vel?.x??0,target.vel?.z??0,hull.radius,target.radius].every(Number.isFinite)
  || hull.radius<=0 || target.radius<=0)return hold;
 const ox=destination.x-target.pos.x,oz=destination.z-target.pos.z,length=Math.hypot(ox,oz);
 if(!(length>0))return hold;
 const outward=Math.atan2(oz,ox),ux=ox/length,uz=oz/length;
 const hx=hull.pos.x-target.pos.x,hz=hull.pos.z-target.pos.z,range=Math.hypot(hx,hz);
 const tvx=target.vel?.x||0,tvz=target.vel?.z||0,vx=hull.vel?.x||0,vz=hull.vel?.z||0;
 const relative=Math.hypot(vx-tvx,vz-tvz),outwardGap=hx*ux+hz*uz;
 // Both attachment anchors are explicitly supplied at the actual centers.
 // The planning standoff is not a narrow latch annulus. Keep physical outward
 // body clearance while allowing braking to finish anywhere inside actual reach.
 const standoff=reach-20,capture=range<=reach && outwardGap>=hull.radius+target.radius+20;
 const dx=target.pos.x+ux*standoff-hull.pos.x,dz=target.pos.z+uz*standoff-hull.pos.z,dist=Math.hypot(dx,dz);
 const stop=previewBrakeStop(hull,profile),quiet=Math.hypot(tvx,tvz)<=5;
 const closing=((vx-tvx)*dx+(vz-tvz)*dz)/Math.max(.001,dist);
 // This preview is the actual kernel brake law. Planet forces remain authoritative;
 // it is a plan, not a promise that a moving load or storm can always be intercepted.
 const brake=quiet && (capture || closing>0 && stop.stopDistance>=Math.max(0,dist-20));
 if(brake)return {...hold,aimAngle:outward,ready:capture&&relative<=8};
 const cap=profile.combatSpeed,decel=Math.min(profile.mainAccel,profile.reverseAccel,profile.strafeAccel);
 const guidance=Math.atan2(dz,dx);
 const boost=Number.isFinite(profile.boostSpeedMult)&&profile.boostSpeedMult>1
  && Math.abs(wrap(guidance-(hull.rot||0)))<.34 && dist>Math.max(reach,stop.stopDistance*1.25+220);
 const limit=cap*(boost?profile.boostSpeedMult:1);
 const desiredClosing=Math.min(limit,Math.sqrt(2*decel*Math.max(0,dist-15)));
 let desiredX=tvx+dx/Math.max(.001,dist)*desiredClosing,desiredZ=tvz+dz/Math.max(.001,dist)*desiredClosing;
 const rawSpeed=Math.hypot(desiredX,desiredZ);
 if(rawSpeed>limit){desiredX*=limit/rawSpeed;desiredZ*=limit/rawSpeed;}
 const speed=Math.hypot(desiredX,desiredZ),aim=speed>.01?Math.atan2(desiredZ,desiredX):outward;
 const c=Math.cos(hull.rot||0),s=Math.sin(hull.rot||0);
 const forward=desiredX*c+desiredZ*s,side=-desiredX*s+desiredZ*c;
 const currentForward=vx*c+vz*s,currentSide=-vx*s+vz*c;
 let moveZ=forward>=0?forward/limit:clamp((forward-currentForward)/profile.reverseAccel,-1,0);
 let moveX=clamp((side-currentSide)/profile.strafeAccel,-1,1);
 // Positive translation is a speed fraction, not acceleration. Scale the combined
 // forward/side command to that speed; negative throttle remains actual reverse thrust.
 const demand=Math.hypot(Math.max(0,moveZ),moveX),fraction=speed/limit;
 if(demand>fraction&&demand>0){const k=fraction/demand;moveZ=moveZ<0?moveZ:moveZ*k;moveX*=k;}
 return {moveX,moveZ:clamp(moveZ,-1,1),boost,aimAngle:aim,brake:false,ready:capture&&relative<=8};
}
