import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import {
  admitStructuralFxCue,
} from '../../presentation/cueArbitration.js';
import {
  deriveVfxAdmissionMetadata,
  isPlayerFacingVfxAdmission,
} from '../../presentation/vfxAdmissionPriority.js';
import {
  createProjectileBodies,
  ricochetSecondPath,
  stopProjectileBody,
} from './effectsCause.js';
import { resolveImpactPresentationProfile } from '../vfxProfiles.js';
import { recipeUsesSweptMuzzle, resolveWeaponRecipe } from '../weapons/index.js';

// The VFX instance remains the event, beam, and shared-pool owner. These methods render its
// existing weapon-fire and impact pictures without a second pool or lifecycle.
export function createWeaponImpactVfxMethods({
  IMPULSE_SHOVE_RENDER_CAP,
  KINETIC_SPALL_VARIANTS,
  PLAYER_FACING_CONTACT_PRIORITY_FLOOR,
  SPR_COMBUSTION,
  SPR_FLASH,
  SPR_PUFF,
  _impactOpts,
  hashVfxId,
  resolveRicochet,
}) {
  return {
  _onFire(p) {
    if (!this._scene) return;
    let origin = (p.from && typeof p.from.x === 'number')
      ? p.from
      : ((p.origin && typeof p.origin.x === 'number') ? p.origin : this._posFrom(p, p.ownerId));
    if (!origin && this.helpers.socketWorldPos && p.ownerId != null) {
      const sock = this.helpers.socketWorldPos(p.ownerId, 'SOCKET_Weapon_Front');
      if (sock) origin = sock;
    }
    if (!origin) return;
    let base = this._dirAngle(p.dir, p.ownerId);
    const owner = this._ent(p.ownerId);
    // Off-axis muzzle scatter while tumbling — guns whip with the thrash.
    const scatter = owner && owner.presentation && owner.presentation.tumble
      ? Math.max(0, owner.presentation.tumble.muzzleScatter || 0)
      : 0;
    if (scatter > 0.05) {
      base += (Math.random() - 0.5) * scatter * 1.1;
    }
    const profile = this._muzzleProfile(p, owner);
    if (p.continuous === true && p.to && this._combatBeams) {
      const startsBefore = this._combatBeams.startCount;
      if (!this._combatBeams.upsert(p, this._t, profile)) return;
      // A sustained beam gets one source ignition. The pool's actual inactive→active transition is
      // authoritative, so malformed or compatibility receipts cannot strobe merely by omitting
      // phase:'update'.
      if (this._combatBeams.startCount === startsBefore) return;
    }
    const burst = this._burst || 1;
    if (this._weaponPresenter && recipeUsesSweptMuzzle(resolveWeaponRecipe(p && p.weaponId, p))) {
      // Casings are owned by the presenter's quarks ejection for a recipe that declares them;
      // the legacy particle-pool loop here double-ejected every kinetic shot.
      this._weaponPresenter.handleFire(p, origin, base, profile);
      this._emitBallisticMuzzleExhaust(origin, base, profile, burst);
      return;
    }
    switch (profile.lane) {
      case 'beam': this._spawnMuzzleBeam(origin, base, profile, burst); break;
      case 'energy': this._spawnMuzzleEnergy(origin, base, profile, burst); break;
      case 'explosive': this._spawnMuzzleExplosive(origin, base, profile, burst); break;
      default: this._spawnMuzzleBallistic(origin, base, profile, burst); break;
    }
  },

  _onBeamStop(p) {
    if (this._combatBeams) this._combatBeams.stop(p, this._t);
    if (p && p.ownerId != null) {
      const prefix = `${String(p.ownerId)}:`;
      for (const key of this._beamDamageCueNext.keys()) {
        if (key.startsWith(prefix)) this._beamDamageCueNext.delete(key);
      }
    }
  },

  // Ballistic muzzle exhaust for the presenter-live path: a sharp bore-gas punch along
  // the shot axis plus dark propellant-carbon flecks. Energy and missile families return
  // immediately (their ignition is fully presenter-owned). No 3D casings: at top-down
  // distance the Mach tracer plus carbon read 100x better with zero mesh overhead.
  _emitBallisticMuzzleExhaust(origin, base, profile, burst) {
    const family = profile && profile.family;
    const variant = profile && profile.variant;
    const ballistic = family === 'kinetic' || family === 'rail' || variant === 'concussion-slug';
    if (!ballistic) return;
    const sm = (profile && profile.sizeMul) || 1;
    const rail = family === 'rail';
    const cosBase = Math.cos(base);
    const sinBase = Math.sin(base);
    const mx = origin.x + cosBase * 1.2;
    const mz = origin.z + sinBase * 1.2;
    // Sharp bore-gas slit along the shot axis (additive glow, not a stacked card).
    this._spawnSprite(SPR_FLASH, mx, 0.2, mz, 0.08, 0.9 * sm, 2.4 * sm, 0.8, 0,
      (profile && profile.coreColor) || '#ffffff', cosBase * 6, sinBase * 6, 3.0, base);
    // One breath of bore smoke, then dark carbon flecks (normal-blended smoke bucket:
    // the only substrate that can render dark matter over the void).
    this._spawnSprite(SPR_PUFF, mx, 0.1, mz, 0.42 * sm, 0.8 * sm, 2.6 * sm, 0.32, 0,
      '#2a2320', cosBase * 9, sinBase * 9, 2.2, base);
    const flecks = Math.max(1, Math.min(3, Math.round(2 * (burst || 1))));
    for (let k = 0; k < flecks; k++) {
      const a = base + (k - (flecks - 1) * 0.5) * 0.4 + (Math.random() - 0.5) * 0.2;
      const sp = (rail ? 16 : 11) + Math.random() * 10;
      this._spawnSprite(SPR_PUFF, mx, 0.12, mz, 0.3 + Math.random() * 0.2,
        0.45 * sm, 1.3 * sm, 0.5, 0, '#14100d',
        Math.cos(a) * sp, Math.sin(a) * sp, 1.6, a);
    }
  },

  _spawnMuzzleBallistic(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#ffcc88';
    const mx = origin.x + Math.cos(base) * 1.5, mz = origin.z + Math.sin(base) * 1.5;
    const rail = profile.family === 'rail';
    const siege = profile.variant === 'siege-lance';
    if (rail) {
      const length = (siege ? 8.5 : 5.4) * sm;
      this._spawnProjectileTrailStreak(mx, 0.28, mz, siege ? 0.10 : 0.075,
        (siege ? 0.38 : 0.27) * sm, length * 1.22, 0.96, '#f4fbff',
        Math.cos(base) * 24, Math.sin(base) * 24);
      for (const offset of [-0.24, 0.24]) {
        const a = base + offset;
        this._spawnProjectileTrailStreak(origin.x, 0.18, origin.z, 0.09,
          0.17 * sm, 2.8 * sm, 0.58, '#8ecfff', Math.cos(a) * 18, Math.sin(a) * 18);
      }
    } else {
      this._spawnProjectileTrailStreak(mx, 0.16, mz, 0.085 * sm, 0.22 * sm, 3.2 * sm,
        0.72, profile.coreColor || '#ffffff', Math.cos(base) * 20, Math.sin(base) * 20);
    }
    this._eventLight({ x: origin.x, z: origin.z }, 'muzzle', {
      severity: rail ? 'rail' : undefined,
      color: profile.coreColor,
      sizeMul: sm,
    });
    if (!rail) this._spawnMuzzleCasings(origin, base, profile, burst);
  },

  _spawnMuzzleCasings(origin, base, profile, burst) {
    this._c0.set('#fff0c8'); this._c1.set('#50463b');
    const side = base + Math.PI * 0.5;
    const casingCount = Math.max(1, Math.round(2 * burst * (profile.rapid ? 0.6 : 1)));
    for (let k = 0; k < casingCount; k++) {
      const a = side + (Math.random() - 0.5) * 0.34;
      const sp = 12 + Math.random() * 16;
      this._spawnParticle(origin.x, origin.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.18, 0.85, 0.08, this._c0, this._c1, 2.8, 0, 0);
    }
  },

  _spawnMuzzleEnergy(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#39d0ff';
    const mx = origin.x + Math.cos(base) * 1.6, mz = origin.z + Math.sin(base) * 1.6;
    const emp = profile.family === 'emp';
    const thermal = profile.variant === 'thermal-bolt';
    const pulse = profile.variant === 'pulse-bolt';
    if (emp) {
      for (const offset of [-0.42, 0, 0.42]) {
        const a = base + offset;
        this._spawnProjectileTrailStreak(mx, 0.24, mz, 0.12, 0.19 * sm,
          (2.2 + Math.abs(offset) * 2) * sm, 0.72, offset === 0 ? '#f4ffff' : '#668cff',
          Math.cos(a) * 22, Math.sin(a) * 22);
      }
    } else if (thermal) {
      this._spawnSprite(SPR_COMBUSTION, mx, 0.18, mz, 0.15, 0.55 * sm, 1.35 * sm,
        0.42, 0, '#ff6a24', Math.cos(base) * 4, Math.sin(base) * 4, 1.8, base);
      for (const offset of [-0.22, 0, 0.22]) {
        const a = base + offset;
        this._spawnProjectileTrailStreak(mx, 0.18, mz, 0.16, 0.25 * sm,
          (2.1 + (offset === 0 ? 1.4 : 0)) * sm, 0.62, col,
          Math.cos(a) * 16, Math.sin(a) * 16);
      }
    } else if (pulse) {
      // Directional cyan ignition on the barrel: SPR_FLASH with aspect+roll is a slit along the
      // shot axis, not the circular flash card. Do not reuse the orange combustion sprite.
      const pulseCore = profile.coreColor || '#34cfff';
      this._spawnSprite(SPR_FLASH, mx, 0.22, mz, 0.09,
        1.15 * sm, 2.8 * sm, 0.95, 0, pulseCore,
        Math.cos(base) * 8, Math.sin(base) * 8, 3.4, base);
      this._spawnProjectileTrailStreak(mx, 0.22, mz, 0.10 * sm,
        0.32 * sm, 5.2 * sm, 0.88, pulseCore,
        Math.cos(base) * 22, Math.sin(base) * 22);
    } else {
      this._spawnProjectileTrailStreak(mx, 0.20, mz, 0.095, 0.24 * sm, 4.8 * sm,
        0.78, profile.coreColor || '#e8f8ff', Math.cos(base) * 25, Math.sin(base) * 25);
    }
    this._eventLight({ x: origin.x, z: origin.z }, 'muzzle', {
      severity: emp ? 'emp' : (thermal ? 'thermal' : (pulse ? 'pulse' : undefined)),
      color: profile.lightColor || col,
      sizeMul: sm,
    });
  },

  _spawnMuzzleExplosive(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#ff8844';
    const mx = origin.x + Math.cos(base) * 1.4, mz = origin.z + Math.sin(base) * 1.4;
    const torpedo = profile.variant === 'torpedo';
    this._spawnProjectileTrailStreak(origin.x, 0.15, origin.z, torpedo ? 0.16 : 0.12,
      (torpedo ? 0.34 : 0.25) * sm, (torpedo ? 5.2 : 3.8) * sm, 0.76,
      profile.coreColor || '#fff0d0', -Math.cos(base) * 13, -Math.sin(base) * 13);
    this._spawnSprite(SPR_COMBUSTION, mx, 0.14, mz, torpedo ? 0.20 : 0.14,
      (torpedo ? 0.9 : 0.65) * sm, (torpedo ? 1.8 : 1.3) * sm, 0.58, 0,
      '#ff7a24', -Math.cos(base) * 3, -Math.sin(base) * 3, 2.2, base + Math.PI);
    this._spawnSprite(SPR_PUFF, origin.x - Math.cos(base) * 0.9, 0, origin.z - Math.sin(base) * 0.9,
      0.38 * sm, 1.15 * sm, 3.6 * sm, 0.24, 0.0, '#3a312d',
      -Math.cos(base) * 8, -Math.sin(base) * 8, 2.6, base + Math.PI);
    this._eventLight({ x: origin.x, z: origin.z }, 'muzzle', {
      severity: torpedo ? 'torpedo' : 'explosive',
      color: profile.lightColor || col,
      sizeMul: sm,
    });
  },

  _spawnMuzzleBeam(origin, base, profile, burst) {
    const sm = profile.sizeMul || 1;
    const col = profile.accentColor || '#66ccff';
    const mx = origin.x + Math.cos(base) * 2.0, mz = origin.z + Math.sin(base) * 2.0;
    const continuous = profile.family === 'beam';
    this._spawnProjectileTrailStreak(mx, 0.24, mz, 0.09 * sm,
      0.22 * sm, 5.4 * sm, 0.88, profile.coreColor || '#d8f0ff',
      Math.cos(base) * 18, Math.sin(base) * 18);
    this._eventLight({ x: mx, z: mz }, 'beam', {
      color: profile.lightColor || col,
      sizeMul: sm,
    });
  },

  // resolve a heading angle from a payload `dir` that may be a number (radians), a {x,z} vector, or
  // absent (fall back to the owner entity's rotation, else +X).
  _dirAngle(dir, ownerId) {
    if (typeof dir === 'number') return dir;
    if (dir && typeof dir.x === 'number' && typeof dir.z === 'number') return Math.atan2(dir.z, dir.x);
    const e = this._ent(ownerId);
    return e ? e.rot : 0;
  },

  _onProjectileHit(p) {
    if (p && p.projectileId != null) {
      if (!this._projectileBodies) this._projectileBodies = createProjectileBodies();
      stopProjectileBody(this._projectileBodies, p.projectileId);
    }
    if (!this._scene) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos) return;
    if (this.state && admitStructuralFxCue('projectile:hit', p, this.state)) {
      this._onArcadeBankShot(p, 'projectile:hit');
    }
    const tgt = this._ent(p.targetId);
    const fid = (tgt && tgt.factionId) || null;
    const hitShield = tgt && tgt.shield > 0;
    const profile = resolveImpactPresentationProfile(p && p.weaponId, p);
    const scale = profile.scale || 1;
    const recipe = resolveWeaponRecipe(p && p.weaponId, p);
    // Kinetic spall: a solid slug biting armor throws 3-4 tumbling metal shards down the impact
    // line. Cosmetic only — no gameplay entities, no colliders, half-second lives.
    if (!hitShield && KINETIC_SPALL_VARIANTS.has(recipe && recipe.variant)) {
      this._emitArmorSpall(pos, p, scale);
    }
    // Shield hits ripple and pass; only bare hull keeps the wound — and the wound names the weapon.
    if (!hitShield && tgt && tgt.pos) {
      const approach0 = p && (p.approach || p.dir) || null;
      let wax = approach0 && Number(approach0.x) || 0;
      let waz = approach0 && Number(approach0.z) || 0;
      const wl = Math.hypot(wax, waz) || 1;
      this._noteWeaponHitScar(pos, tgt, wax / wl, waz / wl, profile);
    }
    let presenterHit = null;
    if (this._weaponPresenter) {
      presenterHit = this._weaponPresenter.handleHit(p, hitShield);
    }
    const keepLegacyHit = recipe.variant === 'flak'
      || recipe.family === 'missile'
      || recipe.family === 'concussion'
      || recipe.family === 'mine'
      || recipe.family === 'beam'
      || recipe.family === 'rail'
      || profile.mode === 'penetration-streak'
      || profile.mode === 'concussive-slam'
      || profile.mode === 'radial-shove';
    if (presenterHit && !keepLegacyHit) {
      if (presenterHit.sparks) {
        const approach = p && (p.approach || p.dir) || null;
        let ax = approach && Number(approach.x) || 0;
        let az = approach && Number(approach.z) || 0;
        const approachLen = Math.hypot(ax, az) || 1;
        ax /= approachLen;
        az /= approachLen;
        let nx = p && p.normal && Number(p.normal.x);
        let nz = p && p.normal && Number(p.normal.z);
        if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-6) {
          nx = -ax || 1;
          nz = -az;
        }
        const normalAngle = Math.atan2(nz, nx);
        this._impactParticleCone(
          pos.x + nx * 0.42 * scale, pos.z + nz * 0.42 * scale,
          normalAngle, 0.72, 18, 42,
          Math.max(2, Math.round((profile.fragmentCount || 4) * (this._burst || 1) * 0.8)),
          (profile.life || 0.16) * 1.15,
          recipe.hull.sparkScale || 0.85,
          profile.coreColor, profile.accentColor, 2.6,
        );
      }
      this._emitRicochetIfGrazing(pos, p, recipe, scale, hitShield);
      return;
    }
    const approach = p && (p.approach || p.dir) || null;
    let ax = approach && Number(approach.x) || 0;
    let az = approach && Number(approach.z) || 0;
    const approachLen = Math.hypot(ax, az) || 1;
    ax /= approachLen;
    az /= approachLen;
    let nx = p && p.normal && Number(p.normal.x);
    let nz = p && p.normal && Number(p.normal.z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-6) {
      nx = -ax || 1;
      nz = -az;
    }
    const normalLength = Math.hypot(nx, nz) || 1;
    nx /= normalLength;
    nz /= normalLength;
    const normalAngle = Math.atan2(nz, nx);
    // Contact geometry lies exactly on the gameplay collider. Depth-tested streaks centered there
    // lost half (or all) of their area inside the target hull at the chase camera. Bias release
    // residue a fraction of a world unit along the outward normal while keeping the gouge attached.
    const surfaceX = pos.x + nx * 0.42 * scale;
    const surfaceZ = pos.z + nz * 0.42 * scale;
    const shieldColor = this._shieldColor(fid);
    const materialColor = hitShield ? shieldColor : profile.accentColor;
    const burst = this._burst || 1;
    this._emitRicochetIfGrazing(pos, p, recipe, scale, hitShield);

    switch (profile.mode) {
      case 'proximity-burst': {
        // Flak is a proximity-fuzed volume event, not a surface incidence gouge. The profile had
        // declared this mode since PQ-023, but without a renderer branch it fell through to the
        // autocannon default below. Two crossed, pooled streaks make the compact ignition a piece of
        // directional structure instead of the shared circular flash card. Keep the light below
        // autocannon so dense point-defense fire does not wash the scene; the primary identity is
        // still the full-volume fragment spread and its longer outward release.
        const flakTangentX = -nz;
        const flakTangentZ = nx;
        this._spawnProjectileTrailStreak(surfaceX, 0.28, surfaceZ,
          profile.life * 0.68, 0.28 * scale, 3.4 * scale, 0.82,
          profile.coreColor, nx * 1.2, nz * 1.2, nx, nz);
        this._spawnProjectileTrailStreak(
          surfaceX + flakTangentX * 0.16 * scale, 0.25,
          surfaceZ + flakTangentZ * 0.16 * scale,
          profile.life * 0.58, 0.14 * scale, 2.2 * scale, 0.58,
          profile.accentColor, flakTangentX * 2.4, flakTangentZ * 2.4,
          flakTangentX, flakTangentZ);
        const fragmentStreaks = Math.max(6, Math.round(6 * burst));
        for (let k = 0; k < fragmentStreaks; k++) {
          const a = normalAngle + (k / fragmentStreaks) * Math.PI * 2
            + (k % 2 ? 0.10 : -0.06);
          const speed = (18 + (k % 3) * 6) * scale;
          this._spawnProjectileTrailStreak(
            surfaceX + Math.cos(a) * 0.22 * scale, 0.20,
            surfaceZ + Math.sin(a) * 0.22 * scale,
            profile.life * (1.05 + (k % 3) * 0.12),
            (0.12 + (k % 2) * 0.035) * scale,
            (3.0 + (k % 3) * 0.72) * scale,
            k % 2 ? 0.66 : 0.78,
            k % 2 ? profile.accentColor : profile.coreColor,
            Math.cos(a) * speed, Math.sin(a) * speed,
            Math.cos(a), Math.sin(a));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, Math.PI * 2,
          16, 48, Math.max(12, Math.round(profile.fragmentCount * burst * 0.8)),
          profile.life * 1.35, 1.15 * scale,
          profile.coreColor, '#6b5545', 1.65);
        break;
      }
      case 'penetration-streak': {
        // Rail contact leaves a narrow axial cut fixed at the contact while a much smaller exit fan
        // departs along the surface normal. The cooler ionized scar survives the launch-white core,
        // so release frames retain a family-specific line rather than collapsing to a few points.
        // This branch must run on the presenter-live path (keepLegacyHit includes rail) so the
        // axial family is not replaced by a generic spark cone.
        const railReduced = resolveVfxAccessibilityProfile(
          this.state && this.state.settings,
        ).flashOpacityScale < 1;
        this._spawnProjectileTrailStreak(surfaceX, 0.3, surfaceZ,
          profile.life * (railReduced ? 1.2 : 1.75), (railReduced ? 0.22 : 0.32) * scale,
          (railReduced ? 8.5 : 13.5) * scale, railReduced ? 0.72 : 1.0, profile.coreColor,
          0, 0, ax, az);
        this._spawnProjectileTrailStreak(surfaceX - ax * 0.55 * scale, 0.2, surfaceZ - az * 0.55 * scale,
          profile.life * (railReduced ? 1.5 : 2.35), (railReduced ? 0.12 : 0.18) * scale,
          (railReduced ? 5.4 : 8.8) * scale, railReduced ? 0.48 : 0.64, materialColor,
          nx * (railReduced ? 1.1 : 1.8), nz * (railReduced ? 1.1 : 1.8), ax, az);
        if (!railReduced) {
          this._spawnProjectileTrailStreak(surfaceX, 0.2, surfaceZ,
            profile.life * 2.05, 0.28 * scale, 5.2 * scale, 0.58, '#6cbfe8',
            nx * 6, nz * 6, nx, nz);
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 0.46, 48, 86,
          Math.max(railReduced ? 2 : 3, Math.round(profile.fragmentCount * burst * (railReduced ? 0.35 : 0.65))),
          railReduced ? 0.16 : 0.24, 0.88,
          '#ffffff', '#70808a', 3.2);
        break;
      }
      case 'thermal-splash': {
        // Plasma becomes a lopsided attached thermal body, then peels into a few broad tongues.
        // Two overlapping sheared volumes keep the contact visible at the gameplay camera without
        // turning it into the missile family's three-lobed combustion burst or a generic flash.
        this._spawnSprite(SPR_COMBUSTION, surfaceX, 0.22, surfaceZ, profile.life * 1.08,
          1.35 * scale, 4.6 * scale, 0.92, 0, profile.accentColor,
          nx * 2.4, nz * 2.4, 1.5, normalAngle);
        const tx = -nz;
        const tz = nx;
        this._spawnSprite(SPR_COMBUSTION,
          surfaceX + tx * 0.55 * scale, 0.20, surfaceZ + tz * 0.55 * scale,
          profile.life * 0.9, 0.9 * scale, 3.2 * scale, 0.62, 0, '#ffb04c',
          nx * 1.8 + tx * 1.2, nz * 1.8 + tz * 1.2, 1.15, normalAngle - 0.45);
        this._spawnProjectileTrailStreak(surfaceX, 0.24, surfaceZ, 0.18 * scale,
          0.38 * scale, 4.2 * scale, 0.90, profile.coreColor, 0, 0, nx, nz);
        const tendrils = Math.max(3, Math.round(3 * burst));
        for (let k = 0; k < tendrils; k++) {
          const a = normalAngle + (k - (tendrils - 1) * 0.5) * 0.30 + (Math.random() - 0.5) * 0.12;
          this._spawnProjectileTrailStreak(surfaceX, 0.16, surfaceZ, 0.32 + Math.random() * 0.14,
            0.30 * scale, (2.7 + Math.random() * 2.0) * scale, 0.64, profile.accentColor,
            Math.cos(a) * (9 + Math.random() * 10), Math.sin(a) * (9 + Math.random() * 10));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 1.35, 10, 30,
          Math.round(profile.fragmentCount * burst * 0.55), profile.life, 1.45,
          profile.coreColor, '#4a1608', 1.35);
        // Normal-blended cooling plasma remains attached after the additive tongues peel away.
        this._spawnSprite(SPR_PUFF,
          surfaceX - ax * 0.45 * scale, 0.08, surfaceZ - az * 0.45 * scale,
          profile.life * 1.45, 1.0 * scale, 5.4 * scale, 0.34, 0,
          '#8a341e', nx * 1.8, nz * 1.8, 2.35, normalAngle + 0.22);
        break;
      }
      case 'combustion-burst': {
        // Missile contact is a clustered, asymmetric ignition volume followed by casing debris.
        // It never reuses the orange line starburst or an expanding ring.
        for (let k = -1; k <= 1; k++) {
          const ignitionAngle = normalAngle + k * 0.48;
          const offset = Math.abs(k) * 0.8 * scale;
          this._spawnSprite(SPR_COMBUSTION,
            surfaceX + Math.cos(ignitionAngle) * offset, 0.2,
            surfaceZ + Math.sin(ignitionAngle) * offset,
            (0.24 + Math.abs(k) * 0.08) * scale,
            (k === 0 ? 1.5 : 1.0) * scale, (k === 0 ? 4.4 : 3.0) * scale,
            k === 0 ? 0.94 : 0.68, 0,
            k === 0 ? profile.coreColor : profile.accentColor,
            Math.cos(ignitionAngle) * 4, Math.sin(ignitionAngle) * 4,
            k === 0 ? 1.6 : 2.2, ignitionAngle);
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 1.65, 24, 58,
          Math.round(profile.fragmentCount * burst * 0.7), 0.52, 1.55,
          '#f0d0a4', '#41362e', 1.8);
        this._spawnSprite(SPR_PUFF, surfaceX - ax * 1.3, 0, surfaceZ - az * 1.3,
          profile.life * 1.1, 2.0 * scale, 6.2 * scale, 0.42, 0, '#554038',
          -ax * 7, -az * 7, 2.4, Math.atan2(-az, -ax));
        const missileTangentX = -nz;
        const missileTangentZ = nx;
        this._spawnSprite(SPR_PUFF,
          surfaceX + missileTangentX * 0.75 * scale, 0.04,
          surfaceZ + missileTangentZ * 0.75 * scale,
          profile.life * 1.45, 1.45 * scale, 5.3 * scale, 0.34, 0, '#5f463c',
          -ax * 4 + missileTangentX * 2.2, -az * 4 + missileTangentZ * 2.2,
          2.75, Math.atan2(-az, -ax) - 0.32);
        for (let k = 0; k < 4; k++) {
          const fragmentAngle = normalAngle + (k - 1.5) * 0.36;
          this._spawnProjectileTrailStreak(surfaceX, 0.18, surfaceZ,
            0.40 + k * 0.04, 0.10 * scale, (1.9 + k * 0.34) * scale,
            0.62, k % 2 ? '#d09a62' : '#ffe1b2',
            Math.cos(fragmentAngle) * (15 + k * 3), Math.sin(fragmentAngle) * (15 + k * 3));
        }
        break;
      }
      case 'disruption-arcs': {
        // EMP contact forks along the surface in several short, high-frequency branches.
        for (const offset of [-0.78, -0.28, 0.34, 0.82]) {
          const a = normalAngle + offset;
          this._spawnProjectileTrailStreak(pos.x, 0.28, pos.z, profile.life * (0.72 + Math.abs(offset) * 0.25),
            0.10 * scale, (2.6 + Math.abs(offset) * 2.2) * scale, 0.78,
            offset < 0 ? profile.coreColor : materialColor, Math.cos(a) * 20, Math.sin(a) * 20);
        }
        this._impactParticleCone(pos.x, pos.z, normalAngle, 1.3, 18, 36, profile.fragmentCount * burst, 0.20, 1.0, '#ffffff', materialColor, 3.8);
        break;
      }
      case 'sustained-contact': {
        this._spawnProjectileTrailStreak(surfaceX, 0.26, surfaceZ,
          profile.life * 2.0, 0.34 * scale, 5.4 * scale, 0.96, materialColor, 0, 0, nx, nz);
        const beamTangentX = -nz;
        const beamTangentZ = nx;
        for (let k = 0; k < 3; k++) {
          const side = k - 1;
          const scintillationAngle = normalAngle + side * 0.48;
          this._spawnProjectileTrailStreak(
            surfaceX + beamTangentX * side * 0.18 * scale, 0.24,
            surfaceZ + beamTangentZ * side * 0.18 * scale,
            0.15 + k * 0.02, 0.10 * scale, (2.1 + Math.abs(side) * 0.65) * scale,
            0.70, k === 1 ? profile.coreColor : materialColor,
            Math.cos(scintillationAngle) * (8 + Math.abs(side) * 5),
            Math.sin(scintillationAngle) * (8 + Math.abs(side) * 5));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 0.52, 16, 28,
          Math.max(1, Math.round(profile.fragmentCount * burst * 0.5)), profile.life * 1.8,
          0.65, profile.coreColor, materialColor, 3.4);
        break;
      }
      case 'ion-sting': {
        // Pulse contact: a cyan slit along the inbound path plus a short surface sting.
        // Identity is the ion scar, not plasma's orange thermal splash and not a circular flash.
        this._spawnSprite(SPR_FLASH, surfaceX, 0.24, surfaceZ, 0.08,
          0.9 * scale, 2.2 * scale, 0.88, 0, profile.coreColor,
          0, 0, 3.0, Math.atan2(az, ax));
        this._spawnProjectileTrailStreak(surfaceX, 0.26, surfaceZ,
          profile.life * 1.35, 0.36 * scale, 5.8 * scale, 0.94, profile.coreColor, 0, 0, ax, az);
        this._spawnProjectileTrailStreak(surfaceX, 0.22, surfaceZ,
          profile.life * 1.05, 0.18 * scale, 3.4 * scale, 0.72, materialColor,
          nx * 4, nz * 4, nx, nz);
        const stingTangentX = -nz;
        const stingTangentZ = nx;
        this._spawnProjectileTrailStreak(
          surfaceX + stingTangentX * 0.12 * scale, 0.20,
          surfaceZ + stingTangentZ * 0.12 * scale,
          profile.life * 0.85, 0.12 * scale, 2.4 * scale, 0.58, profile.accentColor,
          stingTangentX * 8, stingTangentZ * 8, stingTangentX, stingTangentZ);
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 0.72, 18, 42,
          Math.max(2, Math.round(profile.fragmentCount * burst * 0.8)), profile.life * 1.15,
          0.85, profile.coreColor, '#1a4a78', 2.6);
        break;
      }
      case 'concussive-slam': {
        // impact_concussion port (VFX NEXT recipe, signed-direction branch — a slug knows its
        // approach; the axis-only branch lives in _onCollisionConsequence). The family's identity
        // is a compressed flash that COLLAPSES while the shock front expands beneath it — two
        // things growing at once reads as one soft blob. Ported onto the live pools: no vfxnext
        // code ships. Sizes carry the lab calibration (event radius 3 wu at the 110 wu band).
        const slamScale = 3 * scale;
        const reflectAngle = Math.atan2(-az, -ax); // spall opens back toward the shooter
        const slamReduced = resolveVfxAccessibilityProfile(
          this.state && this.state.settings,
        ).flashOpacityScale < 1;
        // 1 — compressed impact flash: size0 > size1 so it collapses as the front expands.
        this._spawnSprite(SPR_FLASH, surfaceX, 0.26, surfaceZ, 0.10,
          3.4 * slamScale, 1.1 * slamScale, 0.95, 0, '#ffffff', 0, 0, 1, normalAngle);
        // 2 — leading shock front oriented across the force path and bowed forward along it (the
        // recipe's DOME): opposed bars elongated on the contact normal, centres pushed a touch
        // along the approach. SPR_FLASH carries aspect+roll, so the front is structure, not a card.
        for (const side of [-1, 1]) {
          this._spawnSprite(SPR_FLASH,
            surfaceX + nx * side * 0.3 * slamScale + ax * 0.22 * slamScale, 0.24,
            surfaceZ + nz * side * 0.3 * slamScale + az * 0.22 * slamScale,
            slamReduced ? 0.24 : 0.34, 0.6 * slamScale, (slamReduced ? 2.0 : 2.8) * slamScale,
            slamReduced ? 0.55 : 0.72, 0,
            '#fff4e0', 0, 0, 3.2, normalAngle);
        }
        // 3 — trailing pressure wash: genuinely slower and dimmer than the lead front. Two fronts
        // at different speeds is what turns "a ring" into "a shock".
        if (!slamReduced) {
          for (const side of [-1, 1]) {
            this._spawnSprite(SPR_FLASH,
              surfaceX + nx * side * 0.24 * slamScale + ax * 0.13 * slamScale, 0.22,
              surfaceZ + nz * side * 0.24 * slamScale + az * 0.13 * slamScale,
              0.5, 1.0 * slamScale, 2.2 * slamScale, 0.38, 0,
              profile.accentColor, 0, 0, 3.0, normalAngle);
          }
        }
        // 4 — debris kick + wide spark cone thrown back along the approach (spall reads as
        // "hit from over there"), with short trails on the largest fragments only.
        this._impactParticleCone(surfaceX, surfaceZ, reflectAngle, slamReduced ? 0.55 : 0.85, 34, 97,
          Math.max(slamReduced ? 3 : 6, Math.round(profile.fragmentCount * burst * (slamReduced ? 0.35 : 0.8))),
          slamReduced ? 0.28 : 0.5, 1.5,
          '#fffaf0', profile.accentColor, 2.2);
        const debrisCount = slamReduced ? 2 : 4;
        for (let k = 0; k < debrisCount; k++) {
          const a = slamReduced
            ? reflectAngle + (k - (debrisCount - 1) * 0.5) * 0.38
            : reflectAngle + (k - 1.5) * 0.38 + (Math.random() - 0.5) * 0.2;
          this._spawnProjectileTrailStreak(surfaceX, 0.2, surfaceZ,
            slamReduced ? 0.32 : 0.5 + Math.random() * 0.3, 0.16 * scale,
            (slamReduced ? 1.6 : 2.2 + k * 0.5) * scale, slamReduced ? 0.5 : 0.7,
            k % 2 ? '#ffd9a8' : profile.accentColor,
            Math.cos(a) * (slamReduced ? 12 : 20 + k * 6) * scale,
            Math.sin(a) * (slamReduced ? 12 : 20 + k * 6) * scale,
            Math.cos(a), Math.sin(a));
        }
        // 5 — surface dust: slow, warm, and still saying "something hit here" after the light dies.
        if (!slamReduced) {
          for (let k = 0; k < 3; k++) {
            const a = reflectAngle + (Math.random() - 0.5) * 1.4;
            this._spawnSprite(SPR_PUFF,
              surfaceX + Math.cos(a) * 0.3 * slamScale, 0.06,
              surfaceZ + Math.sin(a) * 0.3 * slamScale,
              1.3 + Math.random() * 1.1, 0.5 * slamScale, 2.0 * slamScale, 0.4, 0,
              '#8a6a52', Math.cos(a) * 4, Math.sin(a) * 4, 2.0, a);
          }
        }
        break;
      }
      case 'radial-shove': {
        // Impulse-mine / charge family: shock sheets and ribbons along the real signed shove,
        // never a spherical ring. Projectile-hit uses the inbound approach; charge detonation
        // feeds the same helper with one record per victim.
        const shoveReduced = resolveVfxAccessibilityProfile(
          this.state && this.state.settings,
        ).flashOpacityScale < 1;
        this._emitDirectionalShoveSheets(
          { x: surfaceX, z: surfaceZ },
          [{ dx: ax, dz: az, mag: 1 }],
          profile,
          shoveReduced,
          scale,
        );
        break;
      }
      default: {
        // Kinetic/autocannon: an attached incidence gouge and tight cool-metal fragment fan.
        this._spawnProjectileTrailStreak(surfaceX, 0.2, surfaceZ,
          0.26, 0.30 * scale, 4.2 * scale, 0.96, profile.coreColor, 0, 0, ax, az);
        for (let k = 0; k < 4; k++) {
          const fragmentAngle = normalAngle + (k - 1.5) * 0.24;
          this._spawnProjectileTrailStreak(surfaceX, 0.16, surfaceZ,
            0.28 + k * 0.03, 0.10 * scale, (1.8 + k * 0.34) * scale,
            0.68, k % 2 ? '#9c9388' : '#ffe0ad',
            Math.cos(fragmentAngle) * (15 + k * 4), Math.sin(fragmentAngle) * (15 + k * 4));
        }
        this._impactParticleCone(surfaceX, surfaceZ, normalAngle, 1.05, 28, 74,
          Math.round(profile.fragmentCount * burst * 0.7), profile.life * 1.5, 1.05,
          '#fff2d4', '#5b5650', 2.8);
        break;
      }
    }

    // Shield material bends a pair of streaks along the surface; it never adds a full impact ring.
    if (hitShield) {
      const tx = -nz;
      const tz = nx;
      this._spawnProjectileTrailStreak(pos.x, 0.18, pos.z, 0.18, 0.21 * scale, 3.4 * scale,
        0.48, shieldColor, 0, 0, tx, tz);
      this._spawnProjectileTrailStreak(pos.x, 0.18, pos.z, 0.18, 0.19 * scale, 2.7 * scale,
        0.38, shieldColor, 0, 0, -tx, -tz);
    }
    // The contact's own receipt decides admission and light ownership. `projectile:hit` carries
    // ownerId/targetId, so a player shot or a shot into the player/current target derives the high
    // priority its player deserves; `combat:damage` for the same attacker/target/tick shares this
    // record and will not light a second contact (see _contactReceipt).
    const admission = deriveVfxAdmissionMetadata(p, this.state);
    const playerContact = isPlayerFacingVfxAdmission(admission);
    const contactPriority = playerContact
      ? Math.max(admission.admissionPriority, PLAYER_FACING_CONTACT_PRIORITY_FLOOR)
      : admission.admissionPriority;
    const contact = this._contactReceipt(p);
    this._emitContactLight(
      contact,
      { x: pos.x, z: pos.z },
      hitShield ? 'shield' : 'impact',
      {
        color: hitShield ? shieldColor : profile.accentColor,
        peak: profile.lightPeak * scale,
        distance: 110 * scale,
      },
      playerContact ? contactPriority : undefined,
    );
  },

  // One directional shock sheet + ribbon + cone along a REAL signed shove. Used by impulse-charge
  // detonation (one record per victim) and the radial-shove projectile family. Never invents a
  // global axis when several directions exist, and never emits SPR_RING.
  _emitDirectionalShoveSheets(origin, shoves, profile, reduced, sizeScale = 1) {
    if (!origin || !profile) return;
    const list = Array.isArray(shoves) ? shoves : [];
    const n = Math.min(list.length, IMPULSE_SHOVE_RENDER_CAP);
    const scale = Math.max(0.7, sizeScale);
    const life = (profile.life || 0.36) * (reduced ? 0.7 : 1);
    const fragments = Math.max(
      reduced ? 2 : 4,
      Math.round((profile.fragmentCount || 12) / Math.max(1, n) * (reduced ? 0.35 : 0.7)),
    );
    for (let i = 0; i < n; i++) {
      const row = list[i];
      let dx = Number(row && row.dx);
      let dz = Number(row && row.dz);
      const len = Math.hypot(dx, dz);
      if (!(len > 1e-6)) continue;
      dx /= len;
      dz /= len;
      const mag = Math.max(0, Number(row && row.mag) || 1);
      const angle = Math.atan2(dz, dx);
      const magReach = mag > 2 ? Math.min(mag * 0.01, 10) : 3.4;
      const reach = Math.min(16, (4.8 + magReach) * scale);
      this._spawnSprite(SPR_FLASH,
        origin.x + dx * 0.4 * scale, 0.22, origin.z + dz * 0.4 * scale,
        life, 0.55 * scale, (reduced ? 1.6 : 2.6) * scale, reduced ? 0.55 : 0.78, 0,
        profile.coreColor, dx * (reduced ? 6 : 14), dz * (reduced ? 6 : 14),
        3.15, angle);
      if (!reduced) {
        this._spawnSprite(SPR_FLASH,
          origin.x + dx * 0.18 * scale, 0.18, origin.z + dz * 0.18 * scale,
          life * 1.15, 0.9 * scale, 2.1 * scale, 0.4, 0,
          profile.accentColor, dx * 8, dz * 8, 2.8, angle);
      }
      this._spawnProjectileTrailStreak(
        origin.x, 0.2, origin.z,
        reduced ? 0.22 : life, (reduced ? 0.1 : 0.16) * scale,
        reduced ? Math.max(2.4, reach * 0.55) : reach,
        reduced ? 0.48 : 0.74, profile.accentColor,
        dx * (reduced ? 10 : 22), dz * (reduced ? 10 : 22), dx, dz);
      this._impactParticleCone(
        origin.x, origin.z, angle, reduced ? 0.45 : 0.85,
        reduced ? 12 : 18, reduced ? 28 : 48,
        fragments, reduced ? 0.18 : 0.32, 0.9 * scale,
        profile.coreColor, profile.accentColor, 2.2);
    }
  },

  // Kinetic armor spall — the signature of a solid slug meeting plate: 3-4 bright metal shards
  // shed along the round's travel line plus a couple of hot sparks. Tumbling reads as the slight
  // cross-axis scatter on each streak; nothing here collides, simulates, or lives past ~0.5 s.
  _emitArmorSpall(pos, p, scale = 1) {
    if (!pos || !this._scene) return;
    const approach = (p && (p.approach || p.dir)) || null;
    let ax = approach && Number(approach.x) || 0;
    let az = approach && Number(approach.z) || 0;
    const aLen = Math.hypot(ax, az);
    if (aLen < 1e-6) {
      const nx = p && p.normal && Number(p.normal.x);
      const nz = p && p.normal && Number(p.normal.z);
      if (Number.isFinite(nx) && Number.isFinite(nz) && Math.hypot(nx, nz) > 1e-6) {
        ax = -nx; az = -nz;
      } else { ax = 1; az = 0; }
    } else { ax /= aLen; az /= aLen; }
    const reduced = this._isReduced();
    const shards = reduced ? 2 : 4;
    for (let k = 0; k < shards; k++) {
      // Bias along the impact vector with a bounded tumble scatter — shards deflect, not disperse.
      const spread = (k - (shards - 1) / 2) * 0.30 + (Math.random() - 0.5) * 0.22;
      const ca = Math.cos(spread), sa = Math.sin(spread);
      const dx = ax * ca - az * sa;
      const dz = ax * sa + az * ca;
      const speed = (26 + Math.random() * 30) * scale;
      this._spawnProjectileTrailStreak(
        pos.x, 0.35, pos.z,
        reduced ? 0.28 : 0.42 + Math.random() * 0.1,
        0.07 * scale, 0.55 * scale, 0.85,
        k % 2 ? '#cfd6dd' : '#fff2d4',
        dx * speed, dz * speed, dx, dz,
      );
    }
    this._c0.set('#fff2d4'); this._c1.set('#8a6a3c');
    for (let k = 0; k < (reduced ? 1 : 2); k++) {
      const a = Math.atan2(az, ax) + (Math.random() - 0.5) * 1.4;
      const sp = 20 + Math.random() * 26;
      this._spawnParticle(pos.x, pos.z, Math.cos(a) * sp, Math.sin(a) * sp,
        0.14 + Math.random() * 0.12, 0.9, 0, this._c0, this._c1, 1.6, 0, 0);
    }
  },

  // Grazing kinetic skip: an acute-angle round glances off angled plate and carries on
  // as a directional spark burst plus a skipping tracer leader. Presentation-only — no sim
  // event, no new projectile, no ArcadeStructural bank burst (those stay combat-owned).
  // Explicit contact geometry only: a fallen-back normal always reads head-on anyway.
  _emitRicochetIfGrazing(pos, p, recipe, scale, hitShield) {
    if (hitShield) return false;
    const variant = recipe && recipe.variant;
    if (variant !== 'autocannon' && variant !== 'flak'
      && variant !== 'railgun' && variant !== 'siege-lance'
      && variant !== 'wedge' && variant !== 'driver-slug') return false;
    const approach = (p && (p.approach || p.dir)) || null;
    const normal = (p && p.normal) || null;
    if (!approach || !normal) return false;
    const ax = Number(approach.x);
    const az = Number(approach.z);
    const nx = Number(normal.x);
    const nz = Number(normal.z);
    if (!Number.isFinite(ax) || !Number.isFinite(az)
      || !Number.isFinite(nx) || !Number.isFinite(nz)) return false;
    if (!this._ricochetScratch) this._ricochetScratch = { rx: 0, rz: 0, graze: 0 };
    const skip = resolveRicochet(ax, az, nx, nz, this._ricochetScratch);
    if (!skip) return false;
    const reduced = this._isReduced();
    const burst = this._burst || 1;
    const nlen = Math.hypot(nx, nz) || 1;
    const sx = pos.x + (nx / nlen) * 0.42 * scale;
    const sz = pos.z + (nz / nlen) * 0.42 * scale;
    const reflectAngle = Math.atan2(skip.rz, skip.rx);
    const heavy = variant === 'railgun' || variant === 'siege-lance';
    const speedScale = (reduced ? 0.7 : 1) * (heavy ? 1.25 : 1);
    const proj = p && p.projectileId != null ? this._ent(p.projectileId) : null;
    const terminated = !proj || proj.alive === false;
    const second = ricochetSecondPath(skip.graze, terminated);
    this._impactParticleCone(sx, sz, reflectAngle, 0.42,
      55 * speedScale, 120 * speedScale,
      Math.max(4, Math.round(9 * burst * (reduced ? 0.5 : 1))),
      0.3, 0.9, '#ffffff', '#ff7a2a', 2.2);
    if (second && second.showOutgoing) {
      this._spawnProjectileTrailStreak(sx, 0.22, sz, 0.3, 0.14 * scale, 7.5 * scale, 0.85,
        '#fff6e8', skip.rx * 90 * speedScale, skip.rz * 90 * speedScale, skip.rx, skip.rz);
      if (!reduced) {
        this._spawnProjectileTrailStreak(sx, 0.18, sz, 0.24, 0.08 * scale, 4.5 * scale, 0.5,
          '#ffb36a', skip.rx * 70, skip.rz * 70, skip.rx, skip.rz);
      }
    }
    return true;
  },

  _impactParticleCone(x, z, base, spread, speedMin, speedMax, count, life, size, color0, color1, drag) {
    this._c0.set(color0);
    this._c1.set(color1);
    const n = Math.max(1, count | 0);
    for (let k = 0; k < n; k++) {
      const a = base + (Math.random() - 0.5) * spread;
      const speed = speedMin + Math.random() * Math.max(0, speedMax - speedMin);
      this._spawnParticle(x, z, Math.cos(a) * speed, Math.sin(a) * speed,
        life * (0.78 + Math.random() * 0.44), size * (0.72 + Math.random() * 0.48), 0,
        this._c0, this._c1, drag, 0, 0);
    }
  },

  // A weak-point hit is a material event, not another generic damage bloom. The exposed hull opens
  // along the actual contact normal: oriented shard geometry sprays out of the breach while three
  // short pooled streaks describe the torn seam. The event is presentation-only; combat already
  // applied the multiplier and owns every gameplay value.
  _onWeakPointHit(p) {
    if (!this._scene || !p) return;
    const pos = this._posFrom(p, p.targetId);
    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.z)) return;

    const target = this._ent(p.targetId);
    let nx = p.normal && Number(p.normal.x);
    let nz = p.normal && Number(p.normal.z);
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-6) {
      const center = target && target.pos;
      nx = center && Number.isFinite(center.x) ? pos.x - center.x : NaN;
      nz = center && Number.isFinite(center.z) ? pos.z - center.z : NaN;
    }
    if (!Number.isFinite(nx) || !Number.isFinite(nz) || Math.hypot(nx, nz) < 1e-6) {
      const rot = target && Number(target.rot);
      nx = Number.isFinite(rot) ? Math.cos(rot) : 1;
      nz = Number.isFinite(rot) ? Math.sin(rot) : 0;
    }
    const normalLength = Math.hypot(nx, nz) || 1;
    nx /= normalLength;
    nz /= normalLength;
    const tangentX = -nz;
    const tangentZ = nx;
    const normalAngle = Math.atan2(nz, nx);
    const mult = Number.isFinite(p.mult) ? Math.max(1, Math.min(2.4, p.mult)) : 1;
    const scale = 0.9 + (mult - 1) * 0.2;
    const settings = this.state && this.state.settings;
    const video = settings && settings.video;
    const a11y = resolveVfxAccessibilityProfile(settings);
    const reducedMotion = !!(video && video.motionReduce);
    const reducedFlash = a11y.flashOpacityScale < 1;
    const burst = this._burst || 1;

    this._emitJuiceCue('combat.weakPoint', p, 2);

    // IMPACTS: an exposed weak point is the clearest legitimate SIGNED normal in the game — the
    // breach faces outward by construction. Composed first so the recipe owns the timing; the
    // authored shard fan below remains as the weak-point's own signature on top of it.
    _impactOpts.vx = 0; _impactOpts.vy = 0; _impactOpts.vz = 0;
    _impactOpts.serial = hashVfxId('wp:' + String(p.targetId));
    _impactOpts.targetId = p.targetId ?? null;
    _impactOpts.eventClass = 'breach';
    _impactOpts.priority = 0.72;
    _impactOpts.hero = false;
    this._composeImpact(
      pos.x, 0.22, pos.z, nx, 0, nz, true,
      Math.max(0.3, Math.min(0.56, 0.3 + (mult - 1) * 0.18)),
      'hull', Math.max(1.4, ((target && target.radius) || 6) * 0.34), _impactOpts,
    );

    // Shards are instanced swept geometry, so the fan remains readable as metal even when the
    // camera catches the surface edge. Fixed offsets keep the receipt visually stable without
    // touching the deterministic simulation RNG.
    this._c0.set('#fff5dc');
    this._c1.set('#56636c');
    const shardCount = Math.max(8, Math.round(10 * burst));
    const half = (shardCount - 1) * 0.5 || 1;
    const fanHalfAngle = reducedMotion ? 0.28 : 0.48;
    for (let k = 0; k < shardCount; k++) {
      const fan = (k - half) / half;
      const angle = normalAngle + fan * fanHalfAngle;
      const speed = (24 + (k % 3) * 6) * scale * (reducedMotion ? 0.52 : 1);
      const life = (0.18 + (k % 3) * 0.035) * (reducedMotion ? 1.18 : 1);
      this._spawnParticle(
        pos.x + nx * 0.18 * scale,
        pos.z + nz * 0.18 * scale,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed,
        life,
        (reducedFlash ? 0.72 : 0.95) * scale,
        0.06,
        this._c0,
        this._c1,
        2.8,
        0.16,
        0,
        angle,
        reducedMotion ? 2.0 : 3.1,
      );
    }

    // A central outward tear, then two cooler cross-grain fragments. These are real pooled swept
    // streaks, not an expanding ring or a camera-facing glow card.
    const seamSpeed = reducedMotion ? 4.5 : 9;
    this._spawnProjectileTrailStreak(
      pos.x + nx * 0.24 * scale,
      0.24,
      pos.z + nz * 0.24 * scale,
      reducedMotion ? 0.24 : 0.18,
      0.15 * scale,
      (3.2 + (mult - 1) * 1.8) * scale,
      reducedFlash ? 0.54 : 0.9,
      '#d6e4eb',
      nx * seamSpeed,
      nz * seamSpeed,
      nx,
      nz,
    );
    this._spawnProjectileTrailStreak(
      pos.x + tangentX * 0.34 * scale,
      0.20,
      pos.z + tangentZ * 0.34 * scale,
      reducedMotion ? 0.21 : 0.16,
      0.085 * scale,
      2.35 * scale,
      reducedFlash ? 0.38 : 0.66,
      '#8298a5',
      tangentX * (reducedMotion ? 2.8 : 6.5),
      tangentZ * (reducedMotion ? 2.8 : 6.5),
      tangentX,
      tangentZ,
    );
    this._spawnProjectileTrailStreak(
      pos.x - tangentX * 0.28 * scale,
      0.18,
      pos.z - tangentZ * 0.28 * scale,
      reducedMotion ? 0.18 : 0.14,
      0.06 * scale,
      1.65 * scale,
      reducedFlash ? 0.28 : 0.48,
      '#52616b',
      -tangentX * (reducedMotion ? 1.8 : 4.2),
      -tangentZ * (reducedMotion ? 1.8 : 4.2),
      -tangentX,
      -tangentZ,
    );

    // The shared event-light pool supplies a brief hot reflection; accessibility scales or removes
    // it, while the directional geometry above remains the readable receipt.
    this._eventLight(pos, 'pickup', { sizeMul: scale });
  },

  };
}
