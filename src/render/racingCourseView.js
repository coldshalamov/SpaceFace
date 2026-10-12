// Authored circuit presentation: real vertical apertures, route line and a visible pace beacon.
// Presentation consumes the mission owner's truth; all course markers are non-colliding.
import * as THREE from 'three';
import { activeAuthoredRace, racingPaceSpeed } from '../systems/racingSteer.js';
import { circuitPacePoint, gateApproach } from '../systems/racingGeometry.js';
import { raceGateGlobals } from '../data/raceLevels.js';
import { readFrameOrigin } from './frameCoordinates.js';
import { createRacingGhostView } from './racingGhostView.js';
import { createRacingDraftView } from './racingDraftView.js';

export function createRacingCourseView(scene, state) {
  const ghost = createRacingGhostView(scene, state);
  const draft = createRacingDraftView(scene, state);
  const root = new THREE.Group(); root.name = 'Racing course'; root.visible = false;
  scene.add(root);
  const ringGeometry = new THREE.TorusGeometry(1, 0.024, 6, 48);
  const ringMaterial = new THREE.MeshBasicMaterial({ color:0xffffff, toneMapped:false });
  const nextMaterial = new THREE.MeshBasicMaterial({ color:0xffe4a8, toneMapped:false });
  const lineMaterial = new THREE.LineBasicMaterial({ color:0x567485, toneMapped:false });
  const paceMaterial = new THREE.MeshBasicMaterial({ color:0xffe956, toneMapped:false });
  const paceGeometry = new THREE.ConeGeometry(7, 22, 4);
  const target = new THREE.Mesh(ringGeometry, nextMaterial); target.name='Next checkpoint';
  const pace = new THREE.Mesh(paceGeometry, paceMaterial); pace.name='Draft pace beacon';
  const markers=new THREE.InstancedMesh(ringGeometry,ringMaterial,8);
  markers.name='Massline anchors and crossing refuges';markers.count=0;markers.frustumCulled=false;
  root.add(target, pace, markers);
  const dummy = new THREE.Object3D(), origin = {}, from = {}, pacePoint = {};
  const up = new THREE.Vector3(0,1,0), forward = new THREE.Vector3();
  const base = new THREE.Color(0x90b2c8), cleared = new THREE.Color(0x3c515c), burn = new THREE.Color(0xffe956);
  const anchorColor=new THREE.Color(0x8adccf),refugeColor=new THREE.Color(0xffc577);
  const markerState=new Float64Array(8*4);markerState.fill(NaN);
  let owner = null, rings = null, line = null, globals = null, sectorX = 0, sectorZ = 0, lastGate = -1, lastLap = -1, disposed=false;
  let markerCount=0,markersChanged=false;
  function putMarker(point,radius,anchor){
    const offset=markerCount*4,x=point.x-sectorX,z=point.z-sectorZ,y=anchor?4:-2;
    if(markerState[offset]!==x||markerState[offset+1]!==z||markerState[offset+2]!==radius||markerState[offset+3]!==y){
      markerState[offset]=x;markerState[offset+1]=z;markerState[offset+2]=radius;markerState[offset+3]=y;
      dummy.position.set(x,y,z);dummy.rotation.set(-Math.PI/2,0,0);dummy.scale.setScalar(radius);
      dummy.updateMatrix();markers.setMatrixAt(markerCount,dummy.matrix);
      markers.setColorAt(markerCount,anchor?anchorColor:refugeColor);markersChanged=true;
    }
    markerCount++;
  }
  function releaseCourse() {
    if(rings){root.remove(rings);rings.dispose();rings=null;}
    if(line){root.remove(line);line.geometry.dispose();line=null;}
    owner=null;globals=null;
  }
  function rebuild(params) {
    releaseCourse(); owner=params;
    const gates=params.gates;
    globals=raceGateGlobals(params);
    if(!Array.isArray(gates)||gates.length<2||globals.length!==gates.length)return;
    sectorX=globals[0].x-gates[0].x; sectorZ=globals[0].z-gates[0].z;
    const count=Math.min(128,params.closedCircuit?gates.length-1:gates.length);
    const radius=Number(params.gateRadiusWU)||90;
    rings=new THREE.InstancedMesh(ringGeometry,ringMaterial,count);rings.name='Checkpoint apertures';
    for(let i=0;i<count;i++){
      const approach=gateApproach(gates,i,from);
      if(!approach)continue;
      dummy.position.set(gates[i].x,0,gates[i].z);
      dummy.rotation.set(0,Math.atan2(approach.nx,approach.nz),0);
      dummy.scale.setScalar(radius);dummy.updateMatrix();rings.setMatrixAt(i,dummy.matrix);
      rings.setColorAt(i,i===params.boostGateIndex?burn:base);
    }
    rings.instanceMatrix.needsUpdate=true;rings.computeBoundingSphere();root.add(rings);
    const vertices=new Float32Array(Math.min(128,gates.length)*3);
    for(let i=0;i<vertices.length/3;i++){vertices[i*3]=gates[i].x;vertices[i*3+1]=-3;vertices[i*3+2]=gates[i].z;}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(vertices,3));
    line=new THREE.Line(geometry,lineMaterial);line.name='Circuit racing line';root.add(line);
    lastGate=lastLap=-1;
  }
  return {
    root,
    frame(){
      if(disposed)return;
      const race=activeAuthoredRace(state);
      ghost.frame(race);
      draft.frame(race);
      root.visible=!!race&&state.mode==='flight'&&!state.ui?.docked
        &&state.world?.currentSectorId===race.params.courseSectorId
        &&(!race.params.sectionMission||race.params.phase!=='handoff');
      if(!root.visible)return;
      const p=race.params;
      if(owner!==p)rebuild(p);
      if(!rings||!globals){root.visible=false;return;}
      readFrameOrigin(state,origin);root.position.set(sectorX-origin.x,0,sectorZ-origin.z);
      markerCount=0;markersChanged=false;
      for(const cue of p.raceSetPieces||[]){
        const anchor=cue.kind==='anchor',point=cue.phase==='clear'?null:anchor?cue.pos:cue.waitPos;
        if(!point||markerCount===8)continue;
        putMarker(point,anchor?38:cue.waitRadiusWU||42,anchor);
        if(cue.servicePos&&markerCount<8&&cue.phase!=='clear'){
          putMarker(cue.servicePos,Math.min(40,(cue.serviceWidthWU||80)/2),true);
        }
      }
      markers.count=markerCount;
      if(markersChanged){markers.instanceMatrix.needsUpdate=true;if(markers.instanceColor)markers.instanceColor.needsUpdate=true;}
      const next=Math.max(0,Math.min(p.gates.length-1,p.nextGate|0));
      if(next!==lastGate||(p.lap|0)!==lastLap){
        lastGate=next;lastLap=p.lap|0;
        for(let i=0;i<rings.count;i++)rings.setColorAt(i,i===p.boostGateIndex?burn:i<next?cleared:base);
        rings.instanceColor.needsUpdate=true;
        const approach=gateApproach(p.gates,next,from),g=p.gates[next];
        target.position.set(g.x,0,g.z);
        if(approach)target.rotation.set(0,Math.atan2(approach.nx,approach.nz),0);
        target.scale.setScalar((Number(p.gateRadiusWU)||90)*1.005);
      }
      // The scripted pace light coaches the line; physical opponents alone provide drafting.
      const paceStart=p.adventureSpeedId?p.adventureSpeedStartSimS:p.raceStartSimS;
      const racing=Number.isFinite(paceStart)&&(!p.sectionMission||p.phase==='chase');
      pace.visible=racing&&p.racingKind==='draft';
      if(pace.visible&&circuitPacePoint(globals,Math.max(0,(state.simTime||0)-paceStart)*racingPaceSpeed(p)+70,pacePoint)){
        pace.position.set(pacePoint.x-sectorX,0,pacePoint.z-sectorZ);
        forward.set(Math.cos(pacePoint.heading),0,Math.sin(pacePoint.heading));
        pace.quaternion.setFromUnitVectors(up,forward);
      }
    },
    dispose(){
      if(disposed)return;disposed=true;ghost.dispose();draft.dispose();releaseCourse();root.removeFromParent();
      markers.dispose();
      ringGeometry.dispose();paceGeometry.dispose();ringMaterial.dispose();nextMaterial.dispose();lineMaterial.dispose();paceMaterial.dispose();
    },
  };
}
