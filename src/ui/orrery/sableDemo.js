import { svg, lightPath, arcD } from './svg.js';
import { dressLampKey } from './lampKey.js';
import { measureSableDemo } from '../../core/sableDemo.js';
import { getDerivedStats } from '../../systems/ships.js';
import { hullNameForOwnedShip } from '../../data/hullIdentity.js';

function basis(state,owned){return JSON.stringify([owned.defId,owned.fittings,getDerivedStats(owned.defId,owned.fittings,state.player)]);}
export function sablePreviewStamp(state,owned,moduleId,slotIndex){return {player:state.player,run:state.run,owned,moduleId,slotIndex,basis:basis(state,owned)};}
export function sablePreviewMatches(stamp,state,owned,moduleId,slotIndex){return stamp.player===state.player&&stamp.run===state.run&&stamp.owned===owned
  &&stamp.moduleId===moduleId&&stamp.slotIndex===slotIndex&&stamp.basis===basis(state,owned);}
const number=value=>Number(value).toFixed(1);

// The same ORRERY light geometry as the rest of Shipworks. The moving mark follows a
// native sample; this presenter never invents force, damage, a trajectory or a fit.
export function mountSableDemo(host,{state,owned,moduleId,slotIndex,afterFittings,stillCurrent,onClose,onMeasured,reducedMotion=false}={}){
  const root=document.createElement('section');root.className='sx-sw-circuit';root.dataset.sablePreview='';root.tabIndex=-1;root.setAttribute('aria-label','Sable Venn fitting demonstration');
  const heading=document.createElement('h3');heading.className='k-caps';heading.textContent='Sable Venn · isolated fit trial';root.appendChild(heading);
  const identity=document.createElement('p');identity.className='k-sentence';identity.textContent=`${hullNameForOwnedShip(owned,state.player.ownedShips.indexOf(owned),state.meta.seed)} · ${owned.appearance?.finish||'yard finish'}. The real fit waits at the same counter.`;root.appendChild(identity);
  const status=document.createElement('p');status.className='k-sentence';status.setAttribute('role','status');status.textContent='Preparing two isolated native hulls…';root.appendChild(status);
  const graphic=svg('svg',{viewBox:'0 0 340 155',width:'100%',height:155,class:'orr-svg',role:'img','aria-label':'Current and proposed fitting trial'});root.appendChild(graphic);
  const verbs=document.createElement('p');verbs.className='k-sentence';root.appendChild(verbs);
  const button=(text,action,primary=false)=>{const b=document.createElement('button');b.type='button';b.className='k-word';b.textContent=text;
    b.addEventListener('click',event=>{event.stopPropagation();action();});if(primary)dressLampKey(b);verbs.appendChild(b);return b;};
  let disposed=false,frame=0,start=null,time=0,playing=false,packet=null;
  const abort=new AbortController();
  const stop=()=>{playing=false;if(frame)cancelAnimationFrame(frame);frame=0;};
  const close=()=>{dispose();onClose?.();};
  const replay=button('Replay',()=>{if(!packet)return;stop();time=0;start=null;playing=!reducedMotion;draw();if(playing)frame=requestAnimationFrame(tick);},true);replay.disabled=true;
  const pause=button('Pause',()=>{if(playing){stop();pause.textContent='Play';}else if(packet&&!reducedMotion){playing=true;start=null;pause.textContent='Pause';frame=requestAnimationFrame(tick);}});pause.disabled=true;
  button('Keep current',close);button('Return to fit',close);
  root.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='Enter'||event.key===' ')event.stopPropagation();});
  host.appendChild(root);root.focus({preventScroll:true});
  function draw(){
    graphic.textContent='';if(!packet)return;
    const max=packet.family==='drive'?Math.max(1,...packet.runs.map(run=>run.peakSpeed)):Math.max(1,...packet.runs.map(run=>run.shieldMax));
    for(const [index,run] of packet.runs.entries()){
      const tone=index?'hand':'rest',y=index?94:32;
      const sample=run.samples.reduce((selected,s)=>s.time<=time?s:selected,run.samples[0]);
      const text=svg('text',{x:4,y:y-10,class:'orr-rest'});text.textContent=`${run.label.toUpperCase()} · ${run.identity.label} · ${number(run.mass)} mass`;graphic.appendChild(text);
      if(packet.family==='drive'){
        const path=run.samples.map((s,i)=>`${i?'L':'M'} ${4+s.time/packet.duration*324} ${y+38-s.speed/max*32}`).join(' ');
        graphic.appendChild(lightPath(path,{tone,width:1.3,bloom:4}));
        graphic.appendChild(svg('circle',{cx:4+sample.time/packet.duration*324,cy:y+38-sample.speed/max*32,r:3,class:`orr-${tone}`,fill:'currentColor'}));
      }else{
        graphic.appendChild(lightPath(arcD(295,y+20,18,-120,-120+240*Math.max(0,sample.shield)/max),{tone,width:2,bloom:4}));
        const shield=svg('text',{x:6,y:y+27,class:'orr-rest'});shield.textContent=`${number(sample.shield)} shield · ${number(sample.hull)} hull`;graphic.appendChild(shield);
      }
    }
  }
  function tick(now){frame=0;if(disposed||!playing)return;if(!stillCurrent()){close();return;}if(start==null)start=now-time*1000;
    time=Math.min(packet.duration,(now-start)/1000);draw();if(time>=packet.duration){playing=false;pause.textContent='Play';return;}frame=requestAnimationFrame(tick);}
  function dispose(){if(disposed)return;disposed=true;abort.abort();stop();root.remove();}
  const ready=measureSableDemo({defId:owned.defId,beforeFittings:[...(owned.fittings||[])],afterFittings,moduleId,player:state.player,signal:abort.signal,
    yieldControl:()=>new Promise(resolve=>setTimeout(resolve,0))}).then(result=>{
      if(disposed)return null;if(!stillCurrent()){close();return null;}
      if(!result.ok){status.textContent='No physical trial for this item. Read its current fitting metrics at the counter.';graphic.remove();return result;}
      packet=result;const [before,after]=result.runs;
      const benefit=result.family==='drive'?`peak ${number(before.peakSpeed)} → ${number(after.peakSpeed)} WU/s; after braking ${number(before.stoppedSpeed)} → ${number(after.stoppedSpeed)} WU/s`
        :`shield ${number(before.shieldMax)} → ${number(after.shieldMax)}; three identical 30-damage strikes`;
      status.textContent=`${benefit}. Mass ${number(before.mass)} → ${number(after.mass)}; capacitor ${number(before.capMax)} → ${number(after.capMax)}. More capability carries its cost.`;
      onMeasured?.(result);replay.disabled=false;pause.disabled=reducedMotion;time=reducedMotion?result.duration:0;draw();
      if(!reducedMotion){playing=true;frame=requestAnimationFrame(tick);}return result;
    }).catch(error=>{if(!disposed&&error.name!=='AbortError')status.textContent='The native trial is unavailable. Your current fit is unchanged.';return null;});
  return {ready,dispose,root};
}
