import assert from 'node:assert/strict';
import test from 'node:test';

import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { makeEnemySpawnSpec, combat } from '../src/systems/combat.js';
import { aceById } from '../src/data/namedAces.js';
import { aceMemory } from '../src/systems/aceMemory.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import {
  heat,
  isPlayerBountyPosted,
  WANTED_NOTICE_GRACE_S,
} from '../src/systems/heat.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { resolveDockDeny } from '../src/ui/dockDenyBanner.js';

const SECTOR_ID = 'sector_tethys_junction';
const STATION_ID = 'station_plan48_custody';
const MISSION_ID = 'plan48:capture:mid-ace';
const CAPTURE_ACE_ID = 'ace_maw_rake_veyra';

function collect(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

test('a witnessed fine notice can be ignored into a local posted bounty, physical hunter, and berth mode', () => {
  const sim = createSimulation({
    seed: 48001,
    systems: [heat, encounterDirector],
    updateOrder: [],
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.story.beatIndex = 7;
  const player = sim.spawn({
    type: 'ship', team: 0, factionId: 'faction_free',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 25,
    hull: 200, hullMax: 200, data: { intent: {}, ai: {} },
  });
  state.playerId = player.id;
  const events = collect(bus, ['law:fineNotice', 'law:bountyPosted']);

  bus.emit('entity:killed', {
    killerId: player.id,
    victimClass: 'ship',
    targetHostileToPlayer: false,
  });
  assert.equal(events['law:fineNotice'].length, 1);
  assert.equal(state.player.heatZone.sectorId, SECTOR_ID);
  assert.equal(state.player.heatZone.bountyPosted, false);
  assert.equal(resolveDockDeny(state, {
    stationId: 'station_lawful_open', factionId: 'faction_scn',
  }), null, 'the payable fine stage keeps an ordinary lawful berth reachable');

  const heatSystem = sim.registry.get('heat');
  heatSystem.update(WANTED_NOTICE_GRACE_S - 1, state);
  assert.equal(isPlayerBountyPosted(state), false);
  heatSystem.update(1, state);
  assert.equal(events['law:bountyPosted'].length, 1);
  assert.equal(isPlayerBountyPosted(state), true);

  const request = sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'bounty_hunter',
    encounterId: 'plan48:posted-warrant-hunter',
    sectorId: SECTOR_ID,
    anchor: { x: 0, z: 0 },
    zoneType: 'trade_lane',
    zoneRadius: 1200,
  });
  assert.deepEqual(request, { ok: true, encounterId: 'plan48:posted-warrant-hunter' });
  const live = state.encounterDirector.live['plan48:posted-warrant-hunter'];
  assert.ok(live && live.ids.length >= 1);
  const hunter = state.entities.get(live.ids[0]);
  assert.ok(hunter && hunter.alive !== false && hunter.type === 'ship');
  assert.equal(hunter.data.ai.spawnContext, 'bounty_hunter');

  const lawfulDeny = resolveDockDeny(state, {
    stationId: 'station_lawful_closed', factionId: 'faction_scn',
  });
  assert.equal(lawfulDeny.reason, 'hostile_rep');
  assert.equal(resolveDockDeny(state, {
    stationId: 'station_tethys_black', factionId: 'faction_reach',
    stationTypeId: 'blackmarket', services: ['black_market'],
  }), null, 'the posted-bounty mode leaves a real fence destination reachable');

  state.world.currentSectorId = 'sector_ceres_belt';
  assert.equal(isPlayerBountyPosted(state), false, 'the local warrant does not summon hunters in another region');
  assert.equal(resolveDockDeny(state, {
    stationId: 'station_beltout', factionId: 'faction_dmc',
  }), null, 'a local warrant does not close lawful berths in another region');
});

async function bootCaptureRoute() {
  const budget = {
    requests: [],
    bindings: [],
    request(count, requester) {
      this.requests.push({ count, requester });
      return count;
    },
    bindEntity(entityId, requester) {
      this.bindings.push({ entityId, requester });
      return true;
    },
    releaseSome() { return true; },
  };
  const sim = createSimulation({
    seed: 48002,
    systems: [physics, combat, tetherGameplay, surrenderRecovery, bountyHunt, missions, aceMemory],
    updateOrder: [physics, combat, tetherGameplay, surrenderRecovery, bountyHunt, missions, aceMemory],
    helpers: { spawnBudget: budget },
  });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.currentSector = { id: SECTOR_ID, factionId: 'faction_scn' };
  state.world.activeSector = {
    id: SECTOR_ID,
    factionId: 'faction_scn',
    stations: [{ stationId: STATION_ID, pos: { x: -900, z: 0 } }],
  };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.tutorialHints = false;

  const station = sim.spawn({
    type: 'station', team: 2, factionId: 'faction_scn',
    pos: { x: -900, z: 0 }, vel: { x: 0, z: 0 }, radius: 90, mass: 100000,
    data: {
      stationId: STATION_ID,
      sectorId: SECTOR_ID,
      factionId: 'faction_scn',
      size: 'M',
    },
  });
  const playerSpec = makeShipEntitySpec('ship_mule', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  });
  playerSpec.vel = { x: -45, z: 0 };
  const player = sim.spawn(playerSpec);
  state.playerId = player.id;
  const targetSpec = makeEnemySpawnSpec('corsair_raider', 8, { x: 120, z: 0 }, {
    factionId: 'faction_reach',
    startedTick: state.tick,
  });
  targetSpec.vel = { x: -45, z: 0 };
  const captureAce = aceById(CAPTURE_ACE_ID);
  assert.ok(captureAce);
  targetSpec.data = {
    ...targetSpec.data,
    name: captureAce.name,
    namedAceId: captureAce.id,
    appearance: { ...captureAce.appearance },
    bountyCr: 1000,
    missionId: MISSION_ID,
    missionTag: MISSION_ID,
    missionTargetSlot: 0,
  };
  const target = sim.spawn(targetSpec);
  state.player.targetId = target.id;
  state.missions.active.push({
    id: MISSION_ID,
    type: 'bounty_hunt',
    title: `Bring ${captureAce.name} to custody`,
    status: 'active',
    factionId: 'faction_scn',
    sourceStationId: STATION_ID,
    destStationId: STATION_ID,
    originSectorId: SECTOR_ID,
    destSectorId: SECTOR_ID,
    riskTier: 3,
    reward_cr: 1000,
    collateral_cr: 0,
    objectiveTarget: 1,
    objectiveProgress: 0,
    completedTargetSlots: [],
    targetEntityIds: [target.id],
    needsTargets: 1,
    clauses: [],
    params: {},
    acceptedAt: state.simTime,
    deadline_s: state.simTime + 900,
  });
  const events = collect(bus, [
    'combat:subsystemDisabled',
    'tether:latched',
    'tether:reel',
    'surrender:secured',
    'bountyHunt:towIntercepted',
    'law:custodyTransfer',
    'economy:grantCredits',
    'faction:repDelta',
    'mission:completed',
    'research:grant',
  ]);
  assert.equal(await sim.registry.get('physics').prepareBackend(state, { reset: true }), true);
  return { sim, state, bus, budget, station, player, target, events };
}

test('the exact active bounty takes real EMP, reels under Massline, draws an interceptor, and pays capture once', async () => {
  const route = await bootCaptureRoute();
  const { sim, state, bus, player, target, events } = route;
  const kernel = sim.registry.get('combat').ensureKernel();
  assert.equal(target.data.namedAceId, CAPTURE_ACE_ID,
    'Plan 48 capture acceptance runs against a real mid-roster named Ace');

  let lastHit = null;
  for (let pulse = 0; pulse < 12 && events['combat:subsystemDisabled'].length === 0; pulse++) {
    lastHit = kernel.routeDamage({
      attackerId: player.id,
      targetId: target.id,
      packet: {
        channels: { ion: 45 },
        penetration: 0,
        shieldBypass: 1,
        subsystemShare: 1,
        hit: { subsystemId: 'subsystem_drive' },
        source: { kind: 'weapon', weaponId: 'wpn_emp_disruptor_m' },
      },
      origin: { kind: 'weapon', id: 'wpn_emp_disruptor_m' },
    });
    assert.equal(lastHit.ok, true);
    kernel.prePhysics(SIM_DT);
    sim.step(SIM_DT);
  }
  assert.equal(events['combat:subsystemDisabled'].length, 1, JSON.stringify(lastHit));
  assert.equal(events['combat:subsystemDisabled'][0].targetId, target.id);
  assert.equal(target.alive, true, 'capture starts from a living disabled quarry');

  state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  state.input.aimIntentActive = true;
  state.input.aimAngle = 0;
  state.input.actions = { tetherFire: false, tetherCut: false, reelDelta: 0, massline: null };
  sim.step(SIM_DT);
  state.input.actions.tetherFire = true;
  sim.step(SIM_DT);
  state.input.actions.tetherFire = false;
  sim.step(SIM_DT);
  assert.equal(events['tether:latched'].length, 1);
  assert.equal(state.player.tether.targetId, target.id);
  assert.ok(state.player.tether.restLength > 60, 'the quarry must be reeled rather than auto-secured');

  const targetAtLatch = { x: target.pos.x, z: target.pos.z };
  state.input.actions.massline = { lineControl: true, lineLength: -1, cut: false };
  for (let tick = 0; tick < 8 * 60 && events['surrender:secured'].length === 0; tick++) {
    sim.step(SIM_DT);
  }
  state.input.actions.massline = null;
  assert.ok(events['tether:reel'].length > 0, 'the production Massline owner shortened the live attachment');
  assert.equal(events['surrender:secured'].length, 1);
  assert.equal(events['bountyHunt:towIntercepted'].length, 1);
  const intercept = events['bountyHunt:towIntercepted'][0];
  const hunter = state.entities.get(intercept.hunterEntityId);
  assert.ok(hunter && hunter.alive !== false && hunter.type === 'ship');
  assert.equal(isHostileToPlayer(hunter, player.team, state), true,
    'the contract-targeted neutral team is hostile through the canonical scanner relation');
  assert.equal(hunter.data.ai.spawnContext, 'bounty_hunter');
  assert.equal(hunter.data.combat.targetId, player.id);
  assert.ok(Array.isArray(hunter.data.weapons) && hunter.data.weapons.length > 0,
    'the interception is an armed combat ship, not a notification');

  const preCustodySave = sim.registry.get('missions').serialize();
  const savedActive = preCustodySave.active.find((mission) => mission.id === MISSION_ID);
  assert.equal(savedActive.captureTowInterception.status, 'spawned');
  bus.emit('surrender:secured', events['surrender:secured'][0]);
  sim.step(SIM_DT);
  assert.equal(events['bountyHunt:towIntercepted'].length, 1,
    'duplicate secure/Continue reconciliation cannot create another mid-tow hunter');

  for (let tick = 0; tick < 20 * 60 && events['law:custodyTransfer'].length === 0; tick++) {
    sim.step(SIM_DT);
  }
  assert.equal(events['law:custodyTransfer'].length, 1, JSON.stringify({
    target: target.pos,
    player: player.pos,
    tether: state.player.tether,
  }));
  assert.ok(Math.hypot(target.pos.x - targetAtLatch.x, target.pos.z - targetAtLatch.z) > 250,
    'Rapier advances the captured hull materially toward the station while the real line stays attached');
  const custody = events['law:custodyTransfer'][0];
  assert.equal(custody.entityId, target.id);
  assert.equal(custody.stationId, STATION_ID);
  assert.equal(custody.missionCapture, true);
  assert.equal(custody.credits, 0, 'custody suppresses its generic finder fee for a contract quarry');
  assert.deepEqual(events['economy:grantCredits'], [{
    amount: 1500,
    reason: `mission:${MISSION_ID}`,
  }]);
  assert.equal(events['faction:repDelta'].some((row) => row.reason === 'surrender_custody'), false,
    'the generic custody reputation tip cannot stack with the contract completion');
  assert.equal(events['mission:completed'].length, 1);
  assert.equal(events['mission:completed'][0].resolution, 'capture');
  assert.equal(events['mission:completed'][0].rewardCr, 1500);
  assert.equal(events['mission:completed'][0].custodyReceiptId, custody.custodyReceiptId);
  assert.equal(state.aceMemory[CAPTURE_ACE_ID].defeated, true,
    'lawful custody is a terminal named-Ace outcome and cancels recurrence');
  assert.equal(state.aceMemory[CAPTURE_ACE_ID].captured, true);
  assert.equal(state.aceMemory[CAPTURE_ACE_ID].custodyReceiptId, custody.custodyReceiptId);
  assert.equal(state.aceMemory[CAPTURE_ACE_ID].physicalRewardSecuredByCustody, true,
    'the unique fitting stays with the captured hull rather than duplicating as a kill pickup');
  assert.deepEqual(events['research:grant'].map(({ amount, source, receiptId }) => ({ amount, source, receiptId })), [{
    amount: 21,
    source: 'ace_tech_rake_bearing',
    receiptId: `named-ace:${CAPTURE_ACE_ID}:tech`,
  }]);

  bus.emit('law:custodyTransfer', custody);
  assert.equal(events['economy:grantCredits'].length, 1);
  assert.equal(events['mission:completed'].length, 1);
  assert.equal(events['research:grant'].length, 1);

  const savedAfter = sim.registry.get('missions').serialize();
  const continued = createSimulation({ systems: [missions], updateOrder: [] });
  const continuedCredits = [];
  continued.bus.on('economy:grantCredits', (payload) => continuedCredits.push(payload));
  continued.registry.get('missions').deserialize(structuredClone(savedAfter));
  continued.bus.emit('law:custodyTransfer', custody);
  assert.equal(continuedCredits.length, 0, 'Continue preserves the spent capture receipt and cannot pay it again');
  assert.equal(continued.state.missions.receipts.some((receipt) => (
    receipt.missionId === MISSION_ID
      && receipt.resolution === 'capture'
      && receipt.custodyReceiptId === custody.custodyReceiptId
  )), true);
});
