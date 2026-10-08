import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { borrowedVoice, borrowedVoicePresentation } from '../src/systems/borrowedVoice.js';
import { BORROWED_VOICE as C, BORROWED_VOICE_RECORDERS as R, borrowedVoiceJournalPlate,
  borrowedSignalQuality, normalizeBorrowedVoice } from '../src/data/borrowedVoice.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';

function fixture({revelation=2,saved=null}={}){const sim=createSimulation({seed:816,systems:[economy,borrowedVoice]}),s=sim.state;
  s.mode='flight';s.run.kind='adventure';s.run.phase='inactive';s.world.currentSectorId=C.sectorId;
  s.settings.gameplay.physicsBackend='legacy';ensureAlienEcologyState(s).revelation=revelation;
  const p=sim.spawn({type:'ship',hull:100,mass:28,radius:8,collides:false,pos:{x:C.center.x+70,z:C.center.z+40}});
  s.playerId=p.id;const owner=sim.registry.get('borrowedVoice');if(saved)owner.deserialize(saved);
  const advance=(n=1)=>{for(let i=0;i<n;i++)sim.step(.2);};advance();
  const recover=(id='a')=>{const e=owner._find(id);assert.ok(e);e.pos.x=C.center.x+8;e.pos.z=C.center.z;e.rot=Math.PI;
    advance(8);assert(owner._signals.get(id)?.quality>.8);assert(owner.inspect(e.id).recovered);return e;};
  return {sim,s,p,owner,advance,recover,close:()=>sim.dispose()};
}

test('R1 reveals no physical artifact, subtitles or journal title; R2 uses the existing host',()=>{const h=fixture({revelation:1});try{
  const offers=[];h.sim.bus.on('borrowedVoice:offer',r=>offers.push(r));h.advance(10);
  assert.equal(h.s.entityList.filter(e=>e.data?.persistenceOwner===C.owner).length,0);
  assert.equal(h.owner.inspect(h.p.id).ok,false);assert.equal(offers.length,0);assert.equal(borrowedVoiceJournalPlate(h.s),null);
  ensureAlienEcologyState(h.s).revelation=2;h.advance();
  assert.equal(h.s.entityList.filter(e=>e.data?.persistenceOwner===C.owner).length,4);
  assert.equal(h.owner._find('ring').physicsBody.collisionProxyManifest.convexParts.length,5);
  assert.equal(h.owner._find('a').mass+h.owner._find('b').mass+h.owner._find('c').mass,24);
}finally{h.close();}});

test('actual occlusion and simulation rotation determine a held signal; rendering cannot recover words',()=>{const h=fixture();try{
  const e=h.owner._find('a');e.pos.x=C.center.x+8;e.pos.z=C.center.z;e.rot=0;h.advance(8);
  assert.equal(h.owner.inspect(e.id).recovered,false);
  e.rot=Math.PI;const q=borrowedSignalQuality(e,C.center,true);e.mesh={rotation:{y:1000},scale:{x:.001,y:100,z:20}};
  assert.equal(borrowedSignalQuality(e,C.center,true),q);
  const obstacle=h.sim.spawn({type:'asteroid',mass:640,radius:2,collides:true,pos:{x:C.center.x+4,z:C.center.z}});
  h.advance(8);assert.equal(h.owner._signals.get('a').quality,0);assert.equal(h.owner.inspect(e.id).recovered,false);
  h.sim.helpers.removeEntity(obstacle.id);h.advance(8);assert.equal(h.owner.inspect(e.id).recovered,true);
}finally{h.close();}});

test('threshold crossings and recursive archive requests preserve one fragment and one owner payment',()=>{const h=fixture();try{
  const events=[];h.sim.bus.on('borrowedVoice:fragmentRecovered',e=>events.push(e));const e=h.recover();
  for(let i=0;i<8;i++){e.rot=i%2?0:Math.PI;h.advance(2);h.owner.inspect(e.id);}
  assert.equal(events.length,1);assert.deepEqual(h.owner._row.recoveredFragmentIds,[R[0].evidenceId]);
  const before=h.s.player.credits;h.sim.bus.on('economy:creditsChanged',()=>h.owner.choose('archive',h.owner._row.evidenceRevision));
  assert.equal(h.owner.choose('archive',h.owner._row.evidenceRevision).ok,true);
  assert.equal(h.s.player.credits-before,C.archiveCr);assert.equal(h.owner.choose('archive',h.owner._row.evidenceRevision).ok,false);
  const row=h.owner.serialize();assert.equal(row.archiveReceipt.id,`${C.id}:archive`);assert.equal(row.archiveReceipt.amount,600);
}finally{h.close();}});

test('one destroyed original stays missing after Continue; recovered words and partial hypotheses remain',()=>{const h=fixture();let next;try{
  const original=h.recover(),missing=h.owner._find('b');missing.alive=false;h.sim.bus.emit('entity:killed',{targetId:missing.id});
  h.sim.helpers.removeEntity(missing.id);const row=h.owner.serialize();next=fixture({saved:row});
  assert.equal(next.owner._find('b'),null);assert.equal(next.owner._find('a').data.worldRecordId,original.data.worldRecordId);
  const plate=borrowedVoiceJournalPlate(next.s);assert(plate.body.includes(R[0].text));assert(plate.body.includes('UNKNOWN — original source lost'));
  assert(plate.note.includes('cannot establish a second crew'));assert.equal(next.owner._row.recoveredFragmentIds.length,1);
}finally{next?.close();h.close();}});

test('quarantine actually closes the circuit and survives reload without new words or biology',()=>{const h=fixture();let next;try{
  h.recover();assert(h.owner.choose('quarantine',h.owner._row.evidenceRevision).ok);const row=h.owner.serialize();
  next=fixture({saved:row});const events=[];next.sim.bus.on('borrowedVoice:fragmentRecovered',e=>events.push(e));
  const b=next.owner._find('b');b.pos.x=C.center.x+8;b.pos.z=C.center.z;b.rot=Math.PI;next.advance(20);next.owner.inspect(b.id);
  assert.equal(events.length,0);assert.equal(next.owner._signals.size,0);assert.equal(next.owner._row.disposition,'quarantine');
  assert.equal(next.s.entityList.filter(e=>e.data?.persistenceOwner===C.owner).length,4);
  assert.equal(b.data.signalIsolated,true);assert.equal(borrowedVoicePresentation(next.s,b).quality,0);
  assert.equal(next.s.world.alienEcology.revelation,2);assert.equal(next.owner._row.archiveReceipt,null);
}finally{next?.close();h.close();}});

test('missing receiver, recycled source life and malformed restore cannot create a renewed record',()=>{const h=fixture();let next;try{
  const e=h.recover(),ring=h.owner._find('ring');ring.alive=false;h.sim.bus.emit('entity:killed',{targetId:ring.id});h.sim.helpers.removeEntity(ring.id);
  e.occupantGeneration++;h.advance(8);assert.equal(h.owner._signals.size,0);assert.equal(h.owner.inspect(e.id).ok,false);
  next=fixture({saved:h.owner.serialize()});assert.equal(next.owner._find('ring'),null);next.advance(8);assert.equal(next.owner._signals.size,0);
  const row=normalizeBorrowedVoice({schema:1,id:C.id,recoveredFragmentIds:['made-up',R[0].evidenceId,R[0].evidenceId],
    disposition:'archive',archiveReceipt:{id:'fake',amount:600,at:0}});
  assert.deepEqual(row.recoveredFragmentIds,[R[0].evidenceId]);assert.equal(row.archiveReceipt,null);
}finally{next?.close();h.close();}});
