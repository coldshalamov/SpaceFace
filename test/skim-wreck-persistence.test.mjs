import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { mining } from '../src/systems/mining.js';
import { save } from '../src/save/saveSystem.js';
import { missions as missionsProto } from '../src/systems/missions.js';
import { ensureActivityClassified, entityNeedsPhysics } from '../src/world/activityRuntime.js';
import { DEFAULT_GRACE_S, PRESENTATION_TIER, SIM_TIER } from '../src/world/activityClassification.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';
import { entityIsDurableCandidate } from '../src/world/worldRecords.js';

const SECTOR = 'sector_helios_prime';
const AWAY_SECTOR = 'sector_tethys_junction';
const OWNER = 'campaign47aSkim';
const makeSim = () => createSimulation({ seed: 47, systems: [world, mining], updateOrder: [] });
function installSkimWrecks(sim) {
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  state.meta.seed = 47;
  const player = sim.spawn({ type: 'ship', isPlayer: true, team: 0, pos: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 100, hullMax: 100 });
  state.playerId = player.id;
  missionsProto._spawnContract47aSkimWrecks.call({ state, helpers: sim.helpers }, { id: '47-A' });
  return state.entityList.filter(e => e?.data?.contract47aSkim === true && e.alive !== false);
}
function saveOwner(sim) {
  return Object.assign(Object.create(save), { state: sim.state, helpers: sim.helpers,
    registry: sim.registry, bus: sim.bus });
}
function moveAwayAndProveDormant(sim, wrecks) {
  const { state } = sim;
  const player = state.entities.get(state.playerId);
  const worldOwner = sim.registry.get('world');

  const near = ensureActivityClassified(state);
  for (const wreck of wrecks) {
    assert.equal(wreck.activity?.simTier, SIM_TIER.S1_NEAR, 'the live encounter starts in near simulation');
    assert.ok(entityNeedsPhysics(wreck), 'the encounter wrecks begin physics-admitted near the player');
    assert.ok(near.physicsStatics.includes(wreck) || near.physicsDynamics.includes(wreck));
  }

  player.pos = { ...sectorGlobalOrigin(AWAY_SECTOR) };
  player.vel = { x: 0, z: 0 };
  worldOwner._demoteSectorToRecordOnly(SECTOR);
  state.world.currentSectorId = AWAY_SECTOR;
  worldOwner.enterSector(AWAY_SECTOR);

  state.tick += 1;
  state.simTime += 1 / 60;
  const grace = ensureActivityClassified(state);
  assert.ok(wrecks.every(wreck => wreck.activity?.simTier === SIM_TIER.S1_NEAR),
    'the first away classification honors the authored demotion grace');
  const graceUntil = Math.max(...wrecks.map(wreck => wreck.activity?.graceUntilT || state.simTime + DEFAULT_GRACE_S));

  state.tick += 1;
  state.simTime = graceUntil + 1 / 60;
  const dormant = ensureActivityClassified(state);
  for (const wreck of wrecks) {
    assert.equal(state.entities.get(wreck.id), wreck, 'persistent props stay registered off-sector');
    assert.equal(wreck.alive, true, 'off-sector residency does not retire the mission prop');
    assert.equal(wreck.activity?.simTier, SIM_TIER.S3_DORMANT);
    assert.equal(wreck.activity?.presentationTier, PRESENTATION_TIER.R3_UNLOADED);
    assert.equal(wreck.activity?.pinnedExact, false);
    assert.equal(entityNeedsPhysics(wreck), false);
    assert.equal(wreck._physicsPartition, 0);
    assert.equal(dormant.physicsStatics.includes(wreck) || dormant.physicsDynamics.includes(wreck), false,
      'dormant props leave both runtime physics admission lists');
    assert.equal(wreck.data.salvagePool?.cmdty_alloys, 1, 'dormancy preserves the optional salvage');
    assert.equal(wreck.data.salvageTimeLeft, 60, 'idle time off-sector does not consume mining time');
  }
  state.input.fireGroup = 0;
  state.tick += 720;
  state.simTime += 12;
  sim.registry.get('mining').update(12, state);
  assert.ok(wrecks.every(wreck => wreck.data.salvageTimeLeft === 60
    && wreck.data.salvagePool?.cmdty_alloys === 1),
    'an idle 12-second production mining update does not consume the beam-only salvage timer');
  return worldOwner;
}

test('Skim salvage stays one-owner across dormant sector travel and Continue', () => {
  const sim = makeSim();
  try {
    const { state } = sim;
    const wrecks = installSkimWrecks(sim);
    assert.equal(wrecks.length, 3);
    assert.ok(wrecks.every(e => e.flags?.persistent === true));
    assert.ok(wrecks.every(e => e.data.persistenceOwner === OWNER));
    assert.ok(wrecks.every(e => entityIsDurableCandidate(e, state.playerId) === false),
      'mission-owned wrecks do not also enter generic worldRecords');

    const positions = new Map(wrecks.map(e => [e.data.scanLabel, { x: e.pos.x, z: e.pos.z }]));
    const worldOwner = moveAwayAndProveDormant(sim, wrecks);
    assert.equal(state.entityList.filter(e => e?.data?.contract47aSkim === true && e.alive !== false).length, 3,
      'the three dormant mission-owned props remain live while away');

    // Save while away. Exact global positions and original home-sector ownership must survive.
    const savedWorld = worldOwner.serialize();
    assert.equal(savedWorld.currentSectorId, AWAY_SECTOR);
    const savedWreckRecords = Object.values(savedWorld.records.byId).filter(r => r?.kind === 'wreck');
    assert.ok(wrecks.every(wreck => !savedWreckRecords.some(record => record.pos.x === wreck.pos.x
      && record.pos.z === wreck.pos.z)),
      'the save has no generic shell record for a Skim wreck that could outrank its saved pool');
    const entitySave = saveOwner(sim)._serializeEntities();
    const saved = entitySave.persistent.filter(e => e.data?.contract47aSkim === true);
    assert.equal(saved.length, 3);
    assert.ok(saved.every(e => e.data.salvagePool?.cmdty_alloys === 1));
    assert.ok(saved.every(e => e.data.salvageTimeLeft === 60));

    const continuation = makeSim();
    try {
      const nextWorld = continuation.registry.get('world');
      nextWorld.deserialize(savedWorld);
      const awayOrigin = sectorGlobalOrigin(AWAY_SECTOR);
      const nextPlayer = continuation.spawn({ type: 'ship', isPlayer: true, pos: { ...awayOrigin }, hull: 100 });
      continuation.state.playerId = nextPlayer.id;
      nextWorld.enterSector(continuation.state.world.currentSectorId, { restoreDurableRecords: true, sliceNeighbors: true });
      assert.equal(continuation.state.entityList.filter(e => e?.data?.contract47aSkim === true).length, 0,
        'sector materialization has no world-record shell to shadow the saved salvage');
      const remap = new Map();
      saveOwner(continuation)._spawnPersistentEntities(saved, remap);
      const restored = continuation.state.entityList.filter(e => e?.data?.contract47aSkim === true && e.alive !== false);
      assert.equal(restored.length, 3);
      assert.ok(restored.every(e => e.flags?.persistent === true));
      assert.ok(restored.every(e => e.data.persistenceOwner === OWNER));
      assert.ok(restored.every(e => e.data.salvagePool?.cmdty_alloys === 1));
      assert.ok(restored.every(e => e.data.salvageTimeLeft === 60));
      assert.ok(restored.every(e => e.data.worldRecordId == null), 'no generic record carrier shadows the exact saved entity');
      assert.ok(restored.every(e => e.data.scanLabel?.endsWith('— WRECK')));
      assert.ok(restored.every(e => e.homeSectorId === SECTOR && e.data.homeSectorId === SECTOR));
      assert.ok(restored.every(e => e.pos.x === positions.get(e.data.scanLabel).x
        && e.pos.z === positions.get(e.data.scanLabel).z),
        'Continue while in Tethys preserves each wreck at its original global coordinates');

      nextWorld._demoteSectorToRecordOnly(AWAY_SECTOR);
      continuation.state.world.currentSectorId = SECTOR;
      nextPlayer.pos = { x: 0, z: 0 };
      nextWorld.enterSector(SECTOR);
      assert.equal(continuation.state.entityList.filter(e => e?.data?.contract47aSkim === true && e.alive !== false).length, 3,
        'returning after Continue reuses the same loaded wrecks, rather than rematerializing duplicates');

      const mine = continuation.registry.get('mining');
      const events = { yields: [], completed: [] };
      continuation.bus.on('mining:yield', payload => events.yields.push(payload));
      continuation.bus.on('salvage:completed', payload => events.completed.push(payload));
      const harvested = restored[0];
      mine._drainWreck(nextPlayer, harvested, 18, 3);
      assert.equal(harvested.alive, true);
      assert.equal(harvested.data.salvagePool.cmdty_alloys, 1);
      assert.equal(harvested.data._carry, 0.5);
      assert.equal(harvested.data.salvageTimeLeft, 57);
      assert.equal(events.yields.length, 0, 'the first half-beam tick banks fractional alloy, not a premature pickup');

      mine._drainWreck(nextPlayer, harvested, 18, 3);
      assert.equal(harvested.alive, false, 'the production mining owner retires an emptied Skim wreck');
      assert.equal(harvested.data._salvaged, true);
      assert.equal(harvested.data.salvagePool.cmdty_alloys, 0);
      assert.equal(harvested.data.salvageTimeLeft, 54);
      assert.equal(events.yields.length, 1);
      assert.deepEqual({ commodityId: events.yields[0].commodityId, qty: events.yields[0].qty },
        { commodityId: 'cmdty_alloys', qty: 1 });
      assert.equal(events.completed.length, 1);

      const afterHarvestWorld = nextWorld.serialize();
      const harvestedPos = harvested.pos;
      assert.ok(!Object.values(afterHarvestWorld.records.byId).some(record => record.kind === 'wreck'
        && record.pos.x === harvestedPos.x && record.pos.z === harvestedPos.z),
        'a harvested mission wreck cannot leave a durable alive world-record twin');
      const afterHarvestEntities = saveOwner(continuation)._serializeEntities();
      assert.equal(afterHarvestEntities.persistent.filter(e => e.data?.contract47aSkim === true).length, 2,
        'Continue keeps the other two pools but cannot restore the harvested one');
      assert.equal(missionsProto._resolveContract47aSkim.call({}, { params: { skimResolved: true } }, 'lane'), false,
        'a latched Skim cannot mint replacement wrecks after the salvage was harvested');
    } finally { continuation.dispose(); }
  } finally { sim.dispose(); }
});
