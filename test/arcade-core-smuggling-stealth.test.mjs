import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import {
  CUSTOMS_SCAN_CONE,
  customsScanSample,
} from '../src/data/smugglingStealth.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { installVisualOverrides } from '../src/render/visualOverrides.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { cargo } from '../src/systems/cargo.js';
import { economy } from '../src/systems/economy.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { jettisonImpulse } from '../src/systems/jettisonImpulse.js';
import { fittingsFromDefaultModules, makeShipEntitySpec } from '../src/systems/ships.js';

const SECTOR_ID = 'sector_tethys_junction';
const CONTRABAND_ID = 'cmdty_narcotics';

function canvasStub() {
  const context = {
    createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
    putImageData() {}, fillRect() {}, strokeRect() {}, clearRect() {}, drawImage() {}, fillText() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, setTransform() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, rect() {}, fill() {}, stroke() {}, clip() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, measureText() { return { width: 10 }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
  };
  return { width: 256, height: 256, getContext: () => context };
}

globalThis.document ||= { createElement: () => canvasStub() };
globalThis.__SF_VISUAL_FACTORY_THROW__ = true;

function events(bus, names) {
  const rows = Object.fromEntries(names.map((name) => [name, []]));
  for (const name of names) bus.on(name, (payload) => rows[name].push(structuredClone(payload)));
  return rows;
}

async function bootPatrolRoute({ seed, playerVelocity = -30, inputThrust = 0, storm = false, tactical = false }) {
  const tacticalSystem = tactical ? createTacticalAISystem() : null;
  const systems = tactical
    ? [encounterDirector, tacticalSystem, flightV3, aiPorts, physics, jettisonImpulse, cargo, economy]
    : [physics, encounterDirector, cargo, economy];
  const updateOrder = tactical
    ? [encounterDirector, tacticalSystem, flightV3, aiPorts, physics, jettisonImpulse, cargo, economy]
    : [physics, encounterDirector, cargo, economy];
  const sim = createSimulation({ seed, systems, updateOrder });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.currentSector = { id: SECTOR_ID, factionId: 'faction_scn', security: 1 };
  state.world.activeSector = { id: SECTOR_ID, factionId: 'faction_scn', stations: [] };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  state.input.thrust = inputThrust;
  const playerSpec = makeShipEntitySpec('ship_hitch', {
    isPlayer: true,
    team: 0,
    factionId: 'faction_free',
    pos: { x: 0, z: 0 },
    rot: Math.PI,
    fittings: fittingsFromDefaultModules('ship_hitch'),
  });
  playerSpec.vel = { x: playerVelocity, z: 0 };
  const player = sim.spawn(playerSpec);
  state.playerId = player.id;
  if (storm) {
    sim.spawn({
      type: 'fx', team: 2, factionId: null,
      pos: { x: -180, z: 0 }, vel: { x: 0, z: 0 }, radius: 900, mass: 0,
      hull: 1, hullMax: 1, collides: false, collisionMask: 0,
      data: { kind: 'ionStormPocket', anomalyStableId: 'anomaly:blind-nebula:ion-pocket' },
    });
  }
  const physicsOwner = sim.registry.get('physics');
  assert.equal(await physicsOwner.prepareBackend(state, { reset: true }), true);
  const log = events(bus, [
    'encounter:resolved',
    'patrol:proximity',
    'contraband:scanned',
    'smuggling:patrolEvaded',
    'smuggling:patrolDecoyCommitted',
    'smuggling:patrolDecoyResolved',
    'ship:appearanceChanged',
  ]);
  const requested = sim.registry.get('encounterDirector').requestAuthoredEncounter({
    shapeId: 'patrol_scan',
    encounterId: `plan49:patrol:${seed}`,
    sectorId: SECTOR_ID,
    anchor: { x: 1000, z: 0 },
    zoneType: 'border_checkpoint',
    zoneRadius: 1600,
    force: true,
  });
  assert.deepEqual(requested, { ok: true, encounterId: `plan49:patrol:${seed}` });
  const live = state.encounterDirector.live[requested.encounterId];
  assert.ok(live && live.ids.length === 2);
  const patrol = state.entities.get(live.ids[0]);
  assert.equal(patrol.data.smugglingScanCone.kind, 'customs_scan_lattice');
  assert.deepEqual(log['ship:appearanceChanged'].map((row) => row.id), [live.ids[0]],
    'the authority leader invalidates a same-frame pre-scan mesh through the existing render seam');
  assert.equal(state.entities.get(live.ids[1])?.data?.smugglingScanCone, undefined,
    'the support ship does not duplicate the leader-owned world lattice');
  return { sim, state, bus, player, patrol, live, log, physicsOwner };
}

function disposeRoute(route) {
  route.physicsOwner?._disableSg02DynamicAuthority?.();
  route.sim.dispose();
}

test('cold running physically crosses the real patrol lattice while a hot burn is acquired', async (t) => {
  const cold = await bootPatrolRoute({ seed: 49001, playerVelocity: -30, inputThrust: 0 });
  t.after(() => disposeRoute(cold));
  const coldStart = { ...cold.player.pos };
  for (let tick = 0; tick < 720 && cold.log['encounter:resolved'].length === 0; tick++) cold.sim.step(SIM_DT);
  assert.ok(cold.player.pos.x < coldStart.x - 150,
    'the engines-dark route is real Rapier drift, not a scripted position write');
  assert.equal(cold.log['encounter:resolved'][0]?.outcome, 'cold_run_evaded');
  assert.equal(cold.log['patrol:proximity'].length, 0,
    'clearing the physical cone before acquisition never invokes the customs dice owner');

  const hot = await bootPatrolRoute({ seed: 49002, playerVelocity: -30, inputThrust: 1 });
  t.after(() => disposeRoute(hot));
  hot.sim.registry.get('cargo').addCargo(CONTRABAND_ID, 4);
  for (let tick = 0; tick < 360 && hot.log['encounter:resolved'].length === 0; tick++) hot.sim.step(SIM_DT);
  assert.equal(hot.log['patrol:proximity'].length, 1,
    'visible in-cone engine burn reaches the ordinary customs scan authority');
  assert.equal(hot.log['contraband:scanned'].length, 1);
  assert.notEqual(hot.log['encounter:resolved'][0]?.outcome, 'cold_run_evaded');
});

test('the same physical burn is measurably quieter inside the live ion-storm marker', async (t) => {
  const open = await bootPatrolRoute({ seed: 49003, playerVelocity: -30, inputThrust: 1, storm: false });
  const storm = await bootPatrolRoute({ seed: 49004, playerVelocity: -30, inputThrust: 1, storm: true });
  t.after(() => { disposeRoute(open); disposeRoute(storm); });
  const openSample = customsScanSample(open.state, open.patrol, open.player, 1);
  const stormSample = customsScanSample(storm.state, storm.patrol, storm.player, 1);
  assert.equal(openSample.insideCone, true);
  assert.equal(stormSample.insideCone, true);
  assert.equal(stormSample.exposureDelta, openSample.exposureDelta * CUSTOMS_SCAN_CONE.stormSignalMultiplier);
  for (let tick = 0; tick < 720 && storm.log['encounter:resolved'].length === 0; tick++) storm.sim.step(SIM_DT);
  assert.equal(storm.log['encounter:resolved'][0]?.outcome, 'storm_dive_evaded');
  assert.equal(storm.log['patrol:proximity'].length, 0);
});

test('a real jettison pod diverts the patrol and is physically reached under Tactical Flight V3 Rapier', async (t) => {
  const route = await bootPatrolRoute({
    seed: 49005,
    playerVelocity: 0,
    inputThrust: 0,
    tactical: true,
  });
  t.after(() => disposeRoute(route));
  const cargoOwner = route.sim.registry.get('cargo');
  assert.equal(cargoOwner.addCargo(CONTRABAND_ID, 6), 6);
  assert.equal(cargoOwner.jettison(CONTRABAND_ID, 2, { purpose: 'customs_decoy' }), 2);
  const podId = route.log['smuggling:patrolDecoyCommitted'][0]?.podId;
  const pod = route.state.entities.get(podId);
  assert.ok(pod && pod.data.customsScanDecoy.encounterId === route.live.id);
  assert.equal(route.live.phase, 'decoy');
  assert.equal(route.patrol.data.ai.activity.kind, 'scan_approach');
  assert.equal(route.patrol.data.ai.activity.targetId, pod.id);
  const startDistance = Math.hypot(route.patrol.pos.x - pod.pos.x, route.patrol.pos.z - pod.pos.z);
  for (let tick = 0; tick < 1500 && route.log['encounter:resolved'].length === 0; tick++) route.sim.step(SIM_DT);
  assert.equal(route.log['encounter:resolved'][0]?.outcome, 'decoyed');
  assert.equal(route.log['smuggling:patrolDecoyResolved'].length, 1);
  assert.ok(Math.hypot(route.patrol.pos.x - pod.pos.x, route.patrol.pos.z - pod.pos.z) < startDistance - 80,
    'the exact patrol body materially closes on the exact physical pod');
  assert.equal(route.log['patrol:proximity'].length, 0);
});

test('the production ship visual builds a bounded hard scan lattice without cards or particles', () => {
  const entity = makeShipEntitySpec('ship_hitch', {
    team: 2,
    factionId: 'faction_scn',
    pos: { x: 0, z: 0 },
  });
  entity.id = 'plan49:visual';
  entity.data.smugglingScanCone = {
    kind: 'customs_scan_lattice',
    rangeWU: CUSTOMS_SCAN_CONE.rangeWU,
    visualRangeWU: CUSTOMS_SCAN_CONE.visualReachWU,
    halfAngleRad: CUSTOMS_SCAN_CONE.halfAngleRad,
    active: true,
  };
  const factory = createVisualFactory();
  installVisualOverrides(factory, { directAuthoredMount: true });
  const visual = factory.build(entity);
  assert.ok(visual?.userData?.customsScanLattice?.isLineSegments);
  assert.match(visual.name, /AuthoredAssetBoundary/,
    'the live direct-authored ship boundary retains the encounter overlay across its GLB swap');
  assert.equal(visual.userData.customsScanPresentation, 'hard-line-fan');
  let lines = 0;
  let sprites = 0;
  let points = 0;
  visual.userData.customsScanLattice.traverse((object) => {
    if (object.isLineSegments) lines++;
    if (object.isSprite) sprites++;
    if (object.isPoints) points++;
  });
  assert.equal(lines, 1);
  assert.equal(sprites, 0);
  assert.equal(points, 0);
  assert.equal(visual.userData.customsScanLattice.geometry.getAttribute('position').count, 26);
  assert.equal(visual.userData.customsScanLattice.userData.scanRangeWU, 720);
  assert.equal(visual.userData.customsScanLattice.userData.visualRangeWU, 120);
  assert.equal(visual.userData.customsScanLattice.userData.hardRailInstances, 13);
  assert.equal(visual.userData.customsScanLatticeRails?.isInstancedMesh, true);
  assert.equal(visual.userData.customsScanLatticeRails.count, 13);
});
