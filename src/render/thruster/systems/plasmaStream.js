/**
 * Player thruster — swept ribbon sheets, a recorded world-space contrail, a drive forge, and a
 * nozzle throat. These are separate owners; see the VFX technique standard E5 (jet/history handoff).
 *
 *   ribbons  Short swept plasma sheets standing off each bell: the live instantaneous jet.
 *   contrail Immutable history of positions the ship actually occupied: the long bright wake.
 *   forge    The collar at the mouth of the recorded line, with its own band flash.
 *   throat   Small billboarded discs at each bell for the searing over-range hot spot.
 *   path     Live-head sampler kept for diagnostics and the cold-drive sleep gate. Its legacy
 *            hidden "snake" strip mesh was dead weight (force-hidden, no consumers) and is deleted.
 *
 * Flow noise advects in world units at exhaust speed, so structure is born at the throat and
 * streams out of it. Nothing here is a texture sliding along a static mesh.
 */
import * as THREE from 'three';
import { createPathSampler } from './pathSampler.js';
import { PlasmaRibbonPlume } from '../ribbon/plasmaRibbons.js';
import { ContrailTrail, resolveContrailSpin } from '../ribbon/contrailTrail.js';
import { DriveForge } from '../ribbon/driveForge.js';
import {
  EMIT_FLOOR,
  createDriveEnvelope,
  integrateDriveEnvelope,
  resolvePlumeShape,
} from '../ribbon/driveEnvelope.js';
import { PLAYER_PLASMA_STREAM_RECIPE } from '../recipes/plasmaStreamRecipe.js';

// Nozzle-interior glow: the hot throat INSIDE the bell (reference: engine cores are lit from
// within). One camera-facing disc per socket, depth-tested so the hull occludes it from the bow;
// additive, tight HDR core + bell-lip ring + soft halo. Not a trail billboard — the nozzle lamp.
const THROAT_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const THROAT_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uDrive;
  uniform float uBoost;
  uniform float uOpacity;
  uniform float uRadiance;

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    if (r > 1.0) discard;
    // Concentric structure: searing core, bell-lip ring, breathing halo. Faded rather than clipped
    // at the disc edge — a saturated interior against a hard r=1 cut renders as a white ball with
    // a drawn-on rim instead of a glow inside a bell.
    float core = exp(-r * r * 7.5);
    // Bell-lip ring kept faint. At the strength it used to have it drew a distinct annulus, which
    // with a saturated middle read as a hard grey-blue ball stuck on the back of the hull.
    float ring = exp(-pow(abs(r - 0.68) * 5.5, 2.0)) * 0.14;
    float halo = exp(-r * 2.6) * 0.3;
    float rim = 1.0 - smoothstep(0.72, 1.0, r);
    // Micro-flicker kept small (no strobe). Energy is normalized well below 1: the throat is a lamp
    // inside the bell, not the brightest object in the frame.
    float fl = 0.94 + 0.04 * sin(uTime * 37.0) + 0.03 * sin(uTime * 91.0 + 1.7);
    float energy = 0.22 + uDrive * 0.28 + uBoost * 0.18;
    float i = (core * 0.8 + ring + halo) * energy * fl * rim;
    vec3 col = mix(uColor, vec3(1.0, 0.99, 0.97), clamp(core * 1.35, 0.0, 1.0));
    col *= min(i * uRadiance, 1.3);
    float alpha = clamp(i * uOpacity, 0.0, 1.0);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(col, alpha);
  }
`;

function createThroatMesh(T, color) {
  const geo = new T.PlaneGeometry(2, 2);
  const mat = new T.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new T.Color(color[0], color[1], color[2]) },
      uDrive: { value: 0 },
      uBoost: { value: 0 },
      uOpacity: { value: 0.9 },
      uRadiance: { value: 2.4 },
    },
    vertexShader: THROAT_VERT,
    fragmentShader: THROAT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
    toneMapped: false,
  });
  const mesh = new T.Mesh(geo, mat);
  mesh.renderOrder = 11;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return mesh;
}

export class PlasmaStreamSystem {
  constructor(THREE_NS, recipe = PLAYER_PLASMA_STREAM_RECIPE) {
    this.THREE = THREE_NS || THREE;
    this.recipe = recipe || PLAYER_PLASMA_STREAM_RECIPE;
    const pathCfg = this.recipe.path || {};

    this.pathCap = Math.max(16, pathCfg.capacity || 240);
    this.nSeg = this.pathCap;

    // The path sampler feeds the live-head diagnostic and the cold-drive sleep gate. The history
    // filament strip it once rendered was force-hidden dead weight and is deleted, not benched.
    this.sampler = createPathSampler(this.pathCap);

    this._cam = { x: 0, y: 8, z: 12 };
    this._camObj = null;
    this.group = null;
    this._throats = [];
    this._time = 0;
    this._disposed = false;
    this._active = false;
    this._lastDrive = 0;
    this._lastBoost = 0;
    this._boostBlend = 0;
    this._ignition = 0;
    this._pointCount = 0;
    this._pathErase = 0;
    this._hasNozzle = false;
    this._prevNx = 0;
    this._prevNy = 0;
    this._prevNz = 0;
    this._owner = null;
    // Stable default pose and owner token for socketless callers; never allocate this in update().
    this._fallbackNozzle = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };

    // Two independent elements, because a jet and a flight history are not the same object.
    //
    //   _ribbons  the PLUME: nozzle-local, ~2 hull lengths, hot, gas flowing through it
    //   _trails   leftover thruster light: one ghost per bell, on the positions that bell occupied
    //
    // They were previously one thing, which forced the plume to be two seconds long — hundreds of
    // world units at cruise — so it read as a tail welded to the hull and dragged around.
    this._ribbons = new PlasmaRibbonPlume(this.THREE, {});
    this._trails = [];
    this._trailNozzles = [];
    // One forge per line: the mouth each line is drawn out of. Paired with the trail rather than
    // with the bell, because it has to follow the line's heading, not the hull's.
    this._forges = [];
    this._forgeAim = { x: 0, y: 0, z: 0 };
    for (let i = 0; i < 4; i++) {
      this._trails.push(new ContrailTrail(this.THREE, {}));
      this._trailNozzles.push({ x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 });
      this._forges.push(new DriveForge(this.THREE, {}));
    }
    this._contrail = this._trails[0];
    this._forge = this._forges[0];
    this._env = createDriveEnvelope();
    this._ribbonShape = {};
    this._ribbonNozzle = { x: 0, y: 0, z: 0, aftX: -1, aftZ: 0 };
    const rib = this.recipe.ribbon || {};
    const jet = this.recipe.jet || {};
    this._ribbonBase = {
      jetLength: rib.jetLength != null ? rib.jetLength : (jet.lengthWU != null ? jet.lengthWU : 17),
      throatRadius: rib.throatRadius != null ? rib.throatRadius : 1.32,
      spread: rib.spread != null ? rib.spread : 2.6,
      radiance: rib.radiance != null ? rib.radiance : 1.12,
      opacity: rib.opacity != null ? rib.opacity : 0.055,
    };
  }

  setCamera(camera) {
    if (!camera || !camera.position) return;
    this._cam.x = camera.position.x;
    this._cam.y = camera.position.y;
    this._cam.z = camera.position.z;
    this._camObj = camera;
    if (this._ribbons) this._ribbons.setCamera(camera);
    this._setTrailCameras(camera);
  }

  setCameraPosition(x, y, z) {
    this._cam.x = x;
    this._cam.y = y;
    this._cam.z = z;
    this._camObj = null;
    if (this._ribbons) this._ribbons.material.uniforms.uCamPos.value.set(x, y, z);
    if (this._trails) {
      for (let i = 0; i < this._trails.length; i++) {
        this._trails[i].material.uniforms.uCamPos.value.set(x, y, z);
      }
    }
  }

  _setTrailCameras(camera) {
    if (!this._trails) return;
    for (let i = 0; i < this._trails.length; i++) this._trails[i].setCamera(camera);
  }

  _trailLiveCount() {
    let n = 0;
    if (!this._trails) return 0;
    for (let i = 0; i < this._trails.length; i++) {
      const live = this._trails[i].liveSampleCount();
      if (live > n) n = live;
    }
    return n;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    this.group = new T.Group();
    this.group.name = 'sf-liquid-plasma-root';

    // Contrails first, then the plume over them, then the throat quads. Traversals that take the last
    // matching mesh therefore keep landing where they used to.
    for (let i = 0; i < this._trails.length; i++) this._trails[i].attach(this.group);
    for (let i = 0; i < this._forges.length; i++) this._forges[i].attach(this.group);
    this._ribbons.attach(this.group);
    if (this._camObj) {
      this._setTrailCameras(this._camObj);
      this._ribbons.setCamera(this._camObj);
    }

    // Nozzle throat glows next so group traversals that take the last strip mesh (unit tests,
    // look-dev gates) keep measuring the wake strips, not these quads.
    const throatCfg = this.recipe.throat || {};
    const throatColor = throatCfg.color || [0.5, 0.9, 1];
    for (let ti = 0; ti < 4; ti++) {
      const throat = createThroatMesh(T, throatColor);
      throat.name = `sf-plasma-throat-${ti}`;
      this.group.add(throat);
      this._throats.push(throat);
    }

    scene.add(this.group);
    return this.group;
  }

  reset() {
    this.sampler.clear();
    this._active = false;
    this._pointCount = 0;
    this._pathErase = 0;
    this._ignition = 0;
    this._hasNozzle = false;
    for (let i = 0; i < this._throats.length; i++) this._throats[i].visible = false;
    if (this._ribbons) this._ribbons.reset();
    if (this._trails) {
      for (let i = 0; i < this._trails.length; i++) this._trails[i].reset();
    }
    if (this._env) {
      this._env.spool = 0; this._env.boost = 0; this._env.dash = 0; this._env.dashAge = -1;
    }
    if (this.group) this.group.visible = false;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    if (this._ribbons) { this._ribbons.dispose(); this._ribbons = null; }
    if (this._trails) {
      for (let i = 0; i < this._trails.length; i++) this._trails[i].dispose();
      this._trails.length = 0;
    }
    if (this._forges) {
      for (let i = 0; i < this._forges.length; i++) this._forges[i].dispose();
      this._forges.length = 0;
    }
    this._contrail = null;
    this._forge = null;
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    for (let i = 0; i < this._throats.length; i++) {
      this._throats[i].geometry.dispose();
      this._throats[i].material.dispose();
    }
    this._throats.length = 0;
    this.group = null;
  }

  update(dt, sockets, driveInfo, a11y = null, owner = null) {
    if (this._disposed || !this.group) return { live: 0, pathPoints: 0, continuous: true };
    const frameDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const drive = Math.max(0, driveInfo && driveInfo.drive || 0);
    const throttle = Math.max(0, driveInfo && driveInfo.throttle || 0);
    const boost = Math.max(0, driveInfo && driveInfo.boost || 0);
    const speed = Math.max(0, driveInfo && driveInfo.speed || 0);
    // Everything the plume shows is driven off the smoothed envelope, including the throat glow. The
    // previous raw `Math.max` of live inputs is what made pressing forward a one-frame jump from
    // idle to full — the "clips from small to big instantly" this construction exists to fix.
    integrateDriveEnvelope(this._env, {
      throttle: Math.max(throttle, drive),
      speedNorm: Math.max(0, Math.min(1, driveInfo && driveInfo.speedDrive || 0)),
      boosting: boost > 0.5,
      dashFired: !!(driveInfo && driveInfo.dashFired),
      alive: true,
    }, frameDt);
    const activeDrive = this._env.spool;
    this._time += frameDt;
    this._lastDrive = activeDrive;

    // Boost easing: fast attack (~90 ms) reads as a kick, slower release (~300 ms) as spool-down.
    const boostTarget = Math.max(0, Math.min(1, boost));
    const prevBoost = this._boostBlend;
    const boostTau = boostTarget > this._boostBlend ? 0.09 : 0.3;
    this._boostBlend += (boostTarget - this._boostBlend)
      * (1 - Math.exp(-frameDt / Math.max(1e-3, boostTau)));
    const boostSm = this._boostBlend;
    this._lastBoost = boostSm;

    const jetCfg = this.recipe.jet || {};
    const ignCfg = jetCfg.ignition || {};
    // One-shot ignition transient: boost light-up is an EVENT (overpressure flare, shock train
    // snapping in) that then settles, not a linear ramp of the same shape.
    if (boostSm - prevBoost > 0.06) {
      this._ignition = Math.min(1, this._ignition + (boostSm - prevBoost) * 4.5);
    }
    this._ignition = Math.max(0, this._ignition
      - frameDt * (ignCfg.decayPerS != null ? ignCfg.decayPerS : 3.6));
    const ignition = this._ignition;

    // One authority for "is the drive actually firing". The recipe used to carry its own idleFloor of
    // 0.04, below the envelope's idle glow of 0.06, so a parked ship read as emitting forever.
    const emitting = activeDrive >= EMIT_FLOOR;

    const list = sockets && sockets.length ? sockets : null;
    // Production sockets (ContinuousPlume convention): ax points opposite exhaust;
    // jet extends along -ax. Default ax=+1 (ship +X) ⇒ exhaust -X.
    const primary = list ? list[0] : this._fallbackNozzle;
    let dirX = Number.isFinite(primary.ax) ? primary.ax : 1;
    let dirY = Number.isFinite(primary.ay) ? primary.ay : 0;
    let dirZ = Number.isFinite(primary.az) ? primary.az : 0;
    const dLen = Math.hypot(dirX, dirY, dirZ) || 1;
    dirX /= dLen; dirY /= dLen; dirZ /= dLen;
    const ex = -dirX;
    const ey = -dirY;
    const ez = -dirZ;
    const nx = primary.x || 0;
    const ny = primary.y || 0;
    const nz = primary.z || 0;

    const pathCfg = this.recipe.path || {};
    const spacing = pathCfg.sampleSpacingWU || 0.5;
    const disc = Math.min(
      pathCfg.discontinuityMaxWU || 640,
      Math.max(pathCfg.discontinuityFloorWU || 160, speed * 0.08 + 80),
    );

    // Owner change or a teleport-scale jump invalidates the pose we are extrapolating from.
    const ownerId = owner != null ? owner : primary;
    const jumped = this._hasNozzle
      && Math.hypot(nx - this._prevNx, nz - this._prevNz) > disc;
    if (this._owner !== ownerId || jumped) {
      this._owner = ownerId;
      this._hasNozzle = false;
    }

    // Nothing commanded, nothing left over: go fully cold. This tests the raw COMMAND, not the smoothed
    // envelope, because `reset()` zeroes the envelope — gating on the envelope meant a drive spooling up
    // from cold got reset every frame before it could cross the firing threshold, and never lit at all.
    const commanded = Math.max(throttle, drive, boost) > 0.001;
    if (!commanded && !emitting && !this.sampler.hasLive && this._trailLiveCount() < 2) {
      this.reset();
      return { live: 0, pathPoints: 0, continuous: true };
    }

    const period = 1 / Math.max(12, pathCfg.sampleHz || 40);
    if (emitting) {
      this.sampler.follow(
        nx, nz, Math.atan2(dirZ, dirX), dt, ownerId, spacing, disc, period,
      );
    }
    const nSock = list ? Math.min(list.length, 4) : 1;
    const rootMul = 1 + Math.min(0.4, (nSock - 1) * 0.1);
    const driveCfg = this.recipe.drive || {};
    const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
    const motionScroll = a11y && a11y.reducedMotion ? 0.12 : 1;

    // Boost is LENGTH and HEAT, not width. Width barely moves, so a boost reads as the plume
    // spearing out and going white rather than the whole cone inflating in place.
    const boostLenMul = 1 + ((driveCfg.boostLengthMul != null ? driveCfg.boostLengthMul : 1.85) - 1)
      * boostSm;
    const boostW = 1 + ((driveCfg.boostWidthMul != null ? driveCfg.boostWidthMul : 1.08) - 1)
      * boostSm;
    const boostR = 1 + ((driveCfg.boostRadianceMul != null ? driveCfg.boostRadianceMul : 1.5) - 1)
      * boostSm;

    const lengthFloor = jetCfg.driveLengthFloor != null ? jetCfg.driveLengthFloor : 0.45;
    const baseLen = jetCfg.lengthWU != null ? jetCfg.lengthWU : 14;
    const driveLen = lengthFloor + (1 - lengthFloor) * Math.min(1.15, activeDrive);
    const jetLen = Math.max(1.5, baseLen * driveLen * boostLenMul
      * (1 + ignition * (ignCfg.lengthOvershoot != null ? ignCfg.lengthOvershoot : 0.24)));
    const exitR = (jetCfg.exitRadiusWU != null ? jetCfg.exitRadiusWU : 1.32) * rootMul * boostW;
    const collimate = jetCfg.boostCollimate != null ? jetCfg.boostCollimate : 0.28;

    // Path-thread release: while thrusting the live head is pinned at the nozzle; after cutoff the
    // spent sampler thread is drained and released, which is also what lets the system sleep.
    const releaseCfg = this.recipe.thread || this.recipe.snake || {};
    const eraseS = releaseCfg.eraseS != null ? releaseCfg.eraseS : 1.5;
    if (emitting) {
      this._pathErase = 0;
    } else {
      this._pathErase += frameDt / Math.max(0.05, eraseS);
      if (this._pathErase >= 1.15) this.sampler.clear();
    }

    this._prevNx = nx;
    this._prevNy = ny;
    this._prevNz = nz;
    this._hasNozzle = true;

    const camD = Math.hypot(this._cam.x - nx, this._cam.y - ny, this._cam.z - nz);
    // Minification compensation: additive filaments average toward black at the far chase camera.
    const distRad = Math.max(1, Math.min(2.0, camD / 85));
    const distOpa = Math.max(1, Math.min(1.45, camD / 110));
    this.group.visible = true;

    // ---- Element builds ----------------------------------------------------------------------
    // The exhaust is swept ribbon sheets. Two earlier constructions were rejected here — camera-facing
    // sheets, which cannot self-occlude, and an isotropic raymarched volume, which can only ever
    // produce soft shoulders and so always read as smoke (VFX standard, bans B3 and B12).
    const nz2 = this._ribbonNozzle;
    nz2.x = nx; nz2.y = ny; nz2.z = nz;
    nz2.aftX = ex; nz2.aftZ = ez;
    resolvePlumeShape(this._env, this._ribbonBase, this._ribbonShape);
    // Reduced flash damps the hot-fold radiance of the ribbon sheets (and the recorded wake that
    // consumes the same shape). Silhouette, length, flow and opacity are untouched: the standard
    // forbids using alpha as a throttle channel.
    this._ribbonShape.radiance *= flashScale;

    // Tumble corkscrew only. Passing raw angVel here made every arrow-key turn shove the
    // exhaust 6 WU off the bell, always to screen-right from a +X rest heading.
    this._ribbonShape.spin = resolveContrailSpin(owner);

    // The jet, standing off the bell. Short by construction. Reduced motion slows the sheet's own
    // flow clock (the same 0.12 rate the retro jets use); throttle response and length stay live.
    this._ribbons.setCamera(this._camObj);
    this._ribbons.update(frameDt * motionScroll, nz2, this._ribbonShape);

    // Leftover thruster light, one ghost per live bell, on the flown line only. Never advects along
    // the exhaust, so it cannot put a vertex anywhere that bell has not been.
    const nTrail = list ? Math.min(list.length, this._trails.length) : 1;
    let trailLive = 0;
    for (let ti = 0; ti < this._trails.length; ti++) {
      const trail = this._trails[ti];
      const forge = this._forges[ti];
      if (ti >= nTrail) {
        trail.update(frameDt, null, this._ribbonShape);
        forge.update(null, null, this._ribbonShape, 1);
        continue;
      }
      const sock = list ? list[ti] : this._fallbackNozzle;
      let sx = Number.isFinite(sock.ax) ? sock.ax : 1;
      let sz = Number.isFinite(sock.az) ? sock.az : 0;
      const sl = Math.hypot(sx, sz) || 1;
      const nz = this._trailNozzles[ti];
      nz.x = sock.x || 0;
      nz.y = sock.y || 0;
      nz.z = sock.z || 0;
      nz.aftX = -sx / sl;
      nz.aftZ = -sz / sl;
      trail.setCamera(this._camObj);
      trail.update(frameDt, nz, this._ribbonShape);
      const live = trail.liveSampleCount();
      if (live > trailLive) trailLive = live;

      // The mouth rides the line's own heading and fires on the line's own pulse, so the flash at
      // the bell and the band leaving it are one event rather than two effects near each other.
      forge.setCamera(this._camObj);
      if (trail.headAftDirection(this._forgeAim)) {
        forge.update(nz, this._forgeAim, this._ribbonShape, trail.bandFlash(this._ribbonShape.drive));
      } else {
        // No line yet — aim the mouth down the bell so a standing start still lights it.
        this._forgeAim.x = nz.aftX; this._forgeAim.y = 0; this._forgeAim.z = nz.aftZ;
        forge.update(nz, this._forgeAim, this._ribbonShape, trail.bandFlash(this._ribbonShape.drive));
      }
    }
    this._active = emitting || trailLive >= 2;

    // Nozzle throat glows — one per live socket, camera-billboarded, depth-tested against hull.
    const throatCfg = this.recipe.throat || {};
    // A real throat does not grow when you open the taps — it gets hotter. Radius barely moves.
    const throatRadius = (throatCfg.radiusWU != null ? throatCfg.radiusWU : 1.45)
      * (0.82 + activeDrive * 0.14 + boostSm * 0.08 + ignition * 0.12);
    const throatOpacity = (throatCfg.opacity != null ? throatCfg.opacity : 0.9) * flashScale;
    const throatRadiance = (throatCfg.radiance != null ? throatCfg.radiance : 2.4)
      * (1 + boostSm * 0.35 + ignition * 0.55) * flashScale;
    for (let ti = 0; ti < this._throats.length; ti++) {
      const throat = this._throats[ti];
      const sock = emitting && list && ti < nSock ? list[ti] : null;
      if (!sock) { throat.visible = false; continue; }
      throat.visible = true;
      throat.position.set(sock.x || 0, sock.y || 0, sock.z || 0);
      throat.scale.setScalar(throatRadius);
      if (this._camObj && this._camObj.quaternion) {
        throat.quaternion.copy(this._camObj.quaternion);
      } else {
        throat.rotation.set(0, 0, 0);
      }
      const tu = throat.material.uniforms;
      tu.uTime.value = this._time;
      tu.uDrive.value = activeDrive;
      tu.uBoost.value = boostSm;
      tu.uOpacity.value = throatOpacity;
      tu.uRadiance.value = throatRadiance;
    }

    const ribbonInfo = this._ribbons.inspect();
    this._pointCount = trailLive;
    return {
      live: this._pointCount,
      continuous: true,
      medium: 'ribbon-sheets',
      pointCount: this._pointCount,
      construction: 'swept-ribbon-sheets',
      jetLengthWU: jetLen,
      ribbons: ribbonInfo.ribbons,
      ribbonStations: ribbonInfo.stations,
      plumeSeconds: ribbonInfo.plumeSeconds,
      spool: this._env.spool,
      dash: this._env.dash,
      ignition,
    };
  }

  inspect() {
    return {
      live: this._active ? this._pointCount : 0,
      continuous: true,
      medium: 'ribbon-sheets',
      capacity: this.nSeg,
      active: this._active,
      path: this.sampler.inspect(),
      recipeId: this.recipe && this.recipe.id,
      drive: this._lastDrive,
      boost: this._lastBoost,
      ignition: this._ignition,
      pointCount: this._pointCount,
      ribbon: this._ribbons ? this._ribbons.inspect() : null,
      contrail: this._contrail ? this._contrail.inspect() : null,
      forge: this._forge ? this._forge.inspect() : null,
      envelope: { spool: this._env.spool, boost: this._env.boost, dash: this._env.dash },
      construction: 'swept-ribbon-sheets',
    };
  }
}

export default PlasmaStreamSystem;
