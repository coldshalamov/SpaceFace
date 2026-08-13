import * as THREE from 'three';
import { resolveVfxAccessibilityProfile } from '../vfxAccessibility.js';
import { EnergyBoltPool } from './energyBoltPool.js';
import { FlipbookPool, FLIPBOOK_ROLE } from './flipbookPool.js';
import { WeaponRibbonPool } from './ribbonPool.js';
import { DistortionField } from './distortionField.js';
import { WeaponLightPool } from './weaponLights.js';
import { HullScorchPool } from './contactMarks.js';
import { addShieldContact, ageShieldContacts, clearShieldContacts } from './shieldContacts.js';
import {
  FLIGHT_MODE,
  WEAPON_SOCKET_NAME,
  flightColorsForEntity,
  recipeUsesMuzzleFlipbook,
  recipeUsesRibbonWake,
  resolveWeaponRecipe,
} from './recipes.js';

const _color = new THREE.Color();
const _local = { x: 0, z: 0 };
const _seen = new Set();
const _offset = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _invQuat = new THREE.Quaternion();
const NEAR_MISS_RADIUS = 10;
const FULL_LOD_DISTANCE = 240;
const RIBBON_LOD_DISTANCE = 520;

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
    this.flipbooks = new FlipbookPool(this.scene);
    this.ribbons = new WeaponRibbonPool(this.scene);
    this.distortion = new DistortionField();
    this.lights = new WeaponLightPool(this.scene);
    this.scorches = new HullScorchPool(this.scene);
    this._socketScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    this._targetScratch = { x: 0, y: 0, z: 0, nx: 1, ny: 0, nz: 0, attached: false };
    this._targetWorldScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0, nx: 1, ny: 0, nz: 0 };
    this._flipbookPoseScratch = { x: 0, y: 0, z: 0, ax: 1, ay: 0, az: 0 };
    this._scorchPoseScratch = { x: 0, y: 0, z: 0, nx: 1, ny: 0, nz: 0 };
    this._socketOriginScratch = { x: 0, z: 0 };
    this._nearMissPlayerLocal = { x: 0, z: 0 };
    this._nearMissLocal = { x: 0, z: 0 };
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
    this._flashScratch = { life: 0, size0: 0, size1: 0, opacity0: 0, opacity1: 0 };
    this._flipbookPoseCallback = (slot) => this._resolveFlipbookPose(slot);
    this._scorchPoseCallback = (slot) => this._resolveScorchPose(slot);
    this._graph = null;
    this._disposed = false;
    this._nearMissAcc = 0;
  }

  attachGraph(graph) {
    if (this._graph && this._graph !== graph && typeof this._graph.attachDistortionField === 'function') {
      this._graph.attachDistortionField(null);
    }
    this._graph = graph || null;
    if (graph && typeof graph.attachDistortionField === 'function') {
      graph.attachDistortionField(this.distortion);
    }
  }

  handleFire(payload, origin, angle, profile) {
    const recipe = resolveWeaponRecipe(payload && payload.weaponId, payload);
    if (!recipeUsesMuzzleFlipbook(recipe)) return false;
    const ownerId = payload && payload.ownerId;
    const pose = this._socketPose(ownerId, origin, angle);
    const muzzle = recipe.muzzle;
    const flash = this._flashSpec(muzzle.life, muzzle.width, muzzle.height, 1.35);
    hexColor(muzzle.coreColor, _color);
    this.flipbooks.spawn({
      role: FLIPBOOK_ROLE.MUZZLE,
      ownerId,
      x: pose.x,
      y: pose.y,
      z: pose.z,
      ax: pose.ax,
      ay: pose.ay,
      az: pose.az,
      width: flash.size0,
      height: flash.size1,
      intensity: flash.opacity0,
      life: flash.life,
      row: muzzle.atlasRow,
      r: _color.r,
      g: _color.g,
      b: _color.b,
      followSocket: true,
    });
    if (muzzle.bore) {
      const bore = this._flashSpec(muzzle.boreLife || 0.24, muzzle.width * 0.45, muzzle.width * 0.45, 1.1);
      this.flipbooks.spawn({
        role: FLIPBOOK_ROLE.BORE,
        ownerId,
        x: pose.x,
        y: pose.y,
        z: pose.z,
        ax: pose.ax,
        ay: pose.ay,
        az: pose.az,
        width: bore.size0,
        height: bore.size1,
        intensity: bore.opacity0,
        life: bore.life,
        row: muzzle.atlasRow,
        r: _color.r,
        g: _color.g,
        b: _color.b,
        followSocket: true,
      });
    }
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
    const priority = ownerId === playerId ? 1 : 0.45;
    if (muzzle.lightPeak > 0 && a11y.eventLightPeakScale > 0) {
      this.lights.spawn({
        x: pose.x, y: pose.y, z: pose.z,
        color: muzzle.lightColor,
        intensity: muzzle.lightPeak * a11y.eventLightPeakScale,
        distance: muzzle.lightDistance,
        life: Math.max(0.08, muzzle.life),
        priority,
      });
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
      if (recipe.shield.flipbook) {
        const captured = this._captureTargetLocal(payload.targetId, world.x, y, world.z, nx, 0.1, nz);
        const impact = this._flashSpec(recipe.shield.life, 2.2, 2.2, 1.2);
        this.flipbooks.spawn({
          role: FLIPBOOK_ROLE.IMPACT,
          targetId: payload.targetId,
          x: captured.x,
          y: captured.y,
          z: captured.z,
          ax: captured.nx,
          ay: captured.ny,
          az: captured.nz,
          width: impact.size0,
          height: impact.size1,
          intensity: impact.opacity0,
          life: impact.life,
          row: recipe.shield.atlasRow,
          r: _color.r,
          g: _color.g,
          b: _color.b,
          followTarget: captured.attached,
        });
      }
      if (recipe.shield.haze > 0 && a11y.id === 'full') {
        this.distortion.spawn({
          x: world.x, y, z: world.z,
          radius: 4.5,
          strength: recipe.shield.haze,
          life: 0.14,
        });
      }
    } else if (!hitShield && recipe.hull.flipbook) {
      const captured = this._captureTargetLocal(
        payload.targetId,
        world.x + nx * 0.4,
        y,
        world.z + nz * 0.4,
        ax, 0, az,
      );
      const impact = this._flashSpec(0.14, 1.6, 2.8, 1.15);
      this.flipbooks.spawn({
        role: FLIPBOOK_ROLE.IMPACT,
        targetId: payload.targetId,
        x: captured.x,
        y: captured.y,
        z: captured.z,
        ax: captured.nx,
        ay: captured.ny,
        az: captured.nz,
        width: impact.size0,
        height: impact.size1,
        intensity: impact.opacity0,
        life: impact.life,
        row: recipe.hull.atlasRow,
        r: _color.r,
        g: _color.g,
        b: _color.b,
        followTarget: captured.attached,
      });
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
        r: _color.r,
        g: _color.g,
        b: _color.b,
      });
    }
    if (a11y.eventLightPeakScale > 0) {
      this.lights.spawn({
        x: world.x, y, z: world.z,
        color: hitShield ? '#5fd0ff' : recipe.muzzle.lightColor,
        intensity: (hitShield ? 2.2 : 1.8) * a11y.eventLightPeakScale,
        distance: 12,
        life: 0.1,
        priority: payload.targetId === (this.state && this.state.playerId) ? 0.9 : 0.4,
      });
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
    const entities = (this.state && this.state.entityList) || [];
    ageShieldContacts(dt);
    this.bolts.setCamera(camera, viewportHeight);
    this.bolts.setDepthTexture(
      context.depthTexture || null,
      context.depthWidth,
      context.depthHeight,
    );
    this._syncBolts(entities, alpha, camera);
    this._updateNearMiss(dt, entities, alpha, camera);
    this.flipbooks.update(dt, this._flipbookPoseCallback);
    this.scorches.update(dt, this._scorchPoseCallback);
    this.distortion.update(dt);
    this.lights.update(dt);
    this.ribbons.update(dt, camera && camera.position);
  }

  _syncBolts(entities, alpha, camera) {
    this.bolts.beginFrame();
    _seen.clear();
    const camPos = camera && camera.position;
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
      if (recipeUsesRibbonWake(recipe) || recipe.flight.mode === FLIGHT_MODE.ENERGY_CARD) {
        _seen.add(entity.id);
      }
      if (recipeUsesRibbonWake(recipe)) {
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
        const dist = camPos
          ? Math.hypot(camPos.x - currLocal.x, camPos.z - currLocal.z)
          : 0;
        if (dist < RIBBON_LOD_DISTANCE) {
          this.ribbons.pushHead(entity.id, currLocal.x, y, currLocal.z);
        }
      }
      if (recipe.flight.mode !== FLIGHT_MODE.ENERGY_CARD) continue;
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

  _worldFromTargetLocal(slot, useNormal) {
    const mesh = slot.targetId != null ? this._mesh(slot.targetId) : null;
    const out = useNormal ? this._scorchPoseScratch : this._flipbookPoseScratch;
    if (!mesh) {
      out.x = slot.localX; out.y = slot.localY; out.z = slot.localZ;
      if (useNormal) {
        out.nx = slot.nx; out.ny = slot.ny; out.nz = slot.nz;
      } else {
        out.ax = slot.ax; out.ay = slot.ay; out.az = slot.az;
      }
      return out;
    }
    _offset.set(slot.localX, slot.localY, slot.localZ).applyQuaternion(mesh.quaternion);
    _offset.add(mesh.position);
    if (useNormal) {
      _axis.set(slot.nx, slot.ny, slot.nz).applyQuaternion(mesh.quaternion);
      out.x = _offset.x; out.y = _offset.y; out.z = _offset.z;
      out.nx = _axis.x; out.ny = _axis.y; out.nz = _axis.z;
      return out;
    }
    _axis.set(slot.ax, slot.ay, slot.az).applyQuaternion(mesh.quaternion);
    out.x = _offset.x; out.y = _offset.y; out.z = _offset.z;
    out.ax = _axis.x; out.ay = _axis.y; out.az = _axis.z;
    return out;
  }

  _resolveFlipbookPose(slot) {
    if (slot.followSocket && slot.ownerId != null) {
      this._socketOriginScratch.x = slot.localX;
      this._socketOriginScratch.z = slot.localZ;
      return this._socketPose(slot.ownerId, this._socketOriginScratch, 0);
    }
    if (slot.followTarget && slot.targetId != null) {
      return this._worldFromTargetLocal(slot, false);
    }
    const out = this._flipbookPoseScratch;
    out.x = slot.localX; out.y = slot.localY; out.z = slot.localZ;
    out.ax = slot.ax; out.ay = slot.ay; out.az = slot.az;
    return out;
  }

  _resolveScorchPose(slot) {
    if (slot.targetId == null) {
      const out = this._scorchPoseScratch;
      out.x = slot.localX; out.y = slot.localY; out.z = slot.localZ;
      out.nx = slot.nx; out.ny = slot.ny; out.nz = slot.nz;
      return out;
    }
    return this._worldFromTargetLocal(slot, true);
  }

  _mesh(entityId) {
    const meshes = this.state && this.state.render && this.state.render.meshes;
    if (meshes && typeof meshes.get === 'function') return meshes.get(entityId);
    return null;
  }

  _a11y() {
    return resolveVfxAccessibilityProfile(this.state && this.state.settings);
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
    for (const slot of this.flipbooks.slots) {
      if (!slot.alive) continue;
      if (slot.followTarget && slot.targetId != null) continue;
      slot.localX += ox;
      slot.localZ += oz;
    }
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
    return [this.bolts.mesh, this.flipbooks.mesh, this.ribbons.mesh, this.scorches.mesh];
  }

  /** Stable presenter-owned roots for scene residency/isolation checks. */
  getOwnerRoots() {
    return [
      this.bolts.mesh,
      this.flipbooks.mesh,
      this.ribbons.mesh,
      this.scorches.mesh,
      this.distortion.scene,
      this.lights.group,
    ];
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._graph && typeof this._graph.attachDistortionField === 'function') {
      this._graph.attachDistortionField(null);
    }
    this._graph = null;
    clearShieldContacts();
    this.bolts.dispose();
    this.flipbooks.dispose();
    this.ribbons.dispose();
    this.distortion.dispose();
    this.lights.dispose();
    this.scorches.dispose();
  }
}

export function createWeaponVfxPresenter(options) {
  return new WeaponVfxPresenter(options);
}
