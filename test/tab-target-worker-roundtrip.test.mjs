import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createUiInput } from '../src/ui/input.js';
import { cycleTarget, targetNearestHostileToPlayer } from '../src/ui/uiRoot.js';
import { laneCommandSink, uninstallSimCommandSink, installSimCommandSink, laneTargetWritePending } from '../src/core/simLaneCommands.js';

class Target { constructor(){this.listeners=new Map();} addEventListener(type,fn){const a=this.listeners.get(type)||[];a.push(fn);this.listeners.set(type,a);} removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(x=>x!==fn));} dispatch(type,event){for(const fn of this.listeners.get(type)||[])fn(event);} }
const contract=JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'));

test('real Tab input targets a live site through the production worker and main mirror',async()=>{
 const host=createSimHost(),main=createGameState(47),bus=createBus(),posts=[];let receive,lane,input;
 const oldDoc=globalThis.document,oldWin=globalThis.window;
 const doc=new Target(),win=new Target();doc.documentElement={classList:{add(){},remove(){}}};doc.body={tagName:'BODY',style:{}};doc.activeElement=doc.body;doc.getElementById=()=>null;win.getComputedStyle=()=>({display:'block',visibility:'visible',opacity:'1'});
 const asWorker=async fn=>{const sink=laneCommandSink();uninstallSimCommandSink();try{return await fn()}finally{if(sink)installSimCommandSink(sink)}};
 try{
  lane=createSimLaneRuntime({state:main,bus,registry:{},helpers:{},flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',channelFactory:()=>({onMessage(fn){receive=fn},post(msg){posts.push(msg)},terminate(){}})});
  const init=posts.shift(),ready=await asWorker(()=>host.init({...init,scenarioContract:contract}));receive(structuredClone({kind:'ready',seq:init.seq,...ready}));await lane.readyPromise;
  const {state,runtime}=host.host;state.mode='flight';state.world.currentSectorId='sector_ceres_belt';
  const player=runtime.spawn({type:'ship',isPlayer:true,team:0,hull:100,hullMax:100,pos:{x:0,z:0},data:{defId:'ship_kestrel',fittings:[],intent:{},ai:{}}});state.playerId=player.id;
  const site=runtime.spawn({type:'wreck',team:0,hull:100,hullMax:100,pos:{x:200,z:0},data:{worldSiteTargetable:true,name:'test site'}});
  const first=await asWorker(()=>host.tick({tick:1,steps:0,commands:[],generation:0}));receive(structuredClone({kind:'clockTick',...first,clockSequence:1}));
  assert.equal(main.playerId,player.id);assert.ok(main.entities.has(site.id));
  globalThis.document=doc;globalThis.window=win;
  const manager={isOpen:()=>false,pushScreen(){},popScreen(){},top:()=>null,getActiveScreenDef:()=>null};
  bus.on('ui:cycleTarget',p=>cycleTarget(main,p.dir,bus));input=createUiInput({state:main,bus,registry:{get:()=>null}},manager);
  const pressTab=()=>doc.dispatch('keydown',{key:'Tab',code:'Tab',target:doc.body,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,repeat:false,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){}});
  pressTab();
  // The normal quiet refresh can arrive before the worker's target reply.
  targetNearestHostileToPlayer(main,bus,{quiet:true});
  let seq=1;const flush=async()=>{for(let i=0;i<12;i++){
   const msg=posts.shift();if(!msg)break;
   if(msg.kind==='clockCommand'){
    const reply=await asWorker(()=>host.tick({...msg,kind:'tick',tick:++seq}));receive(structuredClone({kind:'clockTick',...reply,clockSequence:seq,commandSequence:msg.commandSequence}));
   }
  }};
  await flush();
  assert.equal(state.player.targetId,site.id,'Tab reaches the authoritative target owner');
  assert.equal(main.player.targetId,site.id,'the resulting target returns to the player');
  pressTab(); targetNearestHostileToPlayer(main,bus,{quiet:true}); await flush();
  assert.equal(state.player.targetId,null,'the next Tab still explicitly frees aim');
  assert.equal(main.input.targetAssistDisabled,true,'quiet auto-target stays disabled after explicit clear');
  pressTab();
  assert.equal(laneTargetWritePending(main),true);
  site.occupantGeneration++;
  await flush();
  assert.equal(state.player.targetId,null,'a delayed input cannot select a recycled worker-side occupant');
  main.entities.get(site.id).occupantGeneration=site.occupantGeneration;
  assert.equal(laneTargetWritePending(main),false,'a new occupant does not inherit a pending choice');
 }finally{input?.dispose();lane?.close();host.shutdown();globalThis.document=oldDoc;globalThis.window=oldWin;}
});
