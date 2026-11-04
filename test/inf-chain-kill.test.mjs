import assert from 'node:assert/strict';
import test from 'node:test';
import { chainKills, matchChainKill, CHAIN_KILL_WINDOW_S } from '../src/combat/chainKills.js';
import { projectBridgeEvent } from '../scripts/lib/simEventBridge.mjs';
import { fromAdventureTape } from '../src/presentation/momentMachine/ingest.js';
import { discoveryCommsPayload } from '../src/ui/comms.js';
import { currentChainWreckWitness } from '../src/combat/killCausality.js';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimLaneRuntime } from '../src/core/simLaneMain.js';
import { createGameState } from '../src/core/gameState.js';
import { readFileSync } from 'node:fs';
import { createBus } from '../src/core/eventBus.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { recordImpulseProvenance } from '../src/combat/impulseKernel.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { killReplay, adventureTapeRecording } from '../src/systems/killReplay.js';

function physicalShip(id, team) {
  return { id, occupantGeneration: 1, type: 'ship', alive: true, team,
    pos: {x: id * 12, z: 0}, prevPos: {x: id * 12, z: 0}, vel: {x: id === 2 ? 120 : 0, z: 0}, rot: 0, angVel: 0,
    radius: 8, mass: 20, hull: 1, hullMax: 1, armorHp: 0, armorMax: 0, armorFlat: 0, shield: 0, shieldMax: 0,
    cap: 100, capMax: 100, capRegen: 5, lastDamageT: -1e9, flags: {},
    data: {combatProfileId: 'combat_profile_standard_ship', derived: {damageReductionMult: 1, ramDamageDealtMult: 0}} };
}

test('real collision owner to combat deaths and chain reader: current-life contact only', () => {
  const previous = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const a = physicalShip(2, 1), b = physicalShip(3, 1), player = physicalShip(1, 0);
  const state = { tick: 120, simTime: 2, mode: 'flight', playerId: 1, player: {}, meta: {seed: 47},
    settings: {gameplay: {difficulty: 'standard'}, video: {particleQuality: 'low'}, accessibility: {}},
    content: {}, combat: {entities: {}, beams: []}, entities: new Map([[1, player], [2, a], [3, b]]), entityList: [player, a, b] };
  const bus = createBus();
  const deaths = [], chains = [], lines = [];
  bus.on('entity:killed', p => deaths.push(p));
  bus.on('combat:chainKill', p => chains.push(p));
  bus.on('comms:log', p => lines.push(p));
  const replay = Object.create(killReplay); replay.init({state, bus});
  const chain = Object.create(chainKills); chain.init({state, bus});
  const fighter = Object.create(combat); fighter.init({state, bus, helpers: {}, registry: {get() {return null;}}});
  const collisions = Object.create(collisionConsequences);
  collisions.init({state, bus, registry: {get(id) {return id === 'combat' ? fighter : null;}}});
  try {
    replay.update(1 / 60, state);
    recordImpulseProvenance(a, {actorId: 1, weaponId: 'massline', tag: 'massline', appliedTick: 120, magnitude: 5000});
    bus.emit('physics:impact', {consequenceKernelVersion: 1, tick: 120, aId: 2, bId: 3,
      impulse: 5000, pos: {x: 30, z: 0}, normal: {x: -1, z: 0}});
    assert.equal(deaths.length, 2, 'both actual collision consequences cross combat death');
    assert.equal(deaths[1].impactorId, deaths[0].id);
    assert.equal(deaths[1].presentation.cause, 'ship_collision');
    assert.equal(deaths[1].presentation.impactLink.actorId, 1);
    assert.equal(chains.length, 0, 'one contact killing both sides does not make the first death its cause');
    assert.equal(lines.length, 0);
    assert.equal(adventureTapeRecording(state).events.some(e => e.type === 'chain'), false);
    assert.equal(state.player.stats.kills, 2, 'chain receipt does not add another kill');
    const c = physicalShip(4, 1); state.entities.set(c.id, c); state.entityList.push(c);
    state.tick++; state.simTime += 1 / 60;
    bus.emit('physics:impact', {consequenceKernelVersion: 1, tick: state.tick, aId: a.id, bId: c.id,
      impulse: 5000, pos: {x: 35, z: 0}, normal: {x: -1, z: 0}});
    assert.equal(c.alive, true, 'a later contact with the dead original hull is rejected by the canonical owner');
    assert.equal(deaths.length, 2);
    assert.equal(chains.length, 0);
  } finally { collisions.destroy(); chain.destroy(); replay.destroy(); fighter.destroy?.(); bus.clear(); COMBAT_FLAGS.weaponImpulseConsequences = previous; }
});
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';

test('native subsequent wreck collision reaches the chain tape and comms', async () => {
  const h = await bootRealPath({seed: 4242, systems:[killReplay,chainKills,aftermathWrecks,collisionConsequences,combat],
    bounds:{center:{x:0,z:0},radius:3500,hardRadius:4000},
    prepareState({state}) {state.world.currentSectorId='sector_helios_prime';},
    hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:-250,z:0}}]});
  const events=[]; for(const type of ['entity:killed','combat:chainKill','comms:log','physics:impact']) h.bus.on(type,p=>events.push({type,p}));
  try {
    const ship = (x,vx,hull) => h.runtime.spawn({type:'ship',team:1,pos:{x,z:0},vel:{x:vx,z:0},radius:12,mass:25,hull,hullMax:100,shield:0,shieldMax:0,armorHp:0,armorMax:0,collides:true,
      physicsBody:{schemaVersion:1,radius:12,mass:25,inertiaY:40,dynamic:true,ccd:true,material:'ship',revision:0},
      data:{defId:'ship_wasp',shipClass:'fighter',combatProfileId:'combat_profile_standard_ship'}});
    const first=ship(0,75,1), second=ship(220,0,1);
    h.step(1); h.assertBodies([first,second]);
    const fighter=h.runtime.getSystem('combat');
    h.withFeatures(()=>fighter.kill(first,h.state.playerId,{origin:{kind:'weapon',id:'wpn_autocannon_s'},packet:{source:{kind:'weapon',weaponId:'wpn_autocannon_s'}}}));
    const wreck=[...h.state.entities.values()].find(e=>e.type==='wreck'&&e.data?.markerId&&e.data?.aftermath?.victimId===first.id)
      || [...h.state.entities.values()].find(e=>e.type==='wreck'&&e.data?.markerId);
    assert.ok(wreck,'canonical aftermath spawned the live wreck');
    h.step(1); h.assertBodies([wreck,second]);
    const witness=currentChainWreckWitness(h.state,wreck);
    assert.equal(witness.firstId,first.id); assert.equal(witness.firstGeneration,first.occupantGeneration);
    assert.equal(witness.wreckId,wreck.id); assert.equal(witness.wreckGeneration,wreck.occupantGeneration);
    assert.ok(Object.isFrozen(witness));
    h.withFeatures(()=>fighter.onHit({targetId:wreck.id,ownerId:h.state.playerId,weaponId:'wpn_autocannon_s',
      damagePacket:{channels:{kinetic:0},impulse:{x:100,z:0},source:{kind:'weapon',weaponId:'wpn_autocannon_s',impulseProvenance:'weapon_hit'}}}));
    assert.equal(readRecentImpulseProvenance(wreck,h.state.tick)?.actorId,h.state.playerId,'actual combat impulse records ownership');
    h.step(240,{after(){if(second.alive===false)return false;}});
    const deaths=events.filter(e=>e.type==='entity:killed'); const chains=events.filter(e=>e.type==='combat:chainKill');
    assert.equal(second.alive,false,JSON.stringify(events.filter(e=>e.type==='physics:impact').map(e=>e.p)));
    assert.equal(deaths.filter(e=>e.p.id===second.id).length,1);
    const lethal=deaths.find(e=>e.p.id===second.id).p;
    assert.equal(lethal.impactorId,wreck.id);
    assert.equal(lethal.chainWitness.firstId,first.id);
    assert.equal(lethal.presentation.impactLink.actorId,h.state.playerId);
    assert.equal(projectBridgeEvent('entity:killed',lethal).dropped,false);
    assert.equal(chains.length,1);
    assert.equal(chains[0].p.firstId,first.id);assert.equal(chains[0].p.secondId,second.id);
    const line=events.find(e=>e.type==='comms:log'&&e.p.kind==='chainKill');
    assert.ok(line);
    assert.equal(events.filter(e=>e.type==='comms:log'&&e.p.kind==='chainKill').length,1);
    assert.ok(events.some(e=>e.type==='physics:impact' && e.p.backend==='rapier-dynamic'
      && [e.p.aId,e.p.bId].includes(wreck.id) && [e.p.aId,e.p.bId].includes(second.id)), 'the later contact was emitted by native physics');
    const tape=adventureTapeRecording(h.state);
    assert.equal(tape.events.filter(e=>e.type==='chain').length,1);
    const stream=fromAdventureTape(tape);
    assert.ok(stream.events.some(e=>e.kind==='kill' && e.payload.tapeKind==='chain' && e.payload.label.startsWith('Chain:')));
    const wire=projectBridgeEvent('combat:chainKill',chains[0].p);
    assert.equal(wire.dropped,false); assert.equal(wire.flat.firstId,first.id);
    assert.equal(wire.flat.secondId,second.id); assert.doesNotThrow(()=>structuredClone(wire.flat));
    const wireLine=projectBridgeEvent('comms:log',line.p); assert.equal(wireLine.dropped,false);
    assert.equal(discoveryCommsPayload(wireLine.flat).text,line.p.text);
    // Replay the exact producer receipts through the production worker bridge and main lane.
    // Registration is root-owned, so this transport exercise carries the real receipts from
    // the native fixture above rather than pretending this explicit fixture is the manifest.
    const worker=createSimHost(), main=createGameState(4242), mainBus=createBus();
    let receive, initRequest; const delivered=[];
    const lane=createSimLaneRuntime({state:main,bus:mainBus,registry:{},helpers:{},
      flags:{lane:'worker',sab:false,warnings:[]},clockMode:'worker-local',
      channelFactory:()=>({onMessage(fn){receive=fn;},post(msg){if(msg.kind==='init')initRequest=msg;},terminate(){}})});
    try {
      const scenarioContract=JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'));
      const ready=await worker.init({...initRequest,scenarioContract});
      receive(structuredClone({kind:'ready',seq:initRequest.seq,...ready})); await lane.readyPromise;
      mainBus.on('combat:chainKill',p=>delivered.push({type:'chain',p}));
      mainBus.on('comms:log',p=>delivered.push({type:'line',p}));
      worker.host.bus.emit('combat:chainKill',chains[0].p); worker.host.bus.emit('comms:log',line.p);
      const reply=await worker.tick({tick:1,steps:0,commands:[],generation:0});
      receive(structuredClone({kind:'clockTick',...reply}));
      assert.equal(delivered.filter(e=>e.type==='chain').length,1);
      assert.equal(discoveryCommsPayload(delivered.find(e=>e.type==='line').p).text,line.p.text);
    } finally {lane.close();worker.shutdown();mainBus.clear();}
    assert.equal(h.state.player.stats.kills,2,'no additional kill credit');
    h.bus.emit('save:restoring');
    assert.equal(currentChainWreckWitness(h.state,wreck),null,'restore clears the live body witness');
  } finally {h.dispose();}
});


test('chain matcher requires original and wreck generations, time and player cause', () => {
  const rows=[{victimId:5,gen:7,at:10}], witness={firstId:5,firstGeneration:7,deathTime:10,wreckId:6,wreckGeneration:2};
  const facts={witness,impactorId:6,impactorGen:2,cause:'generic',playerCaused:true,at:11};
  assert.equal(matchChainKill(rows,facts),rows[0]);
  assert.equal(matchChainKill(rows,{...facts,impactorGen:3}),null);
  assert.equal(matchChainKill(rows,{...facts,witness:{...witness,firstGeneration:8}}),null);
  assert.equal(matchChainKill(rows,{...facts,at:10}),null);
  assert.equal(matchChainKill(rows,{...facts,at:10+CHAIN_KILL_WINDOW_S+1}),null);
  assert.equal(matchChainKill(rows,{...facts,playerCaused:false}),null);
  assert.equal(matchChainKill(rows,{...facts,witness:null}),null);
});

test('lifecycle events clear run-local rows and latches', () => {
  for(const event of ['game:new','game:newGame','save:restoring','save:loaded','player:death']) {
    const bus=createBus(),state={playerId:1,simTime:5,entities:new Map([[2,{id:2,occupantGeneration:1}]])};
    const system=Object.create(chainKills); system.init({bus,state});
    bus.emit('entity:killed',{id:2,type:'ship',killerId:1,pos:{x:0,z:0}});
    assert.equal(system.chainRows().length,1);bus.emit(event);assert.equal(system.chainRows().length,0);
    assert.equal(system._latched.length,0);assert.equal(system._lastLineAt,-Infinity);system.destroy();bus.clear();
  }
});


test('worker projection bounds chain payload and preserves existing result wakeup', () => {
  const row=projectBridgeEvent('combat:chainKill',{firstId:'x'.repeat(1000),secondId:{nested:true},cause:'z'.repeat(1000),at:1,windowS:6,pos:{x:1,z:2},ignored:{deep:{a:{b:{c:1}}}}});
  assert.equal(row.dropped,false);assert.equal(row.flat.firstId.length,120);assert.equal(row.flat.secondId,null);
  assert.equal(row.flat.cause.length,40);assert.equal('ignored' in row.flat,false);
  const result=projectBridgeEvent('run:resultsReady',{outcome:'won',stopReason:'done',seed:1,arenaId:'a',wave:3,endedAt:{tick:44},wreck:{deep:{x:{y:2}}}});
  assert.deepEqual(result.flat,{outcome:'won',stopReason:'done',seed:1,arenaId:'a',wave:3,endedAtTick:44});
});
