import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameState} from '../src/core/gameState.js';
import {createSimulation} from '../src/core/sim.js';
import {ships,makeShipEntitySpec,fittingsFromDefaultModules} from '../src/systems/ships.js';
import {cargo} from '../src/systems/cargo.js';
import {save} from '../src/save/saveSystem.js';
import {setThrusterHealth,resolvePhysicsBodySpec} from '../src/core/physicsAuthority.js';

function fixture(){
 const state=createGameState(503);state.mode='flight';
 const sim=createSimulation({state,seed:503,systems:[ships,cargo,save]});
 const shipOwner=sim.registry.get('ships');shipOwner.newGame();
 const fittings=fittingsFromDefaultModules('ship_drifter',['mod_frame_coupler_m']);
 state.player.ownedShips=[{defId:'ship_drifter',fittings}];state.player.activeShipIndex=0;
 const player=sim.spawn(makeShipEntitySpec('ship_drifter',{team:0,isPlayer:true,player:state.player,fittings,pos:{x:80,z:40},rot:.2}));state.playerId=player.id;
 shipOwner.recomputeActiveShip();
 assert.equal(sim.registry.get('cargo').addCargo('cmdty_refined_metals',4),4);
 sim.registry.get('cargo').recompute();shipOwner.flushCargoMassRefresh();
 player.hull=37;player.shield=3;player.cap=9;
 setThrusterHealth(player,player.physicsBody.thrusters[0].id,.4);
 state.tick=42;state.simTime=.7;
 const source=sim.spawn({type:'prop',pos:{x:140,z:40},vel:{x:2,z:-1},mass:68,radius:5,hull:53,hullMax:80,flags:{persistent:true},data:{worldRecordId:'test:retained-source'}});
 resolvePhysicsBodySpec(source);
 return {state,sim,shipOwner,player,source,saver:sim.registry.get('save')};
}
for(const outgoingMass of [0,99])test(`Continue derives restored cargo before ship stats with outgoing cached mass ${outgoingMass}`,async()=>{
 const h=fixture();
 try{
  const expectedBody=structuredClone(h.player.physicsBody),expectedNativeContract=structuredClone(resolvePhysicsBodySpec(h.player));
  const expectedDerived=structuredClone(h.player.data.derived),sourceBody=structuredClone(h.source.physicsBody);
  const envelope=JSON.parse(JSON.stringify(h.saver.serialize('cargo-order')));
  const expectedCargo=structuredClone(envelope.data.cargo),expectedLiveCargo=structuredClone(h.state.player.cargo);
  h.state.player.cargo.usedMass=outgoingMass;
  const events=[];const read=()=>{const e=h.state.entities.get(h.state.playerId);return {mass:e?.physicsBody?.mass,revision:e?.physicsBody?.revision,usedMass:h.state.player.cargo.usedMass};};
  for(const name of ['cargo:changed','ship:statsChanged','ship:cargoCapChanged'])h.sim.bus.on(name,()=>events.push({name,...read()}));
  assert.equal(await h.saver.loadEnvelope(envelope,'cargo-order'),true);
  const restored=h.state.entities.get(h.state.playerId),source=h.state.entityList.find(e=>e.data?.worldRecordId==='test:retained-source');
  assert.deepEqual(h.state.player.cargo,expectedLiveCargo,'all cargo caches and capacity agree after ship derivation');
  assert.deepEqual(restored.physicsBody,expectedBody,'unchanged restored physical body keeps its persisted invalidation revision');
  assert.deepEqual(resolvePhysicsBodySpec(restored),expectedNativeContract,'native-admission authoring contract stays unchanged');
  assert.deepEqual(restored.data.derived,expectedDerived);
  assert.deepEqual(source.physicsBody,sourceBody);
  assert.equal(restored.hull,37);assert.equal(restored.shield,3);assert.equal(restored.cap,9);
  assert.equal(restored.physicsBody.thrusters[0].health,.4);
  assert.deepEqual(h.state.player.cargo.items,expectedCargo.items);
  assert.equal(h.state.player.cargo.capVolume,expectedDerived.cargoCap);
  assert.equal(h.state.player.cargo.capMass,expectedCargo.capMass);
  assert.equal(h.state.player.cargo.usedMass,expectedDerived.cargoMass);
  assert.equal(h.state.tick,42);assert.equal(h.state.simTime,.7);
  assert.deepEqual(events.map(e=>e.name),['cargo:changed','ship:statsChanged','ship:cargoCapChanged']);
  assert(events.every(e=>e.mass===expectedBody.mass&&e.revision===expectedBody.revision));
  assert(events.every(e=>e.usedMass===expectedDerived.cargoMass));
  h.sim.registry.get('cargo').update(0,h.state);
  assert.deepEqual(h.state.player.cargo,expectedLiveCargo,'ordinary dirty-cache flush changes no reconstructed cargo field');
  assert.deepEqual(restored.physicsBody,expectedBody);
 }finally{h.sim.dispose();}
});

test('Continue canonicalizes an old hold capacity while preserving finite cargo, body damage and revision across repeated loads',async()=>{
 const h=fixture();
 try{
  h.state.player.cargo.capVolume=40;
  h.state.player.cargo.richLots=[{lotId:'retained-lot',commodityId:'cmdty_refined_metals',qty:4,provenanceId:'station_ceres',sourceKind:'station_clamp_break',sourceOwner:'station'}];
  const expectedBody=structuredClone(h.player.physicsBody),expectedItems=structuredClone(h.state.player.cargo.items),expectedLots=structuredClone(h.state.player.cargo.richLots);
  const expectedCap=h.player.data.derived.cargoCap;
  const expectedCargo={...structuredClone(h.state.player.cargo),capVolume:expectedCap};
  for(let i=0;i<3;i++){
   const envelope=JSON.parse(JSON.stringify(h.saver.serialize('repeat-cargo-order')));
   h.state.player.cargo.usedMass=99+i;
   assert.equal(await h.saver.loadEnvelope(envelope,'repeat-cargo-order'),true);
   const e=h.state.entities.get(h.state.playerId);
   assert.deepEqual(e.physicsBody,expectedBody);assert.equal(e.hull,37);assert.equal(e.shield,3);assert.equal(e.cap,9);
   assert.deepEqual(h.state.player.cargo.items,expectedItems);assert.deepEqual(h.state.player.cargo.richLots,expectedLots);
   assert.deepEqual(h.state.player.cargo,expectedCargo);
   h.sim.registry.get('cargo').update(0,h.state);assert.deepEqual(h.state.player.cargo,expectedCargo);
   assert.equal(h.state.tick,42);assert.equal(h.state.simTime,.7);
  }
 }finally{h.sim.dispose();}
});

test('Continue still advances revision for a genuinely changed saved mass contract',async()=>{
 const h=fixture();
 try{
  const canonical=structuredClone(h.player.physicsBody);
  h.player.physicsBody.mass+=1;
  const changedRevision=h.player.physicsBody.revision;
  const envelope=JSON.parse(JSON.stringify(h.saver.serialize('changed-body')));
  assert.equal(await h.saver.loadEnvelope(envelope,'changed-body'),true);
  const e=h.state.entities.get(h.state.playerId);
  assert.deepEqual(e.physicsBody,{...canonical,revision:changedRevision+1});
  assert.equal(e.physicsBody.thrusters[0].health,.4);assert.equal(e.hull,37);
 }finally{h.sim.dispose();}
});

for(const [withCargo,withShips] of [[false,true],[true,false],[false,false]])test(`optional-owner fallback cargo=${withCargo} ships=${withShips} preserves its existing contract`,async()=>{
 const h=fixture();let target;
 try{
  h.state.player.cargo.capVolume=40;
  const envelope=JSON.parse(JSON.stringify(h.saver.serialize('optional-owner')));
  const expectedBody=structuredClone(h.player.physicsBody),expectedDerived=structuredClone(h.player.data.derived);
  const state=createGameState(503);state.mode='flight';
  target=createSimulation({state,seed:503,systems:[...(withShips?[ships]:[]),...(withCargo?[cargo]:[]),save]});
  assert.equal(await target.registry.get('save').loadEnvelope(envelope,'optional-owner'),true);
  assert.deepEqual(state.player.cargo,{...envelope.data.cargo,usedMass:withCargo?expectedDerived.cargoMass:0,usedVolume:withCargo?h.state.player.cargo.usedVolume:0,capVolume:40});
  const restored=state.entities.get(state.playerId);
  if(!withShips)assert.deepEqual(restored.physicsBody,expectedBody);
  else {
   assert.equal(restored.physicsBody.mass,expectedDerived.dryMass);
   assert.equal(restored.physicsBody.revision,expectedBody.revision+1);
   assert.equal(restored.physicsBody.thrusters[0].health,.4);
  }
  assert.equal(restored.hull,37);assert.equal(restored.shield,3);assert.equal(restored.cap,9);
  assert.equal(state.tick,42);assert.equal(state.simTime,.7);
 }finally{target?.dispose();h.sim.dispose();}
});


test('capacity decreases preserve an overfull hold and leave all cargo and salvage caches coherent', async () => {
  const h = fixture();
  try {
    // A save can legitimately retain more cargo than a later derived capacity permits.
    // Restore must retain custody, not silently drop units to fit the canonical hold.
    h.state.player.cargo.capVolume = 1000;
    h.state.player.cargo.items = {cmdty_refined_metals: 1001};
    h.state.player.salvageBay = {items: {cmdty_refined_metals: 3}, usedVolume: 999};
    h.sim.registry.get('cargo').recompute();
    h.shipOwner.flushCargoMassRefresh();
    const expectedBody = structuredClone(h.player.physicsBody);
    const expectedCargo = {
      ...structuredClone(h.state.player.cargo),
      capVolume: h.player.data.derived.cargoCap,
    };
    const expectedBay = structuredClone(h.state.player.salvageBay);
    assert(expectedCargo.usedVolume > expectedCargo.capVolume);
    const envelope = JSON.parse(JSON.stringify(h.saver.serialize('overfull-hold')));
    h.state.player.cargo.usedMass = 99;
    assert.equal(await h.saver.loadEnvelope(envelope, 'overfull-hold'), true);
    const restored = h.state.entities.get(h.state.playerId);
    assert.deepEqual(h.state.player.cargo, expectedCargo);
    assert.deepEqual(h.state.player.salvageBay, expectedBay);
    assert.deepEqual(restored.physicsBody, expectedBody);
    h.sim.registry.get('cargo').update(0, h.state);
    assert.deepEqual(h.state.player.cargo, expectedCargo);
    assert.deepEqual(h.state.player.salvageBay, expectedBay);
    assert.deepEqual(restored.physicsBody, expectedBody);
    assert.equal(restored.hull, 37);
    assert.equal(restored.shield, 3);
    assert.equal(restored.cap, 9);
    assert.equal(h.state.tick, 42);
    assert.equal(h.state.simTime, .7);
  } finally {
    h.sim.dispose();
  }
});
