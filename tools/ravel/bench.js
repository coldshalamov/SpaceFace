import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildRavelVisual, disposeRavelVisual } from '../../src/render/characters/ravelModel.js';
import { createRavelFixture } from './labRuntime.js';
import { RAVEL as C, RAVEL_AUDIO_RECIPES } from '../../src/data/ravel.js';
import { RAVEL_GLOBAL_ANCHOR as O } from '../../src/systems/ravel.js';
import { playRecipe, disposeVoice } from '../../src/audio/synth.js';
const $=id=>document.getElementById(id),canvas=$('view'),keys=new Set(),views=new Map();
const errors=[];window.addEventListener('error',e=>errors.push(e.message));
let renderer;
try{renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});}
catch(e){$('error').hidden=false;$('error').textContent='This preview requires WebGL 2. This browser could not create a graphics context. Try a hardware-accelerated desktop browser.\n\n'+e.message;throw e;}
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
const scene=new THREE.Scene();scene.background=new THREE.Color(0x080f15);
const camera=new THREE.PerspectiveCamera(36,1,.1,4000);camera.position.set(170,285,255);camera.lookAt(35,0,0);
scene.add(new THREE.HemisphereLight(0xbbd9e6,0x273035,2.2));
const key=new THREE.DirectionalLight(0xffe1b9,3.4);key.position.set(-60,160,100);scene.add(key);
const rim=new THREE.DirectionalLight(0x7fcebc,2.1);rim.position.set(70,30,-100);scene.add(rim);
// Original studio radiance, generated locally; no texture download or asset dependency.
const studio=new THREE.Scene();studio.background=new THREE.Color(0x15202a);
for(const [p,color,scale]of[[[0,30,0],0xc6dacd,[30,1,16]],[[-25,8,14],0xb38758,[1,12,16]],[[20,12,-18],0x385e70,[1,20,12]]]){
 const m=new THREE.Mesh(new THREE.BoxGeometry(...scale),new THREE.MeshBasicMaterial({color}));m.position.set(...p);studio.add(m);}
const pmrem=new THREE.PMREMGenerator(renderer),env=pmrem.fromScene(studio,.04);scene.environment=env.texture;
studio.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
const composer=new EffectComposer(renderer);composer.addPass(new RenderPass(scene,camera));
const bloom=new UnrealBloomPass(new THREE.Vector2(960,600),.35,.5,.85);composer.addPass(bloom);composer.addPass(new OutputPass());
// Stars are tiny at true sky depth; all encounter effects are physical world meshes.
const starPos=new Float32Array(280*3);for(let i=0;i<280;i++){
 const a=i*2.3999632297,r=480+(i*97%760);starPos[i*3]=Math.cos(a)*r;starPos[i*3+1]=-130-(i%31)*7;starPos[i*3+2]=Math.sin(a)*r;}
const starG=new THREE.BufferGeometry();starG.setAttribute('position',new THREE.BufferAttribute(starPos,3));
const stars=new THREE.Points(starG,new THREE.PointsMaterial({color:0x658887,size:1.1,sizeAttenuation:true,transparent:true,opacity:.5}));scene.add(stars);
const pilot=new THREE.Group();pilot.name='bench_input_marker_not_a_production_ship';
const pointer=new THREE.Mesh(new THREE.ConeGeometry(3.5,10,4).rotateX(Math.PI/2),new THREE.MeshStandardMaterial({color:0xe9ddbc,emissive:0x664831,emissiveIntensity:.45,metalness:.4,roughness:.4}));pilot.add(pointer);scene.add(pilot);
const linkG=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]);
const link=new THREE.Line(linkG,new THREE.LineBasicMaterial({color:0xebc38d,transparent:true,opacity:.75}));link.frustumCulled=false;scene.add(link);
let f,selected=null,study=false,last=performance.now(),acc=0,frame=0,lastFire=-10,busy=false,audio=null,voices=[],audioCache={};
$('motion').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;
function a11y(){return {reducedMotion:$('motion').checked,reducedFlash:$('flash').checked};}
function disposeViews(){for(const root of views.values())disposeRavelVisual(root);views.clear();}
async function reset(){if(busy)return;busy=true;f?.destroy();disposeViews();f=createRavelFixture();await f.enablePhysics();
 selected=f.system._core();f.bus.on('ravel:voice',p=>{$('line').textContent=p.text;});
 f.bus.on('audio:cue',p=>{if(!audio||!$('sound').checked)return;const recipe=RAVEL_AUDIO_RECIPES.find(r=>r.id===p.id);
  if(recipe)voices.push(playRecipe(audio,recipe,audio.destination,{peakGain:.45},audioCache));});
 $('line').textContent='Scan to hail. Nothing here attacks until you accept the challenge.';lastFire=-10;acc=0;busy=false;syncViews();}
function syncViews(){if(!f)return;
 for(const [id,root]of views){if(!f.state.entities.get(id)?.alive){disposeRavelVisual(root);views.delete(id);}}
 for(const e of f.state.entityList){if(!e.alive||!e.data?.ravelPart)continue;
  let root=views.get(e.id);if(!root){root=buildRavelVisual(e);root.userData.entityId=e.id;views.set(e.id,root);scene.add(root);}
  root.position.set(e.pos.x-O.x,0,e.pos.z-O.z);root.rotation.y=-(e.rot||0);root.userData.updateAuthoredMotion(e,f.state.simTime,a11y());}
 pilot.visible=!!f.player.alive&&!study;pilot.position.set(f.player.pos.x-O.x,1,f.player.pos.z-O.z);
 if(Math.hypot(f.player.vel.x,f.player.vel.z)>1)pilot.rotation.y=Math.atan2(f.player.vel.x,f.player.vel.z);
 const line=Object.values(f.state.combat.attachments.byId).find(a=>a.state==='active'&&a.ownerId===f.player.id);
 link.visible=!!line&&!study;if(line){const e=f.state.entities.get(line.targetId),p=linkG.attributes.position;
  if(e){p.setXYZ(0,f.player.pos.x-O.x,1,f.player.pos.z-O.z);p.setXYZ(1,e.pos.x-O.x,1,e.pos.z-O.z);p.needsUpdate=true;}}
 const memory=f.state.ravel,phase=f.system._phase;
 $('phase').textContent=f.state.timeScale===0?'PAUSED':memory.destroyed?'SILENT':phase==='windup'?`CAST IN ${(C.windup-f.system._elapsed).toFixed(1)}`:phase.toUpperCase();
 $('weights').textContent=`${3-((memory.freed|memory.broken).toString(2).match(/1/g)||[]).length} THREADS`;
 $('hull').textContent=`HULL ${Math.ceil(f.player.hull)} / SHIELD ${Math.ceil(f.player.shield)}`;
 if(!selected?.alive)selected=f.system._core();
 $('target').textContent=`TARGET / ${selected?.data?.ravelPart==='spool'?`WEIGHT ${selected.data.ravelIndex+1}`:selected?'CORE':'NONE'} · ${selected?Math.ceil(selected.hull):0} HULL`;
}
function grip(){if(!f||busy)return;
 const existing=Object.values(f.state.combat.attachments.byId).some(a=>a.state==='active'&&a.ownerId===f.player.id);
 if(existing){f.cut();return;}
 const spool=f.system._spools.filter(e=>e?.alive).sort((a,b)=>a.pos.distanceToSquared(f.player.pos)-b.pos.distanceToSquared(f.player.pos))[0];
 if(!spool||spool.pos.distanceTo(f.player.pos)>100){$('line').textContent='Fly within 100 units of a counterweight, then press M to grip it.';return;}
 const r=f.grip(spool);if(r.ok)selected=spool;else $('line').textContent=`Massline could not latch: ${r.reason}.`;}
function fire(){if(!f||!selected?.alive||busy||f.state.timeScale===0||f.state.simTime-lastFire<.2||!f.player.alive)return;
 if(selected.pos.distanceTo(f.player.pos)>340){$('line').textContent='Target beyond the bench weapon’s 340-unit range.';return;}
 lastFire=f.state.simTime;const r=f.damage(selected,45);if(r.applied===0&&selected.flags.invuln)$('line').textContent='The spindle is closed. Wait for the cast to end, or take its weights instead.';}
function pause(){if(!f)return;f.state.timeScale=f.state.timeScale?0:1;$('pause').textContent=f.state.timeScale?'Pause':'Resume';$('pause').setAttribute('aria-pressed',String(!f.state.timeScale));}
function setStudy(value){study=value;document.body.classList.toggle('study',value);$('study').setAttribute('aria-pressed',String(value));
 camera.position.set(...(value?[66,103,97]:[170,285,255]));camera.lookAt(value?0:35,0,0);}
$('hail').onclick=()=>f?.scan();$('tether').onclick=grip;$('fire').onclick=fire;$('reset').onclick=reset;$('pause').onclick=pause;$('study').onclick=()=>setStudy(!study);
$('sound').onchange=async()=>{if($('sound').checked){audio ||= new AudioContext();await audio.resume();}else for(const v of voices)disposeVoice(v);};
window.addEventListener('keydown',e=>{if(e.target.matches('input'))return;
 if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','KeyC','KeyM','KeyP'].includes(e.code))e.preventDefault();
 keys.add(e.code);if(e.repeat)return;if(e.code==='KeyC')f?.scan();if(e.code==='KeyM')grip();if(e.code==='KeyP')pause();if(e.code==='Space')fire();});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();});
document.addEventListener('visibilitychange',()=>{keys.clear();if(document.hidden&&f?.state.timeScale)pause();last=performance.now();acc=0;});
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();canvas.addEventListener('pointerdown',e=>{
 canvas.focus();mouse.set(e.clientX/innerWidth*2-1,-e.clientY/innerHeight*2+1);ray.setFromCamera(mouse,camera);
 const hits=ray.intersectObjects([...views.values()],true);for(const h of hits){let o=h.object;while(o&&!o.userData.entityId)o=o.parent;
  if(o){selected=f.state.entities.get(o.userData.entityId);break;}}});
function resize(){renderer.setSize(innerWidth,innerHeight);composer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();
function tick(t){requestAnimationFrame(tick);const elapsed=Math.min(.1,(t-last)/1000);last=t;
 if(f&&!busy){if(f.state.timeScale&&f.player.alive){acc+=elapsed;let steps=0;while(acc>=1/60&&steps++<8){
  if(!study)f.thrust((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),
    (keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0));
  if(keys.has('Space'))fire();f.step();acc-=1/60;}}else acc=0;
  syncViews();}
 composer.render();
 if(audio)voices=voices.filter(v=>{if(v.stopAt<audio.currentTime){disposeVoice(v);return false;}return true;});
 if(++frame%30===0)$('diagnostic').textContent=`PRODUCTION RAVEL + Rapier · ${views.size} authored bodies · isolated encounter bench, not the full world`;
}
window.__ravelLab={get fixture(){return f;},get errors(){return errors;},get views(){return views;},setStudy,render(){syncViews();composer.render();},pause,
 stats(){let triangles=0,meshes=0;for(const root of views.values())root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;}});
  return {meshes,triangles,phase:f?.system._phase,errors:[...errors],webgl:renderer.capabilities.isWebGL2};}};
window.addEventListener('pagehide',()=>{f?.destroy();disposeViews();for(const v of voices)disposeVoice(v);audio?.close();env.dispose();composer.dispose();renderer.dispose();});
try{await reset();window.__ravelReady=true;requestAnimationFrame(tick);}catch(e){$('error').hidden=false;$('error').textContent=String(e.stack||e);throw e;}
