// Component/physics review bench, not an alternate game or a substitute for the in-game Massline.
// Test grips supply impulses through the real membrane. The solver alone changes body motion.
import * as THREE from 'three';
import { buildVesperVisual, disposeVesperVisual } from '../../src/render/characters/vesperModel.js';
import { createVesper } from '../../src/systems/vesper.js';
import { VESPER as C, VESPER_AUDIO_RECIPES } from '../../src/data/vesper.js';
import { makeEntity } from '../../src/core/entity.js';
import { createBus } from '../../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../../src/core/physicsAuthority.js';
import { playRecipe, disposeVoice } from '../../src/audio/synth.js';
async function start() {
 const bus=createBus(),state={simTime:0,tick:0,mode:'flight',timeScale:1,run:{kind:'adventure'},world:{currentSectorId:C.sectorId},
  entities:new Map(),entityList:[],player:{tether:{active:false}}};
 let nextId=0,disposed=false,paused=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,study=false,held=null,seq=0;
 let audioContext=null,audioGain=null,voices=[],soundCount=0;const audioCaches={};
 const helpers={spawnEntity(spec){const e=makeEntity({...spec,id:++nextId});state.entities.set(e.id,e);state.entityList.push(e);return e;},
  removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;},voice:{say(p){document.querySelector('#line').textContent=p.text;return true;}}};
 const player=helpers.spawnEntity({type:'ship',team:0,isPlayer:true,pos:{x:C.anchor.x+100,z:C.anchor.z},vel:{x:0,z:0},radius:4,mass:12,hull:100,hullMax:100});state.playerId=player.id;
 const system=createVesper();system.init({state,bus,helpers});
 const owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 let renderer;try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}
 catch(error){system.destroy();owner.dispose();throw error;}renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
 renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.03;document.body.prepend(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x080e14);
 const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,1700),target=new THREE.Vector3(),offset=new THREE.Vector3(),spherical=new THREE.Spherical();
 const roots=new Map(),tags=new Map(),listeners=[];let dragging=null,lost=false;
 const on=(el,name,fn,options)=>{el.addEventListener(name,fn,options);listeners.push(()=>el.removeEventListener(name,fn,options));};
 scene.add(new THREE.HemisphereLight(0xb0ceda,0x343022,2.1));
 for(const [color,power,pos] of [[0xffe3bc,3.4,[-35,65,25]],[0x78c4d4,2.3,[40,20,-45]],[0xe0d0bd,2.4,[-40,10,-65]]]){
  const l=new THREE.DirectionalLight(color,power);l.position.set(...pos);scene.add(l);}
 const points=[];for(let i=0;i<230;i++){const a=i*2.399963229728653,r=85+(i*47)%280;points.push(Math.cos(a)*r,-55+(i*29)%45,Math.sin(a)*r);}
 const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
 const starsMat=new THREE.PointsMaterial({color:0x638896,size:.36});scene.add(new THREE.Points(starsGeo,starsMat));const cursor=new THREE.Vector3();
 function live(){return state.entityList.filter(e=>e.alive&&e.data?.vesper);}
 function reconcile(){
  for(const [id,root] of roots)if(!state.entities.get(id)?.alive){disposeVesperVisual(root);roots.delete(id);tags.get(id)?.remove();tags.delete(id);}
  for(const e of live())if(!roots.has(e.id)){
   const root=buildVesperVisual(e);roots.set(e.id,root);scene.add(root);
   if(e.data.vesperBell>=0){const i=e.data.vesperBell,tag=document.createElement('div');tag.className='tag';tag.innerHTML=`<b>${['LOW','MIDDLE','HIGH'][i]}</b><br>${['BARREL','FORK','CROWN'][i]}`;document.body.append(tag);tags.set(e.id,tag);}
  }
 }
 function draw(){
  reconcile();camera.lookAt(target);for(const [id,root] of roots){const e=state.entities.get(id);root.position.set(e.pos.x-C.anchor.x,0,e.pos.z-C.anchor.z);root.rotation.y=-(e.rot||0);
   root.userData.updateAuthoredMotion(e,state.simTime,{reducedMotion:reduced,reducedFlash:reduced});root.visible=!study||e.data.vesperBell===-1;
   const tag=tags.get(id);if(tag){cursor.set(root.position.x,0,root.position.z+8).project(camera);
    tag.style.left=`${(cursor.x*.5+.5)*innerWidth}px`;tag.style.top=`${(-cursor.y*.5+.5)*innerHeight}px`;tag.hidden=study||cursor.z>1||Math.abs(cursor.x)>1||Math.abs(cursor.y)>1;}}
  if(!lost)renderer.render(scene,camera);
 }
 function setView(value){study=value;document.body.classList.toggle('study',study);document.querySelector('#view').setAttribute('aria-pressed',String(study));
  camera.position.set(...(study?[44,74,88]:[75,192,176]));target.set(study?-16:-17,0,study?0:-9);camera.lookAt(target);draw();}
 async function unlock(){
  if(!audioContext){audioContext=new AudioContext();audioGain=audioContext.createGain();audioGain.gain.value=.5;audioGain.connect(audioContext.destination);}
  if(audioContext.state==='suspended')await audioContext.resume();
 }
 bus.on('audio:cue',p=>{soundCount++;if(!audioContext||audioContext.state!=='running')return;
  const recipe=VESPER_AUDIO_RECIPES.find(r=>r.id===p.id);if(!recipe)return;
  voices.push(playRecipe(audioContext,recipe,audioGain,{peakGain:p.gain,rate:1},audioCaches));});
 bus.on('vesper:phraseProgress',p=>{document.querySelector('#progress').textContent=p.progress===3?'PHRASE COMPLETE · SCAN TO INVITE':`${p.progress}/3 · NEXT ${['LOW','MIDDLE','HIGH'][p.next]||'LOW'}`;});
 function scan(){if(paused)return;bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,pos:{x:player.pos.x,z:player.pos.z},radius:250});}
 function grip(index){if(paused||held!==null)return;const bell=system._get(system._bellIds[index]);if(!bell)return;
  held=index;state.player.tether={active:true,targetId:bell.id};bus.emit('tether:latched',{targetId:bell.id});
  document.querySelector(`[data-bell="${index}"]`).setAttribute('aria-pressed','true');}
 function release(){if(held===null)return;const index=held,entityId=system._bellIds[index];held=null;state.player.tether={active:false};
  bus.emit('tether:released',{targetId:entityId});document.querySelector(`[data-bell="${index}"]`).setAttribute('aria-pressed','false');}
 function setPaused(v){release();paused=!!v;state.timeScale=paused?0:1;document.querySelector('#pause').setAttribute('aria-pressed',String(paused));}
 function step(){if(paused)return;const dt=1/60;state.simTime+=dt;state.tick++;system.update(dt,state);
  if(held!==null){const bell=system._get(system._bellIds[held]);if(bell)queuePhysicsImpulse(bell,{x:0,y:0,z:bell.mass*23*dt});}
  owner.syncFromEntities(live());owner.step(dt);
 }
 function reset(){release();setPaused(false);system.newGame();for(const e of state.entityList)if(!e.alive)state.entities.delete(e.id);
  state.entityList=state.entityList.filter(e=>e.alive);state.simTime=0;state.tick=0;system._reset();seq=0;step();reconcile();setView(study);
  document.querySelector('#line').textContent='“Calibration cancelled. Music remains.”';document.querySelector('#progress').textContent='LOW → HIGH → MIDDLE';}
 on(document.querySelector('#scan'),'click',()=>{unlock().catch(showError);scan();});
 for(const btn of document.querySelectorAll('[data-bell]')){
  on(btn,'pointerdown',e=>{if(e.button!==0)return;e.preventDefault();btn.setPointerCapture(e.pointerId);unlock().catch(showError);grip(Number(btn.dataset.bell));});
  on(btn,'pointerup',release);on(btn,'pointercancel',release);on(btn,'lostpointercapture',release);
  on(btn,'keydown',e=>{if((e.code==='Space'||e.code==='Enter')&&!e.repeat){e.preventDefault();unlock().catch(showError);grip(Number(btn.dataset.bell));}});
  on(btn,'keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();release();}});on(btn,'blur',release);
 }
 on(document.querySelector('#view'),'click',()=>setView(!study));
 on(document.querySelector('#quiet'),'click',()=>{reduced=!reduced;document.querySelector('#quiet').setAttribute('aria-pressed',String(reduced));});
 document.querySelector('#quiet').setAttribute('aria-pressed',String(reduced));
 on(document.querySelector('#pause'),'click',()=>setPaused(!paused));on(document.querySelector('#reset'),'click',reset);
 on(window,'blur',()=>{release();setPaused(true);});on(document,'visibilitychange',()=>{if(document.hidden){release();setPaused(true);}});
 on(renderer.domElement,'pointerdown',e=>{if(e.button!==0)return;dragging={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
 on(renderer.domElement,'pointerup',()=>{dragging=null;});on(renderer.domElement,'pointercancel',()=>{dragging=null;});
 on(renderer.domElement,'pointermove',e=>{if(!dragging)return;spherical.setFromVector3(offset.copy(camera.position).sub(target));
  spherical.theta-=(e.clientX-dragging.x)*.006;spherical.phi=Math.max(.12,Math.min(1.55,spherical.phi+(e.clientY-dragging.y)*.006));
  camera.position.copy(target).add(offset.setFromSpherical(spherical));dragging={x:e.clientX,y:e.clientY};});
 on(renderer.domElement,'wheel',e=>{e.preventDefault();offset.copy(camera.position).sub(target);camera.position.copy(target).add(offset.setLength(Math.max(40,Math.min(440,offset.length()*Math.exp(e.deltaY*.001)))));},{passive:false});
 on(window,'resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
 on(renderer.domElement,'webglcontextlost',e=>{e.preventDefault();lost=true;setPaused(true);});on(renderer.domElement,'webglcontextrestored',()=>{lost=false;draw();});
 let frameId=0,last=performance.now(),accumulator=0;
 function frame(now){if(disposed)return;frameId=requestAnimationFrame(frame);accumulator+=Math.min(.15,(now-last)/1000);last=now;
  while(accumulator>=1/60){step();accumulator-=1/60;}draw();
  if(audioContext){voices=voices.filter(v=>{if(v.stopAt<audioContext.currentTime){disposeVoice(v);return false;}return true;});}
 }
 step();setView(false);let meshes=0,triangles=0;for(const root of roots.values())root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 document.querySelector('#metrics').textContent=`4 REAL BODIES · ${meshes} MESHES · ${triangles.toLocaleString()} TRIANGLES`;
 window.vesperBench={state,system,owner,renderer,scene,camera,roots,step,scan,grip,release,setView,setPaused,draw,
  setReduced(v){reduced=!!v;document.querySelector('#quiet').setAttribute('aria-pressed',String(reduced));},get soundCount(){return soundCount;},get study(){return study;},
  // Presentation-only still control; never used as gameplay proof. Simulation tests use events+solver.
  studyPose(phase,t=8){setPaused(true);setView(true);const e=system._get(system._hubId);Object.assign(e.data.vesperPose,{met:phase!=='sleep',phase,simTime:t,bloomAt:phase==='bloom'?t-1.8:-100,gaze:.5});draw();},
  dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(frameId);listeners.splice(0).forEach(off=>off());system.destroy();owner.dispose();
   roots.forEach(disposeVesperVisual);roots.clear();tags.forEach(t=>t.remove());voices.forEach(disposeVoice);voices=[];
   audioContext?.close();starsGeo.dispose();starsMat.dispose();renderer.dispose();renderer.domElement.remove();}};
 on(window,'pagehide',()=>window.vesperBench.dispose(),{once:true});frame(performance.now());
}
function showError(error){document.querySelector('#error').textContent=error.stack||String(error);console.error(error);}
start().catch(showError);
