// Characterization test for tumbling ship trail lateral deviation baseline (PQ-139.04a).
//
// Defect under test / Baseline question:
// A tumbling ship's drive trail should corkscrew — the nozzle is orbiting as the hull spins,
// so the wake should weave. Does it deviate at all today, and by how much?
//
// This test characterizes the current baseline behavior of `createRibbonTrail().follow(...)`
// fed by the fallback sampler and by the Three.js scene-graph socket sampler driven by the real
// `resolveTumbleBodyLanguage`.
//
// Vision pinned: "A tumble must be legible from the wake, not only from the hull."

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRibbonTrail } from '../src/render/engineTrailSurfaces.js';
import { resolveTumbleBodyLanguage } from '../src/render/masslinePresentation.js';
import { scenario } from '../scripts/lib/bench/scenarios/feel.tumble_trail.mjs';

const SPEED = 180; // WU/s, nominal ship cruise speed
const DT = 1 / 60;
const DURATION_S = 3.0; // 180 frames, full saturation of ribbon buffer
const FRAMES = Math.round(DURATION_S / DT);
const RADIUS = 24; // Medium-large ship radius (eligible for ribbons)
const BACK = RADIUS * 0.88; // Nozzle setback distance from entity center (21.12 WU)
const SPACING = Math.max(2.0, RADIUS * 0.12); // 2.88 WU sample spacing
const DISCONTINUITY = 240;
const PERIOD = 1 / 30; // 30 Hz trail sample period
const SEGMENT_CAPACITY = 24; // Live NPC ribbons retain 24 segments (historical synthetic test used 48)

/**
 * Extract center line coordinates for all committed history samples from ribbon geometry.
 * Returns array of { x, z, lateralDev } where lateralDev is distance from line z = 0.
 */
function extractTrailCenterSamples(mesh) {
  const pos = mesh.geometry.attributes.position.array;
  const count = mesh.geometry.drawRange.count / 6 + 1;
  const samples = [];
  let sumDev = 0;
  let maxDev = 0;

  // History samples start at index 1 (index 0 is the live nozzle head)
  for (let i = 1; i < count; i++) {
    const vi = i * 2;
    const x = (pos[vi * 3] + pos[(vi + 1) * 3]) * 0.5;
    const z = (pos[vi * 3 + 2] + pos[(vi + 1) * 3 + 2]) * 0.5;
    const dev = Math.abs(z); // Distance from straight velocity line z = 0
    sumDev += dev;
    if (dev > maxDev) maxDev = dev;
    samples.push({ index: i, x, z, dev });
  }

  const historyCount = Math.max(1, count - 1);
  return {
    totalPoints: count,
    historyCount,
    meanLateralDeviation: sumDev / historyCount,
    maxLateralDeviation: maxDev,
    samples,
  };
}

/**
 * Drive a ribbon trail for a ship flying straight in +X direction with given tumble parameters.
 *
 * @param {object} options
 * @param {boolean} options.tumbling
 * @param {number} options.spinRate
 * @param {boolean} options.useSceneGraphSocket
 */
function simulateTrail({ tumbling = false, spinRate = 3.5, useSceneGraphSocket = false } = {}) {
  const scene = new THREE.Scene();
  const trail = createRibbonTrail(scene, '#39d0ff', SEGMENT_CAPACITY, 2.5);
  const owner = { id: `ship-${tumbling ? 'tumble' : 'straight'}-${useSceneGraphSocket ? 'socket' : 'fallback'}` };

  // Set up Three.js scene-graph hierarchy matching renderer.js & ship asset kit
  const root = new THREE.Object3D();
  const hull = new THREE.Object3D();
  root.add(hull);
  hull.rotation.order = 'XYZ';

  const socket = new THREE.Object3D();
  socket.name = 'SOCKET_Trail_Main';
  // Authored nozzle position on hull: X is aft (-13.95), Y is slight dorsal/ventral (-0.05), Z is centerline (0)
  socket.position.set(-13.95, -0.05, 0);
  socket.userData = { forward: [-1, 0, 0] };
  hull.add(socket);

  for (let i = 0; i < FRAMES; i++) {
    const t = i * DT;
    const posX = SPEED * t;
    const posZ = 0;
    const rot = 0; // Facing +X

    let nozzleX, nozzleZ;

    if (!tumbling) {
      if (useSceneGraphSocket) {
        root.position.set(posX, 0, posZ);
        root.rotation.y = -rot;
        hull.rotation.x = 0;
        hull.rotation.z = 0;
        socket.updateWorldMatrix(true, false);
        const wp = new THREE.Vector3();
        socket.getWorldPosition(wp);
        nozzleX = wp.x;
        nozzleZ = wp.z;
      } else {
        nozzleX = posX - Math.cos(rot) * BACK;
        nozzleZ = posZ - Math.sin(rot) * BACK;
      }
    } else {
      const body = resolveTumbleBodyLanguage({
        mode: 'tumbling',
        cause: 'impact',
        angVel: spinRate,
        spin: spinRate,
        simTime: t,
        elapsedS: t,
        remainS: DURATION_S - t,
        motionReduce: false,
        phaseBias: 0,
        flightBank: 0,
        flightPitch: 0,
      });

      if (useSceneGraphSocket) {
        root.position.set(posX, 0, posZ);
        root.rotation.y = -rot;
        hull.rotation.x = body.bank;
        hull.rotation.z = body.pitch;
        socket.updateWorldMatrix(true, false);
        const wp = new THREE.Vector3();
        socket.getWorldPosition(wp);
        nozzleX = wp.x;
        nozzleZ = wp.z;
      } else {
        // vfx._updateRibbonTrails fallback sampler: e.pos - cos(e.rot)*back
        nozzleX = posX - Math.cos(rot) * BACK;
        nozzleZ = posZ - Math.sin(rot) * BACK;
      }
    }

    trail.follow(nozzleX, nozzleZ, rot, DT, owner, SPACING, DISCONTINUITY, PERIOD);
  }

  trail.rebuild(1.0, 0.0, DURATION_S, 1.0);
  return extractTrailCenterSamples(trail.getMesh());
}

test('vfx-tumble-trail-baseline: characterization of fallback nozzle sampler (headless)', () => {
  const straight = simulateTrail({ tumbling: false, useSceneGraphSocket: false });
  const tumbling = simulateTrail({ tumbling: true, spinRate: 3.5, useSceneGraphSocket: false });

  // Ratio comparison
  const ratio = tumbling.meanLateralDeviation === 0 && straight.meanLateralDeviation === 0
    ? 1.0
    : tumbling.meanLateralDeviation / Math.max(1e-9, straight.meanLateralDeviation);

  console.log('\n================================================================================');
  console.log('PQ-139.04a BASELINE MEASUREMENT — FALLBACK NOZZLE SAMPLER (HEADLESS)');
  console.log('================================================================================');
  console.log(`Condition A (Straight flight): ${straight.meanLateralDeviation.toFixed(6)} WU mean lateral deviation`);
  console.log(`Condition B (Tumbling flight): ${tumbling.meanLateralDeviation.toFixed(6)} WU mean lateral deviation`);
  console.log(`Deviation Ratio (B / A):      ${ratio.toFixed(4)} (net deviation = ${(tumbling.meanLateralDeviation - straight.meanLateralDeviation).toFixed(6)} WU)`);
  console.log('================================================================================\n');

  // Characterization assertions pinning CURRENT baseline
  assert.equal(
    straight.meanLateralDeviation,
    0,
    'Condition A straight flight must have 0 lateral deviation',
  );

  assert.equal(
    tumbling.meanLateralDeviation,
    0,
    'CURRENT BASELINE PIN: Fallback sampler ignores bank/pitch entirely, so a tumbling ship wake has 0 lateral deviation today. ' +
    'This test will fail when wake corkscrew is implemented ("A tumble must be legible from the wake, not only from the hull.").',
  );
});

test('vfx-tumble-trail-baseline: characterization of scene-graph socket sampler across spin rates', () => {
  const straight = simulateTrail({ tumbling: false, useSceneGraphSocket: true });
  const tumbleLow = simulateTrail({ tumbling: true, spinRate: 1.0, useSceneGraphSocket: true });
  const tumbleNominal = simulateTrail({ tumbling: true, spinRate: 3.5, useSceneGraphSocket: true });
  const tumbleHigh = simulateTrail({ tumbling: true, spinRate: 7.0, useSceneGraphSocket: true });

  console.log('================================================================================');
  console.log('PQ-139.04a BASELINE MEASUREMENT — 3D SCENE-GRAPH SOCKET SAMPLER');
  console.log('================================================================================');
  console.log(`Condition A (Straight flight):               ${straight.meanLateralDeviation.toFixed(6)} WU mean lateral deviation`);
  console.log(`Condition B (Tumbling flight, 1.0 rad/s):    ${tumbleLow.meanLateralDeviation.toFixed(6)} WU mean (max: ${tumbleLow.maxLateralDeviation.toFixed(4)} WU)`);
  console.log(`Condition B (Tumbling flight, 3.5 rad/s):    ${tumbleNominal.meanLateralDeviation.toFixed(6)} WU mean (max: ${tumbleNominal.maxLateralDeviation.toFixed(4)} WU)`);
  console.log(`Condition B (Tumbling flight, 7.0 rad/s):    ${tumbleHigh.meanLateralDeviation.toFixed(6)} WU mean (max: ${tumbleHigh.maxLateralDeviation.toFixed(4)} WU)`);
  console.log('================================================================================\n');

  assert.equal(straight.meanLateralDeviation, 0, 'Condition A straight flight must have 0 lateral deviation');

  // Assert current socket behavior: only tiny accidental Euler cross-coupling, far below visual legibility
  assert.ok(
    tumbleNominal.meanLateralDeviation > 0.20 && tumbleNominal.meanLateralDeviation < 0.45,
    `SYNTHETIC BASELINE PIN: Scene-graph socket with frozen rot=0 produces only accidental Euler cross-coupling ` +
    `(${tumbleNominal.meanLateralDeviation.toFixed(4)} WU measured), and discards all vertical corkscrew motion. ` +
    'This synthetic measurement is superseded by the real production path characterization below.',
  );

  // Assert spin sensitivity ordering for peak excursion
  assert.ok(
    tumbleLow.maxLateralDeviation < tumbleNominal.maxLateralDeviation &&
    tumbleNominal.maxLateralDeviation <= tumbleHigh.maxLateralDeviation,
    'Tumble socket peak lateral excursion scales with spin rate',
  );
});

test('vfx-tumble-trail-baseline: real production path characterization (rapier-dynamic SG-02)', async () => {
  const result = await scenario.run(4242);
  const metrics = result.metrics;
  assert.equal(metrics.schema, 'spaceface.feel.tumbleTrail.v1');
  assert.equal(metrics.projection, 'shipping XZ projection');
  assert.equal(metrics.historicalBaseline.valid, false);

  const straight = metrics.cases.matched_straight;
  assert.equal(straight.peakMaxCrossTrackWU, 0, 'matched straight flight retains 0 cross-track departure');
  assert.equal(straight.yawTurns, 0, 'straight flight produces 0 turns');
  assert.equal(straight.socketSamplerUsed, true, 'straight case must use the marked production socket sampler');
  assert.equal(straight.fallbackSamplerHits, 0, 'fallback-only sampling must not pass while claiming socket sampling');
  assert.equal(straight.historyCapacity, 24, 'observed inspect() capacity must be the governed 24');
  assert.ok(straight.historyCount > 0, 'straight case must accumulate ribbon history');
  assert.ok(straight.peakAppliedThrust > 0,
    'straight case must report applied physics thrust, not only a coasting speed glow');
  assert.equal(straight.recoveryTimeS, null, 'straight case has no tumble recovery to observe');

  const saturated = metrics.cases.saturated_tumble;
  assert.equal(saturated.tumbledReceiptReceived, true, 'tumble receipt must be emitted and recorded');
  assert.equal(saturated.socketSamplerUsed, true, 'saturated case must use the marked production socket sampler');
  assert.equal(saturated.fallbackSamplerHits, 0, 'fallback-only sampling must not pass while claiming socket sampling');
  assert.equal(saturated.historyCapacity, 24, 'observed inspect() capacity must be the governed 24');
  assert.ok(saturated.historyCount > 0, 'saturated case must accumulate ribbon history');
  assert.ok(saturated.peakAppliedThrust > 0,
    'saturated case must report applied physics thrust');
  assert.ok(saturated.entrySpin > 5.0, 'saturated tumble must reach clamped spinMax ~6 rad/s');

  // The historical 0 / 0.25 WU baseline is refuted: real path produces ~2.1-4.7 WU peak cross-track departure
  assert.ok(saturated.peakMaxCrossTrackWU > 2.0 && saturated.peakMaxCrossTrackWU < 5.0,
    `real production dynamic impulse produces ${saturated.peakMaxCrossTrackWU.toFixed(3)} WU peak cross-track departure`);

  assert.ok(saturated.yawTurns > 0, 'nonzero spin receipt must produce actual integrated yaw');
  assert.ok(saturated.lateralReversals > 0, 'the presented wake has alternating projected departure');

  // Missing recovery stays null; residual is reported separately and must be finite.
  assert.ok(saturated.recoveryTimeS === null || Number.isFinite(saturated.recoveryTimeS),
    'recoveryTimeS must remain null when unobserved, never a fabricated zero');
  assert.notEqual(saturated.recoveryTimeS, 0, 'missing recovery must not collapse to a green zero');
  assert.ok(Number.isFinite(saturated.terminalResidualCrossTrackWU),
    `terminal residual must be a finite observed value (${saturated.terminalResidualCrossTrackWU})`);

  for (const bar of metrics.bars) {
    assert.equal(Number.isFinite(bar.value), true, `${bar.bar} must fail closed on missing/non-finite values`);
    assert.equal(typeof bar.note, 'string');
    if (bar.bar === 'PQ-139.04-turns') {
      assert.match(bar.note, /not a minimum full physics rotation/);
    }
    if (bar.bar === 'PQ-139.04-recovery' && saturated.recoveryTimeS === null) {
      assert.equal(bar.met, false, 'unobserved recovery cannot pass from a small terminal residual');
    }
  }
});
