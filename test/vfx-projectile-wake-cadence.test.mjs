import assert from 'node:assert/strict';
import test from 'node:test';

import { vfx } from '../src/render/vfx.js';

function projectileDiag() {
  return {
    candidates: 0,
    particlesSpawned: 0,
    streaksSpawned: 0,
    spritesSpawned: 0,
    byClass: Object.fromEntries(
      ['kinetic', 'rail', 'missile', 'plasma', 'pulse', 'emp', 'other']
        .map((name) => [name, { particles: 0, streaks: 0, sprites: 0 }]),
    ),
  };
}

function wakeTransitionHarness(relevance, onEmit, onConsume) {
  const owner = Object.create(vfx);
  owner.state = {};
  owner._scene = {};
  owner._t = 0;
  owner._particleMat = null;
  owner._vfxSubsystemLast = {};
  owner._projectileTrailDiag = projectileDiag();
  owner._projectileTrailFrameIndex = 91;
  owner._projectileTrailsWereRelevant = true;
  owner._cadenceProjectileTrail = 0.019;
  owner._syncFrameMembrane = () => {};
  owner._emitTrails = () => false;
  owner._updateRibbonTrails = () => false;
  owner._projectileTrailsRelevant = () => relevance.shift() ?? true;
  owner._consumeCadence = onConsume;
  owner._emitProjectileTrails = onEmit;
  owner._miningBeamActive = () => false;
  owner._tetherCableActive = () => false;
  owner._doctrineTellActive = 0;
  owner._arcPreviewActive = () => false;
  owner._seamMarkersRelevant = () => false;
  owner._sleepSeamMarkers = () => {};
  owner._lootMagnetRelevant = () => false;
  owner._fieldFlowRelevant = () => false;
  owner._fieldGeomInitialized = false;
  owner._updateEnergy = () => false;
  owner._planetSkimRelevant = () => false;
  owner._planetSkim = null;
  owner._explosions = { update: () => 0 };
  owner._combatBeams = null;
  owner._liveCount = 0;
  owner._integrateParticles = () => {};
  owner._liveSpriteCount = 0;
  owner._liveTrailStreakCount = 0;
  owner._decayEventLights = () => false;
  owner._publishVfxSubsystemDiag = () => {};
  return owner;
}

test('dormant-to-active update resets projectile cadence before one dt-sized wake emission', () => {
  const emissions = [];
  let cadenceConsumes = 0;
  const owner = wakeTransitionHarness(
    [false, true],
    function emit(step) {
      emissions.push({
        step,
        frameIndexAtEmission: this._projectileTrailFrameIndex,
        cadenceAtEmission: this._cadenceProjectileTrail,
      });
      return true;
    },
    () => {
      cadenceConsumes++;
      return 999;
    },
  );

  owner.update(1 / 60);
  assert.equal(owner._projectileTrailsWereRelevant, false);
  assert.deepEqual(emissions, []);

  owner.update(1 / 60);
  assert.equal(cadenceConsumes, 0, 'wake must not consume the stale cadence accumulator first');
  assert.deepEqual(emissions, [{
    step: 1 / 60,
    frameIndexAtEmission: 0,
    cadenceAtEmission: 0,
  }]);
  assert.equal(owner._projectileTrailFrameIndex, 0);
  assert.equal(owner._cadenceProjectileTrail, 0);
  assert.equal(owner._vfxSubsystemLast.projectileTrails, 1);
});
