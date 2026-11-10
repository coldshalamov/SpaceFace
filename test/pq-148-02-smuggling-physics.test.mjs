// PQ-148.02 — smuggling physics.
// Customs scan is a cone (heading + half-angle + range). A cruise drop-kick transits
// without dwelling long enough to lock; a parked contraband pod is scanned and heat rises
// through heat.js (contraband:scanned), never a direct player.heat write.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { addCargo, cargo } from '../src/systems/cargo.js';
import { heat } from '../src/systems/heat.js';
import {
  DROP_KICK_CRUISE_SPEED,
  dropKickCargoPod,
  jettisonImpulse,
} from '../src/systems/jettisonImpulse.js';
import {
  CUSTOMS_SCAN_DWELL_S,
  CUSTOMS_SCAN_HALF_ANGLE,
  CUSTOMS_SCAN_RANGE,
  customsScanConeOf,
  lawSecurity,
  pointInScanCone,
  scanLineOccluded,
} from '../src/systems/lawSecurity.js';
import {
  JETTISONED_CARGO_PAYLOAD_TYPE,
  commodityLegality,
  isJettisonedCargoPod,
  lootShards,
  spawnJettisonedCargoPod,
} from '../src/systems/lootShards.js';

const CONTRABAND_ID = 'cmdty_narcotics';
const CONTRABAND = COMMODITIES.find((row) => row.id === CONTRABAND_ID);
const LANE_Z = 28;
const CATCH_NET_X = 125;

function speed(entity) {
  const vel = entity && entity.vel;
  return Math.hypot(Number(vel && vel.x) || 0, Number(vel && vel.z) || 0);
}

function findPods(state) {
  const list = state.entityList || [];
  return list.filter(isJettisonedCargoPod);
}

function shipSpec(extra = {}) {
  return {
    type: 'ship',
    team: extra.team != null ? extra.team : 0,
    pos: extra.pos || { x: 0, z: 0 },
    vel: extra.vel || { x: 0, z: 0 },
    rot: extra.rot != null ? extra.rot : 0,
    angVel: 0,
    radius: extra.radius || 14,
    mass: extra.mass || 18,
    hull: extra.hull != null ? extra.hull : 120,
    hullMax: extra.hullMax != null ? extra.hullMax : 120,
    collides: extra.collides !== false,
    factionId: extra.factionId || 'player',
    flags: {},
    physicsBody: {
      schemaVersion: 1,
      radius: extra.radius || 14,
      mass: extra.mass || 18,
      inertiaY: 80,
      dynamic: extra.dynamic !== false,
      ccd: true,
      material: 'ship',
      revision: 0,
    },
    data: extra.data || { defId: extra.defId || 'ship_kestrel' },
  };
}

function boot(seed, systems = [cargo, lootShards, jettisonImpulse, lawSecurity, heat, physics]) {
  const sim = createSimulation({ seed, bus: createBus(), systems });
  const { state, helpers } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const player = sim.spawn(shipSpec({
    defId: 'ship_kestrel',
    mass: 18,
    hull: 120,
    hullMax: 120,
    radius: 14,
  }));
  state.playerId = player.id;
  state.player.cargo.capVolume = 80;
  state.player.cargo.capMass = 80;
  if (typeof state.player.heat !== 'number') state.player.heat = 0;
  return {
    sim,
    state,
    helpers,
    player,
    cargoSys: sim.registry.get('cargo'),
    lootSys: sim.registry.get('lootShards'),
    lawSys: sim.registry.get('lawSecurity'),
    heatSys: sim.registry.get('heat'),
    physicsSys: sim.registry.get('physics'),
    cleanup() {
      const physicsSys = sim.registry.get('physics');
      if (physicsSys && typeof physicsSys._disableSg02DynamicAuthority === 'function') {
        physicsSys._disableSg02DynamicAuthority();
      }
      sim.dispose();
    },
  };
}

async function bootPhysics(seed) {
  const t = boot(seed);
  const ready = await t.physicsSys.prepareBackend(t.state);
  assert.equal(ready, true, 'rapier-dynamic should initialize headless');
  return t;
}

function teleport(entity, x, z) {
  entity.pos.x = x;
  entity.pos.z = z;
  if (entity.prevPos) {
    entity.prevPos.x = x;
    entity.prevPos.z = z;
  }
  entity.vel.x = 0;
  entity.vel.z = 0;
  if (entity.physicsBody && typeof entity.physicsBody === 'object') {
    entity.physicsBody = {
      ...entity.physicsBody,
      revision: (entity.physicsBody.revision || 0) + 1,
    };
  }
}

function spawnScanner(t, extra = {}) {
  return t.sim.spawn(shipSpec({
    team: 2,
    pos: extra.pos || { x: 0, z: 0 },
    rot: extra.rot != null ? extra.rot : 0,
    radius: 14,
    mass: 400,
    hull: 200,
    hullMax: 200,
    factionId: 'faction_scn',
    defId: 'customs_cutter',
    data: {
      customsScanner: true,
      defId: 'customs_cutter',
      customsScanCone: extra.cone || {
        heading: 0,
        halfAngle: CUSTOMS_SCAN_HALF_ANGLE,
        range: CUSTOMS_SCAN_RANGE,
        dwellS: CUSTOMS_SCAN_DWELL_S,
      },
    },
  }));
}

function spawnCatchNet(t, x = CATCH_NET_X, z = LANE_Z) {
  // A ship body, not an asteroid: payload masks collide with ships (PQ-148.00 ore shotgun).
  return t.sim.spawn(shipSpec({
    team: 1,
    pos: { x, z },
    radius: 18,
    mass: 8000,
    hull: 400,
    hullMax: 400,
    factionId: 'faction_reach',
    defId: 'ship_barge',
    dynamic: false,
    data: { outlawCatchNet: true, defId: 'ship_barge', trafficRole: 'outlaw' },
  }));
}

function spawnPod(t, spec) {
  const pod = spawnJettisonedCargoPod(t.state, {
    pos: spec.pos,
    vel: spec.vel || { x: 0, z: 0 },
    commodityId: spec.commodityId || CONTRABAND_ID,
    amount: spec.amount != null ? spec.amount : 8,
    unitMass: CONTRABAND.massPerU,
    ownerId: spec.ownerId != null ? spec.ownerId : t.player.id,
    factionId: 'player',
  }, t.helpers);
  assert.ok(pod, 'spawnJettisonedCargoPod must return a body');
  return pod;
}

test('narcotics is a real contraband commodity; cone is heading+half-angle+range', () => {
  assert.ok(CONTRABAND, 'cmdty_narcotics exists');
  assert.equal(CONTRABAND.legality, 'contraband');
  assert.equal(commodityLegality(CONTRABAND_ID), 'contraband');
  const origin = { x: 0, z: 0 };
  assert.equal(pointInScanCone(origin, 0, 90, 0.55, { x: 65, z: 28 }), true);
  assert.equal(pointInScanCone(origin, 0, 90, 0.55, { x: -20, z: 0 }), false, 'behind the scanner is not in the cone');
  assert.equal(pointInScanCone(origin, 0, 90, 0.55, { x: 40, z: 80 }), false, 'off-axis is not a sphere');
  const hauler = { pos: { x: 32, z: 14 }, radius: 16 };
  assert.equal(scanLineOccluded(origin, { x: 65, z: 28 }, hauler), true);
  assert.equal(scanLineOccluded(origin, { x: 65, z: 28 }, { pos: { x: 80, z: -40 }, radius: 8 }), false);
});

test('jettison stamps legality and owner on the field pod', () => {
  const t = boot(14820);
  try {
    assert.equal(addCargo(t.state, CONTRABAND_ID, 6), 6);
    assert.equal(t.cargoSys.jettison(CONTRABAND_ID, 6), 6);
    const pod = findPods(t.state)[0];
    assert.ok(pod);
    assert.equal(pod.data.payloadType, JETTISONED_CARGO_PAYLOAD_TYPE);
    assert.equal(pod.data.legality, 'contraband');
    assert.equal(pod.data.ownerId, t.player.id);
    assert.equal(pod.data.commodityId, CONTRABAND_ID);
  } finally {
    t.cleanup();
  }
});

test('drop-kick at cruise transits the cone into a catch net without a scan', async () => {
  const t = await bootPhysics(14821);
  try {
    const scans = [];
    t.sim.bus.on('contraband:scanned', (p) => scans.push(p));

    const scanner = spawnScanner(t);
    const net = spawnCatchNet(t);
    assert.ok(customsScanConeOf(scanner));

    const pod = spawnPod(t, { pos: { x: -40, z: LANE_Z } });
    teleport(t.player, 420, 380);
    t.sim.step();

    let kicked = false;
    for (let i = 0; i < 8 && !kicked; i++) {
      kicked = dropKickCargoPod(t.helpers, t.state, pod, 0, DROP_KICK_CRUISE_SPEED) === true;
      t.sim.step();
    }
    assert.equal(kicked, true, 'drop-kick must publish an impulse');
    const cruiseSpeed = speed(pod);
    assert.ok(cruiseSpeed > 70, `pod must be at cruise after the kick, got ${cruiseSpeed}`);

    let entered = false;
    let caught = false;
    let ticks = 0;
    let enteredAt = null;
    let leftAt = null;
    for (let i = 0; i < 220; i++) {
      t.sim.step();
      ticks += 1;
      if (pod.data.customsConeEntered) {
        entered = true;
        if (enteredAt == null) enteredAt = t.state.simTime;
      }
      const inCone = pointInScanCone(
        scanner.pos, 0, CUSTOMS_SCAN_RANGE, CUSTOMS_SCAN_HALF_ANGLE, pod.pos,
      );
      if (enteredAt != null && !inCone && leftAt == null) leftAt = t.state.simTime;
      if (pod.data.caughtByNet) {
        caught = true;
        break;
      }
    }

    const transitS = enteredAt != null && leftAt != null ? leftAt - enteredAt : 0;
    const scanned = pod.data.customsScanned === true || scans.some((p) => p && p.found);
    const enteredN = entered ? 1 : 0;
    const scannedN = scanned ? 1 : 0;
    const caughtN = caught || pod.data.caughtByNet ? 1 : 0;

    console.log(
      `PQ-148.02 drop-kick: entered=${enteredN} scanned=${scannedN} caught=${caughtN} `
      + `transitS=${transitS.toFixed(3)} cruise=${cruiseSpeed.toFixed(1)} ticks=${ticks} `
      + `netId=${net.id} heat=${Number(t.state.player.heat || 0).toFixed(3)}`,
    );

    assert.equal(enteredN, 1, 'pod must enter the physical cone');
    assert.equal(scannedN, 0, 'cruise transit must beat dwell — not a dice-roll hold scan');
    assert.equal(caughtN, 1, 'pod must hit the outlaw catch-net body past the cone');
    assert.equal(scans.length, 0);
    assert.ok(transitS > 0 && transitS < CUSTOMS_SCAN_DWELL_S, `transit ${transitS} must be < dwell ${CUSTOMS_SCAN_DWELL_S}`);
    assert.equal(Number(t.state.player.heat || 0), 0, 'clean drop-kick must not raise heat');
  } finally {
    t.cleanup();
  }
});

test('a parked contraband pod in the cone is scanned and heat rises', async () => {
  const t = await bootPhysics(14822);
  try {
    const scans = [];
    t.sim.bus.on('contraband:scanned', (p) => scans.push(p));

    spawnScanner(t);
    const pod = spawnPod(t, { pos: { x: 65, z: LANE_Z } });
    teleport(t.player, 420, 380);
    t.sim.step();

    const heatBefore = Number(t.state.player.heat) || 0;
    let dwellS = 0;
    for (let i = 0; i < 90; i++) {
      t.sim.step();
      if (pod.data.customsConeEntered) dwellS = t.state.simTime;
      if (pod.data.customsScanned) break;
    }
    const heatAfter = Number(t.state.player.heat) || 0;
    const found = !!(scans[0] && scans[0].found === true);

    console.log(
      `PQ-148.02 scanned-pod: heatBefore=${heatBefore.toFixed(3)} heatAfter=${heatAfter.toFixed(3)} `
      + `found=${found} entered=${pod.data.customsConeEntered ? 1 : 0} dwellS=${dwellS.toFixed(3)}`,
    );

    assert.equal(pod.data.customsConeEntered, true);
    assert.equal(pod.data.customsScanned, true);
    assert.equal(found, true);
    assert.equal(scans[0].source, 'customs_scan_cone');
    assert.equal(scans[0].podId, pod.id);
    assert.equal(scans[0].commodityId, CONTRABAND_ID);
    assert.ok(heatAfter > heatBefore, `heat must rise via heat.js, ${heatBefore} → ${heatAfter}`);
    assert.ok(heatAfter + 1e-9 >= 0.16, `contraband bust is 0.16, got ${heatAfter}`);
  } finally {
    t.cleanup();
  }
});

test('a hauler hull occludes the cone — parked pod behind it is not scanned', async () => {
  const t = await bootPhysics(14823);
  try {
    const scans = [];
    t.sim.bus.on('contraband:scanned', (p) => scans.push(p));

    spawnScanner(t);
    t.sim.spawn(shipSpec({
      team: 2,
      pos: { x: 32, z: 14 },
      radius: 16,
      mass: 80,
      defId: 'ship_barge',
      data: { defId: 'ship_barge', trafficRole: 'hauler' },
    }));
    const pod = spawnPod(t, { pos: { x: 65, z: LANE_Z } });
    teleport(t.player, 420, 380);

    for (let i = 0; i < 90; i++) t.sim.step();

    assert.equal(
      scanLineOccluded({ x: 0, z: 0 }, pod.pos, { pos: { x: 32, z: 14 }, radius: 16 }),
      true,
      'geometry: hauler sits on the scan line',
    );
    assert.equal(pod.data.customsScanned, undefined);
    assert.equal(scans.length, 0);
    assert.equal(Number(t.state.player.heat || 0), 0);
  } finally {
    t.cleanup();
  }
});
