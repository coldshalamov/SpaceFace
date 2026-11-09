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
test('a genuinely completed three-way job teaches Kit to tow a safe original on the next job', async () => {
  let h = await stalled();
  try {
    assert.equal(choose(h, 'three_way').ok, true);
    assert.ok(advanceUntil(h, () => h.meeting.bodies.core.deliveredBy === 'keel'
      && h.meeting.bodies.cache.deliveredBy === 'latch', 240));
    h.sim.registry.get('mining')._drainWreck(h.player, entity(h, h.meeting.bodies.frame), 18, 8);
    h.sim.runTicks(2);
    assert.equal(h.meeting.agreement.status, 'complete');
    const earned = normalizeSalvageOutfits(h.owner.serialize()).memory;
    h.close(); h = await boot({ start: false });
    // A fresh native scene uses only the actual earned, normalized memory; no outcome is fabricated.
    h.state.salvageOutfits.memory = earned;
    const result = h.owner.start({ encounterId: 'test:outfits:next', sectorId: SECTOR, anchor: ANCHOR, variant: 'overreach' });
    assert.equal(result.ok, true); h.meeting = h.state.salvageOutfits.meetings[result.meetingId];
    assert.equal(h.meeting.crews.latch.targetId, 'cache');
    assert.equal(h.meeting.crews.latch.learnedMassLimit, true);
    assert.equal(h.meeting.bodies.core.claim, 'keel');
    assert.ok(h.events.some(e => e.name === 'salvageOutfits:radio' && /checked the mass/.test(e.payload.text)));
    const cache = entity(h, h.meeting.bodies.cache); let sawLine = false;
    assert.ok(advanceUntil(h, () => h.meeting.bodies.cache.deliveredBy === 'latch', 180, () => {
      sawLine ||= !!h.owner.physical.line(entity(h, h.meeting.crews.latch), cache);
    }));
    assert.ok(sawLine); assert.equal(h.meeting.crews.latch.overcommitted, false);
    assert.equal(h.state.player.credits, 0);
    assert.equal(normalizeSalvageOutfits(h.owner.serialize()).meetings[h.meeting.id].crews.latch.learnedMassLimit, true);
    console.log('KIT_LEARNED_NATIVE', JSON.stringify({ time: h.state.simTime, sawLine, delivered: h.meeting.bodies.cache.deliveredBy }));
  } finally { h.close(); }
});

test('new lesson respects existing favors and does not retrofit a saved unfinished encounter', () => {
  const memory = freshSalvageOutfits().memory;
  const make = id => makeSalvageMeeting({ id, sectorId: SECTOR, anchor: ANCHOR, variant: 'overreach', memory });
  const old = make('old'); assert.equal(old.crews.latch.targetId, 'core');
  delete old.crews.latch.learnedMassLimit;
  memory.latch.kept = 1; memory.latch.helped = 1;
  const fresh = make('new');
  assert.equal(fresh.crews.latch.targetId, 'frame');
  assert.equal(fresh.bodies.cache.claim, 'player');
  const raw = freshSalvageOutfits(); raw.memory = memory; raw.meetings.old = old;
  const restored = normalizeSalvageOutfits(raw).meetings.old;
  assert.equal(restored.crews.latch.targetId, 'core');
  assert.equal(restored.crews.latch.learnedMassLimit, false);
  assert.equal(restored.bodies.core.claim, 'latch');
});

test('a broken promise does not teach success and a learned cutter never retargets an oversized original', async () => {
  const h = await boot({ start: false });
  try {
    h.state.salvageOutfits.memory.latch.kept = 1;
    const r = h.owner.start({ encounterId: 'test:learned:retarget', sectorId: SECTOR, anchor: ANCHOR, variant: 'overreach' });
    h.meeting = h.state.salvageOutfits.meetings[r.meetingId];
    h.meeting.bodies.cache.claim = 'player'; h.meeting.bodies.frame.claim = 'player';
    h.meeting.crews.keel.targetId = null; h.meeting.crews.keel.status = 'idle';
    h.owner._retarget(h.meeting, h.meeting.crews.latch);
    assert.equal(h.meeting.crews.latch.targetId, null);
    const memory = freshSalvageOutfits().memory; memory.latch.cheated = 1;
    const row = makeSalvageMeeting({ id:'broken', sectorId:SECTOR, anchor:ANCHOR, variant:'overreach', memory });
    assert.equal(row.crews.latch.learnedMassLimit, false);
  } finally { h.close(); }
});
