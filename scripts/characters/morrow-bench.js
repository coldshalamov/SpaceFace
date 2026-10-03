// Diagnostic only. Live gameplay is registered in the production manifest, never gated on this page.
import * as THREE from 'three';
import { buildMorrowVisual, disposeMorrowVisual } from '../../src/render/characters/morrowModel.js';
import { morrowEntitySpec } from '../../src/systems/morrow.js';

try {
 const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
 renderer.setSize(innerWidth,innerHeight);renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
 document.body.prepend(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x080e14);
 const camera=new THREE.PerspectiveCamera(36,innerWidth/innerHeight,.1,1500);
 camera.position.set(40,54,57);
 const target=new THREE.Vector3(-5,0,0), offset=new THREE.Vector3(), spherical=new THREE.Spherical();
 const controls={target,update(){camera.lookAt(target);},dispose(){}};
 let dragging=null;
 renderer.domElement.addEventListener('pointerdown',e=>{if(e.button!==0)return;dragging={x:e.clientX,y:e.clientY};renderer.domElement.setPointerCapture(e.pointerId);});
 renderer.domElement.addEventListener('pointerup',()=>{dragging=null;});
 renderer.domElement.addEventListener('pointercancel',()=>{dragging=null;});
 renderer.domElement.addEventListener('pointermove',e=>{if(!dragging)return;spherical.setFromVector3(offset.copy(camera.position).sub(target));
  spherical.theta-=(e.clientX-dragging.x)*.006;spherical.phi=Math.max(.08,Math.min(1.5,spherical.phi+(e.clientY-dragging.y)*.006));
  camera.position.copy(target).add(offset.setFromSpherical(spherical));dragging={x:e.clientX,y:e.clientY};controls.update();});
 renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();offset.copy(camera.position).sub(target);const r=Math.max(25,Math.min(360,offset.length()*Math.exp(e.deltaY*.001)));
  camera.position.copy(target).add(offset.setLength(r));controls.update();},{passive:false});
 scene.add(new THREE.HemisphereLight(0xadc8d6,0x292016,2));
 const key=new THREE.DirectionalLight(0xffe1b5,3.3);key.position.set(-12,35,22);scene.add(key);
 const fill=new THREE.DirectionalLight(0x77c3d0,2.1);fill.position.set(20,5,-25);scene.add(fill);
 const rim=new THREE.DirectionalLight(0xf3dcb3,2);rim.position.set(-28,3,-30);scene.add(rim);
 // Sparse, deterministic distant stars. No particles stand in for the character or its force field.
 const pts=[];for(let i=0;i<150;i++){const a=i*2.399963229728653;const r=100+((i*47)%190);pts.push(Math.cos(a)*r, -55+((i*37)%70),Math.sin(a)*r);}
 const starsGeo=new THREE.BufferGeometry();starsGeo.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
 const starsMat=new THREE.PointsMaterial({color:0x65838c,size:.3,sizeAttenuation:true});scene.add(new THREE.Points(starsGeo,starsMat));
 const entity=morrowEntitySpec();const pose=entity.data.morrowPose;pose.phase='idle';pose.awake=true;
 const root=buildMorrowVisual(entity);scene.add(root);
 let time=4,paused=false,reduced=false,wide=false,frameId=0,last=performance.now(),lost=false;
 const text={sleep:'“Still here. Still listening.”',idle:'“You are not debris. Good.”',armed:'“Wide arc. Keep moving. I will give the motion back.”',windup:'“There. Hold that curve.”',release:'“Go on. There is more sky.”',dance:'“Excellent. We are lost in a circle.”',shy:'“Please do not make me remember what that sound is.”'};
 function setPose(name){pose.phase=name==='dance'?'idle':name;pose.awake=name!=='sleep';pose.charge=name==='windup'?1:0;pose.sweep=name==='armed'?.6:1;
  pose.gesture=name==='dance'?'dance':'';pose.gestureAt=time;pose.launchAt=name==='release'?time:-100;pose.launchYaw=.7;
  document.getElementById('line').textContent=text[name];document.querySelectorAll('[data-pose]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pose===name)));
  if(name==='armed'||name==='windup'||name==='release')setWide(true);
 }
 function setWide(value){wide=value;camera.position.set(...(wide?[135,177,198]:[40,54,57]));controls.target.set(wide?-16:-5,0,0);controls.update();}
 const onResize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);};
 addEventListener('resize',onResize);
 document.querySelectorAll('[data-pose]').forEach(b=>b.addEventListener('click',()=>setPose(b.dataset.pose)));
 document.getElementById('wide').onclick=()=>setWide(!wide);
 document.getElementById('reduce').onclick=(e)=>{reduced=!reduced;e.currentTarget.setAttribute('aria-pressed',String(reduced));};
 document.getElementById('pause').onclick=(e)=>{paused=!paused;e.currentTarget.setAttribute('aria-pressed',String(paused));};
 renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;});
 renderer.domElement.addEventListener('webglcontextrestored',()=>{lost=false;});
 function frame(now){frameId=requestAnimationFrame(frame);const dt=Math.min(.05,(now-last)/1000);last=now;
  if(!paused)time+=dt;pose.gaze=.45+Math.sin(time*.23)*.8;
  root.userData.updateAuthoredMotion(entity,time,{reducedMotion:reduced,reducedFlash:reduced});controls.update();
  if(!lost)renderer.render(scene,camera);
 }
 frame(performance.now());
 let meshCount=0,triangleCount=0;root.traverse(o=>{if(o.isMesh){meshCount++;triangleCount+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
 document.getElementById('metrics').textContent=`${meshCount} MESHES · ${triangleCount.toLocaleString()} TRIANGLES`;
 window.morrowBench={renderer,scene,camera,root,entity,setPose,setWide,
  snapshot(t=8){time=t;paused=true;root.userData.updateAuthoredMotion(entity,time,{reducedMotion:reduced,reducedFlash:reduced});controls.update();renderer.render(scene,camera);},
  setReduced(v){reduced=v;},get time(){return time;},get paused(){return paused;},get reduced(){return reduced;},
  dispose(){cancelAnimationFrame(frameId);removeEventListener('resize',onResize);controls.dispose();disposeMorrowVisual(root);starsGeo.dispose();starsMat.dispose();renderer.dispose();}};
 addEventListener('pagehide',()=>window.morrowBench.dispose(),{once:true});
}catch(error){document.getElementById('error').textContent=error.stack||String(error);throw error;}
