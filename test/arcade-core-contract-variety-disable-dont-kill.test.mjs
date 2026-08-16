import assert from 'node:assert/strict';
import test from 'node:test';

import { isLawfulStationFaction } from '../src/ai/engagementAuthority.js';
import { physics } from '../src/core/physics.js';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import {
  DEBRIS_RECOVERY_FOLLOWUP_SOURCE,
  DISABLE_DONT_KILL_VARIANT_ID,
} from '../src/data/missionVariants.js';
import { SECTORS } from '../src/data/sectors.js';
import { bountyHunt } from '../src/systems/bountyHunt.js';
import { cargo } from '../src/systems/cargo.js';
import { combat } from '../src/systems/combat.js';
import { contractClausesSystem } from '../src/systems/contractClauses.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { missions } from '../src/systems/missions.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { surrenderRecovery } from '../src/systems/surrenderRecovery.js';
import { isAttachable, tetherGameplay } from '../src/systems/tetherGameplay.js';

const BOARD_STATION_ID = 'station_helios';
const BOARD_SECTOR_ID = 'sector_helios_prime';
const STATION_BY_ID = new Map(SECTORS.flatMap((sector) => (
  (sector.stations || []).map((station) => [station.id, { ...station, sectorId: sector.id }])
)));

function collect(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

function makeHarness(seed) {
  const systems = [
    physics,
    combat,
    tetherGameplay,
    surrenderRecovery,
    bountyHunt,
    jettisonImpulse,
    cargo,
    missions,
    contractClausesSystem,
  ];
  const sim = createSimulation({ seed, systems, updateOrder: systems });
  const { state, bus } = sim;
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.tutorialHints = false;
  state.mode = 'station';
  state.world.currentSectorId = BOARD_SECTOR_ID;
  state.ui.docked = true;
  state.ui.dockedStationId = BOARD_STATION_ID;
  state.player.credits = 100000;
  state.player.cargo.capVolume = 500;
  state.player.cargo.capMass = 500;
  state.factions.faction_scn = { rep: 100 };

  const spec = makeShipEntitySpec('ship_mule', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
  });
  const player = sim.spawn(spec);
  state.playerId = player.id;
  const events = collect(bus, [
    'combat:subsystemDisabled',
    'tether:latched',
    'tether:reel',
    'surrender:secured',
    'bountyHunt:towIntercepted',
    'law:custodyTransfer',
    'mission:completed',
    'mission:failed',
  ]);
  return { sim, state, bus, player, events, missions: sim.registry.get('missions') };
}

function captureOffer(harness) {
  return harness.missions.ensureBoard(BOARD_STATION_ID).slots.find((offer) => (
    offer && offer.variantId === DISABLE_DONT_KILL_VARIANT_ID
  ));
}

function findCaptureSeed() {
  for (let seed = 1; seed <= 256; seed++) {
    const harness = makeHarness(seed);
    const offer = captureOffer(harness);
    harness.sim.dispose();
    if (offer) return seed;
  }
  throw new Error('bounded ordinary Helios boards produced no Disable, Don’t Kill offer');
}

function blackBoxFollowups(state) {
  return Object.values(state.missions.boards || {}).flatMap((board) => board && board.slots || [])
    .filter((offer) => offer && offer.source === DEBRIS_RECOVERY_FOLLOWUP_SOURCE
      && offer.cause && offer.cause.tag === 'capture_target_destroyed');
}

async function enterCapture(harness, offer) {
  assert.equal(harness.missions.acceptMission(offer.id), true);
  const mission = harness.state.missions.active.find((row) => (
    row.variantId === DISABLE_DONT_KILL_VARIANT_ID
  ));
  assert.ok(mission);
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(mission.targetEntityIds.length, 1);
  const target = harness.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(target && target.alive !== false && target.type === 'ship');

  const stationDef = STATION_BY_ID.get(mission.destStationId);
  assert.ok(stationDef && isLawfulStationFaction(stationDef.factionId),
    'the ordinary variant only rolls when its target sector has a lawful custody station');
  const station = harness.sim.spawn({
    type: 'station', team: 2, factionId: stationDef.factionId,
    pos: { x: target.pos.x - 900, z: target.pos.z },
    vel: { x: 0, z: 0 }, radius: 90, mass: 100000,
    hull: 100000, hullMax: 100000, collides: true,
    data: {
      stationId: stationDef.id,
      sectorId: mission.destSectorId,
      factionId: stationDef.factionId,
      size: stationDef.size || 'M',
    },
  });
  harness.player.pos.x = target.pos.x - 120;
  harness.player.pos.z = target.pos.z;
  harness.player.vel = { x: -45, z: 0 };
  target.vel = { x: -45, z: 0 };
  harness.state.player.targetId = target.id;
  assert.equal(await harness.sim.registry.get('physics').prepareBackend(harness.state, { reset: true }), true);
  return { mission, target, station };
}

function disableDrive(harness, target) {
  const kernel = harness.sim.registry.get('combat').ensureKernel();
  for (let pulse = 0; pulse < 12 && harness.events['combat:subsystemDisabled'].length === 0; pulse++) {
    const hit = kernel.routeDamage({
      attackerId: harness.player.id,
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
    assert.equal(hit.ok, true);
    kernel.prePhysics(SIM_DT);
    harness.sim.step(SIM_DT);
  }
  assert.equal(harness.events['combat:subsystemDisabled'].length, 1);
  assert.equal(target.alive, true, 'EMP leaves the exact contract quarry alive');
}

function attachAndReel(harness, target) {
  harness.state.input.aimWorld = { x: target.pos.x, z: target.pos.z };
  harness.state.input.aimIntentActive = true;
  harness.state.input.aimAngle = 0;
  harness.state.input.actions = {
    tetherFire: false,
    tetherCut: false,
    reelDelta: 0,
    massline: null,
  };
  harness.sim.step(SIM_DT);
  harness.state.input.actions.tetherFire = true;
  harness.sim.step(SIM_DT);
  harness.state.input.actions.tetherFire = false;
  harness.sim.step(SIM_DT);
  assert.equal(harness.events['tether:latched'].length, 1);
  assert.equal(harness.state.player.tether.targetId, target.id);

  harness.state.input.actions.massline = { lineControl: true, lineLength: -1, cut: false };
  for (let tick = 0; tick < 8 * 60 && harness.events['surrender:secured'].length === 0; tick++) {
    harness.sim.step(SIM_DT);
  }
  harness.state.input.actions.massline = null;
  assert.ok(harness.events['tether:reel'].length > 0);
  assert.equal(harness.events['surrender:secured'].length, 1);
}

function recoverBlackBox(harness, mission) {
  harness.state.mode = 'flight';
  harness.state.ui.docked = false;
  harness.state.ui.dockedStationId = null;
  harness.state.world.currentSectorId = mission.destSectorId;
  harness.bus.emit('sector:enter', { sectorId: mission.destSectorId });
  assert.equal(mission.targetEntityIds.length, 1);
  const pod = harness.state.entities.get(mission.targetEntityIds[0]);
  assert.ok(pod && pod.alive !== false && pod.type === 'payload');
  assert.equal(pod.physicsBody.dynamic, true);
  assert.equal(pod.data.recoverableCargoPod, true);
  assert.equal(isAttachable(pod, harness.player.id), true);
  assert.ok(Math.hypot(pod.vel.x, pod.vel.z) > 0, 'the recorder remains a moving physical body');
  pod.pos.x = harness.player.pos.x + harness.player.radius + pod.radius;
  pod.pos.z = harness.player.pos.z;
  pod.vel = { ...harness.player.vel };
  harness.bus.emit('physics:impact', {
    aId: pod.id,
    bId: harness.player.id,
    impulse: 8,
    tick: harness.state.tick,
  });
  assert.equal(pod.alive, false);
}

test('ordinary Disable, Don’t Kill captures alive and a forbidden kill leaves one physical black-box follow-on', async (t) => {
  const seed = findCaptureSeed();
  const success = makeHarness(seed);
  const replay = makeHarness(seed);
  t.after(() => { success.sim.dispose(); replay.sim.dispose(); });

  const offer = captureOffer(success);
  const replayOffer = captureOffer(replay);
  assert.ok(offer, 'ordinary Contracts board exposes the capture variant before acceptance');
  assert.equal(offer.id, replayOffer.id);
  assert.equal(offer.title, replayOffer.title);
  assert.match(offer.title, /^Disable, Don’t Kill — Take the Warrant Alive near /);
  assert.match(offer.brief, /drive.*Massline.*lawful custody/i);
  assert.deepEqual(offer.clauses.map((row) => row.id), ['no_kills']);

  const live = await enterCapture(success, offer);
  disableDrive(success, live.target);
  const targetAtLatch = { ...live.target.pos };
  attachAndReel(success, live.target);
  assert.equal(success.events['bountyHunt:towIntercepted'].length, 1,
    'the existing capture owner creates the real mid-tow hostile interruption');
  for (let tick = 0; tick < 20 * 60 && success.events['law:custodyTransfer'].length === 0; tick++) {
    success.sim.step(SIM_DT);
  }
  assert.equal(success.events['law:custodyTransfer'].length, 1);
  assert.ok(Math.hypot(live.target.pos.x - targetAtLatch.x, live.target.pos.z - targetAtLatch.z) > 250,
    'Rapier advances the disabled quarry materially while the live Massline stays attached');
  const successReceipt = success.state.missions.receipts.find((row) => row.missionId === live.mission.id);
  assert.equal(successReceipt?.outcome, 'completed');
  assert.equal(successReceipt?.resolution, 'capture');
  assert.equal(blackBoxFollowups(success.state).length, 0);

  const failed = makeHarness(seed);
  t.after(() => failed.sim.dispose());
  const doomed = await enterCapture(failed, captureOffer(failed));
  failed.bus.emit('projectile:hit', {
    targetId: doomed.target.id,
    ownerId: failed.player.id,
    damage: 100000,
    damageType: 'kinetic',
    penetration: 1,
    pos: { ...doomed.target.pos },
  });
  assert.equal(doomed.target.alive, false, 'combat owns the forbidden lethal hull mutation');
  assert.equal(failed.events['mission:failed'].length, 1);
  assert.match(failed.state.missions.receipts.find((row) => row.missionId === doomed.mission.id)?.reason || '',
    /no_kills/);
  assert.equal(blackBoxFollowups(failed.state).length, 1);
  const followup = blackBoxFollowups(failed.state)[0];
  assert.match(followup.title, /^Black Box Recovery — /);
  assert.equal(followup.params.debrisRecovery.pods.length, 1);
  assert.deepEqual(followup.params.debrisRecovery.pos, {
    x: doomed.target.pos.x,
    z: doomed.target.pos.z,
  });

  const saved = structuredClone(failed.missions.serialize());
  const restored = makeHarness(seed);
  t.after(() => restored.sim.dispose());
  restored.missions.deserialize(saved);
  restored.state.simTime += 1200;
  restored.missions.ensureBoard(BOARD_STATION_ID);
  assert.equal(blackBoxFollowups(restored.state).length, 1,
    'save/load and a normal board epoch retain exactly one causal recorder recovery');

  const restoredOffer = blackBoxFollowups(restored.state)[0];
  assert.equal(restored.missions.acceptMission(restoredOffer.id), true);
  const recovery = restored.state.missions.active.find((row) => row.sourceOfferId === restoredOffer.id);
  recoverBlackBox(restored, recovery);
  assert.equal(restored.state.missions.receipts.find((row) => row.missionId === recovery.id)?.outcome, 'completed');
  assert.equal(restored.state.player.cargo.items.cmdty_salvage_electronics, 1,
    'the cargo owner receives the physical recorder exactly once');
  assert.equal(blackBoxFollowups(restored.state).length, 0,
    'accepting the sole follow-on removes it and cannot create another generation');
});
