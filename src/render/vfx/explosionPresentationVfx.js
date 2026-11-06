import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { explosionRuptureFamily } from '../combat/explosionRupture.js';
import { explosionPattern01, explosionPatternSigned } from '../combat/phasedExplosions.js';

// destruction_light port palette, as plain frozen RGB records. The explosion-phase capture
// harnesses drive the emitters through a prototype facade that has no THREE.Color scratch
// (_c0/_c1), and _spawnParticle only reads .r/.g/.b — so these keep the ported beats
// allocation-free without touching shared scratch state.
const DESTRUCTION_LIGHT_JET_CORE = Object.freeze({ r: 0xdf / 255, g: 0xf2 / 255, b: 1.0 });
const DESTRUCTION_LIGHT_JET_TAIL = Object.freeze({ r: 0x2f / 255, g: 0x6c / 255, b: 1.0 });
const DESTRUCTION_LIGHT_CINDER_CORE = Object.freeze({ r: 1.0, g: 0xd9 / 255, b: 0xa0 / 255 });
const DESTRUCTION_LIGHT_CINDER_TAIL = Object.freeze({ r: 0x7a / 255, g: 0x1f / 255, b: 0x04 / 255 });

// VFX retains phased scheduling, shared particle/sprite/light pools, and camera/event ownership.
// These existing methods contain only the per-phase explosion picture and use that same instance.
export function createExplosionPresentationMethods({
  SPR_COMBUSTION,
  SPR_FLASH,
  SPR_PUFF,
  SPR_RING,
}) {
  return {
  // destruction_light port (VFX NEXT recipe): the beats that make a light hull's death
  // specifically a SHIP dying rather than a generic fireball — the drive over-runs for a moment
  // and dumps one directional jet back along the hull's own heading before it cuts, and a few
  // cinders outlive the flash. The recipe's "not a small heavy explosion" structure (no pressure
  // front, no secondaries, breakup as the body) is already the live small/ordinary phased path;
  // these are the ship-specific beats that path lacked. Deterministic off the entry serial like
  // every explosion-phase element — never Math.random in this emitter. Capital hulls keep their
  // own beat sheet untouched.
  _emitDestructionLightBeats(entry, scale, reduced) {
    if (!entry || entry.classId === 'capital') return;
    const x = entry.x;
    const z = entry.z;
    const r = entry.radius;
    const serial = entry.serial;
    const vx = Number.isFinite(entry.targetVelocityX) ? entry.targetVelocityX : 0;
    const vz = Number.isFinite(entry.targetVelocityZ) ? entry.targetVelocityZ : 0;
    const spd = Math.hypot(vx, vz);
    if (spd > 1) {
      // Engine flare-out: aimed by the inherited velocity, so it always points where the ship was
      // going. The jet leaves through the stern and is gone in a fifth of a second.
      const bx = -vx / spd;
      const bz = -vz / spd;
      const sternX = x + bx * r * 0.4;
      const sternZ = z + bz * r * 0.4;
      const jetAngle = Math.atan2(bz, bx);
      const jets = reduced ? 6 : 10;
      for (let k = 0; k < jets; k++) {
        const a = jetAngle + explosionPatternSigned(serial, 'ignition', k, 26) * 0.30;
        const s2 = (60 + explosionPattern01(serial, 'ignition', k, 27) * 90) * (reduced ? 0.6 : 1);
        this._spawnParticle(sternX, sternZ,
          vx * 0.35 + Math.cos(a) * s2, vz * 0.35 + Math.sin(a) * s2,
          0.20 + explosionPattern01(serial, 'ignition', k, 28) * 0.20,
          0.9 * scale, 0.2 * scale,
          DESTRUCTION_LIGHT_JET_CORE, DESTRUCTION_LIGHT_JET_TAIL, 2.2, 0, 0, a, 0.7);
      }
      this._spawnSprite(SPR_FLASH, sternX, 0.30, sternZ, 0.22,
        3.6 * scale, 0.4 * scale, 0.85, 0, '#eaf6ff', 0, 0, 1.6, jetAngle);
    }
    // Long cinders drifting on the inherited velocity: the part of a light death still on screen
    // a second later — what makes a firefight leave a trace.
    const cinders = reduced ? 2 : 4;
    const baseAngle = Math.atan2(entry.dirZ, entry.dirX);
    for (let k = 0; k < cinders; k++) {
      const a = baseAngle + explosionPatternSigned(serial, 'ignition', k, 29) * 1.6;
      const s2 = (30 + explosionPattern01(serial, 'ignition', k, 30) * 110) * (reduced ? 0.55 : 1);
      this._spawnParticle(x, z,
        vx * 0.8 + Math.cos(a) * s2, vz * 0.8 + Math.sin(a) * s2,
        1.1 + explosionPattern01(serial, 'ignition', k, 31) * 1.6,
        0.7 * scale, 0.1 * scale,
        DESTRUCTION_LIGHT_CINDER_CORE, DESTRUCTION_LIGHT_CINDER_TAIL, 0.6, 0, 0, a, 0.6);
    }
  },

  _emitExplosionPhase(phase, entry) {
    if (this._explosionRupture?.emitPhase(phase, entry, this.state?.settings)) {
      // Solid spall remains in the existing debris phase. Primary material is now a fracture
      // fan, armor throat, open reactor cavity or rolling fuel sheet; never stacked ball lobes.
      const accessibility = resolveVfxAccessibilityProfile(this.state?.settings);
      if (phase === 'ignition' || phase === 'contact-compression' || phase === 'rupture') {
        const family = explosionRuptureFamily(entry);
        if (accessibility.eventLightPeakScale > 0) {
          // _flashLight applies eventLightPeakScale internally — the raw preset peak goes in.
          this._eventLight({ x: entry.x, z: entry.z }, 'explosion', {
            severity: (family === 'reactor' ? 'reactor' : 'beat')
              + (phase === 'rupture' ? '-rupture' : ''),
            distance: 100 + entry.radius * 4,
          });
        }
        if (phase === 'rupture') this.bus.emit('camera:shake', {
          amount: (accessibility.id === 'full' ? 0.28 : 0.12) * (entry.classId === 'capital' ? 1.5 : 1),
          position: { x: entry.x, z: entry.z },
        });
      }
      return;
    }
    if (entry && entry.cause && entry.cause !== 'generic') {
      this._emitCausalExplosionPhase(phase, entry);
      return;
    }
    const x = entry.x;
    const z = entry.z;
    const r = entry.radius;
    // Radius already carries most of the visual scale. A large extra class multiplier made capital
    // events cover half the gameplay frame with one texture card, so class identity now comes from
    // phase count, spread, duration and debris structure instead of an unchecked size multiplier.
    const isSmall = entry.classId === 'small';
    const classScale = entry.classId === 'capital' ? 1.12 : (isSmall ? 0.90 : 1);
    const scale = classScale * Math.max(0.78, Math.min(1.65, Math.sqrt(r / 8)));
    const burst = this._burst || 1;
    const accessibility = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const reduced = accessibility.flashOpacityScale < 1;
    const dirAngle = Math.atan2(entry.dirZ, entry.dirX);
    const tangentX = -entry.dirZ;
    const tangentZ = entry.dirX;

    if (phase === 'ignition') {
      // Capital destruction starts in several separated machinery zones and propagates across the
      // source footprint. A single radius-scaled card became a fullscreen soft disc even though its
      // alpha mask was irregular. Ordinary events retain two offset ignition pockets; small events
      // use one compact pocket. Accessibility prunes a zone, but does not change the visual grammar.
      const zoneCount = entry.classId === 'capital' ? (reduced ? 3 : 4)
        : (entry.classId === 'ordinary' ? 2 : 1);
      const zoneSpacing = entry.classId === 'capital' ? 0.25 : 0.13;
      for (let k = 0; k < zoneCount; k++) {
        const centered = k - (zoneCount - 1) * 0.5;
        const along = centered * r * zoneSpacing
          + explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.025;
        const across = explosionPatternSigned(entry.serial, phase, k, 1)
          * r * (entry.classId === 'capital' ? 0.11 : 0.055);
        const px = x + entry.dirX * along + tangentX * across;
        const pz = z + entry.dirZ * along + tangentZ * across;
        const hot = k === Math.floor(zoneCount * 0.5);
        const life = entry.classId === 'capital'
          ? 0.38 + explosionPattern01(entry.serial, phase, k, 2) * 0.12
          : 0.16 + explosionPattern01(entry.serial, phase, k, 2) * 0.06;
        this._spawnSprite(SPR_COMBUSTION, px, 0.25 - k * 0.008, pz, life,
          r * (isSmall ? 0.095 : (hot ? 0.075 : 0.058)) * scale,
          r * (entry.classId === 'capital' ? 0.17 : (isSmall ? 0.30 : 0.22)) * scale,
          isSmall ? 0.82 : (hot ? 0.68 : 0.48), 0,
          hot ? '#fff3d5' : (k % 2 ? '#ff9a3a' : '#ff6a28'),
          entry.dirX * (1.0 + k * 0.35) + tangentX * centered * 0.8,
          entry.dirZ * (1.0 + k * 0.35) + tangentZ * centered * 0.8,
          1.18 + Math.abs(centered) * 0.14,
          dirAngle + explosionPatternSigned(entry.serial, phase, k, 3) * 0.34);
      }
      // Kills spray LIGHT (grammar §9.2). The combustion structure above is deliberately irregular
      // and deliberately not a radial flower — that discipline is about SILHOUETTE and it stays.
      // What was missing is energy: every card above sits between 0.32 and 0.68 opacity on a mid
      // orange, so nothing in a ship's death ever crossed 1.0 in linear HDR and nothing ever fed
      // the bloom bright pass. A destruction read as a cluster of dull orange blobs.
      //
      // These two additions are small, short and near-white. They are the hot core the phase always
      // implied, and because they are compact they add heat without adding coverage.
      const ignitionCore = r * (isSmall ? 0.10 : 0.06) * scale;
      this._spawnSprite(SPR_FLASH, x, 0.30, z,
        entry.classId === 'capital' ? 0.13 : (isSmall && !reduced ? 0.14 : 0.09),
        ignitionCore, ignitionCore * (isSmall ? (reduced ? 3.25 : 5.2) : 2.6),
        reduced ? 0.72 : 1.0, 0.0, '#ffffff',
        entry.dirX * 2, entry.dirZ * 2, isSmall ? 1.8 : 2.25, dirAngle);
      if (isSmall) {
        // A compact body's identity is a hot asymmetric snap and departing fragments. Full motion
        // gets a three-point biased envelope plus one offset combustion lobe so the event survives
        // the ordinary chase camera; reduced mode retains its accepted quieter two-fragment fallback.
        // Neither path borrows the ordinary shock ring.
        const fragmentCount = reduced ? 2 : 3;
        for (let k = 0; k < fragmentCount; k++) {
          const angleOffset = reduced
            ? (k === 0 ? -0.46 : 0.46)
            : (k === 0 ? -0.72 : (k === 1 ? 0.08 : 0.58));
          const a = dirAngle + angleOffset;
          this._spawnProjectileTrailStreak(
            x + Math.cos(a) * r * 0.04, 0.23,
            z + Math.sin(a) * r * 0.04,
            reduced ? 0.30 : 0.38 + k * 0.03,
            (reduced ? 0.09 : 0.11) * scale,
            (reduced ? 2.8 : 4.3 + k * 0.35) * scale,
            reduced ? 0.34 : (k === 1 ? 0.78 : 0.68),
            k === 0 ? '#fff0c0' : '#ff8a38',
            Math.cos(a) * (reduced ? 18 : 22 + k * 2) * scale,
            Math.sin(a) * (reduced ? 18 : 22 + k * 2) * scale,
            Math.cos(a), Math.sin(a));
        }
        if (!reduced) {
          const lobeAngle = dirAngle - 0.34;
          this._spawnSprite(SPR_COMBUSTION,
            x + entry.dirX * r * 0.05 + tangentX * r * 0.10, 0.24,
            z + entry.dirZ * r * 0.05 + tangentZ * r * 0.10,
            0.24, r * 0.055 * scale, r * 0.20 * scale,
            0.68, 0, '#ffb05a',
            Math.cos(lobeAngle) * 4.5, Math.sin(lobeAngle) * 4.5,
            1.34, lobeAngle);
        }
      } else {
        this._spawnSprite(SPR_RING, x, 0.28, z,
          entry.classId === 'capital' ? 0.30 : 0.20,
          r * 0.05 * scale, r * (entry.classId === 'capital' ? 0.55 : 0.40) * scale,
          reduced ? 0.30 : 0.52, 0.0, '#fff0c0', 0, 0);
      }
      // FB-074 — the capital kill is bound to the authored `explosionCapital` identity so the
      // audio's five-part beat has a matching light plan in the record.
      this._eventLight({ x, z }, 'explosion', {
        severity: entry.classId === 'capital' ? 'capital' : 'ignition',
        sizeMul: scale,
        distance: 120 + r * 5,
      });
      this._emitDestructionLightBeats(entry, scale, reduced);
      return;
    }

    if (phase === 'internal' || phase === 'internal-secondary') {
      const side = phase === 'internal' ? -1 : 1;
      const offset = r * (phase === 'internal' ? 0.28 : 0.48) * side;
      const internalColor = phase === 'internal' ? '#ff9a36' : '#e94b24';
      const internalRoll = dirAngle + side * (phase === 'internal' ? 0.42 : 0.62);
      const pocketCount = entry.classId === 'capital' ? (reduced ? 2 : 3) : 2;
      const baseX = x + tangentX * offset + entry.dirX * r * 0.13;
      const baseZ = z + tangentZ * offset + entry.dirZ * r * 0.13;
      for (let k = 0; k < pocketCount; k++) {
        const centered = k - (pocketCount - 1) * 0.5;
        const px = baseX + entry.dirX * centered * r * 0.15
          + tangentX * explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.045;
        const pz = baseZ + entry.dirZ * centered * r * 0.15
          + tangentZ * explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.045;
        const life = entry.classId === 'capital'
          ? 0.52 + explosionPattern01(entry.serial, phase, k, 1) * 0.14
          : 0.26 + explosionPattern01(entry.serial, phase, k, 1) * 0.08;
        this._spawnSprite(SPR_COMBUSTION, px, 0.20 - k * 0.006, pz, life,
          r * (k === 1 ? 0.082 : 0.062) * scale,
          r * (entry.classId === 'capital' ? 0.23 : 0.28) * scale,
          k === 1 ? 0.54 : 0.40, 0, k === 1 ? '#ffd08a' : internalColor,
          tangentX * side * (2.0 + k * 0.7) + entry.dirX * centered,
          tangentZ * side * (2.0 + k * 0.7) + entry.dirZ * centered,
          1.18 + k * 0.11,
          internalRoll + centered * 0.24
            + explosionPatternSigned(entry.serial, phase, k, 2) * 0.18);
      }
      this._impactParticleCone(baseX, baseZ, dirAngle + side * 0.8, 0.86, 8, 25,
        Math.round((reduced ? 3 : 5) * burst * scale), 0.38, 0.42 * scale,
        '#ffe0a0', '#6a1608', 1.5);
      return;
    }

    if (phase === 'breakup') {
      // Capital hulls fail along several structural seams before the main rupture. These short hot
      // cuts and displaced combustion pockets make the progression travel across the source scale
      // instead of jumping from a center flash directly to a radial starburst.
      const seamCount = reduced ? 3 : 5;
      for (let k = 0; k < seamCount; k++) {
        const centered = k - (seamCount - 1) * 0.5;
        const along = centered * r * 0.19;
        const across = explosionPatternSigned(entry.serial, phase, k, 0) * r * 0.19;
        const px = x + entry.dirX * along + tangentX * across;
        const pz = z + entry.dirZ * along + tangentZ * across;
        const seamAngle = dirAngle + centered * 0.13
          + explosionPatternSigned(entry.serial, phase, k, 1) * 0.22;
        this._spawnProjectileTrailStreak(px, 0.25, pz,
          0.42 + explosionPattern01(entry.serial, phase, k, 2) * 0.22,
          r * 0.012 * scale, r * (0.23 + explosionPattern01(entry.serial, phase, k, 3) * 0.15) * scale,
          k === Math.floor(seamCount * 0.5) ? 0.54 : 0.34,
          k % 2 ? '#ff6b2c' : '#ffd39a',
          Math.cos(seamAngle) * (4 + k), Math.sin(seamAngle) * (4 + k),
          Math.cos(seamAngle), Math.sin(seamAngle));
        if (k % 2 === 0) {
          this._spawnSprite(SPR_COMBUSTION, px, 0.20, pz,
            0.48 + explosionPattern01(entry.serial, phase, k, 4) * 0.16,
            r * 0.055 * scale, r * 0.19 * scale, 0.38, 0,
            k === 2 ? '#fff0be' : '#c84524',
            entry.dirX * 2 + tangentX * centered, entry.dirZ * 2 + tangentZ * centered,
            1.34, seamAngle + 0.34);
        }
      }
      return;
    }

    if (phase === 'rupture') {
      // Uneven overlapping combustion volumes form a biased tear, never a radial flower. Thin hot
      // tongues are intentionally limited to one or two forward-biased fragments; the later debris
      // phase owns the wider structural fan.
      const lobeBase = entry.classId === 'capital' ? 9 : (isSmall ? 4 : 6);
      const lobeCount = Math.max(3, Math.round(lobeBase * burst * (reduced ? 0.68 : 1)));
      for (let k = 0; k < lobeCount; k++) {
        const normalized = lobeCount > 1 ? k / (lobeCount - 1) - 0.5 : 0;
        const longitudinal = r * scale * (
          explosionPatternSigned(entry.serial, phase, k, 0)
          * (entry.classId === 'capital' ? 0.16 : 0.12)
          + normalized * 0.08);
        const lateral = r * scale * (normalized * (entry.classId === 'capital' ? 0.28 : 0.22)
          + explosionPatternSigned(entry.serial, phase, k, 1) * 0.05);
        const roll = dirAngle + normalized * 0.22
          + explosionPatternSigned(entry.serial, phase, k, 2) * 0.31;
        const heat = 1 - Math.min(1, Math.abs(normalized) * 2);
        const lobeColor = heat > 0.58 ? '#fff1c4' : (heat > 0.20 ? '#ff8a32' : '#d94720');
        this._spawnSprite(SPR_COMBUSTION,
          x + entry.dirX * longitudinal + tangentX * lateral, 0.22,
          z + entry.dirZ * longitudinal + tangentZ * lateral,
          (entry.classId === 'capital' ? 0.72 : 0.48)
            + explosionPattern01(entry.serial, phase, k, 3) * 0.22,
          r * scale * (0.12 + explosionPattern01(entry.serial, phase, k, 4) * 0.07),
          r * scale * (0.25 + explosionPattern01(entry.serial, phase, k, 5) * 0.15),
          heat > 0.58 ? 0.46 : 0.32, 0,
          lobeColor,
          entry.dirX * (3 + explosionPattern01(entry.serial, phase, k, 6) * 5) * scale
            + tangentX * normalized * 3,
          entry.dirZ * (3 + explosionPattern01(entry.serial, phase, k, 6) * 5) * scale
            + tangentZ * normalized * 3,
          1.08 + explosionPattern01(entry.serial, phase, k, 7) * 0.30, roll);
        const tongueCount = entry.classId === 'capital' ? 2 : 1;
        if (k < tongueCount) {
          const debrisAngle = dirAngle + (k ? 0.42 : -0.28)
            + explosionPatternSigned(entry.serial, phase, k, 8) * 0.12;
          this._spawnProjectileTrailStreak(
            x + Math.cos(debrisAngle) * r * 0.10, 0.24,
            z + Math.sin(debrisAngle) * r * 0.10,
            0.36 + explosionPattern01(entry.serial, phase, k, 9) * 0.16,
            r * 0.012 * scale,
            r * scale * (0.24 + explosionPattern01(entry.serial, phase, k, 10) * 0.14),
            reduced ? 0.20 : 0.34, k % 2 ? '#ff7a2c' : '#ffd08a',
            Math.cos(debrisAngle) * (10 + explosionPattern01(entry.serial, phase, k, 11) * 10) * scale,
            Math.sin(debrisAngle) * (10 + explosionPattern01(entry.serial, phase, k, 11) * 10) * scale);
        }
      }
      // A normal-blended, lopsided cooling sheath preserves the rupture silhouette when reduced
      // flash shortens additive combustion. It expands slowly, stays directional, and cannot read
      // as a clean ring because it uses the eroded smoke mask with an offset center and 2:1 aspect.
      this._spawnSprite(SPR_PUFF,
        x - entry.dirX * r * 0.08 + tangentX * r * 0.07, 0.12,
        z - entry.dirZ * r * 0.08 + tangentZ * r * 0.07,
        entry.classId === 'capital' ? 0.92 : 0.68,
        r * scale * 0.11, r * scale * (entry.classId === 'capital' ? 0.42 : 0.36),
        reduced ? 0.30 : 0.24, 0,
        reduced ? '#a65335' : '#7e3e2d',
        entry.dirX * 1.8 + tangentX * 0.7, entry.dirZ * 1.8 + tangentZ * 0.7,
        2.15, dirAngle + 0.31);
      this._impactParticleCone(x, z, dirAngle,
        entry.classId === 'capital' ? 1.55 : (entry.classId === 'small' ? 1.15 : 1.42),
        14, entry.classId === 'capital' ? 42 : 36,
        Math.round((entry.classId === 'capital' ? 10 : 6) * burst * scale * (reduced ? 0.62 : 1)),
        entry.classId === 'capital' ? 0.72 : 0.52, 0.36 * scale,
        '#ffe3a0', '#65301d', 1.35);
      // Rupture heat. Two compact white cores offset along the tear axis (never centred, so they
      // cannot rebuild the radial flower the phase is written to avoid). Brightness carries the
      // energy and the combustion cards carry the shape; neither job is done by making the orange
      // cards bigger.
      for (const side of [-1, 1]) {
        const coreAlong = r * scale * 0.09 * side;
        const coreAcross = r * scale * 0.05 * side;
        this._spawnSprite(SPR_FLASH,
          x + entry.dirX * coreAlong + tangentX * coreAcross, 0.30,
          z + entry.dirZ * coreAlong + tangentZ * coreAcross,
          entry.classId === 'capital' ? 0.20 : 0.13,
          r * scale * (isSmall ? 0.10 : 0.07), r * scale * (isSmall ? 0.30 : 0.19),
          reduced ? 0.62 : (side < 0 ? 1.0 : 0.78), 0.0, side < 0 ? '#ffffff' : '#fff3d0',
          entry.dirX * (5 + 3 * side) * scale, entry.dirZ * (5 + 3 * side) * scale,
          1.6 + 0.5 * side, dirAngle + side * 0.22);
      }
      if (!isSmall) {
        // The old expanding ring made every ordinary/capital rupture read as the same radial pulse.
        // A bounded fork of hot tear-axis shears now carries the pressure outward while keeping the
        // killing direction legible. Reduced mode retains one primary shear instead of changing
        // grammar or disabling the cue.
        const shearCount = reduced ? 1 : 2;
        for (let k = 0; k < shearCount; k++) {
          const side = k === 0 ? -1 : 1;
          const shearAngle = dirAngle + side * (entry.classId === 'capital' ? 0.48 : 0.36);
          const shearX = Math.cos(shearAngle);
          const shearZ = Math.sin(shearAngle);
          this._spawnProjectileTrailStreak(
            x + tangentX * side * r * 0.08, 0.26,
            z + tangentZ * side * r * 0.08,
            entry.classId === 'capital' ? 0.52 : 0.38,
            r * scale * 0.028,
            r * scale * (entry.classId === 'capital' ? 0.72 : 0.54),
            reduced ? 0.24 : (side < 0 ? 0.46 : 0.34),
            side < 0 ? '#ffd49a' : '#ff8a42',
            shearX * (entry.classId === 'capital' ? 14 : 10) * scale,
            shearZ * (entry.classId === 'capital' ? 14 : 10) * scale,
            shearX, shearZ);
        }
      }
      this._eventLight({ x, z }, 'explosion', {
        severity: entry.classId === 'capital' ? 'burst-capital' : 'burst',
        sizeMul: scale,
        distance: 180 + r * 7,
      });
      const shake = entry.classId === 'capital' ? 0.62 : (entry.classId === 'small' ? 0.16 : 0.34);
      // A ship blowing up is a WORLD event: send where it happened so the consumer can fall it off
      // with distance. Untagged, this kicked the player's camera identically whether the wreck was on
      // their nose or across the sector — measured as six unearned kicks in ~30 s of tutorial flight.
      this.bus.emit('camera:shake', { amount: reduced ? shake * 0.55 : shake, position: { x, z } });
      return;
    }

    if (phase === 'debris') {
      // Debris is made of narrow moving fragments with a few subordinate sparks. Large point
      // sprites became floating orange beads after the combustion phase had cooled.
      const fanCount = Math.max(3, Math.round((entry.classId === 'capital' ? 14 : isSmall ? 5 : 8)
        * burst * (reduced ? 0.65 : 1)));
      const fanSpread = entry.classId === 'capital' ? 1.92 : 1.52;
      for (let k = 0; k < fanCount; k++) {
        const normalized = fanCount > 1 ? k / (fanCount - 1) - 0.5 : 0;
        const a = dirAngle + normalized * fanSpread
          + explosionPatternSigned(entry.serial, phase, k, 0) * 0.11;
        const speed = (entry.classId === 'capital' ? 14 : 11)
          + explosionPattern01(entry.serial, phase, k, 1) * (entry.classId === 'capital' ? 34 : 24);
        const longLived = entry.classId === 'capital' && k % 4 === 0;
        this._spawnProjectileTrailStreak(
          x + Math.cos(a) * r * 0.08, 0.23, z + Math.sin(a) * r * 0.08,
          (longLived ? 1.75 : (entry.classId === 'capital' ? 0.92 : 0.62))
            + explosionPattern01(entry.serial, phase, k, 2) * 0.34,
          (0.05 + explosionPattern01(entry.serial, phase, k, 3) * 0.05) * scale,
          (0.8 + explosionPattern01(entry.serial, phase, k, 4)
            * (entry.classId === 'capital' ? 1.7 : 1.15)) * scale,
          reduced ? 0.20 : (0.32 + explosionPattern01(entry.serial, phase, k, 5) * 0.20),
          k % 3 === 0 ? '#ffe1ad' : '#c96a35',
          Math.cos(a) * speed * scale, Math.sin(a) * speed * scale,
          Math.cos(a), Math.sin(a));
      }
      if (entry.classId === 'capital') {
        const reverseCount = reduced ? 2 : 4;
        for (let k = 0; k < reverseCount; k++) {
          const normalized = reverseCount > 1 ? k / (reverseCount - 1) - 0.5 : 0;
          const a = dirAngle + Math.PI + normalized * 1.18
            + explosionPatternSigned(entry.serial, phase, k, 6) * 0.10;
          const speed = 9 + explosionPattern01(entry.serial, phase, k, 7) * 24;
          this._spawnProjectileTrailStreak(x, 0.21, z,
            1.0 + explosionPattern01(entry.serial, phase, k, 8) * 0.44,
            (0.045 + explosionPattern01(entry.serial, phase, k, 9) * 0.045) * scale,
            (0.72 + explosionPattern01(entry.serial, phase, k, 10) * 1.25) * scale,
            reduced ? 0.15 : 0.27,
            k % 2 ? '#aa4a28' : '#d8b58c', Math.cos(a) * speed, Math.sin(a) * speed,
            Math.cos(a), Math.sin(a));
        }
      }
      this._impactParticleCone(x, z, dirAngle, fanSpread,
        12, entry.classId === 'capital' ? 46 : 34,
        Math.round((entry.classId === 'capital' ? 9 : 5) * burst * (reduced ? 0.6 : 1)),
        entry.classId === 'capital' ? 1.2 : 0.8, 0.34 * scale,
        '#f2d2a2', '#33231c', 0.72);
      return;
    }

    if (phase === 'pressure') {
      // Space pressure is a broken pair of faint vapor shears. The gaps and unequal segment lengths
      // prevent the cue from rebuilding a ring when multiple destruction events overlap.
      const segmentCount = reduced ? 1 : 2;
      for (const side of [-1, 1]) {
        for (let segment = 0; segment < segmentCount; segment++) {
          const along = (segment - (segmentCount - 1) * 0.5) * r * 0.32;
          const segmentScale = 0.82 + explosionPattern01(entry.serial, phase, segment, side + 2) * 0.28;
          this._spawnSprite(SPR_PUFF,
            x + tangentX * side * r * (0.20 + segment * 0.07) + entry.dirX * along,
            0,
            z + tangentZ * side * r * (0.20 + segment * 0.07) + entry.dirZ * along,
            (entry.classId === 'capital' ? 0.78 : 0.50) * segmentScale,
            r * 0.12 * scale, r * (entry.classId === 'capital' ? 0.53 : 0.42) * scale * segmentScale,
            reduced ? 0.055 : 0.082, 0, '#675a52',
            tangentX * side * (6 + segment * 2), tangentZ * side * (6 + segment * 2),
            2.8, Math.atan2(tangentZ * side, tangentX * side) + (segment ? 0.20 : -0.14));
        }
      }
      return;
    }

    if (phase === 'residue') {
      const puffs = Math.max(2, Math.round((entry.classId === 'capital' ? 7 : 4) * burst * (reduced ? 0.72 : 1)));
      for (let k = 0; k < puffs; k++) {
        const normalized = puffs > 1 ? k / (puffs - 1) - 0.5 : 0;
        const a = dirAngle + normalized * 1.86
          + explosionPatternSigned(entry.serial, phase, k, 0) * 0.23;
        const distance = r * scale * (0.12 + explosionPattern01(entry.serial, phase, k, 1) * 0.34);
        const speed = 1.2 + explosionPattern01(entry.serial, phase, k, 2) * 3.8;
        this._spawnSprite(SPR_PUFF,
          x + Math.cos(a) * distance, 0, z + Math.sin(a) * distance,
          (entry.classId === 'capital' ? 2.15 : 1.08)
            + explosionPattern01(entry.serial, phase, k, 3) * (entry.classId === 'capital' ? 0.65 : 0.32),
          r * scale * (0.12 + explosionPattern01(entry.serial, phase, k, 4) * 0.07),
          r * scale * (0.34 + explosionPattern01(entry.serial, phase, k, 5) * 0.22),
          reduced ? 0.20 : 0.24, 0,
          k % 2 ? (reduced ? '#81736b' : '#625b57') : (reduced ? '#a06547' : '#744c3d'),
          Math.cos(a) * speed, Math.sin(a) * speed,
          1.18 + explosionPattern01(entry.serial, phase, k, 6) * 0.54,
          a + explosionPatternSigned(entry.serial, phase, k, 7) * 0.28);
      }
      // A few slow cooling fragments keep the source direction legible inside the residue without
      // turning the smoke into identical circular puffs or extending gameplay obstruction.
      const emberCount = entry.classId === 'capital' ? (reduced ? 2 : 4) : 2;
      for (let k = 0; k < emberCount; k++) {
        const a = dirAngle + (k - (emberCount - 1) * 0.5) * 0.52
          + explosionPatternSigned(entry.serial, phase, k, 8) * 0.12;
        this._spawnProjectileTrailStreak(x, 0.18, z,
          entry.classId === 'capital' ? 1.65 + k * 0.11 : 0.78 + k * 0.08,
          0.045 * scale, (0.72 + k * 0.23) * scale,
          reduced ? 0.13 : 0.23, k % 2 ? '#a64b2c' : '#d78a52',
          Math.cos(a) * (4 + k * 1.8), Math.sin(a) * (4 + k * 1.8),
          Math.cos(a), Math.sin(a));
      }
    }
  },

  _spawnCauseFragment(entry, x, z, angle, life, width, length, opacity, color, speed, travelScale) {
    const axisX = Math.cos(angle);
    const axisZ = Math.sin(angle);
    const inheritedX = Number.isFinite(entry.targetVelocityX) ? entry.targetVelocityX : 0;
    const inheritedZ = Number.isFinite(entry.targetVelocityZ) ? entry.targetVelocityZ : 0;
    const breakupSpeed = Math.max(0, Math.min(42, Number(speed) || 0)) * travelScale;
    return this._spawnProjectileTrailStreak(
      x, 0.24, z, life, width, length, opacity, color,
      inheritedX + axisX * breakupSpeed,
      inheritedZ + axisZ * breakupSpeed,
      axisX, axisZ,
    );
  },

  _emitCausalExplosionPhase(phase, entry) {
    const cause = entry.cause;
    const x = entry.x;
    const z = entry.z;
    const r = entry.radius;
    const classScale = entry.classId === 'capital' ? 1.12 : (entry.classId === 'small' ? 0.90 : 1);
    const scale = classScale * Math.max(0.78, Math.min(1.65, Math.sqrt(r / 8)));
    const accessibility = resolveVfxAccessibilityProfile(this.state && this.state.settings);
    const reduced = accessibility.flashOpacityScale < 1;
    const motionReduced = !!(this.state && this.state.settings && this.state.settings.video
      && this.state.settings.video.motionReduce);
    const travelScale = motionReduced ? 0.42 : (reduced ? 0.72 : 1);
    const opacityScale = accessibility.flashOpacityScale;
    const dirAngle = Math.atan2(entry.dirZ, entry.dirX);
    let contactX = entry.hasNormal ? entry.normalX : entry.dirX;
    let contactZ = entry.hasNormal ? entry.normalZ : entry.dirZ;
    if (cause === 'terrain_collision') {
      if (entry.hasNormal) {
        // SG-02 normal is an axis. Canonicalize it first, then choose a signed half only from
        // truthful motion/causal direction. Tangent or absent inputs retain the canonical axis.
        if (contactX < -1e-8 || (Math.abs(contactX) <= 1e-8 && contactZ < 0)) {
          contactX = -contactX;
          contactZ = -contactZ;
        }
        let incomingDot = contactX * entry.targetVelocityX + contactZ * entry.targetVelocityZ;
        if (Math.abs(incomingDot) <= 1e-8 && entry.hasDirection !== false) {
          incomingDot = contactX * entry.dirX + contactZ * entry.dirZ;
        }
        if (incomingDot > 1e-8) { contactX = -contactX; contactZ = -contactZ; }
      } else {
        const incomingDot = contactX * entry.targetVelocityX + contactZ * entry.targetVelocityZ;
        if (incomingDot > 0) { contactX = -contactX; contactZ = -contactZ; }
      }
    }
    if (Math.abs(contactX) < 1e-12) contactX = 0;
    if (Math.abs(contactZ) < 1e-12) contactZ = 0;
    const contactAngle = Math.atan2(contactZ, contactX);
    const tangentX = -contactZ;
    const tangentZ = contactX;
    const tangentAngle = Math.atan2(tangentZ, tangentX);
    const flashLife = Math.max(accessibility.flashMinLife, reduced ? 0.11 : 0.075);

    if (phase === 'contact-compression') {
      // Terrain starts at real contact: one flattened axis-locked compression, never an omnidirectional
      // pre-contact burst. Normal is unoriented, so target motion selects its outward half-space.
      this._spawnSprite(SPR_FLASH, x, 0.24, z, flashLife,
        r * 0.055 * scale,
        r * 0.24 * scale,
        0.92, 0, '#fff0d0', contactX * 2, contactZ * 2, 2.8, contactAngle);
      this._spawnCauseFragment(entry, x, z, contactAngle, reduced ? 0.24 : 0.34,
        0.08 * scale, 2.8 * scale, 0.66 * opacityScale, '#f1d2a0', 18, travelScale);
      if (accessibility.eventLightPeakScale > 0) {
        this._eventLight({ x, z }, 'explosion', {
          severity: 'compression', sizeMul: scale, distance: 100 + r * 3,
        });
      }
      return;
    }

    if (phase === 'terrain-spall') {
      const count = reduced ? 2 : 4;
      for (let k = 0; k < count; k++) {
        const side = k % 2 === 0 ? -1 : 1;
        const fan = (Math.floor(k / 2) + 1) * 0.13;
        const angle = tangentAngle + (side < 0 ? Math.PI : 0) + side * fan;
        this._spawnCauseFragment(entry, x + tangentX * side * r * 0.05,
          z + tangentZ * side * r * 0.05, angle,
          reduced ? 0.30 : 0.46, 0.055 * scale, (1.8 + k * 0.25) * scale,
          (reduced ? 0.30 : 0.58) * opacityScale, '#c9a878', 15 + k * 2, travelScale);
      }
      this._spawnSprite(SPR_PUFF, x - contactX * r * 0.04, 0.08, z - contactZ * r * 0.04,
        reduced ? 0.55 : 0.78, r * 0.08 * scale, r * 0.30 * scale,
        (reduced ? 0.20 : 0.30) * opacityScale, 0, '#7c6650',
        contactX * 2 * travelScale, contactZ * 2 * travelScale, 2.7, tangentAngle);
      return;
    }

    if (phase === 'collision-shear') {
      // Craft-on-craft contact is bilateral. Both unoriented normal halves survive, so swapping the
      // contact normal sign cannot change the read or pretend one hull was stationary terrain.
      const perSide = reduced ? 1 : 2;
      for (const side of [-1, 1]) {
        for (let k = 0; k < perSide; k++) {
          const angle = contactAngle + (side < 0 ? Math.PI : 0) + side * k * 0.18;
          this._spawnCauseFragment(entry, x + contactX * side * r * 0.06,
            z + contactZ * side * r * 0.06, angle,
            reduced ? 0.28 : 0.42, 0.07 * scale, (2.6 + k * 0.5) * scale,
            (reduced ? 0.36 : 0.68) * opacityScale, '#dbe8f1', 20 + k * 3, travelScale);
        }
      }
      this._spawnSprite(SPR_FLASH, x, 0.25, z, flashLife,
        r * 0.05 * scale,
        r * 0.25 * scale,
        0.84, 0, '#ffffff', 0, 0, 2.6, contactAngle);
      if (accessibility.eventLightPeakScale > 0) {
        this._eventLight({ x, z }, 'explosion', {
          severity: 'shear', sizeMul: scale, distance: 110 + r * 3,
        });
      }
      return;
    }

    if (phase === 'ignition') {
      const ignitionAngle = cause === 'ship_collision' ? contactAngle : dirAngle;
      this._spawnSprite(SPR_FLASH, x, 0.28, z, flashLife,
        r * 0.055 * scale,
        r * (cause === 'kinetic' ? 0.28 : 0.20) * scale,
        cause === 'kinetic' ? 0.94 : 0.86, 0, '#ffffff',
        Math.cos(ignitionAngle) * 2, Math.sin(ignitionAngle) * 2,
        cause === 'kinetic' ? 3.1 : 2.3, ignitionAngle);
      if (cause !== 'kinetic') {
        const pockets = reduced ? 1 : (cause === 'explosive' ? 3 : 2);
        for (let k = 0; k < pockets; k++) {
          const centered = k - (pockets - 1) * 0.5;
          this._spawnSprite(SPR_COMBUSTION,
            x + entry.dirX * centered * r * 0.12 - entry.dirZ * r * 0.05,
            0.20,
            z + entry.dirZ * centered * r * 0.12 + entry.dirX * r * 0.05,
            reduced ? 0.24 : 0.38 + k * 0.04,
            r * 0.055 * scale, r * 0.19 * scale,
            reduced ? 0.42 : 0.46, 0,
            k % 2 ? '#ffd08a' : '#e45b28',
            entry.dirX * (2 + k) * travelScale, entry.dirZ * (2 + k) * travelScale,
            1.5, ignitionAngle + centered * 0.26);
        }
      }
      if (accessibility.eventLightPeakScale > 0) {
        this._eventLight({ x, z }, 'explosion', {
          severity: cause === 'kinetic' ? 'kinetic-ignition' : 'thermal-ignition',
          sizeMul: scale,
          distance: 110 + r * 4,
        });
      }
      this._emitDestructionLightBeats(entry, scale, reduced);
      return;
    }

    if (phase === 'kinetic-tear') {
      const count = reduced ? 2 : 4;
      for (let k = 0; k < count; k++) {
        const centered = k - (count - 1) * 0.5;
        const angle = dirAngle + centered * (reduced ? 0.18 : 0.16);
        this._spawnCauseFragment(entry,
          x - entry.dirZ * centered * r * 0.025, z + entry.dirX * centered * r * 0.025,
          angle, reduced ? 0.25 : 0.38 + k * 0.025,
          0.045 * scale, (3.4 + k * 0.38) * scale,
          (reduced ? 0.30 : 0.70 - Math.abs(centered) * 0.08) * opacityScale,
          k % 2 ? '#f4d3a0' : '#d9e2e8', 24 + k * 2, travelScale);
      }
      return;
    }

    if (phase === 'internal' || phase === 'internal-secondary') {
      const secondary = phase === 'internal-secondary';
      const side = secondary ? 1 : -1;
      const count = reduced ? 1 : (secondary ? 3 : 2);
      for (let k = 0; k < count; k++) {
        const centered = k - (count - 1) * 0.5;
        const px = x - entry.dirZ * side * r * (secondary ? 0.28 : 0.17)
          + entry.dirX * centered * r * 0.12;
        const pz = z + entry.dirX * side * r * (secondary ? 0.28 : 0.17)
          + entry.dirZ * centered * r * 0.12;
        this._spawnSprite(SPR_COMBUSTION, px, 0.18, pz,
          reduced ? 0.28 : 0.46 + k * 0.05,
          r * 0.06 * scale, r * (secondary ? 0.28 : 0.20) * scale,
          reduced ? 0.42 : (secondary ? 0.54 : 0.42), 0,
          secondary ? '#ff6930' : '#ffc06a',
          (-entry.dirZ * side * (3 + k) + entry.dirX * centered) * travelScale,
          (entry.dirX * side * (3 + k) + entry.dirZ * centered) * travelScale,
          1.5, dirAngle + side * (secondary ? 0.92 : 0.58));
      }
      return;
    }

    if (phase === 'breakup') {
      const count = reduced ? 2 : 4;
      for (let k = 0; k < count; k++) {
        const centered = k - (count - 1) * 0.5;
        const baseAngle = cause === 'ship_collision' ? contactAngle : dirAngle;
        const angle = baseAngle + centered * (cause === 'kinetic' ? 0.18 : 0.44);
        this._spawnCauseFragment(entry, x, z, angle, reduced ? 0.34 : 0.56,
          0.06 * scale, (2.8 + k * 0.42) * scale,
          (reduced ? 0.27 : 0.54) * opacityScale, '#e7c79c', 20 + k * 2, travelScale);
      }
      return;
    }

    if (phase === 'rupture') {
      const count = reduced ? 2 : (cause === 'explosive' ? 7 : (cause === 'ship_collision' ? 6 : 4));
      const spread = cause === 'kinetic' ? 0.48 : (cause === 'explosive' ? 2.2 : 1.4);
      for (let k = 0; k < count; k++) {
        let angle;
        if (cause === 'ship_collision') {
          const side = k % 2 === 0 ? -1 : 1;
          angle = contactAngle + (side < 0 ? Math.PI : 0)
            + side * Math.floor(k / 2) * 0.24;
        } else if (cause === 'terrain_collision') {
          const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
          angle = contactAngle + normalized * spread;
        } else {
          const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
          angle = dirAngle + normalized * spread;
        }
        this._spawnCauseFragment(entry, x, z, angle,
          reduced ? 0.28 : 0.48 + k * 0.025,
          0.055 * scale, (2.4 + k * 0.24) * scale,
          (reduced ? 0.27 : 0.58) * opacityScale,
          k % 2 ? '#e7a15d' : '#f4dfb8', 18 + k * 1.5, travelScale);
      }
      const ruptureAngle = cause === 'terrain_collision' || cause === 'ship_collision'
        ? contactAngle : dirAngle;
      this._spawnSprite(SPR_FLASH, x, 0.27, z, flashLife,
        r * 0.06 * scale,
        r * 0.25 * scale,
        0.90, 0, '#ffffff',
        Math.cos(ruptureAngle) * 3, Math.sin(ruptureAngle) * 3, 2.7, ruptureAngle);
      if (accessibility.eventLightPeakScale > 0) {
        this._eventLight({ x, z }, 'explosion', {
          severity: 'tear', sizeMul: scale, distance: 140 + r * 5,
        });
      }
      this.bus.emit('camera:shake', {
        amount: (reduced ? 0.16 : 0.30) * (entry.classId === 'capital' ? 1.5 : 1),
        position: { x, z },
      });
      return;
    }

    if (phase === 'debris') {
      const baseCount = cause === 'explosive' ? 7 : (cause === 'kinetic' ? 4 : 6);
      const count = reduced ? Math.max(2, Math.floor(baseCount * 0.45)) : baseCount;
      for (let k = 0; k < count; k++) {
        const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
        let baseAngle = dirAngle;
        let spread = cause === 'kinetic' ? 0.62 : 1.8;
        if (cause === 'terrain_collision') { baseAngle = contactAngle; spread = 1.28; }
        if (cause === 'ship_collision') {
          const side = k % 2 === 0 ? -1 : 1;
          baseAngle = contactAngle + (side < 0 ? Math.PI : 0);
          spread = 0.72;
        }
        const angle = baseAngle + normalized * spread
          + explosionPatternSigned(entry.serial, phase, k, 15) * 0.08;
        this._spawnCauseFragment(entry, x, z, angle,
          reduced ? 0.42 : 0.72 + k * 0.035,
          (0.045 + explosionPattern01(entry.serial, phase, k, 16) * 0.025) * scale,
          (1.0 + explosionPattern01(entry.serial, phase, k, 17) * 1.1) * scale,
          (reduced ? 0.20 : 0.42) * opacityScale,
          k % 2 ? '#bd7b4c' : '#dac5aa', 12 + k * 2, travelScale);
      }
      return;
    }

    if (phase === 'pressure') {
      const axisAngle = cause === 'ship_collision' ? contactAngle : dirAngle;
      const axisX = Math.cos(axisAngle);
      const axisZ = Math.sin(axisAngle);
      const sideX = -axisZ;
      const sideZ = axisX;
      for (const side of [-1, 1]) {
        const segments = reduced ? 1 : (cause === 'explosive' ? 2 : 1);
        for (let k = 0; k < segments; k++) {
          this._spawnSprite(SPR_PUFF,
            x + sideX * side * r * (0.16 + k * 0.08) + axisX * k * r * 0.10,
            0,
            z + sideZ * side * r * (0.16 + k * 0.08) + axisZ * k * r * 0.10,
            reduced ? 0.42 : 0.62 + k * 0.11,
            r * 0.10 * scale, r * (cause === 'explosive' ? 0.52 : 0.38) * scale,
            (reduced ? 0.04 : 0.085) * opacityScale, 0, '#655a54',
            sideX * side * 5 * travelScale, sideZ * side * 5 * travelScale,
            2.8, Math.atan2(sideZ * side, sideX * side));
        }
      }
      return;
    }

    if (phase === 'residue') {
      const count = reduced ? 2 : (cause === 'explosive' ? 5 : 3);
      for (let k = 0; k < count; k++) {
        const normalized = count > 1 ? k / (count - 1) - 0.5 : 0;
        const baseAngle = cause === 'terrain_collision' ? tangentAngle : dirAngle;
        const angle = baseAngle + normalized * (cause === 'terrain_collision' ? 1.1 : 1.7)
          + explosionPatternSigned(entry.serial, phase, k, 18) * 0.16;
        const distance = r * (0.10 + explosionPattern01(entry.serial, phase, k, 19) * 0.24);
        this._spawnSprite(SPR_PUFF,
          x + Math.cos(angle) * distance, 0, z + Math.sin(angle) * distance,
          reduced ? 0.78 : 1.18 + k * 0.08,
          r * 0.10 * scale, r * (0.28 + k * 0.025) * scale,
          (reduced ? 0.16 : 0.24) * opacityScale, 0,
          cause === 'terrain_collision' ? '#6f604f' : '#5e514a',
          (entry.targetVelocityX * 0.06 + Math.cos(angle) * 2) * travelScale,
          (entry.targetVelocityZ * 0.06 + Math.sin(angle) * 2) * travelScale,
          1.8, angle);
      }
    }
  },

  };
}
