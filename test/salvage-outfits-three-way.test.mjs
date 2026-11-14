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
test('three-way recovery physically gives both crews fitting original loads, not player money', async () => {
  const h = await stalled();
  try {
    const credits = h.state.player.credits;
    assert.equal(choose(h, 'three_way').ok, true);
    const core = entity(h, h.meeting.bodies.core), cache = entity(h, h.meeting.bodies.cache);
    let keelLine = false, latchLine = false;
    assert.ok(advanceUntil(h, () => h.meeting.bodies.core.status === 'delivered'
      && h.meeting.bodies.cache.status === 'delivered', 240, () => {
      keelLine ||= !!h.owner.physical.line(entity(h, h.meeting.crews.keel), core);
      latchLine ||= !!h.owner.physical.line(entity(h, h.meeting.crews.latch), cache);
    }), 'both NPCs must deliver real original bodies');
    assert.ok(keelLine && latchLine);
    assert.equal(h.meeting.bodies.core.deliveredBy, 'keel');
    assert.equal(h.meeting.bodies.cache.deliveredBy, 'latch');
    assert.equal(h.meeting.bodies.frame.status, 'live');
    assert.equal(h.meeting.agreement.status, 'active', 'their deliveries do not finish the player share');
    h.sim.registry.get('mining')._drainWreck(h.player, entity(h, h.meeting.bodies.frame), 18, 8);
    h.sim.runTicks(2);
    assert.equal(h.meeting.agreement.status, 'complete');
    assert.equal(h.state.salvageOutfits.memory.latch.kept, 1);
    assert.equal(h.state.salvageOutfits.memory.keel.kept, 1);
    assert.equal(normalizeSalvageOutfits(h.owner.serialize()).memory.latch.lastEvent.cause, 'three_way_kept');
    h.sim.runTicks(120);
    assert.equal(h.state.salvageOutfits.memory.latch.kept, 1);
    assert.equal(h.state.player.credits, credits);
    console.log('THREE_WAY_NATIVE', JSON.stringify({ time: h.state.simTime, keelLine, latchLine, credits: 0 }));
  } finally { h.close(); }
});

test('three-way allocation survives real save-owner load and sector reentry without duplicate originals', async () => {
  let h = await stalled();
  try {
    assert.equal(choose(h, 'three_way').ok, true);
    assert.ok(advanceUntil(h, () => h.meeting.crews.latch.status === 'tow', 90));
    const id = h.meeting.id;
    const envelope = clone(h.sim.registry.get('save').serialize('three-way'));
    assert.equal(envelope.data.salvageOutfits.meetings[id].agreement.type, 'three_way');
    h.close(); h = await boot({ start: false });
    assert.equal(h.sim.registry.get('save').loadEnvelope(envelope, 'three-way'), true);
    h.player = h.state.entities.get(h.state.playerId);
    h.meeting = h.state.salvageOutfits.meetings[id];
    assert.equal(h.meeting.agreement.type, 'three_way');
    assert.equal(h.meeting.bodies.cache.claim, 'latch');
    h.bus.emit('sector:exit', { sectorId: SECTOR });
    h.state.world.currentSectorId = 'sector_helios_prime';
    h.bus.emit('sector:enter', { sectorId: 'sector_helios_prime' });
    h.sim.runTicks(4);
    h.bus.emit('sector:exit', { sectorId: 'sector_helios_prime' });
    h.state.world.currentSectorId = SECTOR;
    h.bus.emit('sector:enter', { sectorId: SECTOR });
    h.sim.runTicks(4);
    for (const b of Object.values(h.meeting.bodies)) {
      assert.equal(h.state.entityList.filter(e => e.alive && e.data?.worldRecordId === b.key).length, 1);
    }
    assert.ok(advanceUntil(h, () => h.meeting.bodies.cache.deliveredBy === 'latch'
      && h.meeting.bodies.core.deliveredBy === 'keel', 240));
    assert.equal(h.meeting.agreement.status, 'active');
  } finally { h.close(); }
});

test('trust and live cache capacity are revalidated; stealing Kit share breaks only that promise', async () => {
  for (const reason of ['trust', 'mass', 'callback']) {
    const h = await stalled();
    try {
      if (reason === 'trust') h.state.salvageOutfits.memory.latch.cheated = 1;
      if (reason === 'mass') entity(h, h.meeting.bodies.cache).mass = 999;
      if (reason === 'callback') h.bus.on('salvageOutfits:offerClosed', () => h.owner.physical.remove(entity(h, h.meeting.crews.latch)));
      assert.equal(choose(h, 'three_way').ok, false);
      assert.equal(h.meeting.agreement, null);
    } finally { h.close(); }
  }
  const h = await stalled();
  try {
    assert.equal(choose(h, 'three_way').ok, true);
    h.sim.registry.get('mining')._drainWreck(h.player, entity(h, h.meeting.bodies.cache), 18, 8);
    h.sim.runTicks(2);
    assert.equal(h.meeting.agreement.status, 'broken');
    assert.equal(h.state.salvageOutfits.memory.latch.cheated, 1);
    assert.equal(h.state.salvageOutfits.memory.keel.cheated, 0);
    assert.equal(normalizeSalvageOutfits(h.owner.serialize()).memory.latch.lastEvent.cause, 'three_way_broken');
  } finally { h.close(); }
});
