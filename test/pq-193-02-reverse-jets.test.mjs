// PQ-193.02 — reverse/brake is one jet of the main-drive family, not two needles.
//
// Imports the shipped retro update. Holds reverse demand on a reaction-drive body and asserts:
//   • both bow jets stay live
//   • production player spawns zero needle sprites
//   • envelope diameter vs length is jet-like (exit radius not hairline)
//   • live owner is swept ribbon sheets, not an isotropic volume
//
//   node --test test/pq-193-02-reverse-jets.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { computeFlightTelemetry } from '../src/core/flight/flightTelemetry.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { PROPULSION_PROFILES } from '../src/core/flight/propulsionCatalog.js';
import { resolveActuatorScale, resolveRcsFirings } from '../src/render/rcsJets.js';
import { vfx } from '../src/render/vfx.js';
import { PLAYER_RETRO_VOLUME_RECIPE } from '../src/render/thruster/recipes/plasmaStreamRecipe.js';
import {
  PlayerRetroJets,
  productionPlayerReverseNeedleSprites,
  RETRO_JET_CONSTRUCTION,
  reverseNeedleEmissionAllowed,
  retroEnvelopeForDemand,
  retroEnvelopeIsJetLike,
  selectRetroJets,
  updatePlayerRetroVolume,
} from '../src/render/thruster/systems/playerRetroVolume.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DT = 1 / 60;
const SEED = 19302;

function mockVolume() {
  return {
    last: null,
    resetCount: 0,
    reset() { this.resetCount += 1; this.last = { live: 0 }; },
    update(dt, sockets, params) {
      this.last = { dt, sockets: sockets.slice(), params: { ...params }, live: sockets.length };
      return { live: sockets.length };
    },
  };
}

function reverseActuators(ticks = 8) {
  const profile = PROPULSION_PROFILES.drive_reaction_m;
  const body = {
    pos: { x: 0, z: 0 }, vel: { x: 40, z: 0 }, rot: 0, angVel: 0, mass: 20, inertia: 40, radius: 6,
  };
  let runtime = createPropulsionRuntime(profile);
  let result = null;
  for (let i = 0; i < ticks; i++) {
    result = stepPropulsion({
      dt: DT,
      body,
      input: { reverse: 1, brake: 1 },
      profile,
      runtime,
    });
    runtime = result.runtime;
  }
  const telemetry = computeFlightTelemetry({
    body,
    profile,
    control: { telemetry: result.telemetry },
  });
  const pose = { x: body.pos.x, z: body.pos.z, rot: body.rot, radius: body.radius };
  const scale = resolveActuatorScale(profile);
  const firings = resolveRcsFirings(telemetry.actuators, pose, scale);
  return { actuators: telemetry.actuators, pose, scale, firings };
}

test('both bow jets stay live while reverse demand is held (seed 19302)', () => {
  const { actuators, pose, scale, firings } = reverseActuators();
  assert.ok(actuators.reverse > 0.001, 'held reverse must produce reverse demand');
  const jets = selectRetroJets(firings);
  assert.equal(jets.length, 2, 'bow port and starboard retros both fire');
  assert.deepEqual(jets.map((j) => j.role).sort(), ['reverse-left', 'reverse-right']);

  const volume = mockVolume();
  const frames = [];
  for (let i = 0; i < 120; i++) {
    const result = updatePlayerRetroVolume(volume, { actuators, pose, scale, dt: DT });
    frames.push(result.live);
  }
  assert.equal(frames.length, 120);
  assert.ok(frames.every((live) => live === 2), 'both jets live for 120 frames');
  console.log('pq-193.02 reverse demand both bow jets live', {
    seed: SEED,
    frames: frames.length,
    live: 2,
    reverse: actuators.reverse,
  });
});

test('production player reverse spawns zero needle sprites', () => {
  assert.equal(reverseNeedleEmissionAllowed(true), false);
  assert.equal(productionPlayerReverseNeedleSprites(), 0);
  const { actuators, pose, scale } = reverseActuators();
  const volume = mockVolume();
  const result = updatePlayerRetroVolume(volume, { actuators, pose, scale, dt: DT });
  assert.equal(result.needles, 0);
  assert.equal(result.live, 2);
  assert.equal(result.construction, RETRO_JET_CONSTRUCTION);

  const vfx = readFileSync(resolve(ROOT, 'src/render/vfx.js'), 'utf8');
  assert.match(vfx, /reverseNeedleEmissionAllowed\(this\._usesProductionThruster/);
  assert.match(vfx, /applyPlayerRetroVolume\(volume, view, peak, dt, a11y/);
  assert.match(vfx, /new PlayerRetroJets/);
  assert.equal(typeof PlayerRetroJets, 'function');
});

test('seed 19302: retro jet has bounded directional aspect, separated sheets and the drive family', () => {
  const length = PLAYER_RETRO_VOLUME_RECIPE.lengthWU;
  const exitR = PLAYER_RETRO_VOLUME_RECIPE.exitRadiusWU;
  const aspect = length / exitR;
  assert.ok(exitR >= 1.0, `exitRadiusWU ${exitR} must read as a nozzle, not a filament`);
  assert.ok(aspect >= 5 && aspect <= 11, `length/exit ${aspect.toFixed(2)} rejects both bulbs and needles`);
  assert.ok(PLAYER_RETRO_VOLUME_RECIPE.tailFlare > 1 && PLAYER_RETRO_VOLUME_RECIPE.tailFlare < 1.4, 'controlled downstream flare keeps the pair distinct');
  assert.ok(length > 6 && length < 12, 'braking jet reads axially but stays shorter than the main drive');
  const envelope = retroEnvelopeForDemand(1);
  assert.equal(retroEnvelopeIsJetLike(envelope), true);
  assert.equal(envelope.construction, RETRO_JET_CONSTRUCTION);
  const diameter = envelope.exitRadiusWU * 2;
  assert.ok(envelope.lengthWU / diameter >= 2.2 && envelope.lengthWU / diameter <= 6, `length/diameter=${envelope.lengthWU / diameter}`);
  assert.equal(retroEnvelopeIsJetLike({ lengthWU: 2, exitRadiusWU: 1.3 }), false, "reject luminous bulbs");
  assert.equal(retroEnvelopeIsJetLike({ lengthWU: 50, exitRadiusWU: 0.1 }), false, "reject needles");
  const src = readFileSync(resolve(ROOT, 'src/render/thruster/recipes/plasmaStreamRecipe.js'), 'utf8');
  const recipeSrc = src.slice(src.indexOf('export const PLAYER_RETRO_VOLUME_RECIPE'));
  assert.equal(/needle/i.test(recipeSrc), false, 'recipe must not praise a needle silhouette');
  const owner = readFileSync(resolve(ROOT, 'src/render/thruster/systems/playerRetroVolume.js'), 'utf8');
  assert.match(owner, /PlasmaRibbonPlume/);
  assert.match(owner, /DriveForge/);
  assert.doesNotMatch(owner, /new VolumetricPlumeSystem/);
  console.log(`SEED=${SEED} length=${length} exitR=${exitR} aspect=${aspect.toFixed(2)} construction=${RETRO_JET_CONSTRUCTION}`);
});

test('release tail rides the moving hull instead of molting off in space (seed 19302)', () => {
  // Reproduce the shipped bug: brake, then hit the accelerator. The spooling-down pair used to
  // replay a frozen render-local pose — two bright blobs stayed parked at the release point and
  // the ship flew out from under them. The held pose is now ship-local and rebuilt per frame.
  const { actuators, scale } = reverseActuators();
  const volume = mockVolume();
  volume.spool = 0;
  const ctx = {
    _energy: { retroVolume: volume },
    _rcsPoseScratch: {},
    _retroSockets: [
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
      { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 },
    ],
    _retroSocketView: [],
    _retroHeldSockets: [
      { lx: 0, lz: 0, lax: 1, laz: 0 },
      { lx: 0, lz: 0, lax: 1, laz: 0 },
    ],
    _retroHeldCount: 0,
    _retroParams: {},
    _spawnLocalXZ: { x: 0, z: 0 },
    _entityLocalXZ: { x: 0, z: 0 },
    _frameMembrane: null,
    _productionRcsFirings: [],
    _rcsSocketObjects: () => null,
    _writeRetroSocketPose: () => false,
    _rcsScaleFor: () => scale,
    _toLocalXZ(x, z, out) { const t = out || { x: 0, z: 0 }; t.x = x; t.z = z; return t; },
    state: {},
  };
  const player = { pos: { x: 0, z: 0 }, rot: 0, radius: 6 };

  // Hold the brake: both bow jets live, and the held pose is retained ship-locally.
  for (let i = 0; i < 30; i++) {
    vfx._updateRetroVolume.call(ctx, player, actuators, DT, null);
  }
  assert.equal(volume.last.live, 2, 'both bow jets live under brake');
  const liveOffsets = volume.last.sockets.map((s) => ({
    dx: s.x - player.pos.x,
    dz: s.z - player.pos.z,
  }));

  // Release onto the accelerator: reverse demand dies while the hull accelerates away.
  const coast = { ...actuators, reverse: 0, brake: 0 };
  let tailFrames = 0;
  for (let i = 0; i < 12; i++) {
    player.pos.x += 5;
    vfx._updateRetroVolume.call(ctx, player, coast, DT, null);
    const sockets = volume.last && volume.last.sockets;
    if (volume.last && volume.last.live === 2 && sockets && sockets.length >= 2) {
      sockets.forEach((s, j) => {
        assert.ok(Math.abs((s.x - player.pos.x) - liveOffsets[j].dx) < 1e-3,
          `decaying retro jet ${j} must ride the hull (got ${((s.x - player.pos.x) - liveOffsets[j].dx).toFixed(3)} WU drift)`);
        assert.ok(Math.abs((s.z - player.pos.z) - liveOffsets[j].dz) < 1e-3,
          `decaying retro jet ${j} must not be left parked at the release point`);
      });
      tailFrames++;
    }
  }
  assert.ok(tailFrames >= 6, 'release tail should run while the spool decays');
  console.log('pq-193.02 release tail rides the hull', { seed: SEED, tailFrames });
});
