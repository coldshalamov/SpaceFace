import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../src/core/eventBus.js';
import { fakeDom } from './helpers/fake-dom.mjs';
import { bindFortifyReadiness, fortifyReadiness } from '../src/ui/swarmFortifyReadiness.js';
import { crucibleDraftScreen, crucibleRefitScreen } from '../src/ui/screens/crucibleDraft.js';

const run = () => ({ kind: 'survival', ruleset: 'swarm', phase: 'draft', wave: 2, seed: 4242, credits: 0 });
const turret = extra => ({ deviceId: 'kinetic_turret', hull: 220, hullMax: 220,
  ammo: 32, ammoMax: 32, serviceCost: 0, repairCost: 42, operational: true, ...extra });
const model = (requestId, extra = {}) => ({ requestId, runToken: 22, phase: 'draft', wave: 2,
  structures: [turret()], ...extra });
function binding() {
 const bus = createBus(), button = fakeDom().createElement('button'), screen = { _fortifyBtn: button };
 const state = { run: run() }, commands=[];
 bus.on('swarm:fortifyStateRequested', p => commands.push(p));
 const ctx = { bus, state }; bindFortifyReadiness(screen,ctx);
 return { bus, screen, state, button, commands, ctx, request: () => commands.at(-1).requestId };
}

test('empty magazine is visible before launch and uses the real service quote, even with no purse',()=>{
 const h=binding(); h.bus.emit('swarm:fortifyState',model(h.request(),{structures:[turret({ammo:0,serviceCost:64})]}));
 assert.equal(h.button.textContent,'Fortify · service needed');
 assert.match(h.button.getAttribute('aria-label'),/0 of 32 shots, reload 64 cr/);
 assert.match(h.button.getAttribute('title'),/purchases are optional/);
 assert.equal(h.state.run.credits,0);h.screen._fortifyReadinessOff();
});

test('used ammunition, hull damage and lost Tesla endpoint remain distinct',()=>{
 assert.equal(fortifyReadiness({structures:[turret({ammo:21,serviceCost:22})]}).label,'Fortify · restock');
 const damaged=fortifyReadiness({structures:[turret({hull:111.2})]});
 assert.equal(damaged.label,'Fortify · service needed');assert.match(damaged.detail,/hull 112 of 220, repair 42 cr/);
 const pair=fortifyReadiness({structures:[{deviceId:'tesla_pair',missingEndpoint:true,operational:false,hull:44,hullMax:90,repairCost:36}]});
 assert.match(pair.detail,/one endpoint lost/);assert.doesNotMatch(pair.detail,/repair 36/);
 assert.equal(fortifyReadiness({structures:[turret()]}).label,'Fortify · 1 device');
 assert.equal(fortifyReadiness({structures:[turret(),turret()]}).label,'Fortify · 2 devices');
});

test('unknown, empty and unavailable models never fabricate a readiness claim',()=>{
 for(const value of [null,{}, {structures:[]},{structures:[null,{deviceId:'invented'}]}])assert.equal(fortifyReadiness(value).label,'Fortify the field');
 const malformed=fortifyReadiness({structures:[turret({ammo:NaN,serviceCost:-5,hull:NaN})]});
 assert.doesNotMatch(malformed.detail,/NaN|-5/);
 const h=binding();
 for(const changes of [{requestId:'other'}, {wave:3}, {phase:'active'}, {runToken:null}])h.bus.emit('swarm:fortifyState',model(h.request(),{structures:[turret({ammo:0})],...changes}));
 assert.equal(h.button.textContent,'Fortify the field');h.screen._fortifyReadinessOff();
});

test('only the current owner life can update the cue after service',()=>{
 const h=binding();h.bus.emit('swarm:fortifyState',model(h.request(),{structures:[turret({ammo:0,serviceCost:64})]}));
 h.bus.emit('swarm:fortifyBuildResolved',{runToken:21,readModel:model(10)});
 h.bus.emit('swarm:fortifyBuildResolved',{runToken:22,readModel:model(10,{runToken:21})});
 assert.equal(h.button.textContent,'Fortify · service needed');
 h.bus.emit('swarm:fortifyBuildResolved',{runToken:22,readModel:model(10)});
 assert.equal(h.button.textContent,'Fortify · 1 device');h.screen._fortifyReadinessOff();
});

test('reopen has a new query and hidden, old-round and old-run replies stay silent',()=>{
 const h=binding(),old=h.request();h.screen._fortifyReadinessOff();
 h.bus.emit('swarm:fortifyState',model(old));assert.equal(h.button.textContent,'Fortify the field');
 bindFortifyReadiness(h.screen,h.ctx);assert.notEqual(old,h.request());
 h.bus.emit('swarm:fortifyState',model(old));assert.equal(h.button.textContent,'Fortify the field');
 h.state.run={...h.state.run,wave:3};h.bus.emit('swarm:fortifyState',model(h.request()));assert.equal(h.button.textContent,'Fortify the field');
 h.state.run=run();bindFortifyReadiness(h.screen,h.ctx);const pending=h.request();h.bus.emit('run:started',{});
 h.bus.emit('swarm:fortifyState',model(pending));assert.equal(h.button.textContent,'Fortify the field');
 bindFortifyReadiness(h.screen,h.ctx);h.bus.emit('swarm:fortifyState',model(h.request()));h.bus.emit('run:ended',{});
 assert.equal(h.button.textContent,'Fortify the field');h.screen._fortifyReadinessOff();
});

test('non-Swarm, pre-round and active screens do not query the build owner',()=>{
 const h=binding();h.screen._fortifyReadinessOff();const before=h.commands.length;
 for(const changes of [{ruleset:'scored'},{wave:0},{phase:'active'},{kind:'adventure'}]){
 h.state.run={...run(),...changes};bindFortifyReadiness(h.screen,h.ctx);
 assert.equal(h.commands.length,before);
 }
});

for(const definition of [crucibleDraftScreen,crucibleRefitScreen])test(`${definition.id} visible lifecycle binds one service query and tears it down`,()=>{
 const previous=globalThis.document;globalThis.document=fakeDom();
 const h=binding();h.screen._fortifyReadinessOff();
 const screen=Object.create(definition);screen._fortifyBtn=h.button;screen._ctx=h.ctx;
 screen.refresh=()=>{};screen._regions=null;
 try {
 screen.onShow(h.ctx);const query=h.request();
 h.bus.emit('swarm:fortifyState',model(query,{structures:[turret({ammo:0,serviceCost:64})]}));
 assert.equal(h.button.textContent,'Fortify · service needed');
 screen.onHide();h.bus.emit('swarm:fortifyState',model(query));assert.equal(h.button.textContent,'Fortify the field');
 screen.onShow(h.ctx);assert.notEqual(query,h.request());screen.dispose();
 h.bus.emit('swarm:fortifyState',model(h.request()));assert.equal(h.button.textContent,'Fortify the field');
 } finally {screen._fortifyReadinessOff?.();globalThis.document=previous;}
});

test('mounted Armory exposes the service cue on the existing inspection button, not a purchase',()=>{
 const saved=globalThis.document,doc=fakeDom();globalThis.document=doc;
 const bus=createBus(),events=[],state={run:run(),player:{ownedShips:[]}};
 const owner={currentOffers:()=>[],currentWave:()=>2,lastNotice:()=>null,rerollState:()=>null,recommendedOffers:()=>[]};
 const ctx={state,bus,registry:{get:name=>name==='survivalDraft'?owner:null},screenManager:{top:()=> 'crucibleDraft'}};
 let query;bus.on('swarm:fortifyStateRequested',p=>query=p);
 for(const name of ['ui:pushScreen','swarm:fortifyBuildRequested','swarm:fortifyReloadRequested','swarm:fortifyRepairRequested','run:draftPickRequested'])bus.on(name,p=>events.push({name,p}));
 const screen=Object.create(crucibleDraftScreen);
 try {
  screen.mount(doc.createElement('section'),ctx);screen.onShow(ctx);assert.ok(query);
  bus.emit('swarm:fortifyState',model(query.requestId,{structures:[turret({ammo:0,serviceCost:64})]}));
  assert.equal(screen._fortifyBtn.textContent,'Fortify · service needed');
  screen._fortifyBtn.click();
  assert.deepEqual(events,[{name:'ui:pushScreen',p:{id:'crucibleFortify'}}]);
  assert.equal(state.run.credits,0);assert.equal(state.run.phase,'draft');
  screen.onHide();assert.equal(screen._fortifyBtn.textContent,'Fortify the field');
 }finally{screen.dispose();globalThis.document=saved;}
});

test('lost device is distinct from an empty field and is never quoted as a repair',()=>{
 const summary=fortifyReadiness({structures:[],lostDevices:[{deviceId:'kinetic_turret',socketId:'port-near',wave:2}]});
 assert.equal(summary.label,'Fortify · 1 lost');assert.match(summary.detail,/Kinetic Turret lost at Port corridor · inner/);
 assert.doesNotMatch(summary.detail,/reload|repair \d/);
 assert.equal(fortifyReadiness({structures:[],lostDevices:[{deviceId:'fake',socketId:'port-near'}]}).label,'Fortify the field');
});
