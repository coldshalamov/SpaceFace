import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {economy} from '../src/systems/economy.js';
import {borrowedVoice,borrowedVoiceScannerReading,borrowedVoiceRecoveryProjection} from '../src/systems/borrowedVoice.js';
import {BORROWED_VOICE as C,BORROWED_VOICE_RECORDERS as R,borrowedVoiceRecoveryGuidance} from '../src/data/borrowedVoice.js';
import {ensureAlienEcologyState} from '../src/data/alienEcologyState.js';
import {borrowedVoicePrompt} from '../src/ui/borrowedVoicePrompt.js';
import {setPromptDeck} from '../src/ui/promptDeck.js';

function fixture(revelation=2){
 const sim=createSimulation({seed:816,systems:[economy,borrowedVoice]}),s=sim.state;
 Object.assign(s,{mode:'flight'});s.run.kind='adventure';s.run.phase='inactive';s.world.currentSectorId=C.sectorId;
 s.settings.gameplay.physicsBackend='legacy';ensureAlienEcologyState(s).revelation=revelation;
 const p=sim.spawn({type:'ship',hull:100,mass:28,radius:8,collides:false,pos:{x:C.center.x+70,z:C.center.z+40}});s.playerId=p.id;
 const o=sim.registry.get('borrowedVoice');let card,seq=0;const offers=[];
 setPromptDeck({offerDecision(r){card=r;return true;},resolveDecision(){card=null;}});borrowedVoicePrompt.init({bus:sim.bus});
 sim.bus.on('borrowedVoice:offer',r=>offers.push(r));
 const step=(n=1)=>{for(let i=0;i<n;i++)sim.step(.2);};step();
 const scan=(id='a')=>{s.player.targetId=o._find(id)?.id;sim.bus.emit('scan:pulse',{source:'player-scanner',seq:++seq});};
 const align=(id='a')=>{const e=o._find(id);e.pos.x=C.center.x+8;e.pos.z=C.center.z;e.rot=Math.PI;return e;};
 const recover=(id='a')=>{align(id);step(8);scan(id);assert(o._row.recoveredFragmentIds.includes(R.find(r=>r.id===id).evidenceId));};
 const lose=id=>{const e=o._find(id);e.alive=false;sim.bus.emit('entity:killed',{targetId:e.id});sim.helpers.removeEntity(e.id);};
 return {sim,s,p,o,step,scan,align,recover,lose,offers,get card(){return card;},close(){borrowedVoicePrompt.destroy();setPromptDeck(null);sim.dispose();}};
}

test('R1 silence, deliberate R2 scan, then complete evidence alongside physical instructions',()=>{
 const h=fixture(1);try{h.step(8);h.scan();assert.equal(h.offers.length,0);assert.equal(h.card,undefined);
 ensureAlienEcologyState(h.s).revelation=2;h.step();assert.equal(h.offers.length,0,'no arrival prompt');h.scan('ring');
 assert.match(h.card.detail,/original housing.*clear of shielding/);assert.match(h.card.detail,/1.2 seconds/);assert.match(h.card.detail,/scan that housing within 110 m/);
 h.recover();assert.match(h.card.detail,/aim its antenna/);assert(h.card.detail.includes(R[0].text));assert.match(h.card.detail,/Source continuity remains unconfirmed/);
 assert.equal(h.card.choices.at(-1).label,'KEEP INVESTIGATING');
 }finally{h.close();}
});

test('actual receiver and unrecovered source losses stop impossible advice, while recovered loss preserves words',()=>{
 const h=fixture();try{h.lose('ring');h.lose('b');h.scan();
 assert.match(h.card.detail,/original receiver is lost/);assert.match(h.card.detail,/Shift register.*unrecovered|Lost unrecovered sources: Shift register/);
 assert.doesNotMatch(h.card.detail,/aim its antenna|Hold a clear/);assert.equal(h.card.choices.at(-1).label,'CLOSE RECORD');
 assert.match(borrowedVoiceScannerReading(h.s,h.o._find('a')).detail,/receiver lost/);
 }finally{h.close();}
 const k=fixture();try{k.recover();k.lose('a');k.scan('ring');assert(k.card.detail.includes(R[0].text));assert.doesNotMatch(k.card.detail,/Lost unrecovered sources: Receiver Two/);
 }finally{k.close();}
});

test('holding, ready, expired, future, recycled-life and lost-alignment samples are distinguished',()=>{
 const h=fixture();try{const e=h.align();h.step();assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'holding');
 assert.match(borrowedVoiceScannerReading(h.s,e).detail,/Keep it clear/);h.step(8);
 assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'ready');assert.match(borrowedVoiceScannerReading(h.s,e).detail,/Scan this housing/);
 const signal=h.o._signals.get('a'),at=signal.at;signal.at=h.s.simTime+1;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');
 signal.at=at-1;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');signal.at=at;
 e.rot=0;h.step();assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'interference');h.scan();assert.equal(h.o._row.recoveredFragmentIds.length,0);
 e.occupantGeneration++;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');assert.equal(borrowedVoiceScannerReading(h.s,e),null);
 }finally{h.close();}
});

test('missing, shelved, unbound and native-unready originals are unavailable, never destroyed',()=>{
 for(const boundary of ['missing-ring','missing-source','unbound','shelved','native']){const h=fixture();try{
 h.align();h.step(8);const e=h.o._find('a'),ring=h.o._find('ring');
 if(boundary==='missing-ring')h.s.entities.delete(ring.id);
 if(boundary==='missing-source')h.s.entities.delete(e.id);
 if(boundary==='unbound')h.o._bindings.delete('a');
 if(boundary==='shelved')h.sim.bus.emit('sector:exit');
 if(boundary==='native')h.s.settings.gameplay.physicsBackend='rapier-dynamic';
 const p=borrowedVoiceRecoveryProjection(h.s);assert.equal(p.a.phase,'unavailable',boundary);
 const g=borrowedVoiceRecoveryGuidance(h.o._row,p);assert.doesNotMatch(g.text,/original receiver is lost|Lost unrecovered sources/);
 assert(!['destroyed','lost'].includes(h.o._row.ringOutcome));assert(!['destroyed','lost'].includes(h.o._row.recorderOutcomeIds.a.status));
 }finally{h.close();}}
});

test('archive permits further evidence but no second payment; quarantine is silent and not resumable',()=>{
 for(const disposition of ['archive','quarantine']){const h=fixture();try{h.recover();const stale=h.card;
 h.card.onChoose(disposition);const paid=h.s.player.credits;assert.equal(paid,disposition==='archive'?C.archiveCr:0);
 if(disposition==='archive'){assert.match(h.card.detail,/further recovered words add evidence/);h.recover('b');assert.equal(h.o._row.recoveredFragmentIds.length,2);}
 else {h.align('b');h.step(8);h.scan('b');assert.equal(h.o._row.recoveredFragmentIds.length,1);assert.match(h.card.detail,/cannot resume recovery/);assert.equal(h.card.choices.at(-1).label,'CLOSE RECORD');assert.equal(h.o._signals.size,0);}
 stale.onChoose('archive');assert.equal(h.s.player.credits,paid);assert.equal(h.o._row.disposition,disposition);
 }finally{h.close();}}
});

test('all recovered and all remaining sources lost use neutral dismissal without erasing evidence',()=>{
 for(const complete of [false,true]){const h=fixture();try{h.recover();if(complete){h.recover('b');h.recover('c');}else{h.lose('b');h.lose('c');h.scan('ring');}
 assert.equal(h.card.choices.at(-1).label,'CLOSE RECORD');assert(h.card.detail.includes(R[0].text));
 assert.match(h.card.detail,complete?/All three original fragments/:/No unrecovered original housing survives/);
 }finally{h.close();}}
});

test('formatting and projection cannot mutate durable rows, poses, bindings, signals or wallet',()=>{
 const h=fixture();try{h.recover();const snapshot=()=>JSON.stringify({row:h.o._row,poses:h.s.entityList.map(e=>[e.id,e.pos,e.rot]),
 bindings:[...h.o._bindings].map(([id,b])=>[id,b.e.id,b.life]),signals:[...h.o._signals].map(([id,v])=>[id,{...v,entity:v.entity.id}]),credits:h.s.player.credits});
 const before=snapshot();for(let i=0;i<12;i++){const p=borrowedVoiceRecoveryProjection(h.s);borrowedVoiceRecoveryGuidance(h.o._row,p);borrowedVoiceScannerReading(h.s,h.o._find('b'));}
 assert.equal(snapshot(),before);
 }finally{h.close();}
});

test('presentation and native admission override an otherwise ready cached signal',()=>{
 const h=fixture();try{const a=h.align(),ring=h.o._find('ring');h.step(8);
 h.s.render={scene:{}};a.presentationAdmission='ready';ring.presentationAdmission='ready';assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'ready');
 for(const entity of [a,ring]){entity.presentationAdmission='pending';assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');entity.presentationAdmission='ready';}
 h.s.settings.gameplay.physicsBackend='rapier-dynamic';assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');
 h.s.settings.gameplay.physicsBackend='legacy';h.o._row.ringOutcome='destroyed';assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');
 assert.match(borrowedVoiceScannerReading(h.s,a).detail,/receiver lost/);
 }finally{h.s.render=null;h.close();}
});

import {createAuthoritativeRuntime} from '../src/runtime/createAuthoritativeRuntime.js';
import {snapshotFeatureMaps,applyFeatureConfigToMaps,restoreFeatureMaps} from '../src/data/featureFlags.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
const external=(runtime,fn)=>{const old=snapshotFeatureMaps();applyFeatureConfigToMaps(runtime.config.features);try{return fn();}finally{restoreFeatureMaps(old);}};

test('native production save mid-investigation and after archive/receiver loss retains honest recovery guidance',async()=>{
 let current=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:816});
 try{let s=current.state;s.mode='flight';ensureAlienEcologyState(s).revelation=2;
 const player=current.spawn(makeShipEntitySpec('ship_hawser',{isPlayer:true,player:s.player,pos:{x:0,z:0},fittings:[]}));s.playerId=player.id;
 external(current,()=>current.getSystem('world').enterSector(C.sectorId,{continuous:false,noTeleport:true,placePlayer:false}));
 external(current,()=>current.getSystem('world').relocatePlayerInSector({x:C.center.x+70,z:C.center.z+40,heading:0},{reason:'borrowed-voice-guidance-test'}));
 assert.equal(await current.getSystem('physics').prepareBackend(s,{reset:true}),true);current.step(1/60);current.step(1/60);
 let owner=current.getSystem('borrowedVoice');const a=owner._find('a'),identity=a.data.worldRecordId;
 const body=current.getSystem('physics')._sg02.records.get(a.id).body;
 // Deliberate native fixture placement, NOT ordinary gate flight or camera acceptance.
 body.setTranslation({x:C.center.x+7,y:0,z:C.center.z},true);body.setRotation({x:0,y:-1,z:0,w:0},true);body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);
 for(let i=0;i<110;i++)current.step(1/60);
 assert.equal(borrowedVoiceRecoveryProjection(s).a.phase,'ready');s.player.targetId=a.id;
 s.input.actions.scanPulse=true;external(current,()=>current.getSystem('scanner').update(1/60,s));
 assert.deepEqual(owner._row.recoveredFragmentIds,[R[0].evidenceId]);
 const reload=async()=>{const envelope=current.getSystem('save').serialize('borrowed-guidance');current.dispose();current=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:817});
 assert.equal(await current.getSystem('save').loadEnvelope(envelope,'borrowed-guidance'),true);s=current.state;s.mode='flight';owner=current.getSystem('borrowedVoice');
 assert.equal(await current.getSystem('physics').prepareBackend(s),true);for(let i=0;i<60;i++)current.step(1/60);};
 await reload();assert.equal(owner._find('a').data.worldRecordId,identity);assert.equal(owner._row.disposition,'open');
 let offer;current.bus.on('borrowedVoice:offer',r=>offer=r);s.player.targetId=owner._find('a').id;current.bus.emit('scan:pulse',{source:'player-scanner',seq:100});
 assert(offer.text.includes(R[0].text));assert.match(offer.guidance,/1.2 seconds/);
 assert(owner.choose('archive',owner._row.evidenceRevision).ok);const paid=s.player.credits;
 for(const id of ['ring','b']){const e=owner._find(id);e.alive=false;current.bus.emit('entity:killed',{targetId:e.id});current.getHelpers().removeEntity(e.id);}
 await reload();assert.equal(owner._find('ring'),null);assert.equal(owner._find('b'),null);assert.equal(owner._find('a').data.worldRecordId,identity);
 assert.equal(owner._row.disposition,'archive');assert.equal(s.player.credits,paid);assert.equal(owner.choose('archive',owner._row.evidenceRevision).ok,false);
 current.bus.on('borrowedVoice:offer',r=>offer=r);s.player.targetId=owner._find('a').id;current.bus.emit('scan:pulse',{source:'player-scanner',seq:101});
 assert(offer.text.includes(R[0].text));assert.match(offer.guidance,/original receiver is lost/);assert.match(offer.guidance,/Lost unrecovered sources: Shift register/);
 assert.equal(offer.dismissLabel,'CLOSE RECORD');assert.equal(s.player.credits,paid);
 }finally{current?.dispose();}
});

import {readFileSync} from 'node:fs';
import {createBus} from '../src/core/eventBus.js';
import {createGameState} from '../src/core/gameState.js';
import {createRegistry} from '../src/core/registry.js';
import {createSimHost} from '../scripts/lib/simWorkerHost.mjs';
import {createSimLaneRuntime} from '../src/core/simLaneMain.js';

test('production host offer reaches the main registry adapter and its revision-bound action returns to authority',async()=>{
 const host=createSimHost(),mainState=createGameState(816),mainBus=createBus(),posts=[];let receive,card,lane,adapter;
 const ctx={state:mainState,bus:mainBus,helpers:{},simLane:'worker'};
 const registry=createRegistry(ctx);ctx.registry=registry;
 try{adapter=registry.get('borrowedVoicePrompt');assert.equal(adapter?.name,'borrowedVoicePrompt','main registry must retain the actual deck adapter');
 setPromptDeck({offerDecision(r){card=r;return true;},resolveDecision(){card=null;}});adapter.init(ctx);
 const scenarioContract=JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json',import.meta.url),'utf8'));
 lane=createSimLaneRuntime({state:mainState,bus:mainBus,registry,helpers:{scenarioContract},flags:{lane:'worker',warnings:[],sab:false},
 channelFactory:()=>({post:m=>posts.push(m),onMessage:fn=>{receive=fn;},terminate(){}})});
 const init=posts.shift(),ready=await host.init(init);receive({...structuredClone(ready),kind:'ready',seq:init.seq});await lane.readyPromise;
 assert.equal(host.host.registry.get('borrowedVoicePrompt'),null,'worker must not own the main deck adapter');
 const {state:s,runtime}=host.host,owner=host.host.registry.get('borrowedVoice');s.mode='flight';s.run.kind='adventure';s.run.phase='inactive';s.settings.gameplay.physicsBackend='legacy';
 s.world.currentSectorId=C.sectorId;ensureAlienEcologyState(s).revelation=2;
 s.playerId=runtime.spawn({type:'ship',mass:28,hull:100,radius:8,collides:false,pos:{x:C.center.x+70,z:C.center.z+40}}).id;
 owner.update(.2,s);const a=owner._find('a');a.pos.x=C.center.x+8;a.pos.z=C.center.z;a.rot=Math.PI;
 for(let i=0;i<8;i++){s.simTime+=.2;owner.update(.2,s);}s.player.targetId=a.id;host.host.bus.emit('scan:pulse',{source:'player-scanner',seq:1});
 assert.equal(card,undefined,'worker emission alone cannot touch the page deck');
 let tick=0;const pump=async()=>{lane.runner.prepareWithoutAdvance();const messages=posts.splice(0);for(const msg of messages){if(msg.kind!=='tick')continue;
 const reply=await host.tick({...msg,steps:0,tick:++tick});receive({...structuredClone(reply),kind:'tickDone',seq:msg.seq});}};
 await pump();assert(card?.detail.includes(R[0].text));assert.match(card.detail,/1.2 seconds/);
 const revision=owner._row.evidenceRevision,stale=card;card.onChoose('archive');assert.equal(owner._row.disposition,'open','main click waits for worker command drain');
 await pump();assert.equal(owner._row.disposition,'archive');assert.equal(s.player.credits,C.archiveCr);assert(owner._row.evidenceRevision>revision);
 stale.onChoose('archive');await pump();assert.equal(s.player.credits,C.archiveCr);
 }finally{adapter?.destroy();setPromptDeck(null);lane?.close();host.shutdown();}
});

test('native restore, proxy revision, post-step and sim-tick admission gate ready guidance',()=>{
 const h=fixture();const registry=h.o.ctx.registry;try{h.align();h.step(8);const a=h.o._find('a'),ring=h.o._find('ring');
 const native={tick:10,_simTick:h.s.tick,records:new Map()};for(const e of [a,ring])native.records.set(e.id,{entity:e,body:{},proxyId:e.physicsBody.collisionProxyManifest.id,revision:e.physicsBody.revision,_postStepReadTick:10});
 const physics={_sg02:native};h.o.ctx.registry={get:id=>id==='physics'?physics:registry.get(id)};h.s.settings.gameplay.physicsBackend='rapier-dynamic';
 assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'ready');
 for(const key of ['_nativeRestorePending','_nativeRestoreDeferred']){physics[key]=true;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');physics[key]=false;}
 const row=native.records.get(a.id);row._postStepReadTick=9;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');row._postStepReadTick=10;
 row.revision++;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');row.revision--;
 const proxy=row.proxyId;row.proxyId='foreign';assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');row.proxyId=proxy;
 native._simTick=h.s.tick-3;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');native._simTick=h.s.tick+1;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');
 native._simTick=h.s.tick;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'ready');
 }finally{h.o.ctx.registry=registry;h.close();}
});

test('a recovered housing scanned beyond the site never offers an inadmissible disposition',()=>{
 const h=fixture();try{h.recover();const a=h.o._find('a');h.p.pos.x=C.center.x+C.siteRange+20;h.p.pos.z=C.center.z;
 a.pos.x=h.p.pos.x;a.pos.z=h.p.pos.z;h.scan();assert.deepEqual(h.card.choices.map(c=>c.id),['close']);assert(h.card.detail.includes(R[0].text));
 assert.equal(h.o._row.disposition,'open');assert.equal(h.s.player.credits,0);
 h.p.pos.x=C.center.x+70;a.pos.x=C.center.x+8;h.scan();assert(h.card.choices.some(c=>c.id==='archive'));
 }finally{h.close();}
});

test('malformed cached readings never announce ready or publish nonfinite signal percentages',()=>{
 const h=fixture();try{h.align();h.step(8);const signal=h.o._signals.get('a'),original={...signal};
 for(const [key,value] of [['at',NaN],['at',Infinity],['quality',NaN],['quality',1.1],['quality',-.1],['clearSince',-Infinity],['clearSince',NaN],['clearSince',h.s.simTime+1]]){
 Object.assign(signal,original,{[key]:value});const p=borrowedVoiceRecoveryProjection(h.s).a;assert.equal(p.phase,'unavailable',key);assert.equal(p.quality,null);}
 Object.assign(signal,original);const time=h.s.simTime;h.s.simTime=NaN;assert.equal(borrowedVoiceRecoveryProjection(h.s).a.phase,'unavailable');h.s.simTime=time;
 }finally{h.close();}
});
