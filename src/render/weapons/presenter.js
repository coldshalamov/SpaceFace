import * as THREE from 'three';
import {
  IMPACT_KIND,
  SURFACE_ROLE,
  WeaponDischargePool,
} from '../forceLanguage/weaponDischargePool.js';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { EnergyBoltPool } from './energyBoltPool.js';
import { WeaponRibbonPool } from './ribbonPool.js';
import { DistortionField } from './distortionField.js';
import { WeaponLightPool } from './weaponLights.js';
import { HullScorchPool, heatForWeaponVariant } from './contactMarks.js';
import { QuarksVfxSystem } from '../vfx/quarksSystem.js';
import { addShieldContact, ageShieldContacts, clearShieldContacts } from './shieldContacts.js';
import {
  shouldDrawTableVfx,
  tableLookAtDelta,
  tableVfxDrawWuFromState,
} from '../tabletopPolicy.js';
import {
  FLIGHT_MODE,
  WEAPON_SOCKET_NAME,
  flightColorsForEntity,
  recipeUsesSweptMuzzle,
  recipeUsesRibbonWake,
  resolveWeaponRecipe,
} from './recipes.js';
import { FIELD_DEFS, FIELD_KINDS, FIELD_MAX_ACTIVE } from '../../data/fields.js';

const _color = new THREE.Color();
const _local = { x: 0, z: 0 };
const _seen = new Set();
const _ribbonWorld = { x: 0, z: 0 };
const _ribbonLookAt = { x: 0, z: 0 };
const _offset = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const NEAR_MISS_RADIUS = 10;
const FULL_LOD_DISTANCE = 240;

// Impact point-light voice by weapon dialect: [peak, distance]. Heavy ordnance seats
// itself with a harder, wider beat across the target hull and nearby crags; light
// skirmish weapons stay small so dense exchanges do not wash the scene out.
const HIT_LIGHT_BY_VARIANT = Object.freeze({
  'thermal-bolt': Object.freeze([3.0, 16]),
  'concussion-slug': Object.freeze([3.6, 18]),
  'siege-lance': Object.freeze([4.2, 20]),
  torpedo: Object.freeze([3.4, 16]),
  missile: Object.freeze([3.0, 16]),
  railgun: Object.freeze([2.6, 14]),
  autocannon: Object.freeze([2.0, 12]),
  flak: Object.freeze([1.6, 10]),
  'pulse-bolt': Object.freeze([1.8, 12]),
  disruptor: Object.freeze([2.0, 12]),
  'continuous-beam': Object.freeze([1.6, 12]),
  'vector-mine': Object.freeze([2.6, 14]),
});

// Heavy dialects outrank skirmish fire for the 2-slot weapon light pool.
const HEAVY_LIGHT_VARIANTS = Object.freeze(new Set([
  'thermal-bolt',
  'concussion-slug',
  'siege-lance',
  'torpedo',
  'missile',
  'railgun',
]));

function hitLightForVariant(variant) {
  return HIT_LIGHT_BY_VARIANT[variant] || HIT_LIGHT_BY_VARIANT.autocannon;
}

// PQ-139.05 well refraction. DistortionField encodes UV offset as envelope * 0.035; at a later
// 1280px capture that maps the standard 190 WU / strength-240 well to ~11 px peak, localized to
// the projected field radius. The pass only composites when settings.video.renderGraph is true.
export const WELL_DISTORTION_CAPACITY = FIELD_MAX_ACTIVE;
export const WELL_DISTORTION_REF_RADIUS = FIELD_DEFS.well.radius;
export const WELL_DISTORTION_REF_STRENGTH = FIELD_DEFS.well.strength;
export const WELL_DISTORTION_REF_GPU_STRENGTH = 0.25;
export const WELL_DISTORTION_GPU_STRENGTH_MAX = 0.4;
export const DISTORTION_ENCODED_OFFSET_SCALE = 0.035;
export const WELL_DISTORTION_CAPTURE_WIDTH_PX = 1280;
const WELL_DISTORTION_Y = 0;

export function wellDistortionGpuStrength(radius, strength) {
  const r = Math.max(0, Number(radius) || 0);
  const s = Math.max(0, Number(strength) || 0);
  if (!(r > 0) || !(s > 0)) return 0;
  const mapped = WELL_DISTORTION_REF_GPU_STRENGTH
    * (s / WELL_DISTORTION_REF_STRENGTH)
    * (r / WELL_DISTORTION_REF_RADIUS);
  return mapped < WELL_DISTORTION_GPU_STRENGTH_MAX ? mapped : WELL_DISTORTION_GPU_STRENGTH_MAX;
}

export function wellDistortionPeakPx1280(radius, strength) {
  return wellDistortionGpuStrength(radius, strength)
    * DISTORTION_ENCODED_OFFSET_SCALE
    * WELL_DISTORTION_CAPTURE_WIDTH_PX;
}

function reducedMotionProfile(profile) {
  const id = profile && profile.id;
  return id === 'reduced-motion' || id === 'reduced-motion-and-flash';
}

function hexColor(hex, target) {
  target.set(hex || '#ffffff');
  return target;
}

function interpolate(prev, curr, alpha, key) {
  const a = Number.isFinite(alpha) ? alpha : 1;
  const c = curr && Number.isFinite(curr[key]) ? curr[key] : 0;
  const p = prev && Number.isFinite(prev[key]) ? prev[key] : c;
  return p + (c - p) * a;
}

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

export class WeaponVfxPresenter {
  constructor(options = {}) {
    this.scene = options.scene || null;
    this.state = options.state || null;
    this.helpers = options.helpers || {};
    this.toLocalXZ = typeof options.toLocalXZ === 'function'
      ? options.toLocalXZ
      : (x, z, out) => {
        const target = out || _local;
        target.x = x;
        target.z = z;
        return target;
      };
    this.bolts = new EnergyBoltPool(this.scene);
    this.discharges = new WeaponDischargePool(this.scene);
    // One resolver for the whole weapon-surface pool: source slots follow the firing socket,
    // impact slots re-lift their retained target-local contact each frame.
    this._dischargePoseResolver = (slot) => this._resolveSurfacePose(slot);
    this._dischargeLocal = { x: 0, z: 0 };
    this._dischargePose = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    this._impactPoseScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0, targetId: null, attached: false, slant: 0 };
    this.ribbons = new WeaponRibbonPool(this.scene);
    this.distortion = new DistortionField();
    this.wellDistortion = new DistortionField({ capacity: WELL_DISTORTION_CAPACITY });
    this.wellDistortion.mesh.name = 'SF_WellDistortion';
    this.wellDistortion.scene.name = 'SF_WellDistortionScene';
    this.distortionProducers = [this.distortion, this.wellDistortion];
    this.lights = new WeaponLightPool(this.scene);
    this.scorches = new HullScorchPool(this.scene);
    this.quarks = new QuarksVfxSystem({ scene: this.scene });
    this._socketScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    this._targetScratch = { x: 0, y: 0, z: 0, nx: 1, ny: 0, nz: 0, attached: false };
    this._targetWorldScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0, nx: 1, ny: 0, nz: 0 };
    this._surfacePoseScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    this._scorchPoseScratch = { x: 0, y: 0, z: 0, nx: 1, ny: 0, nz: 0 };
    this._nearMissPlayerLocal = { x: 0, z: 0 };
    this._nearMissLocal = { x: 0, z: 0 };
    this._lightCullWorld = { x: 0, z: 0 };
    this._lightCullLook = { x: 0, z: 0 };
    this._wellLocal = { x: 0, z: 0 };
    this._prevLocal = { x: 0, z: 0 };
    this._flightColors = { core: '#ffffff', sheath: '#ffffff' };
    this._boltSpec = {
      entityId: -1, x: 0, y: 0, z: 0, prevX: 0, prevY: 0, prevZ: 0,
      ax: 1, ay: 0, az: 0, length: 0, width: 0, intensity: 0, variant: 0,
      coreR: 1, coreG: 1, coreB: 1, sheathR: 1, sheathG: 1, sheathB: 1, minPixels: 0,
    };
    this._ribbonSpec = {
      entityId: -1, x: 0, y: 0, z: 0, width: 0, colorHead: '#ffffff', colorTail: '#ffffff', linger: 0,
    };
    this._nearMissSpec = { x: 0, y: 0.4, z: 0, radius: 5.5, strength: 0, life: 0.08 };
    this._flashScratch = { life: 0, size0: 0, size1: 0, opacity0: 0, opacity1: 0, r: 1, g: 1, b: 1 };
    this._scorchPoseCallback = (slot) => this._resolveScorchPose(slot);
    this._graph = null;
    this._disposed = false;
    this._nearMissAcc = 0;
  }

  attachGraph(graph) {
    if (this._graph && this._graph !== graph) this._detachGraph(this._graph);
    this._graph = graph || null;
    if (!graph) return;
    // Well refraction and weapon haze share one SpaceRenderGraph distortion pass. That pass is
    // only sampled when the live route attaches this graph (settings.video.renderGraph === true).
    if (typeof graph.attachDistortionProducers === 'function') {
      graph.attachDistortionProducers(this.distortionProducers);
    } else if (typeof graph.attachDistortionField === 'function') {
      graph.attachDistortionField(this.distortion);
    }
  }

  _detachGraph(graph) {
    if (!graph) return;
    if (typeof graph.attachDistortionProducers === 'function') {
      graph.attachDistortionProducers(null);
    }
    if (typeof graph.attachDistortionField === 'function') {
      graph.attachDistortionField(null);
    }
  }

  handleFire(payload, origin, angle, profile) {
    const recipe = resolveWeaponRecipe(payload && payload.weaponId, payload);
    if (!recipeUsesSweptMuzzle(recipe)) return false;
    const ownerId = payload && payload.ownerId;
    const pose = this._socketPose(ownerId, origin, angle);
    const muzzle = recipe.muzzle;
    const flash = this._flashSpec(muzzle.life, muzzle.width, muzzle.height, 1.35);
    hexColor(muzzle.coreColor, _color);
    // Muzzle and bore are one ignition beat in the source geometry; there is no second
    // stacked card. A missing/dead socket still yields a pose, so the source cannot vanish.
    this.discharges.spawn(recipe, pose, ownerId, flash,
      ownerId === this.state?.playerId ? 1 : 0.45);
    const a11y = this._a11y();
    if (muzzle.haze > 0 && a11y.id === 'full') {
      this.distortion.spawn({
        x: pose.x, y: pose.y, z: pose.z,
        radius: 3.2 + muzzle.haze * 2,
        strength: muzzle.haze,
        life: 0.1,
      });
    }
    const playerId = this.state && this.state.playerId;
    let priority = ownerId === playerId ? 1 : 0.45;
    if (HEAVY_LIGHT_VARIANTS.has(recipe.variant)) priority = Math.min(1, priority + 0.2);
    if (muzzle.lightPeak > 0 && a11y.eventLightPeakScale > 0
      && !this._lightCulled(origin && origin.x, origin && origin.z, priority)) {
      this.lights.spawn({
        x: pose.x, y: pose.y, z: pose.z,
        color: muzzle.lightColor,
        intensity: muzzle.lightPeak * a11y.eventLightPeakScale,
        distance: muzzle.lightDistance,
        life: Math.max(0.08, muzzle.life),
        priority,
      });
    }
    if (this.quarks && pose) {
      this.quarks.spawnMuzzle(
        pose.x, pose.y, pose.z,
        pose.ax, pose.ay, pose.az,
        recipe.flight.boltVariant,
        !!recipe.muzzle.casings,
      );
    }
    return true;
  }

  handleHit(payload, hitShield) {
    const recipe = resolveWeaponRecipe(payload && payload.weaponId, payload);
    const pos = payload && payload.pos;
    if (!pos) return { sparks: false };
    const world = this.toLocalXZ(pos.x, pos.z, _local);
    const nx = finiteOr(payload.normal && Number(payload.normal.x), 1);
    const nz = finiteOr(payload.normal && Number(payload.normal.z), 0);
    const ax = finiteOr(payload.approach && Number(payload.approach.x), -nx);
    const az = finiteOr(payload.approach && Number(payload.approach.z), -nz);
    const y = 0.35;
    const a11y = this._a11y();
    hexColor(hitShield ? '#5fd0ff' : recipe.muzzle.coreColor, _color);
    if (hitShield && recipe.shield.contact) {
      addShieldContact(payload.targetId, nx, 0.12, nz, 1);
      if (recipe.shield.surface) {
        const captured = this._captureTargetLocal(payload.targetId, world.x, y, world.z, nx, 0.1, nz);
        const impact = this._flashSpec(recipe.shield.life, 2.2, 2.2, 1.2);
        this._spawnImpactSurface(captured, IMPACT_KIND.SHIELD, recipe, impact, nx, nz, ax, az, payload.targetId);
      }
      if (recipe.shield.haze > 0 && a11y.id === 'full') {
        this.distortion.spawn({
          x: world.x, y, z: world.z,
          radius: 4.5,
          strength: recipe.shield.haze,
          life: 0.14,
        });
      }
    } else if (!hitShield && recipe.hull.surface) {
      const captured = this._captureTargetLocal(
        payload.targetId,
        world.x + nx * 0.4,
        y,
        world.z + nz * 0.4,
        nx, 0.06, nz,
      );
      const impact = this._flashSpec(0.14, 1.6, 2.8, 1.15);
      this._spawnImpactSurface(captured, IMPACT_KIND.HULL, recipe, impact, nx, nz, ax, az, payload.targetId);
    }
    if (!hitShield && recipe.hull.scorch) {
      const captured = this._captureTargetLocal(payload.targetId, world.x, y, world.z, nx, 0.08, nz);
      const scorch = this._flashSpec(recipe.hull.scorchLife, 1.8, 1.15, 1);
      this.scorches.spawn({
        targetId: payload.targetId,
        localX: captured.x,
        localY: captured.y,
        localZ: captured.z,
        nx: captured.nx,
        ny: captured.ny,
        nz: captured.nz,
        width: scorch.size0,
        height: scorch.size1,
        life: scorch.life,
        opacity: scorch.opacity0,
        heat: heatForWeaponVariant(recipe.variant),
        r: _color.r,
        g: _color.g,
        b: _color.b,
      });
    }
    if (a11y.eventLightPeakScale > 0) {
      const hitLight = hitLightForVariant(recipe.variant);
      let hitPriority = payload.targetId === (this.state && this.state.playerId) ? 0.9 : 0.4;
      if (HEAVY_LIGHT_VARIANTS.has(recipe.variant)) hitPriority = Math.min(1, hitPriority + 0.25);
      if (!this._lightCulled(pos.x, pos.z, hitPriority)) {
        this.lights.spawn({
          x: world.x, y, z: world.z,
          color: hitShield ? '#5fd0ff' : recipe.muzzle.lightColor,
          intensity: hitLight[0] * (hitShield ? 1.15 : 1) * a11y.eventLightPeakScale,
          distance: hitLight[1],
          life: 0.1,
          priority: hitPriority,
        });
      }
    }
    if (this.quarks) {
      this.quarks.spawnImpact(
        world.x, y, world.z,
        nx, 0.1, nz,
        !!hitShield,
        (recipe && recipe.flight && recipe.flight.boltVariant) || 0,
      );
    }
    return { sparks: !hitShield && recipe.hull.sparks };
  }

  update(dt, context = {}) {
    this.state = context.state || this.state;
    this.helpers = context.helpers || this.helpers;
    if (typeof context.toLocalXZ === 'function') this.toLocalXZ = context.toLocalXZ;
    const camera = context.camera;
    const alpha = Number.isFinite(context.interpolationAlpha) ? context.interpolationAlpha : 1;
    const viewportHeight = context.viewportHeight || 1000;
    const index = this.state && this.state.entityIndex;
    const entities = (index && index.__spacefaceEntityIndexV1 && Array.isArray(index.projectiles))
      ? index.projectiles
      : ((this.state && this.state.entityList) || []);
    ageShieldContacts(dt);
    const accessibilityProfile = this._a11y();
    this.discharges.update(dt, this._dischargePoseResolver, accessibilityProfile);
    this.bolts.setCamera(camera, viewportHeight);
    this.bolts.setDepthTexture(
      context.depthTexture || null,
      context.depthWidth,
      context.depthHeight,
    );
    this._syncBolts(entities, alpha, camera, dt, accessibilityProfile);
    this._updateNearMiss(dt, entities, alpha, camera);
    this.scorches.update(dt, this._scorchPoseCallback);
    this._syncWellDistortion();
    this.distortion.update(dt);
    this.lights.update(dt);
    this.ribbons.update(dt, camera && camera.position);
    if (this.quarks) this.quarks.update(dt);
  }

  _syncBolts(entities, alpha, camera, dt = 0, accessibilityProfile = this._a11y()) {
    this.bolts.beginFrame(dt, accessibilityProfile);
    _seen.clear();
    const camPos = camera && camera.position;
    const state = this.state;
    const playerId = state && state.playerId;
    const targetId = state && state.player && state.player.targetId;
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(playerId)
      : null;
    const ribbonDrawWu = tableVfxDrawWuFromState(state);
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity || !entity.alive || entity.type !== 'projectile') continue;
      const recipe = resolveWeaponRecipe(entity.data && entity.data.weaponId, entity.data);
      const prev = entity.prevPos || entity.pos;
      const currX = interpolate(prev, entity.pos, alpha, 'x');
      const currZ = interpolate(prev, entity.pos, alpha, 'z');
      const currLocal = this.toLocalXZ(currX, currZ, _local);
      const prevLocal = this.toLocalXZ(
        Number.isFinite(prev.x) ? prev.x : currX,
        Number.isFinite(prev.z) ? prev.z : currZ,
        this._prevLocal,
      );
      const y = 0.32;
      if (recipeUsesRibbonWake(recipe)) {
        _seen.add(entity.id);
        // Projectiles inherit PQ-126 ribbon priority from their owner: the player and current
        // target stay full even off-table. Every other wake follows the live look-at envelope.
        const priorityRibbon = (
          (playerId != null && (entity.id === playerId || entity.ownerId === playerId))
          || (targetId != null && (entity.id === targetId || entity.ownerId === targetId))
        );
        _ribbonWorld.x = currX;
        _ribbonWorld.z = currZ;
        const look = tableLookAtDelta(state, player && player.pos, _ribbonWorld, _ribbonLookAt);
        const ribbonOnTable = priorityRibbon
          || !player
          || shouldDrawTableVfx(look.x, look.z, ribbonDrawWu);
        if (ribbonOnTable) {
          if (!this.ribbons.byEntity.has(entity.id)) {
            flightColorsForEntity(recipe, entity, this._flightColors);
            const ribbon = this._ribbonSpec;
            ribbon.entityId = entity.id;
            ribbon.x = currLocal.x; ribbon.y = y; ribbon.z = currLocal.z;
            ribbon.width = recipe.flight.ribbonWidth;
            ribbon.colorHead = this._flightColors.core;
            ribbon.colorTail = this._flightColors.sheath;
            ribbon.linger = recipe.flight.ribbonLinger;
            this.ribbons.spawn(ribbon);
          }
          this.ribbons.pushHead(entity.id, currLocal.x, y, currLocal.z);
        } else {
          this.ribbons.release(entity.id);
        }
      }
      if (recipe.flight.mode !== FLIGHT_MODE.ENERGY_CARD) continue;
      const priorityBolt = (
        (playerId != null && (entity.id === playerId || entity.ownerId === playerId))
        || (targetId != null && (entity.id === targetId || entity.ownerId === targetId))
      );
      _ribbonWorld.x = currX;
      _ribbonWorld.z = currZ;
      const boltLook = tableLookAtDelta(state, player && player.pos, _ribbonWorld, _ribbonLookAt);
      if (!priorityBolt && player && !shouldDrawTableVfx(boltLook.x, boltLook.z, ribbonDrawWu)) continue;
      const rawVx = entity.vel && Number(entity.vel.x);
      const rawVz = entity.vel && Number(entity.vel.z);
      let vx = Number.isFinite(rawVx) ? rawVx : 0;
      let vz = Number.isFinite(rawVz) ? rawVz : 0;
      let speed = Math.hypot(vx, vz);
      if (speed < 1e-5) { vx = 1; vz = 0; speed = 1; }
      flightColorsForEntity(recipe, entity, this._flightColors);
      hexColor(this._flightColors.core, _color);
      const cr = _color.r; const cg = _color.g; const cb = _color.b;
      hexColor(this._flightColors.sheath, _color);
      const dist = camPos
        ? Math.hypot(camPos.x - currLocal.x, camPos.y - y, camPos.z - currLocal.z)
        : 80;
      const lodScale = dist > FULL_LOD_DISTANCE ? 0.92 : 1;
      const bolt = this._boltSpec;
      bolt.entityId = entity.id;
      bolt.x = currLocal.x; bolt.y = y; bolt.z = currLocal.z;
      bolt.prevX = prevLocal.x; bolt.prevY = y; bolt.prevZ = prevLocal.z;
      bolt.ax = vx / speed; bolt.ay = 0; bolt.az = vz / speed;
      bolt.length = recipe.flight.dashLength * lodScale;
      bolt.width = recipe.flight.width; bolt.intensity = recipe.flight.intensity;
      bolt.variant = recipe.flight.boltVariant;
      bolt.coreR = cr; bolt.coreG = cg; bolt.coreB = cb;
      bolt.sheathR = _color.r; bolt.sheathG = _color.g; bolt.sheathB = _color.b;
      bolt.minPixels = recipe.flight.pixelFloor;
      this.bolts.writeBolt(bolt);
    }
    for (const [entityId] of this.ribbons.byEntity) {
      if (!_seen.has(entityId)) this.ribbons.release(entityId);
    }
    this.bolts.commit();
  }

  _updateNearMiss(dt, entities, alpha, camera) {
    this._nearMissAcc += dt;
    if (this._nearMissAcc < 0.05) return;
    this._nearMissAcc = 0;
    if (this._a11y().id !== 'full') return;
    const player = this.state && this.state.entities && this.state.entities.get(this.state.playerId);
    if (!player || !player.pos) return;
    const pLocal = this.toLocalXZ(player.pos.x, player.pos.z, this._nearMissPlayerLocal);
    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      if (!entity || !entity.alive || entity.type !== 'projectile') continue;
      if (entity.ownerId === this.state.playerId) continue;
      const recipe = resolveWeaponRecipe(entity.data && entity.data.weaponId, entity.data);
      if (recipe.flight.mode === FLIGHT_MODE.NONE) continue;
      const currX = interpolate(entity.prevPos, entity.pos, alpha, 'x');
      const currZ = interpolate(entity.prevPos, entity.pos, alpha, 'z');
      const local = this.toLocalXZ(currX, currZ, this._nearMissLocal);
      const dist = Math.hypot(local.x - pLocal.x, local.z - pLocal.z);
      if (dist < NEAR_MISS_RADIUS && dist > 1.5) {
        this._nearMissSpec.x = local.x;
        this._nearMissSpec.z = local.z;
        this._nearMissSpec.strength = 0.55 * (1 - dist / NEAR_MISS_RADIUS);
        this.distortion.spawn(this._nearMissSpec);
        break;
      }
    }
  }

  _syncWellDistortion() {
    const field = this.wellDistortion;
    const slots = field.slots;
    let live = 0;
    if (!reducedMotionProfile(this._a11y())) {
      const active = this.state && this.state.fields && this.state.fields.active;
      if (active) {
        const cap = field.capacity;
        for (let i = 0; i < active.length && live < cap; i++) {
          const rec = active[i];
          if (!rec || rec.kind !== FIELD_KINDS.WELL) continue;
          const radius = rec.distortionRadius;
          const strength = rec.distortionStrength;
          if (!(radius > 0) || !(strength > 0)) continue;
          const local = this.toLocalXZ(rec.center.x, rec.center.z, this._wellLocal);
          const s = slots[live];
          s.alive = 1;
          s.x = local.x;
          s.y = WELL_DISTORTION_Y;
          s.z = local.z;
          s.radius = radius;
          s.strength = wellDistortionGpuStrength(radius, strength);
          s.life = Infinity;
          s.age = 0;
          live++;
        }
      }
    }
    for (let i = live; i < field.capacity; i++) slots[i].alive = 0;
    // The well lens is re-synced from scratch each frame, so dt is 0; hand it the simulation clock
    // directly or its shader has no time at all. Reduced motion already zeroes every well above.
    field.update(0, this.state && this.state.simTime);
  }

  _socketPose(ownerId, origin, angle) {
    const pose = this.helpers && this.helpers.socketWorldPose
      ? this.helpers.socketWorldPose(ownerId, WEAPON_SOCKET_NAME)
      : null;
    if (pose) {
      const local = this.toLocalXZ(pose.x, pose.z, _local);
      this._socketScratch.x = local.x;
      this._socketScratch.y = Number.isFinite(pose.y) ? pose.y : 0.4;
      this._socketScratch.z = local.z;
      this._socketScratch.ax = finiteOr(pose.forwardX, Math.cos(angle || 0));
      this._socketScratch.ay = finiteOr(pose.forwardY, 0);
      this._socketScratch.az = finiteOr(pose.forwardZ, Math.sin(angle || 0));
      return this._socketScratch;
    }
    const local = origin ? this.toLocalXZ(origin.x, origin.z, _local) : _local;
    this._socketScratch.x = local.x;
    this._socketScratch.y = 0.4;
    this._socketScratch.z = local.z;
    this._socketScratch.ax = Math.cos(angle || 0);
    this._socketScratch.ay = 0;
    this._socketScratch.az = Math.sin(angle || 0);
    return this._socketScratch;
  }

  _captureTargetLocal(targetId, worldX, worldY, worldZ, nx, ny, nz) {
    const mesh = targetId != null ? this._mesh(targetId) : null;
    const out = this._targetScratch;
    if (!mesh) {
      out.x = worldX; out.y = worldY; out.z = worldZ;
      out.nx = nx; out.ny = ny; out.nz = nz; out.attached = false;
      return out;
    }
    _offset.set(worldX - mesh.position.x, worldY - mesh.position.y, worldZ - mesh.position.z);
    _invQuat.copy(mesh.quaternion).invert();
    _offset.applyQuaternion(_invQuat);
    _axis.set(nx, ny, nz).applyQuaternion(_invQuat);
    out.x = _offset.x; out.y = _offset.y; out.z = _offset.z;
    out.nx = _axis.x; out.ny = _axis.y; out.nz = _axis.z; out.attached = true;
    return out;
  }

  /** Scorch marks are retained target-local; the contact normal rotates with the hull. */
  _worldFromTargetLocal(slot) {
    const mesh = slot.targetId != null ? this._mesh(slot.targetId) : null;
    const out = this._scorchPoseScratch;
    if (!mesh) {
      out.x = slot.localX; out.y = slot.localY; out.z = slot.localZ;
      out.nx = slot.nx; out.ny = slot.ny; out.nz = slot.nz;
      return out;
    }
    _offset.set(slot.localX, slot.localY, slot.localZ).applyQuaternion(mesh.quaternion);
    _offset.add(mesh.position);
    _axis.set(slot.nx, slot.ny, slot.nz).applyQuaternion(mesh.quaternion);
    out.x = _offset.x; out.y = _offset.y; out.z = _offset.z;
    out.nx = _axis.x; out.ny = _axis.y; out.nz = _axis.z;
    return out;
  }

  _spawnImpactSurface(captured, kind, recipe, flash, nx, nz, apx, apz, targetId) {
    const pose = this._impactPoseScratch;
    pose.x = captured.x; pose.y = captured.y; pose.z = captured.z;
    pose.ax = captured.nx; pose.ay = captured.ny; pose.az = captured.nz;
    pose.targetId = targetId != null ? targetId : null;
    pose.attached = captured.attached === true;
    // Signed lean of the incoming path around the outward normal: head-on hits keep a symmetric
    // fan, grazing hits smear it downrange. This is presentation, never a fabricated force axis.
    const into = apx * nx + apz * nz;
    const side = apx * nz - apz * nx;
    pose.slant = Math.atan2(side, Math.max(0.25, -into));
    flash.r = _color.r; flash.g = _color.g; flash.b = _color.b;
    const priority = targetId === (this.state && this.state.playerId) ? 0.9 : 0.4;
    this.discharges.spawnImpact(pose, kind, recipe.variant, flash, priority);
  }

  /** Source slots follow their firing socket; impact slots re-lift retained target-local hits. */
  _resolveSurfacePose(slot) {
    const cp = Math.cos(slot.pitch);
    const nx = cp * Math.cos(slot.angle);
    const ny = Math.sin(slot.pitch);
    const nz = cp * Math.sin(slot.angle);
    if (slot.role === SURFACE_ROLE.IMPACT) {
      const out = this._surfacePoseScratch;
      const mesh = slot.targetId != null ? this._mesh(slot.targetId) : null;
      if (slot.attached && !mesh) return null;
      if (!mesh) {
        out.x = slot.x; out.y = slot.y; out.z = slot.z;
        out.ax = nx; out.ay = ny; out.az = nz;
        return out;
      }
      _offset.set(slot.x, slot.y, slot.z).applyQuaternion(mesh.quaternion);
      _offset.add(mesh.position);
      _axis.set(nx, ny, nz).applyQuaternion(mesh.quaternion);
      out.x = _offset.x; out.y = _offset.y; out.z = _offset.z;
      out.ax = _axis.x; out.ay = _axis.y; out.az = _axis.z;
      return out;
    }
    if (slot.ownerId == null) return null;
    const socket = this.helpers && this.helpers.socketWorldPose
      ? this.helpers.socketWorldPose(slot.ownerId, WEAPON_SOCKET_NAME)
      : null;
    if (socket) {
      const local = this.toLocalXZ(socket.x, socket.z, this._dischargeLocal);
      const pose = this._dischargePose;
      pose.x = local.x; pose.y = finiteOr(socket.y, 0.4); pose.z = local.z;
      pose.ax = finiteOr(socket.forwardX, 1); pose.ay = finiteOr(socket.forwardY, 0);
      pose.az = finiteOr(socket.forwardZ, 0);
      return pose;
    }
    // Only the player's retained source may keep firing without a resolvable socket; a
    // dead/decorative owner is killed by the pool instead of sticking in mid-air.
    if (slot.ownerId !== this.state?.playerId) return null;
    const out = this._surfacePoseScratch;
    out.x = slot.x; out.y = slot.y; out.z = slot.z;
    out.ax = nx; out.ay = ny; out.az = nz;
    return out;
  }

  _resolveScorchPose(slot) {
    if (slot.targetId == null) {
      const out = this._scorchPoseScratch;
      out.x = slot.localX; out.y = slot.localY; out.z = slot.localZ;
      out.nx = slot.nx; out.ny = slot.ny; out.nz = slot.nz;
      return out;
    }
    return this._worldFromTargetLocal(slot);
  }

  _mesh(entityId) {
    const meshes = this.state && this.state.render && this.state.render.meshes;
    if (meshes && typeof meshes.get === 'function') return meshes.get(entityId);
    return null;
  }

  _a11y() {
    return resolveVfxAccessibilityProfile(this.state && this.state.settings);
  }

  // Early light cull: the 2-slot weapon pool is precious, so a light nobody can see is
  // never admitted. Player-involved beats always survive; everything else must sit inside
  // the live look-at envelope. Uncertain coordinates never cull.
  _lightCulled(worldX, worldZ, priority) {
    if (priority >= 0.9) return false;
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) return false;
    const state = this.state;
    const player = state && state.entities && typeof state.entities.get === 'function'
      ? state.entities.get(state.playerId)
      : null;
    if (!player || !player.pos) return false;
    this._lightCullWorld.x = worldX;
    this._lightCullWorld.z = worldZ;
    const look = tableLookAtDelta(state, player.pos, this._lightCullWorld, this._lightCullLook);
    return !shouldDrawTableVfx(look.x, look.z, tableVfxDrawWuFromState(state));
  }

  // Mining carves a molten work-face into the rock. Coordinates are frame-local, matching
  // the presenter's internal contact space; the caller converts from galactic-global.
  stampMiningScar(targetId, localX, localY, localZ, nx, ny, nz, size = 1.7, heat = 1.0) {
    const captured = this._captureTargetLocal(
      targetId,
      Number.isFinite(localX) ? localX : 0,
      Number.isFinite(localY) ? localY : 0.3,
      Number.isFinite(localZ) ? localZ : 0,
      Number.isFinite(nx) ? nx : 0,
      Number.isFinite(ny) ? ny : 1,
      Number.isFinite(nz) ? nz : 0,
    );
    const scorch = this._flashSpec(6.0, size, size * 0.72, 1);
    hexColor('#ff7a2a', _color);
    this.scorches.spawn({
      targetId: targetId != null ? targetId : null,
      localX: captured.x,
      localY: captured.y,
      localZ: captured.z,
      nx: captured.nx,
      ny: captured.ny,
      nz: captured.nz,
      width: scorch.size0,
      height: scorch.size1,
      life: scorch.life,
      opacity: scorch.opacity0,
      heat,
      r: _color.r,
      g: _color.g,
      b: _color.b,
    });
    return true;
  }

  _flashSpec(life, size0, size1, opacity) {
    const profile = this._a11y();
    const out = this._flashScratch;
    out.life = Math.max(Number(life) || 0, profile.flashMinLife);
    out.size0 = (Number(size0) || 0) * profile.flashSizeScale;
    out.size1 = (Number(size1) || 0) * profile.flashSizeScale;
    out.opacity0 = (Number(opacity) || 0) * profile.flashOpacityScale;
    out.opacity1 = out.opacity0;
    return out;
  }

  reproject(dx, dz) {
    const ox = Number(dx) || 0;
    const oz = Number(dz) || 0;
    if (!ox && !oz) return;
    this.discharges.reproject(ox, oz);
    for (const slot of this.scorches.slots) {
      if (!slot.alive) continue;
      if (slot.targetId != null) continue;
      slot.localX += ox;
      slot.localZ += oz;
    }
    for (const slot of this.distortion.slots) {
      if (!slot.alive) continue;
      slot.x += ox;
      slot.z += oz;
    }
    for (const slot of this.wellDistortion.slots) {
      if (!slot.alive) continue;
      slot.x += ox;
      slot.z += oz;
    }
    for (const slot of this.lights.slots) {
      slot.light.position.x += ox;
      slot.light.position.z += oz;
    }
    const hist = this.ribbons.hist;
    for (let i = 0; i < hist.length; i += 3) {
      hist[i] += ox;
      hist[i + 2] += oz;
    }
  }

  getMeshes() {
    return [this.bolts.mesh, this.discharges.mesh, this.ribbons.mesh, this.scorches.mesh];
  }

  /** Stable presenter-owned roots for scene residency/isolation checks. */
  getOwnerRoots() {
    return [
      this.bolts.mesh,
      this.discharges.mesh,
      this.ribbons.mesh,
      this.scorches.mesh,
      this.distortion.scene,
      this.wellDistortion.scene,
      this.lights.group,
    ];
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    this._detachGraph(this._graph);
    this._graph = null;
    clearShieldContacts();
    this.bolts.dispose();
    this.discharges.dispose();
    this.ribbons.dispose();
    this.distortion.dispose();
    this.wellDistortion.dispose();
    this.lights.dispose();
    this.scorches.dispose();
    if (this.quarks) this.quarks.dispose();
  }
}

export function createWeaponVfxPresenter(options) {
  return new WeaponVfxPresenter(options);
}
