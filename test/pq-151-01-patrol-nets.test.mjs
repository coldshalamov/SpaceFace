// PQ-151.01 — nets-band checkpoint on a lane; break by mass, speed, or thrown decoy.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { reserveArrivalPoint } from '../src/law/authorityResponse.js';
import {
  heat,
  wantedTierFor,
  WANTED_TIER,
  WANTED_TIER_INFO,
} from '../src/systems/heat.js';
import {
  CUSTOMS_SCAN_HALF_ANGLE,
  CUSTOMS_SCAN_RANGE,
  WANTED_NET_BREAK_MASS,
  WANTED_NET_BREAK_SPEED,
  WANTED_NET_STANDOFF,
  customsScanConeOf,
  lawSecurity,
  pointInScanCone,
  wantedCheckpointFor,
} from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';

const SEED_POST = 15110;
const SEED_MASS = 15111;
const SEED_SPEED = 15112;
const SEED_DECOY = 15113;
const SECTOR = 'sector_helios_prime';

function boot(seed) {
  const sim = createSimulation({ seed, systems: [heat, lawSecurity, spawnBudget] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR;
  if (!state.world.sectors) state.world.sectors = {};
  state.world.sectors[SECTOR] = { id: SECTOR, factionId: 'faction_scn', security: 0.9, tier: 0 };
  state.player.heat = 0;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    rot: 0, hull: 200, hullMax: 200, radius: 8, mass: 28,
  });
  state.playerId = player.id;
  const posted = [];
  const broken = [];
  bus.on('law:wantedCheckpointPosted', (p) => posted.push(p));
  bus.on('law:wantedCheckpointBroken', (p) => broken.push(p));
  return { sim, state, bus, player, posted, broken };
}

function killCivilian(bus, state, id = 404) {
  bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_free',
    factionLawful: false,
    targetHostileToPlayer: false,
  });
}

function killLawman(bus, state, id = 505) {
  bus.emit('entity:killed', {
    id,
    killerId: state.playerId,
    type: 'ship',
    victimClass: 'ship',
    factionId: 'faction_scn',
    factionLawful: true,
    targetHostileToPlayer: false,
  });
}

function raiseToNets(bus, state) {
  killCivilian(bus, state);
  killLawman(bus, state);
}

function liveNet(state) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data.wantedCheckpointNet === true
  ));
}

function liveCutter(state) {
  return (state.entityList || []).find((e) => (
    e && e.alive !== false && e.data && e.data.wantedCheckpointCutter === true
  ));
}

test('nets band is playable and names break_net as the escape', () => {
  assert.equal(WANTED_TIER_INFO.nets.playable, true);
  assert.equal(WANTED_TIER_INFO.nets.escape, 'break_net');
  assert.equal(wantedTierFor(0.41), WANTED_TIER.NETS);
  assert.equal(WANTED_TIER_INFO.impound.playable, true);
});

test(`seed ${SEED_POST}: nets tier posts a lane net and a cutter from reserve`, () => {
  const { sim, state, player, posted } = boot(SEED_POST);
  raiseToNets(sim.bus, state);
  sim.step();

  assert.equal(state.player.wantedTier, WANTED_TIER.NETS);
  const checkpoint = wantedCheckpointFor(state);
  assert.ok(checkpoint, 'lawSecurity posts a checkpoint in the nets band');
  assert.equal(checkpoint.tier, WANTED_TIER.NETS);
  assert.equal(checkpoint.intact, true);
  assert.equal(posted.length, 1);

  const net = liveNet(state);
  assert.ok(net, 'a tether-net body sits on the lane');
  assert.equal(net.id, checkpoint.netId);
  const netDist = Math.hypot(net.pos.x - player.pos.x, net.pos.z - player.pos.z);
  assert.ok(netDist >= 200, `net must be on the lane (dist ${netDist}), not on the player`);
  assert.ok(Math.abs(netDist - WANTED_NET_STANDOFF) < 1e-6);
  assert.ok(customsScanConeOf(net), 'the net carries a customs scan cone');

  const cutter = liveCutter(state);
  assert.ok(cutter, 'a customs cutter staffs the checkpoint');
  assert.equal(cutter.id, checkpoint.cutterId);
  const expected = reserveArrivalPoint({
    anchor: state.player.heatZone.center,
    aggressorPos: player.pos,
    jurisdictionRadius: state.player.heatZone.radius,
    seed: SEED_POST,
    incidentId: checkpoint.checkpointId,
  });
  assert.deepEqual({ x: cutter.pos.x, z: cutter.pos.z }, expected);
  const cutterDist = Math.hypot(cutter.pos.x - player.pos.x, cutter.pos.z - player.pos.z);
  assert.ok(cutterDist >= 900, `cutter must fly from somewhere (dist ${cutterDist}), not spawn on the player`);
  assert.equal(cutter.vel.x, 0);
  assert.equal(cutter.vel.z, 0);

  const hunters = (state.entityList || []).filter((e) => (
    e && e.data && e.data.bountyHunt && e.data.bountyHunt.role === 'hunter'
  ));
  assert.equal(hunters.length, 0, 'nets band posts a checkpoint, not a warrant hunter');
  sim.dispose();
});

test(`seed ${SEED_POST}: a light slow hull is held by the net, not broken`, () => {
  const { sim, state, player, broken } = boot(SEED_POST);
  raiseToNets(sim.bus, state);
  sim.step();
  const net = liveNet(state);
  assert.ok(net);
  player.mass = 28;
  player.vel.x = 0;
  player.vel.z = 0;
  player.pos.x = net.pos.x;
  player.pos.z = net.pos.z;
  sim.step();

  const checkpoint = wantedCheckpointFor(state);
  assert.ok(checkpoint);
  assert.equal(checkpoint.intact, true, 'light/slow contact must not fake a break');
  assert.equal(checkpoint.held, true);
  assert.equal(checkpoint.brokenBy, null);
  assert.equal(broken.length, 0);
  assert.equal(state.player.wantedTier, WANTED_TIER.NETS);
  sim.dispose();
});

test(`seed ${SEED_MASS}: heavy hull contact breaks the net by mass`, () => {
  const { sim, state, player, broken } = boot(SEED_MASS);
  raiseToNets(sim.bus, state);
  sim.step();
  const raised = state.player.heat;
  const net = liveNet(state);
  assert.ok(net);
  player.mass = WANTED_NET_BREAK_MASS;
  player.vel.x = 0;
  player.vel.z = 0;
  player.pos.x = net.pos.x;
  player.pos.z = net.pos.z;
  sim.step();

  assert.equal(broken.length, 1);
  assert.equal(broken[0].source, 'lawSecurity');
  assert.equal(broken[0].accepted, true);
  assert.equal(broken[0].method, 'mass');
  assert.ok(state.player.heat < raised, 'breaking the net is the escape — heat drops one level');
  assert.equal(net.data.wantedNetBroken, true);
  assert.equal(customsScanConeOf(net), null);
  sim.dispose();
});

test(`seed ${SEED_SPEED}: fast light hull contact breaks the net by speed`, () => {
  const { sim, state, player, broken } = boot(SEED_SPEED);
  raiseToNets(sim.bus, state);
  sim.step();
  const raised = state.player.heat;
  const net = liveNet(state);
  assert.ok(net);
  player.mass = 18;
  player.vel.x = WANTED_NET_BREAK_SPEED;
  player.vel.z = 0;
  player.pos.x = net.pos.x;
  player.pos.z = net.pos.z;
  sim.step();

  assert.equal(broken.length, 1);
  assert.equal(broken[0].method, 'speed');
  assert.ok(state.player.heat < raised, 'speed break drops heat');
  assert.equal(net.data.wantedNetBroken, true);
  sim.dispose();
});

test(`seed ${SEED_DECOY}: a thrown decoy in the scan cone breaks the net`, () => {
  const { sim, state, player, broken } = boot(SEED_DECOY);
  raiseToNets(sim.bus, state);
  sim.step();
  const raised = state.player.heat;
  const net = liveNet(state);
  assert.ok(net);
  const cone = customsScanConeOf(net);
  assert.ok(cone);

  const decoyPos = {
    x: net.pos.x + Math.cos(cone.heading) * 48,
    z: net.pos.z + Math.sin(cone.heading) * 48,
  };
  assert.equal(
    pointInScanCone(cone.origin, cone.heading, CUSTOMS_SCAN_RANGE, CUSTOMS_SCAN_HALF_ANGLE, decoyPos),
    true,
  );
  const decoy = sim.spawn({
    type: 'payload',
    pos: decoyPos,
    vel: { x: 20 * Math.cos(cone.heading), z: 20 * Math.sin(cone.heading) },
    radius: 4,
    mass: 20,
    data: { thrownDecoy: true, payloadType: 'jettisoned_cargo' },
  });
  player.mass = 18;
  player.vel.x = 0;
  player.vel.z = 0;
  sim.step();

  assert.equal(broken.length, 1);
  assert.equal(broken[0].method, 'decoy');
  assert.equal(broken[0].byId, decoy.id);
  assert.ok(state.player.heat < raised, 'decoy break drops heat');
  assert.equal(net.data.wantedNetBroken, true);
  const playerDist = Math.hypot(player.pos.x - net.pos.x, player.pos.z - net.pos.z);
  assert.ok(playerDist > 200, 'player slipped the cone — they did not ram the net');
  sim.dispose();
});
