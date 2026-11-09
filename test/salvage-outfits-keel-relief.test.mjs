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


async function stalled(){const h=await boot({variant:'overreach'});assert.ok(advanceUntil(h,()=>h.meeting.crews.latch.status==='stalled',90));return h;}
test('a fresh small pilot can ask the real Hawser to recover the same slipped cradle for a clean split',async()=>{
 const h=await stalled();try{
  const core=entity(h,h.meeting.bodies.core),before=h.state.player.credits;
  assert.ok(h.meeting.offer.choices.some(c=>c.id==='keel_relief'));
  const result=choose(h,'keel_relief');assert.equal(result.ok,true);assert.equal(result.agreement.type,'split');assert.equal(result.agreement.bonus,0);
  assert.equal(h.meeting.bodies.core.claim,'keel');assert.equal(h.meeting.bodies.frame.claim,'player');assert.equal(h.meeting.bodies.cache.claim,'player');
  let sawLine=false;assert.ok(advanceUntil(h,()=>h.meeting.bodies.core.status==='delivered',240,()=>{if(h.owner.physical.line(entity(h,h.meeting.crews.keel),core))sawLine=true;}),'Hawser must physically recover original');
  assert.equal(sawLine,true);assert.equal(h.meeting.bodies.core.deliveredBy,'keel');assert.equal(h.state.player.credits,before,'delegated recovery is not player payment');
  assert.equal(h.meeting.bodies.frame.status,'live');assert.equal(h.meeting.bodies.cache.status,'live');
  const mine=h.sim.registry.get('mining');
  for(const id of ['frame','cache'])mine._drainWreck(h.player,entity(h,h.meeting.bodies[id]),18,8);
  h.sim.runTicks(1);assert.equal(h.meeting.agreement.status,'complete');assert.equal(h.state.salvageOutfits.memory.keel.kept,1);
  h.sim.runTicks(60);assert.equal(h.state.salvageOutfits.memory.keel.kept,1);assert.equal(h.state.player.credits,before);
  const saved=normalizeSalvageOutfits(h.owner.serialize());assert.equal(saved.memory.keel.kept,1);assert.equal(saved.meetings[h.meeting.id].agreement.type,'split');assert.equal(saved.meetings[h.meeting.id].bodies.core.status,'delivered');
  console.log('KEEL_RELIEF_NATIVE',JSON.stringify({time:h.state.simTime,sawLine,deliveredBy:h.meeting.bodies.core.deliveredBy,credits:h.state.player.credits-before}));
 }finally{h.close();}
});
test('trust, physical availability and callback lifetime are checked again after the radio offer',async()=>{
 for(const reason of ['trust','missing','cache','callback','restore']){const h=await stalled();try{
  assert.ok(h.meeting.offer.choices.some(c=>c.id==='keel_relief'));const before=h.state.player.credits;
  if(reason==='trust')h.state.salvageOutfits.memory.keel.cheated=1;
  if(reason==='missing')h.owner.physical.remove(entity(h,h.meeting.crews.keel));
  if(reason==='cache')h.owner.physical.remove(entity(h,h.meeting.bodies.cache));
  if(reason==='callback')h.bus.on('salvageOutfits:offerClosed',()=>h.owner.physical.remove(entity(h,h.meeting.crews.keel)));
  if(reason==='restore')h.bus.on('salvageOutfits:offerClosed',()=>h.bus.emit('save:restoring',{}));
  const result=choose(h,'keel_relief');assert.equal(result.ok,false,reason);assert.equal(h.meeting.agreement,null);assert.equal(h.state.player.credits,before);
 }finally{h.close();}}
});
test('ordinary refusal and original rescue choices remain distinct; an unavailable crew is not offered',async()=>{
 const h=await stalled();try{const before=h.state.player.credits;assert.equal(choose(h,'refuse').committed,false);assert.equal(h.meeting.agreement,null);h.owner.offer(h.meeting.id,'rescue');h.state.salvageOutfits.memory.keel.cheated=1;h.owner._closeOffer(h.meeting);h.owner.offer(h.meeting.id,'rescue');assert.equal(h.meeting.offer.choices.some(c=>c.id==='keel_relief'),false);assert.ok(h.meeting.offer.choices.some(c=>c.id==='rescue'));assert.equal(choose(h,'rescue').ok,true);assert.equal(h.meeting.agreement.type,'rescue');assert.equal(h.state.player.credits,before);}finally{h.close();}
});
