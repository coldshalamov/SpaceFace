import assert from 'node:assert/strict';
import test from 'node:test';
import {createGameState} from '../src/core/gameState.js';
import {galaxyMapScreen,resolveMapOpenTarget,resolveGalaxyMapPrimaryAction} from '../src/ui/galaxyMap.js';

function fixture(){
  const state=createGameState(4242);
  state.world.currentSectorId='sector_helios_prime';
  const player={id:1,type:'ship',alive:true,pos:{x:0,z:0},data:{}};
  state.playerId=player.id;state.entities.set(player.id,player);state.entityList=[player];
  const mission={id:'m-recovery',status:'active',type:'salvage_retrieval',storyTag:'campaign47a:b0:recovery',
    destSectorId:'sector_helios_prime',destStationId:'station_helios',
    params:{contractId:'47-A',sampleRecovered:false,samplePos:{x:658,z:-236}}};
  state.missions.active=[mission];state.ui.trackedMissionId=mission.id;
  state.nav.waypoint={kind:'local',label:'Player course',pos:{x:37,z:91}};
  const intent={focus:'local',selectionTarget:'47a-recovery-fix',missionId:mission.id,
    sectorId:mission.destSectorId,pos:{...mission.params.samplePos}};
  return{state,mission,intent};
}

function paint(state,selected,solveNavigation=false){
  const text=[];
  const gradient={addColorStop(){}};
  const g=new Proxy({globalAlpha:1,measureText:t=>({width:String(t).length*7}),
    createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    fillText:t=>text.push(String(t)),strokeText(){}},{get:(o,k)=>k in o?o[k]:()=>{}});
  const chart=Object.create(galaxyMapScreen);
  Object.assign(chart,{_ctx:{state},_selectedTarget:selected,_clickTargets:[],_pointer:null,_hoverTarget:null,
    _line:null,_hold:null,_lock:null,_scanRings:[],_iris:null,_lastReadingRect:null,_previewPts:[],
    _reduceMotion:true,_animT:0,_canvas:{setAttribute(){}},
    _layers:{route:true,mission:true,holdings:false,faction:false,discovery:false},
    _cams:{local:{cx:0,cy:0,zoom:1}},
    _localModelForState:()=>({contacts:[],ownership:[],bearings:[]}),
    _clearField:()=>({x:0,y:0,width:1000,height:800}),_drawSensorLattice(){},_drawLocalPreview(){},_drawEdgeScale(){},
    _placeLabels:candidates=>candidates.map(c=>({...c,visible:true})),
  });
  if(solveNavigation){
    delete chart._placeLabels;
    chart._clearFieldCache={veilRight:300};
  }
  chart._drawLocal(g,state,1000,800);
  return{chart,text};
}

test('inspected recovery fix has its own painted marker while the manual course remains active',()=>{
  const{state,intent}=fixture(), course=state.nav.waypoint;
  const selected=resolveMapOpenTarget(state,intent);
  assert.equal(selected.id,'mission-fix:m-recovery');
  assert.equal(selected.missionFix,true);
  const{chart,text}=paint(state,selected);
  const fix=chart._clickTargets.find(t=>t.id===selected.id);
  const manual=chart._clickTargets.find(t=>t.id==='active-waypoint');
  assert.deepEqual({x:fix.x,z:fix.z,name:fix.name},{x:658,z:-236,name:'47-A Recovery Site'});
  assert.deepEqual({x:manual.x,z:manual.z,name:manual.name},{x:37,z:91,name:'Player course'});
  assert.ok(text.some(t=>t.includes('MISSION · 47-A RECOVERY SITE')),'native paint path prints recovery name');
  assert.ok(text.some(t=>t.includes('GOAL · PLAYER COURSE')),'active course keeps its own goal caption');
  assert.equal(state.nav.waypoint,course);
  assert.deepEqual(state.nav.waypoint.pos,{x:37,z:91});
  const action=resolveGalaxyMapPrimaryAction(state,fix);
  assert.deepEqual(action.coursePayload.pos,{x:658,z:-236});
  assert.equal(state.nav.waypoint,course,'reading the Plot action does not arm it');
});

test('draw seats both recovery and armed course captions beyond the rail veil',()=>{
  const{state,intent}=fixture(),course=state.nav.waypoint;
  const{chart}=paint(state,resolveMapOpenTarget(state,intent),true);
  for(const id of ['objective:mission-fix:m-recovery','objective:active-waypoint']){
    const label=chart._lastLabelLayout.find(item=>item.id===id);
    assert.ok(label?.visible,`${id} remains visible`);
    assert.ok(label.x>=304,`${id} clears the veil`);
  }
  assert.equal(state.nav.waypoint,course);
});

test('accepted or withdrawn owner fixes cannot keep a stale inspected recovery marker',()=>{
  for(const change of [m=>{m.params.sampleRecovered=true;},m=>{m.status='completed';}]){
    const{state,mission,intent}=fixture(), selected=resolveMapOpenTarget(state,intent),course=state.nav.waypoint;
    change(mission);
    const{chart,text}=paint(state,selected);
    assert.equal(chart._clickTargets.some(t=>t.id===selected.id),false);
    assert.equal(text.some(t=>t.includes('MISSION · 47-A RECOVERY SITE')),false);
    assert.ok(chart._clickTargets.some(t=>t.id==='active-waypoint'));
    assert.equal(state.nav.waypoint,course);
  }
});

test('an authoritative same-field re-mark moves the inspected fix without moving the manual course',()=>{
  const{state,mission,intent}=fixture(), selected=resolveMapOpenTarget(state,intent),course=state.nav.waypoint;
  mission.params.samplePos={x:700,z:-260};
  const{chart}=paint(state,selected);
  const fix=chart._clickTargets.find(t=>t.id===selected.id);
  assert.deepEqual({x:fix.x,z:fix.z},{x:700,z:-260});
  assert.deepEqual({x:chart._selectedTarget.x,z:chart._selectedTarget.z},{x:700,z:-260});
  assert.equal(chart._inspectorPending,true);
  assert.equal(state.nav.waypoint,course);
  assert.deepEqual(state.nav.waypoint.pos,{x:37,z:91});
});
