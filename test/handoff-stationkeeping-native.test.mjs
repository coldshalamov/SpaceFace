// Focused native-physics proof, not production-manifest or player-journey evidence.
// Only initial spawn assigns poses/velocities; subsequent movement belongs to Rapier.
// Radius-2 synthetic carriers isolate authority, not actual MTS hull clearance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { isCalendarTick } from '../src/core/catchupPolicy.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { spawnJettisonedCargoPod } from '../src/systems/lootShards.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem, PRODUCTION_ENEMY_MIND_CONFIG } from '../src/systems/tacticalAI.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';
import { runtime } from '../src/data/encounters/357-the-handoff.js';

async function boot(passing) {
  const sim = createSimulation({ seed: 357, systems: [flightV3, physics] });
  const { state } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  Object.assign(state.input, { moveX: 0, moveZ: 0, turnIntent: 0, brake: !passing,
    boost: false, fire: false, assistMode: 'drift' });
  const ship = (x, z, vx = 0) => sim.spawn({ type: 'ship', team: 0,
    pos: { x, z }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0,
    radius: 2, mass: 100, hull: 100, hullMax: 100, collides: true,
    physicsBody: { mass: 100, radius: 2, dynamic: true },
    data: { intent: {}, ai: {} } });
  const seller = ship(32, 0), buyer = ship(-32, 0);
  const player = ship(passing ? -138 : 132, 80, passing ? 60 : 0);
  state.playerId = player.id;
  const events = [], pods = [], received = [], observations = [], contacts = new Map(), initial = new Map();
  sim.bus.on('physics:impact', p => { const key=[p.aId,p.bId].sort().join(':');
    const row=contacts.get(key)||{a:p.aId,b:p.bId,count:0,first:state.simTime,last:0};
    row.count++;row.last=state.simTime;contacts.set(key,row); });
  const live = { id: 'native_handoff', shape: {}, ids: [seller.id, buyer.id], roles: {}, data: {},
    plan: { zoneCenter: { x: 0, z: 0 }, ships: [{ role: 'hauler', pos: {} }, { role: 'raider', pos: {} }] } };
  const d = { now: () => state.simTime, stream: () => () => .5,
    spawnShips: (_, ships) => {
      // Apply authored initial spawn positions before Rapier adopts any bodies.
      for (const spec of ships) Object.assign((spec.role === 'hauler' ? seller : buyer).pos, spec.pos);
      return live.ids;
    }, aliveCount: () => 1,
    entsOf: (_, role) => [role === 'hauler' ? seller : buyer],
    spawnCargoPod: (_, spec) => { const p = spawnJettisonedCargoPod(state, spec, sim.helpers); pods.push(p); return p; },
    say() {}, emit: (name, p) => events.push({ name, ...p }),
    rep: (faction, delta) => events.push({ name: 'rep', faction, delta }),
    grant: (amount, reason) => events.push({ name: 'grant', amount, reason }),
    player: () => player,
    resolve: (_, outcome) => { live.outcome = outcome; live.phase = 'done'; } };
  runtime.fire(d, live, state);
  for (const e of [player, seller, buyer, ...pods]) initial.set(e.id, { ...e.pos });
  const phys = sim.registry.get('physics');
  assert.equal(await phys.prepareBackend(state), true);
  // Natural director update pumps new encounters before ticking live scripts in that pass.
  const observe = () => { observations.push(state.simTime); runtime.tick(d, live, state, state.simTime); };
  observe();
  let lastCalendarNow = 0, accumulated = 0;
  const advance = () => {
    sim.step(1 / 60);
    // Observe native publication before runtime can overwrite projected velocity again.
    for (const r of received) if (r.native.length < 6) {
      const p = state.entities.get(r.id);
      r.native.push({ t: state.simTime, x: p.pos.x, z: p.pos.z,
        relativeSpeed: Math.hypot(p.vel.x-buyer.vel.x,p.vel.z-buyer.vel.z),
        relativeDisplacement: Math.hypot((p.pos.x-buyer.pos.x)-r.rx,(p.pos.z-buyer.pos.z)-r.rz) });
    }
    const before = new Set(pods.filter(p => p.data.deliveredBy).map(p => p.id));
    if (isCalendarTick(state, 'encounterDirector')) {
      accumulated += Math.max(0, state.simTime-lastCalendarNow); lastCalendarNow=state.simTime;
      if (accumulated >= 1) { accumulated=0; observe(); }
    }
    for (const p of pods) if (p.data.deliveredBy && !before.has(p.id)) received.push({ id: p.id,
      t: state.simTime, distance: Math.hypot(p.pos.x-buyer.pos.x,p.pos.z-buyer.pos.z),
      rx: p.pos.x-buyer.pos.x, rz: p.pos.z-buyer.pos.z, native: [] });
  };
  return { sim, state, seller, buyer, player, events, pods, received, initial, live, advance, observations, contacts,
    close() { phys._disableSg02DynamicAuthority(); sim.dispose(); } };
}
const reward = h => h.events.filter(e => e.name === 'grant' || e.name === 'rep');
const speed = e => Math.hypot(e.vel.x, e.vel.z);

for (const passing of [true, false]) test(`native ${passing ? 'fly-through rejects custody' : 'settled hold bonds original cargo'} and native pod motion`, { timeout: 45000 }, async t => {
  const h = await boot(passing);
  try {
    let insideFast = 0, contiguousHold = 0, longestHold = 0, bondAt = null, bondPose = null;
    let directedDisplacement = null, deadlineObservedAt = null, dwellStart = h.live.data.parleySince;
    const snapshots = [];
    const snapshot = kind => ({ kind, time: h.state.simTime, outcome: h.live.outcome || null,
      bodies: [h.player,h.seller,h.buyer,...h.pods].map(e=>({ id:e.id, role:e===h.player?'player':e===h.seller?'seller':e===h.buyer?'buyer':'pod',
        x:e.pos.x,z:e.pos.z,ownerId:e.data?.ownerId??null,alive:e.alive!==false })) });
    let terminalCaptured = false;
    for (let i = 0; i < 6900; i++) {
      h.advance();
      if (h.live.data.parleySince != null) dwellStart = h.live.data.parleySince;
      if (deadlineObservedAt === null && h.observations.at(-1) >= h.live.deadlineAt) deadlineObservedAt=h.state.simTime;
      const relative = Math.hypot(h.player.vel.x-h.seller.vel.x, h.player.vel.z-h.seller.vel.z);
      const inside = Math.hypot(h.player.pos.x-h.seller.pos.x,h.player.pos.z-h.seller.pos.z) <= 210;
      if (inside && relative > 6.4) insideFast++;
      contiguousHold = inside && relative <= 6.4 ? contiguousHold+1 : 0;
      longestHold = Math.max(longestHold, contiguousHold);
      if (h.live.data.custodyCommit && bondAt === null) {
        bondAt = h.state.simTime;
        snapshots.push(snapshot('acceptance'));
        assert.notEqual(h.live.phase, 'done', 'player bond does not terminate NPC trade');
        assert.equal(h.live.ids.length, 2, 'original cast remains live');
        assert.ok(!h.seller.data.ai.forceFlee && !h.buyer.data.ai.forceFlee);
        const p = h.pods.find(p => p.id === h.live.data.custodyCommit.podId);
        bondPose = { x: p.pos.x, z: p.pos.z, toX: h.player.pos.x-p.pos.x, toZ: h.player.pos.z-p.pos.z };
      }
      if (bondPose && directedDisplacement === null && h.state.simTime-bondAt >= 2) {
        const p=h.pods.find(p=>p.id===h.live.data.custodyCommit.podId);
        directedDisplacement=((p.pos.x-bondPose.x)*bondPose.toX+(p.pos.z-bondPose.z)*bondPose.toZ)/Math.hypot(bondPose.toX,bondPose.toZ);
      }
      if (!terminalCaptured && h.live.phase === 'done') { terminalCaptured = true; snapshots.push(snapshot('terminal_receipt')); }
      if (deadlineObservedAt !== null && h.state.simTime-deadlineObservedAt >= .11) break;
    }
    const bonded = h.pods.filter(p => p.data.ownerId === h.player.id);
    const native = h.state.physicsRuntime.diagnostics.backend;
    const detail = { native, passing, snapshots, time: h.state.simTime, insideFast, longestHold, bondAt,
      outcome: h.live.outcome, observations:h.observations, dwellStart, deadlineObservedAt,
      contacts:[...h.contacts.values()], remaining:h.pods.filter(p=>p.data.ownerId===h.seller.id).map(p=>p.id),
      bondPose, directedDisplacement, player: { pos: h.player.pos, speed: speed(h.player) },
      received: h.received, rewards: reward(h), pods: h.pods.map(p => ({ id: p.id,
        pos: p.pos, speed: speed(p), owner: p.data.ownerId, displacement:
        Math.hypot(p.pos.x-h.initial.get(p.id).x,p.pos.z-h.initial.get(p.id).z) })) };
    t.diagnostic(JSON.stringify(detail));
    assert.equal(native, 'rapier-dynamic');
    assert.equal(h.pods.length, 4);
    assert.ok(h.pods.every(p => h.state.entities.get(p.id) === p && p.physicsBody && [p.pos.x,p.pos.z,p.vel.x,p.vel.z].every(Number.isFinite)), 'original physical bodies remain');
    assert.ok(h.pods.some(p => Math.hypot(p.pos.x-h.initial.get(p.id).x,p.pos.z-h.initial.get(p.id).z)>10), 'native pods move');
    assert.ok(h.received.length > 0, 'buyer physically receives original cargo');
    assert.ok(h.received.every(r => r.distance <= 26));
    if (passing) {
      assert.ok(insideFast >= 360, 'at least six actual native seconds pass inside ring above hold speed');
      assert.ok(h.player.pos.x-h.initial.get(h.player.id).x > 500, 'native player traverses the lane');
      assert.equal(bonded.length, 0); assert.deepEqual(reward(h), []);
      assert.equal(h.live.outcome, 'deal_done');
      assert.equal(h.received.length, 4);
      assert.ok(h.pods.every(p => p.data.ownerId === h.buyer.id));
    } else {
      assert.ok(longestHold >= 360); assert.ok(bondAt-dwellStart >= 6);
      assert.ok(h.observations.filter(t=>t>=dwellStart&&t<=bondAt).every((t,i,a)=>i===0||t-a[i-1]<=2));
      assert.equal(h.live.outcome, 'contact_made'); assert.equal(bonded.length, 1);
      assert.equal(h.received.length, 3, 'all remaining original pods physically received');
      assert.equal(h.pods.filter(p=>p.data.ownerId===h.seller.id).length, 0);
      assert.ok(h.received.some(r=>r.t>bondAt), 'NPC receipt continues after player bond');
      assert.ok(h.pods.filter(p=>p!==bonded[0]).every(p=>p.data.ownerId===h.buyer.id));
      assert.equal(h.live.ids.length, 0, 'cast released only at terminal outcome');
      assert.equal(bonded[0].id, h.live.data.custodyCommit.podId);
      assert.equal(bonded[0].data.amount, 2);
      assert.deepEqual(reward(h), [{name:'rep',faction:'faction_quiet',delta:2},
        {name:'grant',amount:60,reason:'handoff:quiet_lay'}]);
      assert.ok(directedDisplacement > 5, 'accepted native pod travels toward player during first two seconds after shove');
    }
    assert.equal(h.received[0]?.native.length, 6, 'observe six native ticks after first collision-free receipt');
    assert.ok(h.received[0].native.every(n => n.relativeSpeed < .05 && n.relativeDisplacement < .02),
      'received native pods match buyer velocity and park immediately after next-tick command consumption, before collisions');
  } finally { h.close(); }
});

// Actual production archetypes/native geometry, separate from the radius-2 authority
// fixture above. Forced authored admission is not natural ambient-frequency evidence.
async function bootActual({ bearing = null, passing = false } = {}) {
 const ai=createTacticalAISystem({config:{enemyMind:PRODUCTION_ENEMY_MIND_CONFIG}});
 const systems=[spawnBudget,aiPorts,ai,flightV3,physics];
 if(bearing===null)systems.push(encounterDirector);
 const sim=createSimulation({seed:357,systems}),{state}=sim;
 state.mode='flight';state.world.currentSectorId='sector_pallas_drift';
 Object.assign(state.input,{moveX:0,moveZ:0,turnIntent:0,brake:!passing,boost:false,fire:false,assistMode:'drift'});
 const playerSpec=makeShipEntitySpec('ship_kestrel',{isPlayer:true,team:0,pos:{x:passing?8860:9100,z:9080}});
 if(passing)playerSpec.vel={x:60,z:0}; // initial spawn only; native flight owns later motion
 const player=sim.spawn(playerSpec);state.playerId=player.id;
 const events=[];for(const name of ['encounter:resolved','economy:grantCredits','faction:repDelta'])
  sim.bus.on(name,p=>events.push({name,t:state.simTime,...p}));
 let live;
 if(bearing===null){
  const result=sim.registry.get('encounterDirector').requestAuthoredEncounter({shapeId:'off_book_handoff',
   encounterId:'real_cast_handoff',sectorId:'sector_pallas_drift',anchor:{x:9000,z:9000},
   zoneType:'outlaw_zone',zoneRadius:500,force:true});
  assert.equal(result.ok,true);live=Object.values(state.encounterDirector.live).find(l=>l.shapeId==='off_book_handoff');
 }else{
  let draw=0;const cast={};live={id:'clear_geometry',shape:{},ids:[],roles:{},data:{},
   plan:{zoneCenter:{x:9000,z:9000},ships:[{role:'hauler',pos:{}},{role:'raider',pos:{}}]}};
  const d={now:()=>0,stream:()=>()=>draw++===0?bearing:draw%2?0:1,
   spawnShips:(_,specs)=>{for(const spec of specs){const e=sim.spawn(makeEnemySpawnSpec('mule_trader',1,spec.pos,
    {factionId:spec.role==='hauler'?'faction_quiet':'faction_mts'}));e.team=2;cast[spec.role]=e;live.ids.push(e.id);}return live.ids;},
   aliveCount:()=>1,entsOf:(_,role)=>[cast[role]],
   spawnCargoPod:(_,spec)=>spawnJettisonedCargoPod(state,spec,sim.helpers),say(){},abort:(_,why)=>assert.fail(why)};
  runtime.fire(d,live,state);
 }
 assert.ok(live);const ids=[live.data.sellerId,live.data.buyerId,...live.data.pods];
 const originals=ids.map(id=>state.entities.get(id));
 const phys=sim.registry.get('physics');assert.equal(await phys.prepareBackend(state),true);
 return {sim,state,live,events,player,ids,originals,phys,
  close(){phys._disableSg02DynamicAuthority();sim.dispose();}};
}
function sceneContacts(h){
 const set=new Set(h.ids),rows=[];
 for(const id of h.ids)for(const row of h.phys._sg02.sampleSolidContacts(id))
  if(set.has(row.targetId))rows.push(row);
 return rows;
}
for(const bearing of [0,.125,.25,.375,.5,.625,.75,.875])
 test(`actual native hull/pod launch has no penetration at bearing ${bearing} and extreme jitter`,{timeout:45000},async t=>{
  const h=await bootActual({bearing});
  try{
   const [seller,buyer,...pods]=h.originals;
   assert.equal(seller.data.defId,'ship_mule');assert.equal(buyer.data.defId,'ship_mule');
   assert.equal(seller.radius,18);assert.equal(buyer.radius,18);
   assert.equal(pods.length,4);
   for(const p of pods){assert.equal(p.radius,3);assert.equal(p.data.amount,2);
    assert.ok(Math.hypot(p.pos.x-buyer.pos.x,p.pos.z-buyer.pos.z)>26);}
   h.sim.step(1/60);
   for(const actor of [seller,buyer]){
    const rec=h.phys._sg02.records.get(actor.id);assert.equal(rec.entity,actor);
    assert.ok(rec.colliders.length>0);
    for(const c of rec.colliders){assert.equal(c.shapeType(),9,'actual measured convex hull, not radius-2 substitute');
     const v=c.vertices();for(let i=0;i<v.length;i+=3)assert.ok(Math.hypot(v[i],v[i+2])<=18,'verified conservative planar hull envelope');}
   }
   const contacts=sceneContacts(h);
   t.diagnostic(JSON.stringify({bearing,t:h.state.simTime,contacts:contacts.map(r=>({a:r.sourceId,b:r.targetId,separation:r.separation,impulse:r.normalImpulse}))}));
   assert.equal(contacts.filter(r=>r.separation < -1e-4).length,0,'no initial native penetration between any original scene bodies');
  }finally{h.close();}
 });

for(const passing of [false,true])test(`actual director/native ${passing?'pass':'hold'} finishes original clear manifest`,{timeout:45000},async t=>{
 const h=await bootActual({passing});
 try{
  const snapshot=()=>({t:h.state.simTime,bodies:[h.player,...h.originals].map(e=>({id:e.id,x:e.pos.x,z:e.pos.z,owner:e.data?.ownerId}))});
  const initial=snapshot();
  let bondAt=null,terminalAt=null,accepted=null,terminal=null;
  const launchContacts=[];
  for(let i=0;i<6720;i++){
   h.sim.step(1/60);
   if(i<60)for(const r of sceneContacts(h))launchContacts.push({t:h.state.simTime,a:r.sourceId,b:r.targetId,separation:r.separation,impulse:r.normalImpulse});
   if(h.live.data.custodyCommit&&bondAt===null){bondAt=h.state.simTime;accepted=snapshot();}
   if(h.live.phase==='done'){terminalAt=h.state.simTime;terminal=snapshot();break;}
  }
  t.diagnostic(JSON.stringify({actualCast:true,passing,bondAt,terminalAt,outcome:h.live.outcome,initial,accepted,terminal,launchContacts}));
  assert.equal(launchContacts.filter(r=>r.separation < -1e-4).length,0,'actual admitted scene has no launch penetration throughout first native second');
  const [seller,buyer,...pods]=h.originals;
  assert.ok(h.originals.every(e=>h.state.entities.get(e.id)===e),'original bodies remain');
  assert.equal(h.live.outcome,passing?'deal_done':'contact_made');
  const grants=h.events.filter(e=>e.name==='economy:grantCredits'&&e.reason==='handoff:quiet_lay');
  const reps=h.events.filter(e=>e.name==='faction:repDelta'&&e.reason==='handoff_contact');
  const receipts=h.events.filter(e=>e.name==='encounter:resolved'&&e.encounterId===h.live.id);
  assert.equal(receipts.length,1);
  if(passing){assert.equal(bondAt,null);assert.equal(grants.length,0);assert.equal(reps.length,0);assert.ok(pods.every(p=>p.data.ownerId===buyer.id));}
  else{assert.ok(bondAt>=6);assert.ok(terminalAt>bondAt);
   assert.deepEqual(grants.map(e=>e.amount),[60]);assert.deepEqual(reps.map(e=>e.delta),[2]);
   assert.equal(pods.filter(p=>p.data.ownerId===h.player.id).length,1);
   assert.equal(pods.filter(p=>p.data.ownerId===buyer.id).length,3);}
  for(let i=0;i<120;i++)h.sim.step(1/60);
  assert.equal(h.events.filter(e=>e.name==='economy:grantCredits'&&e.reason==='handoff:quiet_lay').length,passing?0:1);

 }finally{h.close();}
});
