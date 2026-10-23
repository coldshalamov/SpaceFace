import * as THREE from 'three';
import { EnergyBoltPool } from './weapons/energyBoltPool.js';
import { resolveWeaponRecipe, flightColorsForEntity } from './weapons/recipes.js';
import { resolveVfxAccessibilityProfile } from './vfxAccessibility.js';

// Read-only replay adapter for the same variant shader, geometry and dimensions
// that the live weapon presenter submits. No team-coloured substitute tracer.
export function createReplayWeaponStage(root) {
  const pool = new EnergyBoltPool(root);
  const color = new THREE.Color(), colors = {}, entity = { team: 0 };
  const spec = { entityId: 0, x: 0, y: 0.32, z: 0, prevX: 0, prevY: 0.32, prevZ: 0,
    ax: 1, ay: 0, az: 0, length: 0, width: 0, intensity: 0, variant: 0,
    coreR: 1, coreG: 1, coreB: 1, sheathR: 1, sheathG: 1, sheathB: 1, minPixels: 0 };
  return {
    begin(camera, dt, settings, viewportHeight = 720) {
      pool.setCamera(camera, viewportHeight);
      pool.beginFrame(dt, resolveVfxAccessibilityProfile(settings));
    },
    write(id, weaponId, team, x, z, vx, vz, dt) {
      const recipe = resolveWeaponRecipe(weaponId), flight = recipe.flight;
      if (!(flight.dashLength > 0)) return;
      entity.team = team;
      flightColorsForEntity(recipe, entity, colors);
      color.set(colors.core); spec.coreR = color.r; spec.coreG = color.g; spec.coreB = color.b;
      color.set(colors.sheath); spec.sheathR = color.r; spec.sheathG = color.g; spec.sheathB = color.b;
      const speed = Math.hypot(vx, vz) || 1;
      spec.entityId = id; spec.x = x; spec.z = z;
      spec.prevX = x - vx * Math.min(1 / 30, dt); spec.prevZ = z - vz * Math.min(1 / 30, dt);
      spec.ax = vx / speed; spec.az = vz / speed;
      spec.length = flight.dashLength; spec.width = flight.width;
      spec.intensity = flight.intensity; spec.variant = flight.boltVariant; spec.minPixels = flight.pixelFloor;
      pool.writeBolt(spec);
    },
    end() { pool.commit(); },
    dispose() { pool.dispose(); },
    pool,
  };
}
