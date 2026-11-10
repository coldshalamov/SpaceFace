// Render-only bridge from world entities / authored model sockets into NOCTURNE.
// Census is bounded and runs at 4 Hz. Hierarchies are inspected only when a model is admitted or
// replaced; frame updates touch admitted sources and their socket parent chains, never the scene.
import { Color, Vector3 } from 'three';
import {
  NOCTURNE_COMPOSITIONS, NOCTURNE_CONTENT_LIMITS, NOCTURNE_LAYOUTS,
  NOCTURNE_LIGHT_PROFILES, NOCTURNE_PROFILE_ALIASES, NOCTURNE_LUMINOUS_ASTEROID_TYPES,
} from '../../data/nocturneLighting.js';
import { NocturneProbes } from './probes.js';

const LIMIT = NOCTURNE_CONTENT_LIMITS;
const EMPTY = Object.freeze({});
const ZERO3 = Object.freeze([0, 0, 0]);
const TAU = Math.PI * 2;
const DARK_POWER = new Set(['off', 'offline', 'failed', 'destroyed', 'unpowered']);
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function finite(value, fallback = 0) { return Number.isFinite(value) ? value : fallback; }
function idHash(id) {
  const text = String(id); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return hash >>> 0;
}
function activeReactor(data) {
  if (data.reactorActive === true) return true;
  const reactor = data.unstableReactor;
  return reactor === true || !!(reactor && !reactor.vented && !reactor.burst && !reactor.towedClear);
}
function positionValid(entity) { return entity?.pos && Number.isFinite(entity.pos.x) && Number.isFinite(entity.pos.z); }
function worldRecordAlive(state, entity) {
  return entity?.alive !== false && (!state?.entities?.get || state.entities.get(entity.id) === entity);
}

/** Explicit metadata wins. Ordinary dark wrecks and rocks do not become luminous by proximity. */
export function resolveNocturneArchetype(entity) {
  if (!entity || entity.alive === false) return null;
  const data = entity.data || EMPTY;
  const declared = data.nocturne ?? entity.nocturne;
  if (declared === false || data.lightFixture === false || entity.lightFixture === false) return null;
  if (declared && typeof declared === 'object' && declared.enabled === false) return null;
  const override = typeof declared === 'string' ? declared : declared?.profile;
  if (override != null) return NOCTURNE_LAYOUTS[override] ? override : NOCTURNE_PROFILE_ALIASES[override] || null;
  const fixture = data.lightFixture ?? entity.lightFixture;
  if (typeof fixture === 'string') return NOCTURNE_LAYOUTS[fixture] ? fixture : NOCTURNE_PROFILE_ALIASES[fixture] || null;
  const type = entity.type;
  const name = String(data.archetypeGlb || data.stationTypeId || data.stationType || data.kind || entity.defId || data.defId || entity.kind || data.stationId || entity.id || '').toLowerCase();
  if (type === 'station' || type === 'structure' || type === 'poi') {
    const stationId = String(data.stationId || '').toLowerCase();
    // Native sector anchors use place_station_fab for factories, and Sker's physical package
    // is classed blackmarket. Preserve its authored industrial identity despite that package.
    if (/refiner|foundry|forge|smelt|industrial|factory|shipyard|sker|yard|(?:^|_)fab(?:_|$)/.test(name)
      || stationId === 'station_sker' || stationId === 'station_forge' || stationId === 'station_vesta_outlying_yard') return 'industrial';
    if (/research|laborator|science/.test(name)) return 'research';
    if (/military|security|patrol|customs/.test(name)) return 'security';
    if (/gate|transit/.test(name)) return 'gate';
    if (/alien|organism|infest|hive|biolumin/.test(name)) return data.luminous === false ? null : 'alien';
    return type === 'station' ? 'dock' : null;
  }
  if (type === 'gate') return 'gate';
  if (type === 'wreck' || type === 'derelict' || data.derelict === true) {
    return activeReactor(data) || data.emergencyLight === true
      || data.lightFixture === 'warning' || data.lightFixture === 'reactor' ? 'derelict' : null;
  }
  if (type === 'asteroid') return data.oreGlow === true || data.luminous === true
    || NOCTURNE_LUMINOUS_ASTEROID_TYPES.includes(entity.defId || data.defId) ? 'ore' : null;
  if (type === 'pickup' && data.ventedCore === true) return 'core';
  if (type === 'anomaly' || type === 'fauna' || type === 'organism') {
    if (data.ecology?.disguised === true || data.luminous === false) return null;
    return data.luminous === true || data.bioluminescent === true || /hive|infest|biolumin/.test(name)
      || type === 'fauna' && typeof data.ecology?.speciesId === 'string' ? 'alien' : null;
  }
  if (type === 'ship' && !entity.docked && !entity.derelict && !data.derelict) return 'ship';
  return null;
}

/** Bounded validation for authoring tools. Errors mean reject the entry, not invent defaults. */
export function validateNocturneLightMetadata(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['light descriptor must be an object'];
  if (typeof value.profile !== 'string' || !NOCTURNE_LIGHT_PROFILES[value.profile]) errors.push('unknown light profile');
  if (value.id != null && (typeof value.id !== 'string' || !value.id.trim())) errors.push('id must be a non-empty string');
  if (value.socket != null && (typeof value.socket !== 'string' || !value.socket.trim())) errors.push('socket must be a non-empty node name');
  for (const field of ['offset', 'aim']) {
    if (value[field] != null && (!Array.isArray(value[field]) || value[field].length !== 3
      || value[field].some((n) => !Number.isFinite(n) || Math.abs(n) > 10000))) errors.push(`${field} must contain three bounded finite coordinates`);
  }
  for (const [key, min, max] of [['intensity', 0, 1000000], ['range', 0, 4000], ['priority', 0, 4]]) {
    if (value[key] != null && (!Number.isFinite(value[key]) || value[key] < min || value[key] > max)) errors.push(`${key} outside authoring bounds`);
  }
  if (value.range != null && value.range === 0) errors.push('range must be greater than zero');
  if (value.priority != null && !Number.isInteger(value.priority)) errors.push('priority must be an integer');
  for (const field of ['enabled', 'shadow', 'requiresOcclusion', 'critical']) {
    if (value[field] != null && typeof value[field] !== 'boolean') errors.push(`${field} must be boolean`);
  }
  return errors;
}

export function validateNocturneMediumMetadata(value) {
  if (value === false) return [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return ['medium descriptor must be an object or false'];
  const errors = [];
  if (!Array.isArray(value.radii) || value.radii.length !== 3
    || value.radii.some((n) => !Number.isFinite(n) || n <= 0 || n > 20)) errors.push('medium radii must be three positive radius multipliers at most 20');
  if (!Number.isFinite(value.density) || value.density < 0 || value.density > 0.05) errors.push('medium density outside authoring bounds');
  if (value.anisotropy != null && (!Number.isFinite(value.anisotropy) || value.anisotropy < -0.5 || value.anisotropy > 0.7)) errors.push('medium anisotropy outside authoring bounds');
  return errors;
}

function attachmentVisible(node, root) {
  if (!node) return true;
  let reached = false;
  for (let p = node; p; p = p.parent) {
    if (p === root) { reached = true; break; }
    // Empty socket markers may deliberately hide themselves; hidden LOD parents may not.
    if (p.visible === false && (p !== node || p.isMesh)) return false;
  }
  return reached;
}

function bindingsVisible(record) {
  for (const entry of record.lights) if (entry.socket && !attachmentVisible(entry.socket, record.root)) return false;
  return true;
}

function emissiveMaterial(node) {
  const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : null;
  if (!materials) return null;
  for (const material of materials) {
    if (material?.emissive && finite(material.emissiveIntensity, 1) > 0.05
      && material.emissive.r + material.emissive.g + material.emissive.b > 0.03) return material;
    if (material?.isMeshBasicMaterial && material.color && /emissive|lamp|light|glow|drive.core/i.test(node.name || material.name || '')) return material;
  }
  return null;
}

function inspectRoot(root) {
  const nodes = new Map(); const emitters = []; const declared = [];
  if (root?.traverse) root.traverse((node) => {
    if (!attachmentVisible(node, root)) return;
    if (node.name) nodes.set(node.name, node);
    const metadata = node.userData?.nocturneLight;
    if (metadata) {
      const descriptor = typeof metadata === 'string' ? { profile: metadata } : metadata;
      if (validateNocturneLightMetadata(descriptor).length === 0) declared.push({ ...descriptor, node, authored: true });
    }
    if (node.isMesh && emissiveMaterial(node)) {
      const material = emissiveMaterial(node);
      const center = new Vector3();
      if (node.geometry?.boundingSphere) center.copy(node.geometry.boundingSphere.center);
      else if (node.geometry?.boundingBox) node.geometry.boundingBox.getCenter(center);
      emitters.push({ node, center, material, baseIntensity: finite(material.emissiveIntensity, 1), color: material.emissive || material.color });
    }
  });
  return { nodes, emitters, declared };
}

function profileFor(archetype) {
  if (archetype === 'industrial') return NOCTURNE_COMPOSITIONS.industrial;
  if (archetype === 'derelict') return NOCTURNE_COMPOSITIONS.derelict;
  if (archetype === 'alien') return NOCTURNE_COMPOSITIONS.alien;
  return null;
}

export class NocturneContent {
  constructor(registry, options = EMPTY) {
    if (!registry?.register || !registry?.unregister) throw new TypeError('NocturneContent requires a source registry');
    this.registry = registry;
    this.maxOwners = Math.max(1, Math.min(LIMIT.maxOwners, options.maxOwners || LIMIT.maxOwners));
    this.maxSources = Math.max(1, Math.min(LIMIT.maxSources, options.maxSources || LIMIT.maxSources));
    this.records = new Map();
    this.sourceCount = 0;
    this._candidateEntity = new Array(this.maxOwners).fill(null);
    this._candidateRoot = new Array(this.maxOwners).fill(null);
    this._candidateArchetype = new Array(this.maxOwners).fill(null);
    this._candidateDistance = new Float64Array(this.maxOwners);
    this._candidateCount = 0;
    this._clock = LIMIT.censusSeconds;
    this._time = 0;
    this._generation = 0;
    this._local = { x: 0, z: 0 };
    this._direction = new Vector3();
    this._center = new Vector3();
    this._radii = new Vector3();
    this._sourcePosition = new Vector3();
    this._sourceTarget = new Vector3();
    this.probes = new NocturneProbes();
    this.media = [];
    this._mediaPool = Array.from({ length: Math.min(LIMIT.maxMedia, options.maxMedia || LIMIT.maxMedia) }, (_, i) => ({
      id: `nocturne-medium-${i}`, center: new Vector3(), radii: new Vector3(1, 1, 1),
      density: 0, color: new Color(), anisotropy: 0, extinction: 1, noise: 0,
    }));
    this.compositionId = 'vacuum';
    this.exposureTarget = 1;
    this.exposureRange = [0.85, 1.05];
    this.casterEpoch = 0;
    this._casterHash = 0;
    this.diagnostics = { owners: 0, sources: 0, invalidDescriptors: 0, missingEmitters: 0, rejectedCapacity: 0, census: 0 };
  }

  _remove(record, options = EMPTY) {
    for (const entry of record.lights) this.registry.unregister(entry.id);
    this.sourceCount -= record.lights.length;
    this.records.delete(record.entity.id);
    if (record.root) this.probes.unbindReflection(record.root, options);
  }

  _admit(entity, root, archetype) {
    const data = entity.data || EMPTY;
    const meta = root?.userData?.nocturne || data.nocturne || EMPTY;
    if (meta === false || meta.enabled === false) return null;
    const inspected = inspectRoot(root);
    let definitions = Array.isArray(meta.lights) ? meta.lights : NOCTURNE_LAYOUTS[archetype];
    if (inspected.declared.length) definitions = inspected.declared;
    const explicit = Array.isArray(meta.lights) || inspected.declared.length > 0;
    const mediumValid = meta.medium == null || validateNocturneMediumMetadata(meta.medium).length === 0;
    if (!mediumValid) this.diagnostics.invalidDescriptors++;
    const record = { entity, root, archetype, generation: this._generation, lights: [], mediumId: `nocturne-medium:${entity.id}`,
      composition: profileFor(archetype), radius: Math.max(LIMIT.minimumFixtureRadius, finite(entity.radius, 20)),
      phase: (idHash(entity.id) % 4096) / 4096, medium: mediumValid ? meta.medium ?? null : false, children: root?.children?.length || 0 };
    const usedEmitters = new Set();
    for (let i = 0; i < (definitions?.length || 0) && i < LIMIT.maxLightsPerOwner; i++) {
      const definition = definitions[i];
      if (validateNocturneLightMetadata(definition).length) { this.diagnostics.invalidDescriptors++; continue; }
      if (this.sourceCount >= this.maxSources) { this.diagnostics.rejectedCapacity++; break; }
      const profile = NOCTURNE_LIGHT_PROFILES[definition.profile];
      let socket = definition.node || null;
      if (!socket && definition.socket) socket = inspected.nodes.get(definition.socket) || null;
      if (!socket && definition.sockets) {
        for (const name of definition.sockets) { socket = inspected.nodes.get(name); if (socket) break; }
      }
      // A declared named socket must resolve exactly. Never place it silently at the hull origin.
      if (definition.socket && !socket) { this.diagnostics.missingEmitters++; continue; }
      let emitter = null;
      if (socket && !explicit) {
        // A named socket can be the actual lamp mesh. Reserve it so a later fallback cannot
        // duplicate that same bulb, and observe its authored material power/color changes.
        for (const candidate of inspected.emitters) {
          if (candidate.node === socket) emitter = candidate;
          for (let node = candidate.node; node && node !== root; node = node.parent) {
            if (node === socket) { usedEmitters.add(candidate); break; }
          }
        }
      }
      if (!socket && !explicit) {
        const desired = new Color(profile.color);
        let best = Infinity;
        for (const candidate of inspected.emitters) {
          if (usedEmitters.has(candidate)) continue;
          const c = candidate.color;
          const total = Math.max(0.01, c.r + c.g + c.b);
          const target = Math.max(0.01, desired.r + desired.g + desired.b);
          const difference = Math.abs(c.r / total - desired.r / target)
            + Math.abs(c.g / total - desired.g / target) + Math.abs(c.b / total - desired.b / target);
          if (difference < best) { best = difference; emitter = candidate; }
        }
        // Automatic profiles never invent bulbs on dark geometry.
        if (!emitter) { this.diagnostics.missingEmitters++; continue; }
        usedEmitters.add(emitter);
        socket = emitter.node;
      }
      if (!root && !explicit) continue;
      const id = `nocturne:entity:${entity.id}:${definition.id || i}`;
      const source = this.registry.register(id, {
        ...profile, ...(explicit ? definition : EMPTY), type: profile.type,
        priority: definition.priority ?? profile.priority, enabled: false,
        stationary: entity.type !== 'ship', damage: 0, power: 1,
        // Content writes already interpolated frame-local socket poses, so the registry must
        // not also transform an owner/socket a second time.
      });
      if (!source) { this.diagnostics.rejectedCapacity++; continue; }
      const entry = { id, source, definition, profile, socket, emitter, explicit,
        baseColor: emitter ? emitter.color.clone() : new Color(profile.color), hotColor: new Color(0xff5a23),
        intensity: finite(definition.intensity, profile.intensity), range: finite(definition.range, profile.range) };
      record.lights.push(entry);
      this.sourceCount++;
    }
    if (meta.reflection?.texture?.isTexture && root) this.probes.bindReflection(root, meta.reflection.texture, meta.reflection.intensity);
    this.records.set(entity.id, record);
    return record;
  }

  _census(state, meshes, center) {
    this.diagnostics.census++;
    this._generation++;
    this._candidateCount = 0;
    let casterHash = 2166136261;
    const list = state.entityList || state.entities?.values?.();
    if (!list || !center) return;
    const reach2 = LIMIT.reach * LIMIT.reach;
    for (const entity of list) {
      if (!positionValid(entity) || entity.alive === false) continue;
      const dx = entity.pos.x - center.x, dz = entity.pos.z - center.z;
      const d2 = dx * dx + dz * dz;
      if (d2 > reach2) continue;
      if (entity.collides !== false && /^(ship|station|asteroid|wreck|structure|gate)$/.test(entity.type)) {
        casterHash = Math.imul(casterHash ^ idHash(entity.id), 16777619);
        casterHash = Math.imul(casterHash ^ Math.round(entity.pos.x * 4), 16777619);
        casterHash = Math.imul(casterHash ^ Math.round(entity.pos.z * 4), 16777619);
        casterHash = Math.imul(casterHash ^ Math.round(finite(entity.rot) * 100), 16777619);
      }
      const root = meshes?.get?.(entity.id) || null;
      const rootMeta = root?.userData?.nocturne;
      if (rootMeta === false || rootMeta?.enabled === false || root?.visible === false) continue;
      const archetype = typeof rootMeta?.profile === 'string'
        ? NOCTURNE_PROFILE_ALIASES[rootMeta.profile] || (NOCTURNE_LAYOUTS[rootMeta.profile] ? rootMeta.profile : null)
        : resolveNocturneArchetype(entity);
      if (!archetype && !rootMeta?.lights && !entity.data?.nocturne?.lights) continue;
      // The player's primary drive is already declared by the live plume's event owner.
      // Nav lights still belong here; filter only its drive descriptor below during update.
      let at = this._candidateCount;
      const score = d2 * (archetype === 'ship' ? 1.7 : 1);
      while (at > 0 && this._candidateDistance[at - 1] > score) at--;
      if (at >= this.maxOwners) continue;
      for (let j = Math.min(this._candidateCount, this.maxOwners - 1); j > at; j--) {
        this._candidateEntity[j] = this._candidateEntity[j - 1]; this._candidateRoot[j] = this._candidateRoot[j - 1];
        this._candidateArchetype[j] = this._candidateArchetype[j - 1]; this._candidateDistance[j] = this._candidateDistance[j - 1];
      }
      this._candidateEntity[at] = entity; this._candidateRoot[at] = root;
      this._candidateArchetype[at] = archetype || 'dock'; this._candidateDistance[at] = score;
      if (this._candidateCount < this.maxOwners) this._candidateCount++;
    }
    if (casterHash !== this._casterHash) { this.casterEpoch++; this._casterHash = casterHash; }
    // Remove vacancies before admissions so a moving camera never starves at the capacity limit.
    for (const record of this.records.values()) {
      let retained = false;
      for (let i = 0; i < this._candidateCount; i++) if (this._candidateEntity[i] === record.entity
        && this._candidateRoot[i] === record.root && this._candidateArchetype[i] === record.archetype
        && (record.root?.children?.length || 0) === record.children && bindingsVisible(record)) { retained = true; break; }
      if (!retained) this._remove(record);
    }
    for (let i = 0; i < this._candidateCount; i++) {
      const entity = this._candidateEntity[i];
      if (!this.records.has(entity.id)) this._admit(entity, this._candidateRoot[i], this._candidateArchetype[i]);
    }
    for (let i = this._candidateCount; i < this.maxOwners; i++) { this._candidateEntity[i] = null; this._candidateRoot[i] = null; }
    this.diagnostics.owners = this.records.size;
    this.diagnostics.sources = this.sourceCount;
  }

  _power(entity) {
    const data = entity.data || EMPTY;
    if (entity.alive === false || data.disabled === true || data.powered === false || DARK_POWER.has(data.powerState)) return 0;
    return clamp01(finite(data.lightPower, finite(data.powerLevel, 1)));
  }

  _pose(record, entry, membrane) {
    const { source, definition, socket, emitter } = entry;
    const root = record.root;
    if (socket) {
      socket.updateWorldMatrix?.(true, false);
      if (emitter) this._sourcePosition.copy(emitter.center);
      else if (entry.explicit && definition.offset) this._sourcePosition.fromArray(definition.offset);
      else this._sourcePosition.set(0, 0, 0);
      if (socket.localToWorld) socket.localToWorld(this._sourcePosition);
      else this._sourcePosition.copy(socket.position);
    } else {
      const offset = definition.offset || ZERO3;
      if (root) {
        root.updateWorldMatrix?.(true, false);
        this._sourcePosition.fromArray(offset);
        root.localToWorld(this._sourcePosition);
      } else {
        membrane?.toLocal?.(record.entity.pos, this._local);
        this._sourcePosition.set(this._local.x + offset[0], offset[1], this._local.z + offset[2]);
      }
    }
    source.position.copy(this._sourcePosition);
    const aim = definition.aim;
    if (aim && root) {
      // Automatic layouts use physical-radius aims in the root's yaw frame. Authored aims use
      // model-local WU and the complete transform so scale/animation is respected.
      if (entry.explicit) { this._sourceTarget.fromArray(aim); root.localToWorld(this._sourceTarget); }
      else {
        this._sourceTarget.fromArray(aim).multiplyScalar(record.radius).applyQuaternion(root.quaternion).add(root.position);
      }
    } else if (socket && (source.type === 'spot' || source.type === 'area')) {
      this._sourceTarget.set(1, -0.35, 0);
      this._sourceTarget.transformDirection(socket.matrixWorld).multiplyScalar(100).add(source.position);
    } else this._sourceTarget.copy(source.position).add(this._direction.set(0, -1, 0));
    source.target.copy(this._sourceTarget);
  }

  update(state, dt, membrane, options = EMPTY) {
    const step = Math.max(0, Math.min(0.25, finite(dt)));
    this._time += step;
    this._clock += step;
    const player = state?.entities?.get?.(state.playerId);
    const center = player?.pos || options.center || null;
    if (this._clock >= LIMIT.censusSeconds) { this._clock = 0; this._census(state, options.meshes, center); }
    const time = finite(state?.simTime, this._time);
    const reduced = options.reducedFlash === true;
    let dominant = state?.run?.phase === 'active' ? NOCTURNE_COMPOSITIONS.combat : NOCTURNE_COMPOSITIONS.vacuum;
    let dominantDistance = Infinity;
    this.media.length = 0;
    this.probes.begin(options.camera);
    for (let ownerIndex = 0; ownerIndex < this._candidateCount; ownerIndex++) {
      const record = this.records.get(this._candidateEntity[ownerIndex]?.id);
      if (!record) continue;
      const entity = record.entity;
      if (!worldRecordAlive(state, entity)) { this._remove(record); continue; }
      const data = entity.data || EMPTY;
      const power = this._power(entity);
      const damage = entity.hullMax > 0 ? clamp01(1 - finite(entity.hull, entity.hullMax) / entity.hullMax) : 0;
      const visible = !record.root || record.root.visible !== false && record.root.parent != null;
      for (const entry of record.lights) {
        const source = entry.source;
        const definition = entry.definition;
        const profile = entry.profile;
        this._pose(record, entry, membrane);
        let active = visible && power > 0 && definition.enabled !== false;
        if (entry.socket && !attachmentVisible(entry.socket, record.root)) active = false;
        if (definition.condition === 'emergency') active &&= data.emergencyLight === true || data.lightFixture === 'warning'
          || data.powerState === 'emergency' || data.emergency === true;
        if (definition.condition === 'reactor') active &&= activeReactor(data) || data.lightFixture === 'reactor';
        if (entity.id === state.playerId && definition.id === 'drive' && !entry.explicit) active = false;
        if (record.archetype === 'ship' && (entity.docked || entity.derelict || data.derelict)) active = false;
        if (record.archetype === 'alien' && data.ecology?.disguised === true) active = false;
        let level = 1;
        const response = definition.response || profile.response;
        if (response === 'cooling') active &&= finite(data.cooledAt, Infinity) > time;
        if (response === 'thrust') {
          const thrust = finite(data.thrust, finite(entity.thrust, Math.hypot(finite(entity.vel?.x), finite(entity.vel?.z)) / 120));
          level = 0.2 + 0.8 * clamp01(thrust);
        } else if (response === 'growth') level = 0.35 + 0.65 * clamp01(finite(data.growth, finite(data.biomassFraction, 1)));
        else if (response === 'process') level = data.productionPaused === true || data.operational === false ? 0 : 1;
        const heat = clamp01(finite(data.heatFraction, entity.heatMax > 0 ? finite(entity.heat) / entity.heatMax : data.overheating === true ? 1 : 0));
        if (response === 'heat') level *= 0.75 + 0.65 * heat;
        const phase = record.phase + finite(definition.phase, finite(profile.phase));
        if (!reduced && profile.rhythm === 'emergency') level *= 0.28 + 0.72 * Math.pow(0.5 + 0.5 * Math.sin(TAU * (time * 0.8 + phase)), 4);
        if (!reduced && profile.rhythm === 'navigation') level *= 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(TAU * (time * 0.7 + phase)), 8);
        if (!reduced && profile.rhythm === 'breath') level *= 0.76 + 0.24 * Math.sin(TAU * (time * 0.16 + phase));
        source.enabled = active;
        source.power = power;
        // Emergency batteries retain their authored warning output as the main hull fails.
        source.damage = definition.condition === 'emergency' ? 0 : damage * 0.8;
        if (entry.emitter?.material?.emissive && entry.emitter.baseIntensity > 0) {
          level *= Math.max(0, finite(entry.emitter.material.emissiveIntensity, 1)) / entry.emitter.baseIntensity;
        }
        source.intensity = entry.intensity * level;
        source.range = entry.range;
        source.color.copy(entry.emitter?.material?.emissive || entry.baseColor);
        if (heat > 0.7 && response !== 'growth') source.color.lerp(entry.hotColor, (heat - 0.7) * 0.75);
      }
      const composition = record.composition;
      // Authored atmosphere follows actual industrial/biological geometry; wreck smoke requires
      // a live reactor or explicit smoke/medium tag. No blanket sector fog, including combat.
      let hasEmission = false;
      for (const entry of record.lights) if (entry.source.enabled && entry.source.intensity > 0
        && entry.source.power > 0 && entry.source.damage < 1) { hasEmission = true; break; }
      if (!composition || !visible || !hasEmission) continue;
      if (record.root) this._center.copy(record.root.position);
      else { membrane?.toLocal?.(entity.pos, this._local); this._center.set(this._local.x, 0, this._local.z); }
      const d2 = center ? (entity.pos.x - center.x) ** 2 + (entity.pos.z - center.z) ** 2 : Infinity;
      if (d2 < dominantDistance && d2 < (record.radius * 2.5 + 100) ** 2) { dominantDistance = d2; dominant = composition; }
      const mediumProfile = record.medium != null ? record.medium : composition.medium;
      const allowedMedium = (record.archetype !== 'derelict' || data.smoke === true || activeReactor(data) || record.medium)
        && (entity.type !== 'fauna' || data.smoke === true || data.gas === true || data.sporeDensity > 0 || record.medium);
      if (mediumProfile && allowedMedium && this.media.length < this._mediaPool.length) {
        const medium = this._mediaPool[this.media.length];
        medium.id = record.mediumId;
        medium.center.copy(this._center);
        if (mediumProfile.radii) medium.radii.fromArray(mediumProfile.radii).multiplyScalar(record.radius);
        else medium.radii.setScalar(record.radius);
        medium.density = Math.max(0, finite(mediumProfile.density)) * (record.archetype === 'alien' ? 0.5 + 0.5 * clamp01(finite(data.growth, 1)) : 1);
        medium.color.set(mediumProfile.color ?? 0xffffff);
        medium.anisotropy = Math.max(-0.5, Math.min(0.7, finite(mediumProfile.anisotropy)));
        medium.extinction = Math.max(0, finite(mediumProfile.extinction, 1));
        medium.noise = clamp01(finite(mediumProfile.noise));
        this.media.push(medium);
      }
      const probe = composition.probe;
      if (probe) {
        this._radii.fromArray(probe.radii).multiplyScalar(record.radius);
        this._direction.fromArray(probe.direction);
        if (record.root) this._direction.applyQuaternion(record.root.quaternion);
        this.probes.write(this._center, this._radii, probe, power * (1 - damage), this._direction);
      }
    }
    this.probes.end();
    this.compositionId = dominant.id;
    this.exposureTarget = dominant.exposure;
    this.exposureRange[0] = dominant.exposureRange[0]; this.exposureRange[1] = dominant.exposureRange[1];
    this.diagnostics.owners = this.records.size; this.diagnostics.sources = this.sourceCount;
    return this;
  }

  /** Model streaming/replacement can invalidate an admitted root without a scene-wide walk. */
  invalidateRoot(root) {
    for (const record of this.records.values()) if (record.root === root) this._remove(record);
    this._clock = LIMIT.censusSeconds;
    this.casterEpoch++;
  }
  clear(options = EMPTY) {
    for (const record of this.records.values()) this._remove(record, options);
    this._candidateEntity.fill(null); this._candidateRoot.fill(null);
    this.media.length = 0; this.probes.clear(); this._clock = LIMIT.censusSeconds;
    this.compositionId = 'vacuum'; this.exposureTarget = 1;
    this.exposureRange[0] = 0.85; this.exposureRange[1] = 1.05;
    this.casterEpoch++;
  }
  dispose(options = EMPTY) { this.clear(options); this.probes.dispose(options); }
}
