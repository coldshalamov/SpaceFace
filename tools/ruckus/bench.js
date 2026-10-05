import * as THREE from 'three';
import { createRuckusFixture } from './labRuntime.js';
import { buildRuckusVisual, disposeRuckusVisual } from '../../src/render/characters/ruckusModel.js';
import { RUCKUS as C, RUCKUS_AUDIO_RECIPES } from '../../src/data/ruckus.js';
import { RUCKUS_GLOBAL_ANCHOR as HOME } from '../../src/systems/ruckus.js';
import { playRecipe } from '../../src/audio/synth.js';
const $ = id => document.getElementById(id);
let f = await createRuckusFixture(), inspect = false, sound = false, audio = null, eventCursor = 0, disposed = false;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.25;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x09111b);
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, .1, 3000);
scene.add(new THREE.HemisphereLight(0xc4e9ff, 0x151b24, 2.2));
for (const [color, intensity, pos] of [[0xffd6a8,3.2,[90,180,80]],[0x80c7e6,2.8,[-90,80,-100]]]) {
  const light = new THREE.DirectionalLight(color,intensity);light.position.set(...pos);scene.add(light);
}
// Authored workshop grid is not production terrain. The character, actions and body owner ARE production modules.
const grid = new THREE.GridHelper(1200,48,0x28414d,0x162e39);grid.position.y=-9;grid.material.transparent=true;grid.material.opacity=.26;scene.add(grid);
const verts=[];for(let i=0;i<480;i++){const a=i*2.399963229728653,r=100+Math.sqrt(i/480)*1200;verts.push(Math.cos(a)*r,-50-(i%17),Math.sin(a)*r);}
const stars=new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(verts,3)),new THREE.PointsMaterial({color:0x9babbc,size:1.1,sizeAttenuation:true}));scene.add(stars);
const pilot=new THREE.Group();const hull=new THREE.Mesh(new THREE.ConeGeometry(5,14,4).rotateZ(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x85a7b5,metalness:.6,roughness:.3}));pilot.add(hull);scene.add(pilot);
const maps=new Map(), target=new THREE.Vector3(20,0,50), look=new THREE.Vector3(), keys=new Set(), ray=new THREE.Raycaster(), mouse=new THREE.Vector2(), plane=new THREE.Plane(new THREE.Vector3(0,1,0),0), point=new THREE.Vector3();
const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),new THREE.Vector3()]),new THREE.LineBasicMaterial({color:0x74dfce}));scene.add(line);
let lastComms='';const activeVoices=[];
const a11y={reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,reducedFlash:false};
function present(){
  for(const e of f.state.entityList){if(!e.data?.ruckusPart)continue;let m=maps.get(e.id);if(!m){m=buildRuckusVisual(e);maps.set(e.id,m);scene.add(m);}m.position.set(e.pos.x-HOME.x,0,e.pos.z-HOME.z);m.rotation.y=-(e.rot||0);m.userData.updateAuthoredMotion(e,0,a11y);}
  for(const [id,m] of maps)if(!f.state.entities.has(id)){disposeRuckusVisual(m);maps.delete(id);}
  pilot.position.set(f.player.pos.x-HOME.x,0,f.player.pos.z-HOME.z);pilot.rotation.y=-f.player.rot;
  const core=f.core();line.visible=!!f.state.combat.attachments.byId.workshop&&!!core;
  if(line.visible){const a=line.geometry.attributes.position;a.setXYZ(0,pilot.position.x,0,pilot.position.z);a.setXYZ(1,core.pos.x-HOME.x,0,core.pos.z-HOME.z);a.needsUpdate=true;line.geometry.computeBoundingSphere();}
  for(;eventCursor<f.events.length;eventCursor++){
    const [name,p]=f.events[eventCursor];if(name==='comms'){lastComms=p.text;$('comms').textContent=p.text;}
    if(name==='audio:cue'&&audio&&sound){const recipe=RUCKUS_AUDIO_RECIPES.find(r=>r.id===p.id);if(recipe){try{activeVoices.push(playRecipe(audio,recipe,audio.destination,{peakGain:.3},{}));}catch(e){console.warn('Workshop sound:',e.message);}}}
  }
  while(activeVoices.length>24){activeVoices.shift()?.stop?.();}
  $('status').textContent=f.state.timeScale===0?'PAUSED':f.system._phase.toUpperCase();
  $('bond').textContent=`CREW: ${f.state.ruckus.returns>=3?2:1} / RETURNS: ${f.state.ruckus.returns}`;
  const b=f.body();if(b){
    const bx=b.pos.x-HOME.x,bz=b.pos.z-HOME.z;
    const aspectFit=Math.max(1,1/camera.aspect);
    if(inspect){camera.clearViewOffset();look.set(bx,0,bz);camera.position.set(bx+45*aspectFit,67*aspectFit,bz+60*aspectFit);camera.lookAt(look);}
    else{
      const cx=core?core.pos.x-HOME.x:bx,cz=core?core.pos.z-HOME.z:bz;
      look.set((Math.min(bx,cx,pilot.position.x)+Math.max(bx,cx,pilot.position.x))/2,0,(Math.min(bz,cz,pilot.position.z)+Math.max(bz,cz,pilot.position.z))/2);
      // Frame the physical actors inside the unoccluded playfield, including after
      // test fast-forward/reset. A lerp from the old centre could strand the dog offscreen.
      target.copy(look);
      const radius=Math.max(65,Math.hypot(bx-target.x,bz-target.z)+C.visualRadius,
        Math.hypot(cx-target.x,cz-target.z)+C.toyRadius,
        Math.hypot(pilot.position.x-target.x,pilot.position.z-target.z)+12);
      const narrow=innerWidth<650,top=narrow?180:145,bottom=narrow?300:240;
      const available=Math.max(140,innerHeight-top-bottom),halfFov=THREE.MathUtils.degToRad(camera.fov*.5);
      const halfAngle=Math.min(Math.atan(Math.tan(halfFov)*available/innerHeight),Math.atan(Math.tan(halfFov)*camera.aspect*.86));
      const distance=radius/Math.sin(halfAngle)*1.06;
      camera.setViewOffset(innerWidth,innerHeight,0,(bottom-top)/2,innerWidth,innerHeight);
      camera.position.set(target.x,target.y+distance*.88,target.z+distance*.475);camera.lookAt(target);
    }
  }
  renderer.render(scene,camera);
}
const halt=()=>{f.state.timeScale=f.state.timeScale?0:1;$('pause').textContent=f.state.timeScale?'Pause':'Resume';};
$('hail').onclick=()=>f.scan();$('pause').onclick=halt;
$('throw').onclick=()=>{const c=f.core();if(c){const angle=f.state.ruckus.returns%2?Math.PI:0;f.throwCore({x:Math.cos(angle),z:.23});}};
$('hold').onclick=()=>{if(f.state.combat.attachments.byId.workshop){f.release({x:1,z:0},0);$('hold').textContent='Hold core';}else{f.hold();$('hold').textContent='Release core';}};
$('view').onclick=()=>{inspect=!inspect;$('view').textContent=inspect?'Flight view':'Inspect';};
$('sound').onclick=async()=>{audio ||= new AudioContext();await audio.resume();sound=!sound;$('sound').textContent=sound?'Sound on':'Sound off';};
$('reset').onclick=async()=>{f.destroy();for(const m of maps.values())disposeRuckusVisual(m);maps.clear();f=await createRuckusFixture();eventCursor=0;window.ruckusLab.fixture=f;$('hold').textContent='Hold core';};
addEventListener('keydown',e=>{if(e.target.closest('button'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(!e.repeat){if(e.code==='KeyH')f.scan();if(e.code==='Space')halt();if(e.code==='KeyV')$('view').click();}keys.add(e.code);});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();f.input(0,0);});
function worldPoint(event){mouse.set(event.clientX/innerWidth*2-1,1-event.clientY/innerHeight*2);ray.setFromCamera(mouse,camera);return ray.ray.intersectPlane(plane,point);}
let drag=null;
renderer.domElement.addEventListener('pointerdown',e=>{const c=f.core(),w=worldPoint(e);if(c&&w&&Math.hypot(w.x-(c.pos.x-HOME.x),w.z-(c.pos.z-HOME.z))<25){f.hold();drag={x:w.x,z:w.z,id:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId);}});
renderer.domElement.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const w=worldPoint(e);if(w)f.release({x:w.x-drag.x,z:w.z-drag.z},Math.min(70,Math.hypot(w.x-drag.x,w.z-drag.z)*.7));else f.release({x:1,z:0},0);drag=null;});
renderer.domElement.addEventListener('pointercancel',()=>{if(drag)f.release({x:1,z:0},0);drag=null;});
addEventListener('resize',()=>{renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();});
let previous=performance.now(),accumulator=0;
function frame(now){if(disposed)return;accumulator+=Math.min(.08,(now-previous)/1000);previous=now;
  f.input((keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0));
  while(accumulator>=1/60){f.step();accumulator-=1/60;}present();requestAnimationFrame(frame);
}
window.ruckusLab={fixture:f,renderer,camera,scene,maps,a11y,present,inspect:()=>{$('view').click();},snapshot:()=>({phase:f.system._phase,memory:f.system.serialize(),bodies:f.state.entityList.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,comms:lastComms})};
$('boot').hidden=true;requestAnimationFrame(frame);
addEventListener('pagehide',()=>{disposed=true;f.destroy();for(const m of maps.values())disposeRuckusVisual(m);audio?.close();renderer.dispose();});
