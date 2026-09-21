// Renderer-only adapter: no simulation writes, private animation loop, or Three.js dependency.
// A transparent overlay canvas and the host camera's XZ->pixel projection are the only ports.
import {requireCapitalBossEncounter} from '../data/encounters/capital-boss.js';
const TAU=Math.PI*2;
/** Closed outlines, error <= 0.5 WU for authored dimensions. Lane ends remain rounded. */
export function capitalShapeOutlines(shape) {
 const circleArc=(x,z,r,start,span)=>{
  const n=Math.max(4,Math.ceil(Math.abs(span)*Math.sqrt(Math.max(1,r)/1)));const points=[];
  for(let i=0;i<=n;i++){const a=start+span*i/n;points.push({x:x+r*Math.cos(a),z:z+r*Math.sin(a)});}return points;
 };
 if(shape.kind==='lane'){
  const a=Math.atan2(shape.b.z-shape.a.z,shape.b.x-shape.a.x);
  return [circleArc(shape.a.x,shape.a.z,shape.radius,a+Math.PI/2,Math.PI)
    .concat(circleArc(shape.b.x,shape.b.z,shape.radius,a-Math.PI/2,Math.PI))];
 }
 const lo=shape.heading-shape.halfAngle,span=2*shape.halfAngle;
 if(shape.halfAngle>=Math.PI-1e-8)return [circleArc(shape.x,shape.z,shape.outer,0,TAU),circleArc(shape.x,shape.z,shape.inner,0,-TAU)];
 return [circleArc(shape.x,shape.z,shape.outer,lo,span)
  .concat(circleArc(shape.x,shape.z,shape.inner,lo+span,-span))];
}
function path(ctx,outlines,project){ctx.beginPath();for(const points of outlines){points.forEach((p,i)=>{const q=project(p);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.closePath();}}
export function drawCapitalWarning(ctx,warning,clock,project,{reducedMotion=false}={}) {
 if(clock<warning.startedAt||clock>=warning.endAt)return;
 const active=clock>=warning.fireAt,locked=warning.locked===true;
 const phase=(clock-warning.startedAt)/Math.max(1,warning.fireAt-warning.startedAt);
 const colour=active?'#ff755e':locked?'#edba72':'#bcc6cf';
 for(const shape of warning.shapes){
  const outlines=capitalShapeOutlines(shape);ctx.save();path(ctx,outlines,project);
  ctx.fillStyle=colour;ctx.globalAlpha=active?.19:.035+.035*Math.min(1,phase);ctx.fill('evenodd');
  ctx.globalAlpha=active?1:.55+.4*phase;ctx.strokeStyle=colour;ctx.lineWidth=active?2.5:1.5;
  ctx.setLineDash(locked?[]:[5,5]);ctx.stroke();ctx.setLineDash([]);
  path(ctx,outlines,project);ctx.clip('evenodd');ctx.globalAlpha=active?.32:.10;
  const offset=reducedMotion?0:(clock*.35)%24;ctx.lineWidth=1;
  // Bounded by canvas pixels, not world population. Never shade the inner refuge.
  for(let x=-ctx.canvas.height;x<ctx.canvas.width+ctx.canvas.height;x+=24){ctx.beginPath();ctx.moveTo(x+offset,0);ctx.lineTo(x+ctx.canvas.height+offset,ctx.canvas.height);ctx.stroke();}
  ctx.restore();
 }
}
export function createCapitalBossOverlay({canvas,bus,worldToScreen,clockForFight,reducedMotion=false}) {
 if(!canvas?.getContext||!bus?.on||typeof worldToScreen!=='function'||typeof clockForFight!=='function')throw new TypeError('Capital overlay ports missing');
 const ctx=canvas.getContext('2d'),warnings=new Map(),off=[];
 const listen=(name,fn)=>{const remove=bus.on(name,fn);if(typeof remove==='function')off.push(remove);else if(bus.off)off.push(()=>bus.off(name,fn));};
 const remember=c=>{
  if(!warnings.has(c.castId)&&warnings.size>=3)throw new Error('Capital overlay exceeds three live fights');
  warnings.set(c.castId,c);
 };
 listen('capitalBoss:telegraph',remember);listen('capitalBoss:attack',remember);
 listen('capitalBoss:telegraphEnd',c=>warnings.delete(c.castId));
 return {
  draw(){ctx.clearRect(0,0,canvas.width,canvas.height);for(const c of warnings.values())drawCapitalWarning(ctx,c,clockForFight(c.fightId),worldToScreen,{reducedMotion});},
  restore(fights){warnings.clear();for(const r of Object.values(fights))if(r.cast&&!r.suspended&&!r.terminal){
   const b=requireCapitalBossEncounter(r.encounterId).score.beats.find(b=>b.id===r.cast.beatId);
   remember({fightId:r.fightId,castId:r.cast.id,shapes:r.cast.shapes,locked:r.cast.locked,startedAt:r.cast.startedAt,
    fireAt:r.cast.startedAt+b.tellTicks,endAt:r.cast.startedAt+b.tellTicks+b.activeTicks});
  }},
  inspect(){return [...warnings.values()].map(c=>({castId:c.castId,fightId:c.fightId,shapeCount:c.shapes.length}));},
  destroy(){off.splice(0).forEach(fn=>fn());warnings.clear();ctx.clearRect(0,0,canvas.width,canvas.height);},
 };
}
