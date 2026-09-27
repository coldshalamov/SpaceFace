import {
  assertDynamicBufferOwnerWritable,
  commitDynamicBufferOwner,
  markDynamicBufferItems,
  registerDynamicBufferOwner,
  unregisterDynamicBufferOwner,
} from '../dynamicBufferRanges.js';

const DEFAULT_MAX_BEAMS = 16;
const DEFAULT_TIMEOUT_S = 0.14;
// Birth spool: a latched continuous beam grows out of the aperture instead of snapping to full
// width and brightness on the first presented frame (B10). The presentation keeps a short drain
// after the authoritative stop so the loaded conduit can cool at the work face instead of popping
// out of existence on the same render tick.
export const BEAM_BIRTH_S = 0.08;
export const BEAM_COOLING_S = 0.26;

/** Smooth 0..1 birth ramp; 1 once the beam has spooled. */
export function beamBirthGlow(ageS) {
  const t = Math.max(0, Math.min(1, (Number.isFinite(ageS) ? ageS : 0) / BEAM_BIRTH_S));
  return t * t * (3 - 2 * t);
}

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function colorValue(value, fallback) {
  return value == null ? fallback : value;
}

function identityLocal(x, z, out) {
  out.x = x;
  out.z = z;
  return out;
}

function beamKey(payload) {
  if (!payload) return null;
  if (payload.beamKey != null && String(payload.beamKey).length > 0) return String(payload.beamKey);
  if (payload.ownerId == null) return null;
  return `${String(payload.ownerId)}:${payload.hardpointIdx || 0}`;
}

function createBeamBatch(THREE, capacity, name) {
  const positions = new Float32Array(capacity * 4 * 3);
  const colors = new Float32Array(capacity * 4 * 3);
  const uvs = new Float32Array(capacity * 4 * 2);
  // World distance from the aperture to this vertex. Packets are phased on THIS, never on the
  // normalized uv, so a beam that lengthens as its target runs cannot stretch its own energy
  // structure like a rubber band. Deliberately OUTSIDE the dynamic-buffer owner: it is 64 floats
  // for the whole pool, and leaving it unregistered keeps the ranged-publication accounting for
  // position and colour exactly as it was.
  const axial = new Float32Array(capacity * 4);
  // Lifecycle clocks are per-vertex attributes so the shader can show an aperture arrival and a
  // directional drain without rebuilding geometry or allocating a second mesh for every beam.
  const born = new Float32Array(capacity * 4);
  const stopTimes = new Float32Array(capacity * 4);
  stopTimes.fill(-1);
  const indices = new Uint16Array(capacity * 6);
  for (let slot = 0; slot < capacity; slot++) {
    const vertex = slot * 4;
    const index = slot * 6;
    indices[index] = vertex;
    indices[index + 1] = vertex + 1;
    indices[index + 2] = vertex + 2;
    indices[index + 3] = vertex;
    indices[index + 4] = vertex + 2;
    indices[index + 5] = vertex + 3;
    // Static per-quat axial/cross coordinates: u runs muzzle(0) -> contact(1), v runs across.
    // Written once; _writeSlotQuad only ever moves positions, so this never costs a frame.
    const uv = slot * 8;
    uvs[uv] = 0; uvs[uv + 1] = 0;
    uvs[uv + 2] = 0; uvs[uv + 3] = 1;
    uvs[uv + 4] = 1; uvs[uv + 5] = 1;
    uvs[uv + 6] = 1; uvs[uv + 7] = 0;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = name;
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const position = new THREE.BufferAttribute(positions, 3);
  const color = new THREE.BufferAttribute(colors, 3);
  position.setUsage(THREE.DynamicDrawUsage);
  color.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', color);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  const axialAttribute = new THREE.BufferAttribute(axial, 1);
  axialAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aSfAxial', axialAttribute);
  const bornAttribute = new THREE.BufferAttribute(born, 1);
  const stopAttribute = new THREE.BufferAttribute(stopTimes, 1);
  bornAttribute.setUsage(THREE.DynamicDrawUsage);
  stopAttribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('aSfBorn', bornAttribute);
  geometry.setAttribute('aSfStop', stopAttribute);
  return {
    geometry, positions, colors, position, color, axial, axialAttribute,
    born, stopTimes, bornAttribute, stopAttribute,
  };
}

// A sustained beam is an energy conduit, not a colored rectangle. The injected structure gives
// the quad a loaded cross-section (bright internal strands running through a substantial body,
// M2), packets of energy travelling muzzle -> contact (E3), and a restrained work face where the
// authoritative ray meets matter. The endpoint is a broad folded contact response, not a second
// muzzle flash or a detached impact sprite.
// The donor stays MeshBasicMaterial so the dynamic-buffer owner contract and blend roles are
// untouched; uSfPulse lets the accessibility path quiet the travelling term without removing
// the filament.
function applyBeamShaderStructure(material, shared, role) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSfTime = shared.time;
    shader.uniforms.uSfPulse = shared.pulse;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSfBeam;\nvarying float vSfAxial;\nvarying float vSfBorn;\nvarying float vSfStop;\nattribute float aSfAxial;\nattribute float aSfBorn;\nattribute float aSfStop;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSfBeam = uv;\nvSfAxial = aSfAxial;\nvSfBorn = aSfBorn;\nvSfStop = aSfStop;');
    if (role === 'core') {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSfBeam;\nvarying float vSfAxial;\nvarying float vSfBorn;\nvarying float vSfStop;\nuniform float uSfTime;\nuniform float uSfPulse;')
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float sfAcross = abs(vSfBeam.y * 2.0 - 1.0);
  // The conduit loads from the aperture toward the authoritative contact. A small ignition floor
  // keeps the first frame legible, while the moving front prevents a static white bar at spawn.
  float sfAge = max(0.0, uSfTime - vSfBorn);
  float sfArrival = 0.20 + 0.80 * smoothstep(0.0, 0.14, sfAge - vSfAxial * 0.0034);
  float sfReleaseAge = vSfStop < -0.5 ? 0.0 : max(0.0, uSfTime - vSfStop);
  float sfCooling = vSfStop < -0.5 ? 1.0 : 1.0 - smoothstep(0.0, 0.26, sfReleaseAge);
  float sfDrainFront = vSfStop < -0.5 ? 1.1 : smoothstep(0.0, 1.0, sfReleaseAge / 0.26);
  float sfDrain = vSfStop < -0.5
    ? 1.0
    : smoothstep(sfDrainFront - 0.16, sfDrainFront + 0.16, vSfBeam.x);

  // A loaded volume has a hot spine, a softer wall, and dark moving separation between the
  // internal strands. These folds are phased on world distance, so a retarget cannot stretch the
  // material into a rubber band.
  float sfSpine = pow(max(0.0, 1.0 - sfAcross), 2.35);
  float sfWall = 1.0 - smoothstep(0.52, 0.92, sfAcross);
  float sfRiftA = 0.5 + 0.5 * sin(vSfAxial * 1.65 - uSfTime * 34.0 + vSfBeam.y * 5.0);
  float sfRiftB = 0.5 + 0.5 * sin(vSfAxial * 0.76 + uSfTime * 23.0 - vSfBeam.y * 3.0);
  float sfCrest = 0.5 + 0.5 * sin(vSfAxial * 2.35 - uSfTime * 142.0 + vSfBeam.y * 4.0);
  float sfTravel = 0.5 + 0.5 * sin(vSfAxial * 1.95 - uSfTime * 176.0);
  float sfInternal = 0.66 + 0.20 * sfRiftA + 0.14 * sfRiftB;
  float sfLoadedBody = (sfWall * 0.58 + sfSpine * (0.96 + 0.24 * sfCrest)) * sfInternal;

  // At the far end, the same volume opens into a folded work face. It is tied to uv.x==1 (the
  // receipt's contact point), broad enough to read at gameplay scale, and lower-radiance than the
  // spine so it reads as force doing work rather than a second primary flash.
  float sfContactBand = smoothstep(0.64, 0.96, vSfBeam.x);
  float sfFaceCenter = 0.50 + 0.18 * sin(uSfTime * 17.0 + vSfAxial * 0.42);
  float sfFaceRidge = 1.0 - smoothstep(0.08, 0.34, abs(vSfBeam.y - sfFaceCenter));
  float sfFaceFold = 0.5 + 0.5 * sin(vSfBeam.y * 13.0 - uSfTime * 41.0 + vSfAxial);
  float sfWorkFace = sfContactBand * (0.28 + 0.72 * sfFaceRidge) * (0.60 + 0.40 * sfFaceFold);

  // The aperture remains a small source lip; it no longer has to carry the whole beam's read.
  float sfMuzzle = smoothstep(0.12, 0.0, vSfBeam.x);
  float sfEnergy = sfLoadedBody * (0.72 + 0.28 * sfTravel * uSfPulse)
    + sfWorkFace * 0.66 + sfMuzzle * 0.32;
  diffuseColor.rgb *= sfEnergy * sfArrival * sfCooling * (0.18 + 0.82 * sfDrain);
  diffuseColor.a *= clamp(sfArrival * sfCooling * (0.26 + 0.74 * sfDrain), 0.0, 1.0);
}`);
    } else {
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vSfBeam;\nvarying float vSfAxial;\nvarying float vSfBorn;\nvarying float vSfStop;\nuniform float uSfTime;\nuniform float uSfPulse;')
        .replace('#include <color_fragment>', `#include <color_fragment>
{
  float sfAcross = abs(vSfBeam.y * 2.0 - 1.0);
  float sfAge = max(0.0, uSfTime - vSfBorn);
  float sfArrival = 0.16 + 0.84 * smoothstep(0.0, 0.18, sfAge - vSfAxial * 0.0030);
  float sfReleaseAge = vSfStop < -0.5 ? 0.0 : max(0.0, uSfTime - vSfStop);
  float sfCooling = vSfStop < -0.5 ? 1.0 : 1.0 - smoothstep(0.0, 0.26, sfReleaseAge);
  float sfDrainFront = vSfStop < -0.5 ? 1.1 : smoothstep(0.0, 1.0, sfReleaseAge / 0.26);
  float sfDrain = vSfStop < -0.5
    ? 1.0
    : smoothstep(sfDrainFront - 0.18, sfDrainFront + 0.18, vSfBeam.x);
  float sfSheath = pow(max(0.0, 1.0 - sfAcross), 1.65) + (1.0 - smoothstep(0.58, 0.96, sfAcross)) * 0.28;
  float sfTravel = 0.5 + 0.5 * sin(vSfAxial * 1.12 - uSfTime * 78.0);
  float sfContactBand = smoothstep(0.62, 0.98, vSfBeam.x);
  float sfFaceFold = 0.5 + 0.5 * sin(vSfBeam.y * 10.0 - uSfTime * 29.0 + vSfAxial * 0.8);
  float sfWorkFace = sfContactBand * (0.20 + 0.80 * sfFaceFold);
  float sfMuzzle = smoothstep(0.2, 0.0, vSfBeam.x);
  float sfEnergy = sfSheath * (0.26 + 0.74 * sfTravel * uSfPulse) + sfWorkFace * 0.42
    + 0.25 * sfMuzzle * sfSheath;
  diffuseColor.rgb *= sfEnergy * sfArrival * sfCooling * (0.16 + 0.84 * sfDrain);
  diffuseColor.a *= clamp(sfArrival * sfCooling * (0.20 + 0.80 * sfDrain), 0.0, 1.0);
}`);
    }
  };
  // The two roles inject different sources; make the program cache key reflect that.
  material.customProgramCacheKey = () => `sf-beam-structure-${role}`;
}

/**
 * Two draw calls for every live continuous weapon beam: one opaque-hot core and one restrained
 * additive sheath. Simulation owns hit rays; this bounded pool only mirrors presentation receipts.
 */
export class PersistentCombatBeamPool {
  constructor(THREE, options = {}) {
    this.THREE = THREE;
    this.maxBeams = Math.max(1, options.maxBeams || DEFAULT_MAX_BEAMS);
    this.timeoutS = Math.max(0.05, options.timeoutS || DEFAULT_TIMEOUT_S);
    this.activeCount = 0;
    this.startCount = 0;
    this._byKey = new Map();
    this._entries = Array.from({ length: this.maxBeams }, (_, slot) => ({
      slot,
      active: false,
      key: null,
      ownerId: null,
      weaponId: null,
      fromX: 0,
      fromZ: 0,
      toX: 0,
      toZ: 0,
      y: 0.35,
      widthMul: 1,
      bornAt: -Infinity,
      lastSeen: -Infinity,
      stopping: false,
      explicitStop: false,
      stopAt: -Infinity,
      coreR: 1,
      coreG: 1,
      coreB: 1,
      haloR: 0.4,
      haloG: 0.8,
      haloB: 1,
    }));

    this._localA = { x: 0, z: 0 };
    this._localB = { x: 0, z: 0 };
    this._color = new THREE.Color();
    // Shared uniform objects: one time base and one accessibility pulse scale for both layers.
    this._beamShaderShared = { time: { value: 0 }, pulse: { value: 1 } };

    // Each layer is one dynamic quad batch. This retains a bounded two-draw pool while avoiding the
    // zero-pixel failure mode seen with a live InstancedMesh whose instance transforms were valid
    // but did not survive the normal-route render path. Slots are rewritten in place; no objects or
    // typed arrays are allocated by update().
    this._coreBatch = createBeamBatch(THREE, this.maxBeams, 'sf-combat-beam-core-batch');
    this._haloBatch = createBeamBatch(THREE, this.maxBeams, 'sf-combat-beam-sheath-batch');
    this.geometry = this._coreBatch.geometry;
    this.coreMaterial = new THREE.MeshBasicMaterial({
      name: 'sf-combat-beam-core',
      color: 0xffffff,
      transparent: true,
      opacity: 1,
      depthTest: true,
      depthWrite: false,
      // A sustained connection needs a stable energy filament even against true black space.
      // Normal blending supplies that readable structural core; only the surrounding sheath is
      // additive, so beam identity no longer depends on bloom or exposure.
      blending: THREE.NormalBlending,
      toneMapped: false,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    applyBeamShaderStructure(this.coreMaterial, this._beamShaderShared, 'core');
    this.haloMaterial = new THREE.MeshBasicMaterial({
      name: 'sf-combat-beam-sheath',
      color: 0xffffff,
      transparent: true,
      opacity: 0.34,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexColors: true,
      side: THREE.DoubleSide,
    });
    applyBeamShaderStructure(this.haloMaterial, this._beamShaderShared, 'sheath');
    this.core = new THREE.Mesh(this._coreBatch.geometry, this.coreMaterial);
    this.halo = new THREE.Mesh(this._haloBatch.geometry, this.haloMaterial);
    this.core.name = 'sf-combat-beam-core-pool';
    this.halo.name = 'sf-combat-beam-sheath-pool';
    this.core.frustumCulled = false;
    this.halo.frustumCulled = false;
    this.core.renderOrder = 23;
    this.halo.renderOrder = 22;

    this.group = new THREE.Group();
    this.group.name = 'sf-persistent-combat-beams';
    this.group.userData.spacefacePersistentCombatBeams = true;
    this.group.add(this.halo, this.core);
    this.group.visible = false;

    const scene = options.scene;
    this._coreBatch.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
      id: 'persistent-combat-beam-core',
      mesh: this.core,
      attributes: [
        { name: 'position', attribute: this._coreBatch.position },
        { name: 'color', attribute: this._coreBatch.color },
      ],
    });
    this._haloBatch.dynamicBufferOwner = registerDynamicBufferOwner(scene, {
      id: 'persistent-combat-beam-sheath',
      mesh: this.halo,
      attributes: [
        { name: 'position', attribute: this._haloBatch.position },
        { name: 'color', attribute: this._haloBatch.color },
      ],
    });
  }

  upsert(payload, timeS, profile = null) {
    const key = beamKey(payload);
    const from = payload && (payload.from || payload.origin);
    const to = payload && payload.to;
    if (!key || !from || !to) return false;
    let entry = this._byKey.get(key);
    if (!entry) {
      entry = this._claimEntry(key);
      entry.bornAt = finite(timeS, 0);
      this.startCount++;
    } else if (entry.stopping) {
      if (entry.explicitStop) {
        // An explicit stop is a real source transition. Retire the draining slot before claiming
        // it again so the new receipt gets a fresh birth clock and one new source ignition. Lost
        // update receipts use the non-explicit drain below and keep their original lifecycle.
        this._release(entry);
        entry = this._claimEntry(key);
        entry.bornAt = finite(timeS, 0);
        this.startCount++;
      } else {
        // A receipt arriving during a timeout drain re-latches the same loaded volume. It does not
        // restart the source animation or allocate another slot.
        entry.stopping = false;
        entry.stopAt = -Infinity;
      }
    }
    entry.fromX = finite(from.x, entry.fromX);
    entry.fromZ = finite(from.z, entry.fromZ);
    entry.toX = finite(to.x, entry.toX);
    entry.toZ = finite(to.z, entry.toZ);
    entry.y = finite(from.y, finite(payload.y, 0.35));
    entry.widthMul = Math.max(0.5, finite(profile && profile.sizeMul, 1));
    entry.ownerId = payload.ownerId == null ? entry.ownerId : payload.ownerId;
    entry.weaponId = payload.weaponId == null ? entry.weaponId : payload.weaponId;
    entry.lastSeen = finite(timeS, 0);
    this._writeSlotLifecycle(this._coreBatch, entry.slot, entry.bornAt, entry.stopAt);
    this._writeSlotLifecycle(this._haloBatch, entry.slot, entry.bornAt, entry.stopAt);
    const birth = beamBirthGlow(entry.lastSeen - entry.bornAt);
    // Shader arrival supplies the directional load, but the source lip needs enough authored
    // material on frame zero to avoid the black first-frame failure in a normal-speed capture.
    const birthIntensity = 0.24 + 0.76 * birth;
    this._color.set(colorValue(profile && profile.coreColor, 0xffffff));
    entry.coreR = this._color.r;
    entry.coreG = this._color.g;
    entry.coreB = this._color.b;
    this._writeSlotColor(this._coreBatch, entry.slot,
      entry.coreR * birthIntensity, entry.coreG * birthIntensity, entry.coreB * birthIntensity);
    this._color.set(colorValue(profile && profile.accentColor, 0x66ccff));
    entry.haloR = this._color.r;
    entry.haloG = this._color.g;
    entry.haloB = this._color.b;
    this._writeSlotColor(this._haloBatch, entry.slot,
      entry.haloR * birthIntensity, entry.haloG * birthIntensity, entry.haloB * birthIntensity);
    this._commitBatch(this._coreBatch);
    this._commitBatch(this._haloBatch);
    this.group.visible = true;
    return true;
  }

  retarget(payload, timeS) {
    if (!payload || !payload.pos) return 0;
    const ownerId = payload.attackerId == null ? payload.ownerId : payload.attackerId;
    let updated = 0;
    for (const entry of this._entries) {
      if (!entry.active || entry.ownerId !== ownerId) continue;
      if (payload.weaponId != null && entry.weaponId !== payload.weaponId) continue;
      entry.toX = finite(payload.pos.x, entry.toX);
      entry.toZ = finite(payload.pos.z, entry.toZ);
      entry.lastSeen = finite(timeS, entry.lastSeen);
      updated++;
    }
    return updated;
  }

  stop(payload, timeS = null) {
    const key = beamKey(payload);
    const entry = key ? this._byKey.get(key) : null;
    if (!entry) return false;
    this._beginRelease(entry, finite(timeS, entry.lastSeen), true);
    return true;
  }

  /**
   * @param {function|null} resolveOrigin Optional live socket lookup, `(entry) => pose|null` in the
   *   same global frame the receipts arrive in. Sim receipts refresh the aperture once per tick;
   *   this lets a sustained beam stay welded to the firing socket at display rate while the ship
   *   turns, instead of stepping. It only moves the drawn origin - the contact end stays exactly
   *   where the simulation put it, so nothing here can invent a hit.
   */
  update(timeS, toLocal, accessibility = null, cameraFloor = 0, resolveOrigin = null) {
    const localize = typeof toLocal === 'function' ? toLocal : identityLocal;
    const socketOf = typeof resolveOrigin === 'function' ? resolveOrigin : null;
    const now = finite(timeS, 0);
    const reducedFlash = !!(accessibility && (
      accessibility.reducedFlash || accessibility.flashOpacityScale < 1
    ));
    this._beamShaderShared.time.value = now;
    this._beamShaderShared.pulse.value = reducedFlash ? 0.3 : 1;
    let matricesChanged = false;
    for (let entryIndex = 0; entryIndex < this._entries.length; entryIndex++) {
      const entry = this._entries[entryIndex];
      if (!entry.active) continue;
      if (!entry.stopping && now - entry.lastSeen > this.timeoutS) {
        // A lost receipt is still a release, not an instantaneous delete. This keeps the pool
        // honest under packet loss while preserving a visible source-to-contact drain.
        this._beginRelease(entry, entry.lastSeen, false);
      }
      if (entry.stopping && now - entry.stopAt >= BEAM_COOLING_S) {
        this._release(entry);
        matricesChanged = true;
        continue;
      }
      if (socketOf && entry.ownerId != null) {
        const socket = socketOf(entry);
        if (socket && Number.isFinite(socket.x) && Number.isFinite(socket.z)) {
          // XZ ONLY, deliberately. SOCKET_Weapon_Front sits anywhere from y 0.0 to 0.82 depending
          // on the hull, while the beam quad carries ONE y for all four vertices. Taking the
          // socket's height would tilt nothing and lift everything: the far end would float off
          // the contact point and out of the plane the impact owner draws in. The aperture
          // follows the gun across the deck; the beam stays in the combat plane.
          entry.fromX = socket.x;
          entry.fromZ = socket.z;
        }
      }
      localize(entry.fromX, entry.fromZ, this._localA);
      const ax = this._localA.x;
      const az = this._localA.z;
      localize(entry.toX, entry.toZ, this._localB);
      const bx = this._localB.x;
      const bz = this._localB.z;
      const dx = bx - ax;
      const dz = bz - az;
      const length = Math.max(0.01, Math.hypot(dx, dz));
      // Preserve a stable core through the normal route's video downscale as well as fixed stills.
      // The beam remains a restrained two-layer line, but the prior 0.48 width visually vanished
      // in consecutive 720p evidence frames despite the pool staying live.
      // Birth spool scales the drawn width, not the simulated connection: the beam exists at full
      // length immediately and opens from a filament to its full cross-section.
      const birth = beamBirthGlow(now - entry.bornAt);
      const birthWidth = 0.22 + 0.78 * (birth * birth * (3 - 2 * birth));
      const coolWidth = entry.stopping
        ? 0.84 + 0.16 * (1 - Math.min(1, Math.max(0, (now - entry.stopAt) / BEAM_COOLING_S)))
        : 1;
      const width = Math.max(
        (reducedFlash ? 0.36 : 0.52) * entry.widthMul * birthWidth * coolWidth,
        cameraFloor || 0,
      );
      this._writeSlotQuad(this._coreBatch, entry.slot, ax, az, bx, bz, entry.y, width, length);
      this._writeSlotQuad(this._haloBatch, entry.slot, ax, az, bx, bz, entry.y - 0.01, width * 2.8, length);
      matricesChanged = true;
    }
    if (matricesChanged) {
      if (!this._commitBatch(this._coreBatch)) this._coreBatch.position.needsUpdate = true;
      if (!this._commitBatch(this._haloBatch)) this._haloBatch.position.needsUpdate = true;
    }
    this.group.visible = this.activeCount > 0;
    return this.activeCount;
  }

  clear() {
    for (const entry of this._entries) {
      if (entry.active) this._release(entry);
    }
  }

  dispose() {
    this.clear();
    if (this.group.parent) this.group.parent.remove(this.group);
    unregisterDynamicBufferOwner(this._coreBatch.dynamicBufferOwner);
    unregisterDynamicBufferOwner(this._haloBatch.dynamicBufferOwner);
    this._coreBatch.geometry.dispose();
    this._haloBatch.geometry.dispose();
    this.coreMaterial.dispose();
    this.haloMaterial.dispose();
  }

  _claimEntry(key) {
    let entry = null;
    for (let i = 0; i < this._entries.length; i++) {
      if (!this._entries[i].active) {
        entry = this._entries[i];
        break;
      }
    }
    if (!entry) {
      entry = this._entries[0];
      for (let i = 1; i < this._entries.length; i++) {
        if (this._entries[i].lastSeen < entry.lastSeen) entry = this._entries[i];
      }
      this._release(entry);
    }
    entry.active = true;
    entry.key = key;
    entry.stopping = false;
    entry.stopAt = -Infinity;
    this._byKey.set(key, entry);
    this.activeCount++;
    return entry;
  }

  _release(entry) {
    if (!entry || !entry.active) return;
    this._byKey.delete(entry.key);
    entry.active = false;
    entry.key = null;
    entry.ownerId = null;
    entry.weaponId = null;
    entry.lastSeen = -Infinity;
    entry.bornAt = -Infinity;
    entry.stopping = false;
    entry.explicitStop = false;
    entry.stopAt = -Infinity;
    this.activeCount = Math.max(0, this.activeCount - 1);
    this._clearSlot(this._coreBatch, entry.slot);
    this._clearSlot(this._haloBatch, entry.slot);
    this._commitBatch(this._coreBatch);
    this._commitBatch(this._haloBatch);
    this.group.visible = this.activeCount > 0;
  }

  _beginRelease(entry, timeS, explicitStop = false) {
    if (!entry || !entry.active || entry.stopping) return;
    entry.stopping = true;
    entry.explicitStop = explicitStop;
    entry.stopAt = finite(timeS, entry.lastSeen);
    this._writeSlotLifecycle(this._coreBatch, entry.slot, entry.bornAt, entry.stopAt);
    this._writeSlotLifecycle(this._haloBatch, entry.slot, entry.bornAt, entry.stopAt);
  }

  _writeSlotColor(batch, slot, r, g, b) {
    const tracked = this._markSlot(batch, 1, slot);
    const start = slot * 12;
    for (let vertex = 0; vertex < 4; vertex++) {
      const offset = start + vertex * 3;
      batch.colors[offset] = r;
      batch.colors[offset + 1] = g;
      batch.colors[offset + 2] = b;
    }
    if (!tracked) batch.color.needsUpdate = true;
  }

  _writeSlotLifecycle(batch, slot, bornAt, stopAt) {
    const start = slot * 4;
    const born = finite(bornAt, 0);
    const stopped = Number.isFinite(stopAt) ? stopAt : -1;
    for (let vertex = 0; vertex < 4; vertex++) {
      batch.born[start + vertex] = born;
      batch.stopTimes[start + vertex] = stopped;
    }
    batch.bornAttribute.needsUpdate = true;
    batch.stopAttribute.needsUpdate = true;
  }

  _writeSlotQuad(batch, slot, ax, az, bx, bz, y, width, length) {
    this._markSlot(batch, 0, slot);
    const nx = -(bz - az) / length;
    const nz = (bx - ax) / length;
    const hx = nx * width * 0.5;
    const hz = nz * width * 0.5;
    const start = slot * 12;
    const p = batch.positions;
    p[start] = ax + hx; p[start + 1] = y; p[start + 2] = az + hz;
    p[start + 3] = ax - hx; p[start + 4] = y; p[start + 5] = az - hz;
    p[start + 6] = bx - hx; p[start + 7] = y; p[start + 8] = bz - hz;
    p[start + 9] = bx + hx; p[start + 10] = y; p[start + 11] = bz + hz;
    // uv.x runs aperture(0) -> contact(1); the axial coordinate is the same run measured in world
    // units, so the travelling packets keep one physical wavelength at any beam length.
    const axialStart = slot * 4;
    const axial = batch.axial;
    if (axial) {
      axial[axialStart] = 0;
      axial[axialStart + 1] = 0;
      axial[axialStart + 2] = length;
      axial[axialStart + 3] = length;
      batch.axialAttribute.needsUpdate = true;
    }
  }

  _clearSlot(batch, slot) {
    const tracked = this._markSlot(batch, 0, slot);
    const start = slot * 12;
    batch.positions.fill(0, start, start + 12);
    if (batch.axial) {
      batch.axial.fill(0, slot * 4, slot * 4 + 4);
      batch.axialAttribute.needsUpdate = true;
    }
    batch.born.fill(0, slot * 4, slot * 4 + 4);
    batch.stopTimes.fill(-1, slot * 4, slot * 4 + 4);
    batch.bornAttribute.needsUpdate = true;
    batch.stopAttribute.needsUpdate = true;
    if (!tracked) batch.position.needsUpdate = true;
  }

  _markSlot(batch, bindingIndex, slot) {
    const owner = batch.dynamicBufferOwner;
    if (!owner) return false;
    assertDynamicBufferOwnerWritable(owner);
    markDynamicBufferItems(owner, bindingIndex, slot * 4, 4);
    return true;
  }

  _commitBatch(batch) {
    const owner = batch.dynamicBufferOwner;
    if (!owner) return false;
    // The indexed geometry always addresses every preallocated slot. Mesh.count is only the
    // coordinator's item-domain bound here; ordinary Mesh rendering continues to use the exact
    // same fixed index and degenerate inactive quads as before.
    commitDynamicBufferOwner(owner, batch.position.count);
    return true;
  }
}
