// Isolated review route. The character, rules, entity shape and Rapier authority are production
// modules. Only the input/camera/test tug are this bench's own; no alternate character gameplay.
import * as THREE from 'three';
import { buildBracketVisual, disposeBracketVisual } from '../../src/render/characters/bracketModel.js';
import { createBracket } from '../../src/systems/bracket.js';
import { BRACKET as C } from '../../src/data/bracket.js';
import { createBus } from '../../src/core/eventBus.js';
import { makeEntity } from '../../src/core/entity.js';
import { writePhysicsControl, queuePhysicsImpulse } from '../../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../../src/core/sg02DynamicBodyOwner.js';
import { freezeStaticChildMatrices } from '../../src/render/staticChildMatrices.js';

const quote=document.querySelector('#quote'), score=document.querySelector('#score'),help=document.querySelector('#help');
const scene=new THREE.Scene();scene.background=new THREE.Color('#081017');scene.fog=new THREE.FogExp2('#081017',.0018);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setSize(innerWidth,innerHeight);
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;document.body.prepend(renderer.domElement);
const camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,1600);
const pmrem=new THREE.PMREMGenerator(renderer),room=new THREE.Scene();
const roomShell=new THREE.Mesh(new THREE.BoxGeometry(200,200,200),new THREE.MeshBasicMaterial({color:0x697378,side:THREE.BackSide}));room.add(roomShell);
for(const [x,y,z,w,h,d]of[[-85,30,0,2,90,70],[30,85,10,90,2,110],[60,0,-85,40,80,2]]){const panel=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshBasicMaterial({color:new THREE.Color(4.0,3.8,3.3)}));panel.position.set(x,y,z);room.add(panel);}
scene.environment=pmrem.fromScene(room,.04).texture;room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});pmrem.dispose();
scene.environmentIntensity=.55;
const ambient=new THREE.HemisphereLight(0xc4d5e4,0x17120c,2.0);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xffe3ae,4.0);sun.position.set(-100,160,120);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-160,right:160,top:160,bottom:-160,near:1,far:600});sun.shadow.bias=-.0005;scene.add(sun);
const rim=new THREE.DirectionalLight(0x50c7cc,3.0);rim.position.set(60,60,-100);scene.add(rim);
const floor=new THREE.Mesh(new THREE.CircleGeometry(400,96),new THREE.MeshStandardMaterial({color:0x0b1821,roughness:.6,metalness:.35}));floor.rotation.x=-Math.PI/2;floor.position.y=-10;floor.receiveShadow=true;scene.add(floor);
const lines=[];for(let x=-250;x<=250;x+=20){lines.push(x,-9.98,-250,x,-9.98,250,-250,-9.98,x,250,-9.98,x);}
const grid=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(lines,3)),new THREE.LineBasicMaterial({color:0x315364,transparent:true,opacity:.20}));scene.add(grid);
let nextId=0,seq=0,view='portrait',paused=false,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const state={simTime:0,tick:0,mode:'flight',timeScale:1,run:{kind:'adventure'},world:{currentSectorId:C.sectorId},entities:new Map(),entityList:[],player:{tether:{active:false}}};
const bus=createBus(),visuals=new Map(),events=[];
const helpers={spawnEntity(spec){const e=makeEntity({...spec,id:++nextId});state.entities.set(e.id,e);state.entityList.push(e);return e;},
 removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;state.entities.delete(id);const i=state.entityList.findIndex(e=>e.id===id);if(i>=0)state.entityList.splice(i,1);},
 voice:{say({text}){if(view==='court')quote.textContent=text;events.push({time:state.simTime,text});return true;}}};
const player=helpers.spawnEntity({type:'ship',team:0,isPlayer:true,pos:{x:C.anchor.x,z:C.anchor.z+82},mass:18,radius:4,hull:100,hullMax:100,physicsBody:{dynamic:true,shape:'ball',radius:4,mass:18,material:'ship',useMeasuredSkin:false}});state.playerId=player.id;
// Clearly isolated test tug, not a procedural substitute on SpaceFace's real route.
const tug=new THREE.Group();const hull=new THREE.Mesh(new THREE.ConeGeometry(3.2,9,5).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x829aaf,metalness:.65,roughness:.26}));hull.castShadow=true;tug.add(hull);
const light=new THREE.Mesh(new THREE.OctahedronGeometry(1.1),new THREE.MeshStandardMaterial({color:0xe8c58a,emissive:0xffb54f,emissiveIntensity:2}));light.position.z=3.9;tug.add(light);scene.add(tug);
const tetherGeo=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(6),3));
const tetherLine=new THREE.Line(tetherGeo,new THREE.LineBasicMaterial({color:0xffca79}));tetherLine.frustumCulled=false;scene.add(tetherLine);
const sys=createBracket();sys.init({state,bus,helpers});
let physics;
try{physics=await createSg02DynamicBodyOwner({publishTelemetry:false});}catch(err){const box=document.querySelector('#error');box.style.display='block';box.textContent=err.message;throw err;}
const keys=new Set();
const hail=()=>{bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,pos:{x:player.pos.x,z:player.pos.z},radius:300});};
const release=()=>{state.player.tether={active:false};};
const toggleTether=()=>{const b=sys._entity('ball');if(!b)return;if(state.player.tether.active){release();return;}if(player.pos.distanceTo(b.pos)>85)return;state.player.tether={active:true,targetId:b.id};bus.emit('tether:attached',{actorId:player.id,targetId:b.id});};
addEventListener('keydown',e=>{if(e.target.matches('button')&&e.code==='Space')return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.repeat)return;
 if(e.code==='KeyC')hail();if(e.code==='Space')toggleTether();if(e.code==='KeyP'){paused=!paused;document.body.classList.toggle('paused',paused);}if(e.code==='KeyR')setView(view==='court'?'portrait':'court');});
addEventListener('keyup',e=>keys.delete(e.code));addEventListener('blur',()=>{keys.clear();release();paused=true;document.body.classList.add('paused');});
function setView(v){view=v;document.body.classList.toggle('court',v==='court');document.querySelector('#portrait').setAttribute('aria-pressed',v==='portrait');document.querySelector('#court').setAttribute('aria-pressed',v==='court');
 help.textContent=v==='court'?'WASD / arrows · thrust     SHIFT · brake     C · hail / cancel     SPACE · tether / release     P · pause':'An old sorter who built himself something worth protecting.';
 quote.textContent=v==='court'?'Scan BRACKET with C to begin. Five shots. Three goals wins. Push the ball, or spring-tether it and release.':'“One small goal. An unreasonable amount of universe. Still worth defending.”';
 if(v==='portrait'){camera.position.set(42,61,66);camera.lookAt(0,2,0);}else{camera.position.set(100,290,260);camera.lookAt(0,0,-6);} }
document.querySelector('#portrait').onclick=()=>setView('portrait');document.querySelector('#court').onclick=()=>setView('court');document.querySelector('#motion').onclick=()=>{reduced=!reduced;document.querySelector('#motion').setAttribute('aria-pressed',String(reduced));};
setView('portrait');
function tick(){
 const dt=1/60;state.simTime+=dt;state.tick++;
 const ax=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0),az=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0),brake=keys.has('ShiftLeft')||keys.has('ShiftRight');
 writePhysicsControl(player,{source:'bracket-bench-input',mode:'piloted',maxSpeed:100,force:{x:ax*1400-player.vel.x*(brake?220:8),y:0,z:az*1400-player.vel.z*(brake?220:8)}});
 const b=sys._entity('ball');if(state.player.tether.active&&b){const dx=b.pos.x-player.pos.x,dz=b.pos.z-player.pos.z,d=Math.hypot(dx,dz);if(d>150)release();else if(d>18){const f=Math.min(4000,(d-18)*180+(b.vel.x-player.vel.x)*dx/d*25+(b.vel.z-player.vel.z)*dz/d*25);if(f>0){queuePhysicsImpulse(b,{x:-dx/d*f*dt,z:-dz/d*f*dt});queuePhysicsImpulse(player,{x:dx/d*f*dt,z:dz/d*f*dt});}}}
 else if(state.player.tether.active)release();
 sys.update(dt,state);physics.syncFromEntities(state.entityList);physics.step(dt);for(const p of physics.drainContactImpacts())bus.emit('collision',p);
}
function draw(){
 const live=new Set();for(const e of state.entityList){if(!e.data?.bracketPart)continue;live.add(e.id);let root=visuals.get(e.id);if(!root){root=buildBracketVisual(e);freezeStaticChildMatrices(root);visuals.set(e.id,root);scene.add(root);}
  root.visible=view==='court'||e.data.bracketPart==='keeper';root.position.set(e.pos.x-C.anchor.x,0,e.pos.z-C.anchor.z+(view==='portrait'?-C.keeperZ:0));root.rotation.y=-e.rot;
  root.userData.updateAuthoredMotion(e,state.simTime,{reducedMotion:reduced,reducedFlash:reduced});
 }
 for(const[id,root]of visuals)if(!live.has(id)){disposeBracketVisual(root);visuals.delete(id);}
 tug.visible=view==='court';tug.position.set(player.pos.x-C.anchor.x,0,player.pos.z-C.anchor.z);const sp=Math.hypot(player.vel.x,player.vel.z);if(sp>1)tug.rotation.y=Math.atan2(-player.vel.x,-player.vel.z);
 const b=sys._entity('ball');tetherLine.visible=view==='court'&&!!b&&state.player.tether.active;if(tetherLine.visible){const a=tetherGeo.attributes.position;a.setXYZ(0,player.pos.x-C.anchor.x,1,player.pos.z-C.anchor.z);a.setXYZ(1,b.pos.x-C.anchor.x,1,b.pos.z-C.anchor.z);a.needsUpdate=true;}
 score.textContent=view==='court'?`SHOT ${sys._round || '–'} / 5  ·  GOALS ${sys._score}\n${sys._phase.toUpperCase()}${sys._phase==='play'?' · '+Math.ceil(sys._until-state.simTime)+'s':''}`:'CAST IRON / GOOD INTENTIONS';
 renderer.render(scene,camera);
}
let last=performance.now(),acc=0;function frame(now){const dt=Math.min(.1,(now-last)/1000);last=now;if(!paused){acc+=dt;let n=0;while(acc>=1/60&&n++<6){tick();acc-=1/60;}}draw();requestAnimationFrame(frame);}requestAnimationFrame(frame);
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
window.__bracketBench={ready:true,view:setView,hail,snapshot:()=>({phase:sys._phase,score:sys._score,round:sys._round,memory:sys.serialize(),tick:state.tick,entities:state.entityList.length,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,events:events.slice(-8)}),
 pose(name){const e=sys._entity('keeper');e.data.bracketPose={...e.data.bracketPose,gesture:name,gestureAt:state.simTime,awake:true};paused=true;draw();},step(n=1){for(let i=0;i<Math.min(n,3600);i++)tick();draw();},get paused(){return paused;},set paused(v){paused=!!v;}};
