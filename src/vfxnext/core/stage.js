// VFX NEXT — the stage.
//
// Owns every substrate, the scheduler that makes multi-stage events possible, screen-size LOD, and
// the cost readout. A family never touches Three directly; it asks the stage for sparks, debris,
// fronts, ribbons and lights. That indirection is what lets a single effect be swapped into the
// live game later without dragging the whole library along.
//
// Two emission modes, because the twelve families genuinely split two ways:
//
//   emit(id, force)  — ONE-SHOT. Impacts, destructions, latches, snaps. May schedule later stages.
//   hold(id, force)  — SUSTAINED. Plumes, speed streaks, fields, tension, reentry. Re-ticked every
//                      frame from live state until release(id).
//
// The scheduler is what makes "heavy explosion is a multi-stage event, not one expanding sprite"
// structural rather than aspirational: a family returns a list of {at, fn} and the stage guarantees
// the beats fire in order at authored offsets, with the causal force record preserved. Scheduled
// entries own a COPY of the force, because the caller's record is scratch and will be recycled long
// before stage 4 runs.

import * as THREE from 'three';
import { createSparkSubstrate, createSmokeSubstrate } from './gpuAged.js';
import { createDebrisSubstrate, createFrontSubstrate } from './solids.js';
import { RibbonSubstrate } from './ribbons.js';
import { LightPool } from './lights.js';
import { createForceRecord } from './force.js';

const SCHEDULE_CAP = 96;

/** Default caps. Stated in the same currency as the live game's caps so a swap decision is
 *  arithmetic, not vibes: PARTICLE_CAP 1500/3000/4000, SPRITE_CAP 256, TRAIL_STREAK_CAP 96,
 *  EVENT_LIGHT_POOL_SIZE 6 (all src/render/vfx.js). */
export const DEFAULT_BUDGETS = Object.freeze({
  sparks: 2048,
  smoke: 256,
  debris: 384,
  fronts: 48,
  ribbons: 64,
  ribbonSegments: 24,
  lights: 4,
});

export function createStage(scene, opts = {}) {
  const budgets = { ...DEFAULT_BUDGETS, ...(opts.budgets || {}) };

  const sparks = createSparkSubstrate(budgets.sparks);
  const smoke = createSmokeSubstrate(budgets.smoke);
  const debris = createDebrisSubstrate(budgets.debris);
  const fronts = createFrontSubstrate(budgets.fronts);
  const ribbons = new RibbonSubstrate({ capacity: budgets.ribbons, segments: budgets.ribbonSegments });
  const lights = new LightPool({ capacity: budgets.lights }).addTo(scene);

  const root = new THREE.Group();
  root.name = 'vfxnext:root';
  root.add(sparks.mesh, smoke.mesh, debris.mesh, fronts.mesh, ribbons.mesh);
  scene.add(root);

  // Scheduler storage. Fixed-size, pre-allocated force copies — a scheduled stage must never be
  // the reason a frame allocates.
  const schedT = new Float32Array(SCHEDULE_CAP);
  const schedFn = new Array(SCHEDULE_CAP).fill(null);
  const schedForce = new Array(SCHEDULE_CAP);
  for (let i = 0; i < SCHEDULE_CAP; i++) schedForce[i] = createForceRecord();
  const schedUsed = new Uint8Array(SCHEDULE_CAP);
  let schedCursor = 0;
  let schedDropped = 0;

  const sustained = new Map(); // id -> { family, force }
  const families = new Map();

  const stage = {
    scene, root, sparks, smoke, debris, fronts, ribbons, lights, budgets,
    time: 0,
    camera: null,
    quality: 1,        // 0..1 global density multiplier (adaptive LOD hook)
    intensity: 1,      // 0..1 global brightness (accessibility "reduced flash" hook)
    _spawnedThisFrame: 0,
    _droppedThisFrame: 0,

    register(family) {
      families.set(family.id, family);
      return stage;
    },
    family(id) { return families.get(id) || null; },
    familyIds() { return [...families.keys()]; },

    /** ONE-SHOT. Returns false if the id is unknown, so the lab can fail loudly on a typo. */
    emit(id, force) {
      const fam = families.get(id);
      if (!fam || !fam.emit) return false;
      fam.emit(stage, force, stage.time);
      return true;
    },

    /** SUSTAINED. Call every frame with fresh state, or once to latch the initial state. */
    hold(id, force) {
      const fam = families.get(id);
      if (!fam || !fam.tick) return false;
      let slot = sustained.get(id);
      if (!slot) {
        slot = { family: fam, force: createForceRecord(), started: stage.time };
        sustained.set(id, slot);
        if (fam.begin) fam.begin(stage, force, stage.time);
      }
      copyForce(force, slot.force);
      return true;
    },
    release(id) {
      const slot = sustained.get(id);
      if (!slot) return false;
      if (slot.family.end) slot.family.end(stage, slot.force, stage.time);
      sustained.delete(id);
      return true;
    },
    releaseAll() { for (const id of [...sustained.keys()]) stage.release(id); },
    isHeld(id) { return sustained.has(id); },

    /** Schedule a later beat of the same causal event. `delay` is seconds from now. */
    schedule(delay, force, fn) {
      for (let n = 0; n < SCHEDULE_CAP; n++) {
        const i = schedCursor;
        schedCursor = (schedCursor + 1) % SCHEDULE_CAP;
        if (schedUsed[i]) continue;
        schedUsed[i] = 1;
        schedT[i] = stage.time + delay;
        schedFn[i] = fn;
        copyForce(force, schedForce[i]);
        return true;
      }
      schedDropped++;
      return false;
    },

    /** Projected screen size of the event, 0..1-ish. Drives per-family LOD so an effect 800 WU away
     *  does not pay for detail nobody can resolve. Returns 1 when no camera is bound. */
    screenScale(force) {
      const cam = stage.camera;
      if (!cam) return 1;
      const dx = force.px - cam.position.x, dy = force.py - cam.position.y, dz = force.pz - cam.position.z;
      const dist = Math.hypot(dx, dy, dz) || 1;
      const fov = (cam.fov || 45) * Math.PI / 180;
      const projected = (force.radius / dist) / Math.tan(fov * 0.5);
      return Math.max(0.08, Math.min(1, projected * 6));
    },

    /** Count helper every family uses: base count scaled by quality and screen size, floored at 1
     *  so an effect never silently becomes nothing — a vanished effect is worse than a cheap one. */
    count(base, force, floor = 1) {
      const n = Math.round(base * stage.quality * (0.35 + 0.65 * stage.screenScale(force)));
      return Math.max(floor, n);
    },

    update(dt, camera) {
      stage.time += dt;
      stage.camera = camera;
      const now = stage.time;

      for (let i = 0; i < SCHEDULE_CAP; i++) {
        if (!schedUsed[i] || schedT[i] > now) continue;
        const fn = schedFn[i];
        schedUsed[i] = 0; schedFn[i] = null;
        if (fn) fn(stage, schedForce[i], now);
      }

      for (const slot of sustained.values()) slot.family.tick(stage, slot.force, dt, now);

      sparks.update(now);
      smoke.update(now);
      debris.update(now);
      fronts.update(now);
      ribbons.update(dt, camera.position);
      // Push the reduced-flash scale BEFORE update() so this frame's light values already carry it.
      // Without this the dial dimmed every particle substrate to nothing and left the four dynamic
      // PointLights — the brightest, most flash-sensitive element — at full peak.
      lights.setIntensityScale(stage.intensity);
      lights.update(dt);

      sparks.material.uniforms.uIntensity.value = stage.intensity;
      smoke.material.uniforms.uIntensity.value = stage.intensity;
      fronts.material.uniforms.uIntensity.value = stage.intensity;
      ribbons.material.uniforms.uIntensity.value = stage.intensity;
    },

    /** Live occupancy against the declared caps. This is the readout the lab prints and the number
     *  a promotion argument has to survive. */
    cost() {
      return {
        sparks: sparks.live, sparksCap: budgets.sparks,
        smoke: smoke.live, smokeCap: budgets.smoke,
        debris: debris.live, debrisCap: budgets.debris,
        fronts: fronts.live, frontsCap: budgets.fronts,
        ribbons: ribbons.live, ribbonsCap: budgets.ribbons,
        lights: lights.live, lightsCap: budgets.lights,
        scheduled: schedUsed.reduce((a, b) => a + b, 0),
        scheduleDropped: schedDropped,
        sustained: sustained.size,
        drawCalls: 5, // five substrates, one draw each, regardless of effect count
      };
    },

    clear() {
      stage.releaseAll();
      sparks.clear(); smoke.clear(); debris.clear(); fronts.clear(); ribbons.clear(); lights.clear();
      schedUsed.fill(0);
      for (let i = 0; i < SCHEDULE_CAP; i++) schedFn[i] = null;
      schedDropped = 0;
    },

    dispose() {
      stage.clear();
      sparks.dispose(); smoke.dispose(); debris.dispose(); fronts.dispose(); ribbons.dispose();
      scene.remove(root);
      // The light pool is added to the SCENE, not to `root` (a PointLight parented under a Group
      // still lights the scene, but keeping them off the disposable node is how the pool guarantees
      // a stable visible-light count for the lifetime of the stage). So removing `root` does NOT
      // remove them, and they must be removed explicitly here.
      //
      // This is load-bearing, not tidiness. Pool lights are permanently `visible = true` by design
      // (see lights.js — toggling `.visible` mutates the shader-program cache key). Orphaned
      // visible lights therefore keep COUNTING: dispose-then-recreate would take the scene from 4
      // visible PointLights to 8, which is exactly the whole-scene recompile the visible-forever
      // rule exists to prevent. Leaving them was strictly worse than the `.visible` toggling it
      // replaced.
      lights.clear();
      for (const l of lights.lights) scene.remove(l);
    },
  };

  return stage;
}

export function copyForce(src, dst) {
  dst.px = src.px; dst.py = src.py; dst.pz = src.pz; dst.radius = src.radius;
  dst.dx = src.dx; dst.dy = src.dy; dst.dz = src.dz; dst.hasDir = src.hasDir;
  dst.ax = src.ax; dst.ay = src.ay; dst.az = src.az; dst.hasAxis = src.hasAxis;
  dst.vx = src.vx; dst.vy = src.vy; dst.vz = src.vz;
  dst.impulse = src.impulse; dst.severity = src.severity; dst.seed = src.seed;
  dst.coreColor = src.coreColor; dst.sheathColor = src.sheathColor; dst.debrisColor = src.debrisColor;
  dst.nx = src.nx; dst.ny = src.ny; dst.nz = src.nz; dst.hasSurface = src.hasSurface;
  return dst;
}
