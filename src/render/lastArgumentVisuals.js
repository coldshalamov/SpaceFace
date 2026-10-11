// Presentation only. The score's fixed-tick clock is the sole animation time source.
import { LAST_ARGUMENT as C } from '../data/lastArgument.js';
import { isLastArgument } from '../data/lastArgumentBody.js';
import { LAST_ARGUMENT_SCORE } from '../data/encounters/capital-boss/last-argument.js';
const beats = new Map(LAST_ARGUMENT_SCORE.score.beats.map(b => [b.id,b]));
const clamp = x => Math.max(0,Math.min(1,Number.isFinite(x)?x:0));
const smooth = x => { const a=clamp(x);return a*a*(3-2*a); };
const dead = (e,id) => {
  const bag=e.subsystems||e.data?.combatRuntime?.subsystems||{};
  const s=bag[`subsystem_last_argument_${id}`];
  return !!(s&&(s.destroyed||s.effectiveDisabled||s.health<=0));
};
/** Caller-owned output avoids allocating a pose object in the render loop. */
export function lastArgumentAnimationPose(fight, options={}, out={}) {
  const active=!!fight&&!fight.suspended&&!fight.terminal;
  const b=active&&fight.cast?beats.get(fight.cast.beatId):null;
  const age=b?fight.clock-fight.cast.startedAt:0;
  const firing=!!b&&age>=b.tellTicks&&age<b.tellTicks+b.activeTicks;
  const recoil=firing?Math.exp(-(age-b.tellTicks)/8):0;
  const small=options.reducedMotion?0:1;
  out.port=(b?.id.startsWith('port')?recoil:0)*2.8*small;
  out.starboard=(b?.id.startsWith('starboard')?recoil:0)*2.8*small;
  out.spine=(b?.id==='spine'||b?.id==='sounding'?recoil:0)*4.2*small;
  out.charge=b&&(b.id==='spine'||b.id==='sounding')&&age>=0&&age<b.tellTicks
    ?smooth(age/b.tellTicks)*(options.reducedFlash?.45:2):0;
  // Open machinery is readable even with reduced motion; no flashes are required to read state.
  out.vent=active&&fight.phase==='recovery'?.78:0;
  out.sensor=active&&!options.reducedMotion?Math.sin(fight.clock/180)*.22:0;
  out.drive=active?.9:0;
  return out;
}
export function createLastArgumentVisualDriver(root, entity) {
  const source=root?.userData?.lastArgumentAuthoredSource;
  if(!isLastArgument(entity)||!source||source.assetId!==C.assetId||!String(source.file).endsWith(C.file))return null;
  const bound=[];let disposed=false;const pose={};
  // Bind all authored LOD copies. An LOD swap cannot reset or duplicate the firing clock.
  root.traverse(node=>{
    if(!/^HOOK_(SECONDARY|ARMOR|SENSOR|DRIVE)_LA_/.test(node.name||''))return;
    bound.push({node,name:node.name,position:[node.position.x,node.position.y,node.position.z],
      rotation:[node.rotation.x,node.rotation.y,node.rotation.z],scale:[node.scale.x,node.scale.y,node.scale.z],
      auto:node.matrixAutoUpdate});node.matrixAutoUpdate=true;
  });
  const reset=({node,position:p,rotation:r,scale:s})=>{
    node.position.set(...p);node.rotation.set(...r);node.scale.set(...s);node.updateMatrix();
  };
  return {
    update(e,_simNow,a11y={},state=null) {
      if(disposed)return;
      const valid=e===entity&&state?.entities?.get?.(e.id)===e&&isLastArgument(e);
      const fight=valid?state.capitalBossEncounters?.fights?.[e.data.lastArgumentKey]:null;
      lastArgumentAnimationPose(fight,a11y,pose);
      const passage=valid?state.capitalBossEncounters?.lastArgument?.active:null;
      const jump=passage?clamp((state.simTime-(passage.deadlineAt-C.retreatWarningSeconds))/C.retreatWarningSeconds):0;
      const portDead=valid&&dead(e,'port'),starboardDead=valid&&dead(e,'starboard'),spineDead=valid&&dead(e,'spine');
      for(const b of bound){
        const n=b.node,p=b.position,r=b.rotation,s=b.scale;
        n.position.set(p[0],p[1],p[2]);n.rotation.set(r[0],r[1],r[2]);n.scale.set(s[0],s[1],s[2]);
        if(b.name.includes('LA_PORT_')){n.position.z+=pose.port;if(portDead)n.position.y-=1.8;}
        else if(b.name.includes('LA_STARBOARD_')){n.position.z-=pose.starboard;if(starboardDead)n.position.y-=1.8;}
        else if(b.name.includes('LA_SPINE')){n.position.x-=pose.spine;if(spineDead)n.position.y-=1.5;}
        else if(b.name.includes('LA_CHARGE'))n.scale.y=s[1]*(spineDead?.1:.1+pose.charge);
        else if(b.name.includes('LA_VENT_'))n.rotation.x-=pose.vent;
        else if(b.name.includes('LA_DISH'))n.rotation.y+=valid&&!dead(e,'sensor')?pose.sensor:0;
        else if(b.name.includes('LA_ENGINE_')){
          const cold=valid&&dead(e,'drive');
          n.scale.x=s[0]*(1+(a11y.reducedMotion?3:15)*jump);
          n.scale.y=s[1]*(cold&&!jump?.15:1+.3*jump);
          n.scale.z=s[2]*(cold&&!jump?.15:1+.3*jump);
        }
        n.updateMatrix();n.matrixWorldNeedsUpdate=true;
      }
    },
    dispose(){if(disposed)return;disposed=true;for(const b of bound){reset(b);b.node.matrixAutoUpdate=b.auto;}bound.length=0;},
  };
}
