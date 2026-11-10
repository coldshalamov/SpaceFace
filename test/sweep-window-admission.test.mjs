import test from 'node:test';
import assert from 'node:assert/strict';
import { tickLivedVignettes } from '../src/systems/livedWorldDirector.js';
import { SWEEP_WINDOW_ID, SWEEP_WINDOW_LANE as L } from '../src/systems/sweepWindowRuntime.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
function fixture() {
 FIELD_FLAGS.enabled=true;
 const player={id:1,alive:true,pos:{x:L.start.x+100,z:L.start.z},vel:{x:0,z:0}};
 const state={mode:'flight',timeScale:1,simTime:20,meta:{seed:113},playerId:1,player,
  entities:new Map([[1,player]]),entityList:[player],world:{currentSectorId:'sector_eris_margin'},
  encounterDirector:{live:{},stats:{fired:0},lastAmbientAt:-100}};
 const requests=[];let field=true;
 const director={requestAuthoredEncounter(p){requests.push(p);state.encounterDirector.stats.fired++;return {ok:true};}};
 const runtime={state,registry:{get:n=>n==='encounterDirector'?director:n==='fields'?{hasExternal:()=>field}:null}};
 return {state,requests,runtime,player,field(v){field=v;},tick(){runtime._livedScanAt=null;tickLivedVignettes(runtime);}};
}
test('ordinary first-hour nearby Eris visit requests the real sweep at its authored lane',()=>{
 const f=fixture();f.tick();assert.equal(f.requests.length,1);assert.equal(f.requests[0].shapeId,SWEEP_WINDOW_ID);
 assert.deepEqual(f.requests[0].anchor,L.start);assert.equal(f.state.encounterDirector.stats.livedStarted[SWEEP_WINDOW_ID],20);
});
for(const reason of ['far','disabled','unregistered','paused','other_sector','docked','busy','started','seen'])test(reason+' cannot admit Sweep Window',()=>{
 const f=fixture();
 if(reason==='far')f.player.pos.x+=2000;
 if(reason==='disabled')FIELD_FLAGS.enabled=false;
 if(reason==='unregistered')f.field(false);
 if(reason==='paused')f.state.timeScale=0;
 if(reason==='other_sector')f.state.world.currentSectorId='sector_helios';
 if(reason==='docked')f.player.flags={docked:true};
 if(reason==='busy')f.state.encounterDirector.live.other={};
 if(reason==='started')f.state.encounterDirector.stats.livedStarted={[SWEEP_WINDOW_ID]:0};
 if(reason==='seen')f.state.encounterDirector.stats.livedSeen={[SWEEP_WINDOW_ID]:'a'};
 f.tick();assert.equal(f.requests.filter(p=>p.shapeId===SWEEP_WINDOW_ID).length,0);
});
test('interrupted or completed saved attempt cannot replay on ordinary return',()=>{
 for(const completed of [false,true]){
  const f=fixture();f.tick();
  if(completed)f.state.encounterDirector.stats.livedSeen={[SWEEP_WINDOW_ID]:'a'};
  const stats=JSON.parse(JSON.stringify(f.state.encounterDirector.stats));
  const returning=fixture();returning.state.simTime=200;returning.state.encounterDirector.stats=stats;returning.tick();
  assert.equal(returning.requests.filter(p=>p.shapeId===SWEEP_WINDOW_ID).length,0);
 }
});

