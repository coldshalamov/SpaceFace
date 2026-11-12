import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { borrowedVoice } from '../src/systems/borrowedVoice.js';
import { BORROWED_VOICE as C, BORROWED_VOICE_RECORDERS as RECORDERS, freshBorrowedVoice } from '../src/data/borrowedVoice.js';
import { ALIEN_SITES } from '../src/data/alienEcology.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { sectorLocalToGlobalForSector, sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { getCombatKernel } from '../src/combat/kernel.js';

const CENTER=sectorLocalToGlobalForSector(C.center,C.sectorId);
const xz=p=>({x:p.x,z:p.z});
function fixture(t,saved=null){
  const sim=createSimulation({seed:816,systems:[economy,borrowedVoice],helpers:{combatPhysics:{
    createAttachment:row=>({id:row.attachmentId}),cutAttachment:()=>true,
  }}});t.after(()=>sim.dispose());
  const s=sim.state;s.mode='flight';s.world.currentSectorId=C.sectorId;
  s.settings.gameplay.physicsBackend='legacy';ensureAlienEcologyState(s).revelation=2;
  const player=sim.spawn({type:'ship',isPlayer:true,hull:100,mass:28,radius:8,collides:false,
    pos:{x:CENTER.x+70,z:CENTER.z+40}});s.playerId=player.id;
  const owner=sim.registry.get('borrowedVoice');if(saved)owner.deserialize(saved);
  sim.step(.2);
  return {sim,s,owner,player,step:()=>sim.step(.2)};
}

test('pristine Charon admission converts the authored assembly once beside the actual global ecology center',t=>{
  const h=fixture(t),ring=h.owner._find('ring');
  assert.deepEqual(sectorGlobalOrigin(C.sectorId),{x:8192,z:28672});
  assert.deepEqual(C.center,{x:-2075,z:995},'authored local constants remain local');
  assert.deepEqual(xz(ring.pos),{x:6117,z:29667});
  const ecology=sectorLocalToGlobalForSector(ALIEN_SITES.warm_freighter.center,C.sectorId);
  assert.deepEqual({x:ring.pos.x-ecology.x,z:ring.pos.z-ecology.z},{x:125,z:95});
  for(const r of RECORDERS)assert.deepEqual(xz(h.owner._find(r.id).pos),{x:CENTER.x+r.offset.x,z:CENTER.z+r.offset.z});
  const identities=['ring',...RECORDERS.map(r=>r.id)].map(id=>{const e=h.owner._find(id);return [id,e.id,e.occupantGeneration,e.data.worldRecordId];});
  const saved=h.owner.serialize();assert.deepEqual(saved.placement,{schema:1,frame:'galactic-global',center:CENTER});
  h.owner.deserialize(saved);h.owner.afterContinue();h.step();
  assert.deepEqual(['ring',...RECORDERS.map(r=>r.id)].map(id=>{const e=h.owner._find(id);return [id,e.id,e.occupantGeneration,e.data.worldRecordId];}),identities);
  assert.deepEqual(xz(ring.pos),CENTER,'rebind/update does not add the sector origin again');
});

test('global sampling, source range and disposition gates follow the actual receiver without relaxing signal rules',t=>{
  const h=fixture(t),a=h.owner._find('a');
  a.pos.set(CENTER.x+8,0,CENTER.z);a.rot=Math.PI;
  for(let i=0;i<8;i++)h.step();
  assert.ok(h.owner._signals.get('a').quality>.8);
  assert.equal(h.owner.inspect(a.id).recovered,true);
  const offers=[];h.sim.bus.on('borrowedVoice:offer',r=>offers.push(r));
  h.owner._offer('a');assert.equal(offers.at(-1).canChoose,true);
  h.player.pos.set(C.center.x+70,0,C.center.z+40);h.step();
  assert.equal(h.owner._signals.size,0,'the old raw point is not near a fresh global receiver');
  h.owner._offer('a');assert.equal(offers.at(-1).canChoose,false);
  assert.equal(h.owner.choose('archive',h.owner._row.evidenceRevision).ok,false);
  h.player.pos.set(CENTER.x+70,0,CENTER.z+40);
  assert.equal(h.owner.choose('leave',h.owner._row.evidenceRevision).ok,true);
});

test('same-life moved/towed originals retain exact world poses and anchor across owner rebind and shelving',t=>{
  const h=fixture(t),ring=h.owner._find('ring'),a=h.owner._find('a');
  ring.pos.set(CENTER.x+600,0,CENTER.z-300);
  a.pos.set(CENTER.x+125,0,CENTER.z-51);a.vel.set(2,0,-3);a.rot=.73;a.angVel=.4;
  const line=getCombatKernel(h.owner.ctx).attachments.create({defId:'tether_standard',ownerId:h.player.id,targetId:a.id,
    sourceWorld:h.player.pos,targetWorld:a.pos});assert.equal(line.ok,true);
  const saved=h.owner.serialize(),identity={id:a.id,life:a.occupantGeneration,key:a.data.worldRecordId};
  const expected=structuredClone(saved.recorderOutcomeIds.a.pose);
  h.owner.deserialize(saved);h.owner.afterContinue();h.owner.update(0,h.s);
  assert.equal(h.owner._find('a'),a);assert.deepEqual({id:a.id,life:a.occupantGeneration,key:a.data.worldRecordId},identity);
  assert.deepEqual(h.owner.serialize().recorderOutcomeIds.a.pose,expected);
  assert.equal(getCombatKernel(h.owner.ctx).attachments.listForEntity(a.id)[0].id,line.attachment.id);
  assert.deepEqual(saved.placement.center,xz(ring.pos));
  h.s.world.currentSectorId='sector_helios_prime';h.sim.bus.emit('sector:exit');h.step();
  const shelved=h.owner.serialize(),next=fixture(t,shelved);
  assert.deepEqual(xz(next.owner._find('ring').pos),saved.placement.center);
  assert.deepEqual(next.owner.serialize().recorderOutcomeIds.a.pose,expected,'saved world pose outranks an authored offset');
});

test('unmarked legacy assemblies remain at their retained world anchor instead of guessing a pristine migration',t=>{
  const legacy=freshBorrowedVoice();legacy.ringOutcome='shelved';
  for(const r of RECORDERS)legacy.recorderOutcomeIds[r.id]={status:'shelved',pose:{
    x:C.center.x+r.offset.x,z:C.center.z+r.offset.z,vx:0,vz:0,rot:r.rot,spin:0}};
  const h=fixture(t,legacy);
  assert.deepEqual(xz(h.owner._find('ring').pos),C.center);
  for(const r of RECORDERS)assert.deepEqual(xz(h.owner._find(r.id).pos),{x:legacy.recorderOutcomeIds[r.id].pose.x,z:legacy.recorderOutcomeIds[r.id].pose.z});
  const marked=h.owner.serialize();assert.deepEqual(marked.placement.center,C.center);
  const next=fixture(t,marked);assert.deepEqual(xz(next.owner._find('ring').pos),C.center);
  next.owner.newGame();next.step();assert.deepEqual(xz(next.owner._find('ring').pos),CENTER,'a genuinely unseen new assembly admits in the canonical frame');
});

test('saved receiver loss and original loss retain the actual anchor without resurrecting bodies',t=>{
  const h=fixture(t),ring=h.owner._find('ring'),b=h.owner._find('b');
  ring.pos.set(CENTER.x+340,0,CENTER.z+50);
  for(const e of [ring,b]){e.alive=false;h.sim.bus.emit('entity:killed',{targetId:e.id});h.sim.helpers.removeEntity(e.id);}
  const saved=h.owner.serialize(),next=fixture(t,saved);
  assert.deepEqual(saved.placement.center,{x:CENTER.x+340,z:CENTER.z+50});
  assert.equal(next.owner._find('ring'),null);assert.equal(next.owner._find('b'),null);
  assert.equal(next.owner._row.ringOutcome,'destroyed');assert.equal(next.owner._row.recorderOutcomeIds.b.status,'destroyed');
});
