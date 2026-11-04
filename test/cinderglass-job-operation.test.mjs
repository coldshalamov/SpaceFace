// Isolated production-owner integration fixtures; these are not an ordinary earned playthrough.
import test from 'node:test';
import assert from 'node:assert/strict';
import { candidateScene, placeBody } from './cinderglass-job-fixture.mjs';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { cinderglassJobAdmit, cinderglassJobStepConvoy } from '../src/features/cinderglassJob/convoy.js';
import { cinderglassJobReleasePod, cinderglassJobReceiveQuote, nativeCinderglassAttachment } from '../src/features/cinderglassJob/custody.js';
import { CINDERGLASS_JOB_POINTS as POINTS } from '../src/features/cinderglassJob/definition.js';
import { latchWorld, cinderglassJobServiceGate } from '../src/features/cinderglassJob/interception.js';
import { buildCinderglassJobView } from '../src/features/cinderglassJob/readModel.js';

function inspectionFixture(t) {
  const c = t.body('carrierId'), delta = { x: POINTS.pullOff.x - c.pos.x, z: POINTS.pullOff.z - c.pos.z };
  for (const key of ['carrierId','podId','latchId']) { const e = t.body(key); placeBody(t,e,{x:e.pos.x+delta.x,z:e.pos.z+delta.z}); }
  const entry = t.state.npcJobs.byId[t.cg().entities.carrierJobId];
  entry.job.routeIndex = 1; entry.job.phase = 'transit'; entry.job.progress = 0;
  placeBody(t,t.player,{x:POINTS.pullOff.x-100,z:POINTS.pullOff.z});
  // Earned scan knowledge is seeded ONLY in this transaction fixture. Visibility has its own owner checks.
  t.cg().scanDone = true; t.cg().phase = 'decide';
  cinderglassJobStepConvoy(t.sys,t.state);
  assert.equal(t.cg().atLayby,true);
}
function receivingFixture(t, recipient, damaged=false) {
  if (t.cg().custody==='carried') assert.equal(cinderglassJobReleasePod(t.sys,t.state,{actorId:t.body('carrierId').id,reason:'fixture-release'}).ok,true);
  const receiver=t.body(recipient==='tala'?'cradleId':'brokerId'), pod=t.body('podId');
  placeBody(t,pod,{x:receiver.pos.x+45,z:receiver.pos.z});
  placeBody(t,t.player,{x:receiver.pos.x+90,z:receiver.pos.z});
  if(damaged) pod.hull=65;
  t.cg().phase='recovery';
  return cinderglassJobReceiveQuote(t.sys,t.state,recipient);
}

test('ordinary contact gate uses actual first campaign delivery, no unsolicited flight offer',async()=>{
  const t=await candidateScene(); t.step(4); assert.equal(t.state.cinderglassJobOffer,null);
  t.state.story.campaign47a.stepProgress['1'].completed=[];
  t.state.player.stats.missionsDone=20;
  assert.equal(t.action('contact').ok,false);
  t.state.story.campaign47a.stepProgress['1'].completed=['alloy_run'];
  assert.equal(t.action('contact').ok,true);
  assert.equal(t.state.cinderglassJobOffer.terms.depositCr,150);
  assert.equal(t.originalCount(),0);
});

test('real economy exact deposit commits once; suspicion, short balance and stale life refuse without debit',async()=>{
  const t=await candidateScene(); await t.accept(); inspectionFixture(t);
  const cash=t.state.player.credits;
  t.cg().suspicion=3; assert.equal(t.action('propose').ok,false); assert.equal(t.state.player.credits,cash);
  t.cg().suspicion=0; t.state.player.credits=100; assert.equal(t.action('propose').ok,false); assert.equal(t.state.player.credits,100);
  t.state.player.credits=cash;
  assert.equal(t.action('propose',{token:'old-life'}).ok,false); assert.equal(t.state.player.credits,cash);
  assert.equal(t.action('propose').ok,true); assert.equal(t.state.player.credits,cash-150);
  assert.equal(t.cg().depositPaid,true); assert.equal(t.cg().actors.dask.dealAccepted,true);
  assert.equal(t.action('propose').ok,false); assert.equal(t.state.player.credits,cash-150);
});

test('exact debit commits feature state before a credits listener captures a full save',async()=>{
  const t=await candidateScene(); await t.accept(); inspectionFixture(t);
  let saved;
  t.bus.on('credits:changed',p=>{if(p.delta===-150) saved=t.sim.registry.get('save').serializeData();});
  assert.equal(t.action('propose').ok,true);
  assert.equal(saved.player.credits,4850); assert.equal(saved.world.cinderglassJob.depositPaid,true);
  assert.equal(saved.world.cinderglassJob.actors.dask.dealAccepted,true);
});

test('a debit listener can Continue without accepting old-life callbacks or repeating the deposit',async()=>{
  const t=await candidateScene(); await t.accept(); inspectionFixture(t);
  const old=t.sys.token(); let restored=false;
  t.bus.on('credits:changed',p=>{if(p.delta===-150&&!restored){restored=true; const saved=t.sim.registry.get('save').serializeData();
    assert.equal(t.sim.registry.get('save')._restore(saved,'reentrant-cinderglass').restored,true);}});
  assert.equal(t.action('propose').ok,true); t.step(2);t.ack();
  assert.equal(t.state.player.credits,4850);assert.equal(t.cg().depositPaid,true);
  assert.equal(t.action('propose',{token:old}).ok,false);assert.equal(t.state.player.credits,4850);
  assert.equal(t.originalCount(),1);
});

test('same-seed replacement runtime cannot consume a different original life choice',async()=>{
  const first=await candidateScene(), second=await candidateScene();
  assert.equal(first.action('contact').ok,true);assert.equal(second.action('contact').ok,true);
  assert.notEqual(first.sys.token(),second.sys.token());
  assert.equal(second.action('accept',{token:first.sys.token(),offerEpoch:second.cg().offerEpoch}).ok,false);
  assert.equal(second.originalCount(),0);
});

test('native quiet action exposes both public choices, interrupts, then releases the same original after retry',async()=>{
  const t=await candidateScene();await t.accept();inspectionFixture(t);
  const lw=latchWorld(t.sys,t.state), pos={x:lw.x-50,z:lw.z-20};
  placeBody(t,t.player,pos);
  assert.equal(cinderglassJobServiceGate(t.sys,t.state).ok,true);
  t.sys._publishApproachPrompts();
  assert.ok(t.cg().approachPrompt.choices.some(c=>c.id==='propose'));
  assert.ok(t.cg().approachPrompt.choices.some(c=>c.id==='serviceStart'));
  assert.equal(t.action('serviceStart').ok,true);t.step(30);
  placeBody(t,t.player,pos,{x:10,z:0});t.step();
  assert.equal(t.cg().serviceActive,false);assert.equal(t.cg().custody,'carried');
  placeBody(t,t.player,pos);assert.equal(t.action('serviceStart').ok,true);
  assert.ok(t.until(()=>t.cg().custody==='released',340),JSON.stringify(t.cg().lastRefusal));
  assert.equal(t.cg().approach,'quiet');assert.equal(t.originalCount(),1);
});

test('actual combat external-latch death cuts original once and Continue never rebuilds the destroyed latch',async()=>{
  const t=await candidateScene({withLaw:true});await t.accept();
  const latch=t.body('latchId'), pod=t.body('podId'), c=t.sim.registry.get('combat');
  placeBody(t,t.player,{x:latch.pos.x-50,z:latch.pos.z});
  assert.equal(c.onHit({targetId:latch.id,ownerId:t.player.id,damage:80,damageType:'kinetic',pos:latch.pos}).ok,true);
  t.step(2);
  assert.equal(t.cg().approach,'violent');assert.equal(t.cg().custody,'released');
  assert.equal(t.body('podId'),pod);assert.equal(t.cg().forceUnlawful,true);
  const saved=t.sim.registry.get('save').serializeData();t.restore(saved);
  assert.equal(t.cg().custody,'released');assert.equal(t.originalCount(),1);
  assert.equal(t.originalCount('latchId'),0);assert.equal(t.state.player.credits,5000);
});

test('third-party latch destruction frees the same original without branding the player violent',async()=>{
  const t=await candidateScene({withLaw:true});await t.accept();
  const pirate=t.sim.spawn(makeShipEntitySpec('ship_wasp',{team:1,factionId:'faction_pirate',pos:{x:0,z:0}}));
  const latch=t.body('latchId'), pod=t.body('podId'), c=t.sim.registry.get('combat');
  assert.equal(c.onHit({targetId:latch.id,ownerId:pirate.id,damage:80,damageType:'kinetic',pos:latch.pos}).ok,true);
  t.step(2);
  assert.equal(t.cg().custody,'released');assert.equal(t.body('podId'),pod);
  assert.equal(t.cg().latchDestroyed,true);assert.equal(t.cg().approach,null);
  assert.notEqual(t.cg().forceUnlawful,true);
  assert.ok(t.cg().rememberedFacts.some(f=>f.id==='latch_lost'));
  assert.ok(!t.cg().rememberedFacts.some(f=>f.id==='released_violent'));
});

test('repeat admission accepts only the current canonical job and generation', async () => {
  const t = await candidateScene(); await t.accept();
  t.sys._rebind(t.state);
  const st = t.cg(), id = st.entities.carrierJobId, e = t.body('carrierId');
  const entry = t.state.npcJobs.byId[id];
  assert.equal(cinderglassJobAdmit(t.sys, t.state), true);
  st.entities.carrierJobId = 'job:wrong';
  t.state.npcJobs.byId['job:wrong'] = { ...entry, job: { ...entry.job, id: 'job:wrong' } };
  assert.equal(cinderglassJobAdmit(t.sys, t.state), false);
  assert.equal(st.admissionReason, 'traffic_assignment_conflict');
  delete t.state.npcJobs.byId['job:wrong']; st.entities.carrierJobId = id;
  entry.entityRef = { ...e };
  assert.equal(cinderglassJobAdmit(t.sys, t.state), false, 'recycled numeric id cannot adopt old entity');
  entry.entityRef = e;
  const generation = e.occupantGeneration; e.occupantGeneration++;
  assert.equal(cinderglassJobAdmit(t.sys, t.state), false, 'old role binding cannot authorize a new generation');
  e.occupantGeneration = generation;
});

test('an unattributed latch kill records an unknown cause', async () => {
  const t = await candidateScene(); await t.accept();
  const latch = t.body('latchId');
  assert.equal(t.sim.registry.get('combat').onHit({ targetId: latch.id, damage: 80, damageType: 'kinetic', pos: latch.pos }).ok, true);
  t.step(2);
  const fact = t.cg().rememberedFacts.find(f => f.id === 'latch_lost');
  assert.match(fact.text, /cause is unconfirmed/);
  assert.equal(t.cg().approach, null);
});

for(const released of [false,true]) test(`full actual save owner preserves ${released?'released':'carried'} original, jobs and receiving roles`,async()=>{
  const t=await candidateScene(); await t.accept();
  if(released) assert.equal(cinderglassJobReleasePod(t.sys,t.state,{actorId:t.body('carrierId').id,reason:'fixture'}).ok,true);
  const before=t.body('podId'); before.hull=91;
  t.state.world.breakwaterSpur.phase='signaled';t.state.world.counterweightCircuit.discovered=true;
  const saved=t.sim.registry.get('save').serializeData();
  assert.ok(saved.world.breakwaterSpur);assert.ok(saved.world.counterweightCircuit);assert.ok(saved.world.cinderglassJob);
  const oldToken=t.sys.token(); t.restore(saved);
  assert.equal(t.state.world.breakwaterSpur.phase,'signaled');assert.equal(t.state.world.counterweightCircuit.discovered,true);
  assert.notEqual(t.sys.token(),oldToken);
  assert.equal(t.originalCount(),1); assert.equal(t.body('podId').hull,91);
  assert.equal(t.cg().outcome,null); assert.notEqual(t.cg().phase,'closed');
  assert.equal(t.cg().custody,released?'released':'carried');
  for(const key of ['carrierId','cradleId','brokerId','laybyId','latchId']) assert.ok(t.body(key),key);
  assert.equal(t.cg().entities.carrierJobId,'job:pro:cinderglassJob:carrier');
  if(!released) assert.ok(nativeCinderglassAttachment(t.sys,t.state,t.sim.registry.get('combat').kernel.attachments.get(t.cg().entities.clampAttachmentId)));
  assert.equal(t.action('serviceStart',{token:oldToken}).reason,'stale_life');
});

test('native broker receive requires explicit quote, intact original and real cargo custody; one canonical payment through Continue',async()=>{
  const t=await candidateScene({withLaw:true}); await t.accept();
  let quote=receivingFixture(t,'broker',true);
  assert.equal(quote,null); assert.equal(t.action('receiveBroker',{quoteId:'forged'}).ok,false); assert.equal(t.state.player.credits,5000);
  t.body('podId').hull=130; quote=cinderglassJobReceiveQuote(t.sys,t.state,'broker'); assert.ok(quote);
  t.step(1); // Presence by itself never pays or transfers.
  assert.equal(t.state.player.credits,5000); assert.equal(t.cg().settlement,null);
  quote=receivingFixture(t,'broker');
  assert.equal(t.action('receiveBroker',{quoteId:quote.quoteId}).ok,true);
  assert.equal(t.cg().outcome.id,'sold_broker'); assert.equal(t.state.player.credits,5300);
  assert.equal(t.body('podId').ownerId,'manifest_vesi_khand');
  const joint=t.sim.registry.get('combat').kernel.attachments.get(t.cg().entities.brokerAttachmentId);
  assert.ok(nativeCinderglassAttachment(t.sys,t.state,joint));
  t.step(2); assert.ok(t.cg().lawReceipt,'canonical law owner accepted or denied the actual witnessed report');
  assert.ok(t.state.factions.faction_mts.rep < 0,'real manifest-holder standing owner accepts the consequence');
  assert.ok(t.state.factions.faction_quiet.rep > 0,'real fence standing owner accepts the consequence');
  const saved=t.sim.registry.get('save').serializeData(); t.restore(saved);
  assert.equal(t.originalCount(),1); assert.equal(t.state.player.credits,5300);
  assert.equal(t.cg().outcome.id,'sold_broker'); assert.equal(t.body('podId').ownerId,'manifest_vesi_khand');
  const econ=t.sim.registry.get('economy');
  assert.equal(econ.settleCinderglassResult(t.cg().operationId,t.cg().custodyReceipt.receiptId).duplicate,true);
  assert.equal(t.state.player.credits,5300);
});

test('Tala without a paid deposit publishes only its canonical payment, including an old saved paid sentence',async()=>{
  const t=await candidateScene();
  try {
    await t.accept();
    const facts=[]; t.bus.on('cinderglassJob:fact',f=>facts.push(f));
    const q=receivingFixture(t,'tala');
    assert.equal(q.baseCr,450); assert.equal(q.refundCr,0);
    assert.equal(t.action('receiveTala',{quoteId:q.quoteId}).ok,true); t.step();
    assert.equal(t.cg().settlement.creditedCr,450);
    assert.equal(t.cg().depositPaid,false); assert.equal(t.cg().depositRefunded,false);
    assert.equal(t.state.player.credits,5450);
    const published=facts.find(f=>f.id==='paid');
    assert.match(published.text,/450CR paid/);
    assert.doesNotMatch(published.text,/deposit/i);
    // The actual pre-fix save contains this historical sentence beside a truthful receipt.
    const paid=t.cg().rememberedFacts.find(f=>f.id==='paid');
    paid.text='Controller checks out. Papers settled — deposit back with the payment.';
    const saved=t.sim.registry.get('save').serializeData(); t.restore(saved);
    const settlement=structuredClone(t.cg().settlement), history=t.cg().rememberedFacts.find(f=>f.id==='paid').text;
    const journal=buildCinderglassJobView(t.state).journal.facts.find(f=>f.id==='paid');
    assert.match(journal.text,/450CR paid/); assert.doesNotMatch(journal.text,/deposit/i);
    assert.equal(t.cg().rememberedFacts.find(f=>f.id==='paid').text,history,'projection preserves recorded history');
    assert.deepEqual(t.cg().settlement,settlement); assert.equal(t.state.player.credits,5450);
  } finally {t.sim.dispose();}
});

test('Tala accepted damaged original pays its quote and refunds only an actual committed deposit once',async()=>{
  const t=await candidateScene(); await t.accept(); inspectionFixture(t);
  assert.equal(t.action('propose').ok,true);
  const q=receivingFixture(t,'tala',true);
  assert.equal(q.baseCr,300); assert.equal(q.refundCr,150); assert.equal(q.amount,450);
  assert.equal(t.action('receiveTala',{quoteId:q.quoteId}).ok,true);
  assert.equal(t.cg().outcome.id,'returned_damaged'); assert.equal(t.cg().depositRefunded,true);
  assert.equal(t.state.player.credits,5300);
  const paid=buildCinderglassJobView(t.state).journal.facts.find(f=>f.id==='paid');
  assert.match(paid.text,/300CR for a damaged original/);
  assert.match(paid.text,/paid 150CR inspection deposit returned/);
  assert.doesNotMatch(paid.text,/450CR.*150CR/,'credited total is not described as base payment plus another refund');
  const saved=t.sim.registry.get('save').serializeData(); t.restore(saved);
  assert.equal(t.state.player.credits,5300); assert.equal(t.cg().depositRefunded,true);
  assert.equal(t.action('receiveTala',{quoteId:q.quoteId}).ok,false);
  assert.equal(t.state.player.credits,5300);
});

test('New Game and destroy reject old choices and leave no owned native jobs or clamps',async()=>{
  const t=await candidateScene(); await t.accept(); const token=t.sys.token();
  const ids=[...t.sys._bindings.values()].map(b=>b.entity.id);
  t.sys.newGame();
  assert.notEqual(t.sys.token(),token);
  assert.equal(t.action('contact',{token}).ok,false);
  assert.equal(ids.some(id=>t.state.entities.get(id)?.alive===true),false);
  t.step(2); // Canonical core sweeps dead originals at its normal boundary.
  assert.equal(ids.some(id=>t.state.entities.has(id)),false);
  assert.equal(Object.keys(t.state.npcJobs.byId).some(k=>k.includes('cinderglassJob')),false);
  assert.equal(Object.values(t.state.combat.attachments.byId).some(a=>a.state==='active'&&(ids.includes(a.ownerId)||ids.includes(a.targetId))),false);
  assert.equal(t.action('contact').ok,true); const offer=t.cg().offerEpoch; const old=t.sys.token();
  t.sys.newGame(); assert.equal(t.action('contact').ok,true);
  assert.equal(t.action('accept',{offerEpoch:offer,token:old}).ok,false);
  t.sys.destroy();
});
