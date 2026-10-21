// Optional focused diagnostic, never part of the default test/CI command.
// Native receiver/Continue/revisit proof from an actual pre-berth Save.
// Sector API transitions below test lifecycle, not ordinary player gate travel.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gunzipSync,gzipSync} from 'node:zlib';
import {vestaWinnowRecoveryFixture} from './vesta-winnow-recovery-native.mjs';
import {winnowRecoveryFacts,settleWinnowRecovery} from '../../src/world/vestaWinnowRecovery.js';
import {contactHailAvailability,createContactHailOffer,createContactHailResponse} from '../../src/data/contactHail.js';
const input=process.env.VESTA_RESUME;
if(!input)throw Error('Set VESTA_RESUME to an actual pre-berth Save produced by the stage diagnostic.');
const out=process.env.VESTA_PROOF_DIR||fs.mkdtempSync(path.join(tmpdir(),'spaceface-vesta-revisit-'));
fs.mkdirSync(out,{recursive:true});console.log('PROOF_DIRECTORY',out);
const f=await vestaWinnowRecoveryFixture();
try {
 const s=f.state,physics=f.runtime.getSystem('physics'),economy=f.runtime.getSystem('economy'),world=f.runtime.getSystem('world');
 const saved=JSON.parse(gunzipSync(fs.readFileSync(input)));
 assert.equal(f.save.loadEnvelope(saved.envelope),true);assert.equal(await physics.prepareBackend(s),true);
 const book=()=>s.traffic.vestaWinnowRecovery.batches.find(b=>b.id===f.batchId);
 const carrierId=book().carrierId;
 const tann=()=>s.entityList.filter(e=>e.alive&&e.data?.worldRecordId===carrierId);
 const facts=()=>winnowRecoveryFacts(s,f.batchId);
 const stock=()=>s.economy.markets.station_forge.cmdty_ore_copper.stock;
 const receiptId=`${f.batchId}:forge`,key=`freight:${receiptId}`;
 let fresh=0,duplicates=0;const apply=economy.applyFreightDelivery;
 economy.applyFreightDelivery=function(payload){
  const before=stock(),result=apply.call(this,payload);
  if(payload.receiptId===receiptId&&result.ok){
   const after=stock();console.log('SETTLEMENT',JSON.stringify({t:s.simTime,before,after,result,carrier:tann().map(e=>({id:e.id,record:e.data.worldRecordId,pos:e.pos,vel:e.vel})),facts:facts()}));
   if(result.duplicate){duplicates++;assert.equal(after,before);}else{fresh++;assert.equal(after-before,2);}
  }return result;
 };
 assert.equal(facts().delivered,0);assert.equal(facts().aboard,2);
 for(let i=0;i<900&&facts().delivered===0;i++)f.step();
 assert.equal(fresh,1);assert.equal(facts().delivered,2);assert.equal(facts().aboard,0);assert.equal(facts().loose,8);
 f.step(2);assert.equal(tann().length,1);assert.equal(tann()[0].data.vestaWinnowRecovery,undefined);
 assert.equal(tann()[0].flags.persistent===true,false,'original false persistence flag restored');
 const receipt={...s.economy.committedIntents[key].receipt};
 const beforeStock=stock(),beforeCredits=s.player.credits;
 assert.equal(economy.applyFreightDelivery(receipt).duplicate,true);
 const station=s.entityList.find(e=>e.alive&&e.data?.stationId==='station_forge');
 assert.equal(settleWinnowRecovery(f.owner,tann()[0],station),false);
 assert.equal(stock(),beforeStock);assert.equal(s.player.credits,beforeCredits);
 for(let i=0;i<3;i++){
  const envelope=f.save.serialize(`accepted-continue-${i}`);
  assert.equal(f.save.loadEnvelope(JSON.parse(JSON.stringify(envelope))),true);assert.equal(await physics.prepareBackend(s),true);f.step(2);
  assert.equal(tann().length,1);assert.equal(facts().delivered,2);assert.equal(facts().loose,8);
  const before=stock();assert.equal(economy.applyFreightDelivery(receipt).duplicate,true);assert.equal(stock(),before);
 }
 const stations=()=>s.entityList.filter(e=>e.alive&&e.type==='station'&&['station_forge','station_vesta_outlying_yard'].includes(e.data?.stationId)).map(e=>({id:e.id,stationId:e.data.stationId,pos:e.pos,worldRecordId:e.data.worldRecordId,role:e.data.role}));
 console.log('BEFORE_REVISIT',JSON.stringify({facts:facts(),tann:tann().map(e=>({id:e.id,record:e.data.worldRecordId,persistent:e.flags.persistent})),stations:stations()}));
 world.enterSector('sector_helios_prime');assert.equal(await physics.prepareBackend(s),true);f.step(3);
 world.enterSector('sector_vesta_forge');assert.equal(await physics.prepareBackend(s),true);f.step(3);
 assert.equal(tann().length,1);assert.equal(facts().delivered,2);assert.equal(facts().loose,8);
 const e=tann()[0],player=s.entities.get(s.playerId);
 // On-demand presentation fixture only. No cargo/carrier motion or settlement is staged.
 player.pos={...e.pos,x:e.pos.x+50};s.player.targetId=e.id;
 const available=contactHailAvailability(s);assert.equal(available.enabled,true);
 const offer=createContactHailOffer(s,available,'actual-revisit',s.simTime+30);
 const choice=available.kind==='worker'?'status':'route';assert.ok(offer.actions.some(a=>a.id===choice));
 const before=JSON.stringify({ledger:s.traffic.vestaWinnowRecovery,stock:stock(),credits:s.player.credits});
 const response=createContactHailResponse(s,offer,choice);assert.ok(response.lines.some(line=>line.includes('Forge accepted 2u')));
 assert.equal(JSON.stringify({ledger:s.traffic.vestaWinnowRecovery,stock:stock(),credits:s.player.credits}),before);
 console.log('REVISIT',JSON.stringify({facts:facts(),carrier:{id:e.id,record:e.data.worldRecordId,jobId:e.data.jobId},hailKind:available.kind,response,stations:stations(),fresh,duplicates,receipt:s.economy.committedIntents[key]}));
 fs.writeFileSync(path.join(out,'revisited.json.gz'),gzipSync(JSON.stringify({sourceId:saved.sourceId,envelope:f.save.serialize('native-revisited')})));
 console.log('PASS_NATIVE_RECEIVER_CONTINUE_REVISIT');
}finally{f.close();}
