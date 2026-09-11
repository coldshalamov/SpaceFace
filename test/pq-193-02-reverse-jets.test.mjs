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

test('seed 19302: retro jet is stubby (exit radius not a hairline vs length) and same family as the drive', () => {
  const length = PLAYER_RETRO_VOLUME_RECIPE.lengthWU;
  const exitR = PLAYER_RETRO_VOLUME_RECIPE.exitRadiusWU;
  const aspect = length / exitR;
  assert.ok(exitR >= 1.0, `exitRadiusWU ${exitR} must read as a nozzle, not a filament`);
  assert.ok(aspect <= 8, `length/exit ${aspect.toFixed(2)} must stay jet-like, not a needle`);
  assert.ok(PLAYER_RETRO_VOLUME_RECIPE.tailFlare >= 1.5, 'the jet flares downstream');
  assert.ok(length < 5, 'recipe is stubby, not a long filament');
  const envelope = retroEnvelopeForDemand(1);
  assert.equal(retroEnvelopeIsJetLike(envelope), true);
  assert.equal(envelope.construction, RETRO_JET_CONSTRUCTION);
  const diameter = envelope.exitRadiusWU * 2;
  assert.ok(diameter / envelope.lengthWU >= 0.5, `diameter/length=${diameter / envelope.lengthWU}`);
  const src = readFileSync(resolve(ROOT, 'src/render/thruster/recipes/plasmaStreamRecipe.js'), 'utf8');
  const recipeSrc = src.slice(src.indexOf('export const PLAYER_RETRO_VOLUME_RECIPE'));
  assert.equal(/needle/i.test(recipeSrc), false, 'recipe must not praise a needle silhouette');
  const owner = readFileSync(resolve(ROOT, 'src/render/thruster/systems/playerRetroVolume.js'), 'utf8');
  assert.match(owner, /PlasmaRibbonPlume/);
  assert.match(owner, /DriveForge/);
  assert.doesNotMatch(owner, /new VolumetricPlumeSystem/);
  console.log(`SEED=${SEED} length=${length} exitR=${exitR} aspect=${aspect.toFixed(2)} construction=${RETRO_JET_CONSTRUCTION}`);
});
