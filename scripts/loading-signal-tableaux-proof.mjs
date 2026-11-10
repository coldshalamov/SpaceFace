import { createSignalTableaux } from '../src/ui/loadingSignalTableaux.js';
import { createIntro2DEngine, createIntroGLEngine, INTRO_GL_SOURCES } from '../src/ui/loadingTerminalArt.js';
const params=new URLSearchParams(location.search);
let canvas,engine,source,gl,pending=null,now=1000,time=0,act=-1,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,playing=true,mode='webgl';
let width=Math.min(1600,Math.max(320,Number(params.get('width'))||1280));
let height=Math.min(1000,Math.max(180,Number(params.get('height'))||720));
const messages=[],costs=[];let sourceDirty=true;
const controls={mode:document.getElementById('mode'),seek:document.getElementById('seek'),play:document.getElementById('play'),reduced:document.getElementById('reduced')};
const initMessage={type:'init',canvas:null,width,height,reducedMotion:false};
const labMessage={type:'lab',act:-1,t:0,freeze:false,reduced:false,clear:false};
function send(t,freeze,clear=false){labMessage.act=act;labMessage.t=t;labMessage.freeze=freeze;labMessage.reduced=reduced;labMessage.clear=clear;engine?.receive(labMessage);}
function update(){
 document.getElementById('act-name').textContent=reduced?'INTENTIONAL STILL / REDUCED MOTION':'FIVE BODIES / ONE CONTINUOUS FIELD';
 controls.seek.value=Math.min(120,time);document.getElementById('time').textContent=time.toFixed(2).padStart(6,'0')+' s';
 controls.play.textContent=playing?'Pause':'Play';controls.reduced.checked=reduced;
 const stats=source?.stats();
 document.getElementById('status').textContent=`${mode==='webgl'?(gl?'WEBGL2 / FEEDBACK':'WEBGL2 UNAVAILABLE'):mode==='2d'?'CANVAS 2D / CONTINUOUS HISTORY':'PROJECTED SOURCE / INSPECTION'} · ${reduced?'SETTLED':playing?'LIVE':'PAUSED'} · ${width} × ${height}`;
 document.getElementById('metrics').textContent=stats?`${stats.bodyCount} INDEPENDENT BODIES · ${stats.sourceHz} HZ SOURCE BUDGET`:'';
 document.getElementById('errors').textContent=messages.filter(m=>/Error|Fallback/.test(m.type)).map(m=>JSON.stringify(m)).join('\n');
}
function tick(dt=1/60){
 now+=dt*1000;const start=performance.now();
 if(mode==='source'){
  if(!sourceDirty&&(!playing||reduced))return;
  sourceDirty=false;
  if(!reduced&&playing)time+=dt;
  const image=source.render({time:time%480,act,width,height,aspect:width/height,reduced});
  const ctx=canvas.getContext('2d');ctx.fillStyle='#02080b';ctx.fillRect(0,0,width,height);if(image)ctx.drawImage(image,0,0,width,height);
 } else if(pending){const f=pending;pending=null;f(now);if(!reduced&&playing)time+=dt;}
 costs.push(performance.now()-start);if(costs.length>180)costs.shift();
}
function mount(nextMode=mode,w=width,h=height,forceLDR=false){
 engine?.receive({type:'destroy'});source?.dispose();try{gl?.getExtension('WEBGL_lose_context')?.loseContext();}catch{}
 pending=null;engine=null;source=null;gl=null;messages.length=0;mode=['webgl','2d','source'].includes(nextMode)?nextMode:'webgl';width=Math.min(2560,Math.max(64,Math.round(Number(w)||1280)));height=Math.min(1600,Math.max(64,Math.round(Number(h)||720)));
 const old=document.getElementById('signal');canvas=document.createElement('canvas');canvas.id='signal';canvas.width=width;canvas.height=height;canvas.style.aspectRatio=`${width} / ${height}`;canvas.setAttribute('aria-label','SpaceFace live production visualizer');old.replaceWith(canvas);
 if(mode==='webgl')gl=canvas.getContext('webgl2',{antialias:false,alpha:false,depth:false,preserveDrawingBuffer:true});
 if(gl&&forceLDR){const get=gl.getExtension.bind(gl);gl.getExtension=name=>name==='EXT_color_buffer_float'?null:get(name);}
 const host={document,sources:INTRO_GL_SOURCES,engine2D:createIntro2DEngine,tableaux(h){source=createSignalTableaux(h);return source;},post(msg){messages.push(msg);},raf(fn){pending=fn;return 1;},cancel(){pending=null;}};
 if(mode==='source')source=createSignalTableaux(host);
 else{engine=(mode==='2d'?createIntro2DEngine:createIntroGLEngine)(host);initMessage.canvas=canvas;initMessage.width=width;initMessage.height=height;initMessage.reducedMotion=reduced;engine.receive(initMessage);}
 controls.mode.value=mode;seek(time,0);update();return status();
}
function seek(t,warm=0){
 time=Number.isFinite(Number(t))?Math.max(0,Math.min(1e9,Number(t))):0;const wasPlaying=playing;playing=false;sourceDirty=true;
 send(Math.max(0,time-warm/60),false,true);
 for(let i=0;i<warm&&!reduced;i++)tick();
 send(time,true);tick();playing=wasPlaying;
 if(playing)send(time,false);update();return status();
}
function status(){return {mode,width,height,time,act,reduced,playing,scheduled:!!pending,messages:messages.slice(),source:source?.stats(),glError:gl?.getError()??null,renderer:gl?.getParameter(gl.RENDERER)??null};}
function play(value){playing=!!value;send(time,!playing);update();}
function advance(frames=1,dt=1/60){for(let i=0;i<frames;i++)tick(dt);update();return status();}
window.proof={mount,seek,play,advance,status,loseContext(){gl?.getExtension('WEBGL_lose_context')?.loseContext();},setAct(a){act=a;return seek(time,0);},setReduced(value){reduced=!!value;return seek(time);},
 pixels(){if(gl){const p=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;}return canvas.getContext('2d').getImageData(0,0,width,height).data;},
 image(){return canvas.toDataURL('image/png');},sourceState(){return source.sample(time,act,reduced);},
 performance(){const s=costs.slice().sort((a,b)=>a-b);return {samples:s.length,median:s[Math.floor(s.length*.5)]||0,p95:s[Math.floor(s.length*.95)]||0};},
};
controls.mode.onchange=()=>mount(controls.mode.value);controls.play.onclick=()=>play(!playing);controls.reduced.onchange=()=>{reduced=controls.reduced.checked;seek(time);};
controls.seek.oninput=()=>{act=-1;play(false);seek(+controls.seek.value,8);};
document.getElementById('loop').onclick=()=>{act=-1;seek(0);play(true);};
document.getElementById('fullscreen').onclick=()=>{const v=document.querySelector('.viewport');if(document.fullscreenElement)document.exitFullscreen?.();else v.requestFullscreen?.().catch(()=>{});};
document.getElementById('save').onclick=()=>{const data=source.svg({time,act:-1,width,height,reduced});const url=URL.createObjectURL(new Blob([data],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='spaceface-continuum-live-pose.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),0);};
document.addEventListener('keydown',e=>{if(/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName)||e.target.isContentEditable)return;if(e.code==='Space'){e.preventDefault();play(!playing);}if(e.code==='ArrowRight'||e.code==='ArrowLeft'){e.preventDefault();act=-1;play(false);seek(time+(e.code==='ArrowRight'?.25:-.25),4);}});
let previous=0;function pump(stamp){const dt=previous?Math.min(.05,(stamp-previous)/1000):1/60;previous=stamp;if(!document.hidden&&playing&&(!reduced||pending)){tick(dt);update();}requestAnimationFrame(pump);}
matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',e=>{reduced=e.matches;seek(time);});
mount(params.get('mode')||'webgl');if(params.has('paused'))play(false);requestAnimationFrame(pump);
