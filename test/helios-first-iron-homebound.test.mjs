import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { missions } from '../src/systems/missions.js';
import { mining } from '../src/systems/mining.js';
import { scanner } from '../src/systems/scanner.js';
import { economy } from '../src/systems/economy.js';
import { cargo, addCargo, removeCargo, sellableCargoQuantity } from '../src/systems/cargo.js';
import { world } from '../src/systems/world.js';
import { dockingCorridor } from '../src/systems/dockingCorridor.js';
import { contactHailAvailability, createContactHailOffer, createContactHailResponse } from '../src/data/contactHail.js';
import { firstIronContactIdentity } from '../src/data/heliosFirstIronContact.js';
import { resolveAutopilotTarget } from '../src/core/flight/flightPresentationReads.js';
import { createDockIntent } from '../src/core/dockIntent.js';
import { commitDockedUiState } from '../src/ui/dockStateCommit.js';
const SECTOR = 'sector_helios_prime', STATION = 'station_helios', IRON = 'cmdty_ore_iron';
const distance = (a,b) => Math.hypot(a.x-b.x,a.z-b.z);

test('hail imports independently and uses the same canonical cargo readers as the cargo owner', async () => {
  const { execFileSync } = await import('node:child_process');
  const hailUrl = new URL('../src/data/contactHail.js', import.meta.url).href;
  // A normal simulation-first import hides cycles that break a standalone hail entry point.
  execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(hailUrl)})`], { timeout: 30000 });
  const owner = await import('../src/systems/cargo.js'), reads = await import('../src/systems/cargoReadModel.js');
  for (const name of ['isPersistentCargo', 'reservedCargoQuantity', 'sellableCargoQuantity',
    'reservedCargoQty', 'sellableCargoQty', 'isUnsellableCargo', 'releasableContractUnits']) {
    assert.equal(owner[name], reads[name], name);
  }
});

function prepare(state, owner, spawn, player) {
  state.mode = 'flight'; state.world.currentSectorId = SECTOR; state.ui.screenStack = [];
  state.playerId = player.id;
  state.player.ownedShips = [{ defId: 'ship_kestrel', fittings: ['mod_drill_amp', 'mod_mining_laser_s'] }];
  state.player.activeShipIndex = 0; state.onboarding = { active: false, finished: true };
  const job = owner.ensureBoard(STATION).slots.find(m => m.params?.starterJobId === 'starter_hitch');
  assert.ok(job); assert.equal(owner.acceptMission(job.id), true);
  const worker = spawn({ type: 'ship', team: 2, pos: { x: 100, z: -100 }, radius: 12, mass: 40,
    hull: 100, hullMax: 100, data: { ai: { passive: true }, trafficRole: 'miner',
      activityActorSlotId: 'helios_seam_miner', worldRecordId: 'homebound-worker', jobId: 'job:homebound-worker' } });
  state.npcJobs = { byId: { 'job:homebound-worker': { entityId: worker.id, worldRecordId: 'homebound-worker',
    job: { id: 'job:homebound-worker', kind: 'miner', materialized: true } } } };
  const station = spawn({ type: 'station', pos: { x: -300, z: 0 }, radius: 42, mass: 1e6,
    hull: 1e6, hullMax: 1e6, homeSectorId: SECTOR,
    data: { stationId: STATION, stationTypeId: 'trade_hub', dockRadius: 90,
      collisionRadius: 42, collisionProxy: 'station_ring_hub', corridorBearingDeg: 0,
      placeScale: 90/14, services: ['trade'], sectorId: SECTOR, homeSectorId: SECTOR } });
  state.player.targetId = worker.id;
  return { worker, station, mission: state.missions.active.find(m => m.params?.starterJobId === 'starter_hitch') };
}
function fixture() {
  const sim = createSimulation({ seed: 73319, systems: [missions, scanner, economy, cargo], updateOrder: [] });
  const { state, bus } = sim, player = sim.spawn({ type: 'ship', isPlayer: true, team: 0,
    pos: { x: 0, z: 0 }, radius: 10, mass: 30, hull: 100, data: {} });
  const scene = prepare(state, sim.registry.get('missions'), spec => sim.spawn(spec), player);
  sim.registry.get('economy').populateSector({ sectorId: SECTOR });
  return { sim, state, bus, player, ...scene, close: () => sim.dispose() };
}
function complete(f) {
  f.bus.emit('mining:yield', { minerId: f.player.id, commodityId: IRON, qty: 2, pos: { x:450,z:0 } });
  assert.equal(f.mission.status, 'completed');
  return f.state.missions.receipts.find(r=>r.missionId===f.mission.id);
}
const offer = f => createContactHailOffer(f.state, contactHailAvailability(f.state), 'iron-homebound', f.state.simTime + 8);
const reply = (f, o = offer(f)) => createContactHailResponse(f.state, o, 'route');

async function mountHails(f,{radial=false}={}){
 const {fakeDom}=await import('./helpers/fake-dom.mjs');
 const {createContactHailPrompt}=await import('../src/ui/contactHailPrompt.js');
 const {createCommsRadial}=await import('../src/ui/commsRadial.js');
 const doc=fakeDom(),listeners=new Map(),old=globalThis.document;
 const make=tag=>{
  const e=doc._make(tag),keys=new Map();
  e.querySelector=selector=>{const key=/^\[data-k="([^"]+)"\]$/.exec(selector)?.[1];if(!key)return null;if(!keys.has(key)){const child=make('div');e.appendChild(child);keys.set(key,child);}return keys.get(key);};
  e.removeChild=child=>{const i=e.children.indexOf(child);if(i>=0)e.children.splice(i,1);child.parentNode=null;};
  e.remove=()=>e.parentNode?.removeChild(e);
  e.replaceChildren=(...rows)=>{for(const child of [...e.children])e.removeChild(child);e.append(...rows);};
  e.contains=other=>e===other||e.children.some(x=>x.contains(other));
  e.focus=()=>{doc.activeElement=e;};e.removeEventListener=()=>{};
  e.closest=selector=>selector==='[data-choice]'&&e.dataset.choice?e:null;
  e.getBoundingClientRect=()=>{const left=Number.parseFloat(e.style.left)||0,top=e.dataset.choice?e.parentNode.children.filter(x=>x.dataset.choice).indexOf(e)*46:(Number.parseFloat(e.style.top)||0);return{left,top,width:180,height:40,right:left+180,bottom:top+40};};
  Object.defineProperty(e,'isConnected',{get:()=>doc.body?.contains(e)||doc.head.contains?.(e)||false});
  return e;
 };
 doc.createElement=make;doc.createElementNS=(_,tag)=>make(tag);doc.body=make('body');
 const root=make('div');root.id='ui-root';doc.body.appendChild(root);
 const headLookup=doc.getElementById;
 doc.getElementById=id=>id==='ui-root'?root:root.children.find(e=>e.id===id)||headLookup(id);
 doc.addEventListener=(type,fn)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);};
 doc.removeEventListener=(type,fn)=>listeners.get(type)?.delete(fn);
 doc.key=(key,code=key,type='keydown')=>{const ev={key,code,preventDefault(){this.defaultPrevented=true;},stopPropagation(){}};for(const fn of listeners.get(type)||[])fn(ev);return ev;};
 globalThis.document=doc;
 const gamepad={isConnected:()=>true,axes:{leftX:0,leftY:0},actions:{accept:{pressed:false}}};
 const ui=radial?createCommsRadial({state:f.state,bus:f.bus,gamepad}):createContactHailPrompt({state:f.state,bus:f.bus});
 return {doc,ui,root,gamepad,close(){ui.destroy();globalThis.document=old;}};
}


test('first-ticket completion and actually held free iron unlock an optional buyer course, never a second payday', () => {
  const f = fixture(); try {
    const grants=[]; f.bus.on('economy:grantCredits', e=>grants.push(e));
    complete(f); assert.equal(firstIronContactIdentity(f.state,f.worker),null,'cut credit is not cargo');
    addCargo(f.state,IRON,3);
    const unchanged=()=>JSON.stringify([f.state.player,f.state.missions,f.state.npcJobs,f.state.entityList]);
    const before=unchanged(), o=offer(f), r=reply(f,o);
    assert.deepEqual(o.actions.map(a=>a.label),['STATUS','IDENTIFY','MARK IRON BUYER']);
    assert.equal(r.firstIronCourse.phase,'homebound');
    assert.equal(r.firstIronCourse.targetEntityId,f.station.id);
    assert.deepEqual(r.firstIronCourse.pos,{x:f.station.pos.x,z:f.station.pos.z});
    assert.equal(r.firstIronCourse.autopilot,false);
    assert.match(r.lines.join(' '),/3u unsealed iron.*Market.*separate from your ticket pay/);
    assert.equal(unchanged(),before); assert.equal(grants.length,1); assert.equal(grants[0].amount,420);
  } finally { f.close(); }
});

test('buyer advice requires the exact completion, current cargo, live single destination and an unfinished first workday', () => {
  const changes=[f=>f.state.missions.receipts=[], f=>f.state.missions.receipts[0].outcome='failed',
    f=>f.state.missions.receipts[0].sourceOfferId='starter-starter_hitch-2',
    f=>f.state.missions.receipts[0].source='ordinary', f=>f.state.missions.receipts[0].at_s=1,
    f=>f.state.missions.receipts.push({...f.state.missions.receipts[0]}),
    f=>f.state.missions.starterJobStep.starter_hitch=2,
    f=>f.state.missions.active.push({id:'next',status:'active',params:{starterJobId:'starter_hitch',starterStep:2}}),
    f=>removeCargo(f.state,IRON,3), f=>f.state.fixtureSealed=[IRON],
    f=>f.station.alive=false, f=>f.station.data.stationId='station_ceres',
    f=>f.station.homeSectorId='sector_ceres_belt', f=>f.station.occupantGeneration++,
    f=>f.sim.spawn({type:'station',pos:{x:200,z:0},data:{stationId:STATION}}),
    f=>f.state.world.enterSerial=1, f=>f.worker.occupantGeneration++,
    f=>f.state.ui.docked=true, f=>f.state.save={restoring:true}];
  for(const change of changes){const f=fixture();try{
    complete(f); addCargo(f.state,IRON,3); const o=offer(f); change(f);
    assert.equal(reply(f,o),null,String(change));
  }finally{f.close();}}
});

test('partial reservations describe only free units, and replaying a sale cannot retain buyer advice', () => {
  const f=fixture();try{
    complete(f);addCargo(f.state,IRON,5);
    f.state.missions.active.push({id:'sealed',status:'active',type:'cargo_delivery',params:{cmdtyId:IRON,qty:2,preloadedCargo:true},preloadedCargo:true});
    const free=sellableCargoQuantity(f.state,IRON);assert.equal(free,3);
    assert.match(reply(f).lines.join(' '),/3u unsealed/);
    f.state.ui.docked=true;f.state.ui.dockedStationId=STATION;
    const econ=f.sim.registry.get('economy'), q=econ.quote(STATION,IRON,'sell',free);
    const sold=econ.execute(STATION,IRON,'sell',free,{expectedTotal:q.total,intentId:'first-iron-sale'});
    assert.equal(sold.ok,true);assert.equal(sellableCargoQuantity(f.state,IRON),0);
    const credits=f.state.player.credits;
    assert.equal(econ.execute(STATION,IRON,'sell',free,{intentId:'first-iron-sale'}).duplicate,true);
    assert.equal(f.state.player.credits,credits);
    f.state.ui.docked=false;assert.equal(firstIronContactIdentity(f.state,f.worker),null);
  }finally{f.close();}
});

test('mounted pointer, keyboard and radial gamepad mark the real buyer once with autopilot off', async () => {
  for(const mode of ['pointer','Digit3','radial']){
    const f=fixture();let m,prompt;try{
      complete(f);addCargo(f.state,IRON,2);m=await mountHails(f,{radial:mode==='radial'});
      const courses=[];f.bus.on('ui:setCourse',c=>{courses.push(c);world._onSetCourse.call({state:f.state,bus:f.bus},c);});
      if(mode==='radial'){
        const {createContactHailPrompt}=await import('../src/ui/contactHailPrompt.js');
        prompt=createContactHailPrompt({state:f.state,bus:f.bus});
        m.doc.key('Alt','AltLeft'); m.gamepad.axes.leftY=1;m.ui.tick();m.gamepad.axes.leftY=0;m.ui.tick();
        m.gamepad.axes.leftY=1;m.ui.tick();m.gamepad.axes.leftY=0;m.ui.tick();
        assert.equal(m.doc.activeElement.dataset.choice,'route');m.gamepad.actions.accept.pressed=true;m.ui.tick();
      }else{
        f.bus.emit('contactHail:availability',contactHailAvailability(f.state));m.ui.request();
        if(mode==='pointer'){
          const panel=m.ui.el.querySelector('[data-k="panel"]'), button=panel.querySelector('[data-k="actions"]').children[2];
          for(const fn of panel.listeners.click)fn({target:button});
        }else m.doc.key('3','Digit3');
      }
      assert.equal(courses.length,1);assert.equal(f.state.nav.autopilot.active,false);
      assert.equal(f.state.nav.waypoint.targetEntityId,f.station.id);
      assert.equal(f.state.nav.waypoint.stable.entityId,f.station.id);
      const target=resolveAutopilotTarget(f.state,f.state.nav.autopilot);
      assert.equal(target.entity,f.station);assert.ok(['berth','corridor-mouth'].includes(target.dockingStage));
    }finally{prompt?.destroy();m?.close();f.close();}
  }
});

test('delayed homebound replies cannot overwrite newer courses or survive sale, receipt removal, destination replacement, Close or load', async () => {
  const changes=[f=>f.bus.emit('ui:setCourse',{pos:{x:9,z:9}}),f=>removeCargo(f.state,IRON,2),
    f=>f.state.missions.receipts=[], f=>f.station.occupantGeneration++,
    (f,m)=>m.ui.hide(),f=>f.bus.emit('save:loaded'),f=>f.bus.emit('game:load')];
  for(const change of changes){const f=fixture();let m;try{
    complete(f);addCargo(f.state,IRON,2);m=await mountHails(f);
    const o=offer(f),r=reply(f,o),courses=[];f.bus.emit('contactHail:offer',o);change(f,m);
    f.bus.on('ui:setCourse',c=>courses.push(c));f.bus.emit('contactHail:response',r);assert.equal(courses.length,0,String(change));
  }finally{m?.close();f.close();}}
});

const freeIronChanges = [
  { name: 'partial removal', apply: f => removeCargo(f.state, IRON, 1), held: 1, free: 1 },
  { name: 'partial reservation', apply: f => f.state.missions.active.push({ id: 'new-seal', status: 'active',
    type: 'cargo_delivery', preloadedCargo: true, params: { cmdtyId: IRON, qty: 1, preloadedCargo: true } }), held: 2, free: 1 },
  { name: 'additional pickup', apply: f => addCargo(f.state, IRON, 1), held: 3, free: 3 },
];
const homeboundOwnedState = f => JSON.stringify([f.state.player.cargo, f.state.player.credits,
  f.state.missions, f.state.npcJobs]);

test('buyer offers reject changed positive free-iron quantities without restoring removed or reserved stock', () => {
  for (const change of freeIronChanges) {
    const f = fixture(); try {
      complete(f); addCargo(f.state, IRON, 2);
      const old = offer(f); change.apply(f);
      assert.equal(f.state.player.cargo.items[IRON], change.held, change.name);
      assert.equal(sellableCargoQuantity(f.state, IRON), change.free, change.name);
      const before = homeboundOwnedState(f);
      assert.equal(reply(f, old), null, `${change.name}: reject the outdated offer before creating a reply`);
      const fresh = reply(f);
      assert.equal(fresh.firstIronCourse.freeIronQuantity, change.free, change.name);
      assert.ok(fresh.lines.some(line => line.includes(`${change.free}u unsealed iron`)), change.name);
      assert.equal(homeboundOwnedState(f), before, `${change.name}: advice cannot repair or consume cargo`);
    } finally { f.close(); }
  }
});

test('queued buyer replies reject partial removal, reservation or pickup and a fresh Hail marks the actual remaining load', async () => {
  for (const change of freeIronChanges) {
    const f = fixture(); let m; try {
      complete(f); addCargo(f.state, IRON, 2); m = await mountHails(f);
      f.bus.on('ui:setCourse', c => world._onSetCourse.call({ state: f.state, bus: f.bus }, c));
      f.bus.emit('ui:setCourse', { pos: { x: 9, z: 9 }, sectorId: SECTOR, autopilot: false });
      const previousNavigation = JSON.stringify(f.state.nav);
      const old = offer(f), queued = reply(f, old), courses = [];
      assert.ok(queued.lines.some(line => line.includes('2u unsealed iron')));
      f.bus.emit('contactHail:offer', old); change.apply(f);
      assert.equal(f.state.player.cargo.items[IRON], change.held, change.name);
      assert.equal(sellableCargoQuantity(f.state, IRON), change.free, change.name);
      const before = homeboundOwnedState(f);
      f.bus.on('ui:setCourse', c => courses.push(c)); f.bus.emit('contactHail:response', queued);
      assert.equal(courses.length, 0, `${change.name}: no stale course`);
      assert.equal(JSON.stringify(f.state.nav), previousNavigation, `${change.name}: preserve the player's course`);
      const lines = m.ui.el.querySelector('[data-k="panel"]').querySelector('[data-k="lines"]');
      assert.match(lines.children.map(row => row.textContent).join(' '), /COURSE NOT MARKED/);
      assert.doesNotMatch(lines.children.map(row => row.textContent).join(' '), /2u unsealed iron/);
      assert.equal(homeboundOwnedState(f), before, `${change.name}: reject without changing stock or reservations`);
      const fresh = createContactHailOffer(f.state, contactHailAvailability(f.state), 'renewed-homebound', f.state.simTime + 8);
      f.bus.emit('contactHail:offer', fresh); f.bus.emit('contactHail:response', reply(f, fresh));
      assert.equal(courses.length, 1, `${change.name}: a fresh choice succeeds`);
      assert.equal(courses[0].targetEntityId, f.station.id);
      assert.equal(courses[0].autopilot, false);
      assert.ok(courses[0].reason.includes(`${change.free}u unsealed iron`), change.name);
      assert.equal(homeboundOwnedState(f), before, `${change.name}: current advice is read-only too`);
    } finally { m?.close(); f.close(); }
  }
});

test('restored canonical receipts and cargo reoffer directions without a new ledger or reward',()=>{
  const f=fixture();try{
    complete(f);addCargo(f.state,IRON,2);
    const before=reply(f).firstIronCourse,credits=f.state.player.credits;
    f.state.missions=JSON.parse(JSON.stringify(f.state.missions));
    f.state.player.cargo=JSON.parse(JSON.stringify(f.state.player.cargo));
    f.bus.emit('save:loaded');
    assert.deepEqual(reply(f).firstIronCourse,before);assert.equal(f.state.player.credits,credits);
  }finally{f.close();}
});

test('production cutter marks the actual world-owned Helios buyer through scanner and navigation owners', async () => {
  const { createAuthoritativeRuntime } = await import('../src/runtime/createAuthoritativeRuntime.js');
  const { makeShipEntitySpec } = await import('../src/systems/ships.js');
  const { snapshotFeatureMaps, restoreFeatureMaps, applyFeatureConfigToMaps } = await import('../src/data/featureFlags.js');
  const flags = snapshotFeatureMaps(), runtime = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 73319 });
  applyFeatureConfigToMaps(runtime.config.features);
  let mounted;
  try {
    const state = runtime.state, owner = runtime.getSystem('missions'), worldOwner = runtime.getSystem('world');
    state.mode = 'flight'; state.ui.screenStack = []; runtime.getSystem('ships').newGame();
    const player = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 } }));
    state.playerId = player.id; worldOwner.enterSector(SECTOR); state.onboarding = { active: false, finished: true };
    const ticket = owner.ensureBoard(STATION).slots.find(m => m.params?.starterJobId === 'starter_hitch');
    assert.equal(owner.acceptMission(ticket.id), true);
    const worker = state.entityList.find(e => e.alive && e.data?.activityActorSlotId === 'helios_seam_miner');
    const station = state.entityList.find(e => e.alive && e.type === 'station' && e.data?.stationId === STATION);
    assert.ok(worker); assert.ok(station);
    worldOwner.relocatePlayerInSector({ x: worker.pos.x - 160, z: worker.pos.z }, { reason: 'homebound-admission-fixture' });
    state.player.targetId = worker.id;
    // This is admission into a populated production world; the native route below proves earning this state.
    runtime.bus.emit('mining:yield', { minerId: player.id, commodityId: IRON, qty: 2, pos: { ...player.pos } });
    addCargo(state, IRON, 2);
    mounted = await mountHails({ state, bus: runtime.bus });
    const before = JSON.stringify([state.player.cargo, state.player.credits, state.missions, state.npcJobs]);
    const courses = []; runtime.bus.on('ui:setCourse', course => courses.push(course));
    runtime.bus.emit('contactHail:availability', contactHailAvailability(state));
    mounted.ui.request(); mounted.doc.key('3', 'Digit3');
    assert.equal(courses.length, 1); assert.equal(courses[0].targetEntityId, station.id);
    assert.equal(state.nav.autopilot.active, false);
    const destination = resolveAutopilotTarget(state, state.nav.autopilot);
    assert.equal(destination.entity, station); assert.ok(['berth', 'corridor-mouth'].includes(destination.dockingStage));
    assert.equal(JSON.stringify([state.player.cargo, state.player.credits, state.missions, state.npcJobs]), before);
    console.log('FIRST_IRON_HOMEBOUND_PRODUCTION', JSON.stringify({ worker: worker.data.worldRecordId,
      buyer: station.data.stationId, buyerId: station.id, entities: state.entityList.length,
      dressing: state.world.dressing?.rows.length, dockingStage: destination.dockingStage }));
  } finally { mounted?.close(); runtime.dispose(); restoreFeatureMaps(flags); }
});

test('native first cut, scoop, cutter directions and manual return end in one separate ordinary iron sale',
  { timeout: 120000 }, async () => {
  const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');
  const h=await bootRealPath({seed:73319,systems:[missions,scanner,mining,cargo,economy,dockingCorridor,'flightV3','physics'],
    hulls:[{hullId:'ship_kestrel',isPlayer:true,pos:{x:0,z:0},rot:0}]});
  let mounted;
  try{
    const s=h.state,scene=prepare(s,h.runtime.getSystem('missions'),spec=>h.runtime.spawn(spec),h.player);
    const f={state:s,bus:h.bus,player:h.player,...scene};
    const rock=h.runtime.spawn({type:'asteroid',pos:{x:450,z:0},radius:25,mass:200,hull:60,hullMax:60,
      physicsBody:{dynamic:false,radius:25},data:{typeId:'ast_common_rock',oreHP:60,oreHPMax:60,yieldU:30}});
    const econ=h.runtime.getSystem('economy');econ.populateSector({sectorId:SECTOR});
    const grants=[],hits=[],yields=[],ranges=[];
    h.bus.on('economy:grantCredits',p=>grants.push(p));
    h.bus.on('physics:impact',p=>{if([p.aId,p.bId].includes(h.player.id))hits.push(p);});
    h.bus.on('mining:yield',p=>yields.push(p));h.bus.on('dock:range',p=>ranges.push(p));
    h.bus.on('ui:setCourse',c=>world._onSetCourse.call({state:s,bus:h.bus},c));
    mounted=await mountHails(f);
    const choose=()=>{h.bus.emit('contactHail:availability',contactHailAvailability(s));mounted.ui.request();mounted.doc.key('3','Digit3');};
    const steer=pos=>{
      const p=h.player,dx=pos.x-p.pos.x,dz=pos.z-p.pos.z,scale=Math.min(.5,30/Math.max(1,Math.hypot(dx,dz)));
      const ax=(dx*scale-p.vel.x)*.12,az=(dz*scale-p.vel.z)*.12,co=Math.cos(p.rot),sn=Math.sin(p.rot);
      writeRealPathInput(s,{moveZ:ax*co+az*sn,moveX:-ax*sn+az*co});h.step(1);
    };
    choose();const fix={...s.nav.waypoint.pos};
    for(let i=0;i<3600;i++){steer(fix);if(distance(h.player.pos,fix)<4&&Math.hypot(h.player.vel.x,h.player.vel.z)<2)break;}
    assert.ok(distance(h.player.pos,fix)<4);
    for(let i=0;i<1200&&(!sellableCargoQuantity(s,IRON)||scene.mission.status==='active');i++){
      writeRealPathInput(s,{brake:true});s.input.fireGroup=2;s.input.aimAngle=Math.atan2(rock.pos.z-h.player.pos.z,rock.pos.x-h.player.pos.x);h.step(1);
    }
    s.input.fireGroup=0;
    assert.equal(scene.mission.status,'completed');assert.ok(sellableCargoQuantity(s,IRON)>0,'actual ore reaches cargo through mining/cargo owners');
    assert.ok(yields.some(p=>p.minerId===h.player.id&&p.commodityId===IRON));
    const held=sellableCargoQuantity(s,IRON),earnedAt=s.simTime,creditsAfterTicket=s.player.credits;
    choose();assert.equal(s.nav.waypoint.targetEntityId,scene.station.id);assert.equal(s.nav.autopilot.active,false);
    let traveled=0,prev={...h.player.pos};
    for(let i=0;i<7200;i++){
      const target=resolveAutopilotTarget(s,s.nav.autopilot);assert.equal(target.entity,scene.station);
      steer(target);traveled+=distance(h.player.pos,prev);prev={...h.player.pos};
      if(ranges.at(-1)?.stationId===STATION&&ranges.at(-1)?.inRange)break;
    }
    assert.ok(ranges.some(p=>p.stationId===STATION&&p.inRange),JSON.stringify({pos:h.player.pos,target:resolveAutopilotTarget(s,s.nav.autopilot),ranges}));
    assert.ok(traveled>300);assert.equal(hits.length,0,JSON.stringify(hits));
    assert.equal(s.player.credits,creditsAfterTicket,'manual return pays nothing');
    const payload=createDockIntent(s,{stationId:STATION});assert.equal(commitDockedUiState(s,payload,h.bus),true);
    const qty=sellableCargoQuantity(s,IRON),stock=econ.state.economy.markets[STATION][IRON].stock;
    const q=econ.quote(STATION,IRON,'sell',qty);assert.equal(q.ok,true);
    const result=econ.execute(STATION,IRON,'sell',qty,{expectedTotal:q.total,intentId:'homebound-native-sale'});
    assert.equal(result.ok,true);assert.equal(result.qty,qty);
    assert.equal(s.player.cargo.items[IRON]||0,0);assert.equal(s.economy.markets[STATION][IRON].stock,stock+qty);
    assert.equal(s.player.credits,creditsAfterTicket+result.total);
    assert.equal(econ.execute(STATION,IRON,'sell',qty,{intentId:'homebound-native-sale'}).duplicate,true);
    assert.equal(s.player.credits,creditsAfterTicket+result.total);
    assert.equal(grants.filter(p=>p.amount===420&&p.reason.startsWith('mission:')).length,1);
    assert.equal(s.player.tradeLedger.filter(r=>r.commodityId===IRON&&r.side==='sell').length,1);
    console.log('FIRST_IRON_HOMEBOUND_NATIVE',JSON.stringify({cutAndScoopAt:earnedAt,homeAt:s.simTime,returnTravel:traveled,
      heldAtDeparture:held,sold:qty,saleCredits:result.total,contacts:hits.length,missionAwards:grants.length,
      dockRange:ranges.at(-1),backend:h.proof?.backend}));
  }finally{mounted?.close();h.dispose();}
});
