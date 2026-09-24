// Player reverse/brake: one honest jet path, no leftover needle trail.
//
// Impulse RCS can only pop. Holding brake is a continuous input, so retro uses the same swept
// ribbon sheets + forge mouth as the main drive — directional and open at the bow, gone when demand ends.
// The isotropic volumetric proxy is B12 (soft smoke); it is not this jet.

import { DriveForge } from '../ribbon/driveForge.js';
import { PlasmaRibbonPlume } from '../ribbon/plasmaRibbons.js';
import { resolveRcsFirings } from '../../rcsJets.js';
import { PLAYER_RETRO_VOLUME_RECIPE } from '../recipes/plasmaStreamRecipe.js';
import { getEngineProfileBase } from '../../vfxProfiles.js';
import { retroProfileFor, retroWorldScale } from '../retroProfiles.js';

export { PLAYER_RETRO_VOLUME_RECIPE };

export const RETRO_JET_CONSTRUCTION = 'swept-ribbon-sheets';

/** Production player reverse never stacks the legacy flash/particle needle trail. */
export function reverseNeedleEmissionAllowed(usesProductionThruster) {
  return usesProductionThruster !== true;
}

export function productionPlayerReverseNeedleSprites() {
  return 0;
}

// Retro spool. A held brake must bite quickly, and a released one must not snap the bow pair off
// on the first frame the demand crosses zero (B10). Rise is faster than fall, like the main drive.
export const RETRO_SPOOL_RISE_TAU = 0.14;
export const RETRO_SPOOL_FALL_TAU = 0.24;

/**
 * THE BITE.
 *
 * A spool alone describes a dial. What a brake actually does on the frame you ask for it is
 * overpressure: the bow jets punch — they tighten and sear well past their held value — and then
 * relax into the steady brake. Without that, standing on the brake and easing onto it are the
 * same motion at two speeds, and the hardest input in the game has no moment of commitment.
 *
 * Rate-triggered, not level-triggered: easing the demand up produces no bite at all. Decays on
 * its own clock in about a third of a second.
 *
 * It is spent on HEAT and COLLIMATION, never on length. The retro envelope's length-to-diameter
 * ratio is a shipped jet-likeness contract (see retroEnvelopeIsJetLike): a bow jet that stretched
 * on every brake tap would run out the top of it and start reading as a second main drive.
 */
export const RETRO_BITE_TRIGGER_RATE = 3.0;
export const RETRO_BITE_DECAY_PER_S = 3.4;

/**
 * Asymmetric one-pole spool for the retro pair, plus the bite transient. The spool lives on the
 * volume instance so the release keeps the last held pose while the demand decays to exactly zero
 * (no idle stub); the bite lives there for the same reason.
 */
export function integrateRetroSpool(volume, demand, dt) {
  const target = Math.max(0, Math.min(1.4, Number(demand) || 0));
  const current = Number.isFinite(volume.spool) ? volume.spool : 0;
  const tau = target > current ? RETRO_SPOOL_RISE_TAU : RETRO_SPOOL_FALL_TAU;
  const d = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  let next = current + (target - current) * (1 - Math.exp(-d / tau));
  if (next < 1e-4) next = 0;
  volume.spool = next;

  const bite = Number.isFinite(volume.bite) ? volume.bite : 0;
  let nextBite = bite;
  if (d > 0) {
    const slew = (next - current) / d;
    if (slew > RETRO_BITE_TRIGGER_RATE) {
      const kick = Math.min(1, (slew - RETRO_BITE_TRIGGER_RATE) / (RETRO_BITE_TRIGGER_RATE * 2));
      nextBite = Math.min(1, bite + kick * (1 - bite * 0.6));
    }
  }
  nextBite = Math.max(0, nextBite - d * RETRO_BITE_DECAY_PER_S);
  volume.bite = nextBite < 1e-4 ? 0 : nextBite;
  return next;
}

/**
 * @param {number} peak spooled retro demand
 * @param {object|null} a11y reduced motion / flash flags
 * @param {number} [bite] the one-shot overpressure transient from integrateRetroSpool
 */
export function retroEnvelopeForDemand(peak, a11y = null, bite = 0, variant = null, visualScale = 1) {
  const drive = Math.max(0, Math.min(1.4, Number(peak) || 0));
  const punch = Math.max(0, Math.min(1, Number(bite) || 0));
  const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
  const lengthWU = PLAYER_RETRO_VOLUME_RECIPE.lengthWU * (variant?.length || 1)
    * visualScale * (0.55 + drive * 0.5);
  const exitRadiusWU = PLAYER_RETRO_VOLUME_RECIPE.exitRadiusWU
    * (variant?.width || 1) * visualScale;
  return {
    drive,
    // Carried into the ribbon sheets' boost channel: the sheets collimate and sear rather than
    // inflate, which is the same thing the main drive's boost does and reads as pressure.
    boost: punch,
    bite: punch,
    animRate: a11y && a11y.reducedMotion ? 0.12 : 1,
    lengthWU,
    exitRadiusWU,
    tailRadiusWU: exitRadiusWU * PLAYER_RETRO_VOLUME_RECIPE.tailFlare,
    radiance: (PLAYER_RETRO_VOLUME_RECIPE.radiance || 1.12) * flashScale
      * (0.6 + drive * 0.55) * (1 + punch * 0.5 * flashScale),
    spread: PLAYER_RETRO_VOLUME_RECIPE.spread * (variant?.width || 1)
      * visualScale * (1 - punch * 0.18),
    opacity: PLAYER_RETRO_VOLUME_RECIPE.opacity,
    construction: RETRO_JET_CONSTRUCTION,
  };
}

/** Reject both source bulbs and hairline needles: visible throat, length 2.5–6 throat diameters. */
export function retroEnvelopeIsJetLike(envelope) {
  if (!envelope) return false;
  const length = Number(envelope.lengthWU) || 0;
  const diameter = (Number(envelope.exitRadiusWU) || 0) * 2;
  if (!(length > 0) || !(diameter > 0)) return false;
  return length / diameter >= 2.2 && length / diameter <= 6.0 && envelope.exitRadiusWU >= 0.8;
}

export function selectRetroJets(firings) {
  const out = [];
  if (!firings) return out;
  for (let i = 0; i < firings.length; i++) {
    const jet = firings[i];
    if (jet.role !== 'reverse-left' && jet.role !== 'reverse-right') continue;
    if (!(jet.intensity > 0.001)) continue;
    out.push(jet);
  }
  return out;
}

/** Drive the live jets from already-selected bow sockets. Used by vfx._updateRetroVolume. */
export function applyPlayerRetroVolume(volume, sockets, peak, dt, a11y, paramsOut) {
  if (!volume) {
    return {
      live: 0,
      needles: productionPlayerReverseNeedleSprites(),
      envelope: null,
      construction: RETRO_JET_CONSTRUCTION,
    };
  }
  // Spool first: a zero demand releases from the current spool instead of cutting the pair off.
  const spool = integrateRetroSpool(volume, peak, dt);
  if (!sockets || !sockets.length || spool <= 0) {
    if (typeof volume.reset === 'function') volume.reset();
    return {
      live: 0,
      needles: productionPlayerReverseNeedleSprites(),
      envelope: null,
      construction: RETRO_JET_CONSTRUCTION,
    };
  }
  const envelope = retroEnvelopeForDemand(spool, a11y, volume.bite, volume.variant, volume.visualScale);
  if (paramsOut) {
    paramsOut.drive = envelope.drive;
    paramsOut.animRate = envelope.animRate;
    paramsOut.lengthWU = envelope.lengthWU;
    paramsOut.exitRadiusWU = envelope.exitRadiusWU;
    paramsOut.tailRadiusWU = envelope.tailRadiusWU;
    paramsOut.radiance = envelope.radiance;
    paramsOut.spread = envelope.spread;
    paramsOut.opacity = envelope.opacity;
    paramsOut.boost = envelope.boost;
    paramsOut.turbulence = 0;
  }
  const params = paramsOut || envelope;
  const result = typeof volume.update === 'function'
    ? volume.update(dt, sockets, params)
    : { live: sockets.length };
  return {
    live: result && Number.isFinite(result.live) ? result.live : sockets.length,
    needles: productionPlayerReverseNeedleSprites(),
    envelope,
    construction: (result && result.construction) || RETRO_JET_CONSTRUCTION,
  };
}

/**
 * Shipped retro update: light the bow pair from reverse demand and drive the jets.
 * Production player needle count is always zero.
 */
export function updatePlayerRetroVolume(volume, opts = {}) {
  const dt = Number.isFinite(opts.dt) ? opts.dt : 1 / 60;
  const a11y = opts.a11y || null;
  let firings = opts.firings || null;
  if (!firings && opts.actuators && opts.pose) {
    firings = resolveRcsFirings(opts.actuators, opts.pose, opts.scale, opts.out);
  }
  const jets = selectRetroJets(firings);
  if (!volume) {
    return {
      live: 0,
      needles: productionPlayerReverseNeedleSprites(),
      envelope: null,
      roles: [],
      construction: RETRO_JET_CONSTRUCTION,
    };
  }
  if (!jets.length) {
    if (typeof volume.reset === 'function') volume.reset();
    return {
      live: 0,
      needles: productionPlayerReverseNeedleSprites(),
      envelope: null,
      roles: [],
      construction: RETRO_JET_CONSTRUCTION,
    };
  }
  let peak = 0;
  const sockets = opts.sockets ? opts.sockets : [];
  for (let i = 0; i < jets.length; i++) {
    if (jets[i].intensity > peak) peak = jets[i].intensity;
    if (!opts.sockets) {
      sockets.push({
        x: jets[i].x,
        y: 0,
        z: jets[i].z,
        ax: -jets[i].dirX,
        ay: 0,
        az: -jets[i].dirZ,
      });
    }
  }
  if (Number.isFinite(opts.peak)) peak = Math.max(peak, opts.peak);
  const applied = applyPlayerRetroVolume(volume, sockets, peak, dt, a11y, opts.params);
  return {
    live: applied.live,
    needles: applied.needles,
    envelope: applied.envelope,
    roles: jets.map((jet) => jet.role),
    construction: applied.construction,
  };
}

/**
 * Live retro owner. Same swept-sheet + forge construction as the main drive; bounded directional envelope;
 * no history filament. update() matches the volumetric pose contract so vfx stays one call site.
 */
export class PlayerRetroJets {
  constructor(THREE_NS, opts = {}) {
    this.THREE = THREE_NS;
    this.name = opts.name || 'sf-retro-jets';
    this.recipe = opts.recipe || PLAYER_RETRO_VOLUME_RECIPE;
    this.maxNozzles = 2;
    this.group = null;
    this._plumes = [];
    this._forges = [];
    this._nozzles = [
      { x: 0, y: 0, z: 0, aftX: 1, aftY: 0, aftZ: 0 },
      { x: 0, y: 0, z: 0, aftX: 1, aftY: 0, aftZ: 0 },
    ];
    this._shape = {
      drive: 0,
      boost: 0,
      dash: 0,
      jetLength: this.recipe.lengthWU,
      throatRadius: this.recipe.exitRadiusWU,
      spread: this.recipe.spread,
      radiance: this.recipe.radiance,
      opacity: this.recipe.opacity,
      spool: 0,
    };
    this._camObj = null;
    this._liveCount = 0;
    this.profileId = null;
    this.variant = retroProfileFor(null);
    this.visualScale = 1;
    // Asymmetric spool state owned here so the release can decay across frames (B10).
    this.spool = 0;
    // One-shot overpressure on brake engagement (see integrateRetroSpool).
    this.bite = 0;
    this._disposed = false;
  }

  attach(scene) {
    if (this._disposed || !scene || this.group) return this.group;
    const T = this.THREE;
    const recipe = this.recipe;
    this.group = new T.Group();
    this.group.name = `${this.name}-root`;
    this.group.visible = false;

    const ribbonOpts = {
      ribbons: recipe.ribbons || 8,
      stations: recipe.stations || 40,
      across: recipe.across || 5,
      jetLength: recipe.lengthWU,
      coreColor: recipe.coreColor,
      midColor: recipe.midColor,
      edgeColor: recipe.edgeColor,
    };

    for (let i = 0; i < this.maxNozzles; i++) {
      const plume = new PlasmaRibbonPlume(T, ribbonOpts);
      plume.mesh.name = `${this.name}-plume-${i}`;
      const near = recipe.exitRadiusWU * 0.62;
      const far = recipe.exitRadiusWU * recipe.tailFlare;
      plume.material.uniforms.uWidthNear.value = near;
      plume.material.uniforms.uWidthFar.value = far;
      plume.attach(this.group);
      this._plumes.push(plume);

      const forge = new DriveForge(T, {
        lengthWU: 1.35, mouthScale: 0.82, aftScale: 1.06,
        opacity: 0.24, radiance: 1.55, forceSinglePass: true,
      });
      forge.mesh.name = `${this.name}-forge-${i}`;
      forge.attach(this.group);
      this._forges.push(forge);
    }

    scene.add(this.group);
    return this.group;
  }

  setCamera(camera) {
    this._camObj = camera || null;
    for (let i = 0; i < this._plumes.length; i++) {
      this._plumes[i].setCamera(camera);
      this._forges[i].setCamera(camera);
    }
  }

  configure(engineProfileId, hullRadius) {
    this.visualScale = retroWorldScale(hullRadius);
    const id = engineProfileId || 'engine_ion_small';
    if (this.profileId === id) return;
    this.profileId = id;
    this.variant = retroProfileFor(id);
    const engine = getEngineProfileBase(id);
    for (let i = 0; i < this._plumes.length; i++) {
      const u = this._plumes[i].material.uniforms;
      u.uCoreColor.value.set(engine.coreColor || '#ffffff');
      u.uMidColor.value.set(engine.plumeCore || '#36c8ff');
      u.uEdgeColor.value.set(engine.plumeHalo || '#5a78ff');
      // A retro is a brake dart: collimated at the lip, then it frays into a few curling
      // streamers that shred and dissolve. The cruising drive's rolling sheets and broad far
      // widths are what read as a squid ball when squeezed into two short bow jets — but a column
      // with no breakup at all is a rigid tube, so the tail is allowed to live.
      u.uCoherence.value = this.variant.coherence;
      u.uRollAmp.value = 0.55;
      u.uSwirl.value = 1.15;
      u.uWobble.value = 0.9;
      u.uCurve.value = 0.9;
      u.uFlowRate.value = this.variant.flow;
      u.uAxialFreq.value = 3.5;
      const forge = this._forges[i].material.uniforms;
      forge.uCoreColor.value.set(engine.coreColor || '#ffffff');
      forge.uEdgeColor.value.set(engine.plumeCore || '#36c8ff');
    }
  }

  reset() {
    this._liveCount = 0;
    this.spool = 0;
    this.bite = 0;
    for (let i = 0; i < this._plumes.length; i++) {
      this._plumes[i].reset();
      this._forges[i].update(null, null, this._shape);
    }
    if (this.group) this.group.visible = false;
  }

  /**
   * @param {number} dt
   * @param {Array|null} sockets `ax/ay/az` opposite exhaust (same contract as the old volume)
   * @param {object} p envelope from retroEnvelopeForDemand
   */
  update(dt, sockets, p) {
    if (this._disposed || !this.group) return { live: 0, construction: RETRO_JET_CONSTRUCTION };
    const count = sockets && sockets.length
      ? Math.min(sockets.length, this.maxNozzles)
      : 0;
    if (count <= 0 || !p || !(p.drive > 0.001)) {
      this.reset();
      return { live: 0, construction: RETRO_JET_CONSTRUCTION };
    }

    const frameDt = Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0;
    const anim = p.animRate != null ? p.animRate : 1;
    const shape = this._shape;
    shape.drive = p.drive;
    shape.boost = p.boost || 0;
    shape.dash = 0;
    shape.jetLength = Math.max(0.75, p.lengthWU || this.recipe.lengthWU);
    shape.throatRadius = Math.max(0.4, p.exitRadiusWU || this.recipe.exitRadiusWU);
    shape.spread = p.spread != null ? p.spread : this.recipe.spread;
    let radiance = p.radiance != null ? p.radiance : this.recipe.radiance;
    let opacity = p.opacity != null ? p.opacity : this.recipe.opacity;
    // Additive sheets average toward black at the shipping chase camera. Same minification
    // compensation the main drive uses, so the bow pair stays a jet at 144 WU.
    const cam = this._camObj;
    if (cam && cam.position && sockets && sockets[0]) {
      const dx = cam.position.x - (sockets[0].x || 0);
      const dy = cam.position.y - (sockets[0].y || 0);
      const dz = cam.position.z - (sockets[0].z || 0);
      const camD = Math.hypot(dx, dy, dz);
      radiance *= Math.max(1, Math.min(2.8, camD / 70));
      opacity *= Math.max(1, Math.min(1.8, camD / 90));
    }
    shape.radiance = radiance;
    shape.opacity = opacity;
    shape.spool = p.drive;

    this.group.visible = true;
    this._liveCount = count;

    for (let i = 0; i < this.maxNozzles; i++) {
      const plume = this._plumes[i];
      const forge = this._forges[i];
      if (i >= count) {
        plume.reset();
        forge.update(null, null, shape);
        continue;
      }
      const sock = sockets[i];
      const u = plume.material.uniforms;
      u.uWidthNear.value = shape.throatRadius * 0.52;
      u.uWidthFar.value = shape.throatRadius * 1.05;
      u.uEmbed.value = shape.throatRadius * 0.55;
      if (sock.retroIris && sock.retroIris.material) {
        sock.retroIris.material.emissiveIntensity = sock.retroIris.idle
          + shape.drive * (sock.retroIris.lit - sock.retroIris.idle);
      }
      let ax = Number.isFinite(sock.ax) ? sock.ax : -1;
      let ay = Number.isFinite(sock.ay) ? sock.ay : 0;
      let az = Number.isFinite(sock.az) ? sock.az : 0;
      const len = Math.hypot(ax, ay, az) || 1;
      ax /= len; ay /= len; az /= len;
      const nz = this._nozzles[i];
      nz.x = sock.x || 0;
      nz.y = sock.y || 0;
      nz.z = sock.z || 0;
      // Socket `a` points opposite exhaust; ribbon aft is the direction exhaust leaves.
      nz.aftX = -ax;
      nz.aftY = -ay;
      nz.aftZ = -az;
      plume.update(frameDt * anim, nz, shape);
      forge.update(nz, null, shape);
    }

    return {
      live: count,
      construction: RETRO_JET_CONSTRUCTION,
      lengthWU: shape.jetLength,
      exitRadiusWU: shape.throatRadius,
    };
  }

  inspect() {
    const plumes = [];
    for (let i = 0; i < this._plumes.length; i++) {
      plumes.push(this._plumes[i].inspect());
    }
    return {
      construction: RETRO_JET_CONSTRUCTION,
      family: 'player-drive-ribbons',
      live: this._liveCount,
      needles: 0,
      plumes,
    };
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this.reset();
    for (let i = 0; i < this._plumes.length; i++) {
      this._plumes[i].dispose();
      this._forges[i].dispose();
    }
    this._plumes.length = 0;
    this._forges.length = 0;
    if (this.group && this.group.parent) this.group.parent.remove(this.group);
    this.group = null;
  }
}

export default PlayerRetroJets;
