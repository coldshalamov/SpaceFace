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
const clamp01=(v)=>v<=0?0:v>=1?1:v;
const byFightId=(a,b)=>a.fightId<b.fightId?-1:a.fightId>b.fightId?1:0;
/**
 * Pure readout projection of the live capital fights (row 463): existing fight records,
 * the encounter catalog's authored name/act/move data, and the boss entity's own hull.
 * No state writes, no RNG, no persistent fields. The mount redraws this every frame, so it
 * passes its own `out` array: the array and its readout/move objects are reused in place
 * (length trimmed to the live count), and a frame with no live fight allocates nothing.
 * Callers that pass nothing get a fresh array, as before.
 */
export function capitalBossReadouts(state,out) {
 const list=Array.isArray(out)?out:[];
 let n=0;
 const fights=state&&state.capitalBossEncounters&&state.capitalBossEncounters.fights;
 if(fights&&typeof fights==='object'){
  const entities=state.entities;
  for(const key in fights){
   const r=fights[key];
   if(!r||r.started!==true||r.suspended===true||r.terminal!=null)continue;
   if(r.targetId!==state.playerId)continue;
   const boss=entities&&typeof entities.get==='function'?entities.get(r.bossId):null;
   if(!boss||boss.alive===false)continue;
   let spec=null;
   try{spec=requireCapitalBossEncounter(r.encounterId);}catch{spec=null;}
   const score=spec&&spec.score||null;
   const acts=score&&Array.isArray(score.acts)?score.acts:null;
   const act=acts&&Number.isInteger(r.actIndex)&&r.actIndex>=0&&r.actIndex<acts.length?acts[r.actIndex]:null;
   const hullMax=Number.isFinite(boss.hullMax)?boss.hullMax:NaN;
   // One sanitized hull feeds both the published figure and the fraction — a missing or
   // non-finite hull reads 0, so the gauge's aria-valuenow can never print NaN.
   const hull=Math.max(0,Number.isFinite(boss.hull)?boss.hull:0);
   let readout=list[n];
   if(!readout||typeof readout!=='object'){
    readout={fightId:null,encounterId:null,bossId:null,name:'',actId:null,actTitle:'',
     hull:0,hullMax:0,hullFraction:0,phase:null,clock:0,move:null};
    // The pooled move record rides a hidden slot so a readout still reads as plain data.
    Object.defineProperty(readout,'_move',{value:null,writable:true,enumerable:false});
    list[n]=readout;
   }
   n+=1;
   readout.fightId=r.fightId;readout.encounterId=r.encounterId;readout.bossId=r.bossId;
   readout.name=score&&score.name||'';readout.actId=act?act.id:null;readout.actTitle=act?act.title:'';
   readout.hull=hull;
   readout.hullMax=Number.isFinite(hullMax)?hullMax:0;
   readout.hullFraction=Number.isFinite(hullMax)&&hullMax>0?clamp01(hull/hullMax):0;
   readout.phase=r.phase;readout.clock=r.clock;readout.move=null;
   const cast=r.cast;
   if(cast&&score&&Array.isArray(score.beats)){
    let beat=null;
    for(let i=0;i<score.beats.length;i+=1){const b=score.beats[i];if(b&&b.id===cast.beatId){beat=b;break;}}
    if(beat){
     const fireAt=cast.startedAt+beat.tellTicks;
     const endAt=cast.startedAt+beat.tellTicks+beat.activeTicks;
     if(cast.startedAt<=r.clock&&r.clock<endAt){
      const move=readout._move||(readout._move={castId:null,beatId:null,title:'',counter:'',
       startedAt:0,fireAt:0,endAt:0,locked:false});
      move.castId=cast.id;move.beatId=beat.id;move.title=beat.title;move.counter=beat.counter;
      move.startedAt=cast.startedAt;move.fireAt=fireAt;move.endAt=endAt;move.locked=cast.locked===true;
      readout.move=move;
     }
    }
   }
  }
 }
 list.length=n;
 if(n>1)list.sort(byFightId);
 return list;
}
export function createCapitalBossOverlay({canvas,bus,worldToScreen,clockForFight,reducedMotion=false}) {
 if(!canvas?.getContext||!bus?.on||typeof worldToScreen!=='function'||typeof clockForFight!=='function')throw new TypeError('Capital overlay ports missing');
 const ctx=canvas.getContext('2d'),warnings=new Map(),off=[];
 // The overlay is empty through nearly all of flight; a fullscreen clearRect every frame is pure
 // cost, so once the canvas is known-blank an empty draw() is a no-op. A canvas resize clears to
 // blank anyway, so the flag stays honest.
 let blank=false;
 const listen=(name,fn)=>{const remove=bus.on(name,fn);if(typeof remove==='function')off.push(remove);else if(bus.off)off.push(()=>bus.off(name,fn));};
 const remember=c=>{
  if(!warnings.has(c.castId)&&warnings.size>=3)throw new Error('Capital overlay exceeds three live fights');
  warnings.set(c.castId,c);
 };
 listen('capitalBoss:telegraph',remember);listen('capitalBoss:attack',remember);
 listen('capitalBoss:telegraphEnd',c=>warnings.delete(c.castId));
 return {
  draw(){
  if(warnings.size===0){if(!blank){ctx.clearRect(0,0,canvas.width,canvas.height);blank=true;}return;}
  ctx.clearRect(0,0,canvas.width,canvas.height);blank=false;
  for(const c of warnings.values())drawCapitalWarning(ctx,c,clockForFight(c.fightId),worldToScreen,{reducedMotion});
 },
  restore(fights){warnings.clear();for(const r of Object.values(fights||{}))if(r.cast&&!r.suspended&&!r.terminal){
   const spec=requireCapitalBossEncounter(r.encounterId);
   const b=spec&&spec.score&&spec.score.beats&&spec.score.beats.find(b=>b.id===r.cast.beatId);
   if(!b) continue;
   remember({fightId:r.fightId,castId:r.cast.id,shapes:r.cast.shapes,locked:r.cast.locked,startedAt:r.cast.startedAt,
    fireAt:r.cast.startedAt+b.tellTicks,endAt:r.cast.startedAt+b.tellTicks+b.activeTicks});
  }},
  inspect(){return [...warnings.values()].map(c=>({castId:c.castId,fightId:c.fightId,shapeCount:c.shapes.length}));},
  destroy(){off.splice(0).forEach(fn=>fn());warnings.clear();ctx.clearRect(0,0,canvas.width,canvas.height);},
 };
}
