const DEFAULT_MAX_BEAMS = 16;
const DEFAULT_TIMEOUT_S = 0.14;

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
  return { geometry, positions, colors, position, color };
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
      lastSeen: -Infinity,
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
  }

  upsert(payload, timeS, profile = null) {
    const key = beamKey(payload);
    const from = payload && (payload.from || payload.origin);
    const to = payload && payload.to;
    if (!key || !from || !to) return false;
    let entry = this._byKey.get(key);
    if (!entry) {
      entry = this._claimEntry(key);
      this.startCount++;
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
    this._color.set(colorValue(profile && profile.coreColor, 0xffffff));
    entry.coreR = this._color.r;
    entry.coreG = this._color.g;
    entry.coreB = this._color.b;
    this._writeSlotColor(this._coreBatch, entry.slot, entry.coreR, entry.coreG, entry.coreB);
    this._color.set(colorValue(profile && profile.accentColor, 0x66ccff));
    entry.haloR = this._color.r;
    entry.haloG = this._color.g;
    entry.haloB = this._color.b;
    this._writeSlotColor(this._haloBatch, entry.slot, entry.haloR, entry.haloG, entry.haloB);
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

  stop(payload) {
    const key = beamKey(payload);
    const entry = key ? this._byKey.get(key) : null;
    if (!entry) return false;
    this._release(entry);
    return true;
  }

  update(timeS, toLocal, accessibility = null) {
    const localize = typeof toLocal === 'function' ? toLocal : identityLocal;
    const now = finite(timeS, 0);
    const reducedFlash = !!(accessibility && (
      accessibility.reducedFlash || accessibility.flashOpacityScale < 1
    ));
    let matricesChanged = false;
    for (let entryIndex = 0; entryIndex < this._entries.length; entryIndex++) {
      const entry = this._entries[entryIndex];
      if (!entry.active) continue;
      if (now - entry.lastSeen > this.timeoutS) {
        this._release(entry);
        matricesChanged = true;
        continue;
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
      const width = (reducedFlash ? 0.36 : 0.52) * entry.widthMul;
      this._writeSlotQuad(this._coreBatch, entry.slot, ax, az, bx, bz, entry.y, width, length);
      this._writeSlotQuad(this._haloBatch, entry.slot, ax, az, bx, bz, entry.y - 0.01, width * 2.8, length);
      matricesChanged = true;
    }
    if (matricesChanged) {
      this._coreBatch.position.needsUpdate = true;
      this._haloBatch.position.needsUpdate = true;
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
    this.activeCount = Math.max(0, this.activeCount - 1);
    this._clearSlot(this._coreBatch, entry.slot);
    this._clearSlot(this._haloBatch, entry.slot);
    this.group.visible = this.activeCount > 0;
  }

  _writeSlotColor(batch, slot, r, g, b) {
    const start = slot * 12;
    for (let vertex = 0; vertex < 4; vertex++) {
      const offset = start + vertex * 3;
      batch.colors[offset] = r;
      batch.colors[offset + 1] = g;
      batch.colors[offset + 2] = b;
    }
    batch.color.needsUpdate = true;
  }

  _writeSlotQuad(batch, slot, ax, az, bx, bz, y, width, length) {
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
  }

  _clearSlot(batch, slot) {
    const start = slot * 12;
    batch.positions.fill(0, start, start + 12);
    batch.position.needsUpdate = true;
  }
}
