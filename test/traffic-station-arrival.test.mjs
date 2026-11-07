import assert from 'node:assert/strict';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { hullEnvelopeWu, proxyOuterRadiusWu, resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { ambientStationGuidance, setIntent, traffic as trafficBase } from '../src/systems/traffic.js';

const DT = 1 / 60;
const profile = PROPULSION_PROFILES.drive_reaction_l;

function harness({ x = -500, vx = 100, stationVx = 0 } = {}) {
  const state = createGameState(6242), bus = createBus();
  const ship = { ...makeShipEntitySpec('ship_mule', { team: 2, pos: { x, z: 0 },
    ai: { passive: true, archetype: 'fleeing_trader' } }), id: 2, alive: true, collides: true };
  ship.vel = { x: vx, z: 0 }; ship.rot = 0; ship.angVel = 0;
  ship.data.trafficRole = 'hauler';
  const station = { id: 10, type: 'station', alive: true, collides: true, radius: 40, mass: 100000,
    pos: { x: 0, z: 0 }, vel: { x: stationVx, z: 0 }, rot: 0, angVel: 0,
    data: { stationId: 'station_arrival_fixture' },
    physicsBody: { schemaVersion: 1, radius: 40, mass: 100000, inertiaY: 100000,
      dynamic: false, revision: 0, shape: 'capsule' } };
  state.mode = 'flight'; state.playerId = -1;
  state.world.currentSectorId = 'sector_arrival_fixture';
  state.entities = new Map([[ship.id, ship], [station.id, station]]);
  state.entityList = [ship, station];
  state.settings = { gameplay: { physicsBackend: 'rapier-dynamic' } };
  const traffic = Object.create(trafficBase), flight = Object.create(flightV3);
  traffic.init({ state, bus, helpers: {} });
  flight.init({ state, bus, helpers: {} });
  const rec = { id: ship.id, role: 'hauler', targetId: station.id, waitT: 0, nextTradeT: 0, dockSeq: 0 };
  state.traffic.freighters.push(rec);
  const trades = [];
  bus.on('aiTrader:requestTrade', event => trades.push({ ...event, tick: state.tick,
    relativeSpeed: Math.hypot(ship.vel.x - station.vel.x, ship.vel.z - station.vel.z),
    separation: Math.hypot(ship.pos.x - station.pos.x, ship.pos.z - station.pos.z) }));
  return { state, bus, ship, station, traffic, flight, rec, trades };
}

function planTraffic(h) {
  // Exercise the production ambient cadence; no replacement scheduler in this fixture.
  for (let i = 0; i < 60; i++) {
    h.state.tick += 1; h.state.simTime = h.state.tick * DT;
    h.traffic.update(DT, h.state);
    if (h.ship.data.intent) return;
  }
  assert.fail('ambient traffic never received a planning turn');
}

test('a fast pass through the legacy dock radius cannot settle freight or start a wait', () => {
  const h = harness({ x: -50, vx: 130 });
  planTraffic(h);
  assert.equal(h.trades.length, 0);
  assert.equal(h.rec.waitT, 0);
  assert.ok(h.ship.data.intent.rendezvous.velocity.x < 0, 'an overlapping approach requests an outward recovery');
  h.flight.update(DT, h.state);
  assert.ok(consumePhysicsCommand(h.ship).control.force.x < 0, 'the live V3 force actually counters the inbound velocity');
});

test('a generic production Mule arrives from cruise through V3 and native physics before trading', async t => {
  const h = harness();
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    owner.syncFromEntities([h.ship, h.station]);
    let contacts = 0, minSeparation = Infinity;
    for (let tick = 0; tick < 1800 && h.trades.length === 0; tick++) {
      h.state.tick = tick; h.state.simTime = tick * DT;
      h.traffic.update(DT, h.state);
      h.flight.update(DT, h.state);
      owner.step(DT);
      contacts += owner.drainContactImpacts().length;
      minSeparation = Math.min(minSeparation, Math.hypot(h.ship.pos.x, h.ship.pos.z));
    }
    assert.ok(h.trades.length > 0, 'actual ambient traffic must complete an owner-safe freight arrival');
    assert.ok(h.trades[0].relativeSpeed <= 3, `arrival drift ${h.trades[0].relativeSpeed}`);
    assert.ok(minSeparation > h.station.radius + hullEnvelopeWu(h.ship), 'the flight stays outside both skins');
    assert.equal(contacts, 0, 'arrival is a controlled stop, not a collision-assisted stop');
    assert.ok(h.rec.waitT > 0);
    t.diagnostic(JSON.stringify({ arrivalTick: h.trades[0].tick, arrivalDrift: h.trades[0].relativeSpeed,
      minSeparation, contacts }));
  } finally { owner.dispose(); }
});

test('a matched moving berth has no fought-frame force and a later NPC does not inherit its servo', () => {
  const h = harness({ vx: 20, stationVx: 20 });
  h.ship.pos.x = -Math.max(52, hullEnvelopeWu(h.station) + hullEnvelopeWu(h.ship) + 20);
  const neutral = { ...makeShipEntitySpec('ship_mule', { team: 2, pos: { x: -600, z: 400 } }),
    id: 3, alive: true, vel: { x: 10, z: 0 }, rot: 0, angVel: 0 };
  neutral.data.intent = { moveX: 0, moveZ: 0, aimAngle: 0 };
  h.state.entities.set(neutral.id, neutral); h.state.entityList.push(neutral);
  h.rec.waitT = 4;
  planTraffic(h);
  assert.deepEqual(h.ship.data.intent.rendezvous.velocity, { x: 20, z: 0 });
  h.flight.update(DT, h.state);
  assert.deepEqual(consumePhysicsCommand(h.ship).control.force, { x: 0, y: 0, z: 0 });
  assert.ok(consumePhysicsCommand(neutral).control.force.x < 0,
    'the later coasting hull settles instead of inheriting the first hull\'s +20 velocity target');
  setIntent(h.ship, 0, 1, true, false, null, 0);
  assert.equal(h.ship.data.intent.rendezvous, undefined, 'a flee/role takeover clears the old berth target');
});

test('old saved waits with a remote next target hold locally and restore the same physical command', () => {
  const live = harness({ x: -90, vx: 8 }), restored = harness({ x: -90, vx: 8 });
  for (const h of [live, restored]) {
    const remote = { ...h.station, id: 11, pos: { x: 10000, z: 0 } };
    h.state.entities.set(remote.id, remote); h.state.entityList.push(remote);
    h.rec.targetId = remote.id; h.rec.waitT = 4;
  }
  planTraffic(live);
  const frozenWait = structuredClone(live.rec);
  restored.state.traffic.freighters[0] = structuredClone(frozenWait);
  restored.state.tick = live.state.tick;
  for (let i = 0; i < 60; i++) {
    for (const h of [live, restored]) {
      h.state.tick += 1; h.state.simTime = h.state.tick * DT;
      h.traffic.update(DT, h.state);
    }
  }
  assert.deepEqual(restored.ship.data.intent, live.ship.data.intent);
  assert.ok(Math.abs(live.ship.data.intent.rendezvous.velocity.x) < 20, 'no departure during a wait');
  live.flight.update(DT, live.state); restored.flight.update(DT, restored.state);
  assert.deepEqual(consumePhysicsCommand(restored.ship).control, consumePhysicsCommand(live.ship).control);

  const displaced = harness({ x: -200, vx: 45 });
  displaced.station.pos.x = 2000;
  displaced.rec.waitT = 4;
  planTraffic(displaced);
  assert.deepEqual(displaced.ship.data.intent.rendezvous.velocity, { x: 0, z: 0 },
    'a wait away from any berth stops here instead of taking an unintended route');
});

test('the real civilian job writer takes movement ownership from an ambient berth servo', () => {
  const h = harness({ vx: 0 });
  planTraffic(h);
  assert.ok(h.ship.data.intent.rendezvous);
  h.ship.data.jobId = 'job:arrival-takeover';
  npcJobsRuntime._writeIntent(h.ship, 0, -1, false, 0, false);
  assert.equal(h.ship.data.intent.rendezvous, undefined);
  h.flight.update(DT, h.state);
  assert.ok(consumePhysicsCommand(h.ship).control.force.x < 0,
    'V3 applies the new job\'s reverse command, not the old forward berth target');
});

test('ambient service clearance follows the authored collision proxy and the hull envelope', () => {
  const h = harness();
  h.station.data.collisionProxy = 'station_ring_hub';
  const manifest = resolveCollisionProxyManifest(h.station);
  assert.ok(manifest, 'fixture must resolve a real authored proxy');
  const radius = proxyOuterRadiusWu(manifest, h.station) + hullEnvelopeWu(h.ship) + 20;
  h.ship.pos.x = -radius; h.ship.vel.x = 0;
  const guidance = ambientStationGuidance(h.ship, h.station, profile);
  assert.equal(guidance.arrived, true);
  assert.deepEqual(guidance.velocity, { x: 0, z: 0 });
});
