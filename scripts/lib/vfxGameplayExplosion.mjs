// Standalone visual-lab mount of the shipping destruction owner. Recipes, pool admission,
// accessibility, phased timing and integration remain in vfx.js and its production renderers.
import * as THREE from 'three';
import { vfx } from '../../src/render/vfx.js';
import { QuarksVfxSystem } from '../../src/render/vfx/quarksSystem.js';
import { resolveVfxAccessibilityProfile } from '../../src/render/vfxAccessibility.js';

const NOOP = () => {};
// These constructors are unrelated to destruction. Their absence does not replace a destruction
// layer: native shard/sprite/streak pools, event lights, impact structure, gas and Quarks stay live.
const UNRELATED_CONSTRUCTORS = [
  '_ensureOverflowJets', '_initRibbonTrails', '_initMiningBeam', '_initTetherCable',
  '_initArcPreview', '_initMasslineReleaseArc', '_initMasslineSwingTrace',
  '_initMonofilamentBlade', '_initDockingCradle', '_initApexFlare', '_initTargetContour',
  '_initSeamMarkers', '_initCombatBeams', '_initFieldGeometry',
];

/**
 * createGameplayExplosion({scene, camera, state, renderer?, viewportHeight?})
 *   .reset({seed=17, time=0})
 *   .fire({id, type='asteroid', pos, radius, vel?, cause?, ...deathReceipt})
 *   .update(dt)     after advancing state.simTime; equal-time calls do not age an effect
 *   .inspect() / .dispose()
 *
 * This owns its supporting gas/Quarks layers. Do not also emit the old lab-only explosion into
 * another gas/Quarks instance. It never mutates the supplied state or the authored victim mesh.
 */
export function createGameplayExplosion({ scene, camera, state, renderer = null, viewportHeight = 720 }) {
  if (!scene || !camera || !state) throw new Error('Explosion lab requires scene, camera and state');
  const root = new THREE.Group();
  root.name = 'ProductionDestructionVfx';
  scene.add(root);
  const privateState = {
    ...state,
    mode: state.mode || 'flight',
    settings: state.settings || { video: {}, accessibility: {} },
    render: { ...state.render, scene: root, camera, renderer, viewport: { height: viewportHeight } },
  };
  const owner = Object.create(vfx);
  for (const name of UNRELATED_CONSTRUCTORS) owner[name] = NOOP;
  const quarks = new QuarksVfxSystem();
  quarks.attach(root);
  owner._initWeaponPresenter = function initDestructionDebris() {
    this._weaponPresenter = { quarks, dispose: () => quarks.dispose() };
  };
  // No gameplay bus is installed in this visual laboratory. The actual destruction entry points
  // below still run their complete presentation recipe; audio/feel intents have no observer here.
  owner.init({
    state: privateState,
    bus: { on: () => NOOP, off: NOOP, emit: NOOP },
    helpers: { player: () => privateState.entities?.get(privateState.playerId) || null },
  });

  let disposed = false;
  let seed = 17;
  let randomState = seed;
  let lastTime = Number.isFinite(state.simTime) ? state.simTime : 0;
  let fired = 0;
  let lastReceipt = null;
  let accessibility = resolveVfxAccessibilityProfile(privateState.settings);
  const phases = [];
  const productionEmitter = owner._explosionEmitter;
  owner._explosionEmitter = (phase, entry) => {
    phases.push({ phase, classId: entry.classId, at: privateState.simTime });
    return productionEmitter(phase, entry);
  };
  const random = () => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  };
  function seeded(call) {
    // Legacy cosmetic samplers still use Math.random. Scope the lab seed to synchronous owner
    // calls only; restore before returning so another scene and the simulation are untouched.
    const ambientRandom = Math.random;
    try { Math.random = random; return call(); }
    finally { Math.random = ambientRandom; }
  }
  function syncContext() {
    privateState.settings = state.settings || privateState.settings;
    privateState.entities = state.entities;
    privateState.playerId = state.playerId;
    privateState.world = state.world;
    owner._syncFrameMembrane();
    accessibility = resolveVfxAccessibilityProfile(privateState.settings);
    owner._gas.setAccessibility(accessibility);
    return accessibility;
  }
  function publish(dt) {
    // Shipping update reacquires this owner after WebGL context restoration.
    owner._initArcadeStructural();
    owner._integrateParticles(dt);
    owner._integrateSprites(dt);
    owner._integrateTrailStreaks(dt);
    owner._decayEventLights(dt);
    owner._arcadeStructural.update(dt, camera, viewportHeight);
    owner._gas.update(privateState.simTime, camera);
    // Newer destruction builds may split the structural rupture layer from the shared phased
    // pool. Keep this adapter forward-compatible without inventing a lab-only renderer.
    // ExplosionRupture consumes the absolute simulation clock and accessibility settings.
    // Passing the frame delta here would pin its lifecycle near the first frame.
    owner._explosionRupture?.update?.(privateState.simTime, privateState.settings);
    quarks.update(dt, accessibility);
  }
  function inspect() {
    return {
      owner: 'vfx._onDestroyed / vfx._onKilled', seed, time: lastTime, fired,
      receipt: lastReceipt ? { ...lastReceipt } : null,
      phases: phases.slice(), explosions: owner._explosions.stats(),
      pending: owner._pendingDetonations.filter(record => record.active).length,
      sprites: owner._liveSpriteCount, particles: owner._liveCount,
      streaks: owner._liveTrailStreakCount, eventLights: owner._activeLightCount,
      buckets: Object.fromEntries(['glow', 'ring', 'combustion', 'smoke']
        .map(kind => [kind, owner._spriteBatches[kind].mesh.count])),
      gasBodies: owner._gas.mesh.count,
      quarksBatches: quarks.renderer.batches.length,
      structured: owner._arcadeStructural.stats(),
      rupture: typeof owner._explosionRupture?.inspect === 'function'
        ? owner._explosionRupture.inspect()
        : null,
    };
  }
  function reset(options = {}) {
    if (disposed) return;
    seed = Number.isFinite(options.seed) ? options.seed >>> 0 : seed;
    randomState = seed;
    lastTime = Number.isFinite(options.time) ? options.time : 0;
    privateState.simTime = lastTime;
    owner._t = lastTime;
    fired = 0;
    lastReceipt = null;
    phases.length = 0;
    owner._resetPendingDetonations();
    owner._explosions.clear();
    owner._explosions._serial = seed;
    owner._admissionSerial = seed;
    owner._arcadeStructuralSerial = seed;
    while (owner._liveCount) owner._retireParticle(owner._activeParticles[owner._liveCount - 1]);
    while (owner._liveSpriteCount) owner._retireSprite(owner._activeSprites[owner._liveSpriteCount - 1]);
    owner._clearTrailStreaks();
    for (const light of owner._lights) owner._retireEventLightSlot(light);
    owner._initArcadeStructural();
    owner._arcadeStructural.clear();
    owner._gas.clear();
    if (typeof owner._explosionRupture?.clear === 'function') owner._explosionRupture.clear();
    else if (typeof owner._explosionRupture?.reset === 'function') owner._explosionRupture.reset();
    quarks.reset();
    quarks._flowSequence = seed;
    syncContext();
    seeded(() => publish(0));
  }
  function fire(receipt = {}) {
    if (disposed) throw new Error('Explosion adapter is disposed');
    if (!Number.isFinite(receipt.pos?.x) || !Number.isFinite(receipt.pos?.z)) {
      throw new Error('Explosion receipt needs a finite world-space pos');
    }
    syncContext();
    const payload = { id: seed, type: 'asteroid', radius: 11, ...receipt };
    lastReceipt = {
      id: payload.id,
      type: payload.type,
      cause: payload.cause || payload.presentation?.cause || 'generic',
      presentationCause: payload.presentation?.cause || null,
      radius: payload.radius,
      mass: payload.mass,
      capital: !!payload.capital,
      entityData: payload.entity?.data ? { ...payload.entity.data } : null,
      position: payload.pos ? { x: payload.pos.x, z: payload.pos.z } : null,
      direction: payload.presentation?.direction || payload.direction || null,
      normal: payload.presentation?.normal || payload.normal || null,
    };
    // Preserve the ordinary killed-ship overload tell. Asteroid/wreck/drone destruction uses the
    // shipped non-ship path, including the complete structured combustion/ignition lifecycle.
    seeded(() => {
      if (payload.type === 'ship') owner._onKilled(payload);
      else owner._onDestroyed(payload);
      publish(0);
    });
    fired++;
    return inspect();
  }
  function update(dt) {
    if (disposed) return;
    const nextTime = Number.isFinite(state.simTime) ? state.simTime : lastTime + Math.max(0, dt || 0);
    if (nextTime < lastTime) { reset({ seed, time: nextTime }); return; }
    const elapsed = nextTime - lastTime;
    syncContext();
    if (!(elapsed > 0)) return;
    // Same production dt ceiling, with all elapsed simulation time consumed in bounded steps.
    let remaining = elapsed;
    seeded(() => {
      while (remaining > 1e-8) {
        const step = Math.min(0.1, remaining);
        lastTime += step;
        privateState.simTime = lastTime;
        owner._t = lastTime;
        owner._updatePendingDetonations();
        owner._explosions.update(step, owner._explosionEmitter);
        publish(step);
        remaining -= step;
      }
    });
    lastTime = nextTime;
  }
  function dispose() {
    if (disposed) return;
    reset();
    owner.destroy();
    root.removeFromParent();
    disposed = true;
  }
  reset({ seed, time: lastTime });
  return { root, fire, update, reset, inspect, dispose };
}
