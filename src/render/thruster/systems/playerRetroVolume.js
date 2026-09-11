// Player reverse/brake: one honest jet path, no leftover needle trail.
//
// Impulse RCS can only pop. Holding brake is a continuous input, so retro uses the same swept
// ribbon sheets + forge mouth as the main drive — short and fat at the bow, gone when demand ends.
// The isotropic volumetric proxy is B12 (soft smoke); it is not this jet.

import { DriveForge } from '../ribbon/driveForge.js';
import { PlasmaRibbonPlume } from '../ribbon/plasmaRibbons.js';
import { resolveRcsFirings } from '../../rcsJets.js';
import { PLAYER_RETRO_VOLUME_RECIPE } from '../recipes/plasmaStreamRecipe.js';

export { PLAYER_RETRO_VOLUME_RECIPE };

export const RETRO_JET_CONSTRUCTION = 'swept-ribbon-sheets';

/** Production player reverse never stacks the legacy flash/particle needle trail. */
export function reverseNeedleEmissionAllowed(usesProductionThruster) {
  return usesProductionThruster !== true;
}

export function productionPlayerReverseNeedleSprites() {
  return 0;
}

export function retroEnvelopeForDemand(peak, a11y = null) {
  const drive = Math.max(0, Number(peak) || 0);
  const flashScale = a11y && a11y.reducedFlash ? 0.72 : 1;
  const lengthWU = PLAYER_RETRO_VOLUME_RECIPE.lengthWU * (0.55 + drive * 0.5);
  const exitRadiusWU = PLAYER_RETRO_VOLUME_RECIPE.exitRadiusWU;
  return {
    drive,
    animRate: a11y && a11y.reducedMotion ? 0.12 : 1,
    lengthWU,
    exitRadiusWU,
    tailRadiusWU: exitRadiusWU * PLAYER_RETRO_VOLUME_RECIPE.tailFlare,
    radiance: (PLAYER_RETRO_VOLUME_RECIPE.radiance || 1.12) * flashScale * (0.6 + drive * 0.55),
    spread: PLAYER_RETRO_VOLUME_RECIPE.spread,
    opacity: PLAYER_RETRO_VOLUME_RECIPE.opacity,
    construction: RETRO_JET_CONSTRUCTION,
  };
}

/** Exit diameter vs lit length: a jet, not a hairline. */
export function retroEnvelopeIsJetLike(envelope) {
  if (!envelope) return false;
  const length = Number(envelope.lengthWU) || 0;
  const diameter = (Number(envelope.exitRadiusWU) || 0) * 2;
  if (!(length > 0) || !(diameter > 0)) return false;
  return diameter / length >= 0.5 && envelope.exitRadiusWU >= 1;
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
  if (!sockets || !sockets.length || !(peak > 0.001)) {
    if (typeof volume.reset === 'function') volume.reset();
    return {
      live: 0,
      needles: productionPlayerReverseNeedleSprites(),
      envelope: null,
      construction: RETRO_JET_CONSTRUCTION,
    };
  }
  const envelope = retroEnvelopeForDemand(peak, a11y);
  if (paramsOut) {
    paramsOut.drive = envelope.drive;
    paramsOut.animRate = envelope.animRate;
    paramsOut.lengthWU = envelope.lengthWU;
    paramsOut.exitRadiusWU = envelope.exitRadiusWU;
    paramsOut.tailRadiusWU = envelope.tailRadiusWU;
    paramsOut.radiance = envelope.radiance;
    paramsOut.spread = envelope.spread;
    paramsOut.opacity = envelope.opacity;
    paramsOut.boost = 0;
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
 * Live retro owner. Same swept-sheet + forge construction as the main drive; stubby envelope;
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
      ribbons: recipe.ribbons || 18,
      stations: recipe.stations || 32,
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

      const forge = new DriveForge(T, { lengthWU: Math.min(1.8, recipe.lengthWU * 0.45) });
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

  reset() {
    this._liveCount = 0;
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
    shape.radiance = p.radiance != null ? p.radiance : this.recipe.radiance;
    shape.opacity = p.opacity != null ? p.opacity : this.recipe.opacity;
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
