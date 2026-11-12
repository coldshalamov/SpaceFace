// Focused native-physics evidence using the current production encounter catalog.
// Encounter, registry, and save hooks already exist; this fixture explicitly selects the
// real systems needed for the choice and tow. It does not claim rendered UI/playthrough acceptance.
import test from 'node:test';
import assert from 'node:assert/strict';

const { createSimulation, SIM_DT } = await import('../src/core/sim.js');
const { createBus } = await import('../src/core/eventBus.js');
const { physics } = await import('../src/core/physics.js');
const { queuePhysicsImpulse } = await import('../src/core/physicsAuthority.js');
const { combat } = await import('../src/systems/combat.js');
const { scalarHitToDamagePacket } = await import('../src/combat/damage.js');
const { flightV3 } = await import('../src/systems/flightV3.js');
const { aiPorts } = await import('../src/systems/aiPorts.js');
const { economy } = await import('../src/systems/economy.js');
const { mining } = await import('../src/systems/mining.js');
const { spawnBudget } = await import('../src/systems/spawnBudget.js');
const { ships, makeShipEntitySpec } = await import('../src/systems/ships.js');
const { default: npcJobsRuntime } = await import('../src/systems/npcJobsRuntime.js');
const { save } = await import('../src/save/saveSystem.js');
const { fnv1a } = await import('../src/save/checksum.js');
const { encounterDirector, planEncountersDay } = await import('../src/systems/encounterDirector.js');
const { ENCOUNTERS } = await import('../src/data/encounters.js');
const { zonesForSector } = await import('../src/data/sectorZones.js');
const { sectorGlobalOrigin } = await import('../src/data/sectorCoordinates.js');
const encounter = await import('../src/data/encounters/8204-pro-salvage-outfits.js');
const { routeDigit } = await import('../src/ui/promptDeck.js');
const { createSalvageOutfitsPhysical } = await import('../src/features/salvageOutfits/physical.js');
const { createSalvageOutfitsPresentation } = await import('../src/features/salvageOutfits/presentation.js');
const { getSalvageOutfitsReadModel, salvageOutfitEntity } = await import('../src/features/salvageOutfits/readModel.js');
const { freshSalvageOutfits, makeSalvageMeeting, normalizeSalvageOutfits,
  captureSalvageOutfits, restoreSalvageOutfits } = await import('../src/features/salvageOutfits/persistence.js');
const { salvageOutfitsDiscoveryId } = await import('../src/features/salvageOutfits/discovery.js');

const SECTOR = 'sector_ceres_belt';
const ANCHOR = sectorGlobalOrigin(SECTOR);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const total = pool => Object.values(pool || {}).reduce((n, q) => n + q, 0);
const clone = value => JSON.parse(JSON.stringify(value));

async function boot({ variant = 'split_drift', seed = 4242, start = true, native = true, playerPos = null } = {}) {
  const { salvageOutfits } = await import('../src/features/salvageOutfits/index.js');
  const sim = createSimulation({ seed,
    systems: [spawnBudget, ships, physics, combat, economy, mining, aiPorts, flightV3, npcJobsRuntime, encounterDirector, salvageOutfits, save],
    updateOrder: [flightV3, salvageOutfits, npcJobsRuntime, aiPorts, combat, physics],
  });
  const { state, bus } = sim;
  state.mode = 'flight'; state.timeScale = 1;
  state.world.currentSectorId = SECTOR;
  state.world.activeSector = { id: SECTOR, pois: [], stations: [
    { id: 'station_ceres', name: 'Ceres Refinery', pos: { x: ANCHOR.x + 450, z: ANCHOR.z } },
  ] };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: state.player, pos: playerPos || { x: ANCHOR.x, z: ANCHOR.z + 180 },
  }));
  state.playerId = player.id;
  const owner = sim.registry.get('salvageOutfits');
  const events = [];
  for (const name of ['salvageOutfits:offer', 'salvageOutfits:radio', 'salvageOutfits:offerClosed',
    'salvage:claimJumped', 'economy:creditsChanged', 'economy:salvageIntakeApplied']) {
    bus.on(name, payload => events.push({ name, payload: clone(payload || {}) }));
  }
  const nativeOwner = sim.registry.get('physics');
  if (native) assert.equal(await nativeOwner.prepareBackend(state), true, 'native body owner must prepare');
  let meeting;
  if (start) {
    const result = owner.start({ encounterId: 'test:outfits:one', sectorId: SECTOR, anchor: ANCHOR, variant });
    assert.equal(result.ok, true, JSON.stringify(result));
    meeting = state.salvageOutfits.meetings[result.meetingId];
    sim.runTicks(3);
  }
  return { sim, state, bus, owner, player, meeting, events, nativeOwner,
    adapter: createSalvageOutfitsPhysical(sim.registry.ctx),
    close() {
      owner.destroy();
      for (const name of ['npcJobsRuntime', 'combat', 'spawnBudget', 'ships', 'mining', 'economy', 'encounterDirector', 'save']) {
        sim.registry.get(name)?.destroy?.();
      }
      nativeOwner._disableSg02DynamicAuthority();
      sim.dispose();
    },
  };
}

function entity(h, record) { return h.state.entities.get(record.entityId); }
function advanceUntil(h, predicate, seconds = 180, eachTick = null) {
  for (let i = 0; i < Math.ceil(seconds / SIM_DT); i++) {
    if (predicate()) return true;
    if (eachTick) eachTick(i);
    h.sim.step(SIM_DT);
  }
  return !!predicate();
}
function choose(h, choiceId) {
  const offer = h.meeting.offer;
  assert.ok(offer?.id, `a current offer must explain ${choiceId}`);
  return h.owner.choose({ meetingId: h.meeting.id, offerId: offer.id, choiceId });
}


test('a damaged working crew releases the original, takes funded repairs, and resumes the same physical job', async () => {
 const h=await boot({variant:'heavy_lift'});try{
  choose(h,'cooperate');assert.ok(advanceUntil(h,()=>h.meeting.crews.keel.status==='tow',90));
  const c=h.meeting.crews.keel, actor=entity(h,c), core=entity(h,h.meeting.bodies.core), id=core.id;
  assert.ok(h.adapter.line(actor,core));
  actor.hull=actor.hullMax*0.3;const oldAgreement=clone(h.meeting.agreement);
  h.state.player.credits=5000;const before=h.state.player.credits;
  h.sim.runTicks(2);assert.equal(c.repairHold,true);assert.equal(h.adapter.line(actor,core),null);
  assert.equal(core.id,id);assert.equal(h.meeting.bodies.core.claim,'keel');assert.deepEqual(h.meeting.agreement,oldAgreement);
  assert.equal(h.state.player.credits,before);
  const view=getSalvageOutfitsReadModel(h.state), shown=view.crews.slice(0,view.crewCount).find(c=>c.crewId==='keel');
  assert.equal(shown.statusText,'Hull repair stop');assert.equal(shown.loaded,false);
  const warnings=()=>h.events.filter(x=>x.name==='salvageOutfits:radio'&&x.payload.text?.includes('below working margin'));
  assert.equal(warnings().length,1);h.sim.runTicks(60);assert.equal(warnings().length,1);
  h.owner._scan(actor.id);assert.ok(h.events.some(x=>x.payload.text?.includes('not offering another contract')));
  const miningOwner=h.sim.registry.get('mining');
  miningOwner._applyRepair(h.player,actor,{},actor.hullMax*0.2/2,1);
  h.sim.runTicks(2);assert.equal(c.repairHold,true,'50 percent remains below restart margin');
  miningOwner._applyRepair(h.player,actor,{},actor.hullMax*0.15/2,1);
  h.sim.runTicks(2);assert.equal(c.repairHold,false);assert.ok(h.state.player.credits<before);
  assert.equal(h.meeting.bodies.core.key,core.data.worldRecordId);
  assert.ok(advanceUntil(h,()=>h.meeting.bodies.core.status==='delivered',180));
  assert.equal(h.meeting.bodies.core.deliveredBy,'keel');
 }finally{h.close();}
});

test('repair hold survives an actual cold envelope and resumes without resetting agreement or originals', async () => {
 let h=await boot({variant:'heavy_lift'});try{
  choose(h,'cooperate');assert.ok(advanceUntil(h,()=>h.meeting.crews.keel.status==='tow',90));
  entity(h,h.meeting.crews.keel).hull=entity(h,h.meeting.crews.keel).hullMax*0.3;
  h.sim.runTicks(3);const id=h.meeting.id;
  const snapshot=captureSalvageOutfits(h.state,h.sim.registry), keys=Object.values(h.meeting.bodies).map(b=>b.key);
  const envelope=clone(h.sim.registry.get('save').serialize('repair-stop'));
  envelope.data.salvageOutfits=snapshot;envelope.checksum=fnv1a(JSON.stringify(envelope.data));
  h.close();h=await boot({start:false});
  assert.equal(h.sim.registry.get('save').loadEnvelope(envelope,'repair-stop'),true);
  assert.equal(restoreSalvageOutfits(envelope.data,h.sim.registry),true);h.owner.afterContinue();
  h.player=h.state.entities.get(h.state.playerId);h.meeting=h.state.salvageOutfits.meetings[id];h.sim.runTicks(3);
  assert.equal(h.meeting.crews.keel.repairHold,true);assert.equal(h.meeting.agreement.type,'cooperate');
  for(const key of keys)assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===key).length,1);
  const actor=entity(h,h.meeting.crews.keel);h.state.player.credits=5000;
  h.sim.registry.get('mining')._applyRepair(h.player,actor,{},actor.hullMax*0.4/2,1);h.sim.runTicks(3);
  assert.equal(h.meeting.crews.keel.repairHold,false);
  assert.ok(advanceUntil(h,()=>h.meeting.bodies.core.status==='delivered',180));
 }finally{h.close();}
});

test('repairing an overloaded Kit does not erase the physical overload or invent a reward', async () => {
 const h=await boot({variant:'overreach'});try{
  assert.ok(advanceUntil(h,()=>h.meeting.crews.latch.status==='stalled',90));
  const c=h.meeting.crews.latch,actor=entity(h,c);actor.hull=actor.hullMax*0.3;
  assert.ok(advanceUntil(h,()=>c.repairHold===true,15));
  h.state.player.credits=5000;h.sim.registry.get('mining')._applyRepair(h.player,actor,{},actor.hullMax*0.4/2,1);
  h.sim.runTicks(2);assert.equal(c.repairHold,false);assert.equal(c.status,'stalled');
  assert.ok(h.events.some(x=>x.payload.text?.includes('still too much for my cable')));
  assert.equal(h.meeting.bodies.core.status,'live');assert.equal(h.meeting.bodies.core.deliveredBy,null);
 }finally{h.close();}
});

test('radio interruption cannot issue a new tow after changing out of flight', async () => {
 const h=await boot({variant:'heavy_lift'});try{
  const c=h.meeting.crews.keel,actor=entity(h,c);actor.hull=actor.hullMax*0.3;
  assert.ok(advanceUntil(h,()=>c.repairHold===true,15));
  h.state.player.credits=5000;h.sim.registry.get('mining')._applyRepair(h.player,actor,{},actor.hullMax*0.4/2,1);
  let calls=0,receives=0,settles=0;const request=h.owner.physical.requestTow;
  h.owner._receivePlayer=()=>{receives++;};h.owner._settleAgreement=()=>{settles++;};
  h.owner.physical.requestTow=(...args)=>{calls++;return request(...args);};
  h.bus.on('salvageOutfits:radio',p=>{if(p.text?.includes('Hull back above'))h.state.mode='docked';});
  h.sim.runTicks(1);assert.equal(h.state.mode,'docked');assert.equal(calls,0);assert.equal(receives,0);assert.equal(settles,0);
 }finally{h.close();}
});

test('a completed site releases the working repair stop for an unladen departure',async()=>{
 const h=await boot({variant:'heavy_lift'});try{
  const c=h.meeting.crews.keel,actor=entity(h,c);actor.hull=actor.hullMax*0.3;
  assert.ok(advanceUntil(h,()=>c.repairHold===true,15));
  // Completion boundary fixture: the other workers/player have worked all loads.
  for(const b of Object.values(h.meeting.bodies)){b.status='salvaged';b.pool={};}
  h.sim.runTicks(3);assert.equal(h.meeting.status,'complete');assert.equal(c.repairHold,false);
  assert.equal(c.status,'departing');assert.ok(h.events.some(x=>x.payload.text?.includes('Heading back without a load')));
  assert.ok(actor.hull<actor.hullMax*0.35);assert.doesNotMatch(actor.data.scanLabel,/repair stop/);
 }finally{h.close();}
});

test('ordinary combat damage triggers the stop; paid repairs do not forgive violence or revive a lost crew',async()=>{
 const h=await boot({variant:'heavy_lift'});try{
  const c=h.meeting.crews.keel,actor=entity(h,c),kernel=h.sim.registry.get('combat').kernel;
  for(let i=0;i<1000&&actor.hull>actor.hullMax*0.34;i++){
   const hit=kernel.routeDamage({attackerId:h.player.id,targetId:actor.id,
    packet:scalarHitToDamagePacket({damage:10,damageType:'kinetic',pos:actor.pos}),origin:{kind:'test',id:'repair-stop-hit'}});
   assert.equal(hit.ok,true);
  }
  assert.ok(actor.hull>0&&actor.hull<=actor.hullMax*0.35);
  assert.ok(advanceUntil(h,()=>c.repairHold===true,15));
  const memory=clone(h.state.salvageOutfits.memory.keel);assert.ok(memory.cheated>0);
  h.state.player.credits=10000;h.sim.registry.get('mining')._applyRepair(h.player,actor,{},actor.hullMax*0.4/2,1);
  h.sim.runTicks(2);assert.equal(c.repairHold,false);assert.deepEqual(h.state.salvageOutfits.memory.keel,memory);
  kernel.routeDamage({attackerId:h.player.id,targetId:actor.id,
   packet:scalarHitToDamagePacket({damage:1000000,damageType:'kinetic',pos:actor.pos}),origin:{kind:'test',id:'repair-stop-fatal'}});
  h.sim.runTicks(2);assert.equal(c.status,'destroyed');const credits=h.state.player.credits;
  h.sim.registry.get('mining')._applyRepair(h.player,actor,{},1000000,1);h.sim.runTicks(2);
  assert.equal(c.status,'destroyed');assert.equal(h.state.player.credits,credits);
  assert.equal(h.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===c.key).length,0);
 }finally{h.close();}
});


test('fatal combat damage while held remains destroyed in the crew read model',async()=>{
 const h=await boot({variant:'heavy_lift'});try{
  const c=h.meeting.crews.keel,actor=entity(h,c),kernel=h.sim.registry.get('combat').kernel;
  actor.hull=actor.hullMax*0.3;
  assert.ok(advanceUntil(h,()=>c.repairHold===true,15));
  kernel.routeDamage({attackerId:h.player.id,targetId:actor.id,
   packet:scalarHitToDamagePacket({damage:1000000,damageType:'kinetic',pos:actor.pos}),origin:{kind:'test',id:'held-fatal'}});
  h.sim.runTicks(2);assert.equal(c.status,'destroyed');assert.equal(h.meeting.status,'working');
  assert.equal(c.repairHold,true,'historical hold must not override terminal status');
  const view=getSalvageOutfitsReadModel(h.state),shown=view.crews.slice(0,view.crewCount).find(row=>row.crewId==='keel');
  assert.equal(shown.status,'destroyed');assert.equal(shown.loaded,false);
  assert.notEqual(shown.statusText,'Hull repair stop');
 }finally{h.close();}
});
